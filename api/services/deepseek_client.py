"""
AI provider client wrapper.

保留原有模块名，兼容现有 DeepSeek 调用方，同时新增公司内网大模型接入能力。
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

import httpx
from loguru import logger
from services.prompt_template_runtime import merge_task_system_prompt
from services.runtime_paths import get_environment_variable

try:
    from openai import AsyncOpenAI, APIError, APITimeoutError, RateLimitError
except ImportError:
    AsyncOpenAI = None
    APIError = Exception
    APITimeoutError = Exception
    RateLimitError = Exception


MAX_RETRIES = 1
TIMEOUT_SECONDS = 60
DEFAULT_MAX_TOKENS = 2000
DEFAULT_TEMPERATURE = 0.3
MODEL_NAME = "deepseek-chat"
BASE_URL = "https://api.deepseek.com"
DEFAULT_AI_PROVIDER = "deepseek"
DEEPSEEK_PROVIDER = "deepseek"
INTERNAL_PROVIDER = "internal"
DEFAULT_INTERNAL_MODEL_NAME = "deepseekr1"
DEFAULT_INTERNAL_TOP_P = 0.7
DEFAULT_INTERNAL_TOP_K = 50

PLACEHOLDER_API_KEYS = {
    "your-deepseek-api-key",
    "your-api-key",
    "replace-with-a-real-deepseek-api-key",
    "replace-me",
    "changeme",
}

THINK_BLOCK_PATTERN = re.compile(r"(?is)<think>.*?</think>")


def _get_windows_environment_variable(name: str) -> Optional[str]:
    if os.name != "nt":
        return None

    try:
        import winreg
    except ImportError:
        return None

    registry_locations = [
        (winreg.HKEY_CURRENT_USER, r"Environment"),
        (
            winreg.HKEY_LOCAL_MACHINE,
            r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment",
        ),
    ]

    for hive, subkey in registry_locations:
        try:
            with winreg.OpenKey(hive, subkey) as key:
                value, _ = winreg.QueryValueEx(key, name)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        except OSError:
            continue

    return None


def _get_environment_variable(name: str) -> Optional[str]:
    configured = get_environment_variable(name)
    if configured:
        return configured

    fallback_value = _get_windows_environment_variable(name)
    if fallback_value:
        logger.info(f"Using {name} from Windows environment registry fallback")
        return fallback_value

    return None


def get_ai_provider() -> str:
    provider = (_get_environment_variable("AI_PROVIDER") or DEFAULT_AI_PROVIDER).strip().lower()
    if provider in {INTERNAL_PROVIDER, "company", "private", "private_llm"}:
        return INTERNAL_PROVIDER
    return DEEPSEEK_PROVIDER


def get_ai_provider_label() -> str:
    explicit_label = _get_environment_variable("AI_PROVIDER_LABEL")
    if explicit_label:
        return explicit_label
    return "公司内部大模型" if get_ai_provider() == INTERNAL_PROVIDER else "DeepSeek"


def _build_configuration_error(message: str) -> dict:
    return {
        "error": message,
        "error_type": "configuration",
        "provider": get_ai_provider_label(),
        "provider_key": get_ai_provider(),
    }


def get_api_key() -> Optional[str]:
    return _get_environment_variable("DEEPSEEK_API_KEY")


def _is_placeholder_api_key(api_key: str) -> bool:
    normalized = api_key.strip().lower()
    if not normalized:
        return False

    if normalized in PLACEHOLDER_API_KEYS:
        return True

    placeholder_markers = (
        "your-",
        "replace-with-",
        "example-",
        "demo-",
        "<deepseek",
        "[deepseek",
    )
    return "key" in normalized and any(marker in normalized for marker in placeholder_markers)


def get_api_key_error() -> Optional[str]:
    api_key = get_api_key()
    if not api_key:
        return "未配置 DEEPSEEK_API_KEY，AI 分析已跳过。请在项目同级 runtime 目录的 .env 中填写真实 DeepSeek API Key。"

    if _is_placeholder_api_key(api_key):
        return (
            "DEEPSEEK_API_KEY 仍是示例占位值，AI 分析已跳过。"
            "请把 your-deepseek-api-key 替换为真实 DeepSeek API Key。"
        )

    return None


def get_internal_model_error() -> Optional[str]:
    missing_fields: list[str] = []
    for field_name in ("INTERNAL_LLM_API_URL", "INTERNAL_LLM_APP_TOKEN", "INTERNAL_LLM_APP_ID"):
        if not _get_environment_variable(field_name):
            missing_fields.append(field_name)

    if missing_fields:
        return (
            f"AI_PROVIDER=internal 时缺少以下配置：{', '.join(missing_fields)}。"
            "请在项目同级 runtime 目录的 .env 中补齐公司内部大模型配置。"
        )

    return None


def get_ai_configuration_error() -> Optional[str]:
    if get_ai_provider() == INTERNAL_PROVIDER:
        return get_internal_model_error()
    return get_api_key_error()


def is_ai_configuration_error(error_message: str) -> bool:
    markers = (
        "未配置 DEEPSEEK_API_KEY",
        "DEEPSEEK_API_KEY 仍是示例占位值",
        "AI_PROVIDER=internal 时缺少以下配置",
    )
    return any(error_message.startswith(marker) for marker in markers)


def _get_api_error_status_code(error: APIError) -> Optional[int]:
    status_code = getattr(error, "status_code", None)
    if isinstance(status_code, int):
        return status_code

    response = getattr(error, "response", None)
    response_status_code = getattr(response, "status_code", None)
    return response_status_code if isinstance(response_status_code, int) else None


def _build_api_error_message(error: APIError) -> str:
    raw_message = str(getattr(error, "message", "") or str(error)).strip()
    status_code = _get_api_error_status_code(error)
    normalized_message = raw_message.lower()

    if (
        status_code == 401
        or "authentication fails" in normalized_message
        or "authentication_error" in normalized_message
        or ("api key" in normalized_message and "invalid" in normalized_message)
    ):
        return (
            "DeepSeek 认证失败，当前 DEEPSEEK_API_KEY 无效。"
            "请检查项目同级 runtime 目录的 .env，或确认 Windows 环境变量中没有旧的 DEEPSEEK_API_KEY。"
        )

    if status_code is not None:
        return f"AI 服务异常（HTTP {status_code}）：{raw_message}"

    return f"AI 服务异常：{raw_message}"


def _build_internal_api_error_message(
    status_code: int,
    message: str,
) -> str:
    normalized_message = (message or "").lower()
    if status_code in {401, 403}:
        return "公司内部大模型认证失败，请检查 INTERNAL_LLM_APP_TOKEN 或接口访问权限。"

    if "token" in normalized_message and "invalid" in normalized_message:
        return "公司内部大模型认证失败，请检查 INTERNAL_LLM_APP_TOKEN 是否有效。"

    if status_code:
        return f"AI 服务异常（HTTP {status_code}）：{message}"

    return f"AI 服务异常：{message}"


def get_client() -> Optional["AsyncOpenAI"]:
    """获取 DeepSeek OpenAI 客户端。"""
    if get_ai_provider() != DEEPSEEK_PROVIDER:
        return None

    if AsyncOpenAI is None:
        logger.error("openai 库未安装")
        return None

    api_key_error = get_api_key_error()
    if api_key_error:
        logger.error(api_key_error)
        return None

    api_key = get_api_key()
    if not api_key:
        logger.error("DEEPSEEK_API_KEY 环境变量未设置")
        return None

    return AsyncOpenAI(api_key=api_key, base_url=BASE_URL)


def build_analysis_messages(
    diff_summary: str,
    mapping_info: str,
    test_cases_text: str,
    prompt_template_text: str | None = None,
) -> list[dict]:
    base_system_prompt = (
        "你是一位资深测试架构师，擅长分析代码改动并评估测试用例覆盖情况。\n"
        "请根据提供的代码改动 diff、功能映射和现有测试用例，分析测试覆盖缺口并给出补充建议。\n"
        "输出必须是合法 JSON。"
    )

    system_prompt = merge_task_system_prompt(base_system_prompt, prompt_template_text)

    user_prompt = (
        f"## 代码改动 Diff\n{diff_summary}\n\n"
        f"## 功能映射关系\n{mapping_info}\n\n"
        f"## 现有测试用例\n{test_cases_text}\n\n"
        "请输出 JSON 对象，字段必须包含：\n"
        "- uncovered_methods: 未覆盖的方法列表\n"
        "- coverage_gaps: 覆盖缺口说明\n"
        "- suggested_test_cases: 建议补充的测试用例列表，每项包含 test_id、test_function、test_steps、expected_result\n"
        "- risk_assessment: high / medium / low\n"
        "- improvement_suggestions: 改进建议列表"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def build_requirement_analysis_messages(
    project_name: str,
    requirement_hits: list[dict],
    prompt_template_text: str | None = None,
) -> list[dict]:
    base_system_prompt = (
        "你是一位资深测试架构师，擅长基于需求说明和项目需求映射关系提炼测试范围与风险。\n"
        "输入中的命中结果已经由规则引擎判定，你不能改写命中关系，也不要新增未命中的项。\n"
        "请输出合法 JSON，字段必须包含：\n"
        "- summary: 50~90 字，总结要补哪些测试场景\n"
        "- overall_assessment: 8~16 个中文字符，不要标点\n"
        "- key_findings: 2~4 条关注点，每条不超过 28 个中文字符\n"
        "- risk_table: 数组，每项包含 requirement_point_id、risk_level、risk_reason、test_focus"
    )

    system_prompt = merge_task_system_prompt(base_system_prompt, prompt_template_text)

    payload = json.dumps(
        {
            "project_name": project_name,
            "matched_requirement_points": requirement_hits,
        },
        ensure_ascii=False,
        indent=2,
    )

    user_prompt = (
        "以下是需求分析的规则命中结果，请基于这些已命中的事实输出更自然、可执行的测试建议。\n"
        "要求：\n"
        "1. 不要新增 requirement_point_id。\n"
        "2. summary、overall_assessment、key_findings 只围绕已命中的关联场景展开。\n"
        "3. risk_table 必须覆盖全部已命中的 requirement_point_id。\n"
        "4. risk_level 只能是 高 / 中 / 低。\n"
        "5. risk_reason 说明风险原因，test_focus 说明优先验证哪些场景、边界和校验点。\n"
        "6. 如果包含 additional_scenarios，要明确这些是需要一并纳入回归范围的扩展场景。\n"
        "7. 输出必须是合法 JSON，不要输出 Markdown。\n\n"
        f"{payload}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def build_case_quality_test_advice_messages(
    project_name: str,
    payload: dict,
    prompt_template_text: str | None = None,
) -> list[dict]:
    base_system_prompt = (
        "你是一位资深测试架构师，负责基于案例质检汇总报告的结构化事实生成可执行的测试意见。\n"
        "你只能基于输入中的事实作答，不得虚构需求点、代码方法、测试用例、历史缺陷或证据。\n"
        "请输出合法 JSON，对象字段必须包含：\n"
        "- summary: 60~120 字中文总结\n"
        "- overall_assessment: 8~24 个中文字符，不要使用标点\n"
        "- must_test: 数组，列出 0~5 条必测项\n"
        "- should_test: 数组，列出 0~5 条补测项\n"
        "- regression_scope: 数组，列出建议纳入回归的链路、模块或场景\n"
        "- missing_information: 数组，列出仍缺失但会影响判断准确性的事实\n"
        "其中 must_test / should_test 的每一项都必须包含：\n"
        "- title: 简短中文标题\n"
        "- priority: 只能是 P0 / P1 / P2\n"
        "- reason: 给出建议原因\n"
        "- evidence: 明确引用输入中的事实作为证据\n"
        "- requirement_ids: 需求点编号数组，没有则返回空数组\n"
        "- methods: 方法全名数组，没有则返回空数组\n"
        "- test_focus: 说明本条建议优先验证哪些流程、边界和断言\n"
        "- expected_risk: 说明若不补测可能带来的风险\n"
    )

    system_prompt = merge_task_system_prompt(base_system_prompt, prompt_template_text)

    user_prompt = (
        "以下是案例质检汇总报告已经整理好的结构化事实，请生成更有行动价值的测试意见。\n"
        "要求：\n"
        "1. 先输出 must_test，再输出 should_test。\n"
        "2. 优先识别“高风险需求点 + 未覆盖变更方法 + 已有规则建议”交叉区域。\n"
        "3. evidence 必须直接引用输入中的事实，不要写空泛表述。\n"
        "4. requirement_ids 和 methods 只能使用输入中已经出现过的编号或方法名。\n"
        "5. 若证据不足，不要硬猜，把缺口写入 missing_information。\n"
        "6. 不要输出 Markdown，不要附加 JSON 之外的说明文字。\n\n"
        f"{json.dumps(payload, ensure_ascii=False, indent=2)}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def extract_final_answer_text(content: str) -> str:
    normalized = content.strip().lstrip("\ufeff")
    if not normalized:
        return ""

    if "</think>" in normalized:
        normalized = normalized.rsplit("</think>", 1)[-1]

    normalized = THINK_BLOCK_PATTERN.sub("", normalized).strip()

    if normalized.startswith("```"):
        lines = normalized.splitlines()
        if len(lines) > 1:
            body = "\n".join(lines[1:]).strip()
            if body.endswith("```"):
                body = body[:-3].rstrip()
            normalized = body

    return normalized.strip()


def _try_parse_json_text(text: str) -> Optional[Any]:
    candidate = text.strip().lstrip("\ufeff")
    if not candidate:
        return None

    decoder = json.JSONDecoder()
    try:
        result, _ = decoder.raw_decode(candidate)
    except json.JSONDecodeError:
        return None

    if isinstance(result, str):
        nested = result.strip()
        if nested.startswith("{") or nested.startswith("["):
            try:
                return json.loads(nested)
            except json.JSONDecodeError:
                return result
    return result


def _extract_json_result(content: str) -> Any:
    normalized = content.strip().lstrip("\ufeff")
    if not normalized:
        raise json.JSONDecodeError("empty content", content, 0)

    cleaned = extract_final_answer_text(normalized)
    candidates = [cleaned, normalized]

    for candidate in candidates:
        if not candidate:
            continue

        parsed = _try_parse_json_text(candidate)
        if parsed is not None:
            return parsed

        for start_index, char in enumerate(candidate):
            if char not in "{[":
                continue
            parsed = _try_parse_json_text(candidate[start_index:])
            if parsed is not None:
                return parsed

    raise json.JSONDecodeError("unable to extract JSON content", content, 0)


def _normalize_usage_value(value: Any) -> int:
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return 0


def _normalize_usage(usage: Any) -> dict:
    if not isinstance(usage, dict):
        return {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "prompt_cache_hit_tokens": 0,
            "prompt_cache_miss_tokens": 0,
        }

    return {
        "prompt_tokens": _normalize_usage_value(usage.get("prompt_tokens")),
        "completion_tokens": _normalize_usage_value(usage.get("completion_tokens")),
        "total_tokens": _normalize_usage_value(usage.get("total_tokens")),
        "prompt_cache_hit_tokens": _normalize_usage_value(usage.get("prompt_cache_hit_tokens")),
        "prompt_cache_miss_tokens": _normalize_usage_value(usage.get("prompt_cache_miss_tokens")),
    }


def _extract_content_from_response_payload(payload: Any) -> str:
    if isinstance(payload, str):
        return payload

    if not isinstance(payload, dict):
        return ""

    if isinstance(payload.get("content"), str):
        return payload["content"]

    choices = payload.get("choices")
    if isinstance(choices, list) and choices:
        first_choice = choices[0]
        if isinstance(first_choice, dict):
            message = first_choice.get("message")
            if isinstance(message, dict) and isinstance(message.get("content"), str):
                return message["content"]

    wrapped_content = payload.get("content")
    if isinstance(wrapped_content, dict):
        return _extract_content_from_response_payload(wrapped_content)

    return ""


def _build_success_payload(
    result: Any,
    usage: dict,
    raw_content: str,
) -> dict:
    return {
        "result": result,
        "usage": usage,
        "provider": get_ai_provider_label(),
        "provider_key": get_ai_provider(),
        "raw_content": raw_content,
        "final_content": extract_final_answer_text(raw_content),
    }


def _build_text_success_payload(
    usage: dict,
    raw_content: str,
) -> dict:
    answer = extract_final_answer_text(raw_content)
    return {
        "answer": answer,
        "usage": usage,
        "provider": get_ai_provider_label(),
        "provider_key": get_ai_provider(),
        "raw_content": raw_content,
        "final_content": answer,
    }


def _get_internal_model_name() -> str:
    return (
        _get_environment_variable("INTERNAL_LLM_MODEL")
        or _get_environment_variable("AI_MODEL_NAME")
        or DEFAULT_INTERNAL_MODEL_NAME
    )


def _get_internal_api_url() -> str:
    return _get_environment_variable("INTERNAL_LLM_API_URL") or ""


def _get_internal_top_p() -> float:
    raw_value = _get_environment_variable("INTERNAL_LLM_TOP_P")
    if raw_value is None:
        return DEFAULT_INTERNAL_TOP_P
    try:
        return float(raw_value)
    except ValueError:
        return DEFAULT_INTERNAL_TOP_P


def _get_internal_top_k() -> int:
    raw_value = _get_environment_variable("INTERNAL_LLM_TOP_K")
    if raw_value is None:
        return DEFAULT_INTERNAL_TOP_K
    try:
        return int(raw_value)
    except ValueError:
        return DEFAULT_INTERNAL_TOP_K


def _build_internal_biz_no() -> str:
    prefix = _get_environment_variable("INTERNAL_LLM_BIZ_NO_PREFIX") or "AITEST"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{prefix}_{timestamp}_{uuid4().hex[:6]}"


def _build_internal_payload(
    messages: list[dict],
    max_tokens: int,
    temperature: float,
) -> dict:
    payload = {
        "appId": _get_environment_variable("INTERNAL_LLM_APP_ID") or "",
        "bizNo": _build_internal_biz_no(),
        "model": _get_internal_model_name(),
        "max_tokens": max_tokens,
        "stream": False,
        "temperature": temperature,
        "top_p": _get_internal_top_p(),
        "top_k": _get_internal_top_k(),
        "messages": messages,
    }

    optional_fields = {
        "p13": _get_environment_variable("INTERNAL_LLM_P13"),
        "organization": _get_environment_variable("INTERNAL_LLM_ORGANIZATION"),
        "secondLevelOrg": _get_environment_variable("INTERNAL_LLM_SECOND_LEVEL_ORG"),
        "busiDept": _get_environment_variable("INTERNAL_LLM_BUSI_DEPT"),
    }
    for key, value in optional_fields.items():
        if value:
            payload[key] = value

    return payload


async def _call_internal_model(
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    timeout_seconds: int,
) -> dict:
    config_error = get_internal_model_error()
    if config_error:
        return _build_configuration_error(config_error)

    url = _get_internal_api_url()
    headers = {
        "app-token": _get_environment_variable("INTERNAL_LLM_APP_TOKEN") or "",
        "Content-Type": "application/json",
    }
    payload = _build_internal_payload(messages, max_tokens=max_tokens, temperature=temperature)

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        return {"error": "AI 分析超时，请减少分析范围后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}
    except httpx.HTTPError as error:
        logger.error(f"Internal LLM request failed: {error}")
        return {"error": f"调用异常: {error}", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

    try:
        response_payload = response.json()
    except ValueError:
        response_payload = {}

    if response.status_code >= 400:
        message = ""
        if isinstance(response_payload, dict):
            message = str(response_payload.get("message") or response_payload.get("detail") or "").strip()
        if not message:
            message = response.text.strip()
        return {
            "error": _build_internal_api_error_message(response.status_code, message or "请求失败"),
            "provider": get_ai_provider_label(),
            "provider_key": get_ai_provider(),
        }

    if isinstance(response_payload, dict):
        code = str(response_payload.get("code") or "")
        result_flag = response_payload.get("result")
        if code and code != "0000":
            message = str(response_payload.get("message") or "公司内部大模型返回失败")
            return {
                "error": _build_internal_api_error_message(response.status_code, message),
                "provider": get_ai_provider_label(),
                "provider_key": get_ai_provider(),
            }
        if result_flag not in (None, 1, "1", True):
            message = str(response_payload.get("message") or "公司内部大模型返回失败")
            return {
                "error": _build_internal_api_error_message(response.status_code, message),
                "provider": get_ai_provider_label(),
                "provider_key": get_ai_provider(),
            }

    completion_payload = response_payload.get("content") if isinstance(response_payload, dict) else {}
    raw_content = _extract_content_from_response_payload(completion_payload or response_payload)
    if not raw_content:
        return {
            "error": "AI 返回空结果，请稍后重试",
            "provider": get_ai_provider_label(),
            "provider_key": get_ai_provider(),
        }

    try:
        result = _extract_json_result(raw_content)
    except json.JSONDecodeError:
        return {
            "error": "AI 返回格式异常，请稍后重试",
            "provider": get_ai_provider_label(),
            "provider_key": get_ai_provider(),
            "raw_content": raw_content,
            "final_content": extract_final_answer_text(raw_content),
        }

    usage = _normalize_usage(
        (completion_payload or {}).get("usage") if isinstance(completion_payload, dict) else {}
    )
    return _build_success_payload(result, usage, raw_content)


async def _call_internal_text_model(
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    timeout_seconds: int,
) -> dict:
    config_error = get_internal_model_error()
    if config_error:
        return _build_configuration_error(config_error)

    url = _get_internal_api_url()
    headers = {
        "app-token": _get_environment_variable("INTERNAL_LLM_APP_TOKEN") or "",
        "Content-Type": "application/json",
    }
    payload = _build_internal_payload(messages, max_tokens=max_tokens, temperature=temperature)

    try:
        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(url, headers=headers, json=payload)
    except httpx.TimeoutException:
        return {"error": "AI 分析超时，请减少分析范围后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}
    except httpx.HTTPError as error:
        logger.error(f"Internal LLM request failed: {error}")
        return {"error": f"调用异常: {error}", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

    try:
        response_payload = response.json()
    except ValueError:
        response_payload = {}

    if response.status_code >= 400:
        message = ""
        if isinstance(response_payload, dict):
            message = str(response_payload.get("message") or response_payload.get("detail") or "").strip()
        if not message:
            message = response.text.strip()
        return {
            "error": _build_internal_api_error_message(response.status_code, message or "请求失败"),
            "provider": get_ai_provider_label(),
            "provider_key": get_ai_provider(),
        }

    completion_payload = response_payload.get("content") if isinstance(response_payload, dict) else {}
    raw_content = _extract_content_from_response_payload(completion_payload or response_payload)
    final_content = extract_final_answer_text(raw_content)
    if not final_content:
        return {
            "error": "AI 返回空结果，请稍后重试",
            "provider": get_ai_provider_label(),
            "provider_key": get_ai_provider(),
        }

    usage = _normalize_usage(
        (completion_payload or {}).get("usage") if isinstance(completion_payload, dict) else {}
    )
    return _build_text_success_payload(usage, raw_content)


async def _call_deepseek_openai(
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    timeout_seconds: int,
    max_retries: int,
) -> dict:
    api_key_error = get_api_key_error()
    if api_key_error:
        return _build_configuration_error(api_key_error)

    client = get_client()
    if client is None:
        return _build_configuration_error("DeepSeek 客户端初始化失败，请检查 API Key 配置")

    model_name = _get_environment_variable("AI_MODEL_NAME") or MODEL_NAME

    for attempt in range(max_retries + 1):
        try:
            response = await client.chat.completions.create(
                model=model_name,
                messages=messages,
                response_format={"type": "json_object"},
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=timeout_seconds,
            )

            raw_content = response.choices[0].message.content or ""
            if not raw_content.strip():
                if attempt < max_retries:
                    logger.warning(f"DeepSeek returned empty content, retrying {attempt + 1}/{max_retries}")
                    continue
                return {"error": "AI 返回空结果，请稍后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

            try:
                result = _extract_json_result(raw_content)
            except json.JSONDecodeError:
                if attempt < max_retries:
                    logger.warning(f"DeepSeek returned invalid JSON, retrying {attempt + 1}/{max_retries}")
                    continue
                return {
                    "error": "AI 返回格式异常，请稍后重试",
                    "provider": get_ai_provider_label(),
                    "provider_key": get_ai_provider(),
                    "raw_content": raw_content,
                    "final_content": extract_final_answer_text(raw_content),
                }

            usage = _normalize_usage(
                {
                    "prompt_tokens": getattr(response.usage, "prompt_tokens", 0),
                    "completion_tokens": getattr(response.usage, "completion_tokens", 0),
                    "total_tokens": getattr(response.usage, "total_tokens", 0),
                    "prompt_cache_hit_tokens": getattr(response.usage, "prompt_cache_hit_tokens", 0),
                    "prompt_cache_miss_tokens": getattr(response.usage, "prompt_cache_miss_tokens", 0),
                }
            )

            logger.info(
                f"{get_ai_provider_label()} call succeeded: tokens={usage['total_tokens']}, "
                f"cache_hit={usage['prompt_cache_hit_tokens']}"
            )
            return _build_success_payload(result, usage, raw_content)

        except APITimeoutError:
            if attempt < max_retries:
                logger.warning(f"DeepSeek timed out, retrying {attempt + 1}/{max_retries}")
                continue
            return {"error": "AI 分析超时，请减少分析范围后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

        except RateLimitError:
            logger.warning("DeepSeek rate limited")
            return {"error": "请求频率超限，请稍后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

        except APIError as error:
            logger.error(f"DeepSeek API error: {error}")
            return {"error": _build_api_error_message(error), "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

        except Exception as error:
            logger.error(f"DeepSeek call failed: {error}")
            return {"error": f"调用异常: {error}", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

    return {"error": "AI 调用失败，请稍后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}


async def _call_deepseek_openai_text(
    messages: list[dict],
    max_tokens: int,
    temperature: float,
    timeout_seconds: int,
    max_retries: int,
) -> dict:
    api_key_error = get_api_key_error()
    if api_key_error:
        return _build_configuration_error(api_key_error)

    client = get_client()
    if client is None:
        return _build_configuration_error("DeepSeek 客户端初始化失败，请检查 API Key 配置")

    model_name = _get_environment_variable("AI_MODEL_NAME") or MODEL_NAME

    for attempt in range(max_retries + 1):
        try:
            response = await client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=timeout_seconds,
            )

            raw_content = response.choices[0].message.content or ""
            final_content = extract_final_answer_text(raw_content)
            if not final_content:
                if attempt < max_retries:
                    logger.warning(f"DeepSeek returned empty text content, retrying {attempt + 1}/{max_retries}")
                    continue
                return {"error": "AI 返回空结果，请稍后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

            usage = _normalize_usage(
                {
                    "prompt_tokens": getattr(response.usage, "prompt_tokens", 0),
                    "completion_tokens": getattr(response.usage, "completion_tokens", 0),
                    "total_tokens": getattr(response.usage, "total_tokens", 0),
                    "prompt_cache_hit_tokens": getattr(response.usage, "prompt_cache_hit_tokens", 0),
                    "prompt_cache_miss_tokens": getattr(response.usage, "prompt_cache_miss_tokens", 0),
                }
            )

            logger.info(
                f"{get_ai_provider_label()} text call succeeded: tokens={usage['total_tokens']}, "
                f"cache_hit={usage['prompt_cache_hit_tokens']}"
            )
            return _build_text_success_payload(usage, raw_content)

        except APITimeoutError:
            if attempt < max_retries:
                logger.warning(f"DeepSeek text call timed out, retrying {attempt + 1}/{max_retries}")
                continue
            return {"error": "AI 分析超时，请减少分析范围后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

        except RateLimitError:
            logger.warning("DeepSeek text call rate limited")
            return {"error": "请求频率超限，请稍后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

        except APIError as error:
            logger.error(f"DeepSeek text API error: {error}")
            return {"error": _build_api_error_message(error), "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

        except Exception as error:
            logger.error(f"DeepSeek text call failed: {error}")
            return {"error": f"调用异常: {error}", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}

    return {"error": "AI 调用失败，请稍后重试", "provider": get_ai_provider_label(), "provider_key": get_ai_provider()}


async def call_deepseek(
    messages: list[dict],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout_seconds: int = TIMEOUT_SECONDS,
    max_retries: int = MAX_RETRIES,
) -> dict:
    """
    统一 AI 调用入口。

    兼容原有函数名，调用方无需改动。
    """
    if get_ai_provider() == INTERNAL_PROVIDER:
        return await _call_internal_model(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout_seconds=timeout_seconds,
        )

    return await _call_deepseek_openai(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
    )


async def call_ai_text(
    messages: list[dict],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout_seconds: int = TIMEOUT_SECONDS,
    max_retries: int = MAX_RETRIES,
) -> dict:
    if get_ai_provider() == INTERNAL_PROVIDER:
        return await _call_internal_text_model(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            timeout_seconds=timeout_seconds,
        )

    return await _call_deepseek_openai_text(
        messages=messages,
        max_tokens=max_tokens,
        temperature=temperature,
        timeout_seconds=timeout_seconds,
        max_retries=max_retries,
    )


def calculate_cost(usage: dict, provider: Optional[str] = None) -> dict:
    """
    兼容现有调用入口，但不再计算 AI 金额成本，只返回 token 统计。
    """
    _ = provider
    total_tokens = int(usage.get("total_tokens", 0) or 0)
    return {
        "total_tokens": total_tokens,
    }

"""
deepseek_client.py - DeepSeek API 调用封装

使用 OpenAI 兼容 SDK 调用 DeepSeek API，包含重试、超时控制和成本计算。
"""

import json
import os
from typing import Any, Optional

from loguru import logger

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

PRICING = {
    "cache_hit_input": 0.2,
    "cache_miss_input": 2.0,
    "output": 3.0,
}


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


def get_api_key() -> Optional[str]:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if api_key:
        return api_key

    fallback_key = _get_windows_environment_variable("DEEPSEEK_API_KEY")
    if fallback_key:
        logger.info("Using DEEPSEEK_API_KEY from Windows environment registry fallback")
        return fallback_key

    return None


def get_client() -> Optional["AsyncOpenAI"]:
    """获取 DeepSeek API 客户端。"""
    if AsyncOpenAI is None:
        logger.error("openai 库未安装")
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
) -> list[dict]:
    """
    构建案例分析请求的 messages。

    Args:
        diff_summary: 代码差异摘要
        mapping_info: 功能映射信息
        test_cases_text: 测试用例文本

    Returns:
        OpenAI messages 格式列表
    """
    system_prompt = (
        "你是一位资深测试架构师，擅长分析代码改动并评估测试用例覆盖情况。\n"
        "请根据提供的代码改动 diff、功能映射和现有测试用例，分析测试覆盖缺口并给出补充建议。\n"
        "请以 JSON 格式输出分析结果。"
    )

    user_prompt = (
        f"## 代码改动 Diff\n{diff_summary}\n\n"
        f"## 功能映射关系\n{mapping_info}\n\n"
        f"## 现有测试用例\n{test_cases_text}\n\n"
        "请分析以上信息，输出 JSON 格式结果，包含以下字段：\n"
        "- uncovered_methods: 未覆盖的方法列表\n"
        "- coverage_gaps: 覆盖缺口描述\n"
        "- suggested_test_cases: 建议补充的测试用例（每个包含 test_id, test_function, test_steps, expected_result）\n"
        "- risk_assessment: 风险评估（high/medium/low）\n"
        "- improvement_suggestions: 改进建议列表"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def build_requirement_analysis_messages(
    project_name: str,
    requirement_hits: list[dict],
) -> list[dict]:
    """
    构建需求分析请求的 messages。

    DeepSeek 只负责对规则引擎已命中的结果做归纳和文案补充，
    不参与是否命中的判定。
    """
    system_prompt = (
        "你是一位资深测试架构师，擅长基于需求说明和项目需求映射关系，"
        "提炼测试范围建议，并给出风险等级判断。\n"
        "输入中的命中结果已经由规则引擎判定，你不能修改命中关系，也不要新增未命中的项。\n"
        "请以 JSON 格式输出，字段必须包含：\n"
        "- summary: 总体结论字符串，50~90字，直接说明要补哪些场景\n"
        "- overall_assessment: 总体判断，8~16个中文字符，不要标点，不要解释\n"
        "- key_findings: 数组，输出 2~4 条关注点；每条不超过 28 个中文字符，不要重复相同场景或结论\n"
        "- risk_table: 数组，每项包含 requirement_point_id、risk_level(高/中/低)、risk_reason、test_focus"
    )

    payload = json.dumps(
        {
            "project_name": project_name,
            "matched_requirement_points": requirement_hits,
        },
        ensure_ascii=False,
        indent=2,
    )

    user_prompt = (
        "以下是需求分析的规则命中结果，请基于这些已命中的事实输出更自然、可执行的测试文案。\n"
        "要求：\n"
        "1. 不要添加新的 requirement_point_id。\n"
        "2. summary、overall_assessment、key_findings 要聚焦“哪些关联场景需要纳入测试范围、为什么值得重点验证”。\n"
        "3. risk_table 必须覆盖所有已命中的 requirement_point_id。\n"
        "4. risk_level 只能是 高 / 中 / 低；命中多个映射组，或命中某个关联场景后需要扩展到同组其它场景时，优先评为更高风险。\n"
        "5. risk_reason 要说明为什么有风险，test_focus 要说明测试时最该优先补齐哪些关联场景、边界和校验点。\n"
        "6. overall_assessment 必须短，只保留一个判断；key_findings 用简洁完整的短句输出，不要空泛套话。\n"
        "7. 如果输入中包含 additional_scenarios，需要明确指出这些是需要一并纳入测试范围的扩展场景。\n"
        "8. 输出必须是合法 JSON 对象，不要输出 Markdown。\n\n"
        f"{payload}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


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

    candidates = [normalized]
    if normalized.startswith("```"):
        fence_lines = normalized.splitlines()
        if len(fence_lines) > 1:
            fenced_body = "\n".join(fence_lines[1:]).strip()
            if fenced_body.endswith("```"):
                fenced_body = fenced_body[:-3].rstrip()
            if fenced_body:
                candidates.append(fenced_body)

    for candidate in candidates:
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


async def call_deepseek(
    messages: list[dict],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
    timeout_seconds: int = TIMEOUT_SECONDS,
    max_retries: int = MAX_RETRIES,
) -> dict:
    """
    带重试和超时控制的 DeepSeek API 调用。

    Args:
        messages: OpenAI messages 格式列表
        max_tokens: 最大输出 token 数
        temperature: 采样温度
        timeout_seconds: 单次调用超时时间
        max_retries: 最大重试次数

    Returns:
        成功时返回包含 result 和 usage 的字典，失败时返回包含 error 的字典
    """
    client = get_client()
    if client is None:
        return {"error": "DeepSeek 客户端初始化失败，请检查 API Key 配置"}

    for attempt in range(max_retries + 1):
        try:
            response = await client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                response_format={"type": "json_object"},
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=timeout_seconds,
            )

            content = response.choices[0].message.content
            if not content:
                if attempt < max_retries:
                    logger.warning(f"DeepSeek 返回空 content，重试 {attempt + 1}/{max_retries}")
                    continue
                return {"error": "AI 返回空结果，请稍后重试"}

            try:
                result = _extract_json_result(content)
            except json.JSONDecodeError:
                if attempt < max_retries:
                    logger.warning(f"DeepSeek 返回非法 JSON，重试 {attempt + 1}/{max_retries}")
                    continue
                return {"error": "AI 返回格式异常，请稍后重试"}

            usage = {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens,
                "prompt_cache_hit_tokens": getattr(response.usage, "prompt_cache_hit_tokens", 0),
                "prompt_cache_miss_tokens": getattr(response.usage, "prompt_cache_miss_tokens", 0),
            }

            logger.info(
                f"DeepSeek 调用成功: tokens={usage['total_tokens']}, "
                f"cache_hit={usage['prompt_cache_hit_tokens']}"
            )

            return {"result": result, "usage": usage}

        except APITimeoutError:
            if attempt < max_retries:
                logger.warning(f"DeepSeek 调用超时，重试 {attempt + 1}/{max_retries}")
                continue
            return {"error": "AI 分析超时，请减少分析范围后重试"}

        except RateLimitError:
            logger.warning("DeepSeek 限流")
            return {"error": "请求频率超限，请稍后重试"}

        except APIError as error:
            logger.error(f"DeepSeek API 错误: {error}")
            return {"error": f"AI 服务异常: {getattr(error, 'message', str(error))}"}

        except Exception as error:
            logger.error(f"DeepSeek 调用异常: {error}")
            return {"error": f"调用异常: {str(error)}"}

    return {"error": "AI 调用失败，请稍后重试"}


def calculate_cost(usage: dict) -> dict:
    """
    根据 DeepSeek 定价计算本次调用成本。

    Args:
        usage: Token 用量字典

    Returns:
        成本明细（单位：元）
    """
    cache_hit_cost = usage.get("prompt_cache_hit_tokens", 0) / 1_000_000 * PRICING["cache_hit_input"]
    cache_miss_cost = usage.get("prompt_cache_miss_tokens", 0) / 1_000_000 * PRICING["cache_miss_input"]
    output_cost = usage.get("completion_tokens", 0) / 1_000_000 * PRICING["output"]
    total_cost = cache_hit_cost + cache_miss_cost + output_cost

    return {
        "input_cost": round(cache_hit_cost + cache_miss_cost, 6),
        "output_cost": round(output_cost, 6),
        "total_cost": round(total_cost, 6),
        "total_tokens": usage.get("total_tokens", 0),
    }

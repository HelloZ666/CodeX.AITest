from __future__ import annotations

import json
from typing import Any

from services.deepseek_client import calculate_cost, call_deepseek, get_ai_provider_label
from services.prompt_template_runtime import merge_task_system_prompt


AI_CASE_GENERATION_TIMEOUT_SECONDS = 100
MAX_REQUIREMENT_POINTS = 8


def _clip_text(value: str, limit: int = 42) -> str:
    normalized = " ".join(str(value or "").split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit].rstrip()}..."


def _contains_any(text: str, keywords: tuple[str, ...]) -> bool:
    return any(keyword in text for keyword in keywords)


def _build_case(case_id: str, description: str, steps: str, expected_result: str, source: str) -> dict[str, str]:
    return {
        "case_id": case_id,
        "description": description.strip(),
        "steps": steps.strip(),
        "expected_result": expected_result.strip(),
        "source": source,
    }


def _build_fallback_cases(parsed_document: dict[str, Any]) -> list[dict[str, str]]:
    cases: list[dict[str, str]] = []
    sequence = 1

    for point in (parsed_document.get("points") or [])[:MAX_REQUIREMENT_POINTS]:
        text = " ".join(str(point.get("text") or "").split())
        if not text:
            continue

        section_title = str(point.get("section_title") or point.get("section_number") or "需求点")
        short_text = _clip_text(text, 36)

        cases.append(_build_case(
            case_id=f"TC-{sequence:03d}",
            description=f"{section_title}主流程验证：{short_text}",
            steps=(
                "1. 打开对应业务入口并进入目标功能页面。\n"
                f"2. 按需求执行操作：{short_text}。\n"
                "3. 提交操作并观察页面提示、状态流转和数据结果。"
            ),
            expected_result=(
                f"系统按需求正确处理“{short_text}”，"
                "页面展示、业务状态和落库结果与需求描述一致。"
            ),
            source="fallback",
        ))
        sequence += 1

        if _contains_any(text, ("校验", "必填", "限制", "条件", "规则", "拦截", "校验项")):
            cases.append(_build_case(
                case_id=f"TC-{sequence:03d}",
                description=f"{section_title}规则校验验证：{short_text}",
                steps=(
                    "1. 打开目标功能并准备触发异常或边界输入。\n"
                    f"2. 在关键字段中故意违反需求规则：{short_text}。\n"
                    "3. 提交并检查拦截、提示文案和状态是否符合预期。"
                ),
                expected_result=(
                    "系统阻止不符合规则的数据继续流转，"
                    "并给出准确、清晰、可执行的校验提示。"
                ),
                source="fallback",
            ))
            sequence += 1

        if (
            str(point.get("section_number") or "").startswith("4.4")
            or _contains_any(text, ("页面", "界面", "展示", "提示", "弹窗", "按钮", "文案"))
        ):
            cases.append(_build_case(
                case_id=f"TC-{sequence:03d}",
                description=f"{section_title}界面展示验证：{short_text}",
                steps=(
                    "1. 进入目标页面并触发与需求相关的展示场景。\n"
                    f"2. 核对页面文案、提示、弹窗和按钮状态是否匹配：{short_text}。\n"
                    "3. 切换关键交互路径，检查展示是否稳定一致。"
                ),
                expected_result=(
                    "页面信息展示正确，提示文案完整明确，"
                    "交互反馈与需求描述保持一致。"
                ),
                source="fallback",
            ))
            sequence += 1

    if cases:
        return cases

    return [
        _build_case(
            case_id="TC-001",
            description="需求文档基础流程验证",
            steps=(
                "1. 打开目标功能入口。\n"
                "2. 按需求文档描述执行核心业务流程。\n"
                "3. 观察页面反馈、业务状态和数据结果。"
            ),
            expected_result="系统完成核心业务处理，结果与需求文档描述保持一致。",
            source="fallback",
        ),
    ]


def _normalize_ai_case(case: dict[str, Any], index: int) -> dict[str, str] | None:
    description = str(
        case.get("description")
        or case.get("case_description")
        or case.get("用例描述")
        or ""
    ).strip()
    steps = str(
        case.get("steps")
        or case.get("test_steps")
        or case.get("测试步骤")
        or ""
    ).strip()
    expected_result = str(
        case.get("expected_result")
        or case.get("expected")
        or case.get("预期结果")
        or ""
    ).strip()
    if not description or not steps or not expected_result:
        return None

    case_id = str(
        case.get("case_id")
        or case.get("id")
        or case.get("用例ID")
        or f"TC-{index:03d}"
    ).strip()

    return _build_case(
        case_id=case_id,
        description=description,
        steps=steps,
        expected_result=expected_result,
        source="ai",
    )


def _dedupe_cases(cases: list[dict[str, str]]) -> list[dict[str, str]]:
    unique_cases: list[dict[str, str]] = []
    seen: set[str] = set()

    for index, case in enumerate(cases, start=1):
        key = "::".join([
            case.get("description", "").strip(),
            case.get("steps", "").strip(),
            case.get("expected_result", "").strip(),
        ])
        if not key or key in seen:
            continue

        seen.add(key)
        normalized = dict(case)
        normalized["case_id"] = normalized.get("case_id") or f"TC-{index:03d}"
        unique_cases.append(normalized)

    return unique_cases


def build_requirement_case_generation_messages(
    parsed_document: dict[str, Any],
    prompt_template_text: str | None = None,
) -> list[dict[str, str]]:
    base_system_prompt = (
        "你是一位资深测试分析师，擅长从需求文档中设计高质量功能测试用例。\n"
        "请基于需求点提炼主流程、规则校验、边界条件和界面反馈相关测试场景。\n"
        "输出必须是合法 JSON，字段必须包含：\n"
        "- summary: 40~100 字，总结本次生成覆盖了哪些重点\n"
        "- cases: 数组，每项必须包含 case_id、description、steps、expected_result\n"
        "其中 steps 必须是带序号的多行字符串，expected_result 必须是完整中文句子。"
    )
    system_prompt = merge_task_system_prompt(base_system_prompt, prompt_template_text)

    payload = json.dumps(
        {
            "selected_mode": parsed_document.get("selected_mode"),
            "selected_sections": parsed_document.get("selected_sections") or [],
            "requirement_points": (parsed_document.get("points") or [])[:MAX_REQUIREMENT_POINTS],
        },
        ensure_ascii=False,
        indent=2,
    )

    user_prompt = (
        "以下是从需求文档中解析出的需求点，请生成结构化功能测试用例。\n"
        "要求：\n"
        "1. 覆盖主流程、异常流、规则校验和界面提示等核心场景。\n"
        "2. 每条用例都必须包含 case_id、description、steps、expected_result。\n"
        "3. steps 使用 `1.` `2.` `3.` 这种编号格式，写成一个多行字符串。\n"
        "4. 输出必须是合法 JSON，不要输出 Markdown。\n"
        "5. 不要杜撰文档中完全不存在的业务对象名称，必要时可用“目标功能”“目标页面”等中性描述。\n\n"
        f"{payload}"
    )

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


async def generate_requirement_cases(
    parsed_document: dict[str, Any],
    prompt_template_text: str | None = None,
) -> dict[str, Any]:
    fallback_cases = _build_fallback_cases(parsed_document)

    ai_response = await call_deepseek(
        build_requirement_case_generation_messages(
            parsed_document,
            prompt_template_text=prompt_template_text,
        ),
        max_tokens=2600,
        temperature=0.2,
        timeout_seconds=AI_CASE_GENERATION_TIMEOUT_SECONDS,
        max_retries=0,
    )

    if ai_response.get("error"):
        return {
            "summary": "AI 生成不可用，已根据需求文档结构回退生成基础测试用例。",
            "cases": fallback_cases,
            "generation_mode": "fallback",
            "provider": ai_response.get("provider") or get_ai_provider_label(),
            "ai_cost": None,
            "error": str(ai_response["error"]),
        }

    result = ai_response.get("result") or {}
    if not isinstance(result, dict):
        result = {}

    raw_cases = result.get("cases") or []
    if not isinstance(raw_cases, list):
        raw_cases = []
    normalized_ai_cases = [
        normalized
        for index, case in enumerate(raw_cases, start=1)
        if isinstance(case, dict)
        for normalized in [_normalize_ai_case(case, index)]
        if normalized is not None
    ]
    deduped_cases = _dedupe_cases(normalized_ai_cases)
    if not deduped_cases:
        return {
            "summary": "AI 返回结果缺少可用用例，已回退为基础测试用例模板。",
            "cases": fallback_cases,
            "generation_mode": "fallback",
            "provider": ai_response.get("provider") or get_ai_provider_label(),
            "ai_cost": None,
            "error": "AI 返回结果缺少可用用例",
        }

    usage = ai_response.get("usage") or {}
    ai_cost = calculate_cost(usage, provider=ai_response.get("provider_key")) if usage else None
    return {
        "summary": str(result.get("summary") or "").strip() or "已完成需求文档测试用例生成。",
        "cases": deduped_cases,
        "generation_mode": "ai",
        "provider": ai_response.get("provider") or get_ai_provider_label(),
        "ai_cost": ai_cost,
        "error": None,
    }

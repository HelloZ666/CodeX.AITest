from __future__ import annotations

import json
import textwrap
from typing import Any

import yaml

from services.api_automation_document_parser import _extract_pdf_text, _extract_word_text
from services.database import get_prompt_template_by_key
from services.file_parser import detect_file_type, parse_csv, parse_excel, parse_json


SUPPORTED_AI_AGENT_ATTACHMENT_TYPES = ["csv", "excel", "json", "doc", "docx", "pdf", "yaml"]
AI_AGENT_ATTACHMENT_ACCEPT = ".csv,.xls,.xlsx,.json,.doc,.docx,.pdf,.yaml,.yml"
MAX_ATTACHMENT_TEXT_LENGTH = 6000
MAX_TOTAL_ATTACHMENT_TEXT_LENGTH = 18000
MAX_HISTORY_MESSAGES = 12
MAX_HISTORY_TEXT_LENGTH = 12000
DEFAULT_AI_ASSISTANT_KEY = "default"
DEFAULT_AI_ASSISTANT_NAME = "榛樿AI鍔╂墜"

BUILTIN_AI_AGENTS: list[dict[str, str]] = [
    {
        "key": "general",
        "name": "閫氱敤鍔╂墜",
        "prompt": (
            "浣犳槸娴嬭瘯骞冲彴涓殑閫氱敤鏅鸿兘浣撱€?"
            "璇风粨鍚堢敤鎴烽棶棰樹笌闄勪欢鍐呭锛岀粰鍑虹洿鎺ャ€佸噯纭€佸彲鎵ц鐨勪腑鏂囧洖绛斻€?"
            "褰撲俊鎭笉瓒虫椂瑕佹槑纭寚鍑虹己澶辩偣锛屼笉瑕佺紪閫犳湭鎻愪緵鐨勪簨瀹炪€?"
        ),
    },
    {
        "key": "requirement",
        "name": "闇€姹傚垎鏋愬笀",
        "prompt": (
            "浣犳槸璧勬繁闇€姹傚垎鏋愭櫤鑳戒綋銆?"
            "鎿呴暱浠庨渶姹傛枃妗ｃ€佹帴鍙ｈ鏄庛€佹祴璇曡祫鏂欎腑鎻愮偧鐩爣銆佽竟鐣屾潯浠躲€侀闄╃偣鍜屽緟纭椤广€?"
            "鍥炵瓟鏃朵紭鍏堣緭鍑哄叧閿粨璁恒€侀闄╀笌寤鸿銆?"
        ),
    },
    {
        "key": "testcase",
        "name": "娴嬭瘯鐢ㄤ緥涓撳",
        "prompt": (
            "浣犳槸娴嬭瘯鐢ㄤ緥璁捐鏅鸿兘浣撱€?"
            "鎿呴暱鏍规嵁闇€姹傘€佷唬鐮佸彉鏇淬€佹帴鍙ｆ枃妗ｅ拰娴嬭瘯鏁版嵁锛岃ˉ鍏呮甯告祦銆佸紓甯告祦銆佽竟鐣屽€煎拰鍥炲綊寤鸿銆?"
            "鍥炵瓟鏃跺敖閲忕粰鍑虹粨鏋勫寲娴嬭瘯鐐广€?"
        ),
    },
    {
        "key": "api",
        "name": "鎺ュ彛鑷姩鍖栧姪鎵?",
        "prompt": (
            "浣犳槸鎺ュ彛鑷姩鍖栨櫤鑳戒綋銆?"
            "鎿呴暱鍒嗘瀽鎺ュ彛鏂囨。銆佽姹傚弬鏁般€佸搷搴旂粨鏋勩€侀壌鏉冩柟寮忓拰鏂█璁捐銆?"
            "鍥炵瓟鏃朵紭鍏堢粰鍑烘帴鍙ｉ獙璇佹€濊矾銆佹柇瑷€寤鸿銆佷緷璧栧叧绯诲拰鑷姩鍖栬惤鍦板缓璁€?"
        ),
    },
]


def list_builtin_ai_agents() -> list[dict[str, str]]:
    return [dict(item) for item in BUILTIN_AI_AGENTS]


def get_default_ai_assistant_profile() -> dict[str, Any]:
    return {
        "key": DEFAULT_AI_ASSISTANT_KEY,
        "name": DEFAULT_AI_ASSISTANT_NAME,
        "prompt": "",
        "builtin": True,
        "uses_prompt": False,
    }


def resolve_ai_agent(agent_key: str | None, custom_prompt: str | None = None) -> dict[str, Any]:
    normalized_key = (agent_key or "").strip()
    if not normalized_key or normalized_key == DEFAULT_AI_ASSISTANT_KEY:
        return get_default_ai_assistant_profile()

    if normalized_key == "custom":
        prompt = (custom_prompt or "").strip()
        if not prompt:
            raise ValueError("鑷畾涔堿I鍔╂墜闇€瑕佸～鍐欐彁绀鸿瘝")
        return {
            "key": "custom",
            "name": "鑷畾涔堿I鍔╂墜",
            "prompt": prompt,
            "builtin": False,
            "uses_prompt": True,
        }

    matched = get_prompt_template_by_key(normalized_key)
    if matched is None:
        builtin_match = next((item for item in BUILTIN_AI_AGENTS if item["key"] == normalized_key), None)
        if builtin_match is None:
            raise ValueError("鏈壘鍒板搴旂殑AI鍔╂墜閰嶇疆")
        return {
            "key": builtin_match["key"],
            "name": builtin_match["name"],
            "prompt": builtin_match["prompt"],
            "builtin": True,
            "uses_prompt": True,
        }

    return {
        "key": matched["agent_key"],
        "name": matched["name"],
        "prompt": matched["prompt"],
        "builtin": normalized_key in {item["key"] for item in BUILTIN_AI_AGENTS},
        "uses_prompt": bool(str(matched["prompt"]).strip()),
    }


def _truncate_text(value: str, limit: int) -> tuple[str, bool]:
    normalized = (value or "").strip()
    if len(normalized) <= limit:
        return normalized, False
    return normalized[:limit].rstrip(), True


def _serialize_tabular_rows(rows: list[dict[str, Any]]) -> str:
    preview_rows = rows[:20]
    return json.dumps(preview_rows, ensure_ascii=False, indent=2)


def extract_ai_agent_attachment_text(filename: str, content: bytes) -> dict[str, Any]:
    file_type = detect_file_type(filename)
    if file_type == "csv":
        raw_text = _serialize_tabular_rows(parse_csv(content))
    elif file_type == "excel":
        raw_text = _serialize_tabular_rows(parse_excel(content))
    elif file_type == "json":
        raw_text = json.dumps(parse_json(content), ensure_ascii=False, indent=2)
    elif file_type == "yaml":
        payload = yaml.safe_load(content.decode("utf-8"))
        raw_text = yaml.safe_dump(payload, allow_unicode=True, sort_keys=False)
    elif file_type == "pdf":
        raw_text = _extract_pdf_text(content)
    elif file_type in {"doc", "docx"}:
        raw_text = _extract_word_text(content, filename)
    else:
        raise ValueError(f"涓嶆敮鎸佽В鏋愯闄勪欢绫诲瀷: {filename}")

    excerpt, excerpt_truncated = _truncate_text(raw_text, 300)
    content_text, content_truncated = _truncate_text(raw_text, MAX_ATTACHMENT_TEXT_LENGTH)

    return {
        "file_name": filename,
        "file_type": file_type,
        "file_size": len(content),
        "excerpt": excerpt,
        "excerpt_truncated": excerpt_truncated,
        "content_text": content_text,
        "content_truncated": content_truncated,
    }


def build_ai_agent_conversation_title(question: str, limit: int = 40) -> str:
    normalized = " ".join((question or "").strip().split())
    if not normalized:
        return "鏂板璇?"
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[:limit].rstrip()}..."


def _build_attachment_context_text(attachments: list[dict[str, Any]]) -> str:
    total_length = 0
    attachment_sections: list[str] = []
    for index, item in enumerate(attachments, start=1):
        content = str(item.get("content_text") or "").strip()
        if not content:
            continue

        remaining = MAX_TOTAL_ATTACHMENT_TEXT_LENGTH - total_length
        if remaining <= 0:
            break

        included_text, cut_by_budget = _truncate_text(content, remaining)
        total_length += len(included_text)
        truncated = bool(item.get("content_truncated")) or cut_by_budget

        attachment_sections.append(
            textwrap.dedent(
                f"""
                附件{index}：{item.get("file_name")}（{item.get("file_type")}）
                {included_text}
                {"[附件内容已截断]" if truncated else ""}
                """
            ).strip()
        )

    return "\n\n".join(section for section in attachment_sections if section)


def build_ai_agent_user_turn(
    question: str,
    attachments: list[dict[str, Any]],
) -> dict[str, str]:
    normalized_question = question.strip()
    attachment_context_text = _build_attachment_context_text(attachments)

    if attachment_context_text:
        message_content = textwrap.dedent(
            f"""
            用户问题：
            {normalized_question}

            本轮附件内容：
            {attachment_context_text}
            """
        ).strip()
    else:
        message_content = textwrap.dedent(
            f"""
            用户问题：
            {normalized_question}

            本轮未上传附件。请直接基于用户问题和通用知识正常回答。
            如果要给出更准确的结论确实还需要额外材料，再明确说明需要补充什么。
            """
        ).strip()

    return {
        "question": normalized_question,
        "context_text": attachment_context_text,
        "message_content": message_content,
    }


def _build_history_message(record: dict[str, Any]) -> dict[str, str] | None:
    role = str(record.get("role") or "").strip()
    content = str(record.get("content") or "").strip()
    if role not in {"user", "assistant"} or not content:
        return None

    if role == "assistant":
        return {"role": "assistant", "content": content}

    context_text = str(record.get("context_text") or "").strip()
    if context_text:
        history_content = textwrap.dedent(
            f"""
            用户问题：
            {content}

            当时上传的附件内容：
            {context_text}
            """
        ).strip()
    else:
        history_content = textwrap.dedent(
            f"""
            用户问题：
            {content}

            当时未上传附件。
            """
        ).strip()

    return {"role": "user", "content": history_content}


def _build_history_messages(history: list[dict[str, Any]] | None) -> list[dict[str, str]]:
    if not history:
        return []

    recent_history = history[-MAX_HISTORY_MESSAGES:]
    budget = MAX_HISTORY_TEXT_LENGTH
    rendered_messages: list[dict[str, str]] = []

    for item in reversed(recent_history):
        rendered = _build_history_message(item)
        if rendered is None:
            continue

        content = rendered["content"].strip()
        if not content or budget <= 0:
            continue

        if len(content) > budget:
            content, _ = _truncate_text(content, budget)
            if not content:
                continue

        rendered_messages.append({"role": rendered["role"], "content": content})
        budget -= len(content)
        if budget <= 0:
            break

    rendered_messages.reverse()
    return rendered_messages


def build_ai_agent_messages(
    question: str,
    agent_profile: dict[str, Any],
    attachments: list[dict[str, Any]],
    history: list[dict[str, Any]] | None = None,
) -> list[dict[str, str]]:
    prompt_text = str(agent_profile.get("prompt") or "").strip()
    if prompt_text:
        system_prompt = textwrap.dedent(
            f"""
            你当前扮演的 AI 助手是“{agent_profile.get("name")}”。
            以下是该助手提示词，请严格遵循：
            {prompt_text}

            回答要求：
            1. 默认使用中文回答。
            2. 优先结合当前会话上下文、用户问题和附件内容作答。
            3. 如果本轮没有附件，也要保持正常对话，不要把“缺少附件”当作默认拒答理由。
            4. 如果要给出更准确的结论确实还需要更多材料，再明确说明还缺少哪些信息。
            5. 不要输出 Markdown 表格，除非用户明确要求。
            """
        ).strip()
    else:
        system_prompt = textwrap.dedent(
            f"""
            你当前是测试平台中的 AI 助手“{agent_profile.get("name")}”。
            当前未配置额外提示词，请直接基于当前会话上下文、用户问题和附件内容给出直接、准确、可执行的中文回答。

            回答要求：
            1. 默认使用中文回答。
            2. 如果本轮没有附件，也要先根据用户文字正常交流，不要机械要求先上传附件。
            3. 如果确实还需要更多材料，再明确说明还缺少哪些信息。
            4. 不要输出 Markdown 表格，除非用户明确要求。
            """
        ).strip()

    current_turn = build_ai_agent_user_turn(question, attachments)
    history_messages = _build_history_messages(history)

    return [
        {"role": "system", "content": system_prompt},
        *history_messages,
        {"role": "user", "content": current_turn["message_content"]},
    ]

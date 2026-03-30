from __future__ import annotations

from typing import Optional

from services.database import get_prompt_template_by_key


def resolve_prompt_template_text(prompt_template_key: str | None) -> str | None:
    normalized_key = str(prompt_template_key or "").strip()
    if not normalized_key:
        return None

    template = get_prompt_template_by_key(normalized_key)
    if template is None:
        raise ValueError("所选提示词不存在，请重新选择")

    prompt_text = str(template.get("prompt") or "").strip()
    if not prompt_text:
        raise ValueError("所选提示词内容为空，请重新选择")

    return prompt_text


def merge_task_system_prompt(base_prompt: str, prompt_template_text: str | None = None) -> str:
    normalized_base_prompt = str(base_prompt or "").strip()
    normalized_template_prompt = str(prompt_template_text or "").strip()
    if not normalized_template_prompt:
        return normalized_base_prompt

    return (
        f"{normalized_template_prompt}\n\n"
        "以上是当前选择的提示词模板。以下是当前任务的固定执行要求，"
        "你必须继续严格遵守，尤其不要改变输出格式、字段约束和事实边界：\n"
        f"{normalized_base_prompt}"
    )

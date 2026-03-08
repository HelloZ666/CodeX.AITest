"""
requirement_document_parser.py - 需求文档解析

负责解析 DOCX 文档，优先抽取 4.1 / 4.4 章节并切分为需求点。
"""

from __future__ import annotations

import re
from io import BytesIO
from typing import Iterable

from docx import Document
from docx.document import Document as DocumentType
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph


SECTION_RE = re.compile(r"^\s*(\d+(?:\.\d+)+)\s*([^\n]*)$")
LIST_PREFIX_RE = re.compile(r"^\s*(?:[（(]?[0-9一二三四五六七八九十]+[)）.、]|[-•●])\s*")
FIELD_NAME_RE = re.compile(r"^[\u4e00-\u9fffA-Za-z0-9_\-（）()：:]{1,20}$")
TARGET_SECTION_NUMBERS = {"4.1", "4.4"}


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u3000", " ")).strip()


def _iter_block_items(document: DocumentType) -> Iterable[Paragraph | Table]:
    body = document.element.body
    for child in body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def _is_heading_paragraph(paragraph: Paragraph) -> bool:
    style_name = getattr(paragraph.style, "name", "") or ""
    style_name_lower = style_name.lower()
    return (
        "heading" in style_name_lower
        or "标题" in style_name
        or style_name.startswith("TOC")
    )


def _extract_blocks(content: bytes) -> list[dict[str, object]]:
    document = Document(BytesIO(content))
    blocks: list[dict[str, object]] = []

    for item in _iter_block_items(document):
        if isinstance(item, Paragraph):
            text = _normalize_space(item.text)
            if text:
                blocks.append(
                    {
                        "kind": "paragraph",
                        "text": text,
                        "is_heading": _is_heading_paragraph(item),
                        "style_name": getattr(item.style, "name", "") or "",
                    }
                )
            continue

        for row in item.rows:
            cells = [_normalize_space(cell.text) for cell in row.cells]
            cells = [cell for cell in cells if cell]
            if cells:
                blocks.append({"kind": "table_row", "text": " | ".join(cells), "cells": cells})

    return blocks


def _build_sections(blocks: list[dict[str, object]]) -> list[dict[str, object]]:
    sections: list[dict[str, object]] = []
    current: dict[str, object] | None = None

    for block in blocks:
        text = block["text"]
        match = SECTION_RE.match(text)
        if match:
            current = {
                "number": match.group(1),
                "title": _normalize_space(match.group(2)),
                "blocks": [],
            }
            sections.append(current)
            continue

        if current is None:
            current = {
                "number": "全文",
                "title": "文档正文",
                "blocks": [],
            }
            sections.append(current)

        current_blocks = current.setdefault("blocks", [])
        if isinstance(current_blocks, list):
            current_blocks.append(block)

    return sections


def _looks_like_field_name(text: str) -> bool:
    normalized = _normalize_space(text)
    return bool(
        normalized
        and FIELD_NAME_RE.match(normalized)
        and len(normalized) <= 20
    )


def _extract_table_row_content(cells: list[str]) -> str:
    if not cells:
        return ""

    if len(cells) == 1:
        return "" if _looks_like_field_name(cells[0]) else cells[0]

    if _looks_like_field_name(cells[0]):
        value_cells = [cell for cell in cells[1:] if cell and not _looks_like_field_name(cell)]
        if not value_cells:
            return ""
        candidate = "；".join(value_cells)
        return candidate if len(candidate) >= 8 else ""

    candidate = "；".join(cells)
    return candidate if len(candidate) >= 8 else ""


def _split_requirement_blocks(
    section_number: str,
    section_title: str,
    blocks: list[dict[str, object]],
) -> list[dict[str, str]]:
    points: list[dict[str, str]] = []
    point_index = 0

    for block in blocks:
        text = _normalize_space(str(block["text"]))
        if not text:
            continue

        if bool(block.get("is_heading")):
            continue

        if SECTION_RE.match(text):
            continue

        if block["kind"] == "table_row":
            cells = [str(item).strip() for item in block.get("cells", []) if str(item).strip()]
            text = _extract_table_row_content(cells)
            if not text:
                continue

        text = LIST_PREFIX_RE.sub("", text).strip()
        if len(text) < 8:
            continue

        if _looks_like_field_name(text):
            continue

        point_index += 1
        points.append(
            {
                "point_id": f"{section_number}-{point_index}" if section_number != "全文" else f"全文-{point_index}",
                "section_number": section_number,
                "section_title": section_title or "未命名章节",
                "text": text,
            }
        )

    return points


def parse_requirement_document(content: bytes) -> dict:
    blocks = _extract_blocks(content)
    if not blocks:
        raise ValueError("需求文档中没有可解析的文本内容")

    sections = _build_sections(blocks)
    section_map = {
        str(section["number"]): section
        for section in sections
    }

    use_target_sections = TARGET_SECTION_NUMBERS.issubset(set(section_map.keys()))
    selected_sections = (
        [section_map["4.1"], section_map["4.4"]]
        if use_target_sections
        else sections
    )

    points: list[dict[str, str]] = []
    for section in selected_sections:
        section_blocks = section.get("blocks", [])
        if not isinstance(section_blocks, list):
            continue
        points.extend(
            _split_requirement_blocks(
                section_number=str(section["number"]),
                section_title=str(section.get("title", "")),
                blocks=section_blocks,
            )
        )

    if not points:
        full_text = " ".join(
            str(block["text"])
            for block in blocks
            if block.get("kind") == "paragraph" and not block.get("is_heading") and block.get("text")
        )
        full_text = _normalize_space(full_text)
        if len(full_text) < 8:
            raise ValueError("需求文档可解析内容不足，请确认文档正文为可复制文本")
        points = [
            {
                "point_id": "全文-1",
                "section_number": "全文",
                "section_title": "文档正文",
                "text": full_text,
            }
        ]

    return {
        "selected_mode": "preferred_sections" if use_target_sections else "full_document",
        "selected_sections": [
            {
                "number": str(section["number"]),
                "title": str(section.get("title", "")),
                "block_count": len(section.get("blocks", [])) if isinstance(section.get("blocks", []), list) else 0,
            }
            for section in selected_sections
        ],
        "all_sections": [
            {
                "number": str(section["number"]),
                "title": str(section.get("title", "")),
                "block_count": len(section.get("blocks", [])) if isinstance(section.get("blocks", []), list) else 0,
            }
            for section in sections
        ],
        "points": points,
    }

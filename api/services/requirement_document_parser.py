"""
requirement_document_parser.py - 需求文档解析
负责解析 DOC/DOCX 文档，优先抽取 4.1 / 4.4 章节并切分为需求点。
"""

from __future__ import annotations

import re
import struct
from io import BytesIO
from typing import Iterable
from zipfile import BadZipFile

import olefile
from docx import Document
from docx.document import Document as DocumentType
from docx.opc.exceptions import PackageNotFoundError
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from services.file_parser import detect_file_type, detect_word_content_type


SECTION_RE = re.compile(r"^\s*(\d+(?:\.\d+)+)\s*([^\n]*)$")
LIST_PREFIX_RE = re.compile(r"^\s*(?:[（(]?[0-9一二三四五六七八九十]+[)）.、]|[-•●])\s*")
FIELD_NAME_RE = re.compile(r"^[\u4e00-\u9fffA-Za-z0-9_\-（）()：:]{1,20}$")
TARGET_SECTION_NUMBERS = {"4.1", "4.4"}
TITLE_ONLY_SECTION_ALIASES = {
    "功能描述": "4.1",
    "界面": "4.4",
}
DOC_CONTROL_TO_NEWLINE = {"\r": "\n", "\x07": "\n", "\x0b": "\n", "\x0c": "\n"}
DOC_NOISE_TOKENS = ("TOC ", "PAGEREF", "HYPERLINK", "EMBED", "MERGEFORMAT")
DOC_WORD_STREAM = "WordDocument"
DOC_CLX_OFFSET_IN_FIB = 0x108


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u3000", " ")).strip()


def _normalize_section_title(text: str) -> str:
    normalized = _normalize_space(text)
    return normalized.lstrip("*＊").strip()


def _normalize_section_title_key(text: str) -> str:
    return _normalize_section_title(text).replace(" ", "")


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


def _extract_blocks_from_docx(content: bytes) -> list[dict[str, object]]:
    try:
        document = Document(BytesIO(content))
    except BadZipFile as exc:
        raise ValueError(
            "当前文件不是有效的 .docx 文档，请确认文件未损坏，且不是仅修改扩展名后的旧版 Word 文档"
        ) from exc
    except PackageNotFoundError as exc:
        raise ValueError("需求文档无法打开，请确认上传的是标准 .docx 文档") from exc

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


def _open_ole_stream(ole: olefile.OleFileIO, stream_name: str) -> bytes:
    if not ole.exists(stream_name):
        raise ValueError("当前 .doc 文档缺少必要的 Word 数据流，无法解析")
    return ole.openstream(stream_name).read()


def _get_doc_piece_table(word_stream: bytes) -> tuple[str, int, int]:
    try:
        flags = struct.unpack_from("<H", word_stream, 10)[0]
        csw = struct.unpack_from("<H", word_stream, 32)[0]
    except struct.error as exc:
        raise ValueError("当前 .doc 文档头信息不完整，无法解析") from exc

    fib_pos = 34 + csw * 2
    try:
        cslw = struct.unpack_from("<H", word_stream, fib_pos)[0]
        fib_pos += 2 + cslw * 4
        cb_rg_fc_lcb = struct.unpack_from("<H", word_stream, fib_pos)[0]
        fib_pos += 2
    except struct.error as exc:
        raise ValueError("当前 .doc 文档索引区损坏，无法解析") from exc

    fib_rg_fc_lcb = word_stream[fib_pos:fib_pos + cb_rg_fc_lcb * 8]
    if len(fib_rg_fc_lcb) < DOC_CLX_OFFSET_IN_FIB + 8:
        raise ValueError("当前 .doc 文档缺少 CLX 索引，无法解析正文")

    fc_clx, lcb_clx = struct.unpack_from("<II", fib_rg_fc_lcb, DOC_CLX_OFFSET_IN_FIB)
    table_stream_name = "1Table" if ((flags >> 9) & 1) else "0Table"
    return table_stream_name, fc_clx, lcb_clx


def _extract_doc_text(content: bytes) -> str:
    try:
        ole = olefile.OleFileIO(BytesIO(content))
    except OSError as exc:
        raise ValueError("当前文件不是有效的 .doc 文档，无法解析") from exc

    try:
        if not ole.exists(DOC_WORD_STREAM):
            raise ValueError("当前文件不是有效的 Word .doc 文档，缺少 WordDocument 数据流")

        word_stream = _open_ole_stream(ole, DOC_WORD_STREAM)
        table_stream_name, fc_clx, lcb_clx = _get_doc_piece_table(word_stream)
        table_stream = _open_ole_stream(ole, table_stream_name)
        clx = table_stream[fc_clx:fc_clx + lcb_clx]
        if not clx:
            raise ValueError("当前 .doc 文档正文索引为空，无法解析")

        position = 0
        while position < len(clx) and clx[position] == 0x01:
            if position + 3 > len(clx):
                raise ValueError("当前 .doc 文档格式异常，属性区不完整")
            cb_grpprl = struct.unpack_from("<H", clx, position + 1)[0]
            position += 3 + cb_grpprl

        if position + 5 > len(clx) or clx[position] != 0x02:
            raise ValueError("当前 .doc 文档缺少正文片段表，无法解析")

        lcb_plcpcd = struct.unpack_from("<I", clx, position + 1)[0]
        plcpcd = clx[position + 5:position + 5 + lcb_plcpcd]
        if len(plcpcd) != lcb_plcpcd or lcb_plcpcd < 4:
            raise ValueError("当前 .doc 文档正文片段表不完整，无法解析")

        piece_count = (lcb_plcpcd - 4) // 12
        if piece_count <= 0:
            raise ValueError("当前 .doc 文档未找到正文片段，无法解析")

        cps = struct.unpack_from(f"<{piece_count + 1}I", plcpcd, 0)
        pcd_offset = 4 * (piece_count + 1)

        chunks: list[str] = []
        for index in range(piece_count):
            cp_start = cps[index]
            cp_end = cps[index + 1]
            char_count = cp_end - cp_start
            if char_count <= 0:
                continue

            pcd = plcpcd[pcd_offset + index * 8:pcd_offset + (index + 1) * 8]
            if len(pcd) < 8:
                raise ValueError("当前 .doc 文档片段信息不完整，无法解析")

            fc_flag = struct.unpack_from("<I", pcd, 2)[0]
            is_compressed = bool(fc_flag & 0x40000000)
            fc = fc_flag & 0x3FFFFFFF

            if is_compressed:
                byte_start = fc // 2
                byte_end = byte_start + char_count
                chunk = word_stream[byte_start:byte_end]
                chunks.append(chunk.decode("cp1252", errors="ignore"))
                continue

            byte_start = fc
            byte_end = byte_start + char_count * 2
            chunk = word_stream[byte_start:byte_end]
            chunks.append(chunk.decode("utf-16le", errors="ignore"))

        text = "".join(chunks)
        if not text.strip():
            raise ValueError("当前 .doc 文档未提取到可解析文本")
        return text
    finally:
        ole.close()


def _extract_blocks_from_doc(content: bytes) -> list[dict[str, object]]:
    raw_text = _extract_doc_text(content)
    cleaned_text = raw_text.replace("\x13", " ").replace("\x14", " ").replace("\x15", " ")
    for source, target in DOC_CONTROL_TO_NEWLINE.items():
        cleaned_text = cleaned_text.replace(source, target)

    cleaned_text = cleaned_text.replace("\x01", " ").replace("\x02", " ").replace("\x03", " ")
    cleaned_text = re.sub(r"[\x00-\x08\x0e-\x1f]", " ", cleaned_text)

    blocks: list[dict[str, object]] = []
    for line in cleaned_text.split("\n"):
        text = _normalize_space(line)
        if not text:
            continue
        if any(token in text for token in DOC_NOISE_TOKENS):
            continue
        blocks.append(
            {
                "kind": "paragraph",
                "text": text,
                "is_heading": False,
                "style_name": "legacy-doc",
            }
        )

    return blocks


def _build_sections(blocks: list[dict[str, object]]) -> list[dict[str, object]]:
    sections: list[dict[str, object]] = []
    current: dict[str, object] | None = None

    for block in blocks:
        text = str(block["text"])
        match = SECTION_RE.match(text)
        if match:
            current = {
                "number": match.group(1),
                "title": _normalize_section_title(match.group(2)),
                "blocks": [],
            }
            sections.append(current)
            continue

        title_key = _normalize_section_title_key(text)
        section_number = TITLE_ONLY_SECTION_ALIASES.get(title_key)
        if section_number:
            current = {
                "number": section_number,
                "title": _normalize_section_title(text),
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

        if _normalize_section_title_key(text) in TITLE_ONLY_SECTION_ALIASES:
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


def _detect_requirement_document_type(content: bytes, filename: str | None = None) -> str:
    content_type = detect_word_content_type(content)
    file_type = detect_file_type(filename or "") if filename else "unknown"

    if content_type in {"doc", "docx"}:
        return content_type
    if file_type in {"doc", "docx"}:
        return file_type
    raise ValueError("当前文件不是有效的 Word 需求文档，请上传 .doc 或 .docx")


def parse_requirement_document(content: bytes, filename: str | None = None) -> dict:
    document_type = _detect_requirement_document_type(content, filename)
    if document_type == "doc":
        blocks = _extract_blocks_from_doc(content)
    else:
        blocks = _extract_blocks_from_docx(content)

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
        "document_type": document_type,
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

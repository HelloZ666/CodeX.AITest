"""Persistence and comparison helpers for project-scoped PDF checks."""

from __future__ import annotations

import base64
import difflib
import json
import os
import re
import sqlite3
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Any

import fitz

from services.database import get_db_path


PDF_CHECK_RESULTS = {"passed", "failed"}
WORD_TOKEN_RE = re.compile(r"\w+|[^\w\s]", flags=re.UNICODE)
DIFF_TOKEN_RE = re.compile(r"[\u4e00-\u9fff]|[A-Za-z0-9]+|[^\w\s]", flags=re.UNICODE)
PDF_PREVIEW_TARGET_WIDTH = 860.0
PDF_PREVIEW_MAX_ZOOM = 1.8
PDF_PREVIEW_JPEG_QUALITY = 78
PAGE_IMAGE_FIELDS = ("image_data_url", "image_width", "image_height", "image_scale")
DEFAULT_VARIABLE_KEYWORDS = (
    "保单号",
    "投保单号",
    "保险单号",
    "姓名",
    "性别",
    "出生日期",
    "证件",
    "身份证",
    "手机",
    "电话",
    "邮箱",
    "年龄",
    "职业",
    "身高",
    "体重",
    "保费",
    "金额",
    "份数",
    "保额",
    "账号",
    "银行卡",
    "生效日期",
    "终止日期",
)
DEFAULT_VARIABLE_PATTERNS = (
    r"\d{8,}",
    r"\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?",
    r"\d{15}|\d{17}[\dXx]",
    r"1[3-9]\d{9}",
    r"[\u4e00-\u9fa5]{2,}(?:省|自治区|特别行政区)?[\u4e00-\u9fa5]{2,}(?:市|自治州|地区|盟)[\u4e00-\u9fa5]{1,}(?:区|县|市|旗)[\u4e00-\u9fa5A-Za-z0-9（）()#号弄路街道镇乡村室单元栋幢座期\-]*",
    r"\d+(?:\.\d+)?元",
)
DEFAULT_ADDRESS_PATTERNS = (
    r"[\u4e00-\u9fa5]{2,}(?:省|自治区|特别行政区)?[\u4e00-\u9fa5]{2,}(?:市|自治州|地区|盟)[\u4e00-\u9fa5]{1,}(?:区|县|市|旗)[\u4e00-\u9fa5A-Za-z0-9（）()#号弄路街道镇乡村室单元栋幢座期\-]*",
)
DEFAULT_FIELD_CONTEXT_PATTERNS = (
    r"姓名[:：]?[·\u4e00-\u9fa5]{2,8}(?=(?:性别|婚姻|国籍|地区|出生|证件|有效|固定|手机|E[-－]?Mail|邮箱|联系|职业|职业代码|$))",
)


def ensure_pdf_check_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS pdf_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_size INTEGER NOT NULL,
            content BLOB NOT NULL,
            extraction_json TEXT NOT NULL,
            page_count INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            operator_user_id INTEGER,
            operator_username VARCHAR(100),
            operator_display_name VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS pdf_check_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            template_id INTEGER REFERENCES pdf_templates(id) ON DELETE SET NULL,
            test_version VARCHAR(100) NOT NULL,
            template_name VARCHAR(255) NOT NULL,
            template_file_name VARCHAR(255) NOT NULL,
            candidate_file_name VARCHAR(255) NOT NULL,
            candidate_file_size INTEGER NOT NULL,
            check_type VARCHAR(20) NOT NULL DEFAULT 'file',
            prompt_template_key VARCHAR(100),
            source_policy_code VARCHAR(100),
            target_policy_code VARCHAR(100),
            source_file_url TEXT,
            target_file_url TEXT,
            system_result VARCHAR(20) NOT NULL,
            final_result VARCHAR(20) NOT NULL,
            result_source VARCHAR(20) NOT NULL DEFAULT 'system',
            diff_count INTEGER DEFAULT 0,
            ignored_diff_count INTEGER DEFAULT 0,
            ocr_used INTEGER DEFAULT 0,
            ocr_available INTEGER DEFAULT 1,
            extraction_warning TEXT DEFAULT '',
            variable_rules_json TEXT NOT NULL DEFAULT '{}',
            ai_analysis_json TEXT NOT NULL DEFAULT '{}',
            template_snapshot_json TEXT NOT NULL,
            candidate_snapshot_json TEXT NOT NULL,
            diff_items_json TEXT NOT NULL,
            template_content BLOB,
            candidate_content BLOB,
            manual_history_json TEXT NOT NULL DEFAULT '[]',
            ocr_corrections_json TEXT NOT NULL DEFAULT '[]',
            operator_user_id INTEGER,
            operator_username VARCHAR(100),
            operator_display_name VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_pdf_templates_project
            ON pdf_templates(project_id, is_deleted, updated_at);
        CREATE INDEX IF NOT EXISTS idx_pdf_check_records_project
            ON pdf_check_records(project_id, created_at);
        """
    )
    columns = {
        row[1]
        for row in conn.execute("PRAGMA table_info(pdf_check_records)").fetchall()
    }
    if "candidate_content" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN candidate_content BLOB")
    if "ignored_diff_count" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN ignored_diff_count INTEGER DEFAULT 0")
    if "variable_rules_json" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN variable_rules_json TEXT NOT NULL DEFAULT '{}'")
    if "check_type" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN check_type VARCHAR(20) NOT NULL DEFAULT 'file'")
    if "prompt_template_key" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN prompt_template_key VARCHAR(100)")
    if "source_policy_code" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN source_policy_code VARCHAR(100)")
    if "target_policy_code" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN target_policy_code VARCHAR(100)")
    if "source_file_url" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN source_file_url TEXT")
    if "target_file_url" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN target_file_url TEXT")
    if "ai_analysis_json" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN ai_analysis_json TEXT NOT NULL DEFAULT '{}'")
    if "template_content" not in columns:
        conn.execute("ALTER TABLE pdf_check_records ADD COLUMN template_content BLOB")


def _get_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {key: row[key] for key in row.keys()}


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_loads(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    return json.loads(value)


def _now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_pdf_name(name: str | None, file_name: str) -> str:
    normalized = _clean_text(name)
    if normalized:
        return normalized[:255]
    return (Path(file_name).stem or "PDF模板")[:255]


def _operator_fields(operator: dict[str, Any] | None) -> dict[str, Any]:
    return {
        "operator_user_id": operator.get("id") if operator else None,
        "operator_username": operator.get("username") if operator else None,
        "operator_display_name": operator.get("display_name") if operator else None,
    }


def _serialize_template(
    row: sqlite3.Row | dict[str, Any],
    *,
    include_content: bool = False,
    include_extraction: bool = False,
) -> dict[str, Any]:
    data = _row_to_dict(row) if isinstance(row, sqlite3.Row) else dict(row)
    serialized = {
        "id": data["id"],
        "project_id": data["project_id"],
        "project_name": data.get("project_name"),
        "name": data["name"],
        "file_name": data["file_name"],
        "file_size": data["file_size"],
        "page_count": data.get("page_count") or 0,
        "is_deleted": bool(data.get("is_deleted")),
        "operator_user_id": data.get("operator_user_id"),
        "operator_username": data.get("operator_username"),
        "operator_display_name": data.get("operator_display_name"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
        "deleted_at": data.get("deleted_at"),
    }
    if include_content:
        serialized["content"] = data.get("content")
    if include_extraction:
        serialized["extraction"] = _json_loads(data.get("extraction_json"), {})
    return serialized


def _serialize_record(row: sqlite3.Row | dict[str, Any], *, include_detail: bool = False) -> dict[str, Any]:
    data = _row_to_dict(row) if isinstance(row, sqlite3.Row) else dict(row)
    serialized = {
        "id": data["id"],
        "project_id": data["project_id"],
        "project_name": data.get("project_name"),
        "template_id": data.get("template_id"),
        "test_version": data.get("test_version") or "",
        "template_name": data.get("template_name") or "",
        "template_file_name": data.get("template_file_name") or "",
        "candidate_file_name": data.get("candidate_file_name") or "",
        "candidate_file_size": data.get("candidate_file_size") or 0,
        "check_type": data.get("check_type") or "file",
        "prompt_template_key": data.get("prompt_template_key"),
        "source_policy_code": data.get("source_policy_code"),
        "target_policy_code": data.get("target_policy_code"),
        "source_file_url": data.get("source_file_url"),
        "target_file_url": data.get("target_file_url"),
        "system_result": data.get("system_result") or "failed",
        "final_result": data.get("final_result") or "failed",
        "result_source": data.get("result_source") or "system",
        "diff_count": data.get("diff_count") or 0,
        "ignored_diff_count": data.get("ignored_diff_count") or 0,
        "ocr_used": bool(data.get("ocr_used")),
        "ocr_available": bool(data.get("ocr_available")),
        "extraction_warning": data.get("extraction_warning") or "",
        "operator_user_id": data.get("operator_user_id"),
        "operator_username": data.get("operator_username"),
        "operator_display_name": data.get("operator_display_name"),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }
    if include_detail:
        serialized.update(
            {
                "template_snapshot": _json_loads(data.get("template_snapshot_json"), {}),
                "candidate_snapshot": _json_loads(data.get("candidate_snapshot_json"), {}),
                "diff_items": _json_loads(data.get("diff_items_json"), []),
                "variable_rules": _json_loads(data.get("variable_rules_json"), {}),
                "ai_analysis": _json_loads(data.get("ai_analysis_json"), {}),
                "manual_history": _json_loads(data.get("manual_history_json"), []),
                "ocr_corrections": _json_loads(data.get("ocr_corrections_json"), []),
            }
        )
    return serialized


def _normalize_word_tuple(raw_word: Any, page_number: int, index: int) -> dict[str, Any] | None:
    if len(raw_word) < 5:
        return None
    text = _clean_text(raw_word[4])
    if not text:
        return None
    block_no = int(raw_word[5]) if len(raw_word) > 5 and isinstance(raw_word[5], (int, float)) else 0
    line_no = int(raw_word[6]) if len(raw_word) > 6 and isinstance(raw_word[6], (int, float)) else index
    word_no = int(raw_word[7]) if len(raw_word) > 7 and isinstance(raw_word[7], (int, float)) else index
    return {
        "id": f"p{page_number}-w{index}",
        "text": text,
        "bbox": [round(float(raw_word[i]), 2) for i in range(4)],
        "block": block_no,
        "line": line_no,
        "word": word_no,
    }


def _extract_page_words(page: fitz.Page) -> tuple[list[Any], bool, str | None]:
    try:
        words = page.get_text("words", sort=True)
    except Exception as exc:  # pragma: no cover - depends on PDF internals
        return [], False, f"文本提取失败：{exc}"
    if words:
        return words, False, None

    if not hasattr(page, "get_textpage_ocr"):
        return [], False, "当前 PyMuPDF 环境不支持 OCR"

    try:
        text_page = page.get_textpage_ocr(language="chi_sim+eng", dpi=200, full=True)
        ocr_words = page.get_text("words", textpage=text_page, sort=True)
        return ocr_words, bool(ocr_words), None if ocr_words else "OCR 未识别到文字"
    except Exception as exc:
        return [], False, f"OCR 识别失败：{exc}"


def _render_page_preview(page: fitz.Page) -> dict[str, Any]:
    page_width = max(float(page.rect.width), 1.0)
    zoom = min(PDF_PREVIEW_MAX_ZOOM, max(1.0, PDF_PREVIEW_TARGET_WIDTH / page_width))
    pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    image_bytes = pixmap.tobytes("jpeg", jpg_quality=PDF_PREVIEW_JPEG_QUALITY)
    return {
        "image_data_url": f"data:image/jpeg;base64,{base64.b64encode(image_bytes).decode('ascii')}",
        "image_width": pixmap.width,
        "image_height": pixmap.height,
        "image_scale": round(zoom, 4),
    }


def _snapshot_has_page_images(snapshot: dict[str, Any]) -> bool:
    pages = snapshot.get("pages") or []
    return bool(pages) and all(page.get("image_data_url") for page in pages)


def _merge_page_images(target_snapshot: dict[str, Any], source_snapshot: dict[str, Any]) -> dict[str, Any]:
    next_snapshot = deepcopy(target_snapshot)
    source_pages = {
        int(page.get("page_number") or 0): page
        for page in source_snapshot.get("pages") or []
    }
    for page in next_snapshot.get("pages") or []:
        if page.get("image_data_url"):
            continue
        source_page = source_pages.get(int(page.get("page_number") or 0))
        if not source_page:
            continue
        for field in PAGE_IMAGE_FIELDS:
            if source_page.get(field) is not None:
                page[field] = source_page[field]
    return next_snapshot


def _persist_pdf_check_record_snapshots(
    record_id: int,
    template_snapshot: dict[str, Any],
    candidate_snapshot: dict[str, Any],
) -> None:
    conn = _get_connection()
    try:
        conn.execute(
            """
            UPDATE pdf_check_records
            SET template_snapshot_json = ?, candidate_snapshot_json = ?
            WHERE id = ?
            """,
            (_json_dumps(template_snapshot), _json_dumps(candidate_snapshot), record_id),
        )
        conn.commit()
    finally:
        conn.close()


def extract_pdf_snapshot(content: bytes, file_name: str) -> dict[str, Any]:
    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:
        raise ValueError(f"PDF文件无法打开：{exc}") from exc

    warnings: list[str] = []
    pages: list[dict[str, Any]] = []
    ocr_used = False
    ocr_available = True

    try:
        for page_index, page in enumerate(document):
            page_number = page_index + 1
            raw_words, page_ocr_used, warning = _extract_page_words(page)
            if warning:
                warnings.append(f"第 {page_number} 页{warning}")
                if "OCR" in warning:
                    ocr_available = False
            ocr_used = ocr_used or page_ocr_used
            words = [
                word
                for word in (
                    _normalize_word_tuple(raw_word, page_number, index)
                    for index, raw_word in enumerate(raw_words)
                )
                if word is not None
            ]
            page_text = " ".join(word["text"] for word in words)
            try:
                preview = _render_page_preview(page)
            except Exception as exc:  # pragma: no cover - depends on PDF rendering internals
                warnings.append(f"第 {page_number} 页预览图生成失败：{exc}")
                preview = {}
            pages.append(
                {
                    "page_number": page_number,
                    "width": round(float(page.rect.width), 2),
                    "height": round(float(page.rect.height), 2),
                    "text": page_text,
                    "words": words,
                    "extraction_method": "ocr" if page_ocr_used else "text",
                    "ocr_corrected": False,
                    **preview,
                }
            )
    finally:
        document.close()

    return {
        "file_name": file_name,
        "page_count": len(pages),
        "pages": pages,
        "ocr_used": ocr_used,
        "ocr_available": ocr_available,
        "warnings": warnings,
    }


def _flatten_words(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for page in snapshot.get("pages") or []:
        page_number = int(page.get("page_number") or 0)
        for word in page.get("words") or []:
            text = _clean_text(word.get("text"))
            if not text:
                continue
            flattened.append({"page_number": page_number, **word, "text": text})
    return flattened


def _split_word_for_diff(word: dict[str, Any]) -> list[dict[str, Any]]:
    text = _clean_text(word.get("text"))
    if not text:
        return []
    matches = list(DIFF_TOKEN_RE.finditer(text))
    if not matches:
        matches = [re.match(r".+", text)]  # type: ignore[list-item]

    bbox = word.get("bbox") or [0, 0, 0, 0]
    try:
        x0, y0, x1, y1 = [float(value) for value in bbox[:4]]
    except (TypeError, ValueError):
        x0, y0, x1, y1 = 0.0, 0.0, 0.0, 0.0
    char_width = (x1 - x0) / max(len(text), 1)
    source_id = str(word.get("id") or "")
    tokens: list[dict[str, Any]] = []

    for token_index, match in enumerate(match for match in matches if match is not None):
        token_text = _clean_text(match.group(0))
        if not token_text:
            continue
        token_x0 = x0 + (match.start() * char_width)
        token_x1 = x0 + (match.end() * char_width)
        token_word = dict(word)
        token_word.update(
            {
                "id": f"{source_id}-t{token_index}" if len(matches) > 1 else source_id,
                "text": token_text,
                "bbox": [
                    round(token_x0, 2),
                    round(y0, 2),
                    round(max(token_x1, token_x0 + 1.0), 2),
                    round(y1, 2),
                ],
                "source_word_id": source_id,
                "token_index": token_index,
            }
        )
        tokens.append(token_word)
    return tokens or [word]


def _build_diff_view(snapshot: dict[str, Any]) -> dict[str, Any]:
    next_snapshot = deepcopy(snapshot)
    for page in next_snapshot.get("pages") or []:
        tokenized_words: list[dict[str, Any]] = []
        for word in page.get("words") or []:
            tokenized_words.extend(_split_word_for_diff(word))
        page["words"] = tokenized_words
    _clear_word_statuses(next_snapshot)
    return next_snapshot


def _page_words(snapshot: dict[str, Any], page_number: int) -> list[dict[str, Any]]:
    for page in snapshot.get("pages") or []:
        if int(page.get("page_number") or 0) == page_number:
            words = []
            for word in page.get("words") or []:
                text = _clean_text(word.get("text"))
                if text:
                    words.append({"page_number": page_number, **word, "text": text})
            return words
    return []


def _set_word_status(snapshot: dict[str, Any], word_id: str, status: str) -> None:
    for page in snapshot.get("pages") or []:
        for word in page.get("words") or []:
            if word.get("id") == word_id:
                word["diff_status"] = status
                return


def _mark_words(snapshot: dict[str, Any], words: list[dict[str, Any]], status: str) -> None:
    for word in words:
        _set_word_status(snapshot, str(word.get("id")), status)


def _clear_word_statuses(snapshot: dict[str, Any]) -> None:
    for page in snapshot.get("pages") or []:
        for word in page.get("words") or []:
            word.pop("diff_status", None)


def _unextractable_pages(snapshot: dict[str, Any]) -> list[int]:
    pages: list[int] = []
    for page in snapshot.get("pages") or []:
        if not page.get("words"):
            pages.append(int(page.get("page_number") or 0))
    return [page for page in pages if page > 0]


def normalize_variable_rules(raw_rules: Any) -> dict[str, Any]:
    if not isinstance(raw_rules, dict):
        raw_rules = {}
    regions: list[dict[str, Any]] = []
    for index, region in enumerate(raw_rules.get("regions") or []):
        if not isinstance(region, dict):
            continue
        try:
            x = max(0.0, min(100.0, float(region.get("x", 0))))
            y = max(0.0, min(100.0, float(region.get("y", 0))))
            width = max(0.0, min(100.0 - x, float(region.get("width", 0))))
            height = max(0.0, min(100.0 - y, float(region.get("height", 0))))
        except (TypeError, ValueError):
            continue
        if width <= 0 or height <= 0:
            continue
        page_number = region.get("page_number")
        try:
            normalized_page_number = int(page_number) if page_number not in (None, "", 0, "0") else None
        except (TypeError, ValueError):
            normalized_page_number = None
        regions.append(
            {
                "id": str(region.get("id") or f"region-{index + 1}")[:80],
                "name": _clean_text(region.get("name"))[:80] or f"变量区域{index + 1}",
                "page_number": normalized_page_number,
                "x": round(x, 2),
                "y": round(y, 2),
                "width": round(width, 2),
                "height": round(height, 2),
            }
        )

    keywords = [
        _clean_text(keyword)[:80]
        for keyword in raw_rules.get("keywords") or []
        if _clean_text(keyword)
    ][:80]
    regexes = [
        _clean_text(pattern)[:240]
        for pattern in raw_rules.get("regexes") or []
        if _clean_text(pattern)
    ][:80]

    return {
        "enabled": bool(raw_rules.get("enabled")),
        "use_builtin": bool(raw_rules.get("use_builtin", True)),
        "keywords": keywords,
        "regexes": regexes,
        "regions": regions,
    }


def _compile_patterns(patterns: list[str] | tuple[str, ...]) -> list[re.Pattern[str]]:
    compiled: list[re.Pattern[str]] = []
    for pattern in patterns:
        try:
            compiled.append(re.compile(pattern))
        except re.error:
            continue
    return compiled


def _word_bbox(word: dict[str, Any]) -> list[float] | None:
    bbox = word.get("bbox") or []
    if len(bbox) < 4:
        return None
    try:
        return [float(value) for value in bbox[:4]]
    except (TypeError, ValueError):
        return None


def _segment_bbox(words: list[dict[str, Any]]) -> list[float] | None:
    boxes = [bbox for bbox in (_word_bbox(word) for word in words) if bbox is not None]
    if not boxes:
        return None
    return [
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    ]


def _page_map(snapshot: dict[str, Any]) -> dict[int, dict[str, Any]]:
    return {
        int(page.get("page_number") or 0): page
        for page in snapshot.get("pages") or []
        if int(page.get("page_number") or 0) > 0
    }


def _words_in_region(
    words: list[dict[str, Any]],
    pages: dict[int, dict[str, Any]],
    region: dict[str, Any],
) -> bool:
    region_page = region.get("page_number")
    for word in words:
        page_number = int(word.get("page_number") or 0)
        if region_page is not None and page_number != int(region_page):
            continue
        page = pages.get(page_number)
        bbox = _word_bbox(word)
        if page is None or bbox is None:
            continue
        page_width = max(float(page.get("width") or 1), 1.0)
        page_height = max(float(page.get("height") or 1), 1.0)
        center_x = ((bbox[0] + bbox[2]) / 2 / page_width) * 100
        center_y = ((bbox[1] + bbox[3]) / 2 / page_height) * 100
        if (
            float(region["x"]) <= center_x <= float(region["x"]) + float(region["width"])
            and float(region["y"]) <= center_y <= float(region["y"]) + float(region["height"])
        ):
            return True
    return False


def _nearby_page_text(snapshot: dict[str, Any], page_number: int, bbox: list[float] | None) -> str:
    if bbox is None:
        return ""
    x0, y0, x1, y1 = bbox
    expanded = [x0 - 80, y0 - 18, x1 + 80, y1 + 18]
    pieces: list[str] = []
    for page in snapshot.get("pages") or []:
        if int(page.get("page_number") or 0) != page_number:
            continue
        for word in page.get("words") or []:
            word_bbox = _word_bbox(word)
            if word_bbox is None:
                continue
            center_x = (word_bbox[0] + word_bbox[2]) / 2
            center_y = (word_bbox[1] + word_bbox[3]) / 2
            if expanded[0] <= center_x <= expanded[2] and expanded[1] <= center_y <= expanded[3]:
                pieces.append(_clean_text(word.get("text")))
    return " ".join(piece for piece in pieces if piece)


def _line_context_text(snapshot: dict[str, Any], page_number: int, words: list[dict[str, Any]]) -> str:
    if not words:
        return ""
    line_keys = {
        (word.get("block"), word.get("line"))
        for word in words
        if word.get("block") is not None and word.get("line") is not None
    }
    if not line_keys:
        return ""
    pieces: list[str] = []
    for page in snapshot.get("pages") or []:
        if int(page.get("page_number") or 0) != page_number:
            continue
        for word in page.get("words") or []:
            if (word.get("block"), word.get("line")) in line_keys:
                pieces.append(_clean_text(word.get("text")))
    return " ".join(piece for piece in pieces if piece)


def _page_context_text(snapshot: dict[str, Any], page_number: int) -> str:
    for page in snapshot.get("pages") or []:
        if int(page.get("page_number") or 0) != page_number:
            continue
        page_text = _clean_text(page.get("text"))
        if page_text:
            return page_text
        return " ".join(
            _clean_text(word.get("text"))
            for word in page.get("words") or []
            if _clean_text(word.get("text"))
        )
    return ""


def _matches_any_pattern(text: str, patterns: list[re.Pattern[str]]) -> bool:
    return any(pattern.search(text) for pattern in patterns)


def _segment_text_matches_context_patterns(
    segment_text: str,
    context_text: str,
    patterns: list[re.Pattern[str]],
) -> bool:
    compact_segment_text = re.sub(r"\s+", "", segment_text)
    compact_context_text = re.sub(r"\s+", "", context_text)
    if not compact_segment_text or not compact_context_text:
        return False
    return any(
        compact_segment_text in match.group(0)
        for pattern in patterns
        for match in pattern.finditer(compact_context_text)
    )


def _diff_matches_line_context_patterns(
    *,
    template_snapshot: dict[str, Any],
    candidate_snapshot: dict[str, Any],
    template_segment: list[dict[str, Any]],
    candidate_segment: list[dict[str, Any]],
    template_text: str,
    candidate_text: str,
    page_number: int,
    patterns: list[re.Pattern[str]],
) -> bool:
    return (
        _segment_text_matches_context_patterns(
            template_text,
            _line_context_text(template_snapshot, page_number, template_segment),
            patterns,
        )
        or _segment_text_matches_context_patterns(
            candidate_text,
            _line_context_text(candidate_snapshot, page_number, candidate_segment),
            patterns,
        )
    )


def _diff_matches_page_context_patterns(
    *,
    template_snapshot: dict[str, Any],
    candidate_snapshot: dict[str, Any],
    template_text: str,
    candidate_text: str,
    page_number: int,
    patterns: list[re.Pattern[str]],
) -> bool:
    return (
        _segment_text_matches_context_patterns(
            template_text,
            _page_context_text(template_snapshot, page_number),
            patterns,
        )
        or _segment_text_matches_context_patterns(
            candidate_text,
            _page_context_text(candidate_snapshot, page_number),
            patterns,
        )
    )


def _looks_like_variable_text(text: str) -> bool:
    normalized = re.sub(r"\s+", "", text)
    if not normalized:
        return False
    if len(normalized) >= 6 and re.search(r"\d", normalized):
        return True
    if re.fullmatch(r"[\dXx年月日./:\-]+", normalized):
        return True
    if re.fullmatch(r"[\d,.]+(?:元|万元|份|年|月|日)?", normalized):
        return True
    return False


def _should_ignore_diff(
    *,
    template_snapshot: dict[str, Any],
    candidate_snapshot: dict[str, Any],
    template_segment: list[dict[str, Any]],
    candidate_segment: list[dict[str, Any]],
    page_number: int,
    variable_rules: dict[str, Any],
) -> tuple[bool, str]:
    if not variable_rules.get("enabled"):
        return False, ""

    words = [*template_segment, *candidate_segment]
    template_text = " ".join(word["text"] for word in template_segment)
    candidate_text = " ".join(word["text"] for word in candidate_segment)
    diff_text = f"{template_text} {candidate_text}".strip()
    compact_diff_text = re.sub(r"\s+", "", diff_text)

    template_pages = _page_map(template_snapshot)
    candidate_pages = _page_map(candidate_snapshot)
    for region in variable_rules.get("regions") or []:
        if _words_in_region(template_segment, template_pages, region) or _words_in_region(candidate_segment, candidate_pages, region):
            return True, f"命中变量区域：{region.get('name') or '自定义区域'}"

    user_patterns = _compile_patterns(variable_rules.get("regexes") or [])
    if user_patterns and _matches_any_pattern(compact_diff_text, user_patterns):
        return True, "命中自定义正则"

    if variable_rules.get("use_builtin", True) and len(compact_diff_text) <= 160:
        address_patterns = _compile_patterns(DEFAULT_ADDRESS_PATTERNS)
        if _diff_matches_line_context_patterns(
            template_snapshot=template_snapshot,
            candidate_snapshot=candidate_snapshot,
            template_segment=template_segment,
            candidate_segment=candidate_segment,
            template_text=template_text,
            candidate_text=candidate_text,
            page_number=page_number,
            patterns=address_patterns,
        ):
            return True, "命中内置地址格式"

        field_context_patterns = _compile_patterns(DEFAULT_FIELD_CONTEXT_PATTERNS)
        if _diff_matches_page_context_patterns(
            template_snapshot=template_snapshot,
            candidate_snapshot=candidate_snapshot,
            template_text=template_text,
            candidate_text=candidate_text,
            page_number=page_number,
            patterns=field_context_patterns,
        ):
            return True, "命中内置字段格式"

    keywords = list(variable_rules.get("keywords") or [])
    if variable_rules.get("use_builtin", True):
        keywords.extend(DEFAULT_VARIABLE_KEYWORDS)
    normalized_keywords = [keyword for keyword in keywords if keyword]
    template_bbox = _segment_bbox(template_segment)
    candidate_bbox = _segment_bbox(candidate_segment)
    context_text = " ".join(
        piece
        for piece in (
            _nearby_page_text(template_snapshot, page_number, template_bbox),
            _nearby_page_text(candidate_snapshot, page_number, candidate_bbox),
        )
        if piece
    )
    if normalized_keywords and any(keyword in context_text or keyword in compact_diff_text for keyword in normalized_keywords):
        if len(compact_diff_text) <= 160:
            return True, "命中变量字段关键字"

    if variable_rules.get("use_builtin", True):
        builtin_patterns = _compile_patterns(DEFAULT_VARIABLE_PATTERNS)
        if len(compact_diff_text) <= 80 and (
            _matches_any_pattern(compact_diff_text, builtin_patterns)
            or _looks_like_variable_text(compact_diff_text)
        ):
            return True, "命中内置变量格式"

    return False, ""


def compare_pdf_snapshots(
    template_snapshot: dict[str, Any],
    candidate_snapshot: dict[str, Any],
    variable_rules: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_variable_rules = normalize_variable_rules(variable_rules)
    template_view = _build_diff_view(template_snapshot)
    candidate_view = _build_diff_view(candidate_snapshot)

    diff_items: list[dict[str, Any]] = []
    diff_index = 1
    template_page_count = int(template_snapshot.get("page_count") or 0)
    candidate_page_count = int(candidate_snapshot.get("page_count") or 0)

    if template_page_count != candidate_page_count:
        diff_items.append(
            {
                "id": f"d{diff_index}",
                "type": "page_count",
                "message": "页数不一致",
                "template_page_count": template_page_count,
                "candidate_page_count": candidate_page_count,
            }
        )
        diff_index += 1

    for side, snapshot in (("template", template_view), ("candidate", candidate_view)):
        for page_number in _unextractable_pages(snapshot):
            diff_items.append(
                {
                    "id": f"d{diff_index}",
                    "type": "unextractable_page",
                    "side": side,
                    "page_number": page_number,
                    "message": "页面未提取到可比对文字",
                }
            )
            diff_index += 1

    for page_number in range(1, max(template_page_count, candidate_page_count) + 1):
        template_words = _page_words(template_view, page_number)
        candidate_words = _page_words(candidate_view, page_number)
        template_tokens = [word["text"] for word in template_words]
        candidate_tokens = [word["text"] for word in candidate_words]
        matcher = difflib.SequenceMatcher(None, template_tokens, candidate_tokens, autojunk=False)

        for tag, i1, i2, j1, j2 in matcher.get_opcodes():
            if tag == "equal":
                continue

            template_segment = template_words[i1:i2]
            candidate_segment = candidate_words[j1:j2]
            ignored, ignore_reason = _should_ignore_diff(
                template_snapshot=template_view,
                candidate_snapshot=candidate_view,
                template_segment=template_segment,
                candidate_segment=candidate_segment,
                page_number=page_number,
                variable_rules=normalized_variable_rules,
            )
            word_status = "ignored" if ignored else {"delete": "missing", "insert": "extra"}.get(tag, "changed")
            if tag == "delete":
                _mark_words(template_view, template_segment, word_status)
                diff_item = {
                    "id": f"d{diff_index}",
                    "type": "missing_in_candidate",
                    "template_text": " ".join(word["text"] for word in template_segment),
                    "candidate_text": "",
                    "template_word_ids": [word["id"] for word in template_segment],
                    "candidate_word_ids": [],
                    "page_number": page_number,
                }
            elif tag == "insert":
                _mark_words(candidate_view, candidate_segment, word_status)
                diff_item = {
                    "id": f"d{diff_index}",
                    "type": "extra_in_candidate",
                    "template_text": "",
                    "candidate_text": " ".join(word["text"] for word in candidate_segment),
                    "template_word_ids": [],
                    "candidate_word_ids": [word["id"] for word in candidate_segment],
                    "page_number": page_number,
                }
            else:
                _mark_words(template_view, template_segment, word_status)
                _mark_words(candidate_view, candidate_segment, word_status)
                diff_item = {
                    "id": f"d{diff_index}",
                    "type": "changed",
                    "template_text": " ".join(word["text"] for word in template_segment),
                    "candidate_text": " ".join(word["text"] for word in candidate_segment),
                    "template_word_ids": [word["id"] for word in template_segment],
                    "candidate_word_ids": [word["id"] for word in candidate_segment],
                    "page_number": page_number,
                }
            if ignored:
                diff_item["ignored"] = True
                diff_item["ignore_reason"] = ignore_reason or "变量差异"
            diff_items.append(diff_item)
            diff_index += 1

    diff_count = len([item for item in diff_items if not item.get("ignored")])
    ignored_diff_count = len([item for item in diff_items if item.get("ignored")])
    return {
        "system_result": "passed" if diff_count == 0 else "failed",
        "diff_count": diff_count,
        "ignored_diff_count": ignored_diff_count,
        "diff_items": diff_items,
        "template_snapshot": template_view,
        "candidate_snapshot": candidate_view,
    }


def _build_synthetic_words(text: str, page_number: int, page_width: float, page_height: float) -> list[dict[str, Any]]:
    words: list[dict[str, Any]] = []
    line_height = 18.0
    x_step = 42.0
    y = 32.0
    for line_index, line in enumerate(text.splitlines() or [text]):
        tokens = DIFF_TOKEN_RE.findall(line)
        if not tokens and line.strip():
            tokens = [line.strip()]
        x = 32.0
        for token in tokens:
            word_index = len(words)
            width = max(18.0, min(160.0, len(token) * 12.0))
            if x + width > page_width - 24:
                x = 32.0
                y += line_height
            words.append(
                {
                    "id": f"p{page_number}-w{word_index}",
                    "text": token,
                    "bbox": [round(x, 2), round(y, 2), round(min(x + width, page_width), 2), round(y + 14.0, 2)],
                    "block": 0,
                    "line": line_index,
                    "word": word_index,
                    "synthetic": True,
                }
            )
            x += width + min(x_step, max(8.0, len(token) * 3.0))
        y += line_height
        if y > page_height - 24:
            y = page_height - 24
    return words


def apply_ocr_corrections_to_snapshot(snapshot: dict[str, Any], corrections: list[dict[str, Any]]) -> dict[str, Any]:
    next_snapshot = deepcopy(snapshot)
    page_map = {
        int(page.get("page_number") or 0): page
        for page in next_snapshot.get("pages") or []
    }
    for correction in corrections:
        page_number = int(correction["page_number"])
        page = page_map.get(page_number)
        if page is None:
            raise ValueError(f"第 {page_number} 页不存在")
        corrected_text = str(correction.get("text") or "")
        width = float(page.get("width") or 595)
        height = float(page.get("height") or 842)
        page["text"] = corrected_text
        page["words"] = _build_synthetic_words(corrected_text, page_number, width, height)
        page["extraction_method"] = "manual_ocr"
        page["ocr_corrected"] = True
    return next_snapshot


def create_pdf_template(
    *,
    project_id: int,
    name: str | None,
    file_name: str,
    content: bytes,
    operator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    snapshot = extract_pdf_snapshot(content, file_name)
    operator_values = _operator_fields(operator)
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO pdf_templates (
                project_id, name, file_name, file_size, content, extraction_json, page_count,
                operator_user_id, operator_username, operator_display_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                _normalize_pdf_name(name, file_name),
                file_name[:255],
                len(content),
                content,
                _json_dumps(snapshot),
                int(snapshot.get("page_count") or 0),
                operator_values["operator_user_id"],
                operator_values["operator_username"],
                operator_values["operator_display_name"],
            ),
        )
        conn.commit()
        return get_pdf_template(int(cursor.lastrowid))  # type: ignore[return-value]
    finally:
        conn.close()


def list_pdf_templates(
    *,
    project_id: int | None = None,
    include_deleted: bool = False,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    where_parts = []
    params: list[Any] = []
    if project_id is not None:
        where_parts.append("t.project_id = ?")
        params.append(project_id)
    if not include_deleted:
        where_parts.append("t.is_deleted = 0")
    where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    params.extend([limit, offset])
    conn = _get_connection()
    try:
        rows = conn.execute(
            f"""
            SELECT t.*, p.name AS project_name
            FROM pdf_templates t
            LEFT JOIN projects p ON p.id = t.project_id
            {where_sql}
            ORDER BY t.updated_at DESC, t.id DESC
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()
        return [_serialize_template(row) for row in rows]
    finally:
        conn.close()


def get_pdf_template(
    template_id: int,
    *,
    include_content: bool = False,
    include_extraction: bool = False,
    include_deleted: bool = False,
) -> dict[str, Any] | None:
    conn = _get_connection()
    try:
        row = conn.execute(
            """
            SELECT t.*, p.name AS project_name
            FROM pdf_templates t
            LEFT JOIN projects p ON p.id = t.project_id
            WHERE t.id = ?
            """,
            (template_id,),
        ).fetchone()
        if row is None:
            return None
        if not include_deleted and bool(row["is_deleted"]):
            return None
        return _serialize_template(row, include_content=include_content, include_extraction=include_extraction)
    finally:
        conn.close()


def get_pdf_template_preview(template_id: int, *, include_deleted: bool = False) -> dict[str, Any] | None:
    template = get_pdf_template(
        template_id,
        include_content=True,
        include_extraction=True,
        include_deleted=include_deleted,
    )
    if template is None:
        return None

    extraction = template.get("extraction") or {}
    content = template.get("content")
    if isinstance(content, (bytes, bytearray)) and not _snapshot_has_page_images(extraction):
        extraction = extract_pdf_snapshot(bytes(content), str(template.get("file_name") or "pdf-template.pdf"))
        conn = _get_connection()
        try:
            conn.execute(
                """
                UPDATE pdf_templates
                SET extraction_json = ?, page_count = ?
                WHERE id = ?
                """,
                (_json_dumps(extraction), int(extraction.get("page_count") or 0), template_id),
            )
            conn.commit()
        finally:
            conn.close()
        template["extraction"] = extraction
        template["page_count"] = int(extraction.get("page_count") or 0)

    template.pop("content", None)
    return template


def logical_delete_pdf_template(template_id: int) -> bool:
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            UPDATE pdf_templates
            SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND is_deleted = 0
            """,
            (template_id,),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def create_pdf_check_record(
    *,
    project_id: int,
    test_version: str,
    template_id: int,
    candidate_file_name: str,
    candidate_content: bytes,
    variable_rules: dict[str, Any] | None = None,
    operator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    template = get_pdf_template_preview(template_id)
    if template is None or int(template["project_id"]) != int(project_id):
        raise KeyError("PDF模板不存在")

    template_snapshot = template.get("extraction") or {}
    candidate_snapshot = extract_pdf_snapshot(candidate_content, candidate_file_name)
    normalized_variable_rules = normalize_variable_rules(variable_rules)
    comparison = compare_pdf_snapshots(template_snapshot, candidate_snapshot, normalized_variable_rules)
    warnings = [
        *(template_snapshot.get("warnings") or []),
        *(candidate_snapshot.get("warnings") or []),
    ]
    ocr_used = bool(template_snapshot.get("ocr_used")) or bool(candidate_snapshot.get("ocr_used"))
    ocr_available = bool(template_snapshot.get("ocr_available", True)) and bool(candidate_snapshot.get("ocr_available", True))
    operator_values = _operator_fields(operator)
    normalized_version = _clean_text(test_version)
    if not normalized_version:
        raise ValueError("测试版本不能为空")
    now_text = _now_text()

    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO pdf_check_records (
                project_id, template_id, test_version, template_name, template_file_name,
                candidate_file_name, candidate_file_size, system_result, final_result,
                result_source, diff_count, ignored_diff_count, ocr_used, ocr_available, extraction_warning,
                variable_rules_json,
                template_snapshot_json, candidate_snapshot_json, diff_items_json, candidate_content,
                operator_user_id, operator_username, operator_display_name, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'system', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                template_id,
                normalized_version[:100],
                template["name"],
                template["file_name"],
                candidate_file_name[:255],
                len(candidate_content),
                comparison["system_result"],
                comparison["system_result"],
                comparison["diff_count"],
                comparison["ignored_diff_count"],
                1 if ocr_used else 0,
                1 if ocr_available else 0,
                "\n".join(warnings),
                _json_dumps(normalized_variable_rules),
                _json_dumps(comparison["template_snapshot"]),
                _json_dumps(comparison["candidate_snapshot"]),
                _json_dumps(comparison["diff_items"]),
                candidate_content,
                operator_values["operator_user_id"],
                operator_values["operator_username"],
                operator_values["operator_display_name"],
                now_text,
                now_text,
            ),
        )
        conn.commit()
        return get_pdf_check_record(int(cursor.lastrowid), include_detail=True)  # type: ignore[return-value]
    finally:
        conn.close()


def create_policy_pdf_check_record(
    *,
    project_id: int,
    test_version: str,
    source_policy_code: str,
    target_policy_code: str,
    source_file_name: str,
    target_file_name: str,
    source_content: bytes,
    target_content: bytes,
    source_snapshot: dict[str, Any],
    target_snapshot: dict[str, Any],
    comparison: dict[str, Any],
    prompt_template_key: str,
    ai_analysis: dict[str, Any],
    source_file_url: str = "",
    target_file_url: str = "",
    operator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    normalized_version = _clean_text(test_version)
    if not normalized_version:
        raise ValueError("测试版本不能为空")

    normalized_source_policy_code = _clean_text(source_policy_code)
    normalized_target_policy_code = _clean_text(target_policy_code)
    if not normalized_source_policy_code or not normalized_target_policy_code:
        raise ValueError("保单号不能为空")
    if normalized_source_policy_code == normalized_target_policy_code:
        raise ValueError("两个保单号不能相同")

    system_result = _clean_text(ai_analysis.get("result")) or "failed"
    if system_result not in PDF_CHECK_RESULTS:
        raise ValueError("AI保单核对结果仅支持 passed 或 failed")

    findings = ai_analysis.get("findings") if isinstance(ai_analysis, dict) else []
    ai_issue_count = len(findings) if isinstance(findings, list) else 0
    if system_result == "passed":
        ai_issue_count = 0
    elif ai_issue_count == 0:
        ai_issue_count = max(1, int(comparison.get("diff_count") or 0))

    warnings = [
        *(source_snapshot.get("warnings") or []),
        *(target_snapshot.get("warnings") or []),
    ]
    ocr_used = bool(source_snapshot.get("ocr_used")) or bool(target_snapshot.get("ocr_used"))
    ocr_available = bool(source_snapshot.get("ocr_available", True)) and bool(target_snapshot.get("ocr_available", True))
    operator_values = _operator_fields(operator)
    variable_rules = normalize_variable_rules({"enabled": False, "use_builtin": False, "keywords": [], "regexes": [], "regions": []})
    now_text = _now_text()

    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO pdf_check_records (
                project_id, template_id, test_version, template_name, template_file_name,
                candidate_file_name, candidate_file_size, check_type, prompt_template_key,
                source_policy_code, target_policy_code, source_file_url, target_file_url,
                system_result, final_result, result_source, diff_count, ignored_diff_count,
                ocr_used, ocr_available, extraction_warning, variable_rules_json, ai_analysis_json,
                template_snapshot_json, candidate_snapshot_json, diff_items_json,
                template_content, candidate_content,
                operator_user_id, operator_username, operator_display_name, created_at, updated_at
            )
            VALUES (?, NULL, ?, ?, ?, ?, ?, 'policy', ?, ?, ?, ?, ?, ?, ?, 'system', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                normalized_version[:100],
                f"保单 {normalized_source_policy_code}"[:255],
                source_file_name[:255],
                target_file_name[:255],
                len(target_content),
                _clean_text(prompt_template_key)[:100],
                normalized_source_policy_code[:100],
                normalized_target_policy_code[:100],
                _clean_text(source_file_url),
                _clean_text(target_file_url),
                system_result,
                system_result,
                ai_issue_count,
                1 if ocr_used else 0,
                1 if ocr_available else 0,
                "\n".join(warnings),
                _json_dumps(variable_rules),
                _json_dumps(ai_analysis),
                _json_dumps(comparison.get("template_snapshot") or source_snapshot),
                _json_dumps(comparison.get("candidate_snapshot") or target_snapshot),
                _json_dumps(comparison.get("diff_items") or []),
                source_content,
                target_content,
                operator_values["operator_user_id"],
                operator_values["operator_username"],
                operator_values["operator_display_name"],
                now_text,
                now_text,
            ),
        )
        conn.commit()
        return get_pdf_check_record(int(cursor.lastrowid), include_detail=True)  # type: ignore[return-value]
    finally:
        conn.close()


def list_pdf_check_records(
    *,
    project_id: int | None = None,
    check_type: str | None = "file",
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    where_parts: list[str] = []
    params: list[Any] = []
    if project_id is not None:
        where_parts.append("r.project_id = ?")
        params.append(project_id)
    normalized_check_type = _clean_text(check_type)
    if normalized_check_type:
        where_parts.append("COALESCE(r.check_type, 'file') = ?")
        params.append(normalized_check_type)
    where_sql = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    params.extend([limit, offset])
    conn = _get_connection()
    try:
        rows = conn.execute(
            f"""
            SELECT r.*, p.name AS project_name
            FROM pdf_check_records r
            LEFT JOIN projects p ON p.id = r.project_id
            {where_sql}
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT ? OFFSET ?
            """,
            params,
        ).fetchall()
        return [_serialize_record(row) for row in rows]
    finally:
        conn.close()


def _hydrate_pdf_check_record_preview(
    record: dict[str, Any],
    candidate_content: Any = None,
    template_content: Any = None,
) -> None:
    template_snapshot = record.get("template_snapshot") or {}
    candidate_snapshot = record.get("candidate_snapshot") or {}
    snapshots_changed = False

    if not _snapshot_has_page_images(template_snapshot):
        template_id = record.get("template_id")
        if template_id is not None:
            template_preview = get_pdf_template_preview(int(template_id), include_deleted=True)
            if template_preview:
                next_template_snapshot = _merge_page_images(
                    template_snapshot,
                    template_preview.get("extraction") or {},
                )
                snapshots_changed = snapshots_changed or next_template_snapshot != template_snapshot
                template_snapshot = next_template_snapshot
        elif isinstance(template_content, (bytes, bytearray)) and template_content:
            template_preview = extract_pdf_snapshot(
                bytes(template_content),
                str(record.get("template_file_name") or "template.pdf"),
            )
            next_template_snapshot = _merge_page_images(template_snapshot, template_preview)
            snapshots_changed = snapshots_changed or next_template_snapshot != template_snapshot
            template_snapshot = next_template_snapshot

    if (
        not _snapshot_has_page_images(candidate_snapshot)
        and isinstance(candidate_content, (bytes, bytearray))
        and candidate_content
    ):
        candidate_preview = extract_pdf_snapshot(
            bytes(candidate_content),
            str(record.get("candidate_file_name") or "candidate.pdf"),
        )
        next_candidate_snapshot = _merge_page_images(candidate_snapshot, candidate_preview)
        snapshots_changed = snapshots_changed or next_candidate_snapshot != candidate_snapshot
        candidate_snapshot = next_candidate_snapshot

    record["template_snapshot"] = template_snapshot
    record["candidate_snapshot"] = candidate_snapshot
    if snapshots_changed and record.get("id") is not None:
        _persist_pdf_check_record_snapshots(int(record["id"]), template_snapshot, candidate_snapshot)


def get_pdf_check_record(record_id: int, *, include_detail: bool = False) -> dict[str, Any] | None:
    conn = _get_connection()
    try:
        row = conn.execute(
            """
            SELECT r.*, p.name AS project_name
            FROM pdf_check_records r
            LEFT JOIN projects p ON p.id = r.project_id
            WHERE r.id = ?
            """,
            (record_id,),
        ).fetchone()
        if row is None:
            return None
        record = _serialize_record(row, include_detail=include_detail)
        if include_detail:
            row_data = _row_to_dict(row)
            _hydrate_pdf_check_record_preview(
                record,
                row_data.get("candidate_content"),
                row_data.get("template_content"),
            )
        return record
    finally:
        conn.close()


def update_pdf_check_manual_result(
    record_id: int,
    *,
    final_result: str,
    note: str = "",
    operator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if final_result not in PDF_CHECK_RESULTS:
        raise ValueError("比对结果仅支持 passed 或 failed")

    existing = get_pdf_check_record(record_id, include_detail=True)
    if existing is None:
        raise KeyError("文档核对记录不存在")

    history = list(existing.get("manual_history") or [])
    history.append(
        {
            "from_result": existing.get("final_result"),
            "to_result": final_result,
            "system_result": existing.get("system_result"),
            "note": _clean_text(note),
            "operator_user_id": operator.get("id") if operator else None,
            "operator_username": operator.get("username") if operator else None,
            "operator_display_name": operator.get("display_name") if operator else None,
            "operated_at": _now_text(),
        }
    )

    conn = _get_connection()
    try:
        conn.execute(
            """
            UPDATE pdf_check_records
            SET final_result = ?, result_source = 'manual', manual_history_json = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (final_result, _json_dumps(history), _now_text(), record_id),
        )
        conn.commit()
        return get_pdf_check_record(record_id, include_detail=True)  # type: ignore[return-value]
    finally:
        conn.close()


def recompare_pdf_check_record_with_ocr_corrections(
    record_id: int,
    *,
    corrections: list[dict[str, Any]],
    operator: dict[str, Any] | None = None,
) -> dict[str, Any]:
    existing = get_pdf_check_record(record_id, include_detail=True)
    if existing is None:
        raise KeyError("文档核对记录不存在")

    template_snapshot = existing.get("template_snapshot") or {}
    candidate_snapshot = existing.get("candidate_snapshot") or {}
    template_corrections = [item for item in corrections if item.get("side") == "template"]
    candidate_corrections = [item for item in corrections if item.get("side") == "candidate"]
    if template_corrections:
        template_snapshot = apply_ocr_corrections_to_snapshot(template_snapshot, template_corrections)
    if candidate_corrections:
        candidate_snapshot = apply_ocr_corrections_to_snapshot(candidate_snapshot, candidate_corrections)

    variable_rules = existing.get("variable_rules") or {}
    comparison = compare_pdf_snapshots(template_snapshot, candidate_snapshot, variable_rules)
    previous_corrections = list(existing.get("ocr_corrections") or [])
    previous_corrections.append(
        {
            "corrections": [
                {
                    "side": item.get("side"),
                    "page_number": item.get("page_number"),
                    "text_length": len(str(item.get("text") or "")),
                }
                for item in corrections
            ],
            "previous_system_result": existing.get("system_result"),
            "next_system_result": comparison["system_result"],
            "operator_user_id": operator.get("id") if operator else None,
            "operator_username": operator.get("username") if operator else None,
            "operator_display_name": operator.get("display_name") if operator else None,
            "operated_at": _now_text(),
        }
    )

    conn = _get_connection()
    try:
        conn.execute(
            """
            UPDATE pdf_check_records
            SET system_result = ?, final_result = ?, result_source = 'system',
                diff_count = ?, ignored_diff_count = ?, template_snapshot_json = ?, candidate_snapshot_json = ?,
                diff_items_json = ?, ocr_corrections_json = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                comparison["system_result"],
                comparison["system_result"],
                comparison["diff_count"],
                comparison["ignored_diff_count"],
                _json_dumps(comparison["template_snapshot"]),
                _json_dumps(comparison["candidate_snapshot"]),
                _json_dumps(comparison["diff_items"]),
                _json_dumps(previous_corrections),
                _now_text(),
                record_id,
            ),
        )
        conn.commit()
        return get_pdf_check_record(record_id, include_detail=True)  # type: ignore[return-value]
    finally:
        conn.close()

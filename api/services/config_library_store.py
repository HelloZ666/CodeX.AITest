from __future__ import annotations

import hashlib
import json
import os
import sqlite3
from typing import Optional

from services.database import get_db_path, normalize_timestamp_fields


def _get_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS config_requirement_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_hash VARCHAR(64) NOT NULL UNIQUE,
            file_name VARCHAR(255) NOT NULL,
            file_type VARCHAR(20) NOT NULL,
            file_size INTEGER NOT NULL,
            content BLOB NOT NULL,
            project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
            source_page VARCHAR(100) NOT NULL,
            operator_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            operator_username VARCHAR(100),
            operator_display_name VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_config_requirement_documents_updated
        ON config_requirement_documents (updated_at DESC, id DESC);

        CREATE TABLE IF NOT EXISTS config_test_case_assets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content_hash VARCHAR(64) NOT NULL UNIQUE,
            asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN ('upload', 'generated')),
            name VARCHAR(255) NOT NULL,
            file_type VARCHAR(20) NOT NULL,
            file_size INTEGER NOT NULL DEFAULT 0,
            original_content BLOB,
            cases_json TEXT NOT NULL,
            case_count INTEGER DEFAULT 0,
            requirement_file_name VARCHAR(255),
            generation_mode VARCHAR(20),
            provider VARCHAR(100),
            prompt_template_key VARCHAR(100),
            iteration_version VARCHAR(100),
            project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
            source_page VARCHAR(100) NOT NULL,
            operator_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            operator_username VARCHAR(100),
            operator_display_name VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_config_test_case_assets_updated
        ON config_test_case_assets (updated_at DESC, id DESC);
        """
    )
    _ensure_config_test_case_asset_schema(conn)


def ensure_config_library_tables(conn: Optional[sqlite3.Connection] = None) -> None:
    owned_connection = conn is None
    active_conn = conn or _get_connection()
    started_in_transaction = active_conn.in_transaction
    try:
        _ensure_tables(active_conn)
        if owned_connection or not started_in_transaction:
            active_conn.commit()
    finally:
        if owned_connection:
            active_conn.close()


def _get_table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(row["name"]) for row in rows}


def _ensure_config_test_case_asset_schema(conn: sqlite3.Connection) -> None:
    columns = _get_table_columns(conn, "config_test_case_assets")
    if not columns:
        return
    if "iteration_version" not in columns:
        conn.execute(
            """
            ALTER TABLE config_test_case_assets
            ADD COLUMN iteration_version VARCHAR(100)
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict:
    return normalize_timestamp_fields(dict(row))


def _normalize_inline_text(value: object) -> str:
    return " ".join(str(value or "").split()).strip()


def _normalize_multiline_text(value: object) -> str:
    return str(value or "").replace("\r\n", "\n").strip()


def build_requirement_document_hash(parsed_document: dict) -> str:
    canonical_document = {
        "selected_mode": _normalize_inline_text(parsed_document.get("selected_mode")),
        "selected_sections": [
            {
                "number": _normalize_inline_text(section.get("number")),
                "title": _normalize_inline_text(section.get("title")),
                "block_count": int(section.get("block_count") or 0),
            }
            for section in (parsed_document.get("selected_sections") or [])
            if isinstance(section, dict)
        ],
        "all_sections": [
            {
                "number": _normalize_inline_text(section.get("number")),
                "title": _normalize_inline_text(section.get("title")),
                "block_count": int(section.get("block_count") or 0),
            }
            for section in (parsed_document.get("all_sections") or [])
            if isinstance(section, dict)
        ],
        "points": [
            {
                "section_number": _normalize_inline_text(point.get("section_number")),
                "section_title": _normalize_inline_text(point.get("section_title")),
                "text": _normalize_inline_text(point.get("text")),
            }
            for point in (parsed_document.get("points") or [])
            if isinstance(point, dict)
        ],
    }
    payload = json.dumps(
        canonical_document,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build_test_case_asset_hash(cases: list[dict]) -> str:
    canonical_cases = sorted(
        [
            {
                "description": _normalize_inline_text(
                    case.get("description") or case.get("test_function")
                ),
                "steps": _normalize_inline_text(
                    case.get("steps") or case.get("test_steps")
                ),
                "expected_result": _normalize_inline_text(case.get("expected_result")),
            }
            for case in cases
            if isinstance(case, dict)
            and (
                _normalize_inline_text(case.get("description") or case.get("test_function"))
                or _normalize_inline_text(case.get("steps") or case.get("test_steps"))
                or _normalize_inline_text(case.get("expected_result"))
            )
        ],
        key=lambda item: (item["description"], item["steps"], item["expected_result"]),
    )
    payload = json.dumps(
        canonical_cases,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def normalize_test_case_asset_cases(cases: list[dict]) -> list[dict]:
    normalized_cases: list[dict] = []
    for index, case in enumerate(cases, start=1):
        if not isinstance(case, dict):
            continue

        description = _normalize_inline_text(
            case.get("description") or case.get("test_function")
        )
        steps = _normalize_multiline_text(case.get("steps") or case.get("test_steps"))
        expected_result = _normalize_multiline_text(case.get("expected_result"))
        if not description and not steps and not expected_result:
            continue

        case_id = _normalize_inline_text(case.get("case_id") or case.get("test_id"))
        normalized_cases.append(
            {
                "case_id": case_id or f"TC-{index:03d}",
                "description": description,
                "steps": steps,
                "expected_result": expected_result,
                "source": _normalize_inline_text(case.get("source")),
            }
        )

    return normalized_cases


def _parse_test_case_asset_record(record: dict) -> None:
    if record.get("cases_json"):
        record["cases"] = json.loads(record["cases_json"])
    else:
        record["cases"] = []
    record.pop("cases_json", None)


def upsert_requirement_document(
    *,
    content_hash: str,
    file_name: str,
    file_type: str,
    file_size: int,
    content: bytes,
    source_page: str,
    project_id: Optional[int] = None,
    operator_user_id: Optional[int] = None,
    operator_username: Optional[str] = None,
    operator_display_name: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> dict:
    owned_connection = conn is None
    active_conn = conn or _get_connection()
    try:
        if owned_connection:
            ensure_config_library_tables(conn=active_conn)
        existing = active_conn.execute(
            "SELECT id FROM config_requirement_documents WHERE content_hash = ?",
            (content_hash,),
        ).fetchone()
        if existing is None:
            cursor = active_conn.execute(
                """
                INSERT INTO config_requirement_documents (
                    content_hash,
                    file_name,
                    file_type,
                    file_size,
                    content,
                    project_id,
                    source_page,
                    operator_user_id,
                    operator_username,
                    operator_display_name
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    content_hash,
                    file_name,
                    file_type,
                    file_size,
                    content,
                    project_id,
                    source_page,
                    operator_user_id,
                    operator_username,
                    operator_display_name,
                ),
            )
            document_id = cursor.lastrowid
        else:
            document_id = int(existing["id"])
            active_conn.execute(
                """
                UPDATE config_requirement_documents
                SET
                    file_name = ?,
                    file_type = ?,
                    file_size = ?,
                    content = ?,
                    project_id = ?,
                    source_page = ?,
                    operator_user_id = ?,
                    operator_username = ?,
                    operator_display_name = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    file_name,
                    file_type,
                    file_size,
                    content,
                    project_id,
                    source_page,
                    operator_user_id,
                    operator_username,
                    operator_display_name,
                    document_id,
                ),
            )

        if owned_connection:
            active_conn.commit()
        saved = _get_requirement_document_with_connection(active_conn, int(document_id))
        if saved is None:
            raise RuntimeError("failed to load saved requirement document")
        return saved
    finally:
        if owned_connection:
            active_conn.close()


def get_requirement_document(document_id: int) -> Optional[dict]:
    conn = _get_connection()
    try:
        ensure_config_library_tables(conn=conn)
        return _get_requirement_document_with_connection(conn, document_id)
    finally:
        conn.close()


def _get_requirement_document_with_connection(
    conn: sqlite3.Connection,
    document_id: int,
) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT crd.*, p.name AS project_name
        FROM config_requirement_documents crd
        LEFT JOIN projects p ON p.id = crd.project_id
        WHERE crd.id = ?
        """,
        (document_id,),
    ).fetchone()
    return _row_to_dict(row) if row is not None else None


def list_requirement_documents(limit: int = 100, offset: int = 0) -> list[dict]:
    conn = _get_connection()
    try:
        ensure_config_library_tables(conn=conn)
        rows = conn.execute(
            """
            SELECT crd.*, p.name AS project_name
            FROM config_requirement_documents crd
            LEFT JOIN projects p ON p.id = crd.project_id
            ORDER BY crd.updated_at DESC, crd.id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def upsert_test_case_asset(
    *,
    content_hash: str,
    asset_type: str,
    name: str,
    file_type: str,
    file_size: int,
    cases: list[dict],
    source_page: str,
    original_content: Optional[bytes] = None,
    requirement_file_name: Optional[str] = None,
    generation_mode: Optional[str] = None,
    provider: Optional[str] = None,
    prompt_template_key: Optional[str] = None,
    iteration_version: Optional[str] = None,
    project_id: Optional[int] = None,
    operator_user_id: Optional[int] = None,
    operator_username: Optional[str] = None,
    operator_display_name: Optional[str] = None,
    conn: Optional[sqlite3.Connection] = None,
) -> dict:
    if asset_type not in {"upload", "generated"}:
        raise ValueError("invalid test case asset type")

    owned_connection = conn is None
    active_conn = conn or _get_connection()
    try:
        if owned_connection:
            ensure_config_library_tables(conn=active_conn)
        existing = active_conn.execute(
            "SELECT id FROM config_test_case_assets WHERE content_hash = ?",
            (content_hash,),
        ).fetchone()
        serialized_cases = json.dumps(cases, ensure_ascii=False)
        if existing is None:
            cursor = active_conn.execute(
                """
                INSERT INTO config_test_case_assets (
                    content_hash,
                    asset_type,
                    name,
                    file_type,
                    file_size,
                    original_content,
                    cases_json,
                    case_count,
                    requirement_file_name,
                    generation_mode,
                    provider,
                    prompt_template_key,
                    iteration_version,
                    project_id,
                    source_page,
                    operator_user_id,
                    operator_username,
                    operator_display_name
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    content_hash,
                    asset_type,
                    name,
                    file_type,
                    file_size,
                    original_content,
                    serialized_cases,
                    len(cases),
                    requirement_file_name,
                    generation_mode,
                    provider,
                    prompt_template_key,
                    iteration_version,
                    project_id,
                    source_page,
                    operator_user_id,
                    operator_username,
                    operator_display_name,
                ),
            )
            asset_id = cursor.lastrowid
        else:
            asset_id = int(existing["id"])
            active_conn.execute(
                """
                UPDATE config_test_case_assets
                SET
                    asset_type = ?,
                    name = ?,
                    file_type = ?,
                    file_size = ?,
                    original_content = ?,
                    cases_json = ?,
                    case_count = ?,
                    requirement_file_name = ?,
                    generation_mode = ?,
                    provider = ?,
                    prompt_template_key = ?,
                    iteration_version = ?,
                    project_id = ?,
                    source_page = ?,
                    operator_user_id = ?,
                    operator_username = ?,
                    operator_display_name = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                """,
                (
                    asset_type,
                    name,
                    file_type,
                    file_size,
                    original_content,
                    serialized_cases,
                    len(cases),
                    requirement_file_name,
                    generation_mode,
                    provider,
                    prompt_template_key,
                    iteration_version,
                    project_id,
                    source_page,
                    operator_user_id,
                    operator_username,
                    operator_display_name,
                    asset_id,
                ),
            )

        if owned_connection:
            active_conn.commit()
        saved = _get_test_case_asset_with_connection(active_conn, int(asset_id))
        if saved is None:
            raise RuntimeError("failed to load saved test case asset")
        return saved
    finally:
        if owned_connection:
            active_conn.close()


def get_test_case_asset(asset_id: int) -> Optional[dict]:
    conn = _get_connection()
    try:
        ensure_config_library_tables(conn=conn)
        return _get_test_case_asset_with_connection(conn, asset_id)
    finally:
        conn.close()


def _get_test_case_asset_with_connection(
    conn: sqlite3.Connection,
    asset_id: int,
) -> Optional[dict]:
    row = conn.execute(
        """
        SELECT cta.*, p.name AS project_name
        FROM config_test_case_assets cta
        LEFT JOIN projects p ON p.id = cta.project_id
        WHERE cta.id = ?
        """,
        (asset_id,),
    ).fetchone()
    if row is None:
        return None
    result = _row_to_dict(row)
    _parse_test_case_asset_record(result)
    return result


def list_test_case_assets(limit: int = 100, offset: int = 0) -> list[dict]:
    conn = _get_connection()
    try:
        ensure_config_library_tables(conn=conn)
        rows = conn.execute(
            """
            SELECT cta.*, p.name AS project_name
            FROM config_test_case_assets cta
            LEFT JOIN projects p ON p.id = cta.project_id
            ORDER BY cta.updated_at DESC, cta.id DESC
            LIMIT ? OFFSET ?
            """,
            (limit, offset),
        ).fetchall()
        results: list[dict] = []
        for row in rows:
            item = _row_to_dict(row)
            _parse_test_case_asset_record(item)
            results.append(item)
        return results
    finally:
        conn.close()

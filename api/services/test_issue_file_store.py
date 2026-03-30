from __future__ import annotations

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


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS test_issue_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            file_name VARCHAR(255) NOT NULL,
            file_type VARCHAR(20) NOT NULL,
            file_size INTEGER NOT NULL,
            row_count INTEGER DEFAULT 0,
            content BLOB NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _row_to_dict(row: sqlite3.Row) -> dict:
    return normalize_timestamp_fields(dict(row))


def save_test_issue_file(
    project_id: int,
    file_name: str,
    file_type: str,
    file_size: int,
    row_count: int,
    content: bytes,
) -> dict:
    conn = _get_connection()
    try:
        _ensure_table(conn)
        cursor = conn.execute(
            """
            INSERT INTO test_issue_files
            (project_id, file_name, file_type, file_size, row_count, content)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (project_id, file_name, file_type, file_size, row_count, content),
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT tif.id, tif.project_id, p.name AS project_name, tif.file_name,
                   tif.file_type, tif.file_size, tif.row_count, tif.created_at
            FROM test_issue_files tif
            JOIN projects p ON p.id = tif.project_id
            WHERE tif.id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()
        if row is None:
            raise RuntimeError("failed to load saved test issue file")
        return _row_to_dict(row)
    finally:
        conn.close()


def list_test_issue_files(project_id: Optional[int] = None) -> list[dict]:
    conn = _get_connection()
    try:
        _ensure_table(conn)
        query = """
            SELECT tif.id, tif.project_id, p.name AS project_name, tif.file_name,
                   tif.file_type, tif.file_size, tif.row_count, tif.created_at
            FROM test_issue_files tif
            JOIN projects p ON p.id = tif.project_id
        """
        params: tuple[object, ...] = ()
        if project_id is not None:
            query += " WHERE tif.project_id = ?"
            params = (project_id,)
        query += " ORDER BY tif.created_at DESC, tif.id DESC"

        rows = conn.execute(query, params).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def get_test_issue_file(file_id: int) -> dict | None:
    conn = _get_connection()
    try:
        _ensure_table(conn)
        row = conn.execute(
            """
            SELECT tif.id, tif.project_id, p.name AS project_name, tif.file_name,
                   tif.file_type, tif.file_size, tif.row_count, tif.content, tif.created_at
            FROM test_issue_files tif
            JOIN projects p ON p.id = tif.project_id
            WHERE tif.id = ?
            """,
            (file_id,),
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()

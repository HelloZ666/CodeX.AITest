from __future__ import annotations

import os
import sqlite3

from services.database import get_db_path, normalize_timestamp_fields


def _get_connection() -> sqlite3.Connection:
    db_path = get_db_path()
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS production_issue_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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


def save_production_issue_file(
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
            INSERT INTO production_issue_files
            (file_name, file_type, file_size, row_count, content)
            VALUES (?, ?, ?, ?, ?)
            """,
            (file_name, file_type, file_size, row_count, content),
        )
        conn.commit()

        row = conn.execute(
            """
            SELECT id, file_name, file_type, file_size, row_count, created_at
            FROM production_issue_files
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()
        if row is None:
            raise RuntimeError("failed to load saved production issue file")
        return _row_to_dict(row)
    finally:
        conn.close()


def list_production_issue_files() -> list[dict]:
    conn = _get_connection()
    try:
        _ensure_table(conn)
        rows = conn.execute(
            """
            SELECT id, file_name, file_type, file_size, row_count, created_at
            FROM production_issue_files
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def get_production_issue_file(file_id: int) -> dict | None:
    conn = _get_connection()
    try:
        _ensure_table(conn)
        row = conn.execute(
            """
            SELECT id, file_name, file_type, file_size, row_count, content, created_at
            FROM production_issue_files
            WHERE id = ?
            """,
            (file_id,),
        ).fetchone()
        if row is None:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()

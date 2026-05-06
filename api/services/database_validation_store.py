"""
Persistence and orchestration for database configuration, E2E data comparison,
and regression validation scans.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime
from typing import Any

from services.database import get_db_path
from services.external_database import (
    ExternalDatabaseError,
    count_null_values,
    count_value_occurrences,
    fetch_row_by_key,
    list_columns as list_external_columns,
    list_tables as list_external_tables,
    normalize_database_type,
    test_connection as test_external_connection,
    validate_identifier,
)


SUPPORTED_RULE_TYPES = {"not_null", "enum_count"}


def ensure_database_validation_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS database_configs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(100) NOT NULL,
            db_type VARCHAR(30) NOT NULL,
            host VARCHAR(255) DEFAULT '',
            port INTEGER,
            database_name VARCHAR(255) DEFAULT '',
            username VARCHAR(255) DEFAULT '',
            password TEXT DEFAULT '',
            schema_name VARCHAR(255) DEFAULT '',
            sqlite_path TEXT DEFAULT '',
            description TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS db_tables (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            database_config_id INTEGER NOT NULL REFERENCES database_configs(id) ON DELETE CASCADE,
            table_name VARCHAR(255) NOT NULL,
            table_comment TEXT DEFAULT '',
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(database_config_id, table_name)
        );

        CREATE TABLE IF NOT EXISTS db_columns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            database_config_id INTEGER NOT NULL REFERENCES database_configs(id) ON DELETE CASCADE,
            table_name VARCHAR(255) NOT NULL,
            column_name VARCHAR(255) NOT NULL,
            data_type VARCHAR(255) DEFAULT '',
            is_nullable INTEGER DEFAULT 1,
            column_comment TEXT DEFAULT '',
            ordinal_position INTEGER DEFAULT 0,
            synced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(database_config_id, table_name, column_name)
        );

        CREATE TABLE IF NOT EXISTS e2e_test_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL,
            status VARCHAR(20) NOT NULL,
            total_count INTEGER DEFAULT 0,
            passed_count INTEGER DEFAULT 0,
            failed_count INTEGER DEFAULT 0,
            request_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS e2e_test_run_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL REFERENCES e2e_test_runs(id) ON DELETE CASCADE,
            key_value TEXT NOT NULL,
            column_name VARCHAR(255) NOT NULL,
            status VARCHAR(20) NOT NULL,
            message TEXT DEFAULT '',
            values_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS regression_scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(255) NOT NULL,
            database_config_id INTEGER NOT NULL REFERENCES database_configs(id) ON DELETE CASCADE,
            table_name VARCHAR(255) NOT NULL,
            created_at_column VARCHAR(255),
            start_time TEXT,
            end_time TEXT,
            status VARCHAR(20) NOT NULL,
            total_rules INTEGER DEFAULT 0,
            passed_rules INTEGER DEFAULT 0,
            failed_rules INTEGER DEFAULT 0,
            request_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS regression_scan_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            scan_id INTEGER NOT NULL REFERENCES regression_scans(id) ON DELETE CASCADE,
            column_name VARCHAR(255) NOT NULL,
            rule_type VARCHAR(30) NOT NULL,
            status VARCHAR(20) NOT NULL,
            checked_count INTEGER DEFAULT 0,
            failed_count INTEGER DEFAULT 0,
            message TEXT DEFAULT '',
            detail_json TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_db_tables_config ON db_tables(database_config_id, table_name);
        CREATE INDEX IF NOT EXISTS idx_db_columns_config_table ON db_columns(database_config_id, table_name, ordinal_position);
        CREATE INDEX IF NOT EXISTS idx_e2e_items_run ON e2e_test_run_items(run_id, id);
        CREATE INDEX IF NOT EXISTS idx_regression_items_scan ON regression_scan_items(scan_id, id);
        """
    )


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


def _parse_json(value: str | None, fallback: Any) -> Any:
    if not value:
        return fallback
    return json.loads(value)


def _now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_config_payload(payload: dict[str, Any], *, partial: bool = False) -> dict[str, Any]:
    normalized: dict[str, Any] = {}

    if not partial or "name" in payload:
        name = _clean_text(payload.get("name"))
        if not name:
            raise ValueError("数据库配置名称不能为空")
        normalized["name"] = name

    if not partial or "db_type" in payload:
        normalized["db_type"] = normalize_database_type(_clean_text(payload.get("db_type") or "sqlite"))

    text_fields = ("host", "database", "username", "password", "schema", "sqlite_path", "description")
    for field in text_fields:
        if not partial or field in payload:
            normalized[field] = _clean_text(payload.get(field))

    if not partial or "port" in payload:
        port = payload.get("port")
        normalized["port"] = int(port) if port not in (None, "") else None

    db_type = normalized.get("db_type") or _clean_text(payload.get("db_type"))
    sqlite_path = normalized.get("sqlite_path") if "sqlite_path" in normalized else _clean_text(payload.get("sqlite_path"))
    database = normalized.get("database") if "database" in normalized else _clean_text(payload.get("database"))
    if not partial and db_type == "sqlite" and not sqlite_path and not database:
        raise ValueError("SQLite 数据库配置需要填写文件路径")

    return normalized


def _serialize_database_config(row: sqlite3.Row | dict[str, Any], *, include_secret: bool = False) -> dict[str, Any]:
    data = _row_to_dict(row) if isinstance(row, sqlite3.Row) else dict(row)
    return {
        "id": data["id"],
        "name": data["name"],
        "db_type": data["db_type"],
        "host": data.get("host") or "",
        "port": data.get("port"),
        "database": data.get("database_name") or "",
        "username": data.get("username") or "",
        "password": data.get("password") or "" if include_secret else "",
        "schema": data.get("schema_name") or "",
        "sqlite_path": data.get("sqlite_path") or "",
        "description": data.get("description") or "",
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


def create_database_config(payload: dict[str, Any]) -> dict[str, Any]:
    data = _normalize_config_payload(payload)
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO database_configs (
                name, db_type, host, port, database_name, username, password, schema_name, sqlite_path, description
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                data["name"],
                data["db_type"],
                data.get("host", ""),
                data.get("port"),
                data.get("database", ""),
                data.get("username", ""),
                data.get("password", ""),
                data.get("schema", ""),
                data.get("sqlite_path", ""),
                data.get("description", ""),
            ),
        )
        conn.commit()
        return get_database_config(int(cursor.lastrowid))  # type: ignore[return-value]
    finally:
        conn.close()


def get_database_config(config_id: int, *, include_secret: bool = False) -> dict[str, Any] | None:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT * FROM database_configs WHERE id = ?", (config_id,)).fetchone()
        if row is None:
            return None
        return _serialize_database_config(row, include_secret=include_secret)
    finally:
        conn.close()


def list_database_configs() -> list[dict[str, Any]]:
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM database_configs ORDER BY updated_at DESC, id DESC"
        ).fetchall()
        return [_serialize_database_config(row) for row in rows]
    finally:
        conn.close()


def update_database_config(config_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    existing = get_database_config(config_id, include_secret=True)
    if existing is None:
        raise KeyError("数据库配置不存在")

    data = _normalize_config_payload(payload, partial=True)
    if not data:
        return get_database_config(config_id)  # type: ignore[return-value]

    field_map = {
        "name": "name",
        "db_type": "db_type",
        "host": "host",
        "port": "port",
        "database": "database_name",
        "username": "username",
        "password": "password",
        "schema": "schema_name",
        "sqlite_path": "sqlite_path",
        "description": "description",
    }
    assignments = [f"{field_map[field]} = ?" for field in data]
    params = [data[field] for field in data]
    assignments.append("updated_at = CURRENT_TIMESTAMP")
    params.append(config_id)

    conn = _get_connection()
    try:
        conn.execute(
            f"UPDATE database_configs SET {', '.join(assignments)} WHERE id = ?",
            params,
        )
        conn.commit()
        return get_database_config(config_id)  # type: ignore[return-value]
    finally:
        conn.close()


def delete_database_config(config_id: int) -> bool:
    conn = _get_connection()
    try:
        cursor = conn.execute("DELETE FROM database_configs WHERE id = ?", (config_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def _require_database_config(config_id: int) -> dict[str, Any]:
    config = get_database_config(config_id, include_secret=True)
    if config is None:
        raise KeyError("数据库配置不存在")
    return config


def test_database_config(config_id: int) -> dict[str, Any]:
    config = _require_database_config(config_id)
    return test_external_connection(config)


def list_database_tables(config_id: int, *, refresh: bool = False) -> list[dict[str, Any]]:
    config = _require_database_config(config_id)
    conn = _get_connection()
    try:
        if refresh:
            tables = list_external_tables(config)
            synced_at = _now_text()
            for table in tables:
                table_name = validate_identifier(str(table["table_name"]), label="表名")
                conn.execute(
                    """
                    INSERT INTO db_tables (database_config_id, table_name, table_comment, synced_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(database_config_id, table_name)
                    DO UPDATE SET table_comment = excluded.table_comment, synced_at = excluded.synced_at
                    """,
                    (config_id, table_name, table.get("table_comment") or "", synced_at),
                )
            conn.commit()

        rows = conn.execute(
            """
            SELECT database_config_id, table_name, table_comment, synced_at
            FROM db_tables
            WHERE database_config_id = ?
            ORDER BY table_name
            """,
            (config_id,),
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def get_database_columns(config_id: int, table_name: str, *, refresh: bool = False) -> list[dict[str, Any]]:
    table = validate_identifier(table_name, label="表名")
    config = _require_database_config(config_id)
    conn = _get_connection()
    try:
        if refresh:
            columns = list_external_columns(config, table)
            synced_at = _now_text()
            for column in columns:
                column_name = validate_identifier(str(column["column_name"]), label="字段名")
                conn.execute(
                    """
                    INSERT INTO db_columns (
                        database_config_id, table_name, column_name, data_type, is_nullable,
                        column_comment, ordinal_position, synced_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(database_config_id, table_name, column_name)
                    DO UPDATE SET
                        data_type = excluded.data_type,
                        is_nullable = excluded.is_nullable,
                        column_comment = excluded.column_comment,
                        ordinal_position = excluded.ordinal_position,
                        synced_at = excluded.synced_at
                    """,
                    (
                        config_id,
                        table,
                        column_name,
                        column.get("data_type") or "",
                        1 if column.get("is_nullable") else 0,
                        column.get("column_comment") or "",
                        int(column.get("ordinal_position") or 0),
                        synced_at,
                    ),
                )
            conn.commit()

        rows = conn.execute(
            """
            SELECT database_config_id, table_name, column_name, data_type, is_nullable,
                   column_comment, ordinal_position, synced_at
            FROM db_columns
            WHERE database_config_id = ? AND table_name = ?
            ORDER BY ordinal_position, column_name
            """,
            (config_id, table),
        ).fetchall()
        results = [_row_to_dict(row) for row in rows]
        for result in results:
            result["is_nullable"] = bool(result["is_nullable"])
        return results
    finally:
        conn.close()


def _normalize_column_list(columns: list[Any], *, label: str) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for item in columns:
        column = validate_identifier(str(item), label=label)
        if column in seen:
            continue
        seen.add(column)
        normalized.append(column)
    if not normalized:
        raise ValueError(f"{label}不能为空")
    return normalized


def _normalize_key_values(values: list[Any]) -> list[str]:
    normalized = [_clean_text(value) for value in values if _clean_text(value)]
    if not normalized:
        raise ValueError("主键值不能为空")
    return normalized


def _cell_value(value: Any) -> str | None:
    if value is None:
        return None
    return str(value)


def _compare_values(values: list[dict[str, Any]]) -> tuple[str, str]:
    raw_values = [entry["value"] for entry in values]
    if any(value in (None, "") for value in raw_values):
        return "failed", "存在空值或缺失记录"
    comparable = [str(value) for value in raw_values]
    if len(set(comparable)) == 1:
        return "passed", "字段值一致"
    return "failed", "字段值不一致"


def create_e2e_test_run(payload: dict[str, Any]) -> dict[str, Any]:
    name = _clean_text(payload.get("name")) or "端到端测试"
    primary_config_id = int(payload.get("primary_database_config_id") or 0)
    if primary_config_id <= 0:
        raise ValueError("请选择主系统数据库")
    primary_config = _require_database_config(primary_config_id)
    primary_table = validate_identifier(_clean_text(payload.get("primary_table")), label="主系统表名")
    primary_key_column = validate_identifier(_clean_text(payload.get("primary_key_column")), label="主键字段")
    compare_columns = _normalize_column_list(payload.get("compare_columns") or [], label="比对字段")
    key_values = _normalize_key_values(payload.get("key_values") or [])
    target_systems = payload.get("target_systems") or []
    if not isinstance(target_systems, list) or not target_systems:
        raise ValueError("至少需要配置一个上下游系统")

    normalized_targets: list[dict[str, Any]] = []
    for index, target in enumerate(target_systems, start=1):
        target_config_id = int(target.get("database_config_id") or 0)
        if target_config_id <= 0:
            raise ValueError("上下游系统数据库不能为空")
        target_config = _require_database_config(target_config_id)
        normalized_targets.append(
            {
                "database_config": target_config,
                "database_config_id": target_config_id,
                "system_name": _clean_text(target.get("system_name")) or f"上下游系统{index}",
                "table_name": validate_identifier(_clean_text(target.get("table_name")), label="上下游系统表名"),
                "primary_key_column": validate_identifier(
                    _clean_text(target.get("primary_key_column")) or primary_key_column,
                    label="上下游系统主键字段",
                ),
                "compare_columns": _normalize_column_list(
                    target.get("compare_columns") or compare_columns,
                    label="上下游系统比对字段",
                ),
            }
        )

    items: list[dict[str, Any]] = []
    for key_value in key_values:
        source_row = fetch_row_by_key(primary_config, primary_table, primary_key_column, key_value, compare_columns)
        for column_name in compare_columns:
            values = [
                {
                    "system_name": primary_config["name"],
                    "database_config_id": primary_config_id,
                    "table_name": primary_table,
                    "column_name": column_name,
                    "value": _cell_value(source_row.get(column_name) if source_row else None),
                    "exists": source_row is not None,
                }
            ]
            for target in normalized_targets:
                target_columns = target["compare_columns"]
                target_column = column_name if column_name in target_columns else target_columns[0]
                target_row = fetch_row_by_key(
                    target["database_config"],
                    target["table_name"],
                    target["primary_key_column"],
                    key_value,
                    [target_column],
                )
                values.append(
                    {
                        "system_name": target["system_name"],
                        "database_config_id": target["database_config_id"],
                        "table_name": target["table_name"],
                        "column_name": target_column,
                        "value": _cell_value(target_row.get(target_column) if target_row else None),
                        "exists": target_row is not None,
                    }
                )
            status, message = _compare_values(values)
            items.append(
                {
                    "key_value": key_value,
                    "column_name": column_name,
                    "status": status,
                    "message": message,
                    "values": values,
                }
            )

    passed_count = sum(1 for item in items if item["status"] == "passed")
    failed_count = len(items) - passed_count
    status = "passed" if failed_count == 0 else "failed"

    request_snapshot = {
        "name": name,
        "primary_database_config_id": primary_config_id,
        "primary_table": primary_table,
        "primary_key_column": primary_key_column,
        "compare_columns": compare_columns,
        "key_values": key_values,
        "target_systems": [
            {
                "database_config_id": target["database_config_id"],
                "system_name": target["system_name"],
                "table_name": target["table_name"],
                "primary_key_column": target["primary_key_column"],
                "compare_columns": target["compare_columns"],
            }
            for target in normalized_targets
        ],
    }

    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO e2e_test_runs (name, status, total_count, passed_count, failed_count, request_json)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                status,
                len(items),
                passed_count,
                failed_count,
                json.dumps(request_snapshot, ensure_ascii=False),
            ),
        )
        run_id = int(cursor.lastrowid)
        for item in items:
            conn.execute(
                """
                INSERT INTO e2e_test_run_items (run_id, key_value, column_name, status, message, values_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    item["key_value"],
                    item["column_name"],
                    item["status"],
                    item["message"],
                    json.dumps(item["values"], ensure_ascii=False),
                ),
            )
        conn.commit()
        return get_e2e_test_run(run_id)  # type: ignore[return-value]
    finally:
        conn.close()


def _serialize_e2e_run(row: sqlite3.Row, *, include_items: bool = False) -> dict[str, Any]:
    data = _row_to_dict(row)
    data["request"] = _parse_json(data.pop("request_json"), {})
    if include_items:
        data["items"] = list_e2e_test_run_items(int(data["id"]))
    return data


def list_e2e_test_runs() -> list[dict[str, Any]]:
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM e2e_test_runs ORDER BY created_at DESC, id DESC"
        ).fetchall()
        return [_serialize_e2e_run(row) for row in rows]
    finally:
        conn.close()


def list_e2e_test_run_items(run_id: int) -> list[dict[str, Any]]:
    conn = _get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, run_id, key_value, column_name, status, message, values_json, created_at
            FROM e2e_test_run_items
            WHERE run_id = ?
            ORDER BY id
            """,
            (run_id,),
        ).fetchall()
        items = []
        for row in rows:
            item = _row_to_dict(row)
            item["values"] = _parse_json(item.pop("values_json"), [])
            items.append(item)
        return items
    finally:
        conn.close()


def get_e2e_test_run(run_id: int) -> dict[str, Any] | None:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT * FROM e2e_test_runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        return _serialize_e2e_run(row, include_items=True)
    finally:
        conn.close()


def delete_e2e_test_run(run_id: int) -> bool:
    conn = _get_connection()
    try:
        cursor = conn.execute("DELETE FROM e2e_test_runs WHERE id = ?", (run_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def _build_time_filter(column_name: str | None, start_time: str | None, end_time: str | None) -> tuple[str, list[Any]]:
    if not column_name:
        return "", []
    column = validate_identifier(column_name, label="创建时间字段")
    where_sql = ""
    params: list[Any] = []
    if start_time:
        where_sql += f" AND \"{column}\" >= ?"
        params.append(start_time)
    if end_time:
        where_sql += f" AND \"{column}\" <= ?"
        params.append(end_time)
    return where_sql, params


def _normalize_regression_rule(rule: dict[str, Any]) -> dict[str, Any]:
    column_name = validate_identifier(_clean_text(rule.get("column_name")), label="规则字段")
    rule_type = _clean_text(rule.get("rule_type"))
    if rule_type not in SUPPORTED_RULE_TYPES:
        raise ValueError("规则类型仅支持 not_null 或 enum_count")
    expected_values = [_clean_text(value) for value in rule.get("expected_values") or [] if _clean_text(value)]
    min_count = int(rule.get("min_count") or 1)
    if rule_type == "enum_count" and not expected_values:
        raise ValueError("枚举次数规则需要填写枚举值")
    return {
        "column_name": column_name,
        "rule_type": rule_type,
        "expected_values": expected_values,
        "min_count": max(min_count, 1),
    }


def create_regression_scan(payload: dict[str, Any]) -> dict[str, Any]:
    name = _clean_text(payload.get("name")) or "回归验证"
    config_id = int(payload.get("database_config_id") or 0)
    if config_id <= 0:
        raise ValueError("请选择数据库配置")
    config = _require_database_config(config_id)
    table_name = validate_identifier(_clean_text(payload.get("table_name")), label="扫描表名")
    created_at_column = _clean_text(payload.get("created_at_column")) or None
    start_time = _clean_text(payload.get("start_time")) or None
    end_time = _clean_text(payload.get("end_time")) or None
    rules = [_normalize_regression_rule(rule) for rule in payload.get("rules") or []]
    if not rules:
        raise ValueError("至少需要配置一条扫描规则")

    where_sql, where_params = _build_time_filter(created_at_column, start_time, end_time)
    items: list[dict[str, Any]] = []
    for rule in rules:
        if rule["rule_type"] == "not_null":
            failed_count = count_null_values(config, table_name, rule["column_name"], where_sql, where_params)
            status = "passed" if failed_count == 0 else "failed"
            items.append(
                {
                    "column_name": rule["column_name"],
                    "rule_type": rule["rule_type"],
                    "status": status,
                    "checked_count": 1,
                    "failed_count": failed_count,
                    "message": "字段无空值" if status == "passed" else f"发现 {failed_count} 条空值记录",
                    "detail": {"failed_count": failed_count},
                }
            )
            continue

        occurrences = {
            value: count_value_occurrences(config, table_name, rule["column_name"], value, where_sql, where_params)
            for value in rule["expected_values"]
        }
        failed_values = {
            value: count
            for value, count in occurrences.items()
            if count < rule["min_count"]
        }
        status = "passed" if not failed_values else "failed"
        items.append(
            {
                "column_name": rule["column_name"],
                "rule_type": rule["rule_type"],
                "status": status,
                "checked_count": len(occurrences),
                "failed_count": len(failed_values),
                "message": "枚举值出现次数满足规则" if status == "passed" else "部分枚举值出现次数不足",
                "detail": {
                    "min_count": rule["min_count"],
                    "occurrences": occurrences,
                    "failed_values": failed_values,
                },
            }
        )

    passed_rules = sum(1 for item in items if item["status"] == "passed")
    failed_rules = len(items) - passed_rules
    status = "passed" if failed_rules == 0 else "failed"
    request_snapshot = {
        "name": name,
        "database_config_id": config_id,
        "table_name": table_name,
        "created_at_column": created_at_column,
        "start_time": start_time,
        "end_time": end_time,
        "rules": rules,
    }

    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO regression_scans (
                name, database_config_id, table_name, created_at_column, start_time, end_time,
                status, total_rules, passed_rules, failed_rules, request_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name,
                config_id,
                table_name,
                created_at_column,
                start_time,
                end_time,
                status,
                len(items),
                passed_rules,
                failed_rules,
                json.dumps(request_snapshot, ensure_ascii=False),
            ),
        )
        scan_id = int(cursor.lastrowid)
        for item in items:
            conn.execute(
                """
                INSERT INTO regression_scan_items (
                    scan_id, column_name, rule_type, status, checked_count, failed_count, message, detail_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    scan_id,
                    item["column_name"],
                    item["rule_type"],
                    item["status"],
                    item["checked_count"],
                    item["failed_count"],
                    item["message"],
                    json.dumps(item["detail"], ensure_ascii=False),
                ),
            )
        conn.commit()
        return get_regression_scan(scan_id)  # type: ignore[return-value]
    finally:
        conn.close()


def _serialize_regression_scan(row: sqlite3.Row, *, include_items: bool = False) -> dict[str, Any]:
    data = _row_to_dict(row)
    data["request"] = _parse_json(data.pop("request_json"), {})
    if include_items:
        data["items"] = list_regression_scan_items(int(data["id"]))
    return data


def list_regression_scans() -> list[dict[str, Any]]:
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM regression_scans ORDER BY created_at DESC, id DESC"
        ).fetchall()
        return [_serialize_regression_scan(row) for row in rows]
    finally:
        conn.close()


def list_regression_scan_items(scan_id: int) -> list[dict[str, Any]]:
    conn = _get_connection()
    try:
        rows = conn.execute(
            """
            SELECT id, scan_id, column_name, rule_type, status, checked_count, failed_count,
                   message, detail_json, created_at
            FROM regression_scan_items
            WHERE scan_id = ?
            ORDER BY id
            """,
            (scan_id,),
        ).fetchall()
        items = []
        for row in rows:
            item = _row_to_dict(row)
            item["detail"] = _parse_json(item.pop("detail_json"), {})
            items.append(item)
        return items
    finally:
        conn.close()


def get_regression_scan(scan_id: int) -> dict[str, Any] | None:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT * FROM regression_scans WHERE id = ?", (scan_id,)).fetchone()
        if row is None:
            return None
        return _serialize_regression_scan(row, include_items=True)
    finally:
        conn.close()


def delete_regression_scan(scan_id: int) -> bool:
    conn = _get_connection()
    try:
        cursor = conn.execute("DELETE FROM regression_scans WHERE id = ?", (scan_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

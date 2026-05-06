"""
External database access helpers for database validation features.

SQLite is fully supported with the standard library. Other database types are
adapted through optional drivers and return explicit dependency errors when the
driver is not installed.
"""

from __future__ import annotations

import importlib
import re
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator


SUPPORTED_DATABASE_TYPES = {
    "sqlite",
    "mysql",
    "postgresql",
    "oracle",
    "oceanbase-mysql",
    "oceanbase-oracle",
}

IDENTIFIER_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")
DEFAULT_CONNECT_TIMEOUT_SECONDS = 5


class ExternalDatabaseError(RuntimeError):
    """Raised when an external database operation cannot be completed."""


@dataclass(frozen=True)
class ExternalDatabaseConfig:
    id: int | None
    name: str
    db_type: str
    host: str = ""
    port: int | None = None
    database: str = ""
    username: str = ""
    password: str = ""
    schema: str = ""
    sqlite_path: str = ""


def normalize_database_type(db_type: str) -> str:
    normalized = db_type.strip().lower()
    if normalized not in SUPPORTED_DATABASE_TYPES:
        supported = "、".join(sorted(SUPPORTED_DATABASE_TYPES))
        raise ExternalDatabaseError(f"不支持的数据库类型：{db_type}，当前支持：{supported}")
    return normalized


def build_external_database_config(raw_config: dict[str, Any]) -> ExternalDatabaseConfig:
    return ExternalDatabaseConfig(
        id=raw_config.get("id"),
        name=str(raw_config.get("name") or ""),
        db_type=normalize_database_type(str(raw_config.get("db_type") or "")),
        host=str(raw_config.get("host") or ""),
        port=int(raw_config["port"]) if raw_config.get("port") not in (None, "") else None,
        database=str(raw_config.get("database") or ""),
        username=str(raw_config.get("username") or ""),
        password=str(raw_config.get("password") or ""),
        schema=str(raw_config.get("schema") or ""),
        sqlite_path=str(raw_config.get("sqlite_path") or ""),
    )


def validate_identifier(identifier: str, *, label: str = "标识符") -> str:
    normalized = identifier.strip()
    if not normalized:
        raise ExternalDatabaseError(f"{label}不能为空")

    parts = normalized.split(".")
    if any(not IDENTIFIER_PATTERN.fullmatch(part) for part in parts):
        raise ExternalDatabaseError(f"{label}只能包含字母、数字、下划线，并且不能以数字开头")
    return normalized


def _quote_identifier(identifier: str, quote_char: str = '"') -> str:
    normalized = validate_identifier(identifier)
    return ".".join(f"{quote_char}{part}{quote_char}" for part in normalized.split("."))


def _sqlite_path(config: ExternalDatabaseConfig) -> str:
    path = config.sqlite_path or config.database
    if not path:
        raise ExternalDatabaseError("SQLite 数据库配置缺少文件路径")
    sqlite_path = Path(path)
    if not sqlite_path.exists():
        raise ExternalDatabaseError(f"SQLite 数据库文件不存在：{path}")
    return str(sqlite_path)


def _import_optional_driver(module_name: str, install_hint: str):
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        raise ExternalDatabaseError(f"缺少数据库驱动：{module_name}，请先安装 {install_hint}") from exc


def _default_port(db_type: str) -> int | None:
    if db_type in {"mysql", "oceanbase-mysql"}:
        return 3306
    if db_type == "postgresql":
        return 5432
    if db_type in {"oracle", "oceanbase-oracle"}:
        return 1521
    return None


def _format_connection_target(config: ExternalDatabaseConfig) -> str:
    if config.db_type == "sqlite":
        return config.sqlite_path or config.database or "未填写 SQLite 文件路径"

    host = config.host or "未填写主机"
    port = config.port or _default_port(config.db_type)
    database = f"/{config.database}" if config.database else ""
    return f"{host}:{port}{database}" if port else f"{host}{database}"


def _format_exception_message(exc: Exception) -> str:
    message = str(exc).strip()
    return message or exc.__class__.__name__


def _raise_database_connect_error(config: ExternalDatabaseConfig, exc: Exception) -> None:
    hint = ""
    if config.db_type in {"mysql", "oceanbase-mysql"} and config.port == 22:
        hint = "。当前端口是 22（常见 SSH 端口），MySQL 通常使用 3306，请确认端口是否填错"
    raise ExternalDatabaseError(
        f"数据库连接失败：{_format_connection_target(config)}；{_format_exception_message(exc)}{hint}"
    ) from exc


def _raise_database_operation_error(action: str, config: ExternalDatabaseConfig, exc: Exception) -> None:
    raise ExternalDatabaseError(
        f"{action}失败：{_format_connection_target(config)}；{_format_exception_message(exc)}"
    ) from exc


@contextmanager
def connect_external_database(config: dict[str, Any] | ExternalDatabaseConfig) -> Iterator[Any]:
    resolved = build_external_database_config(config) if isinstance(config, dict) else config

    if resolved.db_type == "sqlite":
        try:
            conn = sqlite3.connect(_sqlite_path(resolved))
        except sqlite3.Error as exc:
            _raise_database_connect_error(resolved, exc)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        finally:
            conn.close()
        return

    if resolved.db_type in {"mysql", "oceanbase-mysql"}:
        pymysql = _import_optional_driver("pymysql", "pymysql")
        try:
            conn = pymysql.connect(
                host=resolved.host,
                port=resolved.port or 3306,
                user=resolved.username,
                password=resolved.password,
                database=resolved.database,
                charset="utf8mb4",
                cursorclass=pymysql.cursors.DictCursor,
                connect_timeout=DEFAULT_CONNECT_TIMEOUT_SECONDS,
                read_timeout=DEFAULT_CONNECT_TIMEOUT_SECONDS,
                write_timeout=DEFAULT_CONNECT_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            _raise_database_connect_error(resolved, exc)
        try:
            yield conn
        finally:
            conn.close()
        return

    if resolved.db_type == "postgresql":
        psycopg = _import_optional_driver("psycopg", "psycopg[binary]")
        try:
            conn = psycopg.connect(
                host=resolved.host,
                port=resolved.port or 5432,
                dbname=resolved.database,
                user=resolved.username,
                password=resolved.password,
                row_factory=psycopg.rows.dict_row,
                connect_timeout=DEFAULT_CONNECT_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            _raise_database_connect_error(resolved, exc)
        try:
            yield conn
        finally:
            conn.close()
        return

    if resolved.db_type in {"oracle", "oceanbase-oracle"}:
        oracledb = _import_optional_driver("oracledb", "oracledb")
        dsn = oracledb.makedsn(resolved.host, resolved.port or 1521, service_name=resolved.database)
        try:
            conn = oracledb.connect(user=resolved.username, password=resolved.password, dsn=dsn)
        except Exception as exc:
            _raise_database_connect_error(resolved, exc)
        try:
            yield conn
        finally:
            conn.close()
        return

    raise ExternalDatabaseError(f"不支持的数据库类型：{resolved.db_type}")


def test_connection(config: dict[str, Any]) -> dict[str, Any]:
    resolved = build_external_database_config(config)
    try:
        with connect_external_database(resolved) as conn:
            if resolved.db_type == "sqlite":
                table_count = conn.execute(
                    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
                ).fetchone()["count"]
                return {"success": True, "message": "连接成功", "table_count": int(table_count)}

            cursor = conn.cursor()
            try:
                cursor.execute("SELECT 1")
                cursor.fetchone()
            finally:
                cursor.close()
            return {"success": True, "message": "连接成功", "table_count": None}
    except ExternalDatabaseError:
        raise
    except Exception as exc:
        _raise_database_operation_error("数据库连接测试", resolved, exc)


def list_tables(config: dict[str, Any]) -> list[dict[str, Any]]:
    resolved = build_external_database_config(config)
    with connect_external_database(resolved) as conn:
        if resolved.db_type == "sqlite":
            rows = conn.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
            ).fetchall()
            return [{"table_name": row["name"], "table_comment": ""} for row in rows]

        cursor = conn.cursor()
        try:
            if resolved.db_type in {"mysql", "oceanbase-mysql"}:
                cursor.execute(
                    """
                    SELECT table_name, COALESCE(table_comment, '') AS table_comment
                    FROM information_schema.tables
                    WHERE table_schema = %s
                    ORDER BY table_name
                    """,
                    (resolved.database,),
                )
            elif resolved.db_type == "postgresql":
                cursor.execute(
                    """
                    SELECT table_name, '' AS table_comment
                    FROM information_schema.tables
                    WHERE table_schema = %s AND table_type = 'BASE TABLE'
                    ORDER BY table_name
                    """,
                    (resolved.schema or "public",),
                )
            else:
                owner = (resolved.schema or resolved.username).upper()
                cursor.execute(
                    """
                    SELECT table_name, '' AS table_comment
                    FROM all_tables
                    WHERE owner = :owner
                    ORDER BY table_name
                    """,
                    {"owner": owner},
                )
            return [
                {
                    "table_name": row["table_name"] if isinstance(row, dict) else row[0],
                    "table_comment": row.get("table_comment", "") if isinstance(row, dict) else (row[1] if len(row) > 1 else ""),
                }
                for row in cursor.fetchall()
            ]
        finally:
            cursor.close()


def list_columns(config: dict[str, Any], table_name: str) -> list[dict[str, Any]]:
    table = validate_identifier(table_name, label="表名")
    resolved = build_external_database_config(config)
    with connect_external_database(resolved) as conn:
        if resolved.db_type == "sqlite":
            rows = conn.execute(f"PRAGMA table_info({_quote_identifier(table)})").fetchall()
            return [
                {
                    "column_name": row["name"],
                    "data_type": row["type"] or "",
                    "is_nullable": not bool(row["notnull"]),
                    "column_comment": "",
                    "ordinal_position": int(row["cid"]) + 1,
                }
                for row in rows
            ]

        cursor = conn.cursor()
        try:
            if resolved.db_type in {"mysql", "oceanbase-mysql"}:
                cursor.execute(
                    """
                    SELECT column_name, data_type, is_nullable, COALESCE(column_comment, '') AS column_comment,
                           ordinal_position
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (resolved.database, table),
                )
            elif resolved.db_type == "postgresql":
                cursor.execute(
                    """
                    SELECT column_name, data_type, is_nullable, '' AS column_comment, ordinal_position
                    FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (resolved.schema or "public", table),
                )
            else:
                cursor.execute(
                    """
                    SELECT column_name, data_type, nullable AS is_nullable, '' AS column_comment, column_id AS ordinal_position
                    FROM all_tab_columns
                    WHERE owner = :owner AND table_name = :table_name
                    ORDER BY column_id
                    """,
                    {"owner": (resolved.schema or resolved.username).upper(), "table_name": table.upper()},
                )
            results = []
            for row in cursor.fetchall():
                if isinstance(row, dict):
                    nullable_value = row.get("is_nullable")
                    results.append(
                        {
                            "column_name": row.get("column_name"),
                            "data_type": row.get("data_type") or "",
                            "is_nullable": str(nullable_value).upper() in {"YES", "Y", "TRUE", "1"},
                            "column_comment": row.get("column_comment") or "",
                            "ordinal_position": int(row.get("ordinal_position") or 0),
                        }
                    )
                else:
                    results.append(
                        {
                            "column_name": row[0],
                            "data_type": row[1] or "",
                            "is_nullable": str(row[2]).upper() in {"YES", "Y", "TRUE", "1"},
                            "column_comment": row[3] if len(row) > 3 else "",
                            "ordinal_position": int(row[4] or 0) if len(row) > 4 else 0,
                        }
                    )
            return results
        finally:
            cursor.close()


def fetch_row_by_key(
    config: dict[str, Any],
    table_name: str,
    key_column: str,
    key_value: Any,
    columns: list[str],
) -> dict[str, Any] | None:
    table = _quote_identifier(table_name)
    key = _quote_identifier(key_column)
    selected_columns = [_quote_identifier(column) for column in columns]
    if not selected_columns:
        raise ExternalDatabaseError("比对字段不能为空")

    resolved = build_external_database_config(config)
    with connect_external_database(resolved) as conn:
        if resolved.db_type == "sqlite":
            sql = f"SELECT {', '.join(selected_columns)} FROM {table} WHERE {key} = ? LIMIT 1"
            row = conn.execute(sql, (key_value,)).fetchone()
            return dict(row) if row is not None else None

        placeholder = "%s" if resolved.db_type in {"mysql", "oceanbase-mysql", "postgresql"} else ":key_value"
        sql = f"SELECT {', '.join(selected_columns)} FROM {table} WHERE {key} = {placeholder}"
        if resolved.db_type in {"mysql", "oceanbase-mysql"}:
            sql += " LIMIT 1"
        cursor = conn.cursor()
        try:
            cursor.execute(sql, (key_value,) if placeholder == "%s" else {"key_value": key_value})
            row = cursor.fetchone()
            if row is None:
                return None
            if isinstance(row, dict):
                return {column: row.get(column) for column in columns}
            return {columns[index]: row[index] for index in range(len(columns))}
        finally:
            cursor.close()


def count_null_values(
    config: dict[str, Any],
    table_name: str,
    column_name: str,
    where_sql: str = "",
    where_params: list[Any] | None = None,
) -> int:
    table = _quote_identifier(table_name)
    column = _quote_identifier(column_name)
    params = where_params or []
    resolved = build_external_database_config(config)
    with connect_external_database(resolved) as conn:
        if resolved.db_type == "sqlite":
            row = conn.execute(
                f"SELECT COUNT(1) AS count FROM {table} WHERE {column} IS NULL{where_sql}",
                params,
            ).fetchone()
            return int(row["count"])
        raise ExternalDatabaseError("当前回归扫描仅支持 SQLite 外部库完整执行")


def count_value_occurrences(
    config: dict[str, Any],
    table_name: str,
    column_name: str,
    value: Any,
    where_sql: str = "",
    where_params: list[Any] | None = None,
) -> int:
    table = _quote_identifier(table_name)
    column = _quote_identifier(column_name)
    params = [value, *(where_params or [])]
    resolved = build_external_database_config(config)
    with connect_external_database(resolved) as conn:
        if resolved.db_type == "sqlite":
            row = conn.execute(
                f"SELECT COUNT(1) AS count FROM {table} WHERE {column} = ?{where_sql}",
                params,
            ).fetchone()
            return int(row["count"])
        raise ExternalDatabaseError("当前回归扫描仅支持 SQLite 外部库完整执行")

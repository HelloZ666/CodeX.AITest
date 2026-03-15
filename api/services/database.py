"""
database.py - SQLite数据库抽象层

提供文件管理和分析记录的持久化存储。
使用SQLite标准库，无需额外依赖。
"""

import hashlib
import json
import os
import secrets
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional


def get_db_path() -> str:
    """获取数据库文件路径，支持通过环境变量配置"""
    default_path = str(Path(__file__).resolve().parent.parent / "data" / "codetestguard.db")
    return os.environ.get("DB_PATH", default_path)


def _get_connection() -> sqlite3.Connection:
    """获取数据库连接，启用外键约束和Row工厂"""
    db_path = get_db_path()
    # 确保目录存在
    db_dir = os.path.dirname(db_path)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """初始化数据库，创建表结构"""
    conn = _get_connection()
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL,
                description TEXT DEFAULT '',
                mapping_data TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS analysis_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
                code_changes_summary TEXT,
                test_coverage_result TEXT,
                test_score REAL,
                ai_suggestions TEXT,
                token_usage INTEGER DEFAULT 0,
                cost REAL DEFAULT 0.0,
                duration_ms INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS global_mapping (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(200) NOT NULL,
                mapping_data TEXT NOT NULL,
                row_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS production_issue_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_name VARCHAR(255) NOT NULL,
                file_type VARCHAR(20) NOT NULL,
                file_size INTEGER NOT NULL,
                row_count INTEGER DEFAULT 0,
                content BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS test_issue_files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                file_name VARCHAR(255) NOT NULL,
                file_type VARCHAR(20) NOT NULL,
                file_size INTEGER NOT NULL,
                row_count INTEGER DEFAULT 0,
                content BLOB NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS requirement_mappings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
                source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('upload', 'manual', 'mixed')),
                last_file_name VARCHAR(255),
                last_file_type VARCHAR(20),
                sheet_name VARCHAR(100),
                group_count INTEGER DEFAULT 0,
                row_count INTEGER DEFAULT 0,
                groups_json TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS requirement_analysis_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                requirement_file_name VARCHAR(255) NOT NULL,
                section_snapshot_json TEXT NOT NULL,
                result_snapshot_json TEXT NOT NULL,
                ai_analysis_json TEXT,
                token_usage INTEGER DEFAULT 0,
                cost REAL DEFAULT 0.0,
                duration_ms INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS requirement_analysis_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('ignore', 'allow')),
                keyword VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(rule_type, keyword)
            );

            CREATE TABLE IF NOT EXISTS requirement_analysis_rule_settings (
                setting_key VARCHAR(100) PRIMARY KEY,
                setting_value TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR(100) NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                display_name VARCHAR(100) NOT NULL,
                email VARCHAR(255),
                role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user')),
                status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
                last_login_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS user_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token_hash TEXT NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        _ensure_requirement_analysis_record_schema(conn)
        _ensure_requirement_analysis_rule_schema(conn)
        _seed_default_requirement_analysis_rules(conn)
        _seed_incremental_default_requirement_analysis_rules(
            conn,
            setting_key="defaults_seeded_numeric_keyword_v1",
            keywords=["阿拉伯数字"],
        )
        conn.commit()
    finally:
        conn.close()


def _get_table_columns(conn: sqlite3.Connection, table_name: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return {str(row["name"]) for row in rows}


def _ensure_requirement_analysis_record_schema(conn: sqlite3.Connection) -> None:
    columns = _get_table_columns(conn, "requirement_analysis_records")
    legacy_columns = {"production_issue_file_id", "test_issue_file_id"}
    if not columns or not (legacy_columns & columns):
        return

    conn.execute("ALTER TABLE requirement_analysis_records RENAME TO requirement_analysis_records_legacy")
    conn.execute(
        """
        CREATE TABLE requirement_analysis_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            requirement_file_name VARCHAR(255) NOT NULL,
            section_snapshot_json TEXT NOT NULL,
            result_snapshot_json TEXT NOT NULL,
            ai_analysis_json TEXT,
            token_usage INTEGER DEFAULT 0,
            cost REAL DEFAULT 0.0,
            duration_ms INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        INSERT INTO requirement_analysis_records (
            id,
            project_id,
            requirement_file_name,
            section_snapshot_json,
            result_snapshot_json,
            ai_analysis_json,
            token_usage,
            cost,
            duration_ms,
            created_at
        )
        SELECT
            id,
            project_id,
            requirement_file_name,
            section_snapshot_json,
            result_snapshot_json,
            ai_analysis_json,
            token_usage,
            cost,
            duration_ms,
            created_at
        FROM requirement_analysis_records_legacy
        """
    )
    conn.execute("DROP TABLE requirement_analysis_records_legacy")


def _ensure_requirement_analysis_rule_schema(conn: sqlite3.Connection) -> None:
    columns = _get_table_columns(conn, "requirement_analysis_rules")
    if "rule_source" not in columns:
        conn.execute(
            """
            ALTER TABLE requirement_analysis_rules
            ADD COLUMN rule_source VARCHAR(20) NOT NULL DEFAULT 'custom'
            """
        )


def _seed_default_requirement_analysis_rules(conn: sqlite3.Connection) -> None:
    seed_state = conn.execute(
        """
        SELECT setting_value
        FROM requirement_analysis_rule_settings
        WHERE setting_key = 'defaults_seeded'
        """
    ).fetchone()
    if seed_state is not None:
        return

    from services.requirement_analysis import get_builtin_ignore_keywords

    existing_ignore_keywords = {
        str(row["keyword"]).strip().lower()
        for row in conn.execute(
            """
            SELECT keyword
            FROM requirement_analysis_rules
            WHERE rule_type = 'ignore'
            """
        ).fetchall()
    }

    for keyword in get_builtin_ignore_keywords():
        normalized_keyword = keyword.strip().lower()
        if not normalized_keyword or normalized_keyword in existing_ignore_keywords:
            continue
        conn.execute(
            """
            INSERT INTO requirement_analysis_rules (rule_type, keyword, rule_source)
            VALUES ('ignore', ?, 'default')
            """,
            (normalized_keyword,),
        )
        existing_ignore_keywords.add(normalized_keyword)

    conn.execute(
        """
        INSERT INTO requirement_analysis_rule_settings (setting_key, setting_value)
        VALUES ('defaults_seeded', 'true')
        """
    )


def _seed_incremental_default_requirement_analysis_rules(
    conn: sqlite3.Connection,
    setting_key: str,
    keywords: list[str],
) -> None:
    seed_state = conn.execute(
        """
        SELECT setting_value
        FROM requirement_analysis_rule_settings
        WHERE setting_key = ?
        """,
        (setting_key,),
    ).fetchone()
    if seed_state is not None:
        return

    existing_ignore_keywords = {
        str(row["keyword"]).strip().lower()
        for row in conn.execute(
            """
            SELECT keyword
            FROM requirement_analysis_rules
            WHERE rule_type = 'ignore'
            """
        ).fetchall()
    }

    for keyword in keywords:
        normalized_keyword = keyword.strip().lower()
        if not normalized_keyword or normalized_keyword in existing_ignore_keywords:
            continue
        conn.execute(
            """
            INSERT INTO requirement_analysis_rules (rule_type, keyword, rule_source)
            VALUES ('ignore', ?, 'default')
            """,
            (normalized_keyword,),
        )
        existing_ignore_keywords.add(normalized_keyword)

    conn.execute(
        """
        INSERT INTO requirement_analysis_rule_settings (setting_key, setting_value)
        VALUES (?, 'true')
        """,
        (setting_key,),
    )


def _hash_password(password: str, salt: Optional[str] = None) -> str:
    if not password:
        raise ValueError("Password cannot be empty")
    resolved_salt = salt or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        resolved_salt.encode("utf-8"),
        100000,
    )
    return f"pbkdf2_sha256${resolved_salt}${derived.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    try:
        algorithm, salt, _ = password_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    return secrets.compare_digest(_hash_password(password, salt), password_hash)


def _hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _parse_timestamp(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    resolved = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(resolved)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _serialize_user(row: Optional[sqlite3.Row]) -> Optional[dict]:
    if row is None:
        return None
    user = _row_to_dict(row)
    user.pop("password_hash", None)
    return user


def count_users() -> int:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT COUNT(*) AS count FROM users").fetchone()
        return int(row["count"])
    finally:
        conn.close()


def create_user(
    username: str,
    password: str,
    display_name: str,
    email: Optional[str] = None,
    role: str = "user",
    status: str = "active",
) -> dict:
    normalized_username = username.strip()
    normalized_display_name = display_name.strip()
    normalized_email = email.strip() if email else None
    if role not in {"admin", "user"}:
        raise ValueError("Invalid role")
    if status not in {"active", "disabled"}:
        raise ValueError("Invalid status")
    if not normalized_username:
        raise ValueError("Username cannot be empty")
    if not normalized_display_name:
        raise ValueError("Display name cannot be empty")
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO users (username, password_hash, display_name, email, role, status)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                normalized_username,
                _hash_password(password),
                normalized_display_name,
                normalized_email,
                role,
                status,
            ),
        )
        conn.commit()
        return get_user(cursor.lastrowid)
    finally:
        conn.close()


def get_user(user_id: int) -> Optional[dict]:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        return _serialize_user(row)
    finally:
        conn.close()


def get_user_by_username(username: str) -> Optional[dict]:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
        return _serialize_user(row)
    finally:
        conn.close()


def _get_user_with_password_by_username(username: str) -> Optional[dict]:
    conn = _get_connection()
    try:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username.strip(),)).fetchone()
        if row is None:
            return None
        return _row_to_dict(row)
    finally:
        conn.close()


def list_users(
    keyword: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
) -> list[dict]:
    sql = "SELECT * FROM users WHERE 1 = 1"
    params: list[object] = []
    if keyword:
        sql += " AND (username LIKE ? OR display_name LIKE ? OR COALESCE(email, '') LIKE ?)"
        pattern = f"%{keyword.strip()}%"
        params.extend([pattern, pattern, pattern])
    if role:
        sql += " AND role = ?"
        params.append(role)
    if status:
        sql += " AND status = ?"
        params.append(status)
    sql += " ORDER BY created_at DESC, id DESC"
    conn = _get_connection()
    try:
        rows = conn.execute(sql, params).fetchall()
        return [_serialize_user(row) for row in rows if row is not None]
    finally:
        conn.close()


def update_user(
    user_id: int,
    display_name: Optional[str] = None,
    email: Optional[str] = None,
    role: Optional[str] = None,
) -> Optional[dict]:
    existing = get_user(user_id)
    if existing is None:
        return None
    updates = []
    params: list[object] = []
    if display_name is not None:
        normalized_display_name = display_name.strip()
        if not normalized_display_name:
            raise ValueError("Display name cannot be empty")
        updates.append("display_name = ?")
        params.append(normalized_display_name)
    if email is not None:
        normalized_email = email.strip() or None
        updates.append("email = ?")
        params.append(normalized_email)
    if role is not None:
        if role not in {"admin", "user"}:
            raise ValueError("Invalid role")
        updates.append("role = ?")
        params.append(role)
    if not updates:
        return existing
    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(user_id)
    conn = _get_connection()
    try:
        conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", params)
        conn.commit()
    finally:
        conn.close()
    return get_user(user_id)


def update_user_status(user_id: int, status: str) -> Optional[dict]:
    if status not in {"active", "disabled"}:
        raise ValueError("Invalid status")
    if get_user(user_id) is None:
        return None
    conn = _get_connection()
    try:
        conn.execute(
            "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (status, user_id),
        )
        if status == "disabled":
            conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return get_user(user_id)


def reset_user_password(user_id: int, password: str) -> Optional[dict]:
    if get_user(user_id) is None:
        return None
    conn = _get_connection()
    try:
        conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (_hash_password(password), user_id),
        )
        conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()
    return get_user(user_id)


def authenticate_user(username: str, password: str) -> Optional[dict]:
    existing = _get_user_with_password_by_username(username)
    if existing is None:
        return None
    if not verify_password(password, existing["password_hash"]):
        return None
    existing.pop("password_hash", None)
    return existing


def create_user_session(user_id: int, duration_days: int = 7) -> str:
    token = secrets.token_urlsafe(48)
    expires_at = datetime.now(timezone.utc) + timedelta(days=duration_days)
    conn = _get_connection()
    try:
        conn.execute(
            """
            INSERT INTO user_sessions (user_id, token_hash, expires_at)
            VALUES (?, ?, ?)
            """,
            (user_id, _hash_session_token(token), expires_at.isoformat()),
        )
        conn.execute(
            "UPDATE users SET last_login_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (user_id,),
        )
        conn.commit()
    finally:
        conn.close()
    return token


def delete_user_session(token: str) -> None:
    conn = _get_connection()
    try:
        conn.execute("DELETE FROM user_sessions WHERE token_hash = ?", (_hash_session_token(token),))
        conn.commit()
    finally:
        conn.close()


def delete_sessions_for_user(user_id: int) -> None:
    conn = _get_connection()
    try:
        conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
        conn.commit()
    finally:
        conn.close()


def delete_expired_sessions() -> None:
    conn = _get_connection()
    try:
        conn.execute(
            "DELETE FROM user_sessions WHERE expires_at <= ?",
            (datetime.now(timezone.utc).isoformat(),),
        )
        conn.commit()
    finally:
        conn.close()


def get_user_by_session_token(token: str) -> Optional[dict]:
    delete_expired_sessions()
    conn = _get_connection()
    try:
        row = conn.execute(
            """
            SELECT users.*
            FROM user_sessions
            JOIN users ON users.id = user_sessions.user_id
            WHERE user_sessions.token_hash = ?
            """,
            (_hash_session_token(token),),
        ).fetchone()
        return _serialize_user(row)
    finally:
        conn.close()


def ensure_initial_admin() -> Optional[dict]:
    if count_users() > 0:
        return None

    session_secret = os.environ.get("SESSION_SECRET", "").strip()
    username = os.environ.get("INITIAL_ADMIN_USERNAME", "").strip()
    password = os.environ.get("INITIAL_ADMIN_PASSWORD", "").strip()
    display_name = os.environ.get("INITIAL_ADMIN_DISPLAY_NAME", "系统管理员").strip() or "系统管理员"
    if not session_secret:
        raise RuntimeError("SESSION_SECRET is required when initializing the first admin user")
    if not username:
        raise RuntimeError("INITIAL_ADMIN_USERNAME is required when initializing the first admin user")
    if not password:
        raise RuntimeError("INITIAL_ADMIN_PASSWORD is required when initializing the first admin user")
    return create_user(
        username=username,
        password=password,
        display_name=display_name,
        role="admin",
        status="active",
    )


def _row_to_dict(row: sqlite3.Row) -> dict:
    """将sqlite3.Row转换为普通字典"""
    return dict(row)


def create_project(
    name: str,
    description: str = "",
    mapping_data: Optional[list[dict]] = None,
) -> dict:
    """
    创建新项目。

    Args:
        name: 项目名称
        description: 项目描述
        mapping_data: 映射数据字典（存储为JSON字符串）

    Returns:
        创建的项目字典
    """
    mapping_json = json.dumps(mapping_data, ensure_ascii=False) if mapping_data is not None else None
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "INSERT INTO projects (name, description, mapping_data) VALUES (?, ?, ?)",
            (name, description, mapping_json),
        )
        conn.commit()
        project_id = cursor.lastrowid
        return get_project(project_id)
    finally:
        conn.close()


def get_project(project_id: int) -> Optional[dict]:
    """
    获取单个项目详情。

    Args:
        project_id: 项目ID

    Returns:
        项目字典，不存在返回None
    """
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM projects WHERE id = ?", (project_id,)
        ).fetchone()
        if row is None:
            return None
        result = _row_to_dict(row)
        # 解析mapping_data JSON
        if result.get("mapping_data"):
            result["mapping_data"] = json.loads(result["mapping_data"])
        return result
    finally:
        conn.close()


def list_projects() -> list[dict]:
    """
    列出所有项目。

    Returns:
        项目字典列表，按创建时间倒序
    """
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT * FROM projects ORDER BY created_at DESC, id DESC"
        ).fetchall()
        results = []
        for row in rows:
            d = _row_to_dict(row)
            if d.get("mapping_data"):
                d["mapping_data"] = json.loads(d["mapping_data"])
            results.append(d)
        return results
    finally:
        conn.close()


def update_project(
    project_id: int,
    name: Optional[str] = None,
    description: Optional[str] = None,
    mapping_data: Optional[list[dict]] = None,
) -> Optional[dict]:
    """
    更新项目信息（部分更新）。

    Args:
        project_id: 项目ID
        name: 新名称（可选）
        description: 新描述（可选）
        mapping_data: 新映射数据（可选）

    Returns:
        更新后的项目字典，不存在返回None
    """
    # 先检查项目是否存在
    existing = get_project(project_id)
    if existing is None:
        return None

    updates = []
    params = []
    if name is not None:
        updates.append("name = ?")
        params.append(name)
    if description is not None:
        updates.append("description = ?")
        params.append(description)
    if mapping_data is not None:
        updates.append("mapping_data = ?")
        params.append(json.dumps(mapping_data, ensure_ascii=False))

    if not updates:
        return existing

    updates.append("updated_at = CURRENT_TIMESTAMP")
    params.append(project_id)

    sql = f"UPDATE projects SET {', '.join(updates)} WHERE id = ?"
    conn = _get_connection()
    try:
        conn.execute(sql, params)
        conn.commit()
    finally:
        conn.close()

    return get_project(project_id)


def delete_project(project_id: int) -> bool:
    """
    删除项目（级联删除关联的分析记录）。

    Args:
        project_id: 项目ID

    Returns:
        是否成功删除（项目不存在返回False）
    """
    conn = _get_connection()
    try:
        cursor = conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_requirement_mapping(project_id: int) -> Optional[dict]:
    conn = _get_connection()
    try:
        row = conn.execute(
            """
            SELECT rm.*, p.name AS project_name
            FROM requirement_mappings rm
            JOIN projects p ON p.id = rm.project_id
            WHERE rm.project_id = ?
            """,
            (project_id,),
        ).fetchone()
        if row is None:
            return None
        result = _row_to_dict(row)
        _parse_requirement_mapping_json_fields(result)
        return result
    finally:
        conn.close()


def save_requirement_mapping(
    project_id: int,
    source_type: str,
    groups: list[dict],
    last_file_name: Optional[str] = None,
    last_file_type: Optional[str] = None,
    sheet_name: Optional[str] = None,
) -> dict:
    if source_type not in {"upload", "manual", "mixed"}:
        raise ValueError("需求映射来源类型无效")

    group_count = len(groups)
    row_count = sum(len(group.get("related_scenarios") or []) for group in groups)
    groups_json = json.dumps(groups, ensure_ascii=False)

    conn = _get_connection()
    try:
        existing = conn.execute(
            "SELECT id FROM requirement_mappings WHERE project_id = ?",
            (project_id,),
        ).fetchone()

        if existing is None:
            conn.execute(
                """
                INSERT INTO requirement_mappings (
                    project_id,
                    source_type,
                    last_file_name,
                    last_file_type,
                    sheet_name,
                    group_count,
                    row_count,
                    groups_json
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    project_id,
                    source_type,
                    last_file_name,
                    last_file_type,
                    sheet_name,
                    group_count,
                    row_count,
                    groups_json,
                ),
            )
        else:
            conn.execute(
                """
                UPDATE requirement_mappings
                SET source_type = ?,
                    last_file_name = ?,
                    last_file_type = ?,
                    sheet_name = ?,
                    group_count = ?,
                    row_count = ?,
                    groups_json = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ?
                """,
                (
                    source_type,
                    last_file_name,
                    last_file_type,
                    sheet_name,
                    group_count,
                    row_count,
                    groups_json,
                    project_id,
                ),
            )
        conn.commit()
    finally:
        conn.close()

    saved = get_requirement_mapping(project_id)
    if saved is None:
        raise RuntimeError("failed to load saved requirement mapping")
    return saved


def delete_requirement_mapping(project_id: int) -> bool:
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "DELETE FROM requirement_mappings WHERE project_id = ?",
            (project_id,),
        )
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def save_analysis_record(
    project_id: int,
    code_changes_summary: dict,
    test_coverage_result: dict,
    test_score: float,
    ai_suggestions: Optional[dict],
    token_usage: int,
    cost: float,
    duration_ms: int,
) -> dict:
    """
    保存分析记录。

    Args:
        project_id: 关联项目ID
        code_changes_summary: 代码变更摘要（JSON）
        test_coverage_result: 测试覆盖结果（JSON）
        test_score: 测试评分
        ai_suggestions: AI建议（JSON，可选）
        token_usage: Token用量
        cost: 费用
        duration_ms: 耗时（毫秒）

    Returns:
        创建的分析记录字典
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """INSERT INTO analysis_records
               (project_id, code_changes_summary, test_coverage_result,
                test_score, ai_suggestions, token_usage, cost, duration_ms)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                project_id,
                json.dumps(code_changes_summary, ensure_ascii=False),
                json.dumps(test_coverage_result, ensure_ascii=False),
                test_score,
                json.dumps(ai_suggestions, ensure_ascii=False) if ai_suggestions is not None else None,
                token_usage,
                cost,
                duration_ms,
            ),
        )
        conn.commit()
        record_id = cursor.lastrowid
        return get_analysis_record(record_id)
    finally:
        conn.close()


def get_analysis_record(record_id: int) -> Optional[dict]:
    """
    获取单条分析记录。

    Args:
        record_id: 记录ID

    Returns:
        分析记录字典，不存在返回None
    """
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM analysis_records WHERE id = ?", (record_id,)
        ).fetchone()
        if row is None:
            return None
        result = _row_to_dict(row)
        _parse_record_json_fields(result)
        return result
    finally:
        conn.close()


def list_analysis_records(
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """
    列出分析记录，支持按项目过滤和分页。

    Args:
        project_id: 按项目ID过滤（可选）
        limit: 每页数量
        offset: 偏移量

    Returns:
        分析记录字典列表
    """
    conn = _get_connection()
    try:
        if project_id is not None:
            rows = conn.execute(
                "SELECT * FROM analysis_records WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                (project_id, limit, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM analysis_records ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                (limit, offset),
            ).fetchall()
        results = []
        for row in rows:
            d = _row_to_dict(row)
            _parse_record_json_fields(d)
            results.append(d)
        return results
    finally:
        conn.close()


def save_requirement_analysis_record(
    project_id: int,
    requirement_file_name: str,
    section_snapshot: dict,
    result_snapshot: dict,
    ai_analysis: Optional[dict],
    token_usage: int,
    cost: float,
    duration_ms: int,
) -> dict:
    conn = _get_connection()
    try:
        cursor = conn.execute(
            """
            INSERT INTO requirement_analysis_records (
                project_id,
                requirement_file_name,
                section_snapshot_json,
                result_snapshot_json,
                ai_analysis_json,
                token_usage,
                cost,
                duration_ms
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                project_id,
                requirement_file_name,
                json.dumps(section_snapshot, ensure_ascii=False),
                json.dumps(result_snapshot, ensure_ascii=False),
                json.dumps(ai_analysis, ensure_ascii=False) if ai_analysis is not None else None,
                token_usage,
                cost,
                duration_ms,
            ),
        )
        conn.commit()
        return get_requirement_analysis_record(cursor.lastrowid)
    finally:
        conn.close()


def get_requirement_analysis_record(record_id: int) -> Optional[dict]:
    conn = _get_connection()
    try:
        row = conn.execute(
            """
            SELECT rar.*,
                   p.name AS project_name
            FROM requirement_analysis_records rar
            JOIN projects p ON p.id = rar.project_id
            WHERE rar.id = ?
            """,
            (record_id,),
        ).fetchone()
        if row is None:
            return None
        result = _row_to_dict(row)
        _parse_requirement_record_json_fields(result)
        return result
    finally:
        conn.close()


def list_requirement_analysis_records(
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    conn = _get_connection()
    try:
        base_sql = """
            SELECT rar.*,
                   p.name AS project_name
            FROM requirement_analysis_records rar
            JOIN projects p ON p.id = rar.project_id
        """
        params: tuple[object, ...]
        if project_id is not None:
            sql = base_sql + " WHERE rar.project_id = ? ORDER BY rar.created_at DESC, rar.id DESC LIMIT ? OFFSET ?"
            params = (project_id, limit, offset)
        else:
            sql = base_sql + " ORDER BY rar.created_at DESC, rar.id DESC LIMIT ? OFFSET ?"
            params = (limit, offset)

        rows = conn.execute(sql, params).fetchall()
        results: list[dict] = []
        for row in rows:
            item = _row_to_dict(row)
            _parse_requirement_record_json_fields(item)
            results.append(item)
        return results
    finally:
        conn.close()


def list_requirement_analysis_rules(rule_type: Optional[str] = None) -> list[dict]:
    conn = _get_connection()
    try:
        if rule_type is not None:
            rows = conn.execute(
                """
                SELECT * FROM requirement_analysis_rules
                WHERE rule_type = ?
                ORDER BY
                    CASE rule_source WHEN 'default' THEN 0 ELSE 1 END,
                    created_at DESC,
                    id DESC
                """,
                (rule_type,),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT * FROM requirement_analysis_rules
                ORDER BY
                    CASE rule_source WHEN 'default' THEN 0 ELSE 1 END,
                    CASE rule_type WHEN 'ignore' THEN 0 ELSE 1 END,
                    created_at DESC,
                    id DESC
                """
            ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def create_requirement_analysis_rule(rule_type: str, keyword: str) -> dict:
    normalized_rule_type = rule_type.strip().lower()
    normalized_keyword = keyword.strip().lower()
    if normalized_rule_type not in {"ignore", "allow"}:
        raise ValueError("规则类型无效")
    if not normalized_keyword:
        raise ValueError("规则词不能为空")

    conn = _get_connection()
    try:
        existing = conn.execute(
            """
            SELECT * FROM requirement_analysis_rules
            WHERE rule_type = ? AND keyword = ?
            """,
            (normalized_rule_type, normalized_keyword),
        ).fetchone()
        if existing is not None:
            return _row_to_dict(existing)

        cursor = conn.execute(
            """
            INSERT INTO requirement_analysis_rules (rule_type, keyword, rule_source)
            VALUES (?, ?, 'custom')
            """,
            (normalized_rule_type, normalized_keyword),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM requirement_analysis_rules WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


def update_requirement_analysis_rule(rule_id: int, rule_type: str, keyword: str) -> Optional[dict]:
    normalized_rule_type = rule_type.strip().lower()
    normalized_keyword = keyword.strip().lower()
    if normalized_rule_type not in {"ignore", "allow"}:
        raise ValueError("规则类型无效")
    if not normalized_keyword:
        raise ValueError("规则词不能为空")

    conn = _get_connection()
    try:
        existing = conn.execute(
            "SELECT * FROM requirement_analysis_rules WHERE id = ?",
            (rule_id,),
        ).fetchone()
        if existing is None:
            return None

        duplicate = conn.execute(
            """
            SELECT id
            FROM requirement_analysis_rules
            WHERE rule_type = ? AND keyword = ? AND id <> ?
            """,
            (normalized_rule_type, normalized_keyword, rule_id),
        ).fetchone()
        if duplicate is not None:
            raise ValueError("相同规则已存在")

        current = _row_to_dict(existing)
        rule_source = current.get("rule_source", "custom")
        if rule_source == "default" and normalized_rule_type != "ignore":
            rule_source = "custom"

        conn.execute(
            """
            UPDATE requirement_analysis_rules
            SET rule_type = ?, keyword = ?, rule_source = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (normalized_rule_type, normalized_keyword, rule_source, rule_id),
        )
        conn.commit()
        row = conn.execute(
            "SELECT * FROM requirement_analysis_rules WHERE id = ?",
            (rule_id,),
        ).fetchone()
        return _row_to_dict(row) if row is not None else None
    finally:
        conn.close()


def delete_requirement_analysis_rule(rule_id: int) -> bool:
    conn = _get_connection()
    try:
        cursor = conn.execute("DELETE FROM requirement_analysis_rules WHERE id = ?", (rule_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_project_stats(project_id: int) -> dict:
    """
    获取项目统计信息。

    Args:
        project_id: 项目ID

    Returns:
        包含分析次数、平均分、最近分析时间的字典
    """
    conn = _get_connection()
    try:
        row = conn.execute(
            """SELECT
                COUNT(*) as analysis_count,
                AVG(test_score) as avg_score,
                MAX(created_at) as latest_analysis_date
               FROM analysis_records
               WHERE project_id = ?""",
            (project_id,),
        ).fetchone()
        result = _row_to_dict(row)
        return {
            "analysis_count": result["analysis_count"],
            "avg_score": round(result["avg_score"], 2) if result["avg_score"] is not None else None,
            "latest_analysis_date": result["latest_analysis_date"],
        }
    finally:
        conn.close()


def _parse_record_json_fields(record: dict) -> None:
    """解析分析记录中的JSON字段"""
    for field in ("code_changes_summary", "test_coverage_result", "ai_suggestions"):
        if record.get(field):
            record[field] = json.loads(record[field])


def _parse_requirement_record_json_fields(record: dict) -> None:
    for field in ("section_snapshot_json", "result_snapshot_json", "ai_analysis_json"):
        if record.get(field):
            record[field] = json.loads(record[field])


def _parse_requirement_mapping_json_fields(record: dict) -> None:
    if record.get("groups_json"):
        record["groups"] = json.loads(record["groups_json"])
    else:
        record["groups"] = []
    record.pop("groups_json", None)


# ============ 全局映射管理 ============

def save_global_mapping(name: str, mapping_data: list[dict], row_count: int) -> dict:
    """
    保存全局映射数据。

    Args:
        name: 映射文件名
        mapping_data: 解析后的映射条目列表
        row_count: 映射条目数量

    Returns:
        创建的映射记录字典
    """
    conn = _get_connection()
    try:
        cursor = conn.execute(
            "INSERT INTO global_mapping (name, mapping_data, row_count) VALUES (?, ?, ?)",
            (name, json.dumps(mapping_data, ensure_ascii=False), row_count),
        )
        conn.commit()
        mapping_id = cursor.lastrowid
        return get_global_mapping(mapping_id)
    finally:
        conn.close()


def get_global_mapping(mapping_id: int) -> Optional[dict]:
    """获取单条全局映射。"""
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM global_mapping WHERE id = ?", (mapping_id,)
        ).fetchone()
        if row is None:
            return None
        result = _row_to_dict(row)
        if result.get("mapping_data"):
            result["mapping_data"] = json.loads(result["mapping_data"])
        return result
    finally:
        conn.close()


def list_global_mappings() -> list[dict]:
    """列出所有全局映射，按创建时间倒序。"""
    conn = _get_connection()
    try:
        rows = conn.execute(
            "SELECT id, name, row_count, created_at FROM global_mapping ORDER BY created_at DESC, id DESC"
        ).fetchall()
        return [_row_to_dict(row) for row in rows]
    finally:
        conn.close()


def get_latest_global_mapping() -> Optional[dict]:
    """获取最新的全局映射数据（用于分析时自动使用）。"""
    conn = _get_connection()
    try:
        row = conn.execute(
            "SELECT * FROM global_mapping ORDER BY created_at DESC, id DESC LIMIT 1"
        ).fetchone()
        if row is None:
            return None
        result = _row_to_dict(row)
        if result.get("mapping_data"):
            result["mapping_data"] = json.loads(result["mapping_data"])
        return result
    finally:
        conn.close()


def delete_global_mapping(mapping_id: int) -> bool:
    """删除全局映射。"""
    conn = _get_connection()
    try:
        cursor = conn.execute("DELETE FROM global_mapping WHERE id = ?", (mapping_id,))
        conn.commit()
        return cursor.rowcount > 0
    finally:
        conn.close()

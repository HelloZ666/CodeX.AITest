import sqlite3

import pytest

from services.database import (
    authenticate_user,
    count_users,
    create_user,
    create_user_session,
    ensure_initial_admin,
    get_user_by_username,
    get_user_by_session_token,
    init_db,
    upsert_external_user,
    verify_password,
)


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "auth_test.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    init_db()
    return db_path


def test_init_db_creates_auth_tables(temp_db):
    conn = sqlite3.connect(temp_db)
    try:
        rows = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    finally:
        conn.close()
    table_names = {row[0] for row in rows}
    assert "users" in table_names
    assert "user_sessions" in table_names


def test_ensure_initial_admin_creates_first_admin():
    admin = ensure_initial_admin()
    assert admin is not None
    assert admin["username"] == "admin"
    assert admin["role"] == "admin"
    assert count_users() == 1


def test_password_hash_and_authenticate():
    created = create_user(
        username="tester",
        password="Secret123!",
        display_name="测试用户",
        role="user",
    )

    authenticated = authenticate_user("tester", "Secret123!")
    rejected = authenticate_user("tester", "Wrong123!")

    assert created["username"] == "tester"
    assert authenticated is not None
    assert authenticated["id"] == created["id"]
    assert rejected is None


def test_verify_password_matches_hash(temp_db):
    user = create_user(
        username="hashuser",
        password="Hash12345!",
        display_name="哈希用户",
        role="user",
    )
    stored = authenticate_user("hashuser", "Hash12345!")
    assert stored is not None

    conn = sqlite3.connect(temp_db)  # type: ignore[name-defined]
    conn.row_factory = sqlite3.Row
    try:
        row = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user["id"],)).fetchone()
    finally:
        conn.close()

    assert row is not None
    assert verify_password("Hash12345!", row["password_hash"])


def test_session_token_resolves_user():
    user = create_user(
        username="sessionuser",
        password="Session123!",
        display_name="会话用户",
        role="user",
    )

    token = create_user_session(user["id"], duration_days=7)
    resolved = get_user_by_session_token(token)

    assert resolved is not None
    assert resolved["id"] == user["id"]


def test_expired_session_is_rejected():
    user = create_user(
        username="expireduser",
        password="Expired123!",
        display_name="过期用户",
        role="user",
    )

    token = create_user_session(user["id"], duration_days=-1)

    assert get_user_by_session_token(token) is None


def test_external_user_is_created_and_not_authenticated_by_local_password():
    synced = upsert_external_user(
        username="zhangyong-135",
        display_name="张勇",
        email="zhangyong-135@cpic.com.cn",
        external_profile={"deptname": "业务二部"},
    )

    stored = get_user_by_username("zhangyong-135")

    assert synced["auth_source"] == "external"
    assert stored is not None
    assert stored["email"] == "zhangyong-135@cpic.com.cn"
    assert authenticate_user("zhangyong-135", "any-password") is None


def test_upsert_external_user_preserves_role_and_status(temp_db):
    synced = upsert_external_user(
        username="c_jishaoliang-001",
        display_name="纪少良",
        email="old@example.com",
        external_profile={"deptname": "旧部门"},
    )

    conn = sqlite3.connect(temp_db)  # type: ignore[name-defined]
    try:
        conn.execute(
            "UPDATE users SET role = 'admin', status = 'disabled' WHERE id = ?",
            (synced["id"],),
        )
        conn.commit()
    finally:
        conn.close()

    updated = upsert_external_user(
        username="c_jishaoliang-001",
        display_name="纪少良新",
        email="new@example.com",
        external_profile={"deptname": "新部门"},
    )

    assert updated["role"] == "admin"
    assert updated["status"] == "disabled"
    assert updated["display_name"] == "纪少良新"
    assert updated["email"] == "new@example.com"

import sqlite3

import pytest

from services.database import init_db


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "validation_store.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    import services.database_validation_store as validation_store

    monkeypatch.setattr(validation_store, "get_db_path", lambda: db_path)
    init_db()
    from services.database import ensure_initial_admin

    ensure_initial_admin()
    return db_path


@pytest.fixture
def external_sqlite_db(tmp_path):
    db_path = tmp_path / "business.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE policy (
                id TEXT PRIMARY KEY,
                policy_no TEXT NOT NULL,
                status TEXT,
                amount REAL,
                created_at TEXT
            );
            INSERT INTO policy (id, policy_no, status, amount, created_at) VALUES
                ('P001', 'NO-001', 'active', 100.0, '2026-05-01 10:00:00'),
                ('P002', 'NO-002', NULL, 150.0, '2026-05-01 11:00:00'),
                ('P003', 'NO-003', 'pending', 200.0, '2026-05-02 08:00:00');
            """
        )
        conn.commit()
    finally:
        conn.close()
    return db_path


@pytest.fixture
def target_sqlite_db(tmp_path):
    db_path = tmp_path / "target.db"
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE policy_shadow (
                id TEXT PRIMARY KEY,
                policy_no TEXT NOT NULL,
                status TEXT,
                amount REAL
            );
            INSERT INTO policy_shadow (id, policy_no, status, amount) VALUES
                ('P001', 'NO-001', 'active', 100.0),
                ('P002', 'NO-002', 'inactive', 150.0);
            """
        )
        conn.commit()
    finally:
        conn.close()
    return db_path


def test_database_config_crud_and_sqlite_metadata(external_sqlite_db):
    from services.database_validation_store import (
        create_database_config,
        get_database_columns,
        list_database_configs,
        list_database_tables,
        test_database_config,
        update_database_config,
    )

    created = create_database_config(
        {
            "name": "保单库",
            "db_type": "sqlite",
            "sqlite_path": str(external_sqlite_db),
            "description": "外部业务库",
        }
    )

    assert created["id"] > 0
    assert created["name"] == "保单库"
    assert created["db_type"] == "sqlite"
    assert created["password"] == ""

    test_result = test_database_config(created["id"])
    assert test_result["success"] is True
    assert test_result["table_count"] == 1

    tables = list_database_tables(created["id"], refresh=True)
    assert [table["table_name"] for table in tables] == ["policy"]

    columns = get_database_columns(created["id"], "policy", refresh=True)
    assert [column["column_name"] for column in columns] == ["id", "policy_no", "status", "amount", "created_at"]

    updated = update_database_config(created["id"], {"name": "保单库-更新"})
    assert updated["name"] == "保单库-更新"
    assert list_database_configs()[0]["name"] == "保单库-更新"


def test_e2e_run_compares_fields_across_database_configs(external_sqlite_db, target_sqlite_db):
    from services.database_validation_store import create_database_config, create_e2e_test_run

    source = create_database_config(
        {"name": "核心库", "db_type": "sqlite", "sqlite_path": str(external_sqlite_db)}
    )
    target = create_database_config(
        {"name": "影子库", "db_type": "sqlite", "sqlite_path": str(target_sqlite_db)}
    )

    run = create_e2e_test_run(
        {
            "name": "保单状态一致性",
            "primary_database_config_id": source["id"],
            "primary_table": "policy",
            "primary_key_column": "id",
            "compare_columns": ["status", "amount"],
            "key_values": ["P001", "P002", "P404"],
            "target_systems": [
                {
                    "database_config_id": target["id"],
                    "system_name": "下游库",
                    "table_name": "policy_shadow",
                    "primary_key_column": "id",
                }
            ],
        }
    )

    assert run["total_count"] == 6
    assert run["passed_count"] == 3
    assert run["failed_count"] == 3
    assert run["status"] == "failed"
    failed_items = [item for item in run["items"] if item["status"] == "failed"]
    assert any(item["key_value"] == "P002" and item["column_name"] == "status" for item in failed_items)
    assert any(item["key_value"] == "P404" for item in failed_items)


def test_regression_scan_supports_not_null_and_enum_count_rules(external_sqlite_db):
    from services.database_validation_store import create_database_config, create_regression_scan

    config = create_database_config(
        {"name": "回归库", "db_type": "sqlite", "sqlite_path": str(external_sqlite_db)}
    )

    scan = create_regression_scan(
        {
            "name": "保单字段回归",
            "database_config_id": config["id"],
            "table_name": "policy",
            "created_at_column": "created_at",
            "start_time": "2026-05-01 00:00:00",
            "end_time": "2026-05-01 23:59:59",
            "rules": [
                {"column_name": "status", "rule_type": "not_null"},
                {
                    "column_name": "status",
                    "rule_type": "enum_count",
                    "expected_values": ["active"],
                    "min_count": 1,
                },
            ],
        }
    )

    assert scan["total_rules"] == 2
    assert scan["passed_rules"] == 1
    assert scan["failed_rules"] == 1
    assert scan["status"] == "failed"
    not_null_result = next(item for item in scan["items"] if item["rule_type"] == "not_null")
    enum_result = next(item for item in scan["items"] if item["rule_type"] == "enum_count")
    assert not_null_result["status"] == "failed"
    assert not_null_result["failed_count"] == 1
    assert enum_result["status"] == "passed"
    assert enum_result["checked_count"] == 1


def test_database_config_api_accepts_frontend_schema_alias(external_sqlite_db):
    from fastapi.testclient import TestClient
    from index import app

    with TestClient(app) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "Admin123!"},
        )
        assert login_response.status_code == 200

        create_response = client.post(
            "/api/config-management/database-configs",
            json={
                "name": "接口配置库",
                "db_type": "sqlite",
                "sqlite_path": str(external_sqlite_db),
                "schema": "main",
            },
        )
        assert create_response.status_code == 200
        config = create_response.json()["data"]
        assert config["schema"] == "main"

        test_response = client.post(f"/api/config-management/database-configs/{config['id']}/test")
        assert test_response.status_code == 200
        assert test_response.json()["data"]["success"] is True


def test_mysql_connection_failure_returns_actionable_api_error(monkeypatch):
    from fastapi.testclient import TestClient
    from index import app
    import services.external_database as external_database

    class FakePyMySQL:
        class cursors:
            DictCursor = object

        @staticmethod
        def connect(**_kwargs):
            raise OSError("connection refused")

    monkeypatch.setattr(external_database, "_import_optional_driver", lambda *_args: FakePyMySQL)

    with TestClient(app) as client:
        login_response = client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "Admin123!"},
        )
        assert login_response.status_code == 200

        create_response = client.post(
            "/api/config-management/database-configs",
            json={
                "name": "错误端口 MySQL",
                "db_type": "mysql",
                "host": "29.16.16.33",
                "port": 22,
                "database": "txq",
                "username": "admin",
                "password": "wrong",
            },
        )
        assert create_response.status_code == 200
        config = create_response.json()["data"]

        test_response = client.post(f"/api/config-management/database-configs/{config['id']}/test")
        assert test_response.status_code == 400
        detail = test_response.json()["detail"]
        assert "数据库连接失败" in detail
        assert "29.16.16.33:22/txq" in detail
        assert "MySQL 通常使用 3306" in detail

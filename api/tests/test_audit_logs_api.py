from fastapi.testclient import TestClient
import pytest

from services.database import create_audit_log, init_db


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "audit_logs_api.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    init_db()
    return db_path


@pytest.fixture
def client():
    from index import app

    with TestClient(app) as test_client:
        yield test_client


def login_as(client: TestClient, username: str, password: str):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def login_as_admin(client: TestClient):
    response = login_as(client, "admin", "Admin123!")
    assert response.status_code == 200
    return response


def to_utf8_gbk_mojibake(value: str) -> str:
    return value.encode("utf-8").decode("gbk", errors="ignore")


def test_admin_can_list_audit_logs_after_login_and_user_creation(client: TestClient):
    login_as_admin(client)
    create_response = client.post(
        "/api/users",
        json={
            "username": "operator",
            "password": "Operator123!",
            "display_name": "运营同学",
            "role": "user",
        },
    )

    assert create_response.status_code == 200

    logs_response = client.get("/api/audit-logs")

    assert logs_response.status_code == 200
    payload = logs_response.json()
    assert payload["total"] >= 2
    actions = [item["action"] for item in payload["data"]]
    assert "创建用户" in actions
    assert "登录" in actions


def test_non_admin_cannot_access_audit_logs(client: TestClient):
    login_as_admin(client)
    create_response = client.post(
        "/api/users",
        json={
            "username": "reader",
            "password": "Reader123!",
            "display_name": "普通用户",
            "role": "user",
        },
    )
    assert create_response.status_code == 200
    client.post("/api/auth/logout")

    login_response = login_as(client, "reader", "Reader123!")
    assert login_response.status_code == 200

    logs_response = client.get("/api/audit-logs")

    assert logs_response.status_code == 403


def test_admin_can_view_legacy_case_generation_logs_in_chinese(client: TestClient):
    create_audit_log(
        module="functional-testing",
        action="generate-test-cases",
        target_type="functional-test-case-record",
        target_id="99",
        target_name="需求说明.docx",
        file_name="需求说明.docx",
        result="success",
        detail="generated and saved 3 cases",
        operator_user_id=1,
        operator_username="admin",
        operator_display_name="系统管理员",
        operator_role="admin",
        request_method="POST",
        request_path="/api/functional-testing/case-generation/generate",
        ip_address="127.0.0.1",
        user_agent="pytest",
        metadata={"record_id": 99, "case_count": 3},
    )

    login_as_admin(client)
    logs_response = client.get("/api/audit-logs", params={"module": "功能测试"})

    assert logs_response.status_code == 200
    payload = logs_response.json()
    assert payload["total"] >= 1
    generation_log = next(
        item for item in payload["data"] if item["request_path"] == "/api/functional-testing/case-generation/generate"
    )
    assert generation_log["module"] == "功能测试"
    assert generation_log["action"] == "生成测试用例"
    assert generation_log["target_type"] == "测试案例记录"
    assert generation_log["detail"] == "已生成并保存 3 条测试用例"


def test_admin_can_view_mojibake_case_generation_logs_in_chinese(client: TestClient):
    create_audit_log(
        module=to_utf8_gbk_mojibake("功能测试"),
        action=to_utf8_gbk_mojibake("生成测试用例"),
        target_type=to_utf8_gbk_mojibake("测试案例记录"),
        target_id="100",
        target_name="需求说明.docx",
        file_name="需求说明.docx",
        result="success",
        detail=to_utf8_gbk_mojibake("已生成并保存 5 条测试用例"),
        operator_user_id=1,
        operator_username="admin",
        operator_display_name=to_utf8_gbk_mojibake("系统管理员"),
        operator_role="admin",
        request_method="POST",
        request_path="/api/functional-testing/case-generation/generate",
        ip_address="127.0.0.1",
        user_agent="pytest",
        metadata={"record_id": 100, "case_count": 5},
    )

    login_as_admin(client)
    logs_response = client.get("/api/audit-logs", params={"module": "功能测试"})

    assert logs_response.status_code == 200
    payload = logs_response.json()
    generation_log = next(
        item for item in payload["data"] if item["target_id"] == "100"
    )
    assert generation_log["module"] == "功能测试"
    assert generation_log["action"] == "生成测试用例"
    assert generation_log["target_type"] == "测试案例记录"
    assert generation_log["detail"] == "已生成并保存 5 条测试用例"

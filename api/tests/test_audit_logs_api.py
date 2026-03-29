from fastapi.testclient import TestClient
import pytest

from services.database import init_db


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

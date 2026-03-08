import pytest
from fastapi.testclient import TestClient

from services.database import init_db


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "auth_api.db")
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


def test_login_success_sets_session_cookie(client: TestClient):
    response = login_as_admin(client)

    assert response.status_code == 200
    assert response.json()["user"]["username"] == "admin"
    assert "codetestguard_session" in response.cookies


def test_login_with_invalid_password_returns_401(client: TestClient):
    response = login_as(client, "admin", "wrong-password")

    assert response.status_code == 401


def test_auth_me_requires_session(client: TestClient):
    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_auth_me_returns_current_user_after_login(client: TestClient):
    login_as_admin(client)

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json()["role"] == "admin"


def test_logout_invalidates_session(client: TestClient):
    login_as_admin(client)

    logout_response = client.post("/api/auth/logout")
    me_response = client.get("/api/auth/me")

    assert logout_response.status_code == 200
    assert me_response.status_code == 401


def test_protected_business_api_requires_authentication(client: TestClient):
    response = client.get("/api/projects")

    assert response.status_code == 401


def test_admin_can_create_update_filter_and_reset_users(client: TestClient):
    login_as_admin(client)

    create_response = client.post(
        "/api/users",
        json={
            "username": "operator",
            "password": "Operator123!",
            "display_name": "运营同学",
            "email": "operator@example.com",
            "role": "user",
        },
    )
    assert create_response.status_code == 200
    user_id = create_response.json()["id"]

    list_response = client.get("/api/users", params={"keyword": "operator"})
    update_response = client.put(
        f"/api/users/{user_id}",
        json={"display_name": "运营负责人", "email": "owner@example.com", "role": "admin"},
    )
    status_response = client.put(f"/api/users/{user_id}/status", json={"status": "disabled"})
    password_response = client.put(f"/api/users/{user_id}/password", json={"password": "Reset12345!"})

    assert list_response.status_code == 200
    assert len(list_response.json()["data"]) == 1
    assert update_response.status_code == 200
    assert update_response.json()["role"] == "admin"
    assert status_response.status_code == 200
    assert status_response.json()["status"] == "disabled"
    assert password_response.status_code == 200


def test_disabled_user_cannot_login(client: TestClient):
    login_as_admin(client)
    create_response = client.post(
        "/api/users",
        json={
            "username": "disabled-user",
            "password": "Disabled123!",
            "display_name": "禁用用户",
            "role": "user",
        },
    )
    user_id = create_response.json()["id"]
    client.put(f"/api/users/{user_id}/status", json={"status": "disabled"})
    client.post("/api/auth/logout")

    login_response = login_as(client, "disabled-user", "Disabled123!")

    assert login_response.status_code == 403


def test_non_admin_cannot_access_user_management(client: TestClient):
    login_as_admin(client)
    create_response = client.post(
        "/api/users",
        json={
            "username": "reader",
            "password": "Reader123!",
            "display_name": "普通账号",
            "role": "user",
        },
    )
    assert create_response.status_code == 200
    client.post("/api/auth/logout")

    login_response = login_as(client, "reader", "Reader123!")
    assert login_response.status_code == 200

    response = client.get("/api/users")

    assert response.status_code == 403

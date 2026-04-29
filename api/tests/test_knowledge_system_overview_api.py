import json

import pytest
from fastapi.testclient import TestClient

from services.database import ensure_initial_admin, init_db


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_knowledge_system_overview.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.production_issue_file_store.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.test_issue_file_store.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.config_library_store.get_db_path", lambda: db_path)
    init_db()
    ensure_initial_admin()
    return db_path


@pytest.fixture
def client():
    from index import app

    with TestClient(app) as test_client:
        login_resp = test_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "Admin123!"},
        )
        assert login_resp.status_code == 200
        yield test_client


def create_project(client: TestClient, name: str) -> dict:
    response = client.post("/api/projects", json={"name": name, "description": ""})
    assert response.status_code == 200
    return response.json()["data"]


def test_create_list_update_and_delete_knowledge_system_overview(client: TestClient):
    project = create_project(client, "核心承保系统")

    create_resp = client.post(
        "/api/knowledge-base/system-overviews",
        json={
            "project_id": project["id"],
            "title": "核心承保系统全景图",
            "outline_category": "通用模板",
            "description": "覆盖核心模块关系",
        },
    )
    assert create_resp.status_code == 200
    created = create_resp.json()["data"]
    assert created["project_name"] == "核心承保系统"
    assert created["outline_category"] == "通用模板"
    assert created["creator_username"] == "admin"
    assert created["mind_map_data"]["root"]["data"]["text"] == "核心承保系统全景图"

    list_resp = client.get("/api/knowledge-base/system-overviews")
    assert list_resp.status_code == 200
    list_data = list_resp.json()["data"]
    assert len(list_data) == 1
    assert list_data[0]["project_name"] == "核心承保系统"

    update_resp = client.put(
        f"/api/knowledge-base/system-overviews/{created['id']}",
        json={
            "title": "核心承保系统功能图",
            "outline_category": "功能视图",
            "description": "更新后的说明",
            "source_format": "markdown",
            "source_file_name": "overview.md",
            "mind_map_data": {
                "layout": "logicalStructure",
                "root": {
                    "data": {"text": "核心承保系统功能图", "expand": True},
                    "children": [
                        {"data": {"text": "投保流程", "expand": True}, "children": []},
                        {"data": {"text": "保单中心", "expand": True}, "children": []},
                    ],
                },
            },
        },
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()["data"]
    assert updated["title"] == "核心承保系统功能图"
    assert updated["outline_category"] == "功能视图"
    assert updated["source_format"] == "markdown"
    assert updated["source_file_name"] == "overview.md"
    assert updated["mind_map_data"]["root"]["children"][0]["data"]["text"] == "投保流程"

    detail_resp = client.get(f"/api/knowledge-base/system-overviews/{created['id']}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()["data"]
    assert detail["description"] == "更新后的说明"
    assert len(detail["mind_map_data"]["root"]["children"]) == 2

    delete_resp = client.delete(f"/api/knowledge-base/system-overviews/{created['id']}")
    assert delete_resp.status_code == 200

    final_list_resp = client.get("/api/knowledge-base/system-overviews")
    assert final_list_resp.status_code == 200
    assert final_list_resp.json()["data"] == []


def test_allows_multiple_overviews_under_one_project(client: TestClient):
    project = create_project(client, "多大纲项目")

    first_resp = client.post(
        "/api/knowledge-base/system-overviews",
        json={"project_id": project["id"], "title": "第一次"},
    )
    assert first_resp.status_code == 200

    second_resp = client.post(
        "/api/knowledge-base/system-overviews",
        json={"project_id": project["id"], "title": "第二次", "outline_category": "通用模板"},
    )
    assert second_resp.status_code == 200
    second = second_resp.json()["data"]
    assert second["project_id"] == project["id"]
    assert second["outline_category"] == "通用模板"

    list_resp = client.get("/api/knowledge-base/system-overviews")
    assert list_resp.status_code == 200
    list_data = list_resp.json()["data"]
    assert len(list_data) == 2
    assert {item["title"] for item in list_data} == {"第一次", "第二次"}
    assert {item["project_id"] for item in list_data} == {project["id"]}

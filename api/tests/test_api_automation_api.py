import json
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from services.database import init_db


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_api_automation.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.production_issue_file_store.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.test_issue_file_store.get_db_path", lambda: db_path)
    init_db()
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


def build_openapi_bytes() -> bytes:
    spec = {
        "openapi": "3.0.1",
        "info": {"title": "接口自动化文档", "version": "1.0"},
        "paths": {
            "/auth/login": {
                "post": {
                    "tags": ["认证"],
                    "summary": "登录",
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "username": {"type": "string"},
                                        "password": {"type": "string"},
                                    },
                                },
                            },
                        },
                    },
                    "responses": {
                        "200": {
                            "description": "ok",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {"token": {"type": "string"}},
                                    },
                                },
                            },
                        },
                    },
                },
            },
            "/sales/visit/query": {
                "post": {
                    "tags": ["面访"],
                    "summary": "业务员面访数据查询",
                    "requestBody": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {
                                        "employeeIds": {"type": "string"},
                                        "queryDate": {"type": "string"},
                                    },
                                },
                            },
                        },
                    },
                    "responses": {
                        "200": {
                            "description": "ok",
                            "content": {
                                "application/json": {
                                    "schema": {
                                        "type": "object",
                                        "properties": {
                                            "data": {"type": "array"},
                                        },
                                    },
                                },
                            },
                        },
                        "401": {"description": "unauthorized"},
                    },
                },
            },
        },
    }
    return json.dumps(spec, ensure_ascii=False).encode("utf-8")


def build_mock_report(case_id: str, case_title: str, endpoint_id: str, suite_id: int) -> dict:
    return {
        "overview": {
            "status": "completed",
            "total_cases": 1,
            "passed_cases": 1,
            "failed_cases": 0,
            "blocked_cases": 0,
            "pass_rate": 100.0,
            "duration_ms": 38,
        },
        "environment_snapshot": {
            "base_url": "http://example.test",
            "auth_mode": "bearer",
        },
        "suite_snapshot": {
            "suite_id": suite_id,
        },
        "endpoint_distribution": [
            {"endpoint_id": endpoint_id, "count": 1},
        ],
        "items": [
            {
                "case_id": case_id,
                "case_title": case_title,
                "endpoint_id": endpoint_id,
                "status": "passed",
                "duration_ms": 38,
                "request_snapshot": {"url": "/sales/visit/query"},
                "response_snapshot": {"status_code": 200},
                "assertion_results": [],
                "extracted_variables": {"token": "abc123"},
                "error_message": None,
            },
        ],
        "runtime_variables": {"token": "abc123"},
        "failure_reasons": [],
    }


def test_api_automation_full_flow(client):
    create_project_resp = client.post("/api/projects", json={"name": "接口自动化项目"})
    assert create_project_resp.status_code == 200
    project_id = create_project_resp.json()["data"]["id"]

    get_env_resp = client.get(f"/api/projects/{project_id}/api-automation/environment")
    assert get_env_resp.status_code == 200
    assert get_env_resp.json()["data"]["auth_mode"] == "none"

    save_env_resp = client.put(
        f"/api/projects/{project_id}/api-automation/environment",
        json={
            "base_url": "http://example.test",
            "timeout_ms": 15000,
            "auth_mode": "bearer",
            "common_headers": {"Content-Type": "application/json"},
            "auth_config": {"token": "fixed-token"},
            "signature_template": {
                "enabled": True,
                "algorithm": "md5",
                "fixed_fields": {"saltValue": "xJ54&8b$60"},
            },
            "login_binding": {"endpoint_id": "post-auth-login"},
        },
    )
    assert save_env_resp.status_code == 200
    assert save_env_resp.json()["data"]["base_url"] == "http://example.test"
    assert save_env_resp.json()["data"]["auth_mode"] == "bearer"

    upload_resp = client.post(
        f"/api/projects/{project_id}/api-automation/documents",
        data={"use_ai": "false"},
        files={
            "document_file": (
                "openapi.json",
                build_openapi_bytes(),
                "application/json",
            ),
        },
    )
    assert upload_resp.status_code == 200
    document_data = upload_resp.json()["data"]
    assert document_data["endpoint_count"] == 2
    assert document_data["source_type"] == "openapi"

    latest_doc_resp = client.get(f"/api/projects/{project_id}/api-automation/documents/latest")
    assert latest_doc_resp.status_code == 200
    assert latest_doc_resp.json()["data"]["file_name"] == "openapi.json"

    generate_resp = client.post(
        f"/api/projects/{project_id}/api-automation/cases/generate",
        json={"use_ai": False, "name": "首版接口套件"},
    )
    assert generate_resp.status_code == 200
    suite_data = generate_resp.json()["data"]
    assert suite_data["name"] == "首版接口套件"
    assert suite_data["cases"]

    update_suite_resp = client.put(
        f"/api/projects/{project_id}/api-automation/suites/{suite_data['id']}",
        json={
            "name": "首版接口套件-已编辑",
            "endpoints": suite_data["endpoints"],
            "cases": suite_data["cases"],
        },
    )
    assert update_suite_resp.status_code == 200
    assert update_suite_resp.json()["data"]["name"] == "首版接口套件-已编辑"

    first_case = suite_data["cases"][0]
    report_payload = build_mock_report(
        case_id=first_case["case_id"],
        case_title=first_case["title"],
        endpoint_id=first_case["endpoint_id"],
        suite_id=suite_data["id"],
    )

    with patch("index.execute_api_test_suite", new_callable=AsyncMock, return_value=report_payload):
        create_run_resp = client.post(
            f"/api/projects/{project_id}/api-automation/runs",
            json={"suite_id": suite_data["id"]},
        )

    assert create_run_resp.status_code == 200
    run_data = create_run_resp.json()["data"]
    assert run_data["status"] == "completed"
    assert run_data["passed_cases"] == 1
    assert run_data["items"][0]["case_id"] == first_case["case_id"]

    list_runs_resp = client.get(f"/api/projects/{project_id}/api-automation/runs")
    assert list_runs_resp.status_code == 200
    assert len(list_runs_resp.json()["data"]) == 1

    get_run_resp = client.get(f"/api/projects/{project_id}/api-automation/runs/{run_data['id']}")
    assert get_run_resp.status_code == 200
    assert get_run_resp.json()["data"]["report_snapshot"]["runtime_variables"]["token"] == "abc123"

    get_report_resp = client.get(f"/api/projects/{project_id}/api-automation/runs/{run_data['id']}/report")
    assert get_report_resp.status_code == 200
    assert get_report_resp.json()["data"]["overview"]["passed_cases"] == 1

    with patch("index.execute_api_test_suite", new_callable=AsyncMock, return_value=report_payload):
        rerun_resp = client.post(f"/api/projects/{project_id}/api-automation/runs/{run_data['id']}/rerun")

    assert rerun_resp.status_code == 200
    rerun_data = rerun_resp.json()["data"]
    assert rerun_data["id"] != run_data["id"]
    assert rerun_data["items"][0]["status"] == "passed"

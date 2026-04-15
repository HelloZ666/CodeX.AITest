import io
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from docx import Document
from fastapi.testclient import TestClient

from services.database import ensure_initial_admin, init_db


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_config_management_assets.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.production_issue_file_store.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.test_issue_file_store.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.config_library_store.get_db_path", lambda: db_path)
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("INITIAL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "password123")
    monkeypatch.setenv("INITIAL_ADMIN_DISPLAY_NAME", "测试管理员")
    init_db()
    ensure_initial_admin()
    return db_path


@pytest.fixture
def client():
    from index import app

    with TestClient(app) as test_client:
        login_resp = test_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password123"},
        )
        assert login_resp.status_code == 200
        yield test_client


def build_requirement_docx() -> bytes:
    document = Document()
    document.add_paragraph("4.1 功能描述")
    document.add_paragraph("新增投保资格校验，未满足资格条件时禁止提交，并提示原因。")
    document.add_paragraph("4.4 界面")
    document.add_paragraph("资格校验失败时，页面需要展示显著提示文案和弹窗引导。")

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def test_case_generation_assets_are_deduplicated(client: TestClient):
    requirement_bytes = build_requirement_docx()

    with patch(
        "services.requirement_case_generator.call_deepseek",
        new=AsyncMock(return_value={
            "result": {
                "summary": "覆盖了资格校验失败场景。",
                "cases": [
                    {
                        "case_id": "TC-001",
                        "description": "资格校验失败时禁止提交",
                        "steps": "1. 输入不满足条件的数据\n2. 点击提交",
                        "expected_result": "系统阻止提交，并提示资格校验失败原因。",
                    }
                ],
            },
            "usage": {
                "prompt_tokens": 80,
                "completion_tokens": 40,
                "total_tokens": 120,
                "prompt_cache_hit_tokens": 0,
                "prompt_cache_miss_tokens": 80,
            },
            "provider": "DeepSeek",
            "provider_key": "deepseek",
        }),
    ):
        for _ in range(2):
            response = client.post(
                "/api/functional-testing/case-generation/generate",
                data={"source_page": "案例生成"},
                files={
                    "requirement_file": (
                        "requirement.docx",
                        requirement_bytes,
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    )
                },
            )
            assert response.status_code == 200

    documents_response = client.get("/api/config-management/requirement-documents")
    assert documents_response.status_code == 200
    documents = documents_response.json()["data"]
    assert len(documents) == 1
    assert documents[0]["file_name"] == "requirement.docx"
    assert documents[0]["source_page"] == "案例生成"
    assert documents[0]["operator_username"] == "admin"

    assets_response = client.get("/api/config-management/test-cases")
    assert assets_response.status_code == 200
    assets = assets_response.json()["data"]
    assert len(assets) == 1
    assert assets[0]["asset_type"] == "generated"
    assert assets[0]["case_count"] == 1
    assert assets[0]["source_page"] == "案例生成"
    assert assets[0]["operator_username"] == "admin"

    detail_response = client.get(f"/api/config-management/test-cases/{assets[0]['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["cases"][0]["case_id"] == "TC-001"
    assert detail["cases"][0]["description"] == "资格校验失败时禁止提交"


def test_case_quality_assets_are_deduplicated(client: TestClient):
    create_project_response = client.post("/api/projects", json={"name": "案例质检项目", "description": ""})
    assert create_project_response.status_code == 200
    project_id = create_project_response.json()["data"]["id"]

    requirement_response = client.post(
        "/api/requirement-analysis/analyze",
        data={
            "project_id": str(project_id),
            "use_ai": "false",
            "source_page": "案例质检",
        },
        files={
            "requirement_file": (
                "quality-requirement.docx",
                build_requirement_docx(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert requirement_response.status_code == 200

    code_file = FIXTURES_DIR / "sample_code_changes.json"
    test_file = FIXTURES_DIR / "sample_test_cases.csv"
    mapping_file = FIXTURES_DIR / "sample_mapping.csv"

    for _ in range(2):
        with open(code_file, "rb") as cf, open(test_file, "rb") as tf, open(mapping_file, "rb") as mf:
            analyze_response = client.post(
                f"/api/projects/{project_id}/analyze",
                data={"use_ai": "false", "source_page": "案例质检"},
                files={
                    "code_changes": ("code.json", cf, "application/json"),
                    "test_cases_file": ("tests.csv", tf, "text/csv"),
                    "mapping_file": ("mapping.csv", mf, "text/csv"),
                },
            )
        assert analyze_response.status_code == 200

    documents_response = client.get("/api/config-management/requirement-documents")
    assert documents_response.status_code == 200
    documents = documents_response.json()["data"]
    assert len(documents) == 1
    assert documents[0]["file_name"] == "quality-requirement.docx"
    assert documents[0]["project_name"] == "案例质检项目"
    assert documents[0]["source_page"] == "案例质检"
    assert documents[0]["operator_username"] == "admin"

    assets_response = client.get("/api/config-management/test-cases")
    assert assets_response.status_code == 200
    assets = assets_response.json()["data"]
    assert len(assets) == 1
    assert assets[0]["asset_type"] == "upload"
    assert assets[0]["project_name"] == "案例质检项目"
    assert assets[0]["source_page"] == "案例质检"
    assert assets[0]["operator_username"] == "admin"
    assert assets[0]["case_count"] == 4

    detail_response = client.get(f"/api/config-management/test-cases/{assets[0]['id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["cases"][0]["case_id"]
    assert detail["cases"][0]["description"]

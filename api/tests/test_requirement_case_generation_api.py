import io
from unittest.mock import AsyncMock, patch

import pytest
from docx import Document
from fastapi.testclient import TestClient

from services.database import ensure_initial_admin, init_db


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_requirement_case_generation.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.production_issue_file_store.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.test_issue_file_store.get_db_path", lambda: db_path)
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


def test_requirement_case_generation_accepts_docx_and_selected_prompt(client: TestClient):
    with patch(
        "services.requirement_case_generator.call_deepseek",
        new=AsyncMock(return_value={
            "result": {
                "summary": "覆盖了资格校验主流程、异常拦截和界面提示等核心场景。",
                "cases": [
                    {
                        "case_id": "TC-001",
                        "description": "资格校验失败时禁止提交",
                        "steps": "1. 进入投保页面\n2. 构造不满足资格条件的数据并提交\n3. 观察提交结果和页面提示",
                        "expected_result": "系统阻止提交，并提示资格校验失败原因。",
                    }
                ],
            },
            "usage": {
                "prompt_tokens": 120,
                "completion_tokens": 80,
                "total_tokens": 200,
                "prompt_cache_hit_tokens": 0,
                "prompt_cache_miss_tokens": 120,
            },
            "provider": "DeepSeek",
            "provider_key": "deepseek",
        }),
    ) as mock_call:
        response = client.post(
            "/api/functional-testing/case-generation/generate",
            data={"prompt_template_key": "requirement"},
            files={
                "requirement_file": (
                    "requirement.docx",
                    build_requirement_docx(),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ),
            },
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["file_name"] == "requirement.docx"
    assert payload["prompt_template_key"] == "requirement"
    assert payload["generation_mode"] == "ai"
    assert payload["total"] == 1
    assert isinstance(payload["record_id"], int)
    assert payload["summary"] == "覆盖了资格校验主流程、异常拦截和界面提示等核心场景。"
    assert payload["ai_cost"]["total_tokens"] == 200
    assert payload["cases"][0] == {
        "case_id": "TC-001",
        "description": "资格校验失败时禁止提交",
        "steps": "1. 进入投保页面\n2. 构造不满足资格条件的数据并提交\n3. 观察提交结果和页面提示",
        "expected_result": "系统阻止提交，并提示资格校验失败原因。",
        "source": "ai",
    }

    messages = mock_call.await_args.args[0]
    assert "需求分析" in messages[0]["content"]
    assert "cases" in messages[0]["content"]

    list_response = client.get("/api/functional-testing/test-cases")
    assert list_response.status_code == 200
    records = list_response.json()["data"]
    assert len(records) == 1
    assert records[0]["id"] == payload["record_id"]
    assert records[0]["requirement_file_name"] == "requirement.docx"
    assert records[0]["case_count"] == 1

    detail_response = client.get(f"/api/functional-testing/test-cases/{payload['record_id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["cases"][0]["case_id"] == "TC-001"

    audit_logs_response = client.get("/api/audit-logs", params={"module": "功能测试"})
    assert audit_logs_response.status_code == 200
    audit_logs = audit_logs_response.json()["data"]
    generation_log = next(
        item for item in audit_logs if item["request_path"] == "/api/functional-testing/case-generation/generate"
    )
    assert generation_log["module"] == "功能测试"
    assert generation_log["action"] == "生成测试用例"
    assert generation_log["target_type"] == "测试案例记录"
    assert generation_log["detail"] == "已生成并保存 1 条测试用例"


def test_requirement_case_generation_falls_back_to_rule_based_cases(client: TestClient):
    with patch(
        "services.requirement_case_generator.call_deepseek",
        new=AsyncMock(return_value={
            "error": "未配置 DEEPSEEK_API_KEY，AI 分析已跳过。",
            "provider": "DeepSeek",
        }),
    ):
        response = client.post(
            "/api/functional-testing/case-generation/generate",
            files={
                "requirement_file": (
                    "requirement.docx",
                    build_requirement_docx(),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                ),
            },
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["generation_mode"] == "fallback"
    assert payload["total"] >= 2
    assert payload["error"] == "未配置 DEEPSEEK_API_KEY，AI 分析已跳过。"
    assert payload["cases"][0]["case_id"].startswith("TC-")
    assert payload["cases"][0]["description"]
    assert payload["cases"][0]["steps"]
    assert payload["cases"][0]["expected_result"]

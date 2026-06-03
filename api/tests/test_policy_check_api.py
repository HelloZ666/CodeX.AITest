import json
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from services.database import init_db


def make_snapshot(text: str) -> dict:
    return {
        "file_name": "policy.pdf",
        "page_count": 1,
        "ocr_used": False,
        "ocr_available": True,
        "warnings": [],
        "pages": [
            {
                "page_number": 1,
                "width": 100,
                "height": 100,
                "text": text,
                "image_data_url": "data:image/jpeg;base64,",
                "image_width": 100,
                "image_height": 100,
                "image_scale": 1,
                "words": [
                    {
                        "id": "p1-w1",
                        "text": text,
                        "bbox": [10, 10, 40, 20],
                        "block": 0,
                        "line": 0,
                        "word": 0,
                    }
                ],
                "extraction_method": "text",
                "ocr_corrected": False,
            }
        ],
    }


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "policy_check_api.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.pdf_check_store.get_db_path", lambda: db_path)
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


def test_policy_pdf_http_client_bypasses_environment_proxy(monkeypatch):
    import index

    captured_kwargs = {}

    class FakeAsyncClient:
        def __init__(self, **kwargs):
            captured_kwargs.update(kwargs)

    monkeypatch.setenv("HTTP_PROXY", "http://127.0.0.1:9")
    monkeypatch.setenv("ALL_PROXY", "http://127.0.0.1:9")
    monkeypatch.setattr(index.httpx, "AsyncClient", FakeAsyncClient)

    index._create_policy_pdf_http_client()

    assert captured_kwargs["trust_env"] is False
    assert captured_kwargs["follow_redirects"] is True
    assert captured_kwargs["headers"]["Connection"] == "close"


def test_policy_check_downloads_two_policies_and_uses_ai_prompt(client: TestClient, monkeypatch):
    import index

    project_response = client.post("/api/projects", json={"name": "保单核对项目"})
    project_id = project_response.json()["data"]["id"]
    prompt_response = client.post(
        "/api/prompt-templates",
        json={
            "name": "保单一致性提示词",
            "module": "AI保单核对",
            "prompt": "请重点核对投保声明和保障责任。",
        },
    )
    prompt_key = prompt_response.json()["data"]["agent_key"]

    async def fake_download_policy_pdf(_client, policy_code: str):
        return {
            "policy_code": policy_code,
            "file_name": f"{policy_code}.pdf",
            "content": f"%PDF-{policy_code}".encode(),
            "oss_url": f"https://oss.example/{policy_code}.pdf",
        }

    def fake_extract_pdf_snapshot(_content: bytes, file_name: str):
        policy_code = file_name.removesuffix(".pdf")
        return make_snapshot(f"{policy_code} 投保声明")

    call_ai_mock = AsyncMock(
        return_value={
            "answer": json.dumps(
                {
                    "result": "passed",
                    "summary": "两份保单关键内容一致",
                    "confidence": 0.91,
                    "findings": [],
                },
                ensure_ascii=False,
            ),
            "provider": "DeepSeek",
            "provider_key": "deepseek",
            "usage": {"total_tokens": 123},
        }
    )

    monkeypatch.setattr(index, "_download_policy_pdf", fake_download_policy_pdf)
    monkeypatch.setattr(index, "extract_pdf_snapshot", fake_extract_pdf_snapshot)
    monkeypatch.setattr(index, "call_ai_text", call_ai_mock)

    response = client.post(
        "/api/ai-tools/policy-check/records",
        data={
            "project_id": str(project_id),
            "test_version": "20260603",
            "source_policy_code": "P1001",
            "target_policy_code": "P1002",
            "prompt_template_key": prompt_key,
        },
    )

    assert response.status_code == 200
    record = response.json()["data"]
    assert record["check_type"] == "policy"
    assert record["final_result"] == "passed"
    assert record["diff_count"] == 0
    assert record["source_policy_code"] == "P1001"
    assert record["target_policy_code"] == "P1002"
    assert record["prompt_template_key"] == prompt_key
    assert record["ai_analysis"]["summary"] == "两份保单关键内容一致"
    assert record["ai_analysis"]["provider"] == "DeepSeek"

    messages = call_ai_mock.await_args.kwargs["messages"]
    assert "请重点核对投保声明和保障责任。" in messages[0]["content"]
    assert "源保单号：P1001" in messages[1]["content"]
    assert "目标保单号：P1002" in messages[1]["content"]

    file_records = client.get("/api/ai-tools/pdf-check/records", params={"project_id": project_id}).json()["data"]
    policy_records = client.get("/api/ai-tools/policy-check/records", params={"project_id": project_id}).json()["data"]
    assert file_records == []
    assert [item["id"] for item in policy_records] == [record["id"]]

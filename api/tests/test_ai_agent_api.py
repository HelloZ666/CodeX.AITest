from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from services.database import init_db


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_ai_agent.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
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


def test_prompt_templates_are_seeded(client):
    response = client.get("/api/prompt-templates")

    assert response.status_code == 200
    payload = response.json()["data"]
    assert len(payload) >= 4
    assert {item["agent_key"] for item in payload} >= {"general", "requirement", "testcase", "api"}


def test_prompt_template_crud(client):
    create_response = client.post(
        "/api/prompt-templates",
        json={
            "name": "接口回归助手",
            "prompt": "请结合接口变更输出回归建议",
        },
    )

    assert create_response.status_code == 200
    created = create_response.json()["data"]
    assert created["name"] == "接口回归助手"
    assert created["agent_key"].startswith("prompt_")

    list_response = client.get("/api/prompt-templates")
    assert any(item["id"] == created["id"] for item in list_response.json()["data"])

    update_response = client.put(
        f"/api/prompt-templates/{created['id']}",
        json={
            "name": "接口回归助手",
            "prompt": "请输出接口回归范围、断言和风险点",
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["data"]["prompt"] == "请输出接口回归范围、断言和风险点"

    delete_response = client.delete(f"/api/prompt-templates/{created['id']}")
    assert delete_response.status_code == 200

    final_list_response = client.get("/api/prompt-templates")
    assert all(item["id"] != created["id"] for item in final_list_response.json()["data"])


def test_ai_agent_chat_returns_answer_with_attachment(client):
    with patch("index.call_ai_text", new=AsyncMock(return_value={
        "answer": "这是回答",
        "provider": "DeepSeek",
        "provider_key": "deepseek",
        "final_content": "这是回答",
    })):
        response = client.post(
            "/api/ai-tools/agents/chat",
            data={
                "question": "请结合附件分析",
                "agent_key": "general",
            },
            files=[
                ("attachments", ("context.json", b'{"case":"demo"}', "application/json")),
            ],
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["answer"] == "这是回答"
    assert payload["agent_key"] == "general"
    assert payload["attachments"][0]["file_name"] == "context.json"


def test_ai_agent_chat_uses_default_assistant_without_prompt(client):
    call_ai_mock = AsyncMock(return_value={
        "answer": "默认助手回答",
        "provider": "DeepSeek",
        "provider_key": "deepseek",
        "final_content": "默认助手回答",
    })
    with patch("index.call_ai_text", new=call_ai_mock):
        response = client.post(
            "/api/ai-tools/agents/chat",
            data={
                "question": "直接回答我的问题",
            },
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["answer"] == "默认助手回答"
    assert payload["agent_key"] == "default"
    assert payload["agent_name"] == "默认AI助手"
    assert payload["prompt_used"] == ""

    messages = call_ai_mock.await_args.kwargs["messages"]
    assert "当前未配置额外提示词" in messages[0]["content"]
    assert "以下是该助手提示词" not in messages[0]["content"]


def test_ai_agent_chat_requires_custom_prompt_for_custom_agent(client):
    response = client.post(
        "/api/ai-tools/agents/chat",
        data={
            "question": "帮我回答",
            "agent_key": "custom",
        },
    )

    assert response.status_code == 400
    assert "提示词" in response.json()["detail"]

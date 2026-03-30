from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.deepseek_client import call_ai_text


@pytest.mark.asyncio
async def test_call_ai_text_returns_cleaned_text_for_deepseek(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER", raising=False)

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = "<think>推理</think>\n\n最终回答"
    mock_response.usage.prompt_tokens = 12
    mock_response.usage.completion_tokens = 24
    mock_response.usage.total_tokens = 36
    mock_response.usage.prompt_cache_hit_tokens = 0
    mock_response.usage.prompt_cache_miss_tokens = 12

    mock_client = AsyncMock()
    mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

    with patch("services.deepseek_client.get_client", return_value=mock_client):
        with patch("services.deepseek_client.get_api_key_error", return_value=None):
            result = await call_ai_text(messages=[{"role": "user", "content": "你好"}])

    assert result["answer"] == "最终回答"
    assert result["final_content"] == "最终回答"
    assert result["provider"] == "DeepSeek"


@pytest.mark.asyncio
async def test_call_ai_text_returns_cleaned_text_for_internal_provider(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "internal")
    monkeypatch.setenv("INTERNAL_LLM_API_URL", "http://internal/chat/completions")
    monkeypatch.setenv("INTERNAL_LLM_APP_TOKEN", "token-123")
    monkeypatch.setenv("INTERNAL_LLM_APP_ID", "app-123")

    response_payload = {
        "result": 1,
        "code": "0000",
        "message": "SUCCESS",
        "content": {
            "usage": {
                "prompt_tokens": 10,
                "completion_tokens": 20,
                "total_tokens": 30,
            },
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "<think>推理中</think>\n\n内部模型回答",
                    }
                }
            ],
        },
    }

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = response_payload
    mock_response.text = "ok"

    mock_client = AsyncMock()
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None
    mock_client.post = AsyncMock(return_value=mock_response)

    with patch("services.deepseek_client.httpx.AsyncClient", return_value=mock_client):
        result = await call_ai_text(messages=[{"role": "user", "content": "你好"}])

    assert result["answer"] == "内部模型回答"
    assert result["provider_key"] == "internal"

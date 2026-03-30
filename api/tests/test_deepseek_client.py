import json
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from services.deepseek_client import (
    MODEL_NAME,
    build_analysis_messages,
    build_requirement_analysis_messages,
    calculate_cost,
    call_deepseek,
    extract_final_answer_text,
    get_ai_provider_label,
    get_api_key,
    get_client,
)


class TestBuildMessages:
    def test_basic_messages(self):
        messages = build_analysis_messages(
            diff_summary="新增 createUser 方法",
            mapping_info="com.example.User.createUser -> 创建用户",
            test_cases_text="TC001: 创建用户",
        )
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"

    def test_system_prompt_contains_json(self):
        messages = build_analysis_messages("diff", "mapping", "tests")
        assert "json" in messages[0]["content"].lower()

    def test_user_prompt_contains_inputs(self):
        messages = build_analysis_messages(
            diff_summary="MY_DIFF",
            mapping_info="MY_MAPPING",
            test_cases_text="MY_TESTS",
        )
        assert "MY_DIFF" in messages[1]["content"]
        assert "MY_MAPPING" in messages[1]["content"]
        assert "MY_TESTS" in messages[1]["content"]

    def test_requirement_messages_include_risk_table_schema(self):
        messages = build_requirement_analysis_messages(
            project_name="营销项目",
            requirement_hits=[
                {
                    "requirement_point_id": "4.1-1",
                    "section_number": "4.1",
                    "section_title": "功能描述",
                    "requirement_text": "资格校验",
                    "production_matches": [],
                    "test_matches": [],
                    "mapping_matches": [],
                }
            ],
        )
        assert len(messages) == 2
        assert "risk_table" in messages[0]["content"]
        assert "risk_level" in messages[0]["content"]
        assert "需求映射关系" in messages[0]["content"]
        assert "营销项目" in messages[1]["content"]
        assert "4.1-1" in messages[1]["content"]


class TestCost:
    def test_returns_usage_summary_for_deepseek(self):
        usage = {
            "prompt_cache_hit_tokens": 100,
            "prompt_cache_miss_tokens": 400,
            "completion_tokens": 1500,
            "total_tokens": 2000,
        }
        cost = calculate_cost(usage, provider="deepseek")
        assert cost == {"total_tokens": 2000}

    def test_returns_usage_summary_for_internal_provider(self):
        usage = {"total_tokens": 1234, "completion_tokens": 800}
        cost = calculate_cost(usage, provider="internal")
        assert cost == {"total_tokens": 1234}


class TestEnvironment:
    def test_prefers_process_environment(self, monkeypatch):
        monkeypatch.setenv("DEEPSEEK_API_KEY", "process-key")
        with patch("services.deepseek_client._get_windows_environment_variable", return_value="registry-key"):
            assert get_api_key() == "process-key"

    def test_falls_back_to_windows_registry(self, monkeypatch):
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        with patch("services.deepseek_client._get_windows_environment_variable", return_value="registry-key"):
            assert get_api_key() == "registry-key"

    def test_provider_label_defaults(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        monkeypatch.delenv("AI_PROVIDER_LABEL", raising=False)
        assert get_ai_provider_label() == "DeepSeek"

        monkeypatch.setenv("AI_PROVIDER", "internal")
        assert get_ai_provider_label() == "公司内部大模型"


class TestGetClient:
    def test_uses_registry_fallback_key(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        mock_openai = MagicMock()
        with patch("services.deepseek_client.AsyncOpenAI", mock_openai):
            with patch("services.deepseek_client._get_windows_environment_variable", return_value="registry-key"):
                get_client()

        mock_openai.assert_called_once_with(api_key="registry-key", base_url="https://api.deepseek.com")

    def test_rejects_placeholder_key(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        monkeypatch.setenv("DEEPSEEK_API_KEY", "your-deepseek-api-key")
        mock_openai = MagicMock()
        with patch("services.deepseek_client.AsyncOpenAI", mock_openai):
            client = get_client()

        assert client is None
        mock_openai.assert_not_called()

    def test_internal_provider_returns_none(self, monkeypatch):
        monkeypatch.setenv("AI_PROVIDER", "internal")
        assert get_client() is None


class TestTextExtraction:
    def test_extract_final_answer_text_removes_think_block(self):
        content = "<think>分析过程</think>\n\n今天是2023年10月16日。"
        assert extract_final_answer_text(content) == "今天是2023年10月16日。"

    def test_extract_final_answer_text_uses_text_after_closing_think(self):
        content = "推理过程省略</think>\n\n今天是2023年10月16日。"
        assert extract_final_answer_text(content) == "今天是2023年10月16日。"


@pytest.mark.asyncio
class TestCallDeepSeek:
    async def test_successful_openai_call(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = json.dumps({"result": "test"})
        mock_response.usage.prompt_tokens = 100
        mock_response.usage.completion_tokens = 50
        mock_response.usage.total_tokens = 150
        mock_response.usage.prompt_cache_hit_tokens = 50
        mock_response.usage.prompt_cache_miss_tokens = 50

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            with patch("services.deepseek_client.get_api_key_error", return_value=None):
                result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert result["result"] == {"result": "test"}
        assert result["usage"]["total_tokens"] == 150
        assert result["provider"] == "DeepSeek"
        assert result["provider_key"] == "deepseek"
        mock_client.chat.completions.create.assert_awaited_once()
        assert mock_client.chat.completions.create.await_args.kwargs["model"] == MODEL_NAME

    async def test_empty_content_retry(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        mock_response_empty = MagicMock()
        mock_response_empty.choices = [MagicMock()]
        mock_response_empty.choices[0].message.content = ""

        mock_response_ok = MagicMock()
        mock_response_ok.choices = [MagicMock()]
        mock_response_ok.choices[0].message.content = json.dumps({"ok": True})
        mock_response_ok.usage.prompt_tokens = 100
        mock_response_ok.usage.completion_tokens = 50
        mock_response_ok.usage.total_tokens = 150
        mock_response_ok.usage.prompt_cache_hit_tokens = 0
        mock_response_ok.usage.prompt_cache_miss_tokens = 100

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=[mock_response_empty, mock_response_ok])

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            with patch("services.deepseek_client.get_api_key_error", return_value=None):
                result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert result["result"] == {"ok": True}
        assert mock_client.chat.completions.create.await_count == 2

    async def test_markdown_wrapped_json_is_accepted(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = (
            "```json\n"
            f"{json.dumps({'ok': True, 'cases': []}, ensure_ascii=False)}\n"
            "```"
        )
        mock_response.usage.prompt_tokens = 100
        mock_response.usage.completion_tokens = 50
        mock_response.usage.total_tokens = 150
        mock_response.usage.prompt_cache_hit_tokens = 0
        mock_response.usage.prompt_cache_miss_tokens = 100

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            with patch("services.deepseek_client.get_api_key_error", return_value=None):
                result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert result["result"] == {"ok": True, "cases": []}

    async def test_explanatory_text_wrapped_json_is_accepted(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = (
            "以下是整理后的结果：\n"
            f"{json.dumps({'ok': True, 'cases': []}, ensure_ascii=False)}\n"
            "请按此执行。"
        )
        mock_response.usage.prompt_tokens = 100
        mock_response.usage.completion_tokens = 50
        mock_response.usage.total_tokens = 150
        mock_response.usage.prompt_cache_hit_tokens = 0
        mock_response.usage.prompt_cache_miss_tokens = 100

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            with patch("services.deepseek_client.get_api_key_error", return_value=None):
                result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert result["result"] == {"ok": True, "cases": []}

    async def test_placeholder_key_returns_friendly_message(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        monkeypatch.setenv("DEEPSEEK_API_KEY", "your-deepseek-api-key")

        result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert "error" in result
        assert "示例占位值" in result["error"]
        assert result["error_type"] == "configuration"

    async def test_timeout_error(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        from openai import APITimeoutError

        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=APITimeoutError(request=MagicMock())
        )

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            with patch("services.deepseek_client.get_api_key_error", return_value=None):
                result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert "error" in result
        assert "超时" in result["error"]

    async def test_rate_limit_error(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        from openai import RateLimitError

        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.headers = {}
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=RateLimitError(
                message="rate limited",
                response=mock_response,
                body=None,
            )
        )

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            with patch("services.deepseek_client.get_api_key_error", return_value=None):
                result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert "error" in result
        assert "频率" in result["error"]

    async def test_authentication_error_returns_friendly_message(self, monkeypatch):
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        from openai import AuthenticationError

        request = httpx.Request("POST", "https://api.deepseek.com/chat/completions")
        response = httpx.Response(401, request=request)
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=AuthenticationError(
                message="Authentication Fails, Your api key: ****-key is invalid",
                response=response,
                body=None,
            )
        )

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            with patch("services.deepseek_client.get_api_key_error", return_value=None):
                result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert "error" in result
        assert "DeepSeek 认证失败" in result["error"]

    async def test_internal_provider_extracts_nested_content(self, monkeypatch):
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
                            "content": "<think>推理中</think>\n\n{\"answer\": \"今天是2023年10月16日。\"}",
                        }
                    }
                ],
            },
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = response_payload
        mock_response.text = json.dumps(response_payload, ensure_ascii=False)

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.deepseek_client.httpx.AsyncClient", return_value=mock_client):
            result = await call_deepseek(messages=[{"role": "user", "content": "今天几号"}])

        assert result["result"] == {"answer": "今天是2023年10月16日。"}
        assert result["provider"] == "公司内部大模型"
        assert result["provider_key"] == "internal"
        assert result["final_content"] == '{"answer": "今天是2023年10月16日。"}'
        mock_client.post.assert_awaited_once()
        request_kwargs = mock_client.post.await_args.kwargs
        assert request_kwargs["headers"]["app-token"] == "token-123"
        assert request_kwargs["json"]["appId"] == "app-123"

    async def test_internal_provider_requires_configuration(self, monkeypatch):
        monkeypatch.setenv("AI_PROVIDER", "internal")
        monkeypatch.delenv("INTERNAL_LLM_API_URL", raising=False)
        monkeypatch.delenv("INTERNAL_LLM_APP_TOKEN", raising=False)
        monkeypatch.delenv("INTERNAL_LLM_APP_ID", raising=False)

        result = await call_deepseek(messages=[{"role": "user", "content": "test"}])

        assert "error" in result
        assert "AI_PROVIDER=internal" in result["error"]
        assert result["error_type"] == "configuration"

    async def test_internal_provider_non_json_content_returns_format_error(self, monkeypatch):
        monkeypatch.setenv("AI_PROVIDER", "internal")
        monkeypatch.setenv("INTERNAL_LLM_API_URL", "http://internal/chat/completions")
        monkeypatch.setenv("INTERNAL_LLM_APP_TOKEN", "token-123")
        monkeypatch.setenv("INTERNAL_LLM_APP_ID", "app-123")

        response_payload = {
            "result": 1,
            "code": "0000",
            "message": "SUCCESS",
            "content": {
                "choices": [
                    {
                        "message": {
                            "role": "assistant",
                            "content": "<think>推理中</think>\n\n今天是2023年10月16日。",
                        }
                    }
                ],
            },
        }

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = response_payload
        mock_response.text = json.dumps(response_payload, ensure_ascii=False)

        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = None
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch("services.deepseek_client.httpx.AsyncClient", return_value=mock_client):
            result = await call_deepseek(messages=[{"role": "user", "content": "今天几号"}])

        assert result["error"] == "AI 返回格式异常，请稍后重试"
        assert result["final_content"] == "今天是2023年10月16日。"

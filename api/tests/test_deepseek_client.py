"""
test_deepseek_client.py - DeepSeek API客户端测试（全部mock，不实际调用API）
"""

import json
import os
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from services.deepseek_client import (
    build_analysis_messages,
    build_requirement_analysis_messages,
    call_deepseek,
    calculate_cost,
    get_api_key,
    get_client,
    MODEL_NAME,
    PRICING,
)


class TestBuildMessages:
    """测试消息构建"""

    def test_basic_messages(self):
        messages = build_analysis_messages(
            diff_summary="新增了createUser方法",
            mapping_info="com.example.User.createUser -> 创建用户",
            test_cases_text="TC001: 创建用户",
        )
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert messages[1]["role"] == "user"

    def test_system_prompt_contains_json(self):
        messages = build_analysis_messages("diff", "mapping", "tests")
        assert "json" in messages[0]["content"].lower() or "JSON" in messages[0]["content"]

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
        assert "production_alerts" not in messages[0]["content"]
        assert "test_suggestions" not in messages[0]["content"]
        assert "营销项目" in messages[1]["content"]
        assert "4.1-1" in messages[1]["content"]


class TestCalculateCost:
    """测试成本计算"""

    def test_basic_cost(self):
        usage = {
            "prompt_cache_hit_tokens": 100,
            "prompt_cache_miss_tokens": 400,
            "completion_tokens": 1500,
            "total_tokens": 2000,
        }
        cost = calculate_cost(usage)
        assert cost["total_tokens"] == 2000
        assert cost["total_cost"] > 0

        # 验证计算公式
        expected_input = 100 / 1e6 * 0.2 + 400 / 1e6 * 2.0
        expected_output = 1500 / 1e6 * 3.0
        assert cost["input_cost"] == pytest.approx(expected_input, abs=1e-6)
        assert cost["output_cost"] == pytest.approx(expected_output, abs=1e-6)

    def test_zero_usage(self):
        cost = calculate_cost({})
        assert cost["total_cost"] == 0.0
        assert cost["total_tokens"] == 0

    def test_all_cache_hit(self):
        usage = {
            "prompt_cache_hit_tokens": 1000,
            "prompt_cache_miss_tokens": 0,
            "completion_tokens": 500,
            "total_tokens": 1500,
        }
        cost = calculate_cost(usage)
        # 全缓存命中时输入成本更低
        expected_input = 1000 / 1e6 * 0.2
        assert cost["input_cost"] == pytest.approx(expected_input, abs=1e-6)


class TestGetApiKey:
    def test_prefers_process_environment(self, monkeypatch):
        monkeypatch.setenv("DEEPSEEK_API_KEY", "process-key")
        with patch("services.deepseek_client._get_windows_environment_variable", return_value="registry-key"):
            assert get_api_key() == "process-key"

    def test_falls_back_to_windows_registry(self, monkeypatch):
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        with patch("services.deepseek_client._get_windows_environment_variable", return_value="registry-key"):
            assert get_api_key() == "registry-key"

    def test_returns_none_when_missing(self, monkeypatch):
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        with patch("services.deepseek_client._get_windows_environment_variable", return_value=None):
            assert get_api_key() is None


class TestGetClient:
    def test_uses_registry_fallback_key(self, monkeypatch):
        monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
        mock_openai = MagicMock()
        with patch("services.deepseek_client.AsyncOpenAI", mock_openai):
            with patch("services.deepseek_client._get_windows_environment_variable", return_value="registry-key"):
                get_client()

        mock_openai.assert_called_once_with(api_key="registry-key", base_url="https://api.deepseek.com")

    def test_rejects_placeholder_key(self, monkeypatch):
        monkeypatch.setenv("DEEPSEEK_API_KEY", "your-deepseek-api-key")
        mock_openai = MagicMock()
        with patch("services.deepseek_client.AsyncOpenAI", mock_openai):
            client = get_client()

        assert client is None
        mock_openai.assert_not_called()


@pytest.mark.asyncio
class TestCallDeepSeek:
    """测试API调用（mock）"""

    async def test_successful_call(self):
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
            result = await call_deepseek(
                messages=[{"role": "user", "content": "test"}]
            )

        assert "result" in result
        assert result["result"] == {"result": "test"}
        assert result["usage"]["total_tokens"] == 150

    async def test_empty_content_retry(self):
        """空content应触发重试"""
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
        mock_client.chat.completions.create = AsyncMock(
            side_effect=[mock_response_empty, mock_response_ok]
        )

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            result = await call_deepseek(
                messages=[{"role": "user", "content": "test"}]
            )

        assert "result" in result
        assert result["result"] == {"ok": True}

    async def test_markdown_wrapped_json_is_accepted(self):
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
            result = await call_deepseek(
                messages=[{"role": "user", "content": "test"}]
            )

        assert "result" in result
        assert result["result"] == {"ok": True, "cases": []}

    async def test_explanatory_text_wrapped_json_is_accepted(self):
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
            result = await call_deepseek(
                messages=[{"role": "user", "content": "test"}]
            )

        assert "result" in result
        assert result["result"] == {"ok": True, "cases": []}

    async def test_no_client(self):
        with patch("services.deepseek_client.get_client", return_value=None):
            result = await call_deepseek(
                messages=[{"role": "user", "content": "test"}]
            )
        assert "error" in result

    async def test_placeholder_key_returns_friendly_message(self, monkeypatch):
        monkeypatch.setenv("DEEPSEEK_API_KEY", "your-deepseek-api-key")

        result = await call_deepseek(
            messages=[{"role": "user", "content": "test"}]
        )

        assert "error" in result
        assert "示例占位值" in result["error"]

    async def test_timeout_error(self):
        from openai import APITimeoutError
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=APITimeoutError(request=MagicMock())
        )

        with patch("services.deepseek_client.get_client", return_value=mock_client):
            result = await call_deepseek(
                messages=[{"role": "user", "content": "test"}]
            )
        assert "error" in result
        assert "超时" in result["error"]

    async def test_rate_limit_error(self):
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
            result = await call_deepseek(
                messages=[{"role": "user", "content": "test"}]
            )
        assert "error" in result
        assert "频率" in result["error"]

    async def test_authentication_error_returns_friendly_message(self):
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

        with patch("services.deepseek_client.get_api_key_error", return_value=None):
            with patch("services.deepseek_client.get_client", return_value=mock_client):
                result = await call_deepseek(
                    messages=[{"role": "user", "content": "test"}]
                )

        assert "error" in result
        assert "DeepSeek 认证失败" in result["error"]

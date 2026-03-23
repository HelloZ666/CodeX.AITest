from unittest.mock import AsyncMock, patch

import pytest

from services.api_automation_case_generator import (
    AI_CASE_GENERATION_TIMEOUT_SECONDS,
    generate_cases_with_ai,
)


@pytest.mark.asyncio
async def test_generate_cases_with_ai_uses_100_second_timeout_and_falls_back_to_rule_cases():
    parsed_document = {
        "endpoints": [{
            "endpoint_id": "post-sales-visit-query",
            "group_name": "面访",
            "name": "业务员面访数据查询接口",
            "method": "POST",
            "path": "/maApi/v1/api/sales/visit/query",
            "summary": "业务员面访数据查询",
            "headers": [],
            "path_params": [],
            "query_params": [],
            "body_schema": {"type": "object"},
            "response_schema": {"type": "object"},
            "error_codes": [],
            "dependency_hints": [],
            "missing_fields": [],
            "source_type": "text_document_ai",
        }],
    }

    with patch("services.api_automation_case_generator.call_deepseek", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = {"error": "AI 分析超时，请减少分析范围后重试"}

        result = await generate_cases_with_ai(parsed_document, use_ai=True)

    assert result["cases"]
    assert result["ai_analysis"] == {"error": "AI 分析超时，请减少分析范围后重试"}
    assert result["token_usage"] == 0

    _, kwargs = mock_call.await_args
    assert kwargs["timeout_seconds"] == AI_CASE_GENERATION_TIMEOUT_SECONDS
    assert kwargs["max_retries"] == 0

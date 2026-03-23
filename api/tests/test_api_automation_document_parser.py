import json
from unittest.mock import AsyncMock, patch

import pytest

from services.api_automation_document_parser import (
    TEXT_DOCUMENT_AI_TIMEOUT_SECONDS,
    _build_text_endpoint,
    _enhance_text_endpoints_with_ai,
    parse_api_document,
)


@pytest.mark.asyncio
async def test_parse_openapi_yaml_document_returns_normalized_endpoints():
    content = """
openapi: 3.0.1
info:
  title: Sample API
  version: "1.0"
security:
  - bearerAuth: []
paths:
  /auth/login:
    post:
      tags: [auth]
      summary: Login
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                username:
                  type: string
                password:
                  type: string
      responses:
        "200":
          description: Login success
          content:
            application/json:
              schema:
                type: object
                properties:
                  token:
                    type: string
        "401":
          description: Unauthorized
  /sales/visit/query:
    get:
      tags: [visit]
      summary: Query visit data
      parameters:
        - in: query
          name: employeeIds
          required: true
          schema:
            type: string
            minLength: 1
            maxLength: 32
            example: EMP001
      responses:
        "200":
          description: Query success
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
        "500":
          description: Server error
"""

    result = await parse_api_document(content.encode("utf-8"), "sample-openapi.yaml", use_ai=False)

    assert result["source_type"] == "openapi"
    assert result["endpoint_count"] == 2
    assert result["missing_fields"] == []

    login_endpoint = next(item for item in result["endpoints"] if item["path"] == "/auth/login")
    query_endpoint = next(item for item in result["endpoints"] if item["path"] == "/sales/visit/query")

    assert login_endpoint["group_name"] == "auth"
    assert login_endpoint["method"] == "POST"
    assert login_endpoint["body_schema"]["type"] == "object"
    assert login_endpoint["dependency_hints"]
    assert login_endpoint["error_codes"] == [{"code": "401", "description": "Unauthorized"}]

    assert query_endpoint["group_name"] == "visit"
    assert query_endpoint["method"] == "GET"
    assert query_endpoint["query_params"][0]["name"] == "employeeIds"
    assert query_endpoint["query_params"][0]["example"] == "EMP001"
    assert query_endpoint["query_params"][0]["min_length"] == 1
    assert query_endpoint["query_params"][0]["max_length"] == 32
    assert query_endpoint["response_schema"]["type"] == "object"
    assert query_endpoint["error_codes"] == [{"code": "500", "description": "Server error"}]


@pytest.mark.asyncio
async def test_parse_openapi_json_document_returns_excerpt():
    spec = {
        "openapi": "3.0.1",
        "info": {"title": "JSON API", "version": "1.0"},
        "paths": {
            "/health": {
                "get": {
                    "summary": "Health check",
                    "responses": {
                        "200": {
                            "description": "ok",
                            "content": {
                                "application/json": {
                                    "schema": {"type": "object", "properties": {"status": {"type": "string"}}},
                                },
                            },
                        },
                    },
                },
            },
        },
    }

    result = await parse_api_document(
        json.dumps(spec, ensure_ascii=False).encode("utf-8"),
        "sample-openapi.json",
        use_ai=False,
    )

    assert result["endpoint_count"] == 1
    assert result["raw_text_excerpt"]
    assert result["endpoints"][0]["name"] == "Health check"


def test_build_text_endpoint_skips_base_url_and_numeric_heading():
    raw_text = """
业务员面访数据查询接口
3
基础地址：http://lf22acmg-sit.life.cpic.com
请求方式：POST
接口路径：/maApi/v1/api/sales/visit/query
请求示例：{"employeeIds":"EMP001","queryDate":"2025-11-01"}
返回示例：{"code":200,"message":"成功"}
"""

    endpoints = _build_text_endpoint(raw_text, "sample.pdf")

    assert len(endpoints) == 1
    assert endpoints[0]["name"] == "业务员面访数据查询接口"
    assert endpoints[0]["path"] == "/maApi/v1/api/sales/visit/query"
    assert endpoints[0]["method"] == "POST"


def test_build_text_endpoint_parses_multiple_relative_paths():
    raw_text = """
Customer Query API
POST /api/customer/query
request example {"customerId":"C001"}
response example {"code":200,"data":[]}

Customer Detail API
GET /api/customer/detail
response example {"code":200,"data":{"id":"C001"}}
"""

    endpoints = _build_text_endpoint(raw_text, "sample.pdf")

    assert len(endpoints) == 2

    query_endpoint = next(item for item in endpoints if item["path"] == "/api/customer/query")
    detail_endpoint = next(item for item in endpoints if item["path"] == "/api/customer/detail")

    assert query_endpoint["method"] == "POST"
    assert query_endpoint["body_schema"]["customerId"]["example"] == "C001"
    assert query_endpoint["response_schema"]["code"]["example"] == 200

    assert detail_endpoint["method"] == "GET"
    assert detail_endpoint["response_schema"]["data"]["id"]["example"] == "C001"
    assert detail_endpoint["missing_fields"] == ["request_params"]


@pytest.mark.asyncio
async def test_enhance_text_endpoints_dedupes_same_path_and_prefers_richer_result():
    raw_text = """
业务员页面面访数据查询接口
基础地址：http://lf22acmg-sit.life.cpic.com
请求方式：POST
接口路径：/maApi/v1/api/sales/visit/query
请求示例：{"employeeIds":"EMP001","queryDate":"2025-11-01"}
返回示例：{"code":200,"message":"成功"}
"""

    endpoints = _build_text_endpoint(raw_text, "sample.docx")

    with patch("services.api_automation_document_parser.call_deepseek", new_callable=AsyncMock) as mock_call:
        mock_call.return_value = {
            "result": {
                "endpoints": [
                    {
                        "name": "接口地址",
                        "method": "GET",
                        "path": "/maApi/v1/api/sales/visit/query",
                        "summary": "接口地址",
                        "headers": [],
                        "path_params": [],
                        "query_params": [],
                        "body_schema": {},
                        "response_schema": {},
                        "error_codes": [],
                        "dependency_hints": [],
                        "missing_fields": ["response_schema"],
                    },
                    {
                        "name": "业务员页面面访数据查询接口",
                        "method": "POST",
                        "path": "/maApi/v1/api/sales/visit/query",
                        "summary": "业务员页面面访数据查询接口",
                        "headers": [],
                        "path_params": [],
                        "query_params": [],
                        "body_schema": {
                            "employeeIds": {"type": "string", "example": "EMP001"},
                        },
                        "response_schema": {
                            "code": {"type": "integer", "example": 200},
                        },
                        "error_codes": [],
                        "dependency_hints": ["requires-auth"],
                        "missing_fields": [],
                    },
                ],
            },
        }

        enhanced = await _enhance_text_endpoints_with_ai("sample.docx", raw_text, endpoints)

    assert len(enhanced) == 1
    assert enhanced[0]["path"] == "/maApi/v1/api/sales/visit/query"
    assert enhanced[0]["method"] == "POST"
    assert enhanced[0]["name"] == "业务员页面面访数据查询接口"
    assert enhanced[0]["dependency_hints"] == ["requires-auth"]

    _, kwargs = mock_call.await_args
    assert kwargs["timeout_seconds"] == TEXT_DOCUMENT_AI_TIMEOUT_SECONDS
    assert kwargs["max_retries"] == 0

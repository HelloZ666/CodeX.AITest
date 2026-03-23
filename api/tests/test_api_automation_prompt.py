import json

from services.api_automation_prompt import (
    build_case_generation_context,
    build_case_generation_messages,
)


def test_build_case_generation_context_keeps_request_spec_and_drops_full_case_payloads():
    endpoints = [{
        "endpoint_id": "post-orders-create",
        "group_name": "订单",
        "name": "创建订单",
        "method": "POST",
        "path": "/orders/create",
        "summary": "创建订单并返回订单号",
        "headers": [{
            "name": "X-Trace-Id",
            "type": "string",
            "required": True,
            "description": "链路追踪号",
            "example": "trace-001",
            "location": "header",
        }],
        "path_params": [],
        "query_params": [{
            "name": "channel",
            "type": "string",
            "required": True,
            "description": "下单渠道",
            "example": "APP",
            "enum": ["APP", "H5"],
            "location": "query",
        }],
        "body_schema": {
            "type": "object",
            "required": ["customerId", "amount"],
            "properties": {
                "customerId": {
                    "type": "string",
                    "description": "客户编号",
                    "minLength": 1,
                    "maxLength": 32,
                    "example": "C001",
                },
                "amount": {
                    "type": "number",
                    "minimum": 0.01,
                    "maximum": 99999.99,
                    "example": 199.9,
                },
                "items": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "required": ["skuId"],
                        "properties": {
                            "skuId": {
                                "type": "string",
                                "example": "SKU-001",
                            },
                        },
                    },
                },
            },
        },
        "response_schema": {
            "type": "object",
            "properties": {
                "code": {"type": "integer"},
                "data": {
                    "type": "object",
                    "properties": {
                        "orderId": {"type": "string"},
                    },
                },
            },
        },
        "error_codes": [{"code": "400", "description": "参数错误"}],
        "dependency_hints": ["需要登录态"],
        "missing_fields": [],
        "source_type": "openapi_json",
    }]
    base_cases = [{
        "case_id": "post-orders-create-001",
        "endpoint_id": "post-orders-create",
        "test_scene": "正常流程",
        "title": "创建订单 正常请求",
        "request_method": "POST",
        "request_url": "/orders/create",
        "request_headers": {"X-Trace-Id": "trace-001"},
        "request_params": {"channel": "APP"},
        "request_body": {"customerId": "C001", "amount": 199.9},
        "expected_status_code": 200,
        "expected_response_keywords": ["code", "data.orderId"],
        "expected_db_check": "",
        "test_level": "功能",
        "assertions": [{"type": "status_code", "operator": "equals", "path": "", "expected": 200}],
        "extract_rules": [],
        "depends_on": [],
        "source": "rule",
        "missing_fields": [],
        "request_options": {"skip_auth": False},
    }]

    context = build_case_generation_context(endpoints, base_cases)

    endpoint_context = context["endpoint_contexts"][0]
    assert endpoint_context["request_spec"]["query_params"][0]["enum"] == ["APP", "H5"]
    assert endpoint_context["request_spec"]["body_fields"] == [
        {
            "path": "customerId",
            "type": "string",
            "required": True,
            "description": "客户编号",
            "example": "C001",
            "min_length": 1,
            "max_length": 32,
        },
        {
            "path": "amount",
            "type": "number",
            "required": True,
            "example": 199.9,
            "minimum": 0.01,
            "maximum": 99999.99,
        },
        {
            "path": "items",
            "type": "array",
            "required": False,
            "min_items": 1,
        },
        {
            "path": "items[].skuId",
            "type": "string",
            "required": True,
            "example": "SKU-001",
        },
    ]
    assert endpoint_context["response_hints"]["success_keywords"] == ["code", "data.orderId"]

    case_outline = context["existing_case_outline"][0]["covered_cases"][0]
    assert "request_body" not in case_outline
    assert "request_params" not in case_outline
    assert case_outline["title"] == "创建订单 正常请求"


def test_build_case_generation_messages_embed_compact_context_only():
    endpoints = [{
        "endpoint_id": "get-users-list",
        "group_name": "用户",
        "name": "查询用户列表",
        "method": "GET",
        "path": "/users",
        "summary": "分页查询用户列表",
        "headers": [],
        "path_params": [],
        "query_params": [{
            "name": "pageNo",
            "type": "integer",
            "required": True,
            "description": "页码",
            "example": 1,
            "location": "query",
        }],
        "body_schema": {},
        "response_schema": {"type": "object", "properties": {"data": {"type": "array"}}},
        "error_codes": [],
        "dependency_hints": [],
        "missing_fields": [],
        "source_type": "openapi_json",
    }]

    messages = build_case_generation_messages(endpoints, [])
    user_content = messages[1]["content"]
    compact_context = build_case_generation_context(endpoints, [])
    compact_json = json.dumps(compact_context, ensure_ascii=False, indent=2)

    assert compact_json in user_content
    assert '"request_spec"' in user_content
    assert '"existing_case_outline": []' in user_content
    assert '"body_schema"' not in user_content
    assert '"response_schema"' not in user_content

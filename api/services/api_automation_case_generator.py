from __future__ import annotations

import copy
from typing import Any

from services.api_automation_prompt import build_case_generation_messages
from services.deepseek_client import calculate_cost, call_deepseek


DEFAULT_LATENCY_THRESHOLD_MS = 3000
AI_CASE_GENERATION_TIMEOUT_SECONDS = 100


def _extract_example_fields(schema: Any) -> Any:
    if isinstance(schema, dict):
        if "example" in schema and "type" in schema:
            return schema.get("example")
        result: dict[str, Any] = {}
        for key, value in schema.items():
            extracted = _extract_example_fields(value)
            if extracted is not None:
                result[key] = extracted
        return result
    if isinstance(schema, list):
        return [] if not schema else [_extract_example_fields(schema[0])]
    return None


def _flatten_expected_keywords(schema: Any, prefix: str = "") -> list[str]:
    if isinstance(schema, dict):
        if "type" in schema and "example" in schema:
            return [prefix] if prefix else []
        result: list[str] = []
        for key, value in schema.items():
            next_prefix = f"{prefix}.{key}" if prefix else key
            result.extend(_flatten_expected_keywords(value, next_prefix))
        return result
    if isinstance(schema, list):
        return [prefix] if prefix else [] if not schema else _flatten_expected_keywords(schema[0], prefix)
    return [prefix] if prefix else []


def _build_default_assertions(endpoint: dict[str, Any], expected_status_code: int) -> list[dict[str, Any]]:
    assertions = [{
        "type": "status_code",
        "operator": "equals",
        "path": "",
        "expected": expected_status_code,
    }]
    for keyword in _flatten_expected_keywords(endpoint.get("response_schema") or {})[:3]:
        assertions.append({
            "type": "json",
            "operator": "exists",
            "path": keyword,
            "expected": None,
        })
    return assertions


def _build_case(
    endpoint: dict[str, Any],
    sort_index: int,
    suffix: str,
    test_scene: str,
    title: str,
    test_level: str,
    expected_status_code: int,
    request_params: dict[str, Any] | None = None,
    request_body: Any = None,
    request_headers: dict[str, Any] | None = None,
    assertions: list[dict[str, Any]] | None = None,
    extract_rules: list[dict[str, Any]] | None = None,
    precondition: str = "",
    expected_db_check: str = "",
    depends_on: list[str] | None = None,
    source: str = "rule",
    request_options: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "case_id": f"{endpoint['endpoint_id']}-{suffix}",
        "endpoint_id": endpoint["endpoint_id"],
        "enabled": True,
        "test_scene": test_scene,
        "title": title,
        "precondition": precondition,
        "request_method": endpoint["method"],
        "request_url": endpoint["path"],
        "request_headers": request_headers or {},
        "request_params": request_params or {},
        "request_body": request_body,
        "expected_status_code": expected_status_code,
        "expected_response_keywords": _flatten_expected_keywords(endpoint.get("response_schema") or {})[:5],
        "expected_db_check": expected_db_check,
        "test_level": test_level,
        "assertions": assertions or _build_default_assertions(endpoint, expected_status_code),
        "extract_rules": extract_rules or [],
        "depends_on": depends_on or [],
        "source": source,
        "missing_fields": copy.deepcopy(endpoint.get("missing_fields") or []),
        "request_options": request_options or {},
        "sort_index": sort_index,
    }


def _make_negative_request(example_query: dict[str, Any], example_body: Any) -> tuple[dict[str, Any], Any]:
    query = copy.deepcopy(example_query)
    body = copy.deepcopy(example_body)
    if query:
        query.pop(next(iter(query)), None)
        return query, body
    if isinstance(body, dict) and body:
        body.pop(next(iter(body)), None)
    return query, body


def _make_invalid_request(example_query: dict[str, Any], example_body: Any) -> tuple[dict[str, Any], Any]:
    query = copy.deepcopy(example_query)
    body = copy.deepcopy(example_body)
    if query:
        query[next(iter(query))] = "@@@invalid@@@"
        return query, body
    if isinstance(body, dict) and body:
        body[next(iter(body))] = "@@@invalid@@@"
    return query, body


def _build_extraction_rules(endpoint: dict[str, Any]) -> list[dict[str, Any]]:
    summary_text = " ".join(
        [endpoint.get("name") or "", endpoint.get("summary") or "", *(endpoint.get("dependency_hints") or [])]
    ).lower()
    if "token" in summary_text:
        return [{"source": "json", "path": "data.token", "target_key": "token"}]
    if "cookie" in summary_text:
        return [{"source": "header", "path": "set-cookie", "target_key": "cookie"}]
    return []


def generate_base_cases(parsed_document: dict[str, Any]) -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    sort_index = 1
    for endpoint in parsed_document.get("endpoints") or []:
        example_body = _extract_example_fields(endpoint.get("body_schema") or {})
        example_query = {
            item.get("name"): item.get("example")
            for item in endpoint.get("query_params") or []
            if item.get("name")
        }
        request_headers = {
            item.get("name"): item.get("example")
            for item in endpoint.get("headers") or []
            if item.get("name") and item.get("example") is not None
        }
        extract_rules = _build_extraction_rules(endpoint)

        cases.append(_build_case(
            endpoint, sort_index, "001", "姝ｅ父娴佺▼", f"{endpoint['name']} 姝ｅ父璇锋眰", "鍔熻兘", 200,
            request_params=example_query,
            request_body=example_body,
            request_headers=request_headers,
            extract_rules=extract_rules,
            expected_db_check="濡傛秹鍙婅惤搴擄紝璇锋牎楠屽叧閿笟鍔″瓧娈靛凡姝ｇ‘鏇存柊",
        ))
        sort_index += 1

        negative_query, negative_body = _make_negative_request(example_query, example_body)
        cases.append(_build_case(
            endpoint, sort_index, "002", "缂哄け鍙傛暟", f"{endpoint['name']} 缂哄け鍏抽敭鍙傛暟", "寮傚父", 400,
            request_params=negative_query,
            request_body=negative_body,
            request_headers=request_headers,
            assertions=[{"type": "status_code", "operator": "equals", "path": "", "expected": 400}],
        ))
        sort_index += 1

        invalid_query, invalid_body = _make_invalid_request(example_query, example_body)
        cases.append(_build_case(
            endpoint, sort_index, "003", "闈炴硶鍙傛暟", f"{endpoint['name']} 鍙傛暟绫诲瀷鎴栨牸寮忛敊璇?", "寮傚父", 400,
            request_params=invalid_query,
            request_body=invalid_body,
            request_headers=request_headers,
            assertions=[{"type": "status_code", "operator": "equals", "path": "", "expected": 400}],
        ))
        sort_index += 1

        cases.append(_build_case(
            endpoint, sort_index, "004", "未登录访问", f"{endpoint['name']} 未携带鉴权信息", "安全", 401,
            request_params=example_query,
            request_body=example_body,
            request_headers=request_headers,
            assertions=[{"type": "status_code", "operator": "equals", "path": "", "expected": 401}],
            request_options={"skip_auth": True},
        ))
        sort_index += 1

        injection_query, injection_body = _make_invalid_request(example_query, example_body)
        cases.append(_build_case(
            endpoint, sort_index, "005", "瀹夊叏娉ㄥ叆", f"{endpoint['name']} 鐗规畩瀛楃涓庢敞鍏ュ瓧绗︽牎楠?", "瀹夊叏", 400,
            request_params=injection_query,
            request_body=injection_body,
            request_headers=request_headers,
        ))
        sort_index += 1

        cases.append(_build_case(
            endpoint, sort_index, "006", "性能阈值", f"{endpoint['name']} 响应时延阈值检查", "性能", 200,
            request_params=example_query,
            request_body=example_body,
            request_headers=request_headers,
            assertions=[
                *_build_default_assertions(endpoint, 200),
                {"type": "latency_ms", "operator": "lte", "path": "", "expected": DEFAULT_LATENCY_THRESHOLD_MS},
            ],
        ))
        sort_index += 1

        if endpoint["method"] in {"POST", "PUT", "PATCH"}:
            cases.append(_build_case(
                endpoint, sort_index, "007", "閲嶅鎻愪氦", f"{endpoint['name']} 閲嶅鎻愪氦骞傜瓑鎬?", "寮傚父", 200,
                request_params=example_query,
                request_body=example_body,
                request_headers=request_headers,
                precondition="濡傛帴鍙ｈ璁′负骞傜瓑锛岃纭閲嶅鎻愪氦涓嶄骇鐢熼噸澶嶆暟鎹?",
                expected_db_check="妫€鏌ユ槸鍚﹀嚭鐜伴噸澶嶆暟鎹垨閲嶅鐘舵€佸彉鏇?",
            ))
            sort_index += 1
    return cases


def _normalize_ai_case(case: dict[str, Any], fallback_endpoint_id: str, sort_index: int) -> dict[str, Any]:
    return {
        "case_id": str(case.get("case_id") or f"{fallback_endpoint_id}-AI-{sort_index:03d}"),
        "endpoint_id": str(case.get("endpoint_id") or fallback_endpoint_id),
        "enabled": bool(case.get("enabled", True)),
        "test_scene": str(case.get("test_scene") or "AI琛ュ叏"),
        "title": str(case.get("title") or case.get("鐢ㄤ緥鏍囬") or "AI 琛ュ叏鐢ㄤ緥"),
        "precondition": str(case.get("precondition") or ""),
        "request_method": str(case.get("request_method") or "POST").upper(),
        "request_url": str(case.get("request_url") or ""),
        "request_headers": case.get("request_headers") or {},
        "request_params": case.get("request_params") or {},
        "request_body": case.get("request_body"),
        "expected_status_code": int(case.get("expected_status_code") or 200),
        "expected_response_keywords": case.get("expected_response_keywords") or [],
        "expected_db_check": str(case.get("expected_db_check") or ""),
        "test_level": str(case.get("test_level") or "鍔熻兘"),
        "assertions": case.get("assertions") or [],
        "extract_rules": case.get("extract_rules") or [],
        "depends_on": case.get("depends_on") or [],
        "source": "ai",
        "missing_fields": case.get("missing_fields") or [],
        "request_options": case.get("request_options") or {},
        "sort_index": sort_index,
    }


def merge_cases(base_cases: list[dict[str, Any]], ai_cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for index, case in enumerate([*base_cases, *ai_cases], start=1):
        key = "::".join([
            str(case.get("endpoint_id") or ""),
            str(case.get("request_method") or ""),
            str(case.get("request_url") or ""),
            str(case.get("title") or ""),
        ])
        if key in seen:
            continue
        seen.add(key)
        next_case = copy.deepcopy(case)
        next_case["sort_index"] = index
        merged.append(next_case)
    return merged


async def generate_cases_with_ai(
    parsed_document: dict[str, Any],
    use_ai: bool = True,
    prompt_template_text: str | None = None,
) -> dict[str, Any]:
    base_cases = generate_base_cases(parsed_document)
    if not use_ai:
        return {
            "cases": base_cases,
            "ai_analysis": None,
            "ai_cost": None,
            "token_usage": 0,
            "cost": 0.0,
            "duration_ms": 0,
        }

    ai_response = await call_deepseek(
        build_case_generation_messages(
            parsed_document.get("endpoints") or [],
            base_cases,
            prompt_template_text=prompt_template_text,
        ),
        max_tokens=3200,
        temperature=0.2,
        timeout_seconds=AI_CASE_GENERATION_TIMEOUT_SECONDS,
        max_retries=0,
    )
    if ai_response.get("error"):
        return {
            "cases": base_cases,
            "ai_analysis": {"error": ai_response["error"]},
            "ai_cost": None,
            "token_usage": 0,
            "cost": 0.0,
            "duration_ms": 0,
        }

    result = ai_response.get("result") or {}
    ai_cases_raw = result.get("cases") or []
    fallback_endpoint_id = (parsed_document.get("endpoints") or [{}])[0].get("endpoint_id", "endpoint-001")
    normalized_ai_cases = [
        _normalize_ai_case(case, fallback_endpoint_id=fallback_endpoint_id, sort_index=index)
        for index, case in enumerate(ai_cases_raw, start=1)
        if isinstance(case, dict)
    ]
    usage = ai_response.get("usage") or {}
    ai_cost = calculate_cost(usage, provider=ai_response.get("provider_key")) if usage else None
    return {
        "cases": merge_cases(base_cases, normalized_ai_cases),
        "ai_analysis": result,
        "ai_cost": ai_cost,
        "token_usage": int(usage.get("total_tokens", 0)),
        "cost": 0.0,
        "duration_ms": 0,
    }

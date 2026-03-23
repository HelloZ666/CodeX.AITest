from __future__ import annotations

import base64
import json
import time
from typing import Any
from urllib.parse import urljoin

import httpx

from services.api_automation_signature import build_signature_headers


def _get_nested_value(source: Any, path: str) -> Any:
    if not path:
        return source
    current = source
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            index = int(part)
            current = current[index] if 0 <= index < len(current) else None
        else:
            return None
    return current


def _resolve_template_string(value: str, environment: dict[str, Any], runtime: dict[str, Any]) -> str:
    result = value
    for _ in range(10):
        start = result.find("{{")
        end = result.find("}}", start + 2)
        if start == -1 or end == -1:
            break
        expr = result[start + 2:end].strip()
        if expr.startswith("env."):
            replacement = _get_nested_value(environment, expr.split(".", 1)[1])
        elif expr.startswith("runtime."):
            replacement = _get_nested_value(runtime, expr.split(".", 1)[1])
        else:
            replacement = None
        result = f"{result[:start]}{'' if replacement is None else replacement}{result[end + 2:]}"
    return result


def _resolve_value(value: Any, environment: dict[str, Any], runtime: dict[str, Any]) -> Any:
    if isinstance(value, str):
        return _resolve_template_string(value, environment, runtime)
    if isinstance(value, dict):
        return {key: _resolve_value(item, environment, runtime) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve_value(item, environment, runtime) for item in value]
    return value


def _topological_sort_cases(cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    case_map = {case["case_id"]: case for case in cases}
    visited: set[str] = set()
    stack: set[str] = set()
    ordered: list[dict[str, Any]] = []

    def visit(case_id: str) -> None:
        if case_id in visited or case_id not in case_map or case_id in stack:
            return
        stack.add(case_id)
        for dependency in case_map[case_id].get("depends_on") or []:
            visit(str(dependency))
        stack.remove(case_id)
        visited.add(case_id)
        ordered.append(case_map[case_id])

    for case in cases:
        visit(case["case_id"])
    return ordered


def _compose_url(base_url: str, request_url: str) -> str:
    if request_url.startswith("http://") or request_url.startswith("https://"):
        return request_url
    if not base_url:
        raise ValueError("当前用例使用相对路径，但环境未配置 base_url")
    return urljoin(base_url.rstrip("/") + "/", request_url.lstrip("/"))


async def _perform_login_if_needed(
    client: httpx.AsyncClient,
    auth_mode: str,
    auth_config: dict[str, Any],
    environment: dict[str, Any],
    runtime: dict[str, Any],
) -> None:
    if auth_mode != "login_extract":
        return
    target_key = str(auth_config.get("target_key") or "").strip()
    if target_key and runtime.get(target_key):
        return

    method = str(auth_config.get("login_method") or "POST").upper()
    path = str(auth_config.get("login_path") or "")
    if not path:
        raise ValueError("login_extract 模式缺少 login_path")

    headers = _resolve_value(auth_config.get("login_headers") or {}, environment, runtime)
    query = _resolve_value(auth_config.get("login_query") or {}, environment, runtime)
    body = _resolve_value(auth_config.get("login_body") or {}, environment, runtime)
    response = await client.request(
        method,
        _compose_url(str(environment.get("base_url") or ""), path),
        headers=headers,
        params=query,
        json=body if isinstance(body, (dict, list)) else None,
        data=body if body is not None and not isinstance(body, (dict, list)) else None,
    )
    response.raise_for_status()

    apply_as = str(auth_config.get("apply_as") or "bearer")
    extract_from = str(auth_config.get("extract_from") or "json")
    extract_path = str(auth_config.get("extract_path") or "")
    extracted: Any = None
    if extract_from == "json":
        extracted = _get_nested_value(response.json(), extract_path)
    elif extract_from == "header":
        extracted = response.headers.get(extract_path)
    elif extract_from == "cookie":
        extracted = "; ".join(f"{key}={value}" for key, value in response.cookies.items())

    if target_key and extracted is not None:
        runtime[target_key] = extracted

    if apply_as == "cookie" and not runtime.get("cookie"):
        cookie_value = "; ".join(f"{key}={value}" for key, value in response.cookies.items())
        if cookie_value:
            runtime["cookie"] = cookie_value


def _apply_auth(
    headers: dict[str, str],
    auth_mode: str,
    auth_config: dict[str, Any],
    runtime: dict[str, Any],
) -> dict[str, str]:
    next_headers = dict(headers)
    if auth_mode == "none":
        return next_headers
    if auth_mode == "bearer":
        token = str(runtime.get("token") or auth_config.get("token") or "")
        if token:
            next_headers[str(auth_config.get("header_name") or "Authorization")] = (
                f"{str(auth_config.get('prefix') or 'Bearer ')}{token}"
            )
        return next_headers
    if auth_mode == "basic":
        username = str(auth_config.get("username") or "")
        password = str(auth_config.get("password") or "")
        encoded = base64.b64encode(f"{username}:{password}".encode("utf-8")).decode("utf-8")
        next_headers["Authorization"] = f"Basic {encoded}"
        return next_headers
    if auth_mode == "cookie":
        cookie_value = str(runtime.get("cookie") or auth_config.get("cookie") or "")
        if cookie_value:
            next_headers[str(auth_config.get("header_name") or "Cookie")] = cookie_value
        return next_headers
    if auth_mode == "custom_header":
        header_name = str(auth_config.get("header_name") or "")
        header_value = str(runtime.get("token") or auth_config.get("header_value") or "")
        if header_name and header_value:
            next_headers[header_name] = header_value
        return next_headers
    if auth_mode == "login_extract":
        apply_as = str(auth_config.get("apply_as") or "bearer")
        binding = dict(auth_config)
        binding_key = str(auth_config.get("target_key") or ("cookie" if apply_as == "cookie" else "token"))
        binding_value = runtime.get(binding_key)
        if apply_as == "bearer":
            binding["token"] = binding_value
            return _apply_auth(next_headers, "bearer", binding, runtime)
        if apply_as == "cookie":
            binding["cookie"] = binding_value or runtime.get("cookie")
            return _apply_auth(next_headers, "cookie", binding, runtime)
        if apply_as == "header":
            binding["header_value"] = binding_value
            return _apply_auth(next_headers, "custom_header", binding, runtime)
    return next_headers


def _evaluate_assertion(assertion: dict[str, Any], response: httpx.Response, response_json: Any, duration_ms: int) -> dict[str, Any]:
    assertion_type = str(assertion.get("type") or "")
    operator = str(assertion.get("operator") or "equals")
    path = str(assertion.get("path") or "")
    expected = assertion.get("expected")
    actual = None
    passed = False
    if assertion_type == "status_code":
        actual = response.status_code
        passed = actual == int(expected)
    elif assertion_type == "json":
        actual = _get_nested_value(response_json, path)
        if operator == "exists":
            passed = actual is not None
        elif operator == "equals":
            passed = actual == expected
        elif operator == "contains":
            passed = str(expected) in json.dumps(actual, ensure_ascii=False)
    elif assertion_type == "text":
        actual = response.text
        if operator == "contains":
            passed = str(expected) in response.text
        elif operator == "equals":
            passed = response.text == str(expected)
    elif assertion_type == "latency_ms":
        actual = duration_ms
        if operator == "lte":
            passed = duration_ms <= int(expected)
    return {
        "type": assertion_type,
        "operator": operator,
        "path": path,
        "expected": expected,
        "actual": actual,
        "passed": passed,
    }


def _extract_runtime_variables(
    extract_rules: list[dict[str, Any]],
    response: httpx.Response,
    response_json: Any,
    runtime: dict[str, Any],
) -> dict[str, Any]:
    extracted: dict[str, Any] = {}
    for rule in extract_rules:
        source = str(rule.get("source") or "json")
        path = str(rule.get("path") or "")
        target_key = str(rule.get("target_key") or "").strip()
        if not target_key:
            continue
        value = None
        if source == "json":
            value = _get_nested_value(response_json, path)
        elif source == "header":
            value = response.headers.get(path)
        if value is not None:
            runtime[target_key] = value
            extracted[target_key] = value
    return extracted


async def execute_api_test_suite(environment_config: dict[str, Any], suite: dict[str, Any]) -> dict[str, Any]:
    environment = {
        "base_url": environment_config.get("base_url") or "",
        "timeout_ms": int(environment_config.get("timeout_ms") or 30000),
        "common_headers": environment_config.get("common_headers") or {},
        "auth_mode": environment_config.get("auth_mode") or "none",
        "auth_config": environment_config.get("auth_config") or {},
        "signature_template": environment_config.get("signature_template") or {},
        "login_binding": environment_config.get("login_binding") or {},
    }
    enabled_cases = [case for case in suite.get("cases", []) if case.get("enabled", True)]
    ordered_cases = _topological_sort_cases(enabled_cases)
    runtime: dict[str, Any] = {}
    case_status_map: dict[str, str] = {}
    results: list[dict[str, Any]] = []
    started_at = time.perf_counter()

    timeout_seconds = max(environment["timeout_ms"] / 1000, 1)
    async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
        await _perform_login_if_needed(
            client=client,
            auth_mode=str(environment["auth_mode"]),
            auth_config=environment["auth_config"],
            environment=environment,
            runtime=runtime,
        )

        for case in ordered_cases:
            dependency_ids = [str(item) for item in case.get("depends_on") or []]
            if any(case_status_map.get(dep) != "passed" for dep in dependency_ids):
                results.append({
                    "case_id": case["case_id"],
                    "case_title": case["title"],
                    "endpoint_id": case["endpoint_id"],
                    "status": "blocked",
                    "duration_ms": 0,
                    "request_snapshot": {},
                    "response_snapshot": {},
                    "assertion_results": [],
                    "extracted_variables": {},
                    "error_message": "前置依赖未通过，当前用例被阻塞",
                })
                case_status_map[case["case_id"]] = "blocked"
                continue

            started_case = time.perf_counter()
            resolved_headers = _resolve_value(
                {**(environment["common_headers"] or {}), **(case.get("request_headers") or {})},
                environment,
                runtime,
            )
            query_params = _resolve_value(case.get("request_params") or {}, environment, runtime)
            request_body = _resolve_value(case.get("request_body"), environment, runtime)
            request_url = _resolve_value(case.get("request_url") or "", environment, runtime)
            request_options = case.get("request_options") or {}

            if not bool(request_options.get("skip_auth")):
                resolved_headers = _apply_auth(
                    headers={str(key): str(value) for key, value in resolved_headers.items()},
                    auth_mode=str(environment["auth_mode"]),
                    auth_config=environment["auth_config"],
                    runtime=runtime,
                )

            signature_headers, runtime = build_signature_headers(
                signature_template=environment["signature_template"],
                method=str(case.get("request_method") or "GET"),
                query_params=query_params if isinstance(query_params, dict) else {},
                request_body=request_body,
                runtime_variables=runtime,
            )
            resolved_headers.update(signature_headers)

            final_url = _compose_url(str(environment.get("base_url") or ""), str(request_url))
            request_snapshot = {
                "method": case.get("request_method"),
                "url": final_url,
                "headers": resolved_headers,
                "params": query_params,
                "body": request_body,
                "skip_auth": bool(request_options.get("skip_auth")),
            }

            try:
                response = await client.request(
                    str(case.get("request_method") or "GET"),
                    final_url,
                    headers=resolved_headers,
                    params=query_params if isinstance(query_params, dict) else None,
                    json=request_body if isinstance(request_body, (dict, list)) else None,
                    data=request_body if request_body is not None and not isinstance(request_body, (dict, list)) else None,
                )
                duration_ms = int((time.perf_counter() - started_case) * 1000)
                try:
                    response_json = response.json()
                except Exception:
                    response_json = None
                assertion_results = [
                    _evaluate_assertion(assertion, response, response_json, duration_ms)
                    for assertion in case.get("assertions") or []
                ]
                if not assertion_results:
                    assertion_results = [_evaluate_assertion({
                        "type": "status_code",
                        "operator": "equals",
                        "expected": case.get("expected_status_code", 200),
                    }, response, response_json, duration_ms)]
                passed = all(item.get("passed") for item in assertion_results)
                extracted_variables = _extract_runtime_variables(
                    extract_rules=case.get("extract_rules") or [],
                    response=response,
                    response_json=response_json,
                    runtime=runtime,
                )
                response_snapshot = {
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "text": response.text[:4000],
                    "json": response_json,
                }
                status = "passed" if passed else "failed"
                error_message = None if passed else "断言未通过"
            except Exception as exc:
                duration_ms = int((time.perf_counter() - started_case) * 1000)
                assertion_results = []
                extracted_variables = {}
                response_snapshot = {}
                status = "failed"
                error_message = str(exc)

            results.append({
                "case_id": case["case_id"],
                "case_title": case["title"],
                "endpoint_id": case["endpoint_id"],
                "status": status,
                "duration_ms": duration_ms,
                "request_snapshot": request_snapshot,
                "response_snapshot": response_snapshot,
                "assertion_results": assertion_results,
                "extracted_variables": extracted_variables,
                "error_message": error_message,
            })
            case_status_map[case["case_id"]] = status

    duration_ms = int((time.perf_counter() - started_at) * 1000)
    passed_cases = sum(1 for item in results if item["status"] == "passed")
    failed_cases = sum(1 for item in results if item["status"] == "failed")
    blocked_cases = sum(1 for item in results if item["status"] == "blocked")
    total_cases = len(results)
    endpoint_map: dict[str, dict[str, Any]] = {}
    for item in results:
        current = endpoint_map.setdefault(item["endpoint_id"], {
            "endpoint_id": item["endpoint_id"],
            "case_count": 0,
            "passed": 0,
            "failed": 0,
            "blocked": 0,
        })
        current["case_count"] += 1
        current[item["status"]] += 1

    return {
        "overview": {
            "status": "completed",
            "total_cases": total_cases,
            "passed_cases": passed_cases,
            "failed_cases": failed_cases,
            "blocked_cases": blocked_cases,
            "pass_rate": round((passed_cases / total_cases) * 100, 2) if total_cases else 0,
            "duration_ms": duration_ms,
        },
        "environment_snapshot": environment,
        "suite_snapshot": {
            "suite_id": suite.get("id"),
            "name": suite.get("name"),
            "document_record_id": suite.get("document_record_id"),
        },
        "endpoint_distribution": list(endpoint_map.values()),
        "items": results,
        "runtime_variables": runtime,
        "failure_reasons": [
            {"case_id": item["case_id"], "title": item["case_title"], "reason": item["error_message"]}
            for item in results
            if item["status"] == "failed" and item.get("error_message")
        ],
    }

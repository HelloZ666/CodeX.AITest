from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from services.prompt_template_runtime import merge_task_system_prompt


PROMPT_FILE = Path(__file__).resolve().parent.parent / "resources" / "api_automation_case_prompt.txt"
REQUEST_BODY_ROOT_PATH = "body"


def load_case_generation_prompt(prompt_template_text: str | None = None) -> str:
    if PROMPT_FILE.exists():
        base_prompt = PROMPT_FILE.read_text(encoding="utf-8").strip()
    else:
        base_prompt = "璇峰熀浜庢帴鍙ｄ笂涓嬫枃鐢熸垚缁撴瀯鍖栨帴鍙ｆ祴璇曠敤渚嬨€?"
    return merge_task_system_prompt(base_prompt, prompt_template_text)


def _normalize_text(value: Any, max_length: int = 160) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= max_length:
        return text
    return f"{text[: max_length - 1]}鈥?"


def _infer_literal_type(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int) and not isinstance(value, bool):
        return "integer"
    if isinstance(value, float):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "object"
    return "string"


def _append_when_present(target: dict[str, Any], key: str, value: Any) -> None:
    if value is None:
        return
    if isinstance(value, str) and not value.strip():
        return
    if isinstance(value, (list, dict)) and not value:
        return
    target[key] = value


def _compact_parameter(parameter: dict[str, Any]) -> dict[str, Any]:
    compact = {
        "name": str(parameter.get("name") or ""),
        "type": str(parameter.get("type") or "string"),
        "required": bool(parameter.get("required", False)),
        "location": str(parameter.get("location") or ""),
    }
    _append_when_present(compact, "description", _normalize_text(parameter.get("description"), 120))
    for key in ("example", "enum", "default", "format", "pattern", "minimum", "maximum"):
        _append_when_present(compact, key, parameter.get(key))
    _append_when_present(compact, "min_length", parameter.get("min_length", parameter.get("minLength")))
    _append_when_present(compact, "max_length", parameter.get("max_length", parameter.get("maxLength")))
    _append_when_present(compact, "min_items", parameter.get("min_items", parameter.get("minItems")))
    _append_when_present(compact, "max_items", parameter.get("max_items", parameter.get("maxItems")))
    return compact


def _build_schema_field(path: str, schema: dict[str, Any], required: bool) -> dict[str, Any]:
    field = {
        "path": path or REQUEST_BODY_ROOT_PATH,
        "type": str(schema.get("type") or "object"),
        "required": required,
    }
    _append_when_present(field, "description", _normalize_text(schema.get("description"), 120))
    for key in ("example", "enum", "default", "format", "pattern", "minimum", "maximum"):
        _append_when_present(field, key, schema.get(key))
    _append_when_present(field, "min_length", schema.get("min_length", schema.get("minLength")))
    _append_when_present(field, "max_length", schema.get("max_length", schema.get("maxLength")))
    _append_when_present(field, "min_items", schema.get("min_items", schema.get("minItems")))
    _append_when_present(field, "max_items", schema.get("max_items", schema.get("maxItems")))
    return field


def _dedupe_schema_fields(fields: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for field in fields:
        key = (str(field.get("path") or ""), str(field.get("type") or ""))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(field)
    return deduped


def _should_include_container_field(schema: dict[str, Any], path: str) -> bool:
    if not path:
        return False
    if schema.get("type") == "array":
        return True
    metadata_keys = (
        "description",
        "example",
        "enum",
        "default",
        "format",
        "pattern",
        "minimum",
        "maximum",
        "min_length",
        "max_length",
        "minLength",
        "maxLength",
        "min_items",
        "max_items",
        "minItems",
        "maxItems",
    )
    return any(schema.get(key) not in (None, "", [], {}) for key in metadata_keys)


def _flatten_body_schema(schema: Any, path: str = "", required: bool = False) -> list[dict[str, Any]]:
    if isinstance(schema, dict):
        for composition_key in ("allOf", "anyOf", "oneOf"):
            variants = schema.get(composition_key)
            if isinstance(variants, list) and variants:
                fields: list[dict[str, Any]] = []
                for variant in variants:
                    fields.extend(_flatten_body_schema(variant, path, required))
                return _dedupe_schema_fields(fields)

        properties = schema.get("properties")
        if isinstance(properties, dict) and properties:
            required_fields = {str(item) for item in schema.get("required") or []}
            fields: list[dict[str, Any]] = []
            if _should_include_container_field(schema, path):
                fields.append(_build_schema_field(path, schema, required))
            for key, value in properties.items():
                next_path = f"{path}.{key}" if path else str(key)
                fields.extend(_flatten_body_schema(value, next_path, str(key) in required_fields))
            return _dedupe_schema_fields(fields)

        items = schema.get("items")
        if isinstance(items, dict):
            next_path = f"{path}[]" if path else f"{REQUEST_BODY_ROOT_PATH}[]"
            nested_fields = _flatten_body_schema(items, next_path, required)
            if _should_include_container_field(schema, path or REQUEST_BODY_ROOT_PATH):
                nested_fields = [
                    _build_schema_field(path or REQUEST_BODY_ROOT_PATH, schema, required),
                    *nested_fields,
                ]
            if nested_fields:
                return _dedupe_schema_fields(nested_fields)

        if "type" in schema or "example" in schema or "description" in schema:
            return [_build_schema_field(path or REQUEST_BODY_ROOT_PATH, schema, required)]

        fields = []
        for key, value in schema.items():
            next_path = f"{path}.{key}" if path else str(key)
            fields.extend(_flatten_body_schema(value, next_path, required))
        return _dedupe_schema_fields(fields)

    if isinstance(schema, list):
        if not schema:
            return [{
                "path": path or f"{REQUEST_BODY_ROOT_PATH}[]",
                "type": "array",
                "required": required,
            }]
        return _flatten_body_schema(schema[0], path or f"{REQUEST_BODY_ROOT_PATH}[]", required)

    return [{
        "path": path or REQUEST_BODY_ROOT_PATH,
        "type": _infer_literal_type(schema),
        "required": required,
        "example": schema,
    }]


def _flatten_schema_paths(schema: Any, path: str = "") -> list[str]:
    if isinstance(schema, dict):
        for composition_key in ("allOf", "anyOf", "oneOf"):
            variants = schema.get(composition_key)
            if isinstance(variants, list) and variants:
                result: list[str] = []
                for variant in variants:
                    result.extend(_flatten_schema_paths(variant, path))
                return list(dict.fromkeys(result))

        properties = schema.get("properties")
        if isinstance(properties, dict) and properties:
            result: list[str] = []
            for key, value in properties.items():
                next_path = f"{path}.{key}" if path else str(key)
                result.extend(_flatten_schema_paths(value, next_path))
            return list(dict.fromkeys(result))

        items = schema.get("items")
        if items is not None:
            next_path = f"{path}[]" if path else "items[]"
            return _flatten_schema_paths(items, next_path)

        if "type" in schema or "example" in schema:
            return [path] if path else []

        result: list[str] = []
        for key, value in schema.items():
            next_path = f"{path}.{key}" if path else str(key)
            result.extend(_flatten_schema_paths(value, next_path))
        return list(dict.fromkeys(result))

    if isinstance(schema, list):
        if not schema:
            return [path] if path else []
        next_path = f"{path}[]" if path else "items[]"
        return _flatten_schema_paths(schema[0], next_path)

    return [path] if path else []


def _build_endpoint_context(endpoint: dict[str, Any]) -> dict[str, Any]:
    return {
        "endpoint_id": str(endpoint.get("endpoint_id") or ""),
        "group_name": str(endpoint.get("group_name") or ""),
        "name": str(endpoint.get("name") or ""),
        "method": str(endpoint.get("method") or "").upper(),
        "path": str(endpoint.get("path") or ""),
        "summary": _normalize_text(endpoint.get("summary")),
        "request_spec": {
            "headers": [_compact_parameter(item) for item in endpoint.get("headers") or []],
            "path_params": [_compact_parameter(item) for item in endpoint.get("path_params") or []],
            "query_params": [_compact_parameter(item) for item in endpoint.get("query_params") or []],
            "body_fields": _flatten_body_schema(endpoint.get("body_schema") or {}),
        },
        "response_hints": {
            "success_keywords": _flatten_schema_paths(endpoint.get("response_schema") or {})[:6],
            "error_codes": [
                {
                    "code": str(item.get("code") or ""),
                    "description": _normalize_text(item.get("description"), 80),
                }
                for item in endpoint.get("error_codes") or []
                if isinstance(item, dict)
            ][:8],
        },
        "dependency_hints": [
            _normalize_text(item, 80)
            for item in endpoint.get("dependency_hints") or []
            if str(item or "").strip()
        ][:6],
        "missing_fields": [
            str(item)
            for item in endpoint.get("missing_fields") or []
            if str(item or "").strip()
        ],
    }


def _build_case_outline(base_cases: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    order: list[str] = []

    for case in base_cases:
        endpoint_id = str(case.get("endpoint_id") or "")
        if endpoint_id not in grouped:
            grouped[endpoint_id] = {
                "endpoint_id": endpoint_id,
                "covered_cases": [],
            }
            order.append(endpoint_id)

        outline_case = {
            "test_scene": str(case.get("test_scene") or ""),
            "title": str(case.get("title") or ""),
            "expected_status_code": int(case.get("expected_status_code") or 200),
            "test_level": str(case.get("test_level") or ""),
        }
        request_options = case.get("request_options") or {}
        if request_options:
            outline_case["request_options"] = {
                str(key): value
                for key, value in request_options.items()
                if value not in (None, "", [], {})
            }
        grouped[endpoint_id]["covered_cases"].append(outline_case)

    return [grouped[endpoint_id] for endpoint_id in order]


def build_case_generation_context(endpoints: list[dict[str, Any]], base_cases: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "endpoint_contexts": [_build_endpoint_context(endpoint) for endpoint in endpoints],
        "existing_case_outline": _build_case_outline(base_cases),
    }


def build_case_generation_messages(
    endpoints: list[dict],
    base_cases: list[dict],
    prompt_template_text: str | None = None,
) -> list[dict]:
    compact_context = build_case_generation_context(endpoints, base_cases)
    system_prompt = (
        f"{load_case_generation_prompt(prompt_template_text)}\n\n"
        "浠ヤ笅杈撳叆宸茬粡琚暣鐞嗕负鐢熸垚鎺ュ彛娴嬭瘯鐢ㄤ緥鐨勬渶灏忓繀瑕佷笂涓嬫枃锛屼笉鍐嶅寘鍚暣浠芥帴鍙ｆ枃妗ｅ叏鏂囥€?"
        "璇蜂紭鍏堜緷鎹?request_spec 涓殑璇锋眰鍙傛暟瑙勮寖鏉ヨ璁¤ˉ鍏呯敤渚嬶紝閲嶇偣鍏虫敞蹇呭～/閫夊～缁勫悎銆佺被鍨嬫牸寮忋€侀暱搴﹁寖鍥淬€佹灇涓俱€佽竟鐣屽€笺€侀壌鏉冦€侀摼璺緷璧栧拰瀹夊叏鍦烘櫙銆?"
        "濡傛灉涓婁笅鏂囨病鏈夌粰鍑烘煇涓笟鍔¤鍒欙紝涓嶈鑷嗛€犮€俓n\n"
        "杈撳嚭蹇呴』鏄悎娉?JSON 瀵硅薄锛屽寘鍚?cases 鏁扮粍銆?"
        "姣忎釜 case 蹇呴』鍖呭惈锛?"
        "case_id銆乪ndpoint_id銆乼est_scene銆乼itle銆乸recondition銆乺equest_method銆乺equest_url銆?"
        "request_headers銆乺equest_params銆乺equest_body銆乪xpected_status_code銆?"
        "expected_response_keywords銆乪xpected_db_check銆乼est_level銆乤ssertions銆乪xtract_rules銆?"
        "depends_on銆乻ource銆乵issing_fields銆乺equest_options銆?"
        "鍏朵腑 assertions 涓烘暟缁勶紝姣忛」鍖呭惈 type/operator/path/expected锛?"
        "extract_rules 涓烘暟缁勶紝姣忛」鍖呭惈 source/path/target_key锛?"
        "source 鍥哄畾杈撳嚭 ai锛屼笉瑕佽緭鍑?Markdown銆?"
    )
    user_prompt = (
        "浠ヤ笅鏄凡缁忓帇缂╁悗鐨勬帴鍙ｆ祴璇曠敓鎴愪笂涓嬫枃銆?"
        "鍏朵腑 endpoint_contexts 鍙繚鐣欐帴鍙ｆ瑕併€佽姹傚弬鏁拌鑼冦€佸搷搴旀彁绀恒€佷緷璧栨彁绀哄拰缂哄け瀛楁锛?"
        "existing_case_outline 鍙敤浜庢彁绀轰綘鍝簺鍩虹鍦烘櫙宸茬粡瑕嗙洊锛岄伩鍏嶉噸澶嶇敓鎴愩€俓n\n"
        f"{json.dumps(compact_context, ensure_ascii=False, indent=2)}\n\n"
        "璇疯ˉ鍏呭鏄撻仐婕忕殑寮傚父銆佸畨鍏ㄣ€侀摼璺緷璧栥€佽竟鐣屽拰閴存潈鍦烘櫙锛屽苟閬垮厤涓?existing_case_outline 閲嶅銆?"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]


def build_document_parse_messages(
    filename: str,
    raw_text: str,
    prompt_template_text: str | None = None,
) -> list[dict]:
    base_system_prompt = (
        "浣犳槸涓€浣嶆帴鍙ｆ枃妗ｈВ鏋愬姪鎵嬨€?"
        "璇蜂粠闈炵粨鏋勫寲鎺ュ彛鏂囨。涓彁鍙栫粺涓€缁撴瀯鐨勬帴鍙ｆ竻鍗曘€?"
        "杈撳嚭蹇呴』鏄悎娉?JSON 瀵硅薄锛屽寘鍚?endpoints 鏁扮粍銆?"
        "姣忎釜 endpoint 鍖呭惈锛歟ndpoint_id銆乬roup_name銆乶ame銆乵ethod銆乸ath銆乻ummary銆乭eaders銆?"
        "path_params銆乹uery_params銆乥ody_schema銆乺esponse_schema銆乪rror_codes銆乨ependency_hints銆?"
        "missing_fields銆乻ource_type銆?"
        "headers/path_params/query_params 涓瘡椤瑰寘鍚?name/type/required/description/example/location銆?"
        "body_schema 鍜?response_schema 浣跨敤瀵硅薄缁撴瀯琛ㄨ揪瀛楁銆?"
        "鑻ュ瓧娈电己澶憋紝璇峰湪 missing_fields 涓爣鍑恒€?"
    )
    system_prompt = merge_task_system_prompt(base_system_prompt, prompt_template_text)

    user_prompt = (
        f"鏂囦欢鍚嶏細{filename}\n"
        "浠ヤ笅鏄粠鎺ュ彛鏂囨。鎶藉彇鐨勫師濮嬫枃鏈紝璇峰敖閲忔彁鍙栨帴鍙ｅ畾涔夈€俓n"
        f"{raw_text[:18000]}"
    )
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

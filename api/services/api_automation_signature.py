from __future__ import annotations

import hashlib
import hmac
import json
import time
from typing import Any


SUPPORTED_SIGNATURE_ALGORITHMS = {"md5", "sha1", "sha256", "hmac-sha256"}


def _stringify_sign_payload(payload: dict[str, str]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def _hash_hex_payload(algorithm: str, hex_payload: str, secret: str = "") -> str:
    normalized = algorithm.strip().lower()
    payload_bytes = hex_payload.encode("utf-8")
    if normalized == "md5":
        return hashlib.md5(payload_bytes).hexdigest().upper()
    if normalized == "sha1":
        return hashlib.sha1(payload_bytes).hexdigest().upper()
    if normalized == "sha256":
        return hashlib.sha256(payload_bytes).hexdigest().upper()
    if normalized == "hmac-sha256":
        return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest().upper()
    raise ValueError(f"Unsupported signature algorithm: {algorithm}")


def _normalize_scalar(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list, tuple, set)):
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def build_signature_headers(
    signature_template: dict[str, Any] | None,
    method: str,
    query_params: dict[str, Any] | None,
    request_body: Any,
    runtime_variables: dict[str, Any] | None = None,
) -> tuple[dict[str, str], dict[str, Any]]:
    if not signature_template or not signature_template.get("enabled"):
        return {}, runtime_variables or {}

    runtime = dict(runtime_variables or {})
    algorithm = str(signature_template.get("algorithm") or "md5").lower()
    if algorithm not in SUPPORTED_SIGNATURE_ALGORITHMS:
        raise ValueError("signature algorithm is not supported")

    payload: dict[str, str] = {}
    fixed_fields = signature_template.get("fixed_fields") or {}
    for key, value in fixed_fields.items():
        normalized = _normalize_scalar(value)
        if normalized is not None:
            payload[str(key)] = normalized

    timestamp_field = str(signature_template.get("timestamp_field") or "timestamp")
    timestamp_value = str(signature_template.get("timestamp_value") or int(time.time() * 1000))
    runtime[timestamp_field] = timestamp_value
    payload[timestamp_field] = timestamp_value

    include_query = bool(signature_template.get("include_query_params", True))
    include_body = bool(signature_template.get("include_body_fields", True))
    scalar_only = bool(signature_template.get("scalar_only", True))

    if include_query:
        for key, value in (query_params or {}).items():
            normalized = _normalize_scalar(value) if scalar_only else str(value)
            if normalized is not None:
                payload[str(key)] = normalized

    if include_body and isinstance(request_body, dict):
        for key, value in request_body.items():
            normalized = _normalize_scalar(value) if scalar_only else str(value)
            if normalized is not None:
                payload[str(key)] = normalized

    sorted_payload = {key: str(payload[key]) for key in sorted(payload)}
    payload_string = _stringify_sign_payload(sorted_payload)
    hex_payload = payload_string.encode("utf-8").hex()
    sign = _hash_hex_payload(
        algorithm=algorithm,
        hex_payload=hex_payload,
        secret=str(signature_template.get("secret") or ""),
    )

    sign_header = str(signature_template.get("sign_header") or "sign")
    header_fields = dict(signature_template.get("header_fields") or {})
    headers = {str(key): str(value) for key, value in header_fields.items() if value is not None}
    headers[sign_header] = sign

    timestamp_header = signature_template.get("timestamp_header")
    if timestamp_header:
        headers[str(timestamp_header)] = timestamp_value

    runtime["sign"] = sign
    runtime["sign_payload"] = sorted_payload
    runtime["sign_hex_payload"] = hex_payload
    return headers, runtime

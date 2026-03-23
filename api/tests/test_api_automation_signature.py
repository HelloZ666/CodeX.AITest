import hashlib
import json

from services.api_automation_signature import build_signature_headers


def test_build_signature_headers_matches_sample_template():
    signature_template = {
        "enabled": True,
        "algorithm": "md5",
        "timestamp_field": "timestamp",
        "timestamp_value": "1709251200000",
        "timestamp_header": "timestamp",
        "sign_header": "sign",
        "fixed_fields": {
            "saltValue": "xJ54&8b$60",
        },
        "header_fields": {
            "sysCode": "KJGX",
        },
    }
    request_body = {
        "employeeIds": "ZJ000163",
        "queryDate": "2026-02-28",
        "queryEnd": "2026-02-28",
        "queryStart": "2025-11-01",
        "queryType": "1",
    }

    headers, runtime = build_signature_headers(
        signature_template=signature_template,
        method="POST",
        query_params={},
        request_body=request_body,
        runtime_variables={},
    )

    expected_payload = {
        "employeeIds": "ZJ000163",
        "queryDate": "2026-02-28",
        "queryEnd": "2026-02-28",
        "queryStart": "2025-11-01",
        "queryType": "1",
        "saltValue": "xJ54&8b$60",
        "timestamp": "1709251200000",
    }
    expected_payload = {key: expected_payload[key] for key in sorted(expected_payload)}
    payload_text = json.dumps(expected_payload, ensure_ascii=False, separators=(",", ":"))
    expected_sign = hashlib.md5(payload_text.encode("utf-8").hex().encode("utf-8")).hexdigest().upper()

    assert headers == {
        "sysCode": "KJGX",
        "sign": expected_sign,
        "timestamp": "1709251200000",
    }
    assert runtime["timestamp"] == "1709251200000"
    assert runtime["sign"] == expected_sign
    assert runtime["sign_payload"] == expected_payload

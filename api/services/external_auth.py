import base64
import json
from typing import Optional

import httpx

from services.runtime_paths import get_environment_variable


class ExternalAuthError(Exception):
    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def get_external_auth_url() -> str:
    return get_environment_variable("EXTERNAL_AUTH_URL") or ""


def get_external_auth_timeout_ms() -> int:
    raw = get_environment_variable("EXTERNAL_AUTH_TIMEOUT_MS") or "10000"
    try:
        value = int(raw)
    except ValueError:
        return 10000
    return max(1000, value)


def is_external_auth_enabled() -> bool:
    return bool(get_external_auth_url())


def _decode_external_user(encoded_user: str) -> dict:
    try:
        decoded_bytes = base64.b64decode(encoded_user)
        decoded_text = decoded_bytes.decode("utf-8")
        payload = json.loads(decoded_text)
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ExternalAuthError("内部认证服务返回的数据无法解析", status_code=502) from exc

    if not isinstance(payload, dict):
        raise ExternalAuthError("内部认证服务返回的数据无法解析", status_code=502)
    return payload


def _normalize_external_user(profile: dict) -> dict:
    username = str(profile.get("username") or profile.get("p13user") or profile.get("oauser") or "").strip()
    if not username:
        raise ExternalAuthError("内部认证服务未返回用户名", status_code=502)

    display_name = str(profile.get("name") or username).strip() or username
    email_value = profile.get("email")
    email = str(email_value).strip() if email_value else None

    return {
        "username": username,
        "display_name": display_name,
        "email": email or None,
        "profile": profile,
    }


async def authenticate_external_user(username: str, password: str) -> Optional[dict]:
    auth_url = get_external_auth_url()
    if not auth_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=get_external_auth_timeout_ms() / 1000) as client:
            response = await client.post(
                auth_url,
                data={
                    "username": username,
                    "password": password,
                },
            )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise ExternalAuthError("内部认证服务返回异常状态", status_code=502) from exc
    except httpx.RequestError as exc:
        raise ExternalAuthError("内部认证服务暂时不可用", status_code=503) from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise ExternalAuthError("内部认证服务返回的数据无法解析", status_code=502) from exc

    if not isinstance(payload, dict):
        raise ExternalAuthError("内部认证服务返回的数据无法解析", status_code=502)

    code = payload.get("code")
    if str(code) != "200":
        message = str(payload.get("msg") or "Account verification failed").strip()
        raise ExternalAuthError(message or "Account verification failed", status_code=401)

    encoded_user = payload.get("user")
    if not isinstance(encoded_user, str) or not encoded_user.strip():
        raise ExternalAuthError("内部认证服务未返回用户信息", status_code=502)

    decoded_profile = _decode_external_user(encoded_user)
    return _normalize_external_user(decoded_profile)

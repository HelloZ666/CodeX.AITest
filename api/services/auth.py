import os
from typing import Optional


SESSION_COOKIE_NAME = "codetestguard_session"
SESSION_DURATION_DAYS = 7


def get_session_secret() -> str:
    return os.environ.get("SESSION_SECRET", "").strip()


def get_allowed_origins() -> list[str]:
    raw = os.environ.get("CORS_ALLOW_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]


def is_secure_cookie_enabled() -> bool:
    return os.environ.get("SESSION_COOKIE_SECURE", "").strip().lower() in {"1", "true", "yes"}


def get_session_cookie_settings() -> dict:
    same_site = os.environ.get("SESSION_COOKIE_SAMESITE", "lax").strip().lower() or "lax"
    return {
        "key": SESSION_COOKIE_NAME,
        "httponly": True,
        "samesite": same_site,
        "secure": is_secure_cookie_enabled(),
        "path": "/",
        "max_age": SESSION_DURATION_DAYS * 24 * 60 * 60,
    }


def get_session_cookie_from_headers(cookie_header: Optional[str]) -> Optional[str]:
    if not cookie_header:
        return None
    for cookie in cookie_header.split(";"):
        name, _, value = cookie.strip().partition("=")
        if name == SESSION_COOKIE_NAME and value:
            return value
    return None

from services.auth import get_allowed_origins


def test_get_allowed_origins_includes_local_preview_ports(monkeypatch):
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)

    origins = get_allowed_origins()

    assert "http://localhost:4173" in origins
    assert "http://127.0.0.1:4173" in origins
    assert "http://localhost:5173" in origins
    assert "http://127.0.0.1:5173" in origins

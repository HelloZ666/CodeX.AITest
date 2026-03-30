from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from services import requirement_document_parser as requirement_parser
from services.database import init_db
from tests.test_requirement_document_parser import FakeOleFile, build_fake_doc_streams


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_ai_agent_attachment_parsing.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    init_db()
    return db_path


@pytest.fixture
def client():
    from index import app

    with TestClient(app) as test_client:
        login_resp = test_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "Admin123!"},
        )
        assert login_resp.status_code == 200
        yield test_client


def test_ai_agent_chat_accepts_legacy_doc_content_with_docx_extension(client):
    raw_text = "测试旧版Word内容\r功能描述\r这里是正文。\r"
    word_stream, table_stream = build_fake_doc_streams(raw_text)
    fake_ole = FakeOleFile({"WordDocument": word_stream, "0Table": table_stream})
    legacy_doc_bytes = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + (b"\x00" * 128)

    with patch.object(requirement_parser.olefile, "OleFileIO", lambda *_args, **_kwargs: fake_ole):
        with patch(
            "index.call_ai_text",
            new=AsyncMock(
                return_value={
                    "answer": "已读取附件并继续回答",
                    "provider": "DeepSeek",
                    "provider_key": "deepseek",
                    "final_content": "已读取附件并继续回答",
                }
            ),
        ):
            response = client.post(
                "/api/ai-tools/agents/chat",
                data={
                    "question": "请结合附件继续分析",
                    "agent_key": "general",
                },
                files=[
                    (
                        "attachments",
                        (
                            "legacy.docx",
                            legacy_doc_bytes,
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                        ),
                    ),
                ],
            )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["answer"] == "已读取附件并继续回答"
    assert payload["attachments"][0]["file_name"] == "legacy.docx"
    assert "测试旧版Word内容" in payload["attachments"][0]["excerpt"]
    assert payload["user_message"]["content"] == "请结合附件继续分析"
    assert payload["assistant_message"]["content"] == "已读取附件并继续回答"

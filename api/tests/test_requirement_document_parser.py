import struct

import pytest

from services import requirement_document_parser as parser


def build_fake_doc_streams(text: str) -> tuple[bytes, bytes]:
    text_bytes = text.encode("utf-16le")
    word_stream = bytearray(2048 + len(text_bytes))

    struct.pack_into("<H", word_stream, 0, 0xA5EC)
    struct.pack_into("<H", word_stream, 2, 193)
    struct.pack_into("<I", word_stream, 24, 2048)
    struct.pack_into("<I", word_stream, 28, 2048 + len(text_bytes))
    struct.pack_into("<H", word_stream, 32, 14)
    struct.pack_into("<H", word_stream, 62, 22)
    struct.pack_into("<H", word_stream, 152, 164)

    fib_rg_fc_lcb = bytearray(164 * 8)
    struct.pack_into("<II", fib_rg_fc_lcb, 0x108, 0, 21)
    word_stream[154:154 + len(fib_rg_fc_lcb)] = fib_rg_fc_lcb
    word_stream[2048:2048 + len(text_bytes)] = text_bytes

    char_count = len(text)
    plcpcd = (
        struct.pack("<II", 0, char_count)
        + b"\x00\x00"
        + struct.pack("<I", 2048)
        + b"\x00\x00"
    )
    table_stream = b"\x02" + struct.pack("<I", len(plcpcd)) + plcpcd
    return bytes(word_stream), table_stream


class FakeOleStream:
    def __init__(self, data: bytes):
        self._data = data

    def read(self) -> bytes:
        return self._data


class FakeOleFile:
    def __init__(self, streams: dict[str, bytes]):
        self._streams = streams

    def exists(self, stream_name: str) -> bool:
        return stream_name in self._streams

    def openstream(self, stream_name: str) -> FakeOleStream:
        return FakeOleStream(self._streams[stream_name])

    def close(self) -> None:
        return None


@pytest.fixture
def fake_legacy_doc(monkeypatch):
    raw_text = (
        "山东济宁中支明白纸修改\r"
        "*功能描述\r"
        "增加温馨提示语音播报，并同步更新抄录内容。\r"
        "界面\r"
        "页面展示温馨提示文案，并补充展示与播报一致性验证。\r"
    )
    word_stream, table_stream = build_fake_doc_streams(raw_text)
    fake_ole = FakeOleFile(
        {
            "WordDocument": word_stream,
            "0Table": table_stream,
        }
    )
    monkeypatch.setattr(parser.olefile, "OleFileIO", lambda *_args, **_kwargs: fake_ole)
    return b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + (b"\x00" * 128)


def test_parse_requirement_document_supports_doc_sections_without_numbering(fake_legacy_doc):
    result = parser.parse_requirement_document(fake_legacy_doc, "legacy.doc")

    assert result["document_type"] == "doc"
    assert result["selected_mode"] == "preferred_sections"
    assert [section["number"] for section in result["selected_sections"]] == ["4.1", "4.4"]
    assert [point["section_number"] for point in result["points"]] == ["4.1", "4.4"]
    assert "语音播报" in result["points"][0]["text"]
    assert "一致性验证" in result["points"][1]["text"]


def test_parse_requirement_document_sniffs_doc_content_even_if_extension_is_docx(fake_legacy_doc):
    result = parser.parse_requirement_document(fake_legacy_doc, "legacy.docx")

    assert result["document_type"] == "doc"
    assert result["selected_mode"] == "preferred_sections"


def test_parse_requirement_document_supports_markdown_sections():
    content = (
        "# 需求说明\n"
        "## 4.1 功能描述\n"
        "- 新增资格校验，未满足条件时禁止提交并提示原因。\n"
        "## 4.4 界面\n"
        "- 页面展示资格校验失败提示，并提供修正引导。\n"
    ).encode("utf-8")

    result = parser.parse_requirement_document(content, "requirement.md")

    assert result["document_type"] == "markdown"
    assert result["selected_mode"] == "preferred_sections"
    assert [section["number"] for section in result["selected_sections"]] == ["4.1", "4.4"]
    assert [point["section_number"] for point in result["points"]] == ["4.1", "4.4"]
    assert "资格校验" in result["points"][0]["text"]
    assert "失败提示" in result["points"][1]["text"]

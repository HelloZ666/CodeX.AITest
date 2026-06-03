import json
import sqlite3

import pytest

from services import pdf_check_store


def make_snapshot(text: str) -> dict:
    return {
        "page_count": 1,
        "ocr_used": False,
        "ocr_available": True,
        "warnings": [],
        "pages": [
            {
                "page_number": 1,
                "width": 100,
                "height": 100,
                "image_data_url": "data:image/jpeg;base64,",
                "image_width": 100,
                "image_height": 100,
                "image_scale": 1,
                "words": [
                    {
                        "id": "p1-w1",
                        "text": text,
                        "bbox": [10, 10, 40, 20],
                        "block": 0,
                        "line": 0,
                        "word": 0,
                    }
                ],
            }
        ],
    }


def make_snapshot_from_words(words: list[dict]) -> dict:
    return {
        "page_count": 1,
        "ocr_used": False,
        "ocr_available": True,
        "warnings": [],
        "pages": [
            {
                "page_number": 1,
                "width": 240,
                "height": 120,
                "image_data_url": "data:image/jpeg;base64,",
                "image_width": 240,
                "image_height": 120,
                "image_scale": 1,
                "words": words,
            }
        ],
    }


def make_snapshot_without_images(text: str) -> dict:
    snapshot = make_snapshot(text)
    for page in snapshot["pages"]:
        page.pop("image_data_url", None)
        page.pop("image_width", None)
        page.pop("image_height", None)
        page.pop("image_scale", None)
    return snapshot


@pytest.fixture
def pdf_check_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "pdf_check.db")
    monkeypatch.setattr(pdf_check_store, "get_db_path", lambda: db_path)

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("CREATE TABLE projects (id INTEGER PRIMARY KEY, name TEXT)")
        conn.execute("INSERT INTO projects (id, name) VALUES (1, 'Project')")
        pdf_check_store.ensure_pdf_check_tables(conn)
        conn.execute(
            """
            INSERT INTO pdf_templates (
                id, project_id, name, file_name, file_size, content, extraction_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (10, 1, "Policy template", "template.pdf", 8, b"%PDF-1.4", json.dumps(make_snapshot("same"))),
        )
        conn.commit()
    finally:
        conn.close()

    return db_path


def test_create_pdf_check_record_persists_variable_rules_and_operator(pdf_check_db, monkeypatch):
    template_snapshot = make_snapshot("same")
    candidate_snapshot = make_snapshot("same")
    monkeypatch.setattr(pdf_check_store, "_now_text", lambda: "2026-06-01 12:34:56")

    monkeypatch.setattr(
        pdf_check_store,
        "get_pdf_template_preview",
        lambda template_id, include_deleted=False: {
            "id": template_id,
            "project_id": 1,
            "name": "Policy template",
            "file_name": "template.pdf",
            "extraction": template_snapshot,
        },
    )
    monkeypatch.setattr(
        pdf_check_store,
        "extract_pdf_snapshot",
        lambda content, file_name: candidate_snapshot,
    )

    record = pdf_check_store.create_pdf_check_record(
        project_id=1,
        test_version="v1",
        template_id=10,
        candidate_file_name="candidate.pdf",
        candidate_content=b"%PDF-1.4",
        variable_rules={
            "enabled": True,
            "use_builtin": False,
            "keywords": ["policy_no"],
            "regexes": [r"\d{8,}"],
            "regions": [
                {
                    "id": "customer",
                    "name": "Customer",
                    "page_number": 1,
                    "x": 5,
                    "y": 5,
                    "width": 50,
                    "height": 20,
                }
            ],
        },
        operator={"id": 7, "username": "tester", "display_name": "Tester"},
    )

    assert record["final_result"] == "passed"
    assert record["result_source"] == "system"
    assert record["ignored_diff_count"] == 0
    assert record["operator_user_id"] == 7
    assert record["operator_username"] == "tester"
    assert record["operator_display_name"] == "Tester"
    assert record["created_at"] == "2026-06-01 12:34:56"
    assert record["updated_at"] == "2026-06-01 12:34:56"
    assert record["variable_rules"]["enabled"] is True
    assert record["variable_rules"]["keywords"] == ["policy_no"]
    assert record["variable_rules"]["regions"][0]["id"] == "customer"


def test_create_policy_pdf_check_record_persists_ai_analysis_and_uses_policy_filter(pdf_check_db, monkeypatch):
    source_snapshot = make_snapshot("投保声明一致")
    target_snapshot = make_snapshot("投保声明不同")
    comparison = pdf_check_store.compare_pdf_snapshots(
        source_snapshot,
        target_snapshot,
        pdf_check_store.normalize_variable_rules(
            {"enabled": False, "use_builtin": False, "keywords": [], "regexes": [], "regions": []}
        ),
    )
    monkeypatch.setattr(pdf_check_store, "_now_text", lambda: "2026-06-02 09:00:00")

    record = pdf_check_store.create_policy_pdf_check_record(
        project_id=1,
        test_version="20260602",
        source_policy_code="P1001",
        target_policy_code="P1002",
        source_file_name="P1001.pdf",
        target_file_name="P1002.pdf",
        source_content=b"%PDF-source",
        target_content=b"%PDF-target",
        source_snapshot=source_snapshot,
        target_snapshot=target_snapshot,
        comparison=comparison,
        prompt_template_key="prompt_policy",
        ai_analysis={
            "result": "failed",
            "summary": "声明内容不一致",
            "findings": [{"title": "声明差异", "reason": "目标保单声明不同"}],
        },
        source_file_url="https://oss.example/P1001.pdf",
        target_file_url="https://oss.example/P1002.pdf",
        operator={"id": 8, "username": "policy-user", "display_name": "Policy User"},
    )

    assert record["check_type"] == "policy"
    assert record["prompt_template_key"] == "prompt_policy"
    assert record["source_policy_code"] == "P1001"
    assert record["target_policy_code"] == "P1002"
    assert record["source_file_url"] == "https://oss.example/P1001.pdf"
    assert record["target_file_url"] == "https://oss.example/P1002.pdf"
    assert record["final_result"] == "failed"
    assert record["diff_count"] == 1
    assert record["ai_analysis"]["summary"] == "声明内容不一致"
    assert record["operator_username"] == "policy-user"
    assert record["created_at"] == "2026-06-02 09:00:00"
    assert pdf_check_store.list_pdf_check_records(project_id=1) == []
    assert [item["id"] for item in pdf_check_store.list_pdf_check_records(project_id=1, check_type="policy")] == [record["id"]]


def test_compare_pdf_snapshots_ignores_address_value_changes_with_builtin_regex():
    template_snapshot = make_snapshot("联系地址山东省济宁市任城区太白楼中路100号")
    candidate_snapshot = make_snapshot("联系地址广东省深圳市南山区科技园路200号")

    comparison = pdf_check_store.compare_pdf_snapshots(
        template_snapshot,
        candidate_snapshot,
        {
            "enabled": True,
            "use_builtin": True,
            "keywords": [],
            "regexes": [],
            "regions": [],
        },
    )

    assert comparison["system_result"] == "passed"
    assert comparison["diff_count"] == 0
    assert comparison["ignored_diff_count"] > 0
    assert all(item.get("ignored") for item in comparison["diff_items"])


def test_compare_pdf_snapshots_ignores_name_value_changes_with_builtin_regex():
    template_snapshot = make_snapshot_from_words(
        [
            {"id": "p1-w1", "text": "姓名：", "bbox": [10, 10, 30, 20], "block": 0, "line": 0, "word": 0},
            {"id": "p1-w2", "text": "王实宇", "bbox": [150, 10, 180, 20], "block": 1, "line": 0, "word": 0},
            {"id": "p1-w3", "text": "性别", "bbox": [190, 10, 210, 20], "block": 1, "line": 0, "word": 1},
        ]
    )
    candidate_snapshot = make_snapshot_from_words(
        [
            {"id": "p1-w1", "text": "姓名：", "bbox": [10, 10, 30, 20], "block": 0, "line": 0, "word": 0},
            {"id": "p1-w2", "text": "王百方", "bbox": [150, 10, 180, 20], "block": 1, "line": 0, "word": 0},
            {"id": "p1-w3", "text": "性别", "bbox": [190, 10, 210, 20], "block": 1, "line": 0, "word": 1},
        ]
    )

    comparison = pdf_check_store.compare_pdf_snapshots(
        template_snapshot,
        candidate_snapshot,
        {
            "enabled": True,
            "use_builtin": True,
            "keywords": [],
            "regexes": [],
            "regions": [],
        },
    )

    assert comparison["system_result"] == "passed"
    assert comparison["diff_count"] == 0
    assert comparison["ignored_diff_count"] > 0
    assert all(item.get("ignored") for item in comparison["diff_items"])


def test_compare_pdf_snapshots_does_not_ignore_declaration_paragraph_changes():
    template_snapshot = make_snapshot("投保声明本人已知晓保险合同条款，确认联系方式真实有效。")
    candidate_snapshot = make_snapshot("投保声明本人已知晓保险合同条款，确认联系方式无需核验。")

    comparison = pdf_check_store.compare_pdf_snapshots(
        template_snapshot,
        candidate_snapshot,
        {
            "enabled": True,
            "use_builtin": True,
            "keywords": ["联系地址", "地址", "保单号"],
            "regexes": [],
            "regions": [],
        },
    )

    assert comparison["system_result"] == "failed"
    assert comparison["diff_count"] > 0
    assert any(not item.get("ignored") for item in comparison["diff_items"])


def test_get_pdf_check_record_persists_hydrated_candidate_preview(pdf_check_db, monkeypatch):
    template_snapshot = make_snapshot("same")
    candidate_snapshot = make_snapshot_without_images("same")
    hydrated_candidate_snapshot = make_snapshot("same")
    extract_calls = []

    conn = sqlite3.connect(pdf_check_db)
    try:
        conn.execute(
            """
            INSERT INTO pdf_check_records (
                id, project_id, template_id, test_version, template_name, template_file_name,
                candidate_file_name, candidate_file_size, system_result, final_result,
                result_source, diff_count, ignored_diff_count, ocr_used, ocr_available, extraction_warning,
                variable_rules_json, template_snapshot_json, candidate_snapshot_json, diff_items_json, candidate_content
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                100,
                1,
                10,
                "v1",
                "Policy template",
                "template.pdf",
                "candidate.pdf",
                8,
                "passed",
                "passed",
                "system",
                0,
                0,
                0,
                1,
                "",
                "{}",
                json.dumps(template_snapshot),
                json.dumps(candidate_snapshot),
                "[]",
                b"%PDF-1.4",
            ),
        )
        conn.commit()
    finally:
        conn.close()

    def extract_snapshot(content, file_name):
        extract_calls.append(file_name)
        return hydrated_candidate_snapshot

    monkeypatch.setattr(pdf_check_store, "extract_pdf_snapshot", extract_snapshot)

    first_record = pdf_check_store.get_pdf_check_record(100, include_detail=True)
    second_record = pdf_check_store.get_pdf_check_record(100, include_detail=True)

    assert first_record["candidate_snapshot"]["pages"][0]["image_data_url"] == "data:image/jpeg;base64,"
    assert second_record["candidate_snapshot"]["pages"][0]["image_data_url"] == "data:image/jpeg;base64,"
    assert extract_calls == ["candidate.pdf"]

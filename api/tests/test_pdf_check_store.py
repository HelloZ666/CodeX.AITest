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
    assert record["variable_rules"]["enabled"] is True
    assert record["variable_rules"]["keywords"] == ["policy_no"]
    assert record["variable_rules"]["regions"][0]["id"] == "customer"

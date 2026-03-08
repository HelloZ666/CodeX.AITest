from fastapi.testclient import TestClient
import pytest

from services.database import ensure_initial_admin, init_db
from services.requirement_analysis import (
    analyze_requirement_points,
    build_requirement_rule_config,
    get_builtin_ignore_keywords,
)


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_requirement_analysis_rules.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    monkeypatch.setenv("SESSION_SECRET", "test-session-secret")
    monkeypatch.setenv("INITIAL_ADMIN_USERNAME", "admin")
    monkeypatch.setenv("INITIAL_ADMIN_PASSWORD", "password123")
    monkeypatch.setenv("INITIAL_ADMIN_DISPLAY_NAME", "测试管理员")
    init_db()
    ensure_initial_admin()
    return db_path


@pytest.fixture
def client():
    from index import app

    return TestClient(app)


def login(client: TestClient) -> None:
    response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "password123"},
    )
    assert response.status_code == 200


def test_builtin_weak_terms_do_not_create_matches():
    rule_config = build_requirement_rule_config(
        [{"rule_type": "ignore", "keyword": keyword} for keyword in get_builtin_ignore_keywords()]
    )

    result = analyze_requirement_points(
        requirement_points=[
            {
                "point_id": "4.4-1",
                "section_number": "4.4",
                "section_title": "界面",
                "text": "点击按钮后数字不可编辑，页面需要保持一致。",
            }
        ],
        production_rows=[
            {
                "row_id": 1,
                "出现该问题的原因": "不可编辑",
                "发生原因总结": "点击",
                "标签": "按钮",
                "改善举措": "数字",
                "发生阶段": "页面",
            }
        ],
        test_rows=[
            {
                "row_id": 1,
                "缺陷ID": "BUG-001",
                "缺陷摘要": "按钮点击",
                "业务影响": "数字展示",
                "缺陷来源": "页面",
                "缺陷原因": "不可编辑",
                "缺陷子原因": "点击",
                "功能模块": "按钮",
                "测试项": "数字",
            }
        ],
        rule_config=rule_config,
    )

    assert result["overview"]["matched_requirements"] == 0
    assert result["production_alerts"] == []
    assert result["test_suggestions"] == []


def test_custom_allow_rule_can_keep_short_business_term():
    rule_config = build_requirement_rule_config(
        [{"rule_type": "allow", "keyword": "预占"}]
    )
    result = analyze_requirement_points(
        requirement_points=[
            {
                "point_id": "4.1-1",
                "section_number": "4.1",
                "section_title": "功能描述",
                "text": "库存预占成功后才能继续下单。",
            }
        ],
        production_rows=[],
        test_rows=[
            {
                "row_id": 1,
                "缺陷ID": "BUG-002",
                "缺陷摘要": "库存预占逻辑缺失",
                "业务影响": "下单异常",
                "缺陷来源": "测试遗漏",
                "缺陷原因": "预占",
                "缺陷子原因": "流程遗漏",
                "功能模块": "库存",
                "测试项": "预占",
            }
        ],
        rule_config=rule_config,
    )

    assert result["overview"]["matched_requirements"] == 1
    assert result["test_suggestions"]
    assert result["requirement_hits"][0]["test_matches"][0]["matched_keyword"] == "预占"


def test_requirement_analysis_rule_api_supports_list_update_and_delete_default_rule(client: TestClient):
    login(client)

    list_response = client.get("/api/requirement-analysis/rules")
    assert list_response.status_code == 200
    rules = list_response.json()["data"]
    numeric_default_rule = next(item for item in rules if item["keyword"] == "阿拉伯数字")
    assert numeric_default_rule["rule_source"] == "default"
    assert numeric_default_rule["rule_type"] == "ignore"

    default_rule = next(item for item in rules if item["keyword"] == "按钮")
    assert default_rule["rule_source"] == "default"
    assert default_rule["rule_type"] == "ignore"

    update_response = client.put(
        f"/api/requirement-analysis/rules/{default_rule['id']}",
        json={"rule_type": "ignore", "keyword": "按钮文案"},
    )
    assert update_response.status_code == 200
    updated_rule = update_response.json()["data"]
    assert updated_rule["rule_source"] == "default"
    assert updated_rule["keyword"] == "按钮文案"

    delete_response = client.delete(f"/api/requirement-analysis/rules/{default_rule['id']}")
    assert delete_response.status_code == 200

    list_after_delete = client.get("/api/requirement-analysis/rules")
    assert list_after_delete.status_code == 200
    rules_after_delete = list_after_delete.json()["data"]
    assert all(item["id"] != default_rule["id"] for item in rules_after_delete)


def test_requirement_analysis_rule_api_supports_create_and_update_custom_rule(client: TestClient):
    login(client)

    create_response = client.post(
        "/api/requirement-analysis/rules",
        json={"rule_type": "allow", "keyword": "串户"},
    )
    assert create_response.status_code == 200
    created_rule = create_response.json()["data"]
    assert created_rule["rule_source"] == "custom"
    assert created_rule["rule_type"] == "allow"

    update_response = client.put(
        f"/api/requirement-analysis/rules/{created_rule['id']}",
        json={"rule_type": "ignore", "keyword": "串户异常"},
    )
    assert update_response.status_code == 200
    updated_rule = update_response.json()["data"]
    assert updated_rule["rule_source"] == "custom"
    assert updated_rule["rule_type"] == "ignore"
    assert updated_rule["keyword"] == "串户异常"

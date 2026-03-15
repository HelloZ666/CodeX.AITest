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
    monkeypatch.setattr("services.production_issue_file_store.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.test_issue_file_store.get_db_path", lambda: db_path)
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
        rule_config=rule_config,
    )

    assert result["overview"]["matched_requirements"] == 0
    assert result["mapping_suggestions"] == []


def test_requirement_analysis_no_longer_uses_issue_rows_for_matches():
    result = analyze_requirement_points(
        requirement_points=[
            {
                "point_id": "4.1-1",
                "section_number": "4.1",
                "section_title": "功能描述",
                "text": "库存预占成功后才能继续下单。",
            }
        ],
        production_rows=[
            {
                "row_id": 1,
                "出现该问题的原因": "库存预占逻辑缺失",
                "发生原因总结": "预占",
                "标签": "库存",
                "改善举措": "补充校验",
                "发生阶段": "需求",
            }
        ],
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
    )

    assert result["overview"]["matched_requirements"] == 0
    assert result["mapping_suggestions"] == []


def test_requirement_mapping_keyword_hit_expands_all_related_scenarios():
    result = analyze_requirement_points(
        requirement_points=[
            {
                "point_id": "4.4-1",
                "section_number": "4.4",
                "section_title": "界面",
                "text": "本次新增投保页面，需要补充兼容性与跳转链路验证。",
            }
        ],
        production_rows=[],
        test_rows=[],
        mapping_groups=[
            {
                "id": "group-1",
                "tag": "页面新增",
                "requirement_keyword": "新增页面",
                "related_scenarios": ["兼容性测试", "跳转链路"],
            }
        ],
    )

    assert result["overview"]["matched_requirements"] == 1
    assert result["overview"]["mapping_hit_count"] == 1
    assert result["mapping_suggestions"]
    mapping_match = result["requirement_hits"][0]["mapping_matches"][0]
    assert mapping_match["requirement_keyword"] == "新增页面"
    assert mapping_match["related_scenarios"] == ["兼容性测试", "跳转链路"]
    assert "兼容性测试" in result["mapping_suggestions"][0]["suggestion"]
    assert "跳转链路" in result["mapping_suggestions"][0]["suggestion"]


def test_requirement_mapping_scenario_hit_expands_sibling_scenarios():
    result = analyze_requirement_points(
        requirement_points=[
            {
                "point_id": "4.4-2",
                "section_number": "4.4",
                "section_title": "界面",
                "text": "当前弹窗需要重点核对弹窗内容是否正确。",
            }
        ],
        production_rows=[],
        test_rows=[],
        mapping_groups=[
            {
                "id": "group-2",
                "tag": "弹窗",
                "requirement_keyword": "新增弹窗",
                "related_scenarios": ["弹窗内容核对", "弹窗页面其他弹窗相关性测试"],
            }
        ],
    )

    assert result["overview"]["matched_requirements"] == 1
    assert result["mapping_suggestions"]
    mapping_match = result["requirement_hits"][0]["mapping_matches"][0]
    assert mapping_match["matched_scenarios"] == ["弹窗内容核对"]
    assert mapping_match["additional_scenarios"] == ["弹窗页面其他弹窗相关性测试"]
    assert "同组还需补测" in result["mapping_suggestions"][0]["suggestion"]
    assert "弹窗页面其他弹窗相关性测试" in result["mapping_suggestions"][0]["suggestion"]


def test_requirement_mapping_duplicate_groups_and_scenarios_are_deduped():
    result = analyze_requirement_points(
        requirement_points=[
            {
                "point_id": "4.1-3",
                "section_number": "4.1",
                "section_title": "功能描述",
                "text": "本次需要补充新增页面相关验证。",
            }
        ],
        mapping_groups=[
            {
                "id": "group-1",
                "tag": "页面新增",
                "requirement_keyword": "新增页面",
                "related_scenarios": ["兼容性测试", "跳转链路", "兼容性测试"],
            },
            {
                "id": "group-2",
                "tag": "页面新增",
                "requirement_keyword": "新增页面",
                "related_scenarios": ["跳转链路"],
            },
        ],
    )

    assert result["overview"]["matched_requirements"] == 1
    assert result["overview"]["mapping_hit_count"] == 1
    assert len(result["requirement_hits"][0]["mapping_matches"]) == 1
    assert result["requirement_hits"][0]["mapping_matches"][0]["related_scenarios"] == ["兼容性测试", "跳转链路"]


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

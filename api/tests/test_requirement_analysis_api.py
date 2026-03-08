import io
from unittest.mock import AsyncMock, patch

import pytest
from docx import Document
from fastapi.testclient import TestClient

from services.database import ensure_initial_admin, init_db


DEFECT_FIELDS = [
    "缺陷ID",
    "缺陷摘要",
    "任务编号",
    "系统名称",
    "系统CODE",
    "需求编号",
    "计划发布日期",
    "缺陷状态",
    "缺陷修复人",
    "缺陷修复人p13",
    "缺陷严重度",
    "重现频率",
    "业务影响",
    "缺陷来源",
    "缺陷原因",
    "缺陷子原因",
    "缺陷描述",
    "缺陷修复描述",
    "测试阶段",
    "分配处理人",
    "分配处理人P13",
    "缺陷修复时长",
    "修复轮次",
    "功能区",
    "缺陷关闭时间",
    "开发团队",
    "测试团队",
    "测试用例库",
    "功能模块",
    "测试项",
    "创建人姓名",
    "创建人P13",
    "创建时间",
    "是否初级缺陷",
    "初级缺陷依据",
]


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_requirement_analysis.db")
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


def build_requirement_docx() -> bytes:
    document = Document()
    document.add_paragraph("4.1 功能描述")
    document.add_paragraph("回家活动需要补充资格校验，避免历史缺陷中的资格校验遗漏。")
    document.add_paragraph("4.4 界面")
    document.add_paragraph("回家活动页面需要展示资格提示，并补充资格校验失败提示。")

    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def build_production_issue_csv() -> bytes:
    return (
        "出现该问题的原因,改善举措,发生阶段,是否人为原因,发生原因总结,标签\n"
        "资格校验遗漏,补充资格校验回归,需求阶段,是,资格校验遗漏,回家活动\n"
    ).encode("utf-8")


def build_test_issue_csv() -> bytes:
    row = {field: "" for field in DEFECT_FIELDS}
    row.update(
        {
            "缺陷ID": "BUG-001",
            "缺陷摘要": "回家活动资格校验缺失",
            "任务编号": "TASK-1",
            "系统名称": "营销系统",
            "系统CODE": "MKT",
            "需求编号": "REQ-001",
            "计划发布日期": "2026-03-08",
            "缺陷状态": "已关闭",
            "缺陷修复人": "张三",
            "缺陷修复人p13": "zhangsan",
            "缺陷严重度": "高",
            "重现频率": "必现",
            "业务影响": "活动资格错误",
            "缺陷来源": "需求理解偏差",
            "缺陷原因": "资格校验遗漏",
            "缺陷子原因": "边界条件遗漏",
            "缺陷描述": "未校验资格",
            "缺陷修复描述": "补充资格校验",
            "测试阶段": "系统测试",
            "分配处理人": "李四",
            "分配处理人P13": "lisi",
            "缺陷修复时长": "1",
            "修复轮次": "1",
            "功能区": "活动",
            "缺陷关闭时间": "2026-03-08",
            "开发团队": "A组",
            "测试团队": "测试A组",
            "测试用例库": "活动库",
            "功能模块": "回家活动",
            "测试项": "资格校验",
            "创建人姓名": "王五",
            "创建人P13": "wangwu",
            "创建时间": "2026-03-08 10:00:00",
            "是否初级缺陷": "否",
            "初级缺陷依据": "",
        }
    )
    header = ",".join(DEFECT_FIELDS)
    values = ",".join(row[field] for field in DEFECT_FIELDS)
    return f"{header}\n{values}\n".encode("utf-8")


def prepare_analysis_context(client: TestClient) -> tuple[int, int, int]:
    login_response = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "password123"},
    )
    assert login_response.status_code == 200

    project_response = client.post("/api/projects", json={"name": "需求分析项目"})
    project_id = project_response.json()["data"]["id"]

    production_response = client.post(
        "/api/production-issue-files",
        files={"file": ("prod.csv", build_production_issue_csv(), "text/csv")},
    )
    production_file_id = production_response.json()["data"]["id"]

    test_response = client.post(
        "/api/test-issue-files",
        data={"project_id": str(project_id)},
        files={"file": ("defect.csv", build_test_issue_csv(), "text/csv")},
    )
    test_file_id = test_response.json()["data"]["id"]
    return project_id, production_file_id, test_file_id


def test_requirement_analysis_creates_record_and_supports_history(client: TestClient):
    project_id, _, _ = prepare_analysis_context(client)

    response = client.post(
        "/api/requirement-analysis/analyze",
        data={
            "project_id": str(project_id),
            "use_ai": "false",
        },
        files={
            "requirement_file": (
                "requirement.docx",
                build_requirement_docx(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["overview"]["use_ai"] is False
    assert payload["overview"]["matched_requirements"] >= 1
    assert payload["production_alerts"]
    assert payload["test_suggestions"]
    assert payload["record_id"] > 0

    records_response = client.get("/api/requirement-analysis/records")
    assert records_response.status_code == 200
    records = records_response.json()["data"]
    assert len(records) == 1
    assert records[0]["requirement_file_name"] == "requirement.docx"

    detail_response = client.get(f"/api/requirement-analysis/records/{payload['record_id']}")
    assert detail_response.status_code == 200
    detail = detail_response.json()["data"]
    assert detail["section_snapshot"]["selected_mode"] == "preferred_sections"
    assert detail["result_snapshot"]["overview"]["matched_requirements"] >= 1


def test_requirement_analysis_uses_deepseek_when_enabled(client: TestClient):
    project_id, _, _ = prepare_analysis_context(client)

    with patch(
        "index.call_deepseek",
        AsyncMock(
            return_value={
                "result": {
                    "summary": "AI 已补充测试关注点。",
                    "overall_assessment": "资格校验相关需求风险较高",
                    "key_findings": [
                        "同一需求点同时命中生产问题与测试问题。",
                        "资格校验失败提示是重点验证项。",
                    ],
                    "risk_table": [
                        {
                            "requirement_point_id": "4.1-1",
                            "risk_level": "高",
                            "risk_reason": "同时命中生产问题与测试问题，历史信号重叠。",
                            "test_focus": "优先验证资格校验主流程、异常流和提示文案。",
                        }
                    ],
                    "production_alerts": [
                        {"requirement_point_id": "4.1-1", "alert": "AI 风险提醒"},
                    ],
                    "test_suggestions": [
                        {"requirement_point_id": "4.1-1", "suggestion": "AI 测试建议"},
                    ],
                },
                "usage": {
                    "prompt_tokens": 100,
                    "completion_tokens": 60,
                    "total_tokens": 160,
                    "prompt_cache_hit_tokens": 0,
                    "prompt_cache_miss_tokens": 100,
                },
            }
        ),
    ):
        response = client.post(
            "/api/requirement-analysis/analyze",
            data={
                "project_id": str(project_id),
                "use_ai": "true",
            },
            files={
                "requirement_file": (
                    "requirement.docx",
                    build_requirement_docx(),
                    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                )
            },
        )

    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["ai_analysis"]["provider"] == "DeepSeek"
    assert payload["ai_analysis"]["summary"] == "AI 已补充测试关注点。"
    assert payload["ai_analysis"]["overall_assessment"] == "资格校验相关需求风险较高"
    assert payload["ai_analysis"]["risk_table"][0]["risk_level"] == "高"
    assert payload["ai_cost"]["total_tokens"] == 160
    assert payload["production_alerts"][0]["alert"] == "AI 风险提醒"
    assert payload["test_suggestions"][0]["suggestion"] == "AI 测试建议"

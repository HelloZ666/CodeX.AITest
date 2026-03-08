"""
test_api_integration.py - API集成测试（文件管理和分析记录路由）
"""

import io
import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from services.database import init_db


FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

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
    """为每个测试使用独立的临时数据库"""
    db_path = str(tmp_path / "test_api.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.production_issue_file_store.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.test_issue_file_store.get_db_path", lambda: db_path)
    init_db()
    return db_path


@pytest.fixture
def client():
    """创建测试客户端"""
    from index import app
    with TestClient(app) as test_client:
        login_resp = test_client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "Admin123!"},
        )
        assert login_resp.status_code == 200
        yield test_client


# ============ 项目CRUD ============

class TestProjectCRUD:
    """测试项目增删改查API"""

    def test_create_project(self, client):
        """创建项目"""
        resp = client.post("/api/projects", json={"name": "测试项目", "description": "描述"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["name"] == "测试项目"
        assert data["data"]["description"] == "描述"
        assert "id" in data["data"]

    def test_create_project_name_only(self, client):
        """仅提供名称创建项目"""
        resp = client.post("/api/projects", json={"name": "最小项目"})
        assert resp.status_code == 200
        assert resp.json()["data"]["description"] == ""

    def test_create_project_invalid_body(self, client):
        """缺少必填字段应返回422"""
        resp = client.post("/api/projects", json={"description": "没有名称"})
        assert resp.status_code == 422

    def test_list_projects_empty(self, client):
        """空数据库列出项目"""
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_list_projects_with_data(self, client):
        """有数据时列出项目"""
        client.post("/api/projects", json={"name": "项目A"})
        client.post("/api/projects", json={"name": "项目B"})
        resp = client.get("/api/projects")
        assert resp.status_code == 200
        assert len(resp.json()["data"]) == 2

    def test_get_project(self, client):
        """获取项目详情（含统计信息）"""
        create_resp = client.post("/api/projects", json={"name": "项目"})
        project_id = create_resp.json()["data"]["id"]
        resp = client.get(f"/api/projects/{project_id}")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["name"] == "项目"
        assert "stats" in data
        assert data["stats"]["analysis_count"] == 0

    def test_get_project_not_found(self, client):
        """获取不存在的项目返回404"""
        resp = client.get("/api/projects/9999")
        assert resp.status_code == 404

    def test_update_project(self, client):
        """更新项目"""
        create_resp = client.post("/api/projects", json={"name": "原名称"})
        project_id = create_resp.json()["data"]["id"]
        resp = client.put(
            f"/api/projects/{project_id}",
            json={"name": "新名称", "description": "新描述"},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["name"] == "新名称"
        assert data["description"] == "新描述"

    def test_update_project_not_found(self, client):
        """更新不存在的项目返回404"""
        resp = client.put("/api/projects/9999", json={"name": "不存在"})
        assert resp.status_code == 404

    def test_delete_project(self, client):
        """删除项目"""
        create_resp = client.post("/api/projects", json={"name": "待删除"})
        project_id = create_resp.json()["data"]["id"]
        resp = client.delete(f"/api/projects/{project_id}")
        assert resp.status_code == 200
        assert resp.json()["success"] is True

        # 确认已删除
        get_resp = client.get(f"/api/projects/{project_id}")
        assert get_resp.status_code == 404

    def test_delete_project_not_found(self, client):
        """删除不存在的项目返回404"""
        resp = client.delete("/api/projects/9999")
        assert resp.status_code == 404


# ============ 映射文件上传 ============

class TestProjectMapping:
    """测试项目映射文件上传"""

    def test_upload_mapping(self, client):
        """上传映射文件到项目"""
        create_resp = client.post("/api/projects", json={"name": "项目"})
        project_id = create_resp.json()["data"]["id"]

        mapping_content = FIXTURES_DIR / "sample_mapping.csv"
        with open(mapping_content, "rb") as f:
            resp = client.post(
                f"/api/projects/{project_id}/mapping",
                files={"mapping_file": ("mapping.csv", f, "text/csv")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["mapping_count"] > 0

        # 验证映射数据已保存
        get_resp = client.get(f"/api/projects/{project_id}")
        assert get_resp.json()["data"]["mapping_data"] is not None

    def test_upload_mapping_project_not_found(self, client):
        """上传映射到不存在的项目返回404"""
        mapping_content = FIXTURES_DIR / "sample_mapping.csv"
        with open(mapping_content, "rb") as f:
            resp = client.post(
                "/api/projects/9999/mapping",
                files={"mapping_file": ("mapping.csv", f, "text/csv")},
            )
        assert resp.status_code == 404


# ============ 分析记录 ============

class TestRecords:
    """测试分析记录API"""

    def test_list_records_empty(self, client):
        """空数据库列出记录"""
        resp = client.get("/api/records")
        assert resp.status_code == 200
        assert resp.json()["data"] == []

    def test_get_record_not_found(self, client):
        """获取不存在的记录返回404"""
        resp = client.get("/api/records/9999")
        assert resp.status_code == 404

    def test_list_records_with_project_filter(self, client):
        """按项目过滤记录"""
        from services.database import create_project, save_analysis_record

        p1 = create_project(name="项目1")
        p2 = create_project(name="项目2")
        save_analysis_record(
            project_id=p1["id"],
            code_changes_summary={},
            test_coverage_result={},
            test_score=80.0,
            ai_suggestions=None,
            token_usage=0,
            cost=0.0,
            duration_ms=100,
        )
        save_analysis_record(
            project_id=p2["id"],
            code_changes_summary={},
            test_coverage_result={},
            test_score=90.0,
            ai_suggestions=None,
            token_usage=0,
            cost=0.0,
            duration_ms=200,
        )

        resp = client.get(f"/api/records?project_id={p1['id']}")
        assert resp.status_code == 200
        assert len(resp.json()["data"]) == 1


# ============ 项目分析 ============

class TestProjectAnalyze:
    """测试基于项目上下文的分析"""

    def test_analyze_project_not_found(self, client):
        """分析不存在的项目返回404"""
        code_file = FIXTURES_DIR / "sample_code_changes.json"
        test_file = FIXTURES_DIR / "sample_test_cases.csv"
        mapping_file = FIXTURES_DIR / "sample_mapping.csv"

        with open(code_file, "rb") as cf, open(test_file, "rb") as tf, open(mapping_file, "rb") as mf:
            resp = client.post(
                "/api/projects/9999/analyze",
                files={
                    "code_changes": ("code.json", cf, "application/json"),
                    "test_cases_file": ("tests.csv", tf, "text/csv"),
                    "mapping_file": ("mapping.csv", mf, "text/csv"),
                },
                data={"use_ai": "false"},
            )
        assert resp.status_code == 404

    def test_analyze_with_mapping_file(self, client):
        """使用上传的映射文件进行项目分析（不使用AI）"""
        # 创建项目
        create_resp = client.post("/api/projects", json={"name": "分析项目"})
        project_id = create_resp.json()["data"]["id"]

        code_file = FIXTURES_DIR / "sample_code_changes.json"
        test_file = FIXTURES_DIR / "sample_test_cases.csv"
        mapping_file = FIXTURES_DIR / "sample_mapping.csv"

        with open(code_file, "rb") as cf, open(test_file, "rb") as tf, open(mapping_file, "rb") as mf:
            resp = client.post(
                f"/api/projects/{project_id}/analyze",
                files={
                    "code_changes": ("code.json", cf, "application/json"),
                    "test_cases_file": ("tests.csv", tf, "text/csv"),
                    "mapping_file": ("mapping.csv", mf, "text/csv"),
                },
                data={"use_ai": "false"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert "record_id" in data["data"]
        assert "diff_analysis" in data["data"]
        assert "coverage" in data["data"]
        assert "score" in data["data"]

        # 验证记录已保存
        record_id = data["data"]["record_id"]
        record_resp = client.get(f"/api/records/{record_id}")
        assert record_resp.status_code == 200

    def test_analyze_with_stored_mapping(self, client):
        """使用项目存储的映射数据进行分析"""
        # 创建项目并上传映射
        create_resp = client.post("/api/projects", json={"name": "有映射的项目"})
        project_id = create_resp.json()["data"]["id"]

        mapping_file = FIXTURES_DIR / "sample_mapping.csv"
        with open(mapping_file, "rb") as mf:
            client.post(
                f"/api/projects/{project_id}/mapping",
                files={"mapping_file": ("mapping.csv", mf, "text/csv")},
            )

        # 不提供映射文件进行分析
        code_file = FIXTURES_DIR / "sample_code_changes.json"
        test_file = FIXTURES_DIR / "sample_test_cases.csv"

        with open(code_file, "rb") as cf, open(test_file, "rb") as tf:
            resp = client.post(
                f"/api/projects/{project_id}/analyze",
                files={
                    "code_changes": ("code.json", cf, "application/json"),
                    "test_cases_file": ("tests.csv", tf, "text/csv"),
                },
                data={"use_ai": "false"},
            )
        assert resp.status_code == 200
        assert resp.json()["success"] is True

    def test_analyze_no_mapping_available(self, client):
        """项目无映射且未上传映射文件应返回400"""
        create_resp = client.post("/api/projects", json={"name": "无映射项目"})
        project_id = create_resp.json()["data"]["id"]

        code_file = FIXTURES_DIR / "sample_code_changes.json"
        test_file = FIXTURES_DIR / "sample_test_cases.csv"

        with open(code_file, "rb") as cf, open(test_file, "rb") as tf:
            resp = client.post(
                f"/api/projects/{project_id}/analyze",
                files={
                    "code_changes": ("code.json", cf, "application/json"),
                    "test_cases_file": ("tests.csv", tf, "text/csv"),
                },
                data={"use_ai": "false"},
            )
        assert resp.status_code == 400

    def test_analyze_with_ai_mock(self, client):
        """使用mock的AI进行项目分析"""
        # 创建项目
        create_resp = client.post("/api/projects", json={"name": "AI分析项目"})
        project_id = create_resp.json()["data"]["id"]

        # Mock DeepSeek
        mock_ai_response = {
            "result": {
                "uncovered_methods": [],
                "coverage_gaps": "无明显缺口",
                "suggested_test_cases": [],
                "risk_assessment": "low",
                "improvement_suggestions": ["增加边界测试"],
            },
            "usage": {
                "prompt_tokens": 500,
                "completion_tokens": 200,
                "total_tokens": 700,
                "prompt_cache_hit_tokens": 100,
                "prompt_cache_miss_tokens": 400,
            },
        }

        code_file = FIXTURES_DIR / "sample_code_changes.json"
        test_file = FIXTURES_DIR / "sample_test_cases.csv"
        mapping_file = FIXTURES_DIR / "sample_mapping.csv"

        with patch("index.call_deepseek", new_callable=AsyncMock, return_value=mock_ai_response):
            with open(code_file, "rb") as cf, open(test_file, "rb") as tf, open(mapping_file, "rb") as mf:
                resp = client.post(
                    f"/api/projects/{project_id}/analyze",
                    files={
                        "code_changes": ("code.json", cf, "application/json"),
                        "test_cases_file": ("tests.csv", tf, "text/csv"),
                        "mapping_file": ("mapping.csv", mf, "text/csv"),
                    },
                    data={"use_ai": "true"},
                )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["ai_analysis"] is not None
        assert data["data"]["ai_cost"] is not None
        assert "record_id" in data["data"]


class TestIssueAnalysis:
    """测试问题归纳分析上传接口"""

    @staticmethod
    def _build_issue_excel_bytes() -> bytes:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(
            [
                "出现该问题的原因",
                "改善举措",
                "发生阶段",
                "是否人为原因",
                "发生原因总结",
                "标签",
            ]
        )
        sheet.append(
            [
                "需求评审不足，边界条件遗漏",
                "补充评审清单；增加边界场景检查",
                "需求阶段",
                "是",
                "需求澄清不足",
                "需求,边界场景",
            ]
        )
        sheet.append(
            [
                "联调环境不稳定",
                "稳定测试环境",
                "联调阶段",
                "否",
                "环境问题",
                "环境",
            ]
        )

        content = io.BytesIO()
        workbook.save(content)
        workbook.close()
        return content.getvalue()

    def test_import_issue_analysis_excel(self, client):
        """上传 Excel 并返回归纳图表数据"""
        resp = client.post(
            "/api/issue-analysis/import",
            files={
                "file": (
                    "issue-analysis.xlsx",
                    TestIssueAnalysis._build_issue_excel_bytes(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["data"]["overview"]["total_records"] == 2
        assert data["data"]["charts"]["stage_distribution"]
        assert data["data"]["charts"]["human_factor_distribution"]
        assert data["data"]["summary"]["key_findings"]

    def test_import_issue_analysis_rejects_missing_fields(self, client):
        """缺少必要字段时返回 400"""
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["问题原因", "阶段"])
        sheet.append(["测试遗漏", "测试阶段"])

        content = io.BytesIO()
        workbook.save(content)
        workbook.close()

        resp = client.post(
            "/api/issue-analysis/import",
            files={
                "file": (
                    "invalid-issue-analysis.xlsx",
                    content.getvalue(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert resp.status_code == 400
        assert "缺少必要字段" in resp.json()["detail"]


class TestTestIssueFiles:
    """测试问题文件上传接口"""

    @staticmethod
    def _build_test_issue_excel_bytes() -> bytes:
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(DEFECT_FIELDS)
        sheet.append(
            [
                "BUG-001",
                "登录接口返回空指针",
                "TASK-001",
                "智测平台",
                "ZCPT",
                "REQ-001",
                "2026-03-01",
                "已关闭",
                "张三",
                "zhangsan",
                "严重",
                "必现",
                "影响核心交易",
                "系统测试",
                "接口校验缺失",
                "边界值遗漏",
                "请求参数为空时接口抛出异常",
                "补充空值判断",
                "系统测试",
                "李四",
                "lisi",
                "8",
                "1",
                "账户中心",
                "2026-03-03 12:00:00",
                "开发一组",
                "测试一组",
                "核心交易回归",
                "登录模块",
                "登录接口",
                "王五",
                "wangwu",
                "2026-03-02 09:00:00",
                "否",
                "",
            ]
        )

        content = io.BytesIO()
        workbook.save(content)
        workbook.close()
        return content.getvalue()

    def test_upload_test_issue_file_and_list(self, client):
        """上传测试问题文件并绑定项目"""
        create_resp = client.post("/api/projects", json={"name": "核心项目", "description": "项目描述"})
        project_id = create_resp.json()["data"]["id"]

        upload_resp = client.post(
            "/api/test-issue-files",
            data={"project_id": str(project_id)},
            files={
                "file": (
                    "test-issues.xlsx",
                    self._build_test_issue_excel_bytes(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert upload_resp.status_code == 200
        upload_data = upload_resp.json()
        assert upload_data["success"] is True
        assert upload_data["data"]["project_id"] == project_id
        assert upload_data["data"]["project_name"] == "核心项目"
        assert upload_data["data"]["row_count"] == 1

        list_resp = client.get("/api/test-issue-files", params={"project_id": project_id})
        assert list_resp.status_code == 200
        list_data = list_resp.json()
        assert list_data["success"] is True
        assert len(list_data["data"]) == 1
        assert list_data["data"][0]["project_name"] == "核心项目"

        analysis_resp = client.get(f"/api/test-issue-files/{upload_data['data']['id']}/analysis")
        assert analysis_resp.status_code == 200
        analysis_data = analysis_resp.json()
        assert analysis_data["success"] is True
        assert analysis_data["data"]["overview"]["total_records"] == 1

    def test_upload_test_issue_file_rejects_unknown_project(self, client):
        """绑定不存在项目时返回 404"""
        resp = client.post(
            "/api/test-issue-files",
            data={"project_id": "9999"},
            files={
                "file": (
                    "test-issues.xlsx",
                    self._build_test_issue_excel_bytes(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert resp.status_code == 404
        assert "项目不存在" in resp.json()["detail"]

    def test_upload_production_issue_file_and_list(self, client):
        """上传生产问题文件并在列表中可见"""
        upload_resp = client.post(
            "/api/production-issue-files",
            files={
                "file": (
                    "issue-analysis.xlsx",
                    TestIssueAnalysis._build_issue_excel_bytes(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert upload_resp.status_code == 200
        upload_data = upload_resp.json()
        assert upload_data["success"] is True
        assert upload_data["data"]["file_name"] == "issue-analysis.xlsx"
        assert upload_data["data"]["file_type"] == "excel"
        assert upload_data["data"]["row_count"] == 2

        list_resp = client.get("/api/production-issue-files")
        assert list_resp.status_code == 200
        list_data = list_resp.json()
        assert list_data["success"] is True
        assert len(list_data["data"]) == 1
        assert list_data["data"][0]["id"] == upload_data["data"]["id"]

        analysis_resp = client.get(f"/api/production-issue-files/{upload_data['data']['id']}/analysis")
        assert analysis_resp.status_code == 200
        analysis_data = analysis_resp.json()
        assert analysis_data["success"] is True
        assert analysis_data["data"]["overview"]["total_records"] == 2

    def test_upload_production_issue_file_rejects_missing_fields(self, client):
        """上传文件缺少必要字段时返回 400"""
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["问题原因", "阶段"])
        sheet.append(["测试遗漏", "测试阶段"])

        content = io.BytesIO()
        workbook.save(content)
        workbook.close()

        resp = client.post(
            "/api/production-issue-files",
            files={
                "file": (
                    "invalid-issue-analysis.xlsx",
                    content.getvalue(),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
        )

        assert resp.status_code == 400
        assert "缺少必要字段" in resp.json()["detail"]

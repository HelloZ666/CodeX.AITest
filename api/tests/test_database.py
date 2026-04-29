"""
test_database.py - 数据库抽象层测试
"""

import json
import os

import pytest

from services.database import (
    create_audit_log,
    create_knowledge_system_overview,
    init_db,
    create_project,
    delete_requirement_mapping,
    delete_knowledge_system_overview,
    get_knowledge_system_overview,
    get_project,
    list_projects,
    list_knowledge_system_overviews,
    get_requirement_mapping,
    save_requirement_mapping,
    update_project,
    update_knowledge_system_overview,
    delete_project,
    save_analysis_record,
    save_requirement_analysis_record,
    save_case_quality_record,
    get_analysis_record,
    get_case_quality_record,
    list_analysis_records,
    list_case_quality_records,
    get_project_stats,
    get_db_path,
)
from services.runtime_paths import (
    get_default_runtime_root,
    get_environment_variable,
    get_runtime_root,
    reset_loaded_env_cache,
)


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """为每个测试使用独立的临时数据库"""
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    init_db()
    return db_path


# ============ init_db ============

class TestInitDB:
    """测试数据库初始化"""

    def test_init_creates_tables(self, tmp_path, monkeypatch):
        """init_db应创建projects和analysis_records表"""
        import sqlite3
        db_path = str(tmp_path / "init_test.db")
        monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
        init_db()

        conn = sqlite3.connect(db_path)
        cursor = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()

        assert "projects" in tables
        assert "analysis_records" in tables
        assert "requirement_mappings" in tables
        assert "knowledge_system_overviews" in tables

    def test_init_idempotent(self):
        """多次调用init_db不应报错"""
        init_db()
        init_db()


# ============ get_db_path ============

class TestGetDBPath:
    """测试数据库路径配置"""

    def test_default_path(self, tmp_path, monkeypatch):
        """默认路径应包含codetestguard.db"""
        monkeypatch.delenv("DB_PATH", raising=False)
        monkeypatch.delenv("APP_RUNTIME_DIR", raising=False)
        # 重新绑定原始函数逻辑（覆盖autouse fixture的patch）
        import services.database as db_mod
        import services.runtime_paths as runtime_mod

        real_get_db_path = lambda: str(runtime_mod.get_db_path())
        monkeypatch.setattr(db_mod, "get_db_path", real_get_db_path)
        path = db_mod.get_db_path()
        assert path.endswith("codetestguard.db")
        assert "data" in path
        assert path.startswith(str(get_default_runtime_root()))

    def test_env_override(self, tmp_path, monkeypatch):
        """环境变量应覆盖默认路径"""
        monkeypatch.setenv("DB_PATH", "/custom/path/test.db")
        import services.database as db_mod
        import services.runtime_paths as runtime_mod

        real_get_db_path = lambda: str(runtime_mod.get_db_path())
        monkeypatch.setattr(db_mod, "get_db_path", real_get_db_path)
        path = db_mod.get_db_path()
        assert path.replace("\\", "/") == "/custom/path/test.db"


class TestRuntimeEnvLoading:
    def test_runtime_env_file_is_loaded_without_wrapper_script(self, tmp_path, monkeypatch):
        project_root = tmp_path / "CodeX.AITest"
        runtime_root = tmp_path / "CodeX.AITest.runtime"
        project_root.mkdir()
        runtime_root.mkdir()
        (runtime_root / ".env").write_text(
            "\n".join(
                [
                    "AI_PROVIDER=internal",
                    "INTERNAL_LLM_API_URL=http://internal.example/chat/completions",
                    "SESSION_SECRET=runtime-secret",
                ]
            ),
            encoding="utf-8",
        )

        monkeypatch.delenv("APP_RUNTIME_DIR", raising=False)
        monkeypatch.delenv("AI_PROVIDER", raising=False)
        monkeypatch.delenv("SESSION_SECRET", raising=False)
        monkeypatch.setattr("services.runtime_paths.get_project_root", lambda: project_root)
        reset_loaded_env_cache()

        try:
            assert get_environment_variable("AI_PROVIDER") == "internal"
            assert get_environment_variable("SESSION_SECRET") == "runtime-secret"
            assert get_runtime_root() == runtime_root
        finally:
            reset_loaded_env_cache()

    def test_process_environment_still_overrides_runtime_env_file(self, tmp_path, monkeypatch):
        project_root = tmp_path / "CodeX.AITest"
        runtime_root = tmp_path / "CodeX.AITest.runtime"
        project_root.mkdir()
        runtime_root.mkdir()
        (runtime_root / ".env").write_text("AI_PROVIDER=internal\n", encoding="utf-8")

        monkeypatch.setenv("AI_PROVIDER", "deepseek")
        monkeypatch.setattr("services.runtime_paths.get_project_root", lambda: project_root)
        reset_loaded_env_cache()

        try:
            assert get_environment_variable("AI_PROVIDER") == "deepseek"
        finally:
            reset_loaded_env_cache()


# ============ create_project ============

class TestCreateProject:
    """测试创建项目"""

    def test_create_with_all_fields(self):
        """创建包含所有字段的项目"""
        mapping = [{"package": "com.example", "class": "User", "method": "create"}]
        project = create_project(
            name="测试项目",
            description="这是一个测试项目",
            mapping_data=mapping,
        )
        assert project["id"] is not None
        assert project["name"] == "测试项目"
        assert project["description"] == "这是一个测试项目"
        assert project["test_manager_ids"] == []
        assert project["tester_ids"] == []
        assert project["mapping_data"] == mapping
        assert project["created_at"] is not None
        assert project["updated_at"] is not None

    def test_create_with_name_only(self):
        """仅提供名称创建项目"""
        project = create_project(name="最小项目")
        assert project["name"] == "最小项目"
        assert project["description"] == ""
        assert project["test_manager_ids"] == []
        assert project["tester_ids"] == []
        assert project["mapping_data"] is None

    def test_create_with_project_members(self):
        """创建项目时保存测试经理和测试人员"""
        project = create_project(
            name="成员项目",
            test_manager_ids=[3, 3, 1],
            tester_ids=[2, 1],
        )
        assert project["test_manager_ids"] == [3, 1]
        assert project["tester_ids"] == [2, 1]

    def test_create_multiple_projects(self):
        """创建多个项目应有不同ID"""
        p1 = create_project(name="项目1")
        p2 = create_project(name="项目2")
        assert p1["id"] != p2["id"]


# ============ get_project ============

class TestGetProject:
    """测试获取项目"""

    def test_get_existing(self):
        """获取存在的项目"""
        created = create_project(name="测试项目")
        fetched = get_project(created["id"])
        assert fetched is not None
        assert fetched["name"] == "测试项目"

    def test_get_non_existing(self):
        """获取不存在的项目返回None"""
        result = get_project(9999)
        assert result is None

    def test_get_with_mapping_data(self):
        """获取包含映射数据的项目，JSON应被正确解析"""
        mapping = {"key": "value", "nested": {"a": 1}}
        created = create_project(name="带映射", mapping_data=mapping)
        fetched = get_project(created["id"])
        assert fetched["mapping_data"] == mapping

    def test_get_with_project_members(self):
        """获取项目时返回测试经理和测试人员"""
        created = create_project(name="成员项目", test_manager_ids=[1], tester_ids=[2, 3])
        fetched = get_project(created["id"])
        assert fetched["test_manager_ids"] == [1]
        assert fetched["tester_ids"] == [2, 3]


# ============ list_projects ============

class TestListProjects:
    """测试列出项目"""

    def test_list_empty(self):
        """空数据库返回空列表"""
        projects = list_projects()
        assert projects == []

    def test_list_with_data(self):
        """有数据时返回所有项目"""
        create_project(name="项目A")
        create_project(name="项目B")
        projects = list_projects()
        assert len(projects) == 2

    def test_list_order(self):
        """项目按ID倒序排列（后创建的在前）"""
        p1 = create_project(name="先创建")
        p2 = create_project(name="后创建")
        projects = list_projects()
        # 后创建的ID更大，按created_at DESC排序时同时间戳下按ID倒序
        assert projects[0]["id"] > projects[1]["id"]


class TestKnowledgeSystemOverviews:
    def test_create_and_get_knowledge_system_overview(self):
        project = create_project(name="全景图项目")

        overview = create_knowledge_system_overview(
            project_id=project["id"],
            title="核心系统全景图",
            description="覆盖核心模块",
            creator_username="admin",
            creator_display_name="管理员",
        )

        assert overview["id"] is not None
        assert overview["project_id"] == project["id"]
        assert overview["project_name"] == "全景图项目"
        assert overview["title"] == "核心系统全景图"
        assert overview["outline_category"] == "功能视图"
        assert overview["description"] == "覆盖核心模块"
        assert overview["creator_username"] == "admin"
        assert overview["creator_display_name"] == "管理员"
        assert overview["mind_map_data"]["root"]["data"]["text"] == "核心系统全景图"

        fetched = get_knowledge_system_overview(overview["id"])
        assert fetched is not None
        assert fetched["title"] == "核心系统全景图"

    def test_list_knowledge_system_overviews(self):
        project_a = create_project(name="项目A")
        project_b = create_project(name="项目B")
        create_knowledge_system_overview(project_id=project_a["id"])
        create_knowledge_system_overview(project_id=project_b["id"])
        create_knowledge_system_overview(project_id=project_a["id"], title="项目A通用模板", outline_category="通用模板")

        overviews = list_knowledge_system_overviews()
        assert len(overviews) == 3
        assert {item["project_name"] for item in overviews} == {"项目A", "项目B"}
        assert len([item for item in overviews if item["project_id"] == project_a["id"]]) == 2

    def test_update_knowledge_system_overview(self):
        project = create_project(name="更新项目")
        overview = create_knowledge_system_overview(project_id=project["id"], title="旧标题")

        updated = update_knowledge_system_overview(
            overview["id"],
            title="新标题",
            outline_category="通用模板",
            description="新的说明",
            mind_map_data={
                "layout": "logicalStructure",
                "root": {
                    "data": {"text": "新标题", "expand": True},
                    "children": [
                        {"data": {"text": "模块A", "expand": True}, "children": []},
                    ],
                },
            },
            source_format="markdown",
            source_file_name="overview.md",
        )

        assert updated is not None
        assert updated["title"] == "新标题"
        assert updated["outline_category"] == "通用模板"
        assert updated["description"] == "新的说明"
        assert updated["source_format"] == "markdown"
        assert updated["source_file_name"] == "overview.md"
        assert updated["mind_map_data"]["root"]["children"][0]["data"]["text"] == "模块A"

    def test_delete_knowledge_system_overview(self):
        project = create_project(name="删除项目")
        overview = create_knowledge_system_overview(project_id=project["id"])

        deleted = delete_knowledge_system_overview(overview["id"])

        assert deleted is True
        assert get_knowledge_system_overview(overview["id"]) is None


# ============ update_project ============

class TestUpdateProject:
    """测试更新项目"""

    def test_update_name(self):
        """更新项目名称"""
        project = create_project(name="原名称")
        updated = update_project(project["id"], name="新名称")
        assert updated["name"] == "新名称"
        assert updated["description"] == ""  # 未更新的字段保持不变

    def test_update_description(self):
        """更新项目描述"""
        project = create_project(name="项目", description="旧描述")
        updated = update_project(project["id"], description="新描述")
        assert updated["description"] == "新描述"
        assert updated["name"] == "项目"

    def test_update_mapping_data(self):
        """更新映射数据"""
        project = create_project(name="项目")
        new_mapping = [{"method": "test"}]
        updated = update_project(project["id"], mapping_data=new_mapping)
        assert updated["mapping_data"] == new_mapping

    def test_update_project_members(self):
        """更新测试经理和测试人员"""
        project = create_project(name="项目")
        updated = update_project(project["id"], test_manager_ids=[2], tester_ids=[3, 4])
        assert updated["test_manager_ids"] == [2]
        assert updated["tester_ids"] == [3, 4]

    def test_update_non_existing(self):
        """更新不存在的项目返回None"""
        result = update_project(9999, name="不存在")
        assert result is None

    def test_update_no_changes(self):
        """不提供任何更新字段时返回原项目"""
        project = create_project(name="项目")
        updated = update_project(project["id"])
        assert updated["name"] == "项目"

    def test_update_updates_timestamp(self):
        """更新操作应更新updated_at"""
        project = create_project(name="项目")
        original_updated = project["updated_at"]
        # SQLite CURRENT_TIMESTAMP精度为秒，可能相同
        updated = update_project(project["id"], name="新名称")
        assert updated["updated_at"] is not None


# ============ delete_project ============

class TestDeleteProject:
    """测试删除项目"""

    def test_delete_existing(self):
        """删除存在的项目"""
        project = create_project(name="待删除")
        result = delete_project(project["id"])
        assert result is True
        assert get_project(project["id"]) is None

    def test_delete_non_existing(self):
        """删除不存在的项目返回False"""
        result = delete_project(9999)
        assert result is False

    def test_delete_cascades_to_records(self):
        """删除项目应级联删除关联的分析记录"""
        project = create_project(name="有记录的项目")
        save_analysis_record(
            project_id=project["id"],
            code_changes_summary={"files": 1},
            test_coverage_result={"rate": 0.8},
            test_score=85.0,
            ai_suggestions=None,
            token_usage=100,
            cost=0.01,
            duration_ms=500,
        )
        # 确认记录存在
        records = list_analysis_records(project_id=project["id"])
        assert len(records) == 1

        # 删除项目
        delete_project(project["id"])

        # 记录应被级联删除
        records = list_analysis_records(project_id=project["id"])
        assert len(records) == 0


class TestRequirementMapping:
    def test_save_and_get_requirement_mapping(self):
        project = create_project(name="需求映射项目")
        saved = save_requirement_mapping(
            project_id=project["id"],
            source_type="upload",
            last_file_name="mapping.xlsx",
            last_file_type="xlsx",
            sheet_name="Sheet1",
            groups=[
                {
                    "id": "group-1",
                    "tag": "流程变更",
                    "requirement_keyword": "抄录",
                    "related_scenarios": ["一键抄录", "逐字抄录"],
                }
            ],
        )

        fetched = get_requirement_mapping(project["id"])

        assert saved["source_type"] == "upload"
        assert saved["group_count"] == 1
        assert saved["row_count"] == 2
        assert fetched is not None
        assert fetched["project_name"] == "需求映射项目"
        assert fetched["last_file_name"] == "mapping.xlsx"
        assert fetched["groups"][0]["related_scenarios"] == ["一键抄录", "逐字抄录"]

    def test_delete_requirement_mapping(self):
        project = create_project(name="需求映射项目")
        save_requirement_mapping(
            project_id=project["id"],
            source_type="manual",
            groups=[
                {
                    "id": "group-1",
                    "tag": "流程变更",
                    "requirement_keyword": "抄录",
                    "related_scenarios": ["一键抄录"],
                }
            ],
        )

        deleted = delete_requirement_mapping(project["id"])

        assert deleted is True
        assert get_requirement_mapping(project["id"]) is None


# ============ save_analysis_record ============

class TestSaveAnalysisRecord:
    """测试保存分析记录"""

    def test_save_with_all_fields(self):
        """保存包含所有字段的分析记录"""
        project = create_project(name="项目")
        record = save_analysis_record(
            project_id=project["id"],
            code_changes_summary={"total_files": 3, "total_added": 50},
            test_coverage_result={"coverage_rate": 0.75, "covered": ["m1", "m2"]},
            test_score=82.5,
            ai_suggestions={"risk": "medium", "suggestions": ["增加边界测试"]},
            token_usage=1500,
            cost=0.005,
            duration_ms=3200,
            test_case_count=6,
        )
        assert record["id"] is not None
        assert record["project_id"] == project["id"]
        assert record["test_score"] == 82.5
        assert record["test_case_count"] == 6
        assert record["token_usage"] == 1500
        assert record["cost"] == 0.005
        assert record["duration_ms"] == 3200
        assert record["code_changes_summary"]["total_files"] == 3
        assert record["test_coverage_result"]["coverage_rate"] == 0.75
        assert record["ai_suggestions"]["risk"] == "medium"

    def test_save_without_ai_suggestions(self):
        """保存不含AI建议的记录"""
        project = create_project(name="项目")
        record = save_analysis_record(
            project_id=project["id"],
            code_changes_summary={"files": 1},
            test_coverage_result={"rate": 1.0},
            test_score=100.0,
            ai_suggestions=None,
            token_usage=0,
            cost=0.0,
            duration_ms=100,
        )
        assert record["ai_suggestions"] is None


# ============ get_analysis_record ============

class TestGetAnalysisRecord:
    """测试获取分析记录"""

    def test_get_existing(self):
        """获取存在的记录"""
        project = create_project(name="项目")
        saved = save_analysis_record(
            project_id=project["id"],
            code_changes_summary={"files": 1},
            test_coverage_result={"rate": 0.5},
            test_score=60.0,
            ai_suggestions=None,
            token_usage=0,
            cost=0.0,
            duration_ms=200,
        )
        fetched = get_analysis_record(saved["id"])
        assert fetched is not None
        assert fetched["test_score"] == 60.0

    def test_get_non_existing(self):
        """获取不存在的记录返回None"""
        result = get_analysis_record(9999)
        assert result is None


# ============ list_analysis_records ============

class TestListAnalysisRecords:
    """测试列出分析记录"""

    def _create_records(self, project_id, count):
        """辅助方法：创建多条记录"""
        for i in range(count):
            save_analysis_record(
                project_id=project_id,
                code_changes_summary={"index": i},
                test_coverage_result={"rate": 0.5 + i * 0.1},
                test_score=50.0 + i * 10,
                ai_suggestions=None,
                token_usage=100 * (i + 1),
                cost=0.001 * (i + 1),
                duration_ms=100 * (i + 1),
            )

    def test_list_all(self):
        """列出所有记录"""
        p1 = create_project(name="项目1")
        p2 = create_project(name="项目2")
        self._create_records(p1["id"], 3)
        self._create_records(p2["id"], 2)
        records = list_analysis_records()
        assert len(records) == 5

    def test_list_by_project(self):
        """按项目过滤记录"""
        p1 = create_project(name="项目1")
        p2 = create_project(name="项目2")
        self._create_records(p1["id"], 3)
        self._create_records(p2["id"], 2)
        records = list_analysis_records(project_id=p1["id"])
        assert len(records) == 3

    def test_list_pagination_limit(self):
        """分页：限制数量"""
        project = create_project(name="项目")
        self._create_records(project["id"], 5)
        records = list_analysis_records(limit=3)
        assert len(records) == 3

    def test_list_pagination_offset(self):
        """分页：偏移量"""
        project = create_project(name="项目")
        self._create_records(project["id"], 5)
        records = list_analysis_records(limit=2, offset=3)
        assert len(records) == 2

    def test_list_empty(self):
        """空数据库返回空列表"""
        records = list_analysis_records()
        assert records == []


class TestCaseQualityRecords:
    @staticmethod
    def _prepare_dependencies(project_id: int) -> tuple[int, int]:
        requirement_record = save_requirement_analysis_record(
            project_id=project_id,
            requirement_file_name="requirement.docx",
            section_snapshot={"selected_mode": "preferred_sections"},
            result_snapshot={"overview": {"matched_requirements": 2}, "score": {"total_score": 70}},
            ai_analysis={"risk_table": []},
            token_usage=100,
            cost=0.1,
            duration_ms=500,
        )
        analysis_record = save_analysis_record(
            project_id=project_id,
            code_changes_summary={"total_files": 1},
            test_coverage_result={"coverage_rate": 0.9},
            test_score=88.0,
            ai_suggestions={"summary": "ok"},
            token_usage=120,
            cost=0.12,
            duration_ms=700,
        )
        return requirement_record["id"], analysis_record["id"]

    def test_save_and_get_case_quality_record(self):
        project = create_project(name="案例质检项目")
        requirement_record_id, analysis_record_id = self._prepare_dependencies(project["id"])

        record = save_case_quality_record(
            project_id=project["id"],
            requirement_analysis_record_id=requirement_record_id,
            analysis_record_id=analysis_record_id,
            requirement_file_name="requirement.docx",
            code_changes_file_name="code.json",
            test_cases_file_name="tests.csv",
            requirement_score=70.0,
            case_score=88.0,
            total_token_usage=220,
            total_cost=0.22,
            total_duration_ms=1200,
            requirement_section_snapshot={"selected_mode": "preferred_sections"},
            requirement_result_snapshot={"overview": {"matched_requirements": 2}},
            case_result_snapshot={"score": {"total_score": 88.0}},
            combined_result_snapshot={"overview": {"average_score": 79.0}},
        )

        assert record["id"] is not None
        assert record["project_id"] == project["id"]
        assert record["project_name"] == "案例质检项目"
        assert record["requirement_result_snapshot"]["overview"]["matched_requirements"] == 2

        fetched = get_case_quality_record(record["id"])
        assert fetched is not None
        assert fetched["combined_result_snapshot"]["overview"]["average_score"] == 79.0

    def test_list_case_quality_records_with_project_filter(self):
        p1 = create_project(name="案例质检项目1")
        p2 = create_project(name="案例质检项目2")
        p1_req_id, p1_analysis_id = self._prepare_dependencies(p1["id"])
        p2_req_id, p2_analysis_id = self._prepare_dependencies(p2["id"])

        save_case_quality_record(
            project_id=p1["id"],
            requirement_analysis_record_id=p1_req_id,
            analysis_record_id=p1_analysis_id,
            requirement_file_name="req1.docx",
            code_changes_file_name="code1.json",
            test_cases_file_name="tests1.csv",
            requirement_score=70.0,
            case_score=88.0,
            total_token_usage=220,
            total_cost=0.22,
            total_duration_ms=1200,
            requirement_section_snapshot={},
            requirement_result_snapshot={},
            case_result_snapshot={},
            combined_result_snapshot={"overview": {"project_id": p1["id"]}},
        )
        save_case_quality_record(
            project_id=p2["id"],
            requirement_analysis_record_id=p2_req_id,
            analysis_record_id=p2_analysis_id,
            requirement_file_name="req2.docx",
            code_changes_file_name="code2.json",
            test_cases_file_name="tests2.csv",
            requirement_score=60.0,
            case_score=75.0,
            total_token_usage=200,
            total_cost=0.2,
            total_duration_ms=1000,
            requirement_section_snapshot={},
            requirement_result_snapshot={},
            case_result_snapshot={},
            combined_result_snapshot={"overview": {"project_id": p2["id"]}},
        )

        all_records = list_case_quality_records()
        project_1_records = list_case_quality_records(project_id=p1["id"])
        assert len(all_records) == 2
        assert len(project_1_records) == 1
        assert project_1_records[0]["project_id"] == p1["id"]


# ============ get_project_stats ============

class TestGetProjectStats:
    """测试项目统计"""

    def test_stats_with_records(self):
        """有记录时返回正确统计"""
        project = create_project(name="项目")
        save_analysis_record(
            project_id=project["id"],
            code_changes_summary={},
            test_coverage_result={},
            test_score=80.0,
            ai_suggestions=None,
            token_usage=0,
            cost=0.0,
            duration_ms=100,
        )
        save_analysis_record(
            project_id=project["id"],
            code_changes_summary={},
            test_coverage_result={},
            test_score=90.0,
            ai_suggestions=None,
            token_usage=0,
            cost=0.0,
            duration_ms=200,
        )
        stats = get_project_stats(project["id"])
        assert stats["analysis_count"] == 2
        assert stats["avg_score"] == 85.0
        assert stats["latest_analysis_date"] is not None

    def test_stats_without_records(self):
        """无记录时返回零值"""
        project = create_project(name="空项目")
        stats = get_project_stats(project["id"])
        assert stats["analysis_count"] == 0
        assert stats["avg_score"] is None
        assert stats["latest_analysis_date"] is None

    def test_stats_average_calculation(self):
        """验证平均分计算正确"""
        project = create_project(name="项目")
        scores = [70.0, 80.0, 90.0]
        for score in scores:
            save_analysis_record(
                project_id=project["id"],
                code_changes_summary={},
                test_coverage_result={},
                test_score=score,
                ai_suggestions=None,
                token_usage=0,
                cost=0.0,
                duration_ms=100,
            )
        stats = get_project_stats(project["id"])
        assert stats["avg_score"] == 80.0

    def test_stats_only_counts_own_project(self):
        """统计只计算指定项目的记录"""
        p1 = create_project(name="项目1")
        p2 = create_project(name="项目2")
        save_analysis_record(
            project_id=p1["id"],
            code_changes_summary={},
            test_coverage_result={},
            test_score=100.0,
            ai_suggestions=None,
            token_usage=0,
            cost=0.0,
            duration_ms=100,
        )
        save_analysis_record(
            project_id=p2["id"],
            code_changes_summary={},
            test_coverage_result={},
            test_score=50.0,
            ai_suggestions=None,
            token_usage=0,
            cost=0.0,
            duration_ms=100,
        )
        stats = get_project_stats(p1["id"])
        assert stats["analysis_count"] == 1
        assert stats["avg_score"] == 100.0


class TestTimestampSerialization:
    def test_audit_log_created_at_is_utc_iso_string(self):
        record = create_audit_log(
            module="系统管理",
            action="登录",
            result="success",
            detail="timestamp check",
        )

        assert record["created_at"].endswith("Z")
        assert "T" in record["created_at"]

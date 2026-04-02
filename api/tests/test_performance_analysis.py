import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from services.database import init_db
from services.performance_analysis import analyze_performance_workbook


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test_performance_analysis.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    monkeypatch.setattr("services.performance_analysis_file_store.get_db_path", lambda: db_path)
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


def _append_life_summary_sheet(workbook: Workbook):
    sheet = workbook.create_sheet("寿险汇总数据-含外协（2026）")
    sheet.append(["月度汇总", None, None, None, None, None, None, None, None, None, None, None, None])
    sheet.append(
        [
            "月份",
            "同步任务数",
            "同步+回归",
            "发布总次数",
            "需求数\n(同步+需求号去重)",
            "缺陷数\n除性能、代码扫描外所有任务类型\n（SIT+FT）",
            None,
            "测试任务平均时效",
            "设计用例数\n同步（SIT+FT）",
            "执行案例数\n同步+回归(手工&接口)+安全\n（SIT+FT）",
            "功能人月投入",
            "性能人月投入",
            "QA人月投入",
        ]
    )
    sheet.append([None] * 13)
    sheet.append(["2026年1月数据", 100, 150, 20, 80, 40, None, 4.2, 10000, 16000, 10, 1, 1])
    sheet.append(["2026年2月数据", 120, 180, 24, 90, 45, None, 4.6, 12000, 19000, 11, 1, 1])
    sheet.append([None] * 13)
    sheet.append(["2.月度人均任务数据", None, None, None, None, None, None, None, None, None, None, None, None])


def _append_life_external_sheet(workbook: Workbook):
    sheet = workbook.create_sheet("寿险对外数据（2026）")
    sheet.append(["月份&人力", None, None, "测试任务&测试案例", None, None, None, None, None, None, "缺陷信息"])
    sheet.append(
        [
            "月份",
            None,
            "人月投入",
            "发布总次数",
            "同步任务数",
            "需求数",
            "设计案例数",
            "执行案例数",
            "缺陷率",
            "测试任务平均时效",
            "测试缺陷数",
            "生产缺陷数",
            "生产缺陷检出率",
            "自动化覆盖率",
            "自动化执行通过率",
            "计划应用数",
            "已接入应用数",
            "精准接入率",
            None,
        ]
    )
    sheet.append(["1月", "寿险", 10, 20, 100, 80, 10000, 16000, 0.004, 4.2, 40, 1, 0.9, 0.7, 0.95, 10, 8, 0.8, None])
    sheet.append(["2月", "寿险", 11, 24, 120, 90, 12000, 19000, 0.00375, 4.6, 45, 0, 1, 0.72, 0.96, 10, 9, 0.9, None])


def _append_health_summary_sheet(workbook: Workbook):
    sheet = workbook.create_sheet("健康险汇总数据-含外协（2026）")
    sheet.append(["月度汇总", None, None, None, None, None, None, None, None, None, None, None, None])
    sheet.append(
        [
            "月份",
            "同步任务数",
            "同步+回归",
            "发布总次数",
            "需求数\n(同步+需求号去重)",
            "缺陷数\n除性能、代码扫描外所有任务类型\n（SIT+FT）",
            None,
            "测试任务平均时效",
            "设计用例数\n同步（SIT+FT）",
            "执行案例数\n同步+回归(手工&接口)+安全\n（SIT+FT）",
            "功能人月投入",
            "备注",
            None,
        ]
    )
    sheet.append([None] * 13)
    sheet.append([1, 50, 70, 12, 38, 18, None, 3.8, 5000, 8000, 6.5, "1月", None])
    sheet.append([2, 55, 78, 14, 42, 20, None, 4.1, 5600, 9100, 6.8, "2月", None])


def _append_health_external_sheet(workbook: Workbook):
    sheet = workbook.create_sheet("健康险对外数据（2026）")
    sheet.append(["月份&人力", None, None, "测试任务&测试案例", None, None, None, None, None, None, "缺陷信息"])
    sheet.append(
        [
            "月份",
            None,
            "人月投入",
            "发布总次数",
            "同步任务数",
            "需求数",
            "设计案例数",
            "执行案例数",
            "缺陷率",
            "测试任务平均时效",
            "测试缺陷数",
            "生产缺陷数",
            "生产缺陷检出率",
            "自动化覆盖率",
            "自动化执行通过率",
            "计划应用数",
            "已接入应用数",
            "精准接入率",
            None,
        ]
    )
    sheet.append(["1月", "健康险", 6.5, 12, 50, 38, 5000, 8000, 0.0036, 3.8, 18, 0, 1, None, None, 4, 3, 0.75, None])
    sheet.append(["2月", "健康险", 6.8, 14, 55, 42, 5600, 9100, 0.00357, 4.1, 20, 0, 1, None, None, 4, 4, 1, None])


def _append_life_team_sheet(workbook: Workbook):
    sheet = workbook.create_sheet("各团队数据（寿险）-2026")
    sheet.append([None] * 21)
    sheet.append(["2026年1月份"] + [None] * 20)
    sheet.append(
        [
            "团队",
            "系统个数",
            "同步任务数",
            "同步任务数+\n回归任务数",
            "总需求数",
            "总BUG数\n（全任务）",
            "设计案例数\n（同步任务）",
            "执行案例数\n（同步+回归(手工&自动化)+安全）",
            "人月数",
            "人均任务",
            None,
            "人均需求数",
            None,
            "人均缺陷数",
            None,
            "缺陷率",
            None,
            "平均设计案例数",
            None,
            "平均执行案例数",
            None,
        ]
    )
    sheet.append([None, None, None, None, None, None, None, None, None, "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名"])
    sheet.append(["A团队", 12, 60, 90, 45, 20, 6000, 9800, 6, 15, 1, 7.5, 1, 3.33, 2, 0.0033, 2, 1000, 2, 1633.33, 2])
    sheet.append(["B团队", 10, 40, 60, 35, 20, 4000, 6200, 5, 12, 2, 7, 2, 4, 1, 0.005, 1, 800, 1, 1240, 1])
    sheet.append([None] * 21)
    sheet.append(["2026年2月份"] + [None] * 20)
    sheet.append(
        [
            "团队",
            "系统个数",
            "同步任务数",
            "同步任务数+\n回归任务数",
            "总需求数",
            "总BUG数\n（全任务）",
            "设计案例数\n（同步任务）",
            "执行案例数\n（同步+回归(手工&自动化)+安全）",
            "人月数",
            "人均任务",
            None,
            "人均需求数",
            None,
            "人均缺陷数",
            None,
            "缺陷率",
            None,
            "平均设计案例数",
            None,
            "平均执行案例数",
            None,
        ]
    )
    sheet.append([None, None, None, None, None, None, None, None, None, "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名"])
    sheet.append(["A团队", 12, 70, 100, 50, 22, 6800, 11000, 6.5, 15.38, 1, 7.69, 1, 3.38, 2, 0.0032, 1, 1046.15, 2, 1692.31, 2])
    sheet.append(["B团队", 11, 50, 80, 40, 23, 5200, 8000, 5.5, 14.55, 2, 7.27, 2, 4.18, 1, 0.0044, 2, 945.45, 1, 1454.55, 1])


def _append_health_team_sheet(workbook: Workbook):
    sheet = workbook.create_sheet("各团队数据（健康险）-2026")
    sheet.append([None] * 22)
    sheet.append(["2026年1月份"] + [None] * 21)
    sheet.append(
        [
            "团队",
            "系统个数",
            "同步任务数",
            "同步任务数+\n回归任务数",
            "总需求数",
            "BUG数\n  (同步任务+回归+安全）",
            "总BUG数\n（全任务）",
            "设计案例数\n（同步任务）",
            "执行案例数\n（同步+回归+安全）",
            "人月数",
            "人均任务",
            None,
            "人均需求数",
            None,
            "人均缺陷数",
            None,
            "缺陷率",
            None,
            "平均设计案例数",
            None,
            "平均执行案例数",
            None,
        ]
    )
    sheet.append([None, None, None, None, None, None, None, None, None, None, "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名", "数量", "排名"])
    sheet.append(["H团队", 6, 30, 45, 24, 8, 8, 2500, 4200, 3.2, 14.06, 1, 7.5, 1, 2.5, 1, 0.0032, 1, 781.25, 1, 1312.5, 1])
    sheet.append(["I团队", 5, 20, 25, 14, 10, 10, 1800, 3000, 2.8, 8.93, 2, 5, 2, 3.57, 2, 0.0056, 2, 642.86, 2, 1071.43, 2])


def _build_workbook_bytes() -> bytes:
    workbook = Workbook()
    default_sheet = workbook.active
    workbook.remove(default_sheet)

    _append_life_summary_sheet(workbook)
    _append_life_external_sheet(workbook)
    _append_life_team_sheet(workbook)
    _append_health_summary_sheet(workbook)
    _append_health_external_sheet(workbook)
    _append_health_team_sheet(workbook)

    content = io.BytesIO()
    workbook.save(content)
    workbook.close()
    return content.getvalue()


def test_analyze_performance_workbook_builds_dashboard():
    result = analyze_performance_workbook(_build_workbook_bytes())

    assert sorted(result["available_businesses"]) == ["健康险", "寿险"]
    assert result["businesses"]["寿险"]["latest_month"] == {"year": 2026, "month": 2, "month_label": "2月"}
    assert result["businesses"]["寿险"]["monthly_metrics"][-1]["total_tasks"] == 180
    assert result["businesses"]["寿险"]["monthly_metrics"][-1]["automation_coverage"] == 0.72
    assert len(result["businesses"]["寿险"]["team_snapshots"]) == 2
    assert result["businesses"]["健康险"]["monthly_metrics"][-1]["defect_rate"] == pytest.approx(0.00357)
    assert result["businesses"]["健康险"]["team_snapshots"][0]["teams"][0]["team_name"] == "H团队"


def test_upload_and_analyze_performance_workbook(client):
    workbook_bytes = _build_workbook_bytes()

    upload_resp = client.post(
        "/api/performance-analysis-files",
        files={
            "file": (
                "efficiency-dashboard.xlsx",
                workbook_bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert upload_resp.status_code == 200
    upload_data = upload_resp.json()
    assert upload_data["success"] is True
    assert upload_data["data"]["sheet_count"] == 6

    list_resp = client.get("/api/performance-analysis-files")
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["success"] is True
    assert len(list_data["data"]) == 1

    file_id = upload_data["data"]["id"]
    analysis_resp = client.get(f"/api/performance-analysis-files/{file_id}/analysis")
    assert analysis_resp.status_code == 200
    analysis_data = analysis_resp.json()
    assert analysis_data["success"] is True
    assert analysis_data["data"]["source_file"]["id"] == file_id
    assert analysis_data["data"]["businesses"]["寿险"]["latest_month"]["month"] == 2
    assert analysis_data["data"]["businesses"]["健康险"]["team_snapshots"][0]["month"] == 1

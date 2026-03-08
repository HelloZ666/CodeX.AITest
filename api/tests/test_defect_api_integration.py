import io

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from services.database import init_db


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
    db_path = str(tmp_path / "test_defect_api.db")
    monkeypatch.setattr("services.database.get_db_path", lambda: db_path)
    init_db()
    return db_path


@pytest.fixture
def client():
    from index import app

    return TestClient(app)


def build_defect_row(**overrides):
    row = {field: "" for field in DEFECT_FIELDS}
    row.update(
        {
            "缺陷ID": "BUG-001",
            "缺陷摘要": "登录接口返回空指针",
            "任务编号": "TASK-001",
            "系统名称": "智测平台",
            "系统CODE": "ZCPT",
            "需求编号": "REQ-001",
            "计划发布日期": "2026-03-01",
            "缺陷状态": "已关闭",
            "缺陷修复人": "张三",
            "缺陷修复人p13": "zhangsan",
            "缺陷严重度": "严重",
            "重现频率": "必现",
            "业务影响": "影响核心交易",
            "缺陷来源": "系统测试",
            "缺陷原因": "接口校验缺失",
            "缺陷子原因": "边界值遗漏",
            "缺陷描述": "请求参数为空时接口抛出异常",
            "缺陷修复描述": "补充空值判断",
            "测试阶段": "系统测试",
            "分配处理人": "李四",
            "分配处理人P13": "lisi",
            "缺陷修复时长": "8",
            "修复轮次": "1",
            "功能区": "账户中心",
            "缺陷关闭时间": "2026-03-03 12:00:00",
            "开发团队": "开发一组",
            "测试团队": "测试一组",
            "测试用例库": "核心交易回归",
            "功能模块": "登录模块",
            "测试项": "登录接口",
            "创建人姓名": "王五",
            "创建人P13": "wangwu",
            "创建时间": "2026-03-02 09:00:00",
            "是否初级缺陷": "否",
            "初级缺陷依据": "",
        }
    )
    row.update(overrides)
    return row


def build_defect_excel_bytes(rows: list[dict]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(DEFECT_FIELDS)
    for row in rows:
      sheet.append([row[field] for field in DEFECT_FIELDS])

    content = io.BytesIO()
    workbook.save(content)
    workbook.close()
    return content.getvalue()


def test_import_defect_analysis_excel(client):
    resp = client.post(
        "/api/defect-analysis/import",
        files={
            "file": (
                "defect-analysis.xlsx",
                build_defect_excel_bytes(
                    [
                        build_defect_row(),
                        build_defect_row(
                            缺陷ID="BUG-002",
                            缺陷摘要="支付回调重复落账",
                            缺陷严重度="一般",
                            业务影响="影响部分用户体验",
                            缺陷来源="回归测试",
                            缺陷原因="幂等控制不足",
                            缺陷子原因="重复回调未拦截",
                        ),
                    ]
                ),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["data"]["overview"]["total_records"] == 2
    assert data["data"]["charts"]["severity_distribution"]
    assert data["data"]["charts"]["source_distribution"]
    assert data["data"]["summary"]["key_findings"]


def test_import_defect_analysis_rejects_missing_fields(client):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["缺陷ID", "缺陷摘要"])
    sheet.append(["BUG-001", "登录接口返回空指针"])

    content = io.BytesIO()
    workbook.save(content)
    workbook.close()

    resp = client.post(
        "/api/defect-analysis/import",
        files={
            "file": (
                "invalid-defect-analysis.xlsx",
                content.getvalue(),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
    )

    assert resp.status_code == 400
    assert "缺少必要字段" in resp.json()["detail"]

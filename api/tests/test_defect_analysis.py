import pytest

from services.defect_analysis import analyze_defect_rows


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


def test_analyze_defect_rows_builds_summary():
    rows = [
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
        build_defect_row(
            缺陷ID="BUG-003",
            缺陷摘要="登录接口返回空指针",
            缺陷严重度="严重",
            业务影响="影响核心交易",
            缺陷来源="系统测试",
            缺陷原因="接口校验缺失",
            缺陷子原因="边界值遗漏",
        ),
    ]

    result = analyze_defect_rows(rows)

    assert result["overview"]["total_records"] == 3
    assert result["overview"]["severity_count"] == 2
    assert result["overview"]["source_count"] == 2
    assert result["overview"]["top_severity"]["name"] == "严重"
    assert result["charts"]["summary_distribution"][0]["name"] == "登录接口返回空指针"
    assert result["charts"]["reason_distribution"][0]["name"] == "接口校验缺失"
    assert result["summary"]["recommended_actions"]
    assert len(result["preview_rows"]) == 3
    assert result["preview_rows"][0]["功能模块"] == "登录模块"


def test_analyze_defect_rows_accepts_alias_headers():
    rows = [
        {
            "缺陷编号": "BUG-001",
            "摘要": "登录接口返回空指针",
            "任务编号": "TASK-001",
            "系统名称": "智测平台",
            "系统Code": "ZCPT",
            "需求编号": "REQ-001",
            "计划发布日期": "2026-03-01",
            "缺陷状态": "已关闭",
            "缺陷修复人": "张三",
            "缺陷修复人P13": "zhangsan",
            "严重度": "严重",
            "重现频率": "必现",
            "业务影响": "影响核心交易",
            "来源": "系统测试",
            "原因": "接口校验缺失",
            "子原因": "边界值遗漏",
            "缺陷描述": "请求参数为空时接口抛出异常",
            "缺陷修复描述": "补充空值判断",
            "测试阶段": "系统测试",
            "分配处理人": "李四",
            "分配处理人p13": "lisi",
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
            "创建人p13": "wangwu",
            "创建时间": "2026-03-02 09:00:00",
            "是否初级缺陷": "否",
            "初级缺陷依据": "",
        }
    ]

    result = analyze_defect_rows(rows)

    assert result["overview"]["total_records"] == 1
    assert result["charts"]["severity_distribution"][0]["name"] == "严重"
    assert result["preview_rows"][0]["缺陷编号"] == "BUG-001"
    assert result["preview_rows"][0]["测试项"] == "登录接口"


def test_analyze_defect_rows_preview_keeps_all_rows():
    rows = [
        build_defect_row(缺陷ID=f"BUG-{index:03d}", 功能模块="登录模块", 测试项="登录接口")
        for index in range(25)
    ]

    result = analyze_defect_rows(rows)

    assert len(result["preview_rows"]) == 25
    assert result["preview_rows"][24]["功能模块"] == "登录模块"


def test_analyze_defect_rows_extracts_manual_input_labels_for_statistics():
    rows = [
        build_defect_row(
            **{
                "缺陷来源": "其他-手动输入(03-系统实现)",
                "缺陷原因": "其他-手动输入(01-代码)",
                "缺陷子原因": "其他-手动输入(02-接口设计)",
            }
        )
    ]

    result = analyze_defect_rows(rows)

    assert result["overview"]["top_source"]["name"] == "03-系统实现"
    assert result["charts"]["source_distribution"][0]["name"] == "03-系统实现"
    assert result["charts"]["reason_distribution"][0]["name"] == "01-代码"
    assert result["charts"]["sub_reason_distribution"][0]["name"] == "02-接口设计"
    assert "03-系统实现" in result["summary"]["headline"]
    assert result["preview_rows"][0]["缺陷来源"] == "其他-手动输入(03-系统实现)"


def test_analyze_defect_rows_raises_for_missing_required_fields():
    rows = [
        {
            "缺陷ID": "BUG-001",
            "缺陷摘要": "登录接口返回空指针",
        }
    ]

    with pytest.raises(ValueError, match="缺少必要字段"):
        analyze_defect_rows(rows)

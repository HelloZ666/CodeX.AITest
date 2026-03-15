import pytest

from services.issue_analysis import analyze_issue_rows


def test_analyze_issue_rows_builds_summary():
    rows = [
        {
            "出现该问题的原因": "需求评审不足，边界条件遗漏",
            "改善举措": "补充评审清单；增加边界场景检查",
            "发生阶段": "需求阶段",
            "是否人为原因": "是",
            "发生原因总结": "需求澄清不足",
            "标签": "需求,边界场景",
        },
        {
            "出现该问题的原因": "联调环境不稳定",
            "改善举措": "稳定测试环境",
            "发生阶段": "联调阶段",
            "是否人为原因": "否",
            "发生原因总结": "环境问题",
            "标签": "环境",
        },
        {
            "出现该问题的原因": "需求评审不足",
            "改善举措": "补充评审清单",
            "发生阶段": "需求阶段",
            "是否人为原因": "Y",
            "发生原因总结": "需求澄清不足",
            "标签": "需求",
        },
    ]

    result = analyze_issue_rows(rows)

    assert result["overview"]["total_records"] == 3
    assert result["overview"]["stage_count"] == 2
    assert result["overview"]["human_related_count"] == 2
    assert result["overview"]["top_stage"]["name"] == "需求阶段"

    assert result["charts"]["stage_distribution"][0]["count"] == 2
    assert result["charts"]["tag_distribution"][0]["name"] == "需求"
    assert result["charts"]["reason_summary_distribution"][0]["name"] == "需求澄清不足"
    assert result["summary"]["recommended_actions"]
    assert len(result["preview_rows"]) == 3
    assert result["preview_rows"][0]["标签"] == "需求,边界场景"


def test_analyze_issue_rows_accepts_alias_headers():
    rows = [
        {
            "问题原因": "测试遗漏",
            "改进措施": "补充回归用例",
            "阶段": "测试阶段",
            "人为原因": "true",
            "原因总结": "测试覆盖不足",
            "问题标签": "测试",
        }
    ]

    result = analyze_issue_rows(rows)

    assert result["overview"]["total_records"] == 1
    assert result["charts"]["human_factor_distribution"][0]["name"] == "人为原因"
    assert result["preview_rows"][0]["问题标签"] == "测试"


def test_analyze_issue_rows_preview_keeps_all_rows():
    rows = [
        {
            "出现该问题的原因": f"原因-{index}",
            "改善举措": f"措施-{index}",
            "发生阶段": "测试阶段",
            "是否人为原因": "否",
            "发生原因总结": f"总结-{index}",
            "标签": "测试",
            "责任部门": "质量部",
        }
        for index in range(25)
    ]

    result = analyze_issue_rows(rows)

    assert len(result["preview_rows"]) == 25
    assert result["preview_rows"][24]["责任部门"] == "质量部"


def test_analyze_issue_rows_raises_for_missing_required_fields():
    rows = [
        {
            "问题原因": "测试遗漏",
            "阶段": "测试阶段",
        }
    ]

    with pytest.raises(ValueError, match="缺少必要字段"):
        analyze_issue_rows(rows)

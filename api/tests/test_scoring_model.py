"""
test_scoring_model.py - 评分模型测试
"""

import pytest

from services.scoring_model import (
    score_coverage,
    score_completeness,
    score_clarity,
    score_boundary,
    calculate_score,
    WEIGHTS,
)


class TestScoreCoverage:
    """测试覆盖范围评分"""

    def test_full_coverage(self):
        dim = score_coverage(total_changed_methods=5, covered_count=5)
        assert dim.score == 100.0
        assert dim.dimension == "覆盖范围"
        assert dim.weight == WEIGHTS["coverage"]

    def test_zero_coverage(self):
        dim = score_coverage(total_changed_methods=5, covered_count=0)
        assert dim.score == 0.0

    def test_partial_coverage(self):
        dim = score_coverage(total_changed_methods=10, covered_count=7)
        assert dim.score == 70.0

    def test_no_changes(self):
        dim = score_coverage(total_changed_methods=0, covered_count=0)
        assert dim.score == 100.0  # 无改动满分

    def test_weighted_score(self):
        dim = score_coverage(total_changed_methods=10, covered_count=5)
        assert dim.weighted_score == pytest.approx(50.0 * WEIGHTS["coverage"], abs=0.1)


class TestScoreCompleteness:
    """测试步骤完整性评分"""

    def test_good_steps(self):
        cases = [
            {"测试步骤": "1. 输入用户名 2. 点击创建按钮 3. 检查返回结果"},
        ]
        dim = score_completeness(cases)
        assert dim.score > 50  # 有步骤+有编号+有动词

    def test_empty_steps(self):
        cases = [{"测试步骤": ""}]
        dim = score_completeness(cases)
        assert dim.score == 0.0

    def test_no_cases(self):
        dim = score_completeness([])
        assert dim.score == 0.0
        assert "无测试用例" in dim.details

    def test_multiple_cases_average(self):
        cases = [
            {"测试步骤": "1. 输入数据 2. 点击提交 3. 验证结果"},
            {"测试步骤": ""},
        ]
        dim = score_completeness(cases)
        # 一个好用例 + 一个空用例，平均分
        assert 0 < dim.score < 100

    def test_preconditions_add_bonus(self):
        cases = [
            {
                "test_steps": "1、登录系统\n2、提交申请",
                "preconditions": "账号已创建，系统已更新",
            },
        ]
        dim = score_completeness(cases)
        assert dim.score > 30


class TestScoreClarity:
    """测试预期结果明确性评分"""

    def test_clear_expectation(self):
        cases = [{"预期结果": "用户创建成功，返回正确的用户ID"}]
        dim = score_clarity(cases)
        assert dim.score > 50

    def test_empty_expectation(self):
        cases = [{"预期结果": ""}]
        dim = score_clarity(cases)
        assert dim.score == 0.0

    def test_no_cases(self):
        dim = score_clarity([])
        assert dim.score == 0.0

    def test_vague_expectation(self):
        cases = [{"预期结果": "ok"}]
        dim = score_clarity(cases)
        assert dim.score < 80  # 太短，不够明确


class TestScoreBoundary:
    """测试边界用例评分"""

    def test_with_boundary_cases(self):
        cases = [
            {"测试功能": "空用户名创建失败", "测试步骤": "输入空用户名", "预期结果": "返回错误提示"},
            {"测试功能": "正常创建用户", "测试步骤": "输入正常数据", "预期结果": "成功"},
        ]
        dim = score_boundary(cases, total_changed_methods=1)
        assert dim.score > 0

    def test_no_boundary_cases(self):
        cases = [
            {"测试功能": "创建用户", "测试步骤": "输入数据", "预期结果": "成功"},
        ]
        dim = score_boundary(cases, total_changed_methods=5)
        # 没有边界词，但有用例/方法比
        assert dim.score >= 0

    def test_no_cases(self):
        dim = score_boundary([], total_changed_methods=3)
        assert dim.score == 0.0

    def test_high_ratio(self):
        cases = [
            {"测试功能": f"测试{i}", "测试步骤": "步骤", "预期结果": "结果"}
            for i in range(10)
        ]
        dim = score_boundary(cases, total_changed_methods=2)
        assert dim.score > 0  # 用例/方法比 = 5:1

    def test_reverse_case_type_counts_as_boundary(self):
        cases = [
            {
                "test_function": "正常流程验证",
                "test_steps": "1、执行流程",
                "expected_result": "操作成功",
                "case_type": "反向",
            },
        ]
        dim = score_boundary(cases, total_changed_methods=2)
        assert dim.score >= 15

    def test_special_data_description_counts_as_boundary(self):
        cases = [
            {
                "用例描述": "【特殊数据】：明白纸单证模板的预期结果:不更新与原来一致",
                "测试步骤": "1、执行流程",
                "预期结果": "不更新与原来一致",
            },
        ]
        dim = score_boundary(cases, total_changed_methods=2)
        assert dim.score >= 15


class TestCalculateScore:
    """测试综合评分"""

    def test_perfect_score(self):
        cases = [
            {
                "测试步骤": "1. 输入数据 2. 点击创建 3. 验证结果",
                "预期结果": "创建成功，返回正确的ID",
                "测试功能": "空值边界测试",
            },
        ]
        result = calculate_score(
            total_changed_methods=1,
            covered_count=1,
            test_cases=cases,
        )
        assert result.total_score > 0
        assert result.grade in ["A", "B", "C", "D", "F"]
        assert len(result.dimensions) == 4

    def test_zero_score(self):
        result = calculate_score(
            total_changed_methods=10,
            covered_count=0,
            test_cases=[],
        )
        assert result.total_score == 0.0
        assert result.grade == "F"

    def test_weight_sum(self):
        total_weight = sum(WEIGHTS.values())
        assert total_weight == pytest.approx(1.0, abs=0.001)

    def test_score_range(self):
        cases = [
            {"测试步骤": "1. 操作", "预期结果": "成功", "测试功能": "测试"},
        ]
        result = calculate_score(
            total_changed_methods=3,
            covered_count=1,
            test_cases=cases,
        )
        assert 0 <= result.total_score <= 100

    def test_grade_A(self):
        # 构造高分场景
        cases = [
            {
                "测试步骤": "1. 输入数据 2. 点击提交 3. 验证返回值",
                "预期结果": "操作成功，返回正确结果，页面跳转到列表",
                "测试功能": "异常边界-空值处理",
            }
            for _ in range(10)
        ]
        result = calculate_score(
            total_changed_methods=3,
            covered_count=3,
            test_cases=cases,
        )
        assert result.grade in ["A", "B"]  # 应该得高分

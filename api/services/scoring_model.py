"""
scoring_model.py - 测试用例量化评分模型

4维度加权评分：
- 覆盖范围（40%）：是否覆盖核心改动方法
- 步骤完整性（30%）：前置条件、操作步骤、数据准备是否齐全
- 预期结果明确性（20%）：是否有可验证的断言
- 边界用例（10%）：异常场景、边界条件覆盖情况
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Optional


# 权重配置
WEIGHTS = {
    "coverage": 0.40,
    "completeness": 0.30,
    "clarity": 0.20,
    "boundary": 0.10,
}


@dataclass
class DimensionScore:
    """单维度评分"""
    dimension: str
    score: float        # 0-100
    weight: float       # 权重
    weighted_score: float  # 加权后分数
    details: str = ""   # 评分说明


@dataclass
class ScoreResult:
    """评分结果"""
    total_score: float = 0.0
    dimensions: list[DimensionScore] = field(default_factory=list)
    grade: str = ""     # A/B/C/D/F
    summary: str = ""
    error: Optional[str] = None


def score_coverage(
    total_changed_methods: int,
    covered_count: int,
) -> DimensionScore:
    """
    评估覆盖范围。

    Args:
        total_changed_methods: 代码改动涉及的方法总数
        covered_count: 被测试用例覆盖的方法数

    Returns:
        DimensionScore
    """
    if total_changed_methods == 0:
        raw_score = 100.0
        detail = "无代码改动，满分"
    else:
        rate = covered_count / total_changed_methods
        raw_score = min(100.0, rate * 100)
        detail = f"覆盖率 {covered_count}/{total_changed_methods} = {rate:.1%}"

    weighted = raw_score * WEIGHTS["coverage"]
    return DimensionScore(
        dimension="覆盖范围",
        score=round(raw_score, 1),
        weight=WEIGHTS["coverage"],
        weighted_score=round(weighted, 2),
        details=detail,
    )


def score_completeness(test_cases: list[dict]) -> DimensionScore:
    """
    评估测试步骤完整性。

    检查每个测试用例是否包含：
    - 测试步骤描述
    - 多个步骤（至少2步）
    - 步骤中包含数据/操作描述

    Args:
        test_cases: 测试用例字典列表

    Returns:
        DimensionScore
    """
    if not test_cases:
        return DimensionScore(
            dimension="步骤完整性",
            score=0.0,
            weight=WEIGHTS["completeness"],
            weighted_score=0.0,
            details="无测试用例",
        )

    total_score = 0.0
    for tc in test_cases:
        steps = _get_case_text(tc, "test_steps", "测试步骤")
        preconditions = _get_case_text(tc, "preconditions", "预置条件", "前置条件")
        case_score = 0.0

        if steps:
            case_score += 30  # 有步骤描述

            # 检查步骤数量
            step_count = _count_steps(steps)
            if step_count >= 3:
                case_score += 40
            elif step_count >= 2:
                case_score += 25
            elif step_count >= 1:
                case_score += 10

            # 检查步骤细节（包含操作动词）
            action_words = ["输入", "点击", "选择", "验证", "检查", "打开", "提交", "确认", "修改", "删除"]
            has_action = any(w in steps for w in action_words)
            if has_action:
                case_score += 30
        if preconditions:
            case_score += 15

        case_score = min(case_score, 100.0)

        total_score += case_score

    avg_score = total_score / len(test_cases)
    weighted = avg_score * WEIGHTS["completeness"]

    return DimensionScore(
        dimension="步骤完整性",
        score=round(avg_score, 1),
        weight=WEIGHTS["completeness"],
        weighted_score=round(weighted, 2),
        details=f"平均步骤质量 {avg_score:.1f}/100 ({len(test_cases)}个用例)",
    )


def score_clarity(test_cases: list[dict]) -> DimensionScore:
    """
    评估预期结果明确性。

    检查每个测试用例是否有：
    - 明确的预期结果描述
    - 包含可验证的关键词（成功/失败/显示/包含等）

    Args:
        test_cases: 测试用例字典列表

    Returns:
        DimensionScore
    """
    if not test_cases:
        return DimensionScore(
            dimension="预期结果明确性",
            score=0.0,
            weight=WEIGHTS["clarity"],
            weighted_score=0.0,
            details="无测试用例",
        )

    total_score = 0.0
    for tc in test_cases:
        expected = _get_case_text(tc, "expected_result", "预期结果", "期望结果")
        case_score = 0.0

        if expected:
            case_score += 40  # 有预期结果描述

            # 检查是否有可验证关键词
            verify_words = ["成功", "失败", "显示", "包含", "等于", "不为空",
                           "返回", "跳转", "提示", "错误", "正确", "存在"]
            matches = sum(1 for w in verify_words if w in expected)
            if matches >= 2:
                case_score += 40
            elif matches >= 1:
                case_score += 25

            # 检查描述长度（过短不够明确）
            if len(expected) >= 10:
                case_score += 20
            elif len(expected) >= 5:
                case_score += 10

        total_score += case_score

    avg_score = total_score / len(test_cases)
    weighted = avg_score * WEIGHTS["clarity"]

    return DimensionScore(
        dimension="预期结果明确性",
        score=round(avg_score, 1),
        weight=WEIGHTS["clarity"],
        weighted_score=round(weighted, 2),
        details=f"平均预期结果质量 {avg_score:.1f}/100 ({len(test_cases)}个用例)",
    )


def score_boundary(test_cases: list[dict], total_changed_methods: int) -> DimensionScore:
    """
    评估边界用例覆盖。

    检查测试用例中是否包含：
    - 异常/边界场景
    - 负向测试用例
    - 用例数量与改动方法数的比例

    Args:
        test_cases: 测试用例字典列表
        total_changed_methods: 改动方法总数

    Returns:
        DimensionScore
    """
    if not test_cases:
        return DimensionScore(
            dimension="边界用例",
            score=0.0,
            weight=WEIGHTS["boundary"],
            weighted_score=0.0,
            details="无测试用例",
        )

    # 检查异常/边界相关关键词
    boundary_words = ["异常", "边界", "空", "null", "为空", "不存在", "超长",
                      "超时", "重复", "并发", "负数", "最大", "最小", "特殊字符",
                      "无效", "非法", "错误", "失败"]

    boundary_count = 0
    for tc in test_cases:
        func = _get_case_text(tc, "test_function", "测试功能", "用例描述")
        steps = _get_case_text(tc, "test_steps", "测试步骤")
        expected = _get_case_text(tc, "expected_result", "预期结果", "期望结果")
        case_type = _get_case_text(tc, "case_type", "用例类型")
        combined = f"{func} {steps} {expected}"

        if "反向" in case_type or "特殊数据" in func or any(w in combined for w in boundary_words):
            boundary_count += 1

    # 评分逻辑
    raw_score = 0.0

    # 边界用例占比
    if test_cases:
        boundary_ratio = boundary_count / len(test_cases)
        if boundary_ratio >= 0.3:
            raw_score += 50
        elif boundary_ratio >= 0.15:
            raw_score += 30
        elif boundary_count >= 1:
            raw_score += 15

    # 用例数量与方法数比例（理想：每个方法至少2-3个测试用例）
    if total_changed_methods > 0:
        ratio = len(test_cases) / total_changed_methods
        if ratio >= 3:
            raw_score += 50
        elif ratio >= 2:
            raw_score += 35
        elif ratio >= 1:
            raw_score += 20
        else:
            raw_score += 10
    else:
        raw_score += 25  # 无改动方法，给基础分

    raw_score = min(100.0, raw_score)
    weighted = raw_score * WEIGHTS["boundary"]

    return DimensionScore(
        dimension="边界用例",
        score=round(raw_score, 1),
        weight=WEIGHTS["boundary"],
        weighted_score=round(weighted, 2),
        details=f"边界用例 {boundary_count}/{len(test_cases)}, 用例/方法比 {len(test_cases)}/{total_changed_methods}",
    )


def calculate_score(
    total_changed_methods: int,
    covered_count: int,
    test_cases: list[dict],
) -> ScoreResult:
    """
    计算测试用例综合评分。

    Args:
        total_changed_methods: 代码改动涉及的方法总数
        covered_count: 被测试覆盖的方法数
        test_cases: 测试用例列表（字典格式）

    Returns:
        ScoreResult 包含各维度评分和总分
    """
    dim_coverage = score_coverage(total_changed_methods, covered_count)
    dim_completeness = score_completeness(test_cases)
    dim_clarity = score_clarity(test_cases)
    dim_boundary = score_boundary(test_cases, total_changed_methods)

    dimensions = [dim_coverage, dim_completeness, dim_clarity, dim_boundary]

    total = sum(d.weighted_score for d in dimensions)
    total = round(min(100.0, max(0.0, total)), 1)

    grade = _get_grade(total)
    summary = _get_summary(total, grade)

    return ScoreResult(
        total_score=total,
        dimensions=dimensions,
        grade=grade,
        summary=summary,
    )


def _count_steps(steps_text: str) -> int:
    """计算步骤数量"""
    # 匹配 "1." "2." 或 "1、" "2、" 或 "步骤1" 等格式
    import re
    patterns = [
        r'\d+[\.\、\)]',  # 1. 2. 或 1、 2、 或 1) 2)
        r'步骤\d+',
    ]
    count = 0
    for pattern in patterns:
        matches = re.findall(pattern, steps_text)
        count = max(count, len(matches))

    # 如果没有编号，按换行/分号分割
    if count == 0:
        parts = [p.strip() for p in steps_text.replace(";", "\n").replace("；", "\n").split("\n") if p.strip()]
        count = len(parts)

    return count


def _get_grade(score: float) -> str:
    """根据分数返回等级"""
    if score >= 90:
        return "A"
    elif score >= 80:
        return "B"
    elif score >= 60:
        return "C"
    elif score >= 40:
        return "D"
    else:
        return "F"


def _get_summary(score: float, grade: str) -> str:
    """根据分数和等级生成评语"""
    summaries = {
        "A": "测试用例质量优秀，覆盖全面且步骤清晰",
        "B": "测试用例质量良好，建议补充部分边界场景",
        "C": "测试用例基本合格，建议加强覆盖范围和步骤细节",
        "D": "测试用例不足，需要大幅补充改进",
        "F": "测试用例严重不足，建议全面重新编写",
    }
    return summaries.get(grade, "")


def _get_case_text(test_case: object, *keys: str) -> str:
    for key in keys:
        value = _get_case_value(test_case, key)
        if value is None:
            continue

        text = str(value).strip()
        if text:
            return text

    return ""


def _get_case_value(test_case: object, key: str) -> object:
    if isinstance(test_case, Mapping):
        return test_case.get(key)

    return getattr(test_case, key, None)

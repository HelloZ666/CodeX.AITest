"""
coverage_analyzer.py - 测试覆盖分析模块

对比代码改动与测试用例，通过映射关系识别未覆盖的改动。
"""

from dataclasses import dataclass, field
import re
from typing import Optional


@dataclass
class MappingEntry:
    """映射关系条目"""
    package_name: str
    class_name: str
    method_name: str
    description: str

    @property
    def full_qualified_name(self) -> str:
        return f"{self.package_name}.{self.class_name}.{self.method_name}"


@dataclass
class TestCase:
    """测试用例"""
    test_id: str
    test_function: str
    test_steps: str
    expected_result: str
    flow_name: str = ""
    module_path: str = ""
    preconditions: str = ""
    check_type: str = ""
    test_type: str = ""
    case_level: str = ""
    case_type: str = ""
    priority: str = ""
    search_text: str = ""

    def to_dict(self) -> dict[str, str]:
        return {
            "test_id": self.test_id,
            "test_function": self.test_function,
            "test_steps": self.test_steps,
            "expected_result": self.expected_result,
            "flow_name": self.flow_name,
            "module_path": self.module_path,
            "preconditions": self.preconditions,
            "check_type": self.check_type,
            "test_type": self.test_type,
            "case_level": self.case_level,
            "case_type": self.case_type,
            "priority": self.priority,
            "search_text": self.search_text,
        }


@dataclass
class CoverageResult:
    """覆盖分析结果"""
    total_changed_methods: int = 0
    covered_methods: list[str] = field(default_factory=list)
    uncovered_methods: list[str] = field(default_factory=list)
    coverage_rate: float = 0.0
    coverage_details: list[dict] = field(default_factory=list)
    error: Optional[str] = None


TEST_CASE_FIELD_ALIASES: dict[str, tuple[str, ...]] = {
    "test_id": ("测试用例ID", "用例ID", "用例编号", "test_id", "case_id", "id"),
    "test_function": (
        "测试功能",
        "功能",
        "用例描述",
        "test_function",
        "case_description",
        "description",
    ),
    "test_steps": ("测试步骤", "步骤", "test_steps", "steps"),
    "expected_result": ("预期结果", "期望结果", "expected_result", "expect_result"),
    "flow_name": ("流程名称", "流程", "flow_name"),
    "module_path": ("功能模块路径", "模块路径", "功能路径", "module_path"),
    "preconditions": ("预置条件", "前置条件", "preconditions", "precondition"),
    "check_type": ("检查点类型", "检查点", "check_type"),
    "test_type": ("测试类型", "test_type"),
    "case_level": ("用例等级", "业务影响等级", "case_level"),
    "case_type": ("用例类型", "case_type"),
    "priority": ("用例优先级", "优先级", "priority"),
}

TEST_CASE_REQUIRED_FIELDS = {"test_id", "test_function", "test_steps", "expected_result"}
TEST_CASE_MATCH_FIELD_WEIGHTS = {
    "test_function": 3,
    "test_steps": 2,
    "expected_result": 2,
    "flow_name": 1,
    "module_path": 1,
}
TEST_CASE_PHRASE_STOP_WORDS = {
    "测试",
    "功能",
    "页面",
    "场景",
    "流程",
    "系统",
    "校验",
    "验证",
    "结果",
    "操作",
    "处理",
}
TEST_CASE_GENERIC_SUFFIXES = (
    "功能",
    "信息",
    "数据",
    "内容",
    "结果",
    "流程",
    "页面",
    "模块",
    "状态",
    "列表",
    "详情",
    "模板",
)

TEST_CASE_ALIAS_TO_FIELD = {
    re.sub(r"[\s\W_]+", "", alias, flags=re.UNICODE).lower(): field
    for field, aliases in TEST_CASE_FIELD_ALIASES.items()
    for alias in aliases
}


def parse_mapping_data(rows: list[dict]) -> list[MappingEntry]:
    """
    解析映射关系数据。

    Args:
        rows: CSV解析后的字典列表，每个字典包含 包名/类名/方法名/功能描述

    Returns:
        MappingEntry 列表
    """
    entries = []
    for row in rows:
        # 支持中英文字段名
        package = row.get("包名", row.get("package_name", "")).strip()
        class_name = row.get("类名", row.get("class_name", "")).strip()
        method = row.get("方法名", row.get("method_name", "")).strip()
        desc = row.get("功能描述", row.get("description", "")).strip()

        if package and class_name and method:
            entries.append(MappingEntry(
                package_name=package,
                class_name=class_name,
                method_name=method,
                description=desc,
            ))

    return entries


def normalize_test_case_rows(rows: list[dict]) -> list[dict[str, str]]:
    """
    归一化测试用例数据行，兼容旧四列表头与真实 Excel 模板。

    Args:
        rows: CSV/Excel 解析后的字典列表

    Returns:
        归一化后的测试用例字典列表
    """
    if not rows:
        return []

    rebuilt_rows = _rebuild_rows_from_embedded_headers(rows)
    normalized_rows: list[dict[str, str]] = []

    for row in rebuilt_rows:
        normalized_row = {field: "" for field in TEST_CASE_FIELD_ALIASES}

        for key, value in row.items():
            field_name = TEST_CASE_ALIAS_TO_FIELD.get(_normalize_header_key(key))
            if not field_name:
                continue

            normalized_row[field_name] = _clean_text(value)

        if not any(normalized_row.values()):
            continue

        normalized_row["search_text"] = " ".join(
            value
            for key, value in normalized_row.items()
            if key != "search_text" and value
        ).strip()
        normalized_rows.append(normalized_row)

    return normalized_rows


def parse_test_cases(rows: list[dict]) -> list[TestCase]:
    """
    解析测试用例数据。

    Args:
        rows: CSV/Excel解析后的字典列表

    Returns:
        TestCase 列表
    """
    cases = []
    for row in normalize_test_case_rows(rows):
        test_id = row["test_id"]
        func = row["test_function"]
        steps = row["test_steps"]
        expected = row["expected_result"]

        if test_id and func:
            cases.append(TestCase(
                test_id=test_id,
                test_function=func,
                test_steps=steps,
                expected_result=expected,
                flow_name=row["flow_name"],
                module_path=row["module_path"],
                preconditions=row["preconditions"],
                check_type=row["check_type"],
                test_type=row["test_type"],
                case_level=row["case_level"],
                case_type=row["case_type"],
                priority=row["priority"],
                search_text=row["search_text"],
            ))

    return cases


def analyze_coverage(
    changed_methods: list[dict],
    mapping_entries: list[MappingEntry],
    test_cases: list[TestCase],
) -> CoverageResult:
    """
    分析测试覆盖情况。

    将代码改动涉及的方法与映射关系匹配，再与测试用例进行覆盖比对。

    Args:
        changed_methods: 变更的方法列表，每个元素为 dict 包含
                         package_name, class_name, method_name
        mapping_entries: 映射关系条目列表
        test_cases: 测试用例列表

    Returns:
        CoverageResult 包含覆盖分析详情
    """
    if not changed_methods:
        return CoverageResult(error="没有检测到代码改动")

    # 建立映射关系索引：method全名 -> 功能描述
    mapping_index: dict[str, str] = {}
    for entry in mapping_entries:
        key = entry.full_qualified_name
        mapping_index[key] = entry.description

    covered = []
    uncovered = []
    details = []

    for method in changed_methods:
        pkg = method.get("package_name", "")
        cls = method.get("class_name", "")
        mtd = method.get("method_name", "")
        full_name = f"{pkg}.{cls}.{mtd}"

        # 在映射关系中查找功能描述
        description = mapping_index.get(full_name, "")

        # 判断是否被测试用例覆盖
        is_covered = False
        matched_tests = []

        if description:
            for tc in test_cases:
                if _is_test_case_covering_description(description, tc):
                    is_covered = True
                    matched_tests.append(tc.test_id)

        if is_covered:
            covered.append(full_name)
        else:
            uncovered.append(full_name)

        details.append({
            "method": full_name,
            "description": description or "无映射描述",
            "is_covered": is_covered,
            "matched_tests": matched_tests,
        })

    total = len(changed_methods)
    coverage_rate = len(covered) / total if total > 0 else 0.0

    return CoverageResult(
        total_changed_methods=total,
        covered_methods=covered,
        uncovered_methods=uncovered,
        coverage_rate=round(coverage_rate, 4),
        coverage_details=details,
    )


def _normalize_header_key(value: object) -> str:
    return re.sub(r"[\s\W_]+", "", _clean_text(value), flags=re.UNICODE).lower()


def _clean_text(value: object) -> str:
    return str(value or "").replace("\xa0", " ").strip()


def _rebuild_rows_from_embedded_headers(rows: list[dict]) -> list[dict]:
    if not rows:
        return rows

    first_row = rows[0]
    candidate_headers = [_clean_text(value) for value in first_row.values()]
    recognized_fields = {
        TEST_CASE_ALIAS_TO_FIELD.get(_normalize_header_key(value))
        for value in candidate_headers
        if value
    }
    recognized_fields.discard(None)

    if len(TEST_CASE_REQUIRED_FIELDS & recognized_fields) < 3 or "test_id" not in recognized_fields:
        return rows

    rebuilt_rows: list[dict] = []
    raw_headers = [_clean_text(value) for value in first_row.values()]

    for row in rows[1:]:
        row_values = [_clean_text(value) for value in row.values()]
        rebuilt_row = {
            header: row_values[index]
            for index, header in enumerate(raw_headers)
            if header and index < len(row_values)
        }
        if any(rebuilt_row.values()):
            rebuilt_rows.append(rebuilt_row)

    return rebuilt_rows


def _normalize_match_text(value: str) -> str:
    text = _clean_text(value).lower()
    text = re.sub(r"(-->|->|=>|＞|→|/|\\\\|_|-)", " ", text)
    text = re.sub(r"[【】\[\]（）(){}<>《》“”\"'‘’,:：;；，。！？!?\r\n\t]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_description_phrases(description: str) -> list[str]:
    normalized = _normalize_match_text(description)
    if not normalized:
        return []

    phrases: list[str] = []
    seen: set[str] = set()
    for token in normalized.split():
        _append_phrase(phrases, seen, token)

        for split_token in re.split(r"(?:并|以及|及|和|与|或|的)", token):
            _append_phrase(phrases, seen, split_token)

        for suffix in TEST_CASE_GENERIC_SUFFIXES:
            if token.endswith(suffix):
                _append_phrase(phrases, seen, token[: -len(suffix)])

    return phrases


def _append_phrase(phrases: list[str], seen: set[str], value: str) -> None:
    phrase = value.strip()
    if len(phrase) < 2 or phrase in TEST_CASE_PHRASE_STOP_WORDS or phrase in seen:
        return

    seen.add(phrase)
    phrases.append(phrase)


def _is_test_case_covering_description(description: str, test_case: TestCase) -> bool:
    normalized_description = _normalize_match_text(description)
    if not normalized_description:
        return False

    match_texts = {
        field_name: _normalize_match_text(getattr(test_case, field_name, ""))
        for field_name in TEST_CASE_MATCH_FIELD_WEIGHTS
    }

    if any(
        normalized_description and normalized_description in text
        for field_name, text in match_texts.items()
        if TEST_CASE_MATCH_FIELD_WEIGHTS[field_name] >= 2 and text
    ):
        return True

    score = 0
    hit_count = 0
    phrases = _extract_description_phrases(description)
    if not phrases:
        return False

    for phrase in phrases:
        matched = False
        for field_name, weight in TEST_CASE_MATCH_FIELD_WEIGHTS.items():
            field_text = match_texts[field_name]
            if field_text and phrase in field_text:
                score += weight
                hit_count += 1
                matched = True
                break
        if matched and hit_count >= 2 and score >= 4:
            return True

    return False

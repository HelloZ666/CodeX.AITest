"""
test_coverage_analyzer.py - 覆盖分析模块测试
"""

import pytest

from services.coverage_analyzer import (
    parse_mapping_data,
    parse_test_cases,
    analyze_coverage,
    normalize_test_case_rows,
)


def build_real_template_rows() -> list[dict]:
    headers = [
        "用例编号",
        "流程名称",
        "功能模块路径",
        "用例描述",
        "预置条件",
        "测试步骤",
        "预期结果",
        "检查点类型",
        "测试类型",
        "用例等级",
        "用例类型",
        "用例优先级",
    ]
    instruction_keys = [f"说明{index}" for index in range(len(headers))]
    rows = [
        dict(zip(instruction_keys, headers)),
        dict(zip(instruction_keys, [
            "case001",
            "投保流程_001",
            "寿险投保平台-->A端投保-->投保流程",
            "明白纸单证抄录内容变更的预期结果:跟模板内容一致",
            "系统已更新",
            "1、【山东济宁分支】\n2、【明白纸单证抄录内容变更】",
            "1、【山东济宁分支】符合操作预期\n2、跟模板内容一致",
            "数据核对",
            "APP功能测试",
            "一般",
            "正向",
            "P2",
        ])),
        dict(zip(instruction_keys, [
            "case002",
            "投保流程_002",
            "寿险投保平台-->A端投保-->投保流程",
            "明白纸单证模板更新的预期结果:跟模板内容一致",
            "系统已更新",
            "1、【山东济宁分支】\n2、【明白纸单证模板更新】",
            "1、【山东济宁分支】符合操作预期\n2、跟模板内容一致",
            "数据核对",
            "APP功能测试",
            "核心",
            "正向",
            "P0",
        ])),
        dict(zip(instruction_keys, [
            "case003",
            "投保流程_003",
            "寿险投保平台-->A端投保-->投保流程",
            "联调系统的预期结果：不涉及",
            "系统已更新",
            "1、【联调系统】",
            "1、不涉及",
            "数据核对",
            "APP功能测试",
            "一般",
            "正向",
            "P2",
        ])),
        dict(zip(instruction_keys, [
            "case004",
            "投保流程_004",
            "寿险投保平台-->A端投保-->投保流程",
            "【特殊数据】：明白纸单证模板的预期结果:不更新与原来一致",
            "系统已更新",
            "1、【山东其他分支】\n2、【产品特殊规则：明白纸单证模板】",
            "1、【山东其他分支】符合操作预期\n2、不更新与原来一致",
            "数据核对",
            "APP功能测试",
            "一般",
            "反向",
            "P3",
        ])),
        dict(zip(instruction_keys, [
            "case005",
            "投保流程_005",
            "寿险投保平台-->A端投保-->投保流程",
            "【特殊数据】：明白纸单证抄录内容的预期结果:不更新与原来一致",
            "系统已更新",
            "1、【山东其他分支】\n2、【明白纸单证抄录内容】",
            "1、【山东其他分支】符合操作预期\n2、不更新与原来一致",
            "数据核对",
            "APP功能测试",
            "一般",
            "反向",
            "P3",
        ])),
    ]
    return rows


class TestParseMappingData:
    """测试映射关系解析"""

    def test_parse_chinese_headers(self, sample_mapping_rows):
        entries = parse_mapping_data(sample_mapping_rows)
        assert len(entries) == 4
        assert entries[0].package_name == "com.example.user"
        assert entries[0].class_name == "UserService"
        assert entries[0].method_name == "createUser"
        assert entries[0].description == "创建用户"

    def test_parse_english_headers(self):
        rows = [
            {"package_name": "com.example", "class_name": "Svc", "method_name": "run", "description": "Run"}
        ]
        entries = parse_mapping_data(rows)
        assert len(entries) == 1
        assert entries[0].method_name == "run"

    def test_parse_empty_rows(self):
        entries = parse_mapping_data([])
        assert entries == []

    def test_skip_incomplete_rows(self):
        rows = [
            {"包名": "com.example", "类名": "", "方法名": "run", "功能描述": "Run"},
            {"包名": "com.example", "类名": "Svc", "方法名": "run", "功能描述": "Run"},
        ]
        entries = parse_mapping_data(rows)
        assert len(entries) == 1  # 第一行类名为空，跳过

    def test_full_qualified_name(self, sample_mapping_rows):
        entries = parse_mapping_data(sample_mapping_rows)
        assert entries[0].full_qualified_name == "com.example.user.UserService.createUser"


class TestParseTestCases:
    """测试用例解析"""

    def test_parse_chinese_headers(self, sample_test_case_rows):
        cases = parse_test_cases(sample_test_case_rows)
        assert len(cases) == 3
        assert cases[0].test_id == "TC001"
        assert cases[0].test_function == "创建用户"

    def test_parse_empty(self):
        cases = parse_test_cases([])
        assert cases == []

    def test_skip_no_id(self):
        rows = [{"测试用例ID": "", "测试功能": "test", "测试步骤": "", "预期结果": ""}]
        cases = parse_test_cases(rows)
        assert len(cases) == 0

    def test_normalize_real_template_embedded_headers(self):
        normalized_rows = normalize_test_case_rows(build_real_template_rows())

        assert len(normalized_rows) == 5
        assert [row["test_id"] for row in normalized_rows] == [
            "case001",
            "case002",
            "case003",
            "case004",
            "case005",
        ]
        assert normalized_rows[0]["test_function"] == "明白纸单证抄录内容变更的预期结果:跟模板内容一致"
        assert normalized_rows[0]["flow_name"] == "投保流程_001"
        assert normalized_rows[0]["module_path"] == "寿险投保平台-->A端投保-->投保流程"
        assert normalized_rows[3]["case_type"] == "反向"
        assert normalized_rows[3]["priority"] == "P3"

    def test_parse_real_template_rows(self):
        cases = parse_test_cases(build_real_template_rows())

        assert len(cases) == 5
        assert cases[0].test_id == "case001"
        assert cases[0].flow_name == "投保流程_001"
        assert cases[0].module_path == "寿险投保平台-->A端投保-->投保流程"
        assert cases[0].search_text
        assert cases[3].case_type == "反向"


class TestAnalyzeCoverage:
    """测试覆盖分析"""

    def test_full_coverage(self, sample_mapping_rows, sample_test_case_rows):
        mapping = parse_mapping_data(sample_mapping_rows)
        tests = parse_test_cases(sample_test_case_rows)

        changed = [
            {"package_name": "com.example.user", "class_name": "UserService", "method_name": "createUser"},
            {"package_name": "com.example.user", "class_name": "UserService", "method_name": "updateUser"},
        ]

        result = analyze_coverage(changed, mapping, tests)
        assert result.total_changed_methods == 2
        assert len(result.covered_methods) == 2
        assert len(result.uncovered_methods) == 0
        assert result.coverage_rate == 1.0

    def test_partial_coverage(self, sample_mapping_rows, sample_test_case_rows):
        mapping = parse_mapping_data(sample_mapping_rows)
        tests = parse_test_cases(sample_test_case_rows)

        changed = [
            {"package_name": "com.example.user", "class_name": "UserService", "method_name": "createUser"},
            {"package_name": "com.example.user", "class_name": "UserService", "method_name": "deleteUser"},
        ]

        result = analyze_coverage(changed, mapping, tests)
        assert result.total_changed_methods == 2
        assert len(result.uncovered_methods) >= 1
        assert result.coverage_rate < 1.0

    def test_no_changes(self, sample_mapping_rows, sample_test_case_rows):
        mapping = parse_mapping_data(sample_mapping_rows)
        tests = parse_test_cases(sample_test_case_rows)
        result = analyze_coverage([], mapping, tests)
        assert result.error == "没有检测到代码改动"

    def test_no_mapping(self, sample_test_case_rows):
        tests = parse_test_cases(sample_test_case_rows)
        changed = [
            {"package_name": "com.example.unknown", "class_name": "Svc", "method_name": "foo"},
        ]
        result = analyze_coverage(changed, [], tests)
        assert result.total_changed_methods == 1
        assert len(result.uncovered_methods) == 1

    def test_coverage_details(self, sample_mapping_rows, sample_test_case_rows):
        mapping = parse_mapping_data(sample_mapping_rows)
        tests = parse_test_cases(sample_test_case_rows)

        changed = [
            {"package_name": "com.example.user", "class_name": "UserService", "method_name": "createUser"},
        ]

        result = analyze_coverage(changed, mapping, tests)
        assert len(result.coverage_details) == 1
        assert result.coverage_details[0]["method"] == "com.example.user.UserService.createUser"
        assert result.coverage_details[0]["is_covered"] is True

    def test_matches_real_template_without_test_function_column(self):
        mapping = [
            {
                "包名": "com.example.paper",
                "类名": "PaperService",
                "方法名": "updateTranscript",
                "功能描述": "明白纸单证抄录内容变更",
            },
            {
                "包名": "com.example.paper",
                "类名": "PaperService",
                "方法名": "updateTemplate",
                "功能描述": "明白纸单证模板更新",
            },
        ]
        tests = parse_test_cases(build_real_template_rows())
        changed = [
            {"package_name": "com.example.paper", "class_name": "PaperService", "method_name": "updateTranscript"},
            {"package_name": "com.example.paper", "class_name": "PaperService", "method_name": "updateTemplate"},
        ]

        result = analyze_coverage(changed, parse_mapping_data(mapping), tests)

        assert result.coverage_rate == 1.0
        assert result.coverage_details[0]["matched_tests"] == ["case001"]
        assert result.coverage_details[1]["matched_tests"] == ["case002"]

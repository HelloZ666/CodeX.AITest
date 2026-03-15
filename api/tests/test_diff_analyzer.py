"""
test_diff_analyzer.py - diff分析模块测试
"""

import json
import pytest

from services.diff_analyzer import (
    parse_code_changes,
    extract_package_path,
    compute_diff,
    analyze_code_changes,
    format_diff_summary,
)


class TestParseCodeChanges:
    """测试JSON解析"""

    def test_parse_valid_json(self, sample_code_changes_json):
        result = parse_code_changes(sample_code_changes_json)
        assert "current" in result
        assert "history" in result
        assert len(result["current"]) == 2
        assert len(result["history"]) == 2

    def test_parse_nested_format(self):
        data = json.dumps({
            "success": True,
            "data": {
                "current": ["code1"],
                "history": ["code2"]
            }
        })
        result = parse_code_changes(data)
        assert result["current"] == ["code1"]

    def test_parse_flat_format(self):
        data = json.dumps({
            "current": ["code1"],
            "history": ["code2"]
        })
        result = parse_code_changes(data)
        assert result["current"] == ["code1"]

    def test_parse_line_array_format(self):
        data = json.dumps({
            "current": [["package com.example;", "", "public class A {}"]],
            "history": [["package com.example;", "", "public class B {}"]],
        })
        result = parse_code_changes(data)
        assert result["current"] == ["package com.example;\n\npublic class A {}"]
        assert result["history"] == ["package com.example;\n\npublic class B {}"]

    def test_parse_flat_line_sequence_format(self):
        data = json.dumps({
            "current": ["package com.example;", "", "public class A {}"],
            "history": ["package com.example;", "", "public class B {}"],
        })
        result = parse_code_changes(data)
        assert result["current"] == ["package com.example;\n\npublic class A {}"]
        assert result["history"] == ["package com.example;\n\npublic class B {}"]

    def test_parse_invalid_json(self):
        with pytest.raises(ValueError, match="JSON解析失败"):
            parse_code_changes("not valid json {")

    def test_parse_missing_fields(self):
        with pytest.raises(ValueError, match="必须包含"):
            parse_code_changes(json.dumps({"foo": "bar"}))

    def test_parse_non_array_fields(self):
        with pytest.raises(ValueError, match="必须是数组"):
            parse_code_changes(json.dumps({"current": "string", "history": "string"}))

    def test_parse_non_object_root(self):
        with pytest.raises(ValueError, match="必须是对象"):
            parse_code_changes(json.dumps([1, 2, 3]))

    def test_parse_invalid_line_array_item_type(self):
        with pytest.raises(ValueError, match="数组项必须全部为字符串"):
            parse_code_changes(json.dumps({"current": [["ok", 1]], "history": [["ok"]]}))


class TestExtractPackagePath:
    """测试包路径提取"""

    def test_extract_normal_package(self):
        code = "package com.example.user;\n\npublic class Test {}"
        assert extract_package_path(code) == "com.example.user"

    def test_extract_with_spaces(self):
        code = "  package  com.example.user ;\npublic class Test {}"
        assert extract_package_path(code) == "com.example.user"

    def test_no_package(self):
        code = "public class Test {}"
        assert extract_package_path(code) == "unknown"

    def test_empty_code(self):
        assert extract_package_path("") == "unknown"


class TestComputeDiff:
    """测试差异计算"""

    def test_identical_code(self):
        code = "package com.example;\npublic class A {}"
        result = compute_diff(code, code)
        assert result.added_lines == []
        assert result.removed_lines == []

    def test_added_lines(self):
        old = "package com.example;\nline1\n"
        new = "package com.example;\nline1\nline2\n"
        result = compute_diff(new, old)
        assert len(result.added_lines) > 0
        assert result.package_path == "com.example"

    def test_removed_lines(self):
        old = "package com.example;\nline1\nline2\n"
        new = "package com.example;\nline1\n"
        result = compute_diff(new, old)
        assert len(result.removed_lines) > 0

    def test_modified_lines(self):
        old = "package com.example;\nold line\n"
        new = "package com.example;\nnew line\n"
        result = compute_diff(new, old)
        assert len(result.added_lines) > 0
        assert len(result.removed_lines) > 0


class TestAnalyzeCodeChanges:
    """测试完整分析流程"""

    def test_analyze_sample(self, sample_code_changes_json):
        result = analyze_code_changes(sample_code_changes_json)
        assert result.error is None
        assert len(result.diffs) == 2
        assert result.total_added > 0

    def test_analyze_invalid_json(self):
        result = analyze_code_changes("invalid json")
        assert result.error is not None

    def test_analyze_empty_arrays(self):
        data = json.dumps({"current": [], "history": []})
        result = analyze_code_changes(data)
        assert result.error is None
        assert len(result.diffs) == 0

    def test_analyze_uneven_arrays(self):
        data = json.dumps({
            "current": ["package a;\ncode1\n", "package b;\ncode2\n"],
            "history": ["package a;\nold1\n"]
        })
        result = analyze_code_changes(data)
        assert result.error is None
        assert len(result.diffs) == 2

    def test_analyze_line_array_format(self):
        data = json.dumps({
            "current": [["package com.example;", "line1", "line2"]],
            "history": [["package com.example;", "line1"]],
        })
        result = analyze_code_changes(data)
        assert result.error is None
        assert result.total_added == 2

    def test_analyze_flat_line_sequence_format(self):
        data = json.dumps({
            "current": ["package com.example;", "", "public class A {", "    void test() {}", "}"],
            "history": ["package com.example;", "", "public class A {", "}"],
        })
        result = analyze_code_changes(data)
        assert result.error is None
        assert len(result.diffs) == 1
        assert result.diffs[0].package_path == "com.example"


class TestFormatDiffSummary:
    """测试摘要格式化"""

    def test_format_normal(self, sample_code_changes_json):
        result = analyze_code_changes(sample_code_changes_json)
        summary = format_diff_summary(result)
        assert "共检测到" in summary
        assert "总新增" in summary

    def test_format_error(self):
        from services.diff_analyzer import AnalysisResult
        result = AnalysisResult(error="测试错误")
        summary = format_diff_summary(result)
        assert "分析错误" in summary

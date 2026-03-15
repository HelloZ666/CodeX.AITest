"""
diff_analyzer.py - 代码差异分析模块

解析代码改动JSON文件，使用difflib进行行级精确diff对比，
提取current和history之间的差异。
"""

import difflib
import json
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class DiffResult:
    """单个代码文件的diff结果"""
    package_path: str          # 包路径（从代码中提取）
    added_lines: list[str] = field(default_factory=list)    # 新增行
    removed_lines: list[str] = field(default_factory=list)  # 删除行
    changed_lines: list[str] = field(default_factory=list)  # 变更行（unified diff格式）


@dataclass
class AnalysisResult:
    """完整的差异分析结果"""
    diffs: list[DiffResult] = field(default_factory=list)
    total_added: int = 0
    total_removed: int = 0
    error: Optional[str] = None


def coerce_flat_line_array_to_single_file(entries: list) -> list:
    """
    兼容误传格式：把“单文件逐行数组”误放到顶层时自动折叠为一个文件。

    正确格式应为：
    - ["完整代码字符串"]
    - [["逐行1", "逐行2", ...]]

    误传格式示例：
    - ["逐行1", "逐行2", ...]
    """
    if len(entries) <= 1 or not all(isinstance(item, str) for item in entries):
        return entries

    if any("\n" in item or "\r" in item for item in entries):
        return entries

    blank_lines = sum(1 for item in entries if item == "")
    code_like_lines = sum(
        1
        for item in entries
        if item.strip().startswith(
            (
                "package ",
                "import ",
                "public ",
                "private ",
                "protected ",
                "class ",
                "interface ",
                "enum ",
                "@",
            )
        )
    )

    if blank_lines > 0 and code_like_lines > 0:
        return [entries]

    return entries


def normalize_code_block(block: str | list[str], field_name: str, index: int) -> str:
    """
    将单个代码块规范化为字符串。

    兼容两种输入格式：
    1. 单个字符串，内部通过换行符分隔代码
    2. 字符串数组，每个元素代表一行代码
    """
    if isinstance(block, str):
        return block

    if isinstance(block, list):
        if any(not isinstance(line, str) for line in block):
            raise ValueError(f"'{field_name}[{index}]' 的数组项必须全部为字符串")
        return "\n".join(block)

    raise ValueError(f"'{field_name}[{index}]' 必须是字符串或字符串数组")


def normalize_code_changes_payload(data: dict) -> dict:
    """将代码改动载荷规范化为 current/history 字符串数组。"""
    if "current" not in data or "history" not in data:
        raise ValueError("JSON必须包含 'current' 和 'history' 字段")

    current = data["current"]
    history = data["history"]

    if not isinstance(current, list) or not isinstance(history, list):
        raise ValueError("'current' 和 'history' 必须是数组")

    current = coerce_flat_line_array_to_single_file(current)
    history = coerce_flat_line_array_to_single_file(history)

    return {
        "current": [normalize_code_block(item, "current", index) for index, item in enumerate(current)],
        "history": [normalize_code_block(item, "history", index) for index, item in enumerate(history)],
    }


def parse_code_changes(json_content: str) -> dict:
    """
    解析代码改动JSON文件。

    Args:
        json_content: JSON文件内容字符串

    Returns:
        解析后的字典，包含 current 和 history 列表

    Raises:
        ValueError: JSON格式不正确或缺少必要字段
    """
    try:
        data = json.loads(json_content)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON解析失败: {e}")

    if not isinstance(data, dict):
        raise ValueError("JSON根元素必须是对象")

    # 支持直接格式和嵌套格式
    if "data" in data:
        inner = data["data"]
    else:
        inner = data

    return normalize_code_changes_payload(inner)


def extract_package_path(code: str) -> str:
    """
    从Java代码中提取包路径。

    Args:
        code: Java源代码字符串

    Returns:
        包路径字符串，如果未找到返回 "unknown"
    """
    for line in code.split("\n"):
        stripped = line.strip()
        if stripped.startswith("package "):
            # 提取 package xxx.yyy.zzz; 中的路径
            path = stripped[len("package "):].rstrip(";").strip()
            if path:
                return path
    return "unknown"


def compute_diff(current_code: str, history_code: str) -> DiffResult:
    """
    计算两段代码之间的行级差异。

    Args:
        current_code: 当前版本代码
        history_code: 历史版本代码

    Returns:
        DiffResult 包含差异详情
    """
    package_path = extract_package_path(current_code)

    current_lines = current_code.splitlines(keepends=True)
    history_lines = history_code.splitlines(keepends=True)

    added = []
    removed = []
    changed = []

    # 使用 unified_diff 获取详细差异
    diff = list(difflib.unified_diff(
        history_lines,
        current_lines,
        fromfile="history",
        tofile="current",
        lineterm=""
    ))

    for line in diff:
        if line.startswith("+++") or line.startswith("---") or line.startswith("@@"):
            changed.append(line)
        elif line.startswith("+"):
            added.append(line[1:])
            changed.append(line)
        elif line.startswith("-"):
            removed.append(line[1:])
            changed.append(line)

    return DiffResult(
        package_path=package_path,
        added_lines=added,
        removed_lines=removed,
        changed_lines=changed,
    )


def analyze_code_changes(json_content: str) -> AnalysisResult:
    """
    分析代码改动JSON文件，返回完整的差异分析结果。

    Args:
        json_content: 代码改动JSON文件内容

    Returns:
        AnalysisResult 包含所有文件的diff结果
    """
    try:
        parsed = parse_code_changes(json_content)
    except ValueError as e:
        return AnalysisResult(error=str(e))

    current_list = parsed["current"]
    history_list = parsed["history"]

    diffs = []
    total_added = 0
    total_removed = 0

    # 逐对比较 current 和 history
    max_len = max(len(current_list), len(history_list))
    for i in range(max_len):
        current_code = current_list[i] if i < len(current_list) else ""
        history_code = history_list[i] if i < len(history_list) else ""

        diff_result = compute_diff(current_code, history_code)
        diffs.append(diff_result)
        total_added += len(diff_result.added_lines)
        total_removed += len(diff_result.removed_lines)

    return AnalysisResult(
        diffs=diffs,
        total_added=total_added,
        total_removed=total_removed,
    )


def format_diff_summary(result: AnalysisResult) -> str:
    """
    将分析结果格式化为文本摘要，用于发送给大模型。

    Args:
        result: 差异分析结果

    Returns:
        格式化的差异摘要文本
    """
    if result.error:
        return f"分析错误: {result.error}"

    lines = []
    lines.append(f"共检测到 {len(result.diffs)} 个代码文件变更")
    lines.append(f"总新增 {result.total_added} 行，总删除 {result.total_removed} 行")
    lines.append("")

    for i, diff in enumerate(result.diffs, 1):
        lines.append(f"### 文件 {i}: {diff.package_path}")
        lines.append(f"  新增 {len(diff.added_lines)} 行, 删除 {len(diff.removed_lines)} 行")

        if diff.added_lines:
            lines.append("  新增内容:")
            for line in diff.added_lines[:10]:  # 限制行数避免过长
                lines.append(f"    + {line.rstrip()}")
            if len(diff.added_lines) > 10:
                lines.append(f"    ... 还有 {len(diff.added_lines) - 10} 行")

        if diff.removed_lines:
            lines.append("  删除内容:")
            for line in diff.removed_lines[:10]:
                lines.append(f"    - {line.rstrip()}")
            if len(diff.removed_lines) > 10:
                lines.append(f"    ... 还有 {len(diff.removed_lines) - 10} 行")

        lines.append("")

    return "\n".join(lines)

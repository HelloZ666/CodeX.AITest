"""
requirement_analysis.py - 需求分析规则引擎

将需求文档需求点与生产问题、测试问题明细进行可解释命中。
"""

from __future__ import annotations

from collections import OrderedDict
import re
import unicodedata


PRODUCTION_MATCH_FIELDS = [
    "出现该问题的原因",
    "发生原因总结",
    "标签",
    "改善举措",
    "发生阶段",
]

TEST_MATCH_FIELDS = [
    "缺陷摘要",
    "业务影响",
    "缺陷来源",
    "缺陷原因",
    "缺陷子原因",
    "功能模块",
    "测试项",
]

GENERIC_TERMS = {
    "功能",
    "页面",
    "界面",
    "需求",
    "系统",
    "支持",
    "展示",
    "列表",
    "详情",
    "用户",
    "模块",
    "管理",
    "信息",
}

WEAK_MATCH_TERMS = {
    "点击",
    "单击",
    "双击",
    "按钮",
    "按键",
    "图标",
    "链接",
    "菜单",
    "页签",
    "标签页",
    "弹窗",
    "弹框",
    "弹层",
    "页面",
    "界面",
    "列表",
    "详情",
    "表格",
    "卡片",
    "字段",
    "文案",
    "提示",
    "标题",
    "文本",
    "内容",
    "数字",
    "字符",
    "编码",
    "编号",
    "序号",
    "日期",
    "时间",
    "状态",
    "默认",
    "默认值",
    "下拉",
    "下拉框",
    "输入",
    "输入框",
    "复选框",
    "单选框",
    "开关",
    "切换",
    "展示",
    "显示",
    "隐藏",
    "跳转",
    "返回",
    "打开",
    "关闭",
    "新增",
    "新建",
    "编辑",
    "修改",
    "删除",
    "查询",
    "搜索",
    "提交",
    "保存",
    "取消",
    "上传",
    "下载",
    "导入",
    "导出",
    "查看",
    "不可编辑",
    "可编辑",
    "不可点击",
    "可点击",
    "不可修改",
    "可修改",
    "不可删除",
    "可删除",
    "不可见",
    "可见",
    "只读",
    "置灰",
    "禁用",
    "启用",
}

RISK_SIGNAL_TERMS = {
    "异常",
    "失败",
    "错误",
    "缺失",
    "遗漏",
    "漏",
    "错",
    "未",
    "无",
    "超时",
    "重复",
    "越权",
    "串户",
    "串单",
    "错账",
    "丢单",
    "误删",
    "误发",
    "绕过",
    "死锁",
    "并发",
    "幂等",
    "黑屏",
    "白屏",
    "闪退",
    "卡死",
    "脏读",
    "脏写",
    "中断",
    "阻塞",
    "错乱",
}

SPLIT_RE = re.compile(r"[\s,，。；;、/|：:（）()\[\]【】]+")
NON_WORD_RE = re.compile(r"[^0-9a-z\u4e00-\u9fff]+")
PURE_NUMBER_RE = re.compile(r"^\d+(?:\.\d+)?$")
VERSION_LIKE_RE = re.compile(r"^v?\d+(?:\.\d+){0,3}$")
ASCII_ONLY_RE = re.compile(r"^[a-z]+$")

DEFAULT_NUMERIC_IGNORE_KEYWORD = "阿拉伯数字"
MAPPING_SEPARATOR_RE = re.compile(r"(?:的|及|与|和|或|并且|并|以及)")
MAPPING_SUFFIX_TERMS = ("测试", "校验", "核对", "相关性", "相关")
MAPPING_GENERIC_PARTS = {
    "页面",
    "弹窗",
    "功能",
    "场景",
    "内容",
    "流程",
    "操作",
    "变更",
    "新增",
    "修改",
    "删除",
    "查看",
    "提示",
    "文案",
    "测试",
    "校验",
    "核对",
    "相关",
    "相关性",
}


def _normalize_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, (list, tuple, set)):
        value = " ".join(str(item) for item in value if str(item).strip())
    text = unicodedata.normalize("NFKC", str(value)).strip().lower()
    return re.sub(r"\s+", " ", text)


def _dense_text(value: object) -> str:
    return NON_WORD_RE.sub("", _normalize_text(value))


def get_builtin_ignore_keywords() -> list[str]:
    return sorted(WEAK_MATCH_TERMS | GENERIC_TERMS | {DEFAULT_NUMERIC_IGNORE_KEYWORD})


WEAK_COMPONENT_TERMS = tuple(sorted(get_builtin_ignore_keywords(), key=len, reverse=True))


def build_requirement_rule_config(custom_rules: list[dict] | None = None) -> dict[str, object]:
    ignore_keywords: set[str] = set()
    allow_keywords: set[str] = set()

    for rule in custom_rules or []:
        rule_type = str(rule.get("rule_type") or "").strip().lower()
        keyword = _dense_text(rule.get("keyword"))
        if not keyword:
            continue

        if rule_type == "ignore":
            ignore_keywords.add(keyword)
            allow_keywords.discard(keyword)
        elif rule_type == "allow":
            allow_keywords.add(keyword)
            ignore_keywords.discard(keyword)

    return {
        "ignore_keywords": ignore_keywords,
        "allow_keywords": allow_keywords,
        "weak_components": tuple(sorted(ignore_keywords, key=len, reverse=True)),
    }


DEFAULT_RULE_CONFIG = build_requirement_rule_config()


def _clip_text(value: object, limit: int = 80) -> str:
    if isinstance(value, (list, tuple, set)):
        value = "、".join(str(item) for item in value if str(item).strip())
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}..."


def _contains_risk_signal(value: str) -> bool:
    return any(term in value for term in RISK_SIGNAL_TERMS)


def _strip_weak_components(value: str, weak_components: tuple[str, ...]) -> str:
    cleaned = value
    previous = None
    while cleaned != previous:
        previous = cleaned
        for term in weak_components:
            cleaned = cleaned.replace(term, "")
    return cleaned


def _is_weak_keyword(keyword: str, rule_config: dict[str, object] | None = None) -> bool:
    dense_keyword = _dense_text(keyword)
    if not dense_keyword:
        return True

    resolved_rule_config = rule_config or DEFAULT_RULE_CONFIG
    ignore_keywords = resolved_rule_config.get("ignore_keywords", set())
    allow_keywords = resolved_rule_config.get("allow_keywords", set())
    weak_components = resolved_rule_config.get("weak_components", WEAK_COMPONENT_TERMS)

    if isinstance(allow_keywords, set) and dense_keyword in allow_keywords:
        return False

    if PURE_NUMBER_RE.match(dense_keyword) or VERSION_LIKE_RE.match(dense_keyword):
        return True

    if isinstance(ignore_keywords, set) and dense_keyword in ignore_keywords:
        return True

    if ASCII_ONLY_RE.match(dense_keyword) and len(dense_keyword) <= 4:
        return True

    if len(dense_keyword) <= 1:
        return True

    if len(dense_keyword) <= 3 and not _contains_risk_signal(dense_keyword):
        return True

    stripped_keyword = _strip_weak_components(
        dense_keyword,
        weak_components if isinstance(weak_components, tuple) else tuple(),
    )
    if not stripped_keyword:
        return True

    if len(stripped_keyword) <= 2 and not _contains_risk_signal(stripped_keyword):
        return True

    return False


def _extract_candidate_keywords(value: object, rule_config: dict[str, object] | None = None) -> list[str]:
    raw = _normalize_text(value)
    if not raw:
        return []

    resolved_rule_config = rule_config or DEFAULT_RULE_CONFIG
    phrases: list[str] = []
    for part in SPLIT_RE.split(raw):
        part = part.strip()
        if part:
            phrases.append(part)

    if raw not in phrases and len(raw) <= 40:
        phrases.append(raw)

    keywords: list[str] = []
    for phrase in phrases:
        dense = _dense_text(phrase)
        if not dense:
            continue

        if len(dense) >= 4 and not _is_weak_keyword(phrase, resolved_rule_config):
            keywords.append(phrase)
        elif len(dense) in (2, 3) and not _is_weak_keyword(phrase, resolved_rule_config):
            keywords.append(phrase)

        fragments = re.findall(r"[a-z0-9]+|[\u4e00-\u9fff]{2,}", dense)
        for fragment in fragments:
            if len(fragment) >= 4 or len(fragment) in (2, 3):
                if _is_weak_keyword(fragment, resolved_rule_config):
                    continue
                keywords.append(fragment)

    unique_keywords: list[str] = []
    for keyword in sorted(keywords, key=lambda item: (-len(_dense_text(item)), item)):
        dense_keyword = _dense_text(keyword)
        if not dense_keyword:
            continue
        if _is_weak_keyword(keyword, resolved_rule_config):
            continue
        if all(dense_keyword not in _dense_text(existing) for existing in unique_keywords):
            unique_keywords.append(keyword)

    return unique_keywords


def _build_excerpt(text: str, keyword: str) -> str:
    if not text:
        return ""

    index = text.lower().find(keyword.lower())
    if index < 0:
        return _clip_text(text, 90)

    start = max(0, index - 20)
    end = min(len(text), index + len(keyword) + 20)
    excerpt = text[start:end]
    if start > 0:
        excerpt = f"...{excerpt}"
    if end < len(text):
        excerpt = f"{excerpt}..."
    return excerpt


def _match_field(requirement_text: str, field_value: object, rule_config: dict[str, object] | None = None) -> str | None:
    requirement_dense = _dense_text(requirement_text)
    if not requirement_dense:
        return None

    resolved_rule_config = rule_config or DEFAULT_RULE_CONFIG

    for keyword in _extract_candidate_keywords(field_value, resolved_rule_config):
        dense_keyword = _dense_text(keyword)
        if not dense_keyword or _is_weak_keyword(keyword, resolved_rule_config):
            continue
        if dense_keyword in requirement_dense:
            return keyword

    return None


def _unique_preserve_order(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _normalize_mapping_part(value: str) -> str:
    normalized = _dense_text(value)
    if normalized.startswith("其他") and len(normalized) > 2:
        normalized = normalized[2:]
    return normalized


def _merge_requirement_mapping_groups(mapping_groups: list[dict] | None) -> list[dict]:
    if not mapping_groups:
        return []

    merged_groups: OrderedDict[tuple[str, str], dict] = OrderedDict()
    for group in mapping_groups:
        tag = str(group.get("tag") or "").strip()
        requirement_keyword = str(group.get("requirement_keyword") or "").strip()
        related_scenarios = _unique_preserve_order(
            [
                str(item).strip()
                for item in group.get("related_scenarios", [])
                if str(item).strip()
            ]
        )
        if not tag or not requirement_keyword or not related_scenarios:
            continue

        group_key = (_dense_text(tag), _dense_text(requirement_keyword))
        existing_group = merged_groups.get(group_key)
        if existing_group is None:
            merged_groups[group_key] = {
                "id": str(group.get("id") or f"{tag}-{requirement_keyword}").strip(),
                "tag": tag,
                "requirement_keyword": requirement_keyword,
                "related_scenarios": related_scenarios,
            }
            continue

        existing_group["related_scenarios"] = _unique_preserve_order(
            [*existing_group["related_scenarios"], *related_scenarios]
        )

    return list(merged_groups.values())


def _strip_mapping_suffix(part: str) -> str:
    for suffix in MAPPING_SUFFIX_TERMS:
        if part.endswith(suffix) and len(part) - len(suffix) >= 2:
            return part[: -len(suffix)]
    return part


def _is_mapping_generic_part(part: str) -> bool:
    return not part or part in MAPPING_GENERIC_PARTS


def _build_mapping_strong_parts(target_text: str) -> list[str]:
    dense_target = _dense_text(target_text)
    if not dense_target:
        return []

    parts: list[str] = [dense_target]
    separated_parts = [
        _normalize_mapping_part(part)
        for part in MAPPING_SEPARATOR_RE.split(dense_target)
        if _normalize_mapping_part(part)
    ]
    parts.extend(separated_parts)

    for part in list(separated_parts) + [dense_target]:
        stripped_part = _strip_mapping_suffix(part)
        if stripped_part != part:
            parts.append(stripped_part)

    unique_parts = _unique_preserve_order(parts)
    return sorted(unique_parts, key=len, reverse=True)


def _build_mapping_ordered_parts(target_text: str) -> list[str]:
    dense_target = _dense_text(target_text)
    if not dense_target:
        return []

    separated_parts = []
    for raw_part in MAPPING_SEPARATOR_RE.split(dense_target):
        normalized_part = _normalize_mapping_part(raw_part)
        if not normalized_part:
            continue
        separated_parts.append(_strip_mapping_suffix(normalized_part))

    separated_parts = [part for part in separated_parts if len(part) >= 2]
    if len(separated_parts) >= 2:
        return _unique_preserve_order(separated_parts)

    if len(dense_target) == 4:
        return [dense_target[:2], dense_target[2:]]

    if len(dense_target) >= 5:
        return _unique_preserve_order([dense_target[:2], dense_target[-2:]])

    return [dense_target]


def _find_all_occurrences(text: str, part: str, start: int = 0) -> list[int]:
    if not text or not part:
        return []

    indexes: list[int] = []
    cursor = text.find(part, start)
    while cursor >= 0:
        indexes.append(cursor)
        cursor = text.find(part, cursor + 1)
    return indexes


def _find_two_anchor_span(
    text: str,
    left: str,
    right: str,
    max_span: int,
    start: int = 0,
) -> tuple[int, int] | None:
    left_indexes = _find_all_occurrences(text, left, start)
    right_indexes = _find_all_occurrences(text, right, start)
    if not left_indexes or not right_indexes:
        return None

    best_span: tuple[int, int] | None = None
    for left_index in left_indexes[:8]:
        for right_index in right_indexes[:8]:
            span_start = min(left_index, right_index)
            span_end = max(left_index + len(left), right_index + len(right))
            if span_end - span_start > max_span:
                continue
            if best_span is None or (span_end - span_start) < (best_span[1] - best_span[0]):
                best_span = (span_start, span_end)
    return best_span


def _find_mapping_part_span(text: str, part: str, start: int = 0) -> tuple[int, int] | None:
    if not text or not part:
        return None

    exact_index = text.find(part, start)
    best_span = (exact_index, exact_index + len(part)) if exact_index >= 0 else None

    if len(part) >= 4:
        max_span = len(part) + 6
        fuzzy_span = _find_two_anchor_span(
            text,
            part[:2],
            part[-2:],
            max_span=max_span,
            start=start,
        )
        if fuzzy_span and (
            best_span is None or (fuzzy_span[1] - fuzzy_span[0]) < (best_span[1] - best_span[0])
        ):
            best_span = fuzzy_span

    return best_span


def _find_ordered_mapping_parts_span(text: str, parts: list[str]) -> tuple[int, int] | None:
    cursor = 0
    first_start: int | None = None

    for part in parts:
        span = _find_mapping_part_span(text, part, start=cursor)
        if span is None:
            return None
        if first_start is None:
            first_start = span[0]
        cursor = span[1]

    if first_start is None:
        return None
    return (first_start, cursor)


def _match_requirement_mapping_term(requirement_text: str, target_text: str) -> str | None:
    requirement_dense = _dense_text(requirement_text)
    target_dense = _dense_text(target_text)
    if not requirement_dense or not target_dense:
        return None

    if target_dense in requirement_dense:
        return str(target_text).strip()

    for part in _build_mapping_strong_parts(target_text):
        if len(part) < 3 or _is_mapping_generic_part(part):
            continue
        if part in requirement_dense:
            return part

    ordered_parts = _build_mapping_ordered_parts(target_text)
    if len(ordered_parts) >= 2:
        ordered_span = _find_ordered_mapping_parts_span(requirement_dense, ordered_parts)
        max_span = max(len(target_dense) + 8, len("".join(ordered_parts)))
        if ordered_span and ordered_span[1] - ordered_span[0] <= max_span:
            return str(target_text).strip()

        any_order_span = _find_two_anchor_span(
            requirement_dense,
            ordered_parts[0],
            ordered_parts[-1],
            max_span=max_span,
        )
        if any_order_span is not None:
            return str(target_text).strip()

    return None


def _analyze_requirement_mapping_hits(requirement_text: str, mapping_groups: list[dict] | None) -> list[dict]:
    if not mapping_groups:
        return []

    group_hits: OrderedDict[str, dict] = OrderedDict()

    for group in _merge_requirement_mapping_groups(mapping_groups):
        tag = str(group.get("tag") or "").strip()
        requirement_keyword = str(group.get("requirement_keyword") or "").strip()
        related_scenarios = _unique_preserve_order(
            [
                str(item).strip()
                for item in group.get("related_scenarios", [])
                if str(item).strip()
            ]
        )
        if not tag or not requirement_keyword or not related_scenarios:
            continue

        group_id = str(group.get("id") or f"{tag}-{requirement_keyword}").strip()
        matched_requirement_keyword = _match_requirement_mapping_term(requirement_text, requirement_keyword)
        matched_scenarios = [
            scenario
            for scenario in related_scenarios
            if _match_requirement_mapping_term(requirement_text, scenario)
        ]

        if not matched_requirement_keyword and not matched_scenarios:
            continue

        unique_related_scenarios = _unique_preserve_order(related_scenarios)
        unique_matched_scenarios = _unique_preserve_order(matched_scenarios)
        additional_scenarios = [
            scenario
            for scenario in unique_related_scenarios
            if scenario not in unique_matched_scenarios
        ]

        group_hits[group_id] = {
            "group_id": group_id,
            "tag": tag,
            "requirement_keyword": requirement_keyword,
            "matched_requirement_keyword": matched_requirement_keyword,
            "matched_scenarios": unique_matched_scenarios,
            "related_scenarios": unique_related_scenarios,
            "additional_scenarios": additional_scenarios,
        }

    return list(group_hits.values())


def _build_production_alert(matches: list[dict]) -> str:
    keywords = "、".join(dict.fromkeys(match["matched_keyword"] for match in matches if match["matched_keyword"]))
    if not keywords:
        return "该需求点命中了历史生产问题，请纳入重点回归范围。"
    return f"该需求点命中了历史生产问题中的“{keywords}”，建议重点关注相似风险并补充回归验证。"


def _build_test_suggestion(matches: list[dict]) -> str:
    keywords = "、".join(dict.fromkeys(match["matched_keyword"] for match in matches if match["matched_keyword"]))
    if not keywords:
        return "建议围绕该需求点补充主流程、异常流和边界场景测试。"
    return f"该需求点命中了测试问题中的“{keywords}”，建议补充相关主流程、异常流和边界校验场景。"


def _build_mapping_suggestion(mapping_matches: list[dict]) -> str:
    if not mapping_matches:
        return "建议结合项目需求映射关系补充测试范围。"

    suggestions: list[str] = []
    for match in mapping_matches:
        tag = match["tag"]
        requirement_keyword = match["requirement_keyword"]
        related_scenarios = "、".join(match["related_scenarios"])
        matched_scenarios = "、".join(match["matched_scenarios"])
        additional_scenarios = "、".join(match["additional_scenarios"])

        if match["matched_requirement_keyword"]:
            suggestions.append(
                f"命中需求映射“{tag}/{requirement_keyword}”，建议纳入：{related_scenarios}。"
            )
            continue

        if matched_scenarios and additional_scenarios:
            suggestions.append(
                f"命中关联场景“{matched_scenarios}”，同组还需补测：{additional_scenarios}。"
            )
            continue

        suggestions.append(
            f"命中需求映射场景“{matched_scenarios or requirement_keyword}”，建议覆盖：{related_scenarios}。"
        )

    return "".join(_unique_preserve_order(suggestions))


def analyze_requirement_points(
    requirement_points: list[dict[str, str]],
    production_rows: list[dict] | None = None,
    test_rows: list[dict] | None = None,
    rule_config: dict[str, object] | None = None,
    mapping_groups: list[dict] | None = None,
) -> dict:
    del production_rows, test_rows, rule_config
    requirement_hits: list[dict] = []
    unmatched_requirements: list[dict] = []
    mapping_suggestions: list[dict] = []
    normalized_mapping_groups = _merge_requirement_mapping_groups(mapping_groups)

    for point in requirement_points:
        mapping_matches = _analyze_requirement_mapping_hits(point["text"], normalized_mapping_groups)

        if not mapping_matches:
            unmatched_requirements.append(point)
            continue

        hit = {
            **point,
            "mapping_matches": mapping_matches,
            "mapping_suggestion": _build_mapping_suggestion(mapping_matches),
        }
        requirement_hits.append(hit)

        mapping_suggestions.append(
            {
                "requirement_point_id": point["point_id"],
                "section_number": point["section_number"],
                "section_title": point["section_title"],
                "requirement_text": point["text"],
                "match_count": len(mapping_matches),
                "suggestion": hit["mapping_suggestion"],
            }
        )

    overview = {
        "total_requirements": len(requirement_points),
        "matched_requirements": len(requirement_hits),
        "mapping_hit_count": sum(len(item["mapping_matches"]) for item in requirement_hits),
        "unmatched_requirements": len(unmatched_requirements),
    }

    return {
        "overview": overview,
        "mapping_suggestions": mapping_suggestions,
        "requirement_hits": requirement_hits,
        "unmatched_requirements": unmatched_requirements,
    }

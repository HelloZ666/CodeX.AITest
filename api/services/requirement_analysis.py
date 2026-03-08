"""
requirement_analysis.py - 需求分析规则引擎

将需求文档需求点与生产问题、测试问题明细进行可解释命中。
"""

from __future__ import annotations

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


def analyze_requirement_points(
    requirement_points: list[dict[str, str]],
    production_rows: list[dict],
    test_rows: list[dict],
    rule_config: dict[str, object] | None = None,
) -> dict:
    resolved_rule_config = rule_config or DEFAULT_RULE_CONFIG
    requirement_hits: list[dict] = []
    unmatched_requirements: list[dict] = []
    production_alerts: list[dict] = []
    test_suggestions: list[dict] = []

    for point in requirement_points:
        production_matches: list[dict] = []
        test_matches: list[dict] = []

        for issue_row in production_rows:
            for field in PRODUCTION_MATCH_FIELDS:
                source_value = issue_row.get(field)
                matched_keyword = _match_field(point["text"], source_value, resolved_rule_config)
                if not matched_keyword:
                    continue

                production_matches.append(
                    {
                        "row_id": issue_row.get("row_id"),
                        "field": field,
                        "matched_keyword": matched_keyword,
                        "requirement_excerpt": _build_excerpt(point["text"], matched_keyword),
                        "source_excerpt": _clip_text(source_value),
                    }
                )

        for defect_row in test_rows:
            for field in TEST_MATCH_FIELDS:
                source_value = defect_row.get(field)
                matched_keyword = _match_field(point["text"], source_value, resolved_rule_config)
                if not matched_keyword:
                    continue

                test_matches.append(
                    {
                        "row_id": defect_row.get("row_id"),
                        "defect_id": defect_row.get("缺陷ID"),
                        "defect_summary": defect_row.get("缺陷摘要"),
                        "field": field,
                        "matched_keyword": matched_keyword,
                        "requirement_excerpt": _build_excerpt(point["text"], matched_keyword),
                        "source_excerpt": _clip_text(source_value),
                    }
                )

        if not production_matches and not test_matches:
            unmatched_requirements.append(point)
            continue

        hit = {
            **point,
            "production_matches": production_matches,
            "test_matches": test_matches,
            "production_alert": _build_production_alert(production_matches) if production_matches else None,
            "test_suggestion": _build_test_suggestion(test_matches) if test_matches else None,
        }
        requirement_hits.append(hit)

        if production_matches:
            production_alerts.append(
                {
                    "requirement_point_id": point["point_id"],
                    "section_number": point["section_number"],
                    "section_title": point["section_title"],
                    "requirement_text": point["text"],
                    "match_count": len(production_matches),
                    "alert": hit["production_alert"],
                }
            )

        if test_matches:
            test_suggestions.append(
                {
                    "requirement_point_id": point["point_id"],
                    "section_number": point["section_number"],
                    "section_title": point["section_title"],
                    "requirement_text": point["text"],
                    "match_count": len(test_matches),
                    "suggestion": hit["test_suggestion"],
                }
            )

    overview = {
        "total_requirements": len(requirement_points),
        "matched_requirements": len(requirement_hits),
        "production_hit_count": sum(len(item["production_matches"]) for item in requirement_hits),
        "test_hit_count": sum(len(item["test_matches"]) for item in requirement_hits),
        "unmatched_requirements": len(unmatched_requirements),
    }

    return {
        "overview": overview,
        "production_alerts": production_alerts,
        "test_suggestions": test_suggestions,
        "requirement_hits": requirement_hits,
        "unmatched_requirements": unmatched_requirements,
    }


def apply_ai_requirement_enrichment(result: dict, ai_result: dict) -> dict:
    if not ai_result or ai_result.get("error"):
        return result

    alert_map = {
        item.get("requirement_point_id"): item.get("alert")
        for item in ai_result.get("production_alerts", [])
        if item.get("requirement_point_id") and item.get("alert")
    }
    suggestion_map = {
        item.get("requirement_point_id"): item.get("suggestion")
        for item in ai_result.get("test_suggestions", [])
        if item.get("requirement_point_id") and item.get("suggestion")
    }

    for item in result.get("production_alerts", []):
        point_id = item.get("requirement_point_id")
        if point_id in alert_map:
            item["alert"] = alert_map[point_id]

    for item in result.get("test_suggestions", []):
        point_id = item.get("requirement_point_id")
        if point_id in suggestion_map:
            item["suggestion"] = suggestion_map[point_id]

    for hit in result.get("requirement_hits", []):
        point_id = hit.get("point_id")
        if point_id in alert_map:
            hit["production_alert"] = alert_map[point_id]
        if point_id in suggestion_map:
            hit["test_suggestion"] = suggestion_map[point_id]

    result["ai_analysis"] = {
        "provider": "DeepSeek",
        "summary": ai_result.get("summary"),
    }
    return result

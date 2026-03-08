"""
Issue insight analysis for imported Excel/CSV files.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict


REQUIRED_FIELDS: dict[str, list[str]] = {
    "出现该问题的原因": [
        "出现该问题的原因",
        "出现问题原因",
        "问题原因",
        "发生原因",
        "原因描述",
    ],
    "改善举措": [
        "改善举措",
        "改善措施",
        "改进举措",
        "改进措施",
        "整改措施",
    ],
    "发生阶段": [
        "发生阶段",
        "问题发生阶段",
        "所属阶段",
        "阶段",
    ],
    "是否人为原因": [
        "是否人为原因",
        "是否人为",
        "人为原因",
        "是否人为造成",
    ],
    "发生原因总结": [
        "发生原因总结",
        "原因总结",
        "原因归纳",
        "发生原因归纳",
    ],
    "标签": [
        "标签",
        "问题标签",
        "分类标签",
        "标签分类",
    ],
}

_HEADER_CLEAN_RE = re.compile(r"[\s\-_()（）【】\[\]{}:：]+")
_CLAUSE_SPLIT_RE = re.compile(r"[，,、；;\n]+")
_TAG_SPLIT_RE = re.compile(r"[,，、/|；;\n]+")
_TRIM_RE = re.compile(r"^[\s，,、；;。.\-]+|[\s，,、；;。.\-]+$")


def _clean_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\u3000", " ").strip()


def _normalize_header(value: object) -> str:
    return _HEADER_CLEAN_RE.sub("", _clean_text(value)).lower()


def _resolve_header_mapping(rows: list[dict]) -> dict[str, str]:
    if not rows:
        raise ValueError("导入文件中没有可分析的数据")

    normalized_headers: dict[str, str] = {}
    for header in rows[0].keys():
        if header is None:
            continue
        normalized_headers.setdefault(_normalize_header(header), str(header))

    header_mapping: dict[str, str] = {}
    missing_fields: list[str] = []

    for field, aliases in REQUIRED_FIELDS.items():
        matched_header = None
        for alias in aliases:
            matched_header = normalized_headers.get(_normalize_header(alias))
            if matched_header:
                break
        if matched_header is None:
            missing_fields.append(field)
        else:
            header_mapping[field] = matched_header

    if missing_fields:
        joined_fields = "、".join(missing_fields)
        raise ValueError(f"导入文件缺少必要字段: {joined_fields}")

    return header_mapping


def _split_clauses(value: str, default_label: str) -> list[str]:
    cleaned = _clean_text(value)
    if not cleaned:
        return [default_label]

    clauses: list[str] = []
    for item in _CLAUSE_SPLIT_RE.split(cleaned):
        normalized = _TRIM_RE.sub("", item)
        if normalized and normalized not in clauses:
            clauses.append(normalized)

    return clauses or [cleaned]


def _split_tags(value: str) -> list[str]:
    cleaned = _clean_text(value)
    if not cleaned:
        return ["未标记"]

    tags: list[str] = []
    for item in _TAG_SPLIT_RE.split(cleaned):
        normalized = _TRIM_RE.sub("", item)
        if normalized and normalized not in tags:
            tags.append(normalized)

    return tags or ["未标记"]


def _normalize_stage(value: str) -> str:
    cleaned = _clean_text(value)
    return cleaned or "未标记阶段"


def _normalize_human_factor(value: str) -> str:
    cleaned = _clean_text(value).lower()
    if not cleaned:
        return "待确认"

    positive_values = {"是", "y", "yes", "true", "1", "人为", "人为原因"}
    negative_values = {"否", "n", "no", "false", "0", "非人为", "非人为原因"}

    if cleaned in positive_values:
        return "人为原因"
    if cleaned in negative_values:
        return "非人为原因"

    if "非人为" in cleaned or cleaned.startswith(("否", "非")):
        return "非人为原因"
    if "人为" in cleaned:
        return "人为原因"
    return "待确认"


def _build_distribution(
    counter: Counter[str],
    limit: int | None = None,
) -> list[dict[str, float | int | str]]:
    items = [(name, count) for name, count in counter.items() if name]
    items.sort(key=lambda item: (-item[1], item[0]))
    if limit is not None:
        items = items[:limit]

    total = sum(counter.values()) or 1
    return [
        {
            "name": name,
            "count": count,
            "ratio": round(count / total, 4),
        }
        for name, count in items
    ]


def _build_key_findings(
    total_records: int,
    stage_distribution: list[dict[str, float | int | str]],
    human_distribution: list[dict[str, float | int | str]],
    tag_distribution: list[dict[str, float | int | str]],
    reason_summary_distribution: list[dict[str, float | int | str]],
) -> list[str]:
    findings = [
        f"共导入 {total_records} 条问题记录，覆盖 {len(stage_distribution)} 个发生阶段。"
    ]

    if stage_distribution:
        top_stage = stage_distribution[0]
        findings.append(
            f"问题最集中在“{top_stage['name']}”，共有 {top_stage['count']} 条。"
        )

    human_item = next(
        (item for item in human_distribution if item["name"] == "人为原因"),
        None,
    )
    if human_item:
        findings.append(
            f"人为原因记录共 {human_item['count']} 条，占全部问题的 {round(float(human_item['ratio']) * 100, 1)}%。"
        )

    if tag_distribution:
        top_tags = "、".join(str(item["name"]) for item in tag_distribution[:3])
        findings.append(f"高频标签主要集中在 {top_tags}。")

    if reason_summary_distribution:
        top_reasons = "、".join(str(item["name"]) for item in reason_summary_distribution[:3])
        findings.append(f"发生原因总结高频主题包括 {top_reasons}。")

    return findings


def normalize_issue_rows(rows: list[dict]) -> list[dict[str, object]]:
    header_mapping = _resolve_header_mapping(rows)
    normalized_rows: list[dict[str, object]] = []

    for index, row in enumerate(rows, start=1):
        issue_reason = _clean_text(row.get(header_mapping["出现该问题的原因"]))
        action = _clean_text(row.get(header_mapping["改善举措"]))
        stage = _normalize_stage(row.get(header_mapping["发生阶段"]))
        human_factor = _normalize_human_factor(row.get(header_mapping["是否人为原因"]))
        reason_summary = _clean_text(row.get(header_mapping["发生原因总结"]))
        tags = _split_tags(row.get(header_mapping["标签"]))

        normalized_rows.append(
            {
                "row_id": index,
                "出现该问题的原因": issue_reason or "未填写",
                "改善举措": action or "未填写",
                "发生阶段": stage,
                "是否人为原因": human_factor,
                "发生原因总结": reason_summary or "未填写",
                "标签": tags,
            }
        )

    return normalized_rows


def analyze_issue_rows(rows: list[dict]) -> dict:
    header_mapping = _resolve_header_mapping(rows)

    normalized_rows: list[dict] = []
    issue_reason_counter: Counter[str] = Counter()
    action_counter: Counter[str] = Counter()
    stage_counter: Counter[str] = Counter()
    human_factor_counter: Counter[str] = Counter()
    reason_summary_counter: Counter[str] = Counter()
    tag_counter: Counter[str] = Counter()
    stage_human_counter: dict[str, Counter[str]] = defaultdict(Counter)

    for index, row in enumerate(rows, start=1):
        issue_reason = _clean_text(row.get(header_mapping["出现该问题的原因"]))
        action = _clean_text(row.get(header_mapping["改善举措"]))
        stage = _normalize_stage(row.get(header_mapping["发生阶段"]))
        human_factor = _normalize_human_factor(row.get(header_mapping["是否人为原因"]))
        reason_summary = _clean_text(row.get(header_mapping["发生原因总结"]))
        tags = _split_tags(row.get(header_mapping["标签"]))

        issue_reason_clauses = _split_clauses(issue_reason, "未填写原因")
        action_clauses = _split_clauses(action, "未填写改善举措")
        reason_summary_clauses = _split_clauses(reason_summary, "未填写原因总结")

        stage_counter[stage] += 1
        human_factor_counter[human_factor] += 1
        stage_human_counter[stage][human_factor] += 1

        for item in issue_reason_clauses:
            issue_reason_counter[item] += 1
        for item in action_clauses:
            action_counter[item] += 1
        for item in reason_summary_clauses:
            reason_summary_counter[item] += 1
        for tag in tags:
            tag_counter[tag] += 1

        normalized_rows.append(
            {
                "row_id": index,
                "出现该问题的原因": issue_reason or "未填写",
                "改善举措": action or "未填写",
                "发生阶段": stage,
                "是否人为原因": human_factor,
                "发生原因总结": reason_summary or "未填写",
                "标签": tags,
            }
        )

    stage_distribution = _build_distribution(stage_counter)
    human_distribution = _build_distribution(human_factor_counter)
    tag_distribution = _build_distribution(tag_counter, limit=10)
    issue_reason_distribution = _build_distribution(issue_reason_counter, limit=10)
    action_distribution = _build_distribution(action_counter, limit=10)
    reason_summary_distribution = _build_distribution(reason_summary_counter, limit=10)

    stage_human_matrix = [
        {
            "stage": stage,
            "human": counter.get("人为原因", 0),
            "non_human": counter.get("非人为原因", 0),
            "unknown": counter.get("待确认", 0),
            "total": sum(counter.values()),
        }
        for stage, counter in sorted(
            stage_human_counter.items(),
            key=lambda item: (-sum(item[1].values()), item[0]),
        )
    ]

    total_records = len(normalized_rows)
    top_stage = stage_distribution[0] if stage_distribution else None
    top_tag = tag_distribution[0] if tag_distribution else None

    return {
        "overview": {
            "total_records": total_records,
            "stage_count": len(stage_counter),
            "tag_count": len(tag_counter),
            "human_related_count": human_factor_counter.get("人为原因", 0),
            "human_related_ratio": round(
                human_factor_counter.get("人为原因", 0) / total_records,
                4,
            ) if total_records else 0,
            "top_stage": top_stage,
            "top_tag": top_tag,
        },
        "summary": {
            "headline": (
                f"问题主要集中在“{top_stage['name']}”，"
                f"人为因素占比 {round(human_factor_counter.get('人为原因', 0) / total_records * 100, 1) if total_records else 0}%"
            ) if top_stage else "暂无可用生产问题分析结果",
            "key_findings": _build_key_findings(
                total_records=total_records,
                stage_distribution=stage_distribution,
                human_distribution=human_distribution,
                tag_distribution=tag_distribution,
                reason_summary_distribution=reason_summary_distribution,
            ),
            "recommended_actions": [
                f"优先推进“{item['name']}”，该举措在 {item['count']} 条记录中出现。"
                for item in action_distribution[:3]
                if item["name"] != "未填写改善举措"
            ],
        },
        "charts": {
            "stage_distribution": stage_distribution,
            "human_factor_distribution": human_distribution,
            "tag_distribution": tag_distribution,
            "issue_reason_distribution": issue_reason_distribution,
            "reason_summary_distribution": reason_summary_distribution,
            "action_distribution": action_distribution,
            "stage_human_matrix": stage_human_matrix,
        },
        "preview_rows": normalized_rows[:20],
    }

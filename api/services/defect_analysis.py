"""Defect insight analysis for imported Excel/CSV files."""

from __future__ import annotations

import re
from collections import Counter


REQUIRED_FIELDS: dict[str, list[str]] = {
    "缺陷ID": ["缺陷ID", "缺陷编号"],
    "缺陷摘要": ["缺陷摘要", "摘要"],
    "任务编号": ["任务编号", "任务号"],
    "系统名称": ["系统名称"],
    "系统CODE": ["系统CODE", "系统Code", "系统code"],
    "需求编号": ["需求编号"],
    "计划发布日期": ["计划发布日期"],
    "缺陷状态": ["缺陷状态", "状态"],
    "缺陷修复人": ["缺陷修复人"],
    "缺陷修复人p13": ["缺陷修复人p13", "缺陷修复人P13"],
    "缺陷严重度": ["缺陷严重度", "严重度"],
    "重现频率": ["重现频率"],
    "业务影响": ["业务影响"],
    "缺陷来源": ["缺陷来源", "来源"],
    "缺陷原因": ["缺陷原因", "原因"],
    "缺陷子原因": ["缺陷子原因", "子原因"],
    "缺陷描述": ["缺陷描述"],
    "缺陷修复描述": ["缺陷修复描述"],
    "测试阶段": ["测试阶段"],
    "分配处理人": ["分配处理人"],
    "分配处理人P13": ["分配处理人P13", "分配处理人p13"],
    "缺陷修复时长": ["缺陷修复时长"],
    "修复轮次": ["修复轮次"],
    "功能区": ["功能区"],
    "缺陷关闭时间": ["缺陷关闭时间"],
    "开发团队": ["开发团队"],
    "测试团队": ["测试团队"],
    "测试用例库": ["测试用例库"],
    "功能模块": ["功能模块"],
    "测试项": ["测试项"],
    "创建人姓名": ["创建人姓名"],
    "创建人P13": ["创建人P13", "创建人p13"],
    "创建时间": ["创建时间"],
    "是否初级缺陷": ["是否初级缺陷"],
    "初级缺陷依据": ["初级缺陷依据"],
}

_HEADER_CLEAN_RE = re.compile(r"[\s\-_()（）【】\[\]{}:：]+")
_CLAUSE_SPLIT_RE = re.compile(r"[，,、/|；;\n]+")
_TRIM_RE = re.compile(r"^[\s，,、/|；;]+|[\s，,、/|；;]+$")
_MANUAL_INPUT_LABEL_RE = re.compile(r"^其他-手动输入[（(](.+?)[)）]$")


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
        raise ValueError(f"导入文件缺少必要字段: {'、'.join(missing_fields)}")

    return header_mapping


def _normalize_label(value: object, default_label: str) -> str:
    cleaned = _clean_text(value)
    return cleaned or default_label


def _extract_stat_label(value: object) -> str:
    cleaned = _clean_text(value)
    if not cleaned:
        return ""

    match = _MANUAL_INPUT_LABEL_RE.fullmatch(cleaned)
    if not match:
        return cleaned

    extracted = _clean_text(match.group(1))
    return extracted or cleaned


def _normalize_stat_label(value: object, default_label: str) -> str:
    normalized = _extract_stat_label(value)
    return normalized or default_label


def _split_clauses(value: object, default_label: str) -> list[str]:
    cleaned = _clean_text(value)
    if not cleaned:
        return [default_label]

    clauses: list[str] = []
    for item in _CLAUSE_SPLIT_RE.split(cleaned):
        normalized = _TRIM_RE.sub("", item)
        if normalized and normalized not in clauses:
            clauses.append(normalized)

    return clauses or [cleaned]


def _split_stat_clauses(value: object, default_label: str) -> list[str]:
    clauses = _split_clauses(value, default_label)
    normalized_clauses: list[str] = []

    for item in clauses:
        normalized = _extract_stat_label(item)
        if normalized and normalized not in normalized_clauses:
            normalized_clauses.append(normalized)

    return normalized_clauses or clauses


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
    severity_distribution: list[dict[str, float | int | str]],
    impact_distribution: list[dict[str, float | int | str]],
    source_distribution: list[dict[str, float | int | str]],
    reason_distribution: list[dict[str, float | int | str]],
    sub_reason_distribution: list[dict[str, float | int | str]],
) -> list[str]:
    findings = [
        f"共导入 {total_records} 条缺陷记录，覆盖 {len(severity_distribution)} 类严重度和 {len(source_distribution)} 类缺陷来源。"
    ]

    if severity_distribution:
        top_severity = severity_distribution[0]
        findings.append(
            f"缺陷主要集中在“{top_severity['name']}”严重度，共 {top_severity['count']} 条。"
        )

    if impact_distribution:
        top_impact = impact_distribution[0]
        findings.append(
            f"业务影响最高频的是“{top_impact['name']}”，占比 {round(float(top_impact['ratio']) * 100, 1)}%。"
        )

    if source_distribution:
        top_sources = "、".join(str(item["name"]) for item in source_distribution[:3])
        findings.append(f"缺陷来源主要集中在 {top_sources}。")

    if reason_distribution:
        top_reasons = "、".join(str(item["name"]) for item in reason_distribution[:3])
        findings.append(f"高频缺陷原因主要包括 {top_reasons}。")

    if sub_reason_distribution:
        top_sub_reasons = "、".join(str(item["name"]) for item in sub_reason_distribution[:3])
        findings.append(f"缺陷子原因热点集中在 {top_sub_reasons}。")

    return findings


def _build_preview_rows(rows: list[dict]) -> list[dict[str, object]]:
    preview_rows: list[dict[str, object]] = []

    for index, row in enumerate(rows, start=1):
        preview_row: dict[str, object] = {"row_id": index}

        for header, value in row.items():
            if header is None:
                continue

            header_name = _clean_text(header)
            if not header_name:
                continue

            preview_row[header_name] = _clean_text(value)

        preview_rows.append(preview_row)

    return preview_rows


def normalize_defect_rows(rows: list[dict]) -> list[dict[str, object]]:
    header_mapping = _resolve_header_mapping(rows)
    normalized_rows: list[dict[str, object]] = []

    for index, row in enumerate(rows, start=1):
        defect_id = _normalize_label(row.get(header_mapping["缺陷ID"]), f"缺陷-{index}")
        defect_summary = _normalize_label(row.get(header_mapping["缺陷摘要"]), "未填写缺陷摘要")
        defect_severity = _normalize_stat_label(row.get(header_mapping["缺陷严重度"]), "未标注严重度")
        business_impact = _normalize_stat_label(row.get(header_mapping["业务影响"]), "未标注业务影响")
        defect_source = _normalize_stat_label(row.get(header_mapping["缺陷来源"]), "未标注缺陷来源")
        defect_reasons = _split_stat_clauses(row.get(header_mapping["缺陷原因"]), "未填写缺陷原因")
        defect_sub_reasons = _split_stat_clauses(row.get(header_mapping["缺陷子原因"]), "未填写缺陷子原因")
        feature_module = _normalize_label(row.get(header_mapping["功能模块"]), "未标注功能模块")
        test_item = _normalize_label(row.get(header_mapping["测试项"]), "未标注测试项")

        normalized_rows.append(
            {
                "row_id": index,
                "缺陷ID": defect_id,
                "缺陷摘要": defect_summary,
                "缺陷严重度": defect_severity,
                "业务影响": business_impact,
                "缺陷来源": defect_source,
                "缺陷原因": "、".join(defect_reasons),
                "缺陷子原因": "、".join(defect_sub_reasons),
                "功能模块": feature_module,
                "测试项": test_item,
            }
        )

    return normalized_rows


def analyze_defect_rows(rows: list[dict]) -> dict:
    header_mapping = _resolve_header_mapping(rows)
    preview_rows = _build_preview_rows(rows)

    summary_counter: Counter[str] = Counter()
    severity_counter: Counter[str] = Counter()
    business_impact_counter: Counter[str] = Counter()
    source_counter: Counter[str] = Counter()
    reason_counter: Counter[str] = Counter()
    sub_reason_counter: Counter[str] = Counter()
    normalized_rows: list[dict[str, object]] = []

    for index, row in enumerate(rows, start=1):
        defect_id = _normalize_label(row.get(header_mapping["缺陷ID"]), f"缺陷-{index}")
        defect_summary = _normalize_label(row.get(header_mapping["缺陷摘要"]), "未填写缺陷摘要")
        defect_severity = _normalize_stat_label(row.get(header_mapping["缺陷严重度"]), "未标注严重度")
        business_impact = _normalize_stat_label(row.get(header_mapping["业务影响"]), "未标注业务影响")
        defect_source = _normalize_stat_label(row.get(header_mapping["缺陷来源"]), "未标注缺陷来源")
        defect_reasons = _split_stat_clauses(row.get(header_mapping["缺陷原因"]), "未填写缺陷原因")
        defect_sub_reasons = _split_stat_clauses(row.get(header_mapping["缺陷子原因"]), "未填写缺陷子原因")

        summary_counter[defect_summary] += 1
        severity_counter[defect_severity] += 1
        business_impact_counter[business_impact] += 1
        source_counter[defect_source] += 1

        for item in defect_reasons:
            reason_counter[item] += 1

        for item in defect_sub_reasons:
            sub_reason_counter[item] += 1

        normalized_rows.append(
            {
                "row_id": index,
                "缺陷ID": defect_id,
                "缺陷摘要": defect_summary,
                "缺陷严重度": defect_severity,
                "业务影响": business_impact,
                "缺陷来源": defect_source,
                "缺陷原因": "、".join(defect_reasons),
                "缺陷子原因": "、".join(defect_sub_reasons),
            }
        )

    severity_distribution = _build_distribution(severity_counter)
    business_impact_distribution = _build_distribution(business_impact_counter)
    source_distribution = _build_distribution(source_counter)
    reason_distribution = _build_distribution(reason_counter, limit=10)
    sub_reason_distribution = _build_distribution(sub_reason_counter, limit=10)
    summary_distribution = _build_distribution(summary_counter, limit=10)

    total_records = len(normalized_rows)
    top_severity = severity_distribution[0] if severity_distribution else None
    top_source = source_distribution[0] if source_distribution else None

    recommended_actions: list[str] = []
    if reason_distribution:
        recommended_actions.append(
            f"优先围绕“{reason_distribution[0]['name']}”类缺陷开展专项排查，当前共 {reason_distribution[0]['count']} 条。"
        )
    if sub_reason_distribution:
        recommended_actions.append(
            f"针对“{sub_reason_distribution[0]['name']}”子原因补充设计评审、开发自查和回归用例。"
        )
    if business_impact_distribution:
        recommended_actions.append(
            f"对业务影响为“{business_impact_distribution[0]['name']}”的缺陷建立优先修复和复盘机制。"
        )

    headline = "暂无可用缺陷归纳结果"
    if top_severity and top_source:
        headline = (
            f"缺陷主要集中在“{top_severity['name']}”严重度，来源以“{top_source['name']}”为主，"
            f"建议优先从高频原因入手做专项治理。"
        )

    return {
        "overview": {
            "total_records": total_records,
            "severity_count": len(severity_counter),
            "source_count": len(source_counter),
            "reason_count": len(reason_counter),
            "top_severity": top_severity,
            "top_source": top_source,
        },
        "summary": {
            "headline": headline,
            "key_findings": _build_key_findings(
                total_records=total_records,
                severity_distribution=severity_distribution,
                impact_distribution=business_impact_distribution,
                source_distribution=source_distribution,
                reason_distribution=reason_distribution,
                sub_reason_distribution=sub_reason_distribution,
            ),
            "recommended_actions": recommended_actions,
        },
        "charts": {
            "severity_distribution": severity_distribution,
            "business_impact_distribution": business_impact_distribution,
            "source_distribution": source_distribution,
            "reason_distribution": reason_distribution,
            "sub_reason_distribution": sub_reason_distribution,
            "summary_distribution": summary_distribution,
        },
        "preview_rows": preview_rows,
    }

from __future__ import annotations

import re
from typing import Optional


REQUIREMENT_SCORE_WEIGHTS = {
    "completeness": 0.30,
    "testability": 0.30,
    "mapping_coverage": 0.25,
    "risk_clarity": 0.15,
}

RISK_LEVEL_FACTORS = {
    "低": 1.0,
    "中": 0.6,
    "高": 0.3,
}


def _normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _normalize_risk_level(value: object) -> str:
    level = _normalize_text(value)
    if level.startswith("高"):
        return "高"
    if level.startswith("低"):
        return "低"
    return "中"


def _to_non_negative_int(value: object) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _to_non_negative_float(value: object) -> float:
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def _clamp_ratio(value: float) -> float:
    return max(0.0, min(1.0, value))


def _dedupe_strings(values: list[object]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = _normalize_text(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
    return result


def _dedupe_mapping_matches(mapping_matches: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for raw_match in mapping_matches:
        if not isinstance(raw_match, dict):
            continue

        tag = _normalize_text(raw_match.get("tag"))
        requirement_keyword = _normalize_text(raw_match.get("requirement_keyword"))
        match_key = f"{tag}::{requirement_keyword}"
        if not tag and not requirement_keyword:
            continue

        normalized_match = {
            **raw_match,
            "tag": tag,
            "requirement_keyword": requirement_keyword,
            "matched_scenarios": _dedupe_strings(raw_match.get("matched_scenarios", [])),
            "related_scenarios": _dedupe_strings(raw_match.get("related_scenarios", [])),
            "additional_scenarios": _dedupe_strings(raw_match.get("additional_scenarios", [])),
        }

        existing = grouped.get(match_key)
        if existing is None:
            grouped[match_key] = normalized_match
            continue

        existing["matched_scenarios"] = _dedupe_strings(
            [*existing.get("matched_scenarios", []), *normalized_match["matched_scenarios"]]
        )
        existing["related_scenarios"] = _dedupe_strings(
            [*existing.get("related_scenarios", []), *normalized_match["related_scenarios"]]
        )
        existing["additional_scenarios"] = _dedupe_strings(
            [*existing.get("additional_scenarios", []), *normalized_match["additional_scenarios"]]
        )

    return list(grouped.values())


def _dedupe_requirement_hits(requirement_hits: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for raw_hit in requirement_hits:
        if not isinstance(raw_hit, dict):
            continue

        point_id = _normalize_text(raw_hit.get("point_id"))
        if not point_id:
            continue

        normalized_hit = {
            **raw_hit,
            "point_id": point_id,
            "mapping_suggestion": _normalize_text(raw_hit.get("mapping_suggestion")),
            "mapping_matches": _dedupe_mapping_matches(raw_hit.get("mapping_matches", [])),
        }

        existing = grouped.get(point_id)
        if existing is None:
            grouped[point_id] = normalized_hit
            continue

        grouped[point_id] = {
            **existing,
            "mapping_suggestion": existing.get("mapping_suggestion") or normalized_hit["mapping_suggestion"],
            "mapping_matches": _dedupe_mapping_matches(
                [*existing.get("mapping_matches", []), *normalized_hit["mapping_matches"]]
            ),
        }

    return list(grouped.values())


def _count_related_scenarios(mapping_matches: list[dict]) -> int:
    return len(
        _dedupe_strings(
            [
                scenario
                for match in mapping_matches
                for scenario in (match.get("related_scenarios", []) or [])
            ]
        )
    )


def build_fallback_requirement_risk_table(requirement_hits: list[dict]) -> list[dict]:
    risk_table: list[dict] = []
    for hit in _dedupe_requirement_hits(requirement_hits):
        point_id = _normalize_text(hit.get("point_id"))
        if not point_id:
            continue

        mapping_matches = hit.get("mapping_matches", [])
        group_count = len(mapping_matches)
        related_scenario_count = _count_related_scenarios(mapping_matches)
        additional_scenario_count = sum(
            len(match.get("additional_scenarios", []) or [])
            for match in mapping_matches
        )

        risk_level = "低"
        risk_reason = "命中单组需求映射，建议按映射范围补齐验证。"
        if group_count >= 2 or additional_scenario_count >= 2:
            risk_level = "高"
            risk_reason = "同一需求点命中多个映射组，或同组需要扩展多个关联场景，测试范围扩散明显。"
        elif additional_scenario_count > 0 or related_scenario_count >= 2:
            risk_level = "中"
            risk_reason = (
                "需求正文直接命中了组内场景，同层级其他关联场景也需要一并覆盖。"
                if additional_scenario_count > 0
                else "需求关键词命中映射组，建议补齐该组全部关联场景。"
            )

        risk_table.append(
            {
                "requirement_point_id": point_id,
                "risk_level": risk_level,
                "risk_reason": risk_reason,
                "test_focus": _normalize_text(hit.get("mapping_suggestion"))
                or "围绕命中的需求关键词和关联场景补充主流程、异常流和边界验证。",
            }
        )

    return risk_table


def _sanitize_ai_risk_table(
    ai_analysis: Optional[dict],
    requirement_hits: list[dict],
) -> list[dict]:
    if not isinstance(ai_analysis, dict):
        return []

    allowed_point_ids = {
        _normalize_text(hit.get("point_id"))
        for hit in requirement_hits
        if _normalize_text(hit.get("point_id"))
    }
    if not allowed_point_ids:
        return []

    deduped: list[dict] = []
    seen_ids: set[str] = set()
    for item in ai_analysis.get("risk_table", []) or []:
        point_id = _normalize_text((item or {}).get("requirement_point_id"))
        if not point_id or point_id in seen_ids or point_id not in allowed_point_ids:
            continue
        seen_ids.add(point_id)
        deduped.append(
            {
                "requirement_point_id": point_id,
                "risk_level": _normalize_risk_level((item or {}).get("risk_level")),
                "risk_reason": _normalize_text((item or {}).get("risk_reason")),
                "test_focus": _normalize_text((item or {}).get("test_focus")),
            }
        )

    if len(deduped) != len(allowed_point_ids):
        return []
    return deduped


def resolve_requirement_risk_table(
    requirement_hits: list[dict],
    ai_analysis: Optional[dict] = None,
) -> list[dict]:
    sanitized_ai_risk_table = _sanitize_ai_risk_table(ai_analysis, requirement_hits)
    if sanitized_ai_risk_table:
        return sanitized_ai_risk_table
    return build_fallback_requirement_risk_table(requirement_hits)


def ensure_requirement_ai_risk_table(
    ai_analysis: Optional[dict],
    requirement_hits: list[dict],
) -> dict:
    resolved_risk_table = resolve_requirement_risk_table(requirement_hits, ai_analysis)
    base_analysis = dict(ai_analysis) if isinstance(ai_analysis, dict) else {}
    base_analysis["risk_table"] = resolved_risk_table
    return base_analysis


def _build_dimension(
    name: str,
    raw_score: float,
    weight: float,
    details: str,
) -> dict:
    score = round(max(0.0, min(100.0, raw_score)), 1)
    weighted_score = round(score * weight, 2)
    return {
        "dimension": name,
        "score": score,
        "weight": weight,
        "weighted_score": weighted_score,
        "details": details,
    }


def _resolve_grade(total_score: int) -> str:
    if total_score >= 90:
        return "A"
    if total_score >= 75:
        return "B"
    if total_score >= 60:
        return "C"
    return "D"


def calculate_requirement_score(
    analysis_result: dict,
    ai_analysis: Optional[dict] = None,
) -> dict:
    overview = analysis_result.get("overview", {}) if isinstance(analysis_result, dict) else {}

    total_requirements = _to_non_negative_int(overview.get("total_requirements"))
    matched_requirements = _to_non_negative_int(overview.get("matched_requirements"))
    mapping_hit_count = _to_non_negative_int(overview.get("mapping_hit_count"))
    denominator = max(total_requirements, 1)

    requirement_hits = analysis_result.get("requirement_hits", []) if isinstance(analysis_result, dict) else []
    resolved_risk_table = resolve_requirement_risk_table(requirement_hits, ai_analysis)
    risk_factors = [
        RISK_LEVEL_FACTORS.get(_normalize_risk_level(item.get("risk_level")), 0.6)
        for item in resolved_risk_table
    ]
    risk_factor = (sum(risk_factors) / len(risk_factors)) if risk_factors else 0.0

    completeness_ratio = _clamp_ratio(total_requirements / 8 if total_requirements > 0 else 0.0)
    testability_ratio = _clamp_ratio(matched_requirements / denominator)
    mapping_ratio = _clamp_ratio(mapping_hit_count / denominator)
    risk_ratio = _clamp_ratio(risk_factor)

    dimensions = [
        _build_dimension(
            "需求完整度",
            completeness_ratio * 100,
            REQUIREMENT_SCORE_WEIGHTS["completeness"],
            f"按 min({total_requirements}/8, 1) 计算，覆盖需求规模基线。",
        ),
        _build_dimension(
            "可测试性",
            testability_ratio * 100,
            REQUIREMENT_SCORE_WEIGHTS["testability"],
            f"按 {matched_requirements}/max({total_requirements}, 1) 计算，衡量需求可映射可验证程度。",
        ),
        _build_dimension(
            "映射覆盖度",
            mapping_ratio * 100,
            REQUIREMENT_SCORE_WEIGHTS["mapping_coverage"],
            f"按 min({mapping_hit_count}/max({total_requirements}, 1), 1) 计算，衡量映射命中覆盖率。",
        ),
        _build_dimension(
            "风险清晰度",
            risk_ratio * 100,
            REQUIREMENT_SCORE_WEIGHTS["risk_clarity"],
            "按风险矩阵折算：低=1.0，中=0.6，高=0.3；无风险矩阵按 0 计分。",
        ),
    ]

    total_score = int(round(sum(item["weighted_score"] for item in dimensions)))
    grade = _resolve_grade(total_score)
    summary = (
        f"需求分析综合得分 {total_score}（{grade}），"
        f"命中需求 {matched_requirements}/{total_requirements}，"
        f"映射命中 {mapping_hit_count}，风险矩阵条目 {len(resolved_risk_table)}。"
    )

    return {
        "total_score": total_score,
        "grade": grade,
        "summary": summary,
        "dimensions": dimensions,
    }

from services.requirement_scoring import (
    build_fallback_requirement_risk_table,
    calculate_requirement_score,
)


def _build_hit(
    point_id: str,
    mapping_matches: list[dict],
    mapping_suggestion: str = "",
) -> dict:
    return {
        "point_id": point_id,
        "section_number": "4.1",
        "section_title": "功能描述",
        "text": f"需求点 {point_id}",
        "mapping_suggestion": mapping_suggestion,
        "mapping_matches": mapping_matches,
    }


def test_build_fallback_requirement_risk_table_marks_high_risk_when_multi_group():
    risk_table = build_fallback_requirement_risk_table(
        [
            _build_hit(
                "4.1-1",
                [
                    {
                        "tag": "A",
                        "requirement_keyword": "关键词A",
                        "related_scenarios": ["场景1"],
                        "additional_scenarios": [],
                    },
                    {
                        "tag": "B",
                        "requirement_keyword": "关键词B",
                        "related_scenarios": ["场景2"],
                        "additional_scenarios": [],
                    },
                ],
            )
        ]
    )

    assert len(risk_table) == 1
    assert risk_table[0]["risk_level"] == "高"


def test_calculate_requirement_score_with_zero_match():
    result = calculate_requirement_score(
        {
            "overview": {
                "total_requirements": 8,
                "matched_requirements": 0,
                "mapping_hit_count": 0,
            },
            "requirement_hits": [],
        },
        ai_analysis={"risk_table": []},
    )

    assert result["total_score"] == 30
    assert result["grade"] == "D"
    assert len(result["dimensions"]) == 4


def test_calculate_requirement_score_with_partial_match_and_medium_risk():
    analysis_result = {
        "overview": {
            "total_requirements": 8,
            "matched_requirements": 4,
            "mapping_hit_count": 4,
        },
        "requirement_hits": [
            _build_hit(
                "4.1-1",
                [
                    {
                        "tag": "A",
                        "requirement_keyword": "关键词A",
                        "related_scenarios": ["场景1", "场景2"],
                        "additional_scenarios": [],
                    }
                ],
                mapping_suggestion="补齐同组场景",
            )
        ],
    }
    result = calculate_requirement_score(analysis_result)

    assert result["total_score"] == 66
    assert result["grade"] == "C"
    risk_dimension = next(item for item in result["dimensions"] if item["dimension"] == "风险清晰度")
    assert risk_dimension["score"] == 60.0


def test_calculate_requirement_score_prefers_complete_ai_risk_table():
    analysis_result = {
        "overview": {
            "total_requirements": 8,
            "matched_requirements": 8,
            "mapping_hit_count": 8,
        },
        "requirement_hits": [
            _build_hit(
                "4.1-1",
                [
                    {
                        "tag": "A",
                        "requirement_keyword": "关键词A",
                        "related_scenarios": ["场景1"],
                        "additional_scenarios": [],
                    }
                ],
            )
        ],
    }
    result = calculate_requirement_score(
        analysis_result,
        ai_analysis={
            "risk_table": [
                {
                    "requirement_point_id": "4.1-1",
                    "risk_level": "低",
                    "risk_reason": "AI 评估",
                    "test_focus": "优先主流程",
                }
            ]
        },
    )

    assert result["total_score"] == 100
    assert result["grade"] == "A"

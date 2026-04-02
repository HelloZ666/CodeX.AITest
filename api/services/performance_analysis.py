"""Workbook parsing and aggregation for the efficiency analysis dashboard."""

from __future__ import annotations

import io
import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Iterable

from services.file_parser import OLE2_SIGNATURE

BUSINESS_LIFE = "寿险"
BUSINESS_HEALTH = "健康险"
SUPPORTED_BUSINESSES = (BUSINESS_LIFE, BUSINESS_HEALTH)

MONTH_RE = re.compile(r"(?P<month>1[0-2]|[1-9])(?:月|月份)")
YEAR_RE = re.compile(r"(?P<year>20\d{2})")
TEAM_BLOCK_RE = re.compile(r"(?P<year>20\d{2})年(?P<month>1[0-2]|[1-9])月份")
HEADER_CLEAN_RE = re.compile(r"[\s\n\r\t()（）【】\[\]{}:：、,，/\\+_\-]")


@dataclass
class WorkbookSheet:
    name: str
    rows: list[list[object]]


SUMMARY_FIELD_ALIASES: dict[str, list[str]] = {
    "sync_tasks": ["同步任务数"],
    "total_tasks": ["同步任务数+回归", "同步任务数+回归任务数", "同步+回归", "同步回归"],
    "release_count": ["发布总次数"],
    "demand_count": ["需求数(同步+需求号去重)", "需求数"],
    "defect_count": [
        "缺陷数除性能代码扫描外所有任务类型SITFT",
        "缺陷数同步+回归+安全",
        "缺陷数同步任务+回归任务",
        "缺陷数同步任务+回归任务7月开始",
        "缺陷数",
    ],
    "total_defect_count": ["总缺陷数所有任务类型SITFT", "总缺陷数"],
    "avg_cycle_days": ["测试任务平均时效"],
    "design_cases": ["设计用例数同步SITFT", "设计用例数同步任务", "设计用例数"],
    "execution_cases": [
        "执行案例数同步+回归手工&接口+安全SITFT",
        "执行案例数同步+回归手工&接口自动化回归+安全SITFT",
        "执行案例数同步+回归手工&自动化+安全",
        "执行案例数同步+回归+安全SITFT",
        "执行案例数同步+回归+安全",
        "执行案例数",
    ],
    "functional_manpower": ["功能人月投入", "人月投入"],
    "performance_manpower": ["性能人月投入"],
    "qa_manpower": ["QA人月投入"],
}

EXTERNAL_FIELD_ALIASES: dict[str, list[str]] = {
    "manpower_input": ["人月投入"],
    "release_count": ["发布总次数"],
    "sync_tasks": ["同步任务数"],
    "demand_count": ["需求数"],
    "design_cases": ["设计案例数"],
    "execution_cases": ["执行案例数"],
    "defect_rate": ["缺陷率"],
    "avg_cycle_days": ["测试任务平均时效"],
    "defect_count": ["测试缺陷数", "缺陷数"],
    "production_defect_count": ["生产缺陷数"],
    "production_defect_detection_rate": ["生产缺陷检出率"],
    "automation_coverage": ["自动化覆盖率"],
    "automation_pass_rate": ["自动化执行通过率"],
    "planned_app_count": ["计划应用数"],
    "connected_app_count": ["已接入应用数"],
    "precision_access_rate": ["精准接入率"],
}

TEAM_FIELD_ALIASES: dict[str, list[str]] = {
    "team_name": ["团队"],
    "system_count": ["系统个数"],
    "sync_tasks": ["同步任务数"],
    "total_tasks": ["同步任务数+回归任务数", "同步任务数+回归", "同步+回归"],
    "demand_count": ["总需求数", "需求数"],
    "bug_count": ["BUG数(同步任务+回归+安全）", "BUG数(同步任务+回归+安全)", "BUG数"],
    "total_bug_count": ["总BUG数（全任务）", "总BUG数"],
    "design_cases": ["设计案例数（同步任务）", "设计案例数"],
    "execution_cases": ["执行案例数（同步+回归(手工&自动化)+安全）", "执行案例数（同步+回归+安全）", "执行案例数"],
    "staff_count": ["人数", "人月数"],
    "per_capita_task": ["人均任务_数量", "人均任务"],
    "per_capita_task_rank": ["人均任务_排名"],
    "per_capita_demand": ["人均需求数_数量", "人均需求数"],
    "per_capita_demand_rank": ["人均需求数_排名"],
    "per_capita_bug": ["人均缺陷数_数量", "人均缺陷数"],
    "per_capita_bug_rank": ["人均缺陷数_排名"],
    "defect_rate": ["缺陷率_数量", "缺陷率"],
    "defect_rate_rank": ["缺陷率_排名"],
    "avg_design_cases": ["平均设计案例数_数量", "平均设计案例数"],
    "avg_design_cases_rank": ["平均设计案例数_排名"],
    "avg_execution_cases": ["平均执行案例数_数量", "平均执行案例数"],
    "avg_execution_cases_rank": ["平均执行案例数_排名"],
}


def _clean_text(value: object) -> str:
    if value is None:
        return ""
    return str(value).replace("\u3000", " ").strip()


def _normalize_header(value: object) -> str:
    return HEADER_CLEAN_RE.sub("", _clean_text(value))


def _is_empty_row(row: Iterable[object]) -> bool:
    return not any(_clean_text(value) for value in row)


def _coerce_number(value: object) -> float | None:
    if value is None:
        return None

    if isinstance(value, bool):
        return float(value)

    if isinstance(value, (int, float)):
        return float(value)

    text = _clean_text(value)
    if not text or text in {"无数据", "-", "--", "/"}:
        return None

    text = text.replace(",", "").replace("，", "")
    if text.endswith("%"):
        try:
            return float(text[:-1]) / 100
        except ValueError:
            return None

    try:
        return float(text)
    except ValueError:
        return None


def _coerce_int(value: object) -> int | None:
    number = _coerce_number(value)
    if number is None:
        return None
    return int(round(number))


def _round_metric(value: float | None, digits: int = 4) -> float | None:
    if value is None:
        return None
    return round(value, digits)


def _extract_year_from_name(sheet_name: str) -> int | None:
    match = YEAR_RE.search(sheet_name)
    return int(match.group("year")) if match else None


def _extract_month(value: object) -> int | None:
    if value is None:
        return None

    if isinstance(value, (int, float)) and not isinstance(value, bool):
        month = int(value)
        if 1 <= month <= 12:
            return month

    text = _clean_text(value)
    if not text:
        return None

    match = MONTH_RE.search(text)
    if match:
        return int(match.group("month"))

    if text.isdigit():
        month = int(text)
        if 1 <= month <= 12:
            return month

    return None


def _find_header_index(rows: list[list[object]]) -> int | None:
    for index, row in enumerate(rows):
        if any(_normalize_header(value) == "月份" for value in row):
            return index
    return None


def _build_header_map(header_row: list[object]) -> dict[str, int]:
    header_map: dict[str, int] = {}
    for index, value in enumerate(header_row):
        normalized = _normalize_header(value)
        if normalized and normalized not in header_map:
            header_map[normalized] = index
    return header_map


def _find_column_index(header_map: dict[str, int], aliases: list[str]) -> int | None:
    for alias in aliases:
        normalized = _normalize_header(alias)
        if normalized in header_map:
            return header_map[normalized]
    return None


def _pick_value(row: list[object], header_map: dict[str, int], aliases: list[str]) -> object:
    index = _find_column_index(header_map, aliases)
    if index is None or index >= len(row):
        return None
    return row[index]


def _match_business(sheet_name: str) -> str | None:
    if "寿险&健康险" in sheet_name:
        return None
    if BUSINESS_LIFE in sheet_name:
        return BUSINESS_LIFE
    if BUSINESS_HEALTH in sheet_name:
        return BUSINESS_HEALTH
    return None


def _match_sheet_kind(sheet_name: str) -> str | None:
    if "各团队数据" in sheet_name and "寿险&健康险" not in sheet_name:
        return "team"
    if "对外数据" in sheet_name:
        return "external"
    if any(token in sheet_name for token in ("汇总", "数据")) and not any(
        token in sheet_name
        for token in ("指标口径", "周报", "人力统计", "缺陷统计", "无法统计")
    ):
        return "summary"
    return None


def _sheet_score(sheet_name: str) -> int:
    score = 0
    if "含外协" in sheet_name or "含外包" in sheet_name:
        score += 10
    if "不含外协" in sheet_name or "不含外包" in sheet_name:
        score -= 10
    if "汇总数据" in sheet_name:
        score += 6
    if "汇总" in sheet_name:
        score += 4
    if "对外数据" in sheet_name:
        score += 4
    return score


def _has_meaningful_metric(record: dict[str, object], fields: list[str]) -> bool:
    return any(record.get(field) is not None for field in fields)


def _parse_summary_sheet(rows: list[list[object]], business: str, year: int) -> list[dict[str, object]]:
    header_index = _find_header_index(rows)
    if header_index is None:
        return []

    header_map = _build_header_map(rows[header_index])
    metrics: list[dict[str, object]] = []

    for row in rows[header_index + 1:]:
        first_text = _clean_text(row[0] if row else None)
        if any(marker in first_text for marker in ("2.月度人均任务数据", "二、", "月度人均任务数据", "若提高效能")):
            break

        month = _extract_month(row[0] if row else None)
        if month is None:
            continue

        record = {
            "business": business,
            "year": year,
            "month": month,
            "month_label": f"{month}月",
            "sync_tasks": _coerce_int(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["sync_tasks"])),
            "total_tasks": _coerce_int(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["total_tasks"])),
            "release_count": _coerce_int(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["release_count"])),
            "demand_count": _coerce_int(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["demand_count"])),
            "defect_count": _coerce_int(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["defect_count"])),
            "total_defect_count": _coerce_int(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["total_defect_count"])),
            "avg_cycle_days": _round_metric(_coerce_number(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["avg_cycle_days"])), 2),
            "design_cases": _coerce_int(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["design_cases"])),
            "execution_cases": _coerce_int(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["execution_cases"])),
            "functional_manpower": _round_metric(_coerce_number(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["functional_manpower"])), 2),
            "performance_manpower": _round_metric(_coerce_number(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["performance_manpower"])), 2),
            "qa_manpower": _round_metric(_coerce_number(_pick_value(row, header_map, SUMMARY_FIELD_ALIASES["qa_manpower"])), 2),
        }

        if not _has_meaningful_metric(
            record,
            [
                "sync_tasks",
                "total_tasks",
                "release_count",
                "demand_count",
                "defect_count",
                "avg_cycle_days",
                "design_cases",
                "execution_cases",
                "functional_manpower",
            ],
        ):
            continue

        metrics.append(record)

    return metrics


def _parse_external_sheet(rows: list[list[object]], business: str, year: int) -> list[dict[str, object]]:
    header_index = _find_header_index(rows)
    if header_index is None:
        return []

    header_map = _build_header_map(rows[header_index])
    metrics: list[dict[str, object]] = []

    for row in rows[header_index + 1:]:
        month = _extract_month(row[0] if row else None)
        if month is None:
            continue

        record = {
            "business": business,
            "year": year,
            "month": month,
            "month_label": f"{month}月",
            "manpower_input": _round_metric(_coerce_number(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["manpower_input"])), 2),
            "release_count": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["release_count"])),
            "sync_tasks": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["sync_tasks"])),
            "demand_count": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["demand_count"])),
            "design_cases": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["design_cases"])),
            "execution_cases": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["execution_cases"])),
            "defect_rate": _round_metric(_coerce_number(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["defect_rate"])), 6),
            "avg_cycle_days": _round_metric(_coerce_number(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["avg_cycle_days"])), 2),
            "defect_count": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["defect_count"])),
            "production_defect_count": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["production_defect_count"])),
            "production_defect_detection_rate": _round_metric(
                _coerce_number(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["production_defect_detection_rate"])),
                6,
            ),
            "automation_coverage": _round_metric(_coerce_number(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["automation_coverage"])), 6),
            "automation_pass_rate": _round_metric(_coerce_number(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["automation_pass_rate"])), 6),
            "planned_app_count": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["planned_app_count"])),
            "connected_app_count": _coerce_int(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["connected_app_count"])),
            "precision_access_rate": _round_metric(_coerce_number(_pick_value(row, header_map, EXTERNAL_FIELD_ALIASES["precision_access_rate"])), 6),
        }

        if not _has_meaningful_metric(
            record,
            [
                "manpower_input",
                "release_count",
                "sync_tasks",
                "demand_count",
                "design_cases",
                "execution_cases",
                "defect_rate",
                "avg_cycle_days",
                "defect_count",
            ],
        ):
            continue

        metrics.append(record)

    return metrics


def _build_team_headers(header_row: list[object], sub_header_row: list[object]) -> list[str]:
    headers: list[str] = []
    max_len = max(len(header_row), len(sub_header_row))
    for index in range(max_len):
        main = _clean_text(header_row[index]) if index < len(header_row) else ""
        sub = _clean_text(sub_header_row[index]) if index < len(sub_header_row) else ""
        if main and sub in {"数量", "排名"}:
            headers.append(f"{main}_{sub}")
        else:
            headers.append(main or sub or f"col_{index}")
    return headers


def _build_team_header_map(headers: list[str]) -> dict[str, int]:
    header_map: dict[str, int] = {}
    for index, value in enumerate(headers):
        normalized = _normalize_header(value)
        if normalized and normalized not in header_map:
            header_map[normalized] = index
    return header_map


def _parse_team_sheet(rows: list[list[object]], business: str) -> list[dict[str, object]]:
    snapshots: list[dict[str, object]] = []
    index = 0

    while index < len(rows):
        first_cell = _clean_text(rows[index][0] if rows[index] else None)
        match = TEAM_BLOCK_RE.fullmatch(first_cell)
        if not match:
            index += 1
            continue

        year = int(match.group("year"))
        month = int(match.group("month"))
        if index + 2 >= len(rows):
            break

        header_row = rows[index + 1]
        sub_header_row = rows[index + 2]
        header_map = _build_team_header_map(_build_team_headers(header_row, sub_header_row))

        teams: list[dict[str, object]] = []
        row_index = index + 3
        while row_index < len(rows):
            current_row = rows[row_index]
            current_first = _clean_text(current_row[0] if current_row else None)
            if not current_first:
                break
            if TEAM_BLOCK_RE.fullmatch(current_first):
                break

            record = {
                "team_name": current_first,
                "system_count": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["system_count"])),
                "sync_tasks": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["sync_tasks"])),
                "total_tasks": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["total_tasks"])),
                "demand_count": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["demand_count"])),
                "bug_count": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["bug_count"])),
                "total_bug_count": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["total_bug_count"])),
                "design_cases": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["design_cases"])),
                "execution_cases": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["execution_cases"])),
                "staff_count": _round_metric(_coerce_number(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["staff_count"])), 2),
                "per_capita_task": _round_metric(_coerce_number(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["per_capita_task"])), 4),
                "per_capita_task_rank": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["per_capita_task_rank"])),
                "per_capita_demand": _round_metric(_coerce_number(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["per_capita_demand"])), 4),
                "per_capita_demand_rank": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["per_capita_demand_rank"])),
                "per_capita_bug": _round_metric(_coerce_number(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["per_capita_bug"])), 4),
                "per_capita_bug_rank": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["per_capita_bug_rank"])),
                "defect_rate": _round_metric(_coerce_number(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["defect_rate"])), 6),
                "defect_rate_rank": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["defect_rate_rank"])),
                "avg_design_cases": _round_metric(_coerce_number(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["avg_design_cases"])), 2),
                "avg_design_cases_rank": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["avg_design_cases_rank"])),
                "avg_execution_cases": _round_metric(_coerce_number(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["avg_execution_cases"])), 2),
                "avg_execution_cases_rank": _coerce_int(_pick_value(current_row, header_map, TEAM_FIELD_ALIASES["avg_execution_cases_rank"])),
            }

            if _has_meaningful_metric(
                record,
                [
                    "system_count",
                    "sync_tasks",
                    "total_tasks",
                    "demand_count",
                    "bug_count",
                    "total_bug_count",
                    "design_cases",
                    "execution_cases",
                    "staff_count",
                ],
            ):
                teams.append(record)

            row_index += 1

        if teams:
            snapshots.append(
                {
                    "business": business,
                    "year": year,
                    "month": month,
                    "month_label": f"{month}月",
                    "teams": teams,
                }
            )

        index = row_index + 1

    return snapshots


def _merge_monthly_metrics(summary_records: list[dict[str, object]], external_records: list[dict[str, object]]) -> list[dict[str, object]]:
    merged: dict[tuple[int, int], dict[str, object]] = {}

    for record in summary_records:
        key = (int(record["year"]), int(record["month"]))
        merged[key] = dict(record)

    for record in external_records:
        key = (int(record["year"]), int(record["month"]))
        target = merged.setdefault(
            key,
            {
                "business": record["business"],
                "year": record["year"],
                "month": record["month"],
                "month_label": record["month_label"],
            },
        )
        for field, value in record.items():
            if value is None or field in {"business", "year", "month", "month_label"}:
                continue
            target[field] = value

    merged_list = []
    for key in sorted(merged.keys()):
        record = merged[key]
        defect_count = record.get("defect_count")
        design_cases = record.get("design_cases")
        if record.get("defect_rate") is None and defect_count is not None and design_cases not in (None, 0):
            record["defect_rate"] = _round_metric(float(defect_count) / float(design_cases), 6)
        if record.get("functional_manpower") is None and record.get("manpower_input") is not None:
            record["functional_manpower"] = record["manpower_input"]
        merged_list.append(record)

    return merged_list


def _average(values: list[float]) -> float | None:
    if not values:
        return None
    return round(sum(values) / len(values), 4)


def _build_annual_benchmarks(monthly_metrics: list[dict[str, object]]) -> list[dict[str, object]]:
    by_year: dict[int, list[dict[str, object]]] = defaultdict(list)
    for record in monthly_metrics:
        by_year[int(record["year"])].append(record)

    annual_benchmarks: list[dict[str, object]] = []
    for year in sorted(by_year.keys()):
        records = by_year[year]
        design_cases_sum = sum(float(item["design_cases"]) for item in records if item.get("design_cases") is not None)
        defect_sum = sum(float(item["defect_count"]) for item in records if item.get("defect_count") is not None)
        benchmark = {
            "year": year,
            "avg_sync_tasks": _average([float(item["sync_tasks"]) for item in records if item.get("sync_tasks") is not None]),
            "avg_total_tasks": _average([float(item["total_tasks"]) for item in records if item.get("total_tasks") is not None]),
            "avg_release_count": _average([float(item["release_count"]) for item in records if item.get("release_count") is not None]),
            "avg_demand_count": _average([float(item["demand_count"]) for item in records if item.get("demand_count") is not None]),
            "avg_defect_count": _average([float(item["defect_count"]) for item in records if item.get("defect_count") is not None]),
            "avg_defect_rate": _round_metric(defect_sum / design_cases_sum, 6) if design_cases_sum else _average(
                [float(item["defect_rate"]) for item in records if item.get("defect_rate") is not None]
            ),
            "avg_cycle_days": _average([float(item["avg_cycle_days"]) for item in records if item.get("avg_cycle_days") is not None]),
            "avg_design_cases": _average([float(item["design_cases"]) for item in records if item.get("design_cases") is not None]),
            "avg_execution_cases": _average([float(item["execution_cases"]) for item in records if item.get("execution_cases") is not None]),
            "avg_functional_manpower": _average(
                [float(item["functional_manpower"]) for item in records if item.get("functional_manpower") is not None]
            ),
            "avg_automation_coverage": _average(
                [float(item["automation_coverage"]) for item in records if item.get("automation_coverage") is not None]
            ),
            "avg_automation_pass_rate": _average(
                [float(item["automation_pass_rate"]) for item in records if item.get("automation_pass_rate") is not None]
            ),
        }
        annual_benchmarks.append(benchmark)

    return annual_benchmarks


def load_workbook_sheets(content: bytes) -> list[WorkbookSheet]:
    """Load all worksheet rows from an Excel workbook."""
    if content.startswith(OLE2_SIGNATURE):
        try:
            import xlrd
        except ImportError as exc:
            raise ImportError("xlrd 库未安装，无法解析 .xls 文件") from exc

        workbook = xlrd.open_workbook(file_contents=content)
        sheets: list[WorkbookSheet] = []
        for sheet in workbook.sheets():
            rows = [
                [sheet.cell_value(row_index, col_index) for col_index in range(sheet.ncols)]
                for row_index in range(sheet.nrows)
            ]
            sheets.append(WorkbookSheet(name=sheet.name, rows=rows))
        return sheets

    try:
        from openpyxl import load_workbook
    except ImportError as exc:
        raise ImportError("openpyxl 库未安装，无法解析 Excel 文件") from exc

    workbook = load_workbook(filename=io.BytesIO(content), read_only=False, data_only=True)
    try:
        sheets: list[WorkbookSheet] = []
        for worksheet in workbook.worksheets:
            rows = [list(row) for row in worksheet.iter_rows(values_only=True)]
            sheets.append(WorkbookSheet(name=worksheet.title, rows=rows))
        return sheets
    finally:
        workbook.close()


def analyze_performance_workbook(content: bytes) -> dict[str, object]:
    """Parse efficiency-related workbook sheets into dashboard-friendly data."""
    workbook_sheets = load_workbook_sheets(content)
    if not workbook_sheets:
        raise ValueError("导入文件中未发现可解析的工作表")

    candidates: dict[str, dict[tuple[str, int], tuple[int, list[dict[str, object]]]]] = {
        "summary": {},
        "external": {},
        "team": {},
    }

    for sheet in workbook_sheets:
        if not sheet.rows or all(_is_empty_row(row) for row in sheet.rows):
            continue

        business = _match_business(sheet.name)
        kind = _match_sheet_kind(sheet.name)
        year = _extract_year_from_name(sheet.name)
        if business is None or kind is None or year is None:
            continue

        parsed_records: list[dict[str, object]]
        if kind == "summary":
            parsed_records = _parse_summary_sheet(sheet.rows, business, year)
        elif kind == "external":
            parsed_records = _parse_external_sheet(sheet.rows, business, year)
        else:
            parsed_records = _parse_team_sheet(sheet.rows, business)

        if not parsed_records:
            continue

        key = (business, year)
        score = _sheet_score(sheet.name)
        previous = candidates[kind].get(key)
        if previous is None or score > previous[0]:
            candidates[kind][key] = (score, parsed_records)

    businesses: dict[str, dict[str, object]] = {}
    for business in SUPPORTED_BUSINESSES:
        business_years = sorted({
            year
            for current_business, year in (
                list(candidates["summary"].keys())
                + list(candidates["external"].keys())
                + list(candidates["team"].keys())
            )
            if current_business == business
        })

        monthly_metrics: list[dict[str, object]] = []
        team_snapshots: list[dict[str, object]] = []

        for year in business_years:
            summary_records = candidates["summary"].get((business, year), (0, []))[1]
            external_records = candidates["external"].get((business, year), (0, []))[1]
            team_records = candidates["team"].get((business, year), (0, []))[1]

            monthly_metrics.extend(_merge_monthly_metrics(summary_records, external_records))
            team_snapshots.extend(team_records)

        monthly_metrics.sort(key=lambda item: (int(item["year"]), int(item["month"])))
        team_snapshots.sort(key=lambda item: (int(item["year"]), int(item["month"])))

        if not monthly_metrics and not team_snapshots:
            continue

        latest_month = monthly_metrics[-1] if monthly_metrics else None
        businesses[business] = {
            "business": business,
            "available_years": sorted({int(item["year"]) for item in monthly_metrics} | {int(item["year"]) for item in team_snapshots}),
            "monthly_metrics": monthly_metrics,
            "annual_benchmarks": _build_annual_benchmarks(monthly_metrics),
            "team_snapshots": team_snapshots,
            "latest_month": (
                {
                    "year": int(latest_month["year"]),
                    "month": int(latest_month["month"]),
                    "month_label": latest_month["month_label"],
                }
                if latest_month
                else None
            ),
        }

    if not businesses:
        raise ValueError("导入文件中未识别出寿险或健康险效能分析数据")

    return {
        "available_businesses": list(businesses.keys()),
        "businesses": businesses,
        "sheet_names": [sheet.name for sheet in workbook_sheets],
    }

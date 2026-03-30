"""
CodeTestGuard - FastAPI 入口

Vercel Serverless Function 入口文件。
所有 /api/* 路由都由此文件处理。
"""

import io
import json
import re
import sys
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

from services.runtime_paths import (
    ensure_directory,
    get_log_dir,
    get_project_env_path,
    get_runtime_env_path,
    get_runtime_root,
)


def _configure_logging() -> None:
    log_dir = ensure_directory(get_log_dir())
    logger.remove()
    logger.add(sys.stderr, level="INFO")
    logger.add(
        log_dir / "backend.log",
        encoding="utf-8",
        rotation="10 MB",
        retention="14 days",
        level="INFO",
    )


_configure_logging()

from services.diff_analyzer import analyze_code_changes, format_diff_summary, normalize_code_changes_payload
from services.ast_parser import parse_java_code, extract_changed_methods
from services.coverage_analyzer import (
    parse_mapping_data,
    parse_test_cases,
    analyze_coverage,
)
from services.scoring_model import calculate_score
from services.deepseek_client import (
    build_analysis_messages,
    build_requirement_analysis_messages,
    call_ai_text,
    call_deepseek,
    calculate_cost,
    get_ai_provider_label,
    is_ai_configuration_error,
)
from services.ai_agent import (
    SUPPORTED_AI_AGENT_ATTACHMENT_TYPES,
    build_ai_agent_messages,
    extract_ai_agent_attachment_text,
    list_builtin_ai_agents,
    resolve_ai_agent,
)
from services.api_automation_document_parser import parse_api_document
from services.api_automation_case_generator import generate_cases_with_ai
from services.api_automation_executor import execute_api_test_suite
from services.file_parser import (
    parse_csv,
    parse_excel,
    parse_json,
    detect_file_type,
    validate_file,
)
from services.issue_analysis import analyze_issue_rows
from services.defect_analysis import analyze_defect_rows
from services.requirement_mapping import (
    build_requirement_mapping_template,
    flatten_requirement_mapping_groups,
    normalize_requirement_mapping_groups,
    parse_requirement_mapping_file,
)
from services.project_mapping import (
    build_project_mapping_template,
    normalize_project_mapping_entries,
)
from services.requirement_scoring import (
    calculate_requirement_score,
    ensure_requirement_ai_risk_table,
)
try:
    from services.requirement_document_parser import parse_requirement_document
    from services.requirement_analysis import (
        analyze_requirement_points,
    )
except ModuleNotFoundError as requirement_import_error:
    def _missing_requirement_dependency(*args, **kwargs):
        raise RuntimeError(
            "Requirement analysis dependencies are missing. Install optional requirement document packages first."
        ) from requirement_import_error

    parse_requirement_document = _missing_requirement_dependency
    analyze_requirement_points = _missing_requirement_dependency
from services.database import (
    authenticate_user,
    count_audit_logs,
    create_requirement_analysis_rule,
    create_prompt_template,
    create_project,
    create_audit_log,
    create_user,
    create_user_session,
    delete_user,
    delete_prompt_template,
    delete_requirement_analysis_rule,
    delete_global_mapping,
    delete_project,
    delete_requirement_mapping,
    delete_user_session,
    ensure_initial_admin,
    get_api_test_environment_config,
    get_api_test_run,
    get_api_test_suite,
    get_latest_api_document_record,
    get_latest_api_test_suite,
    get_analysis_record,
    get_db_path,
    get_global_mapping,
    get_latest_global_mapping,
    get_prompt_template,
    get_project,
    get_project_stats,
    get_requirement_mapping,
    get_requirement_analysis_record,
    get_user_by_session_token,
    get_user,
    init_db,
    get_case_quality_record,
    list_analysis_records,
    list_audit_logs,
    list_api_test_runs,
    list_case_quality_records,
    list_global_mappings,
    list_prompt_templates,
    list_projects,
    list_requirement_analysis_records,
    list_requirement_analysis_rules,
    list_users,
    reset_user_password,
    save_analysis_record,
    save_api_document_record,
    save_api_test_environment_config,
    save_api_test_run,
    save_api_test_suite,
    save_case_quality_record,
    save_global_mapping,
    save_requirement_mapping,
    save_requirement_analysis_record,
    get_user_by_username,
    update_prompt_template,
    update_requirement_analysis_rule,
    update_project,
    upsert_external_user,
    update_user,
    update_user_status,
)
from services.external_auth import ExternalAuthError, authenticate_external_user, is_external_auth_enabled
from services.auth import (
    SESSION_DURATION_DAYS,
    get_allowed_origins,
    get_session_cookie_from_headers,
    get_session_cookie_settings,
)
from services.production_issue_file_store import (
    get_production_issue_file,
    save_production_issue_file,
    list_production_issue_files,
)
from services.test_issue_file_store import (
    get_test_issue_file,
    save_test_issue_file,
    list_test_issue_files,
)


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    """应用生命周期管理"""
    # Startup
    runtime_root = ensure_directory(get_runtime_root())
    log_dir = ensure_directory(get_log_dir())
    logger.info(f"runtime directory: {runtime_root}")
    logger.info(f"project env path: {get_project_env_path()}")
    logger.info(f"runtime env path: {get_runtime_env_path()}")
    logger.info(f"database path: {get_db_path()}")
    logger.info(f"log directory: {log_dir}")
    init_db()
    ensure_initial_admin()
    yield
    # Shutdown (cleanup if needed)


app = FastAPI(
    title="CodeTestGuard API",
    description="代码改动分析与测试用例覆盖检查系统",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ 响应模型 ============

class HealthResponse(BaseModel):
    status: str
    version: str


class AnalyzeResponse(BaseModel):
    success: bool
    data: Optional[dict] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None

class ProjectCreate(BaseModel):
    name: str
    description: str = ""


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectMappingEntryPayload(BaseModel):
    package_name: str = Field(min_length=1)
    class_name: str = Field(min_length=1)
    method_name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    test_point: str = ""


class ProjectMappingEntryKeyPayload(BaseModel):
    package_name: str = Field(min_length=1)
    class_name: str = Field(min_length=1)
    method_name: str = Field(min_length=1)


class ProjectMappingEntryUpdateRequest(BaseModel):
    original_key: ProjectMappingEntryKeyPayload
    entry: ProjectMappingEntryPayload


class RequirementMappingGroupPayload(BaseModel):
    id: Optional[str] = None
    tag: str
    requirement_keyword: str
    related_scenarios: list[str]


class RequirementMappingUpdateRequest(BaseModel):
    groups: list[RequirementMappingGroupPayload]


class RequirementAnalysisRuleCreateRequest(BaseModel):
    rule_type: str = Field(pattern="^(ignore|allow)$")
    keyword: str = Field(min_length=1, max_length=100)


class RequirementAnalysisRuleUpdateRequest(RequirementAnalysisRuleCreateRequest):
    pass


class PromptTemplateCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    prompt: str = Field(min_length=1, max_length=20000)


class PromptTemplateUpdateRequest(PromptTemplateCreateRequest):
    pass


class CaseQualityRecordCreateRequest(BaseModel):
    project_id: int
    requirement_analysis_record_id: int
    analysis_record_id: int
    code_changes_file_name: str = Field(min_length=1, max_length=255)
    test_cases_file_name: str = Field(min_length=1, max_length=255)


class ApiAutomationEnvironmentUpdateRequest(BaseModel):
    base_url: str = ""
    timeout_ms: int = Field(default=30000, ge=1000, le=120000)
    auth_mode: str = Field(pattern="^(none|bearer|basic|cookie|custom_header|login_extract)$")
    common_headers: dict = Field(default_factory=dict)
    auth_config: dict = Field(default_factory=dict)
    signature_template: dict = Field(default_factory=dict)
    login_binding: dict = Field(default_factory=dict)


class ApiAutomationCaseGenerateRequest(BaseModel):
    use_ai: bool = True
    name: Optional[str] = Field(default=None, max_length=255)


class ApiAutomationSuiteUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    cases: list[dict]
    endpoints: Optional[list[dict]] = None


class ApiAutomationRunCreateRequest(BaseModel):
    suite_id: int


def _serialize_requirement_record_summary(record: dict) -> dict:
    overview = (record.get("result_snapshot_json") or {}).get("overview", {})
    ai_analysis = record.get("ai_analysis_json") or {}
    ai_provider = ai_analysis.get("provider") if isinstance(ai_analysis, dict) else None
    return {
        "id": record["id"],
        "project_id": record["project_id"],
        "project_name": record.get("project_name"),
        "requirement_file_name": record["requirement_file_name"],
        "matched_requirements": overview.get("matched_requirements", 0),
        "mapping_hit_count": overview.get("mapping_hit_count", 0),
        "use_ai": overview.get("use_ai", False),
        "ai_provider": ai_provider,
        "token_usage": record.get("token_usage", 0),
        "cost": 0.0,
        "duration_ms": record.get("duration_ms", 0),
        "created_at": record.get("created_at"),
    }


def _serialize_requirement_record_detail(record: dict) -> dict:
    return {
        **_serialize_requirement_record_summary(record),
        "section_snapshot": record.get("section_snapshot_json") or {},
        "result_snapshot": record.get("result_snapshot_json") or {},
        "ai_analysis": record.get("ai_analysis_json"),
    }


def _serialize_case_quality_record_summary(record: dict) -> dict:
    return {
        "id": record["id"],
        "project_id": record["project_id"],
        "project_name": record.get("project_name"),
        "requirement_analysis_record_id": record["requirement_analysis_record_id"],
        "analysis_record_id": record["analysis_record_id"],
        "requirement_file_name": record["requirement_file_name"],
        "code_changes_file_name": record["code_changes_file_name"],
        "test_cases_file_name": record["test_cases_file_name"],
        "requirement_score": record.get("requirement_score", 0),
        "case_score": record.get("case_score", 0),
        "total_token_usage": record.get("total_token_usage", 0),
        "total_cost": 0.0,
        "total_duration_ms": record.get("total_duration_ms", 0),
        "created_at": record.get("created_at"),
    }


def _coerce_test_case_count(value: object) -> Optional[int]:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)) and value >= 0:
        return int(value)
    return None


def _infer_test_case_count_from_score(score_snapshot: object) -> Optional[int]:
    if not isinstance(score_snapshot, dict):
        return None

    candidates: list[int] = []
    for dimension in score_snapshot.get("dimensions") or []:
        if not isinstance(dimension, dict):
            continue
        details = dimension.get("details")
        if not isinstance(details, str):
            continue

        for pattern in (
            r"\((\d+)个用例\)",
            r"\((\d+)[^)]*\)",
            r"用例/方法比\s*(\d+)/",
            r"边界用例\s*\d+/(\d+)",
        ):
            matched = re.search(pattern, details)
            if matched:
                candidates.append(int(matched.group(1)))

    return max(candidates) if candidates else None


def _resolve_test_case_count(payload: object) -> Optional[int]:
    if not isinstance(payload, dict):
        return None

    direct_count = _coerce_test_case_count(payload.get("test_case_count"))
    if direct_count is not None:
        return direct_count

    return _infer_test_case_count_from_score(payload.get("score"))


def _with_resolved_test_case_count(payload: object) -> object:
    if not isinstance(payload, dict):
        return payload

    resolved_count = _resolve_test_case_count(payload)
    if resolved_count is None:
        return payload

    if _coerce_test_case_count(payload.get("test_case_count")) == resolved_count:
        return payload

    return {
        **payload,
        "test_case_count": resolved_count,
    }


def _serialize_case_quality_record_detail(record: dict) -> dict:
    case_result_snapshot = _with_resolved_test_case_count(
        record.get("case_result_snapshot")
        or record.get("case_result_snapshot_json")
        or {}
    )
    combined_result_snapshot = record.get("combined_result_snapshot") or record.get("combined_result_snapshot_json") or {}
    if isinstance(combined_result_snapshot, dict) and isinstance(combined_result_snapshot.get("case_report"), dict):
        combined_result_snapshot = {
            **combined_result_snapshot,
            "case_report": _with_resolved_test_case_count(combined_result_snapshot.get("case_report")),
        }

    return {
        **_serialize_case_quality_record_summary(record),
        "requirement_section_snapshot": (
            record.get("requirement_section_snapshot")
            or record.get("requirement_section_snapshot_json")
            or {}
        ),
        "requirement_result_snapshot": (
            record.get("requirement_result_snapshot")
            or record.get("requirement_result_snapshot_json")
            or {}
        ),
        "case_result_snapshot": case_result_snapshot,
        "combined_result_snapshot": combined_result_snapshot,
    }


def _serialize_requirement_rule(rule: dict) -> dict:
    return {
        "id": rule["id"],
        "rule_type": rule["rule_type"],
        "keyword": rule["keyword"],
        "rule_source": rule.get("rule_source", "custom"),
        "created_at": rule.get("created_at"),
        "updated_at": rule.get("updated_at"),
    }


def _serialize_prompt_template(template: dict) -> dict:
    return {
        "id": template["id"],
        "agent_key": template["agent_key"],
        "name": template["name"],
        "prompt": template["prompt"],
        "created_at": template.get("created_at"),
        "updated_at": template.get("updated_at"),
    }


def _serialize_requirement_mapping(record: dict) -> dict:
    groups = record.get("groups") or []
    rows = flatten_requirement_mapping_groups(groups)
    return {
        "project_id": record["project_id"],
        "project_name": record.get("project_name"),
        "source_type": record["source_type"],
        "last_file_name": record.get("last_file_name"),
        "last_file_type": record.get("last_file_type"),
        "sheet_name": record.get("sheet_name"),
        "group_count": record.get("group_count", len(groups)),
        "row_count": record.get("row_count", len(rows)),
        "groups": groups,
        "rows": rows,
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


def _serialize_api_test_environment_config(project_id: int, record: Optional[dict]) -> dict:
    if record is None:
        return {
            "project_id": project_id,
            "base_url": "",
            "timeout_ms": 30000,
            "auth_mode": "none",
            "common_headers": {},
            "auth_config": {},
            "signature_template": {},
            "login_binding": {},
            "created_at": None,
            "updated_at": None,
        }
    return {
        "project_id": record["project_id"],
        "base_url": record.get("base_url") or "",
        "timeout_ms": record.get("timeout_ms", 30000),
        "auth_mode": record.get("auth_mode") or "none",
        "common_headers": record.get("common_headers") or {},
        "auth_config": record.get("auth_config") or {},
        "signature_template": record.get("signature_template") or {},
        "login_binding": record.get("login_binding") or {},
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


def _serialize_api_document_record(record: dict) -> dict:
    return {
        "id": record["id"],
        "project_id": record["project_id"],
        "file_name": record["file_name"],
        "file_type": record.get("file_type"),
        "source_type": record.get("source_type"),
        "raw_text_excerpt": record.get("raw_text_excerpt") or "",
        "raw_text": record.get("raw_text") or "",
        "endpoint_count": len(record.get("endpoints") or []),
        "missing_fields": record.get("missing_fields") or [],
        "endpoints": record.get("endpoints") or [],
        "created_at": record.get("created_at"),
    }


def _serialize_api_test_suite(record: dict) -> dict:
    return {
        "id": record["id"],
        "project_id": record["project_id"],
        "document_record_id": record.get("document_record_id"),
        "name": record["name"],
        "endpoints": record.get("endpoints") or [],
        "cases": record.get("cases") or [],
        "ai_analysis": record.get("ai_analysis"),
        "token_usage": record.get("token_usage", 0),
        "cost": 0.0,
        "duration_ms": record.get("duration_ms", 0),
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at"),
    }


def _serialize_analysis_record(record: dict) -> dict:
    resolved_test_case_count = _resolve_test_case_count(record)
    return {
        **record,
        **({"test_case_count": resolved_test_case_count} if resolved_test_case_count is not None else {}),
        "cost": 0.0,
    }


def _serialize_api_test_run_summary(record: dict) -> dict:
    report_snapshot = record.get("report_snapshot") or {}
    overview = report_snapshot.get("overview") or {}
    return {
        "id": record["id"],
        "project_id": record["project_id"],
        "suite_id": record["suite_id"],
        "status": record.get("status") or overview.get("status") or "completed",
        "total_cases": record.get("total_cases", overview.get("total_cases", 0)),
        "passed_cases": record.get("passed_cases", overview.get("passed_cases", 0)),
        "failed_cases": record.get("failed_cases", overview.get("failed_cases", 0)),
        "blocked_cases": record.get("blocked_cases", overview.get("blocked_cases", 0)),
        "duration_ms": record.get("duration_ms", overview.get("duration_ms", 0)),
        "created_at": record.get("created_at"),
    }


def _serialize_api_test_run_detail(record: dict) -> dict:
    return {
        **_serialize_api_test_run_summary(record),
        "environment_snapshot": record.get("environment_snapshot") or {},
        "report_snapshot": record.get("report_snapshot") or {},
        "items": record.get("items") or [],
    }


def _normalize_requirement_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def _dedupe_requirement_texts(values: list[object], limit: int | None = None) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        text = _normalize_requirement_text(value)
        if not text or text in seen:
            continue
        seen.add(text)
        result.append(text)
        if limit is not None and len(result) >= limit:
            break
    return result


def _compact_requirement_assessment(value: object, fallback: str = "聚焦映射回归") -> str:
    text = _normalize_requirement_text(value)
    if not text:
        return fallback

    parts = [
        part.strip("：:，,。；;、 ")
        for part in re.split(r"[。；;，,\n]+", text)
        if part.strip("：:，,。；;、 ")
    ]
    compacted = parts[0] if parts else text
    return compacted[:16].rstrip() if len(compacted) > 16 else compacted


def _sanitize_requirement_risk_level(value: object) -> str:
    level = _normalize_requirement_text(value)
    if level.startswith("高"):
        return "高"
    if level.startswith("低"):
        return "低"
    return "中"


def _sanitize_requirement_ai_analysis(ai_result: dict, requirement_hits: list[dict]) -> dict:
    allowed_point_ids = {
        _normalize_requirement_text(hit.get("point_id"))
        for hit in requirement_hits
        if _normalize_requirement_text(hit.get("point_id"))
    }

    deduped_risk_table: list[dict] = []
    seen_point_ids: set[str] = set()
    for item in ai_result.get("risk_table", []) or []:
        point_id = _normalize_requirement_text(item.get("requirement_point_id"))
        if not point_id or point_id in seen_point_ids or point_id not in allowed_point_ids:
            continue
        seen_point_ids.add(point_id)
        deduped_risk_table.append(
            {
                "requirement_point_id": point_id,
                "risk_level": _sanitize_requirement_risk_level(item.get("risk_level")),
                "risk_reason": _normalize_requirement_text(item.get("risk_reason")),
                "test_focus": _normalize_requirement_text(item.get("test_focus")),
            }
        )

    if allowed_point_ids and len(deduped_risk_table) != len(allowed_point_ids):
        deduped_risk_table = []

    sanitized = {
        **ai_result,
        "overall_assessment": _compact_requirement_assessment(ai_result.get("overall_assessment")),
        "summary": _normalize_requirement_text(ai_result.get("summary")),
        "key_findings": _dedupe_requirement_texts(ai_result.get("key_findings", []), limit=4),
        "risk_table": deduped_risk_table,
    }

    return sanitized


def _normalize_mapping_entry_key(package_name: object, class_name: object, method_name: object) -> tuple[str, str, str]:
    return (
        _normalize_requirement_text(package_name),
        _normalize_requirement_text(class_name),
        _normalize_requirement_text(method_name),
    )


def _resolve_case_analysis_grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 60:
        return "C"
    if score >= 40:
        return "D"
    return "F"


def _build_case_score_snapshot(record: dict) -> dict:
    existing_snapshot = record.get("score_snapshot")
    if isinstance(existing_snapshot, dict):
        return existing_snapshot

    total_score = float(record.get("test_score") or 0)
    return {
        "total_score": round(total_score, 1),
        "grade": _resolve_case_analysis_grade(total_score),
        "summary": f"案例分析总分 {round(total_score, 1)} 分。",
        "dimensions": [],
    }


def _build_case_result_snapshot(record: dict) -> dict:
    return {
        "diff_analysis": record.get("code_changes_summary") or {},
        "coverage": record.get("test_coverage_result") or {},
        "score": _build_case_score_snapshot(record),
        "test_case_count": _resolve_test_case_count(record),
        "ai_analysis": record.get("ai_suggestions"),
        "ai_cost": None,
        "duration_ms": record.get("duration_ms", 0),
        "record_id": record.get("id"),
    }


def _build_case_quality_combined_report(
    project: dict,
    requirement_record: dict,
    analysis_record: dict,
    case_result_snapshot: dict,
) -> tuple[dict, int, float, int, float, int]:
    requirement_result_snapshot = requirement_record.get("result_snapshot_json") or {}
    requirement_report_snapshot = {
        **requirement_result_snapshot,
        "ai_analysis": None,
        "ai_cost": None,
    }
    requirement_score = int((requirement_result_snapshot.get("score") or {}).get("total_score") or 0)
    case_score = float((case_result_snapshot.get("score") or {}).get("total_score") or 0)
    total_token_usage = int(requirement_record.get("token_usage", 0) or 0) + int(analysis_record.get("token_usage", 0) or 0)
    total_cost = 0.0
    total_duration_ms = int(requirement_record.get("duration_ms", 0) or 0) + int(analysis_record.get("duration_ms", 0) or 0)

    return (
        {
            "project_id": project["id"],
            "project_name": project.get("name"),
            "requirement_analysis_record_id": requirement_record["id"],
            "analysis_record_id": analysis_record["id"],
            "requirement_report": requirement_report_snapshot,
            "case_report": case_result_snapshot,
            "overview": {
                "requirement_score": requirement_score,
                "case_score": case_score,
                "total_token_usage": total_token_usage,
                "total_cost": total_cost,
                "total_duration_ms": total_duration_ms,
                "project_id": project["id"],
                "project_name": project.get("name"),
                "requirement_analysis_record_id": requirement_record["id"],
                "analysis_record_id": analysis_record["id"],
            },
            "summary": {
                "requirement_score": requirement_score,
                "case_score": case_score,
                "total_token_usage": total_token_usage,
                "total_cost": total_cost,
                "total_duration_ms": total_duration_ms,
                "project_id": project["id"],
                "project_name": project.get("name"),
                "requirement_analysis_record_id": requirement_record["id"],
                "analysis_record_id": analysis_record["id"],
            },
        },
        requirement_score,
        case_score,
        total_token_usage,
        total_cost,
        total_duration_ms,
    )

# ============ 路由 ============

class AuthUserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    email: Optional[str] = None
    dept_name: Optional[str] = None
    auth_source: str
    role: str
    status: str


class UserRecordResponse(AuthUserResponse):
    last_login_at: Optional[str] = None
    created_at: str
    updated_at: str


class LoginRequest(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    success: bool
    user: AuthUserResponse


class UserCreateRequest(BaseModel):
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=100)
    email: Optional[str] = None
    role: str = "user"


class UserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    email: Optional[str] = None
    role: Optional[str] = None


class UserStatusUpdateRequest(BaseModel):
    status: str


class UserPasswordResetRequest(BaseModel):
    password: str = Field(min_length=8, max_length=128)


def _serialize_auth_user(user: dict) -> AuthUserResponse:
    return AuthUserResponse(**user)


def _serialize_user_record(user: dict) -> UserRecordResponse:
    return UserRecordResponse(**user)


def _get_request_user(request: Request) -> Optional[dict]:
    return getattr(request.state, "current_user", None)


def _get_request_ip(request: Request) -> Optional[str]:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    if request.client and request.client.host:
        return request.client.host
    return None


def _build_audit_actor(user: Optional[dict], attempted_username: Optional[str] = None) -> dict:
    return {
        "operator_user_id": user.get("id") if user else None,
        "operator_username": user.get("username") if user else attempted_username,
        "operator_display_name": user.get("display_name") if user else None,
        "operator_role": user.get("role") if user else None,
    }


def _write_audit_log(
    request: Request,
    module: str,
    action: str,
    result: str,
    *,
    current_user: Optional[dict] = None,
    attempted_username: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    target_name: Optional[str] = None,
    file_name: Optional[str] = None,
    detail: Optional[str] = None,
    metadata: Optional[dict] = None,
) -> None:
    actor = _build_audit_actor(current_user, attempted_username=attempted_username)
    create_audit_log(
        module=module,
        action=action,
        result=result,
        target_type=target_type,
        target_id=target_id,
        target_name=target_name,
        file_name=file_name,
        detail=detail,
        request_method=request.method,
        request_path=request.url.path,
        ip_address=_get_request_ip(request),
        user_agent=request.headers.get("user-agent"),
        metadata=metadata,
        **actor,
    )


async def _authenticate_with_available_sources(username: str, password: str) -> dict:
    existing_user = get_user_by_username(username)

    if existing_user and existing_user.get("auth_source") == "local":
        user = authenticate_user(username, password)
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid username or password")
        return user

    local_user = authenticate_user(username, password)
    if local_user is not None:
        return local_user

    if not is_external_auth_enabled():
        raise HTTPException(status_code=401, detail="Invalid username or password")

    try:
        external_user = await authenticate_external_user(username, password)
    except ExternalAuthError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc

    if external_user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    try:
        return upsert_external_user(
            username=external_user["username"],
            display_name=external_user["display_name"],
            email=external_user.get("email"),
            external_profile=external_user.get("profile"),
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.middleware("http")
async def authentication_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    public_paths = {
        "/api/health",
        "/api/auth/login",
        "/api/auth/logout",
        "/api/auth/me",
    }
    request.state.current_user = None

    if path.startswith("/api") and path not in public_paths:
        session_token = get_session_cookie_from_headers(request.headers.get("cookie"))
        if not session_token:
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})

        current_user = get_user_by_session_token(session_token)
        if current_user is None:
            return JSONResponse(status_code=401, content={"detail": "Authentication required"})
        if current_user["status"] != "active":
            delete_user_session(session_token)
            response = JSONResponse(status_code=403, content={"detail": "Account is disabled"})
            cookie_settings = get_session_cookie_settings()
            response.delete_cookie(cookie_settings["key"], path=cookie_settings["path"])
            return response

        request.state.current_user = current_user
        admin_only_prefixes = ("/api/users", "/api/audit-logs")
        if path.startswith(admin_only_prefixes) and current_user["role"] != "admin":
            _write_audit_log(
                request,
                module="系统管理",
                action="越权访问",
                result="failure",
                current_user=current_user,
                target_type="接口",
                target_name=f"{request.method} {path}",
                detail="Admin access required",
            )
            return JSONResponse(status_code=403, content={"detail": "Admin access required"})
    elif path.startswith("/api/auth"):
        session_token = get_session_cookie_from_headers(request.headers.get("cookie"))
        if session_token:
            current_user = get_user_by_session_token(session_token)
            if current_user and current_user["status"] == "active":
                request.state.current_user = current_user

    return await call_next(request)


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request, response: Response):
    """用户登录并写入会话 Cookie"""
    try:
        user = await _authenticate_with_available_sources(body.username, body.password)
        if user["status"] != "active":
            raise HTTPException(status_code=403, detail="Account is disabled")
    except HTTPException as exc:
        _write_audit_log(
            request,
            module="认证",
            action="登录",
            result="failure",
            attempted_username=body.username,
            target_type="用户",
            target_name=body.username,
            detail=str(exc.detail),
        )
        raise

    session_token = create_user_session(user["id"], duration_days=SESSION_DURATION_DAYS)
    cookie_settings = get_session_cookie_settings()
    response.set_cookie(
        cookie_settings["key"],
        session_token,
        httponly=cookie_settings["httponly"],
        secure=cookie_settings["secure"],
        samesite=cookie_settings["samesite"],
        path=cookie_settings["path"],
        max_age=cookie_settings["max_age"],
    )
    _write_audit_log(
        request,
        module="认证",
        action="登录",
        result="success",
        current_user=user,
        target_type="用户",
        target_id=str(user["id"]),
        target_name=user["username"],
        detail="用户登录成功",
    )
    return LoginResponse(success=True, user=_serialize_auth_user(user))


@app.get("/api/auth/me", response_model=AuthUserResponse)
async def get_current_user_profile(request: Request):
    """返回当前登录用户"""
    current_user = _get_request_user(request)
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return _serialize_auth_user(current_user)


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    """登出当前会话"""
    session_token = get_session_cookie_from_headers(request.headers.get("cookie"))
    current_user = _get_request_user(request)
    if session_token:
        delete_user_session(session_token)
    cookie_settings = get_session_cookie_settings()
    response.delete_cookie(cookie_settings["key"], path=cookie_settings["path"])
    if current_user is not None:
        _write_audit_log(
            request,
            module="认证",
            action="退出登录",
            result="success",
            current_user=current_user,
            target_type="用户",
            target_id=str(current_user["id"]),
            target_name=current_user["username"],
            detail="用户退出登录",
        )
    return {"success": True}


@app.get("/api/audit-logs")
async def api_list_audit_logs(
    keyword: Optional[str] = None,
    module: Optional[str] = None,
    result: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    return {
        "success": True,
        "data": list_audit_logs(keyword=keyword, module=module, result=result, limit=limit, offset=offset),
        "total": count_audit_logs(keyword=keyword, module=module, result=result),
    }


@app.get("/api/users")
async def api_list_users(
    keyword: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
):
    """管理员获取用户列表"""
    return {"success": True, "data": list_users(keyword=keyword, role=role, status=status)}


@app.post("/api/users", response_model=UserRecordResponse)
async def api_create_user(body: UserCreateRequest, request: Request):
    """管理员创建用户"""
    try:
        user = create_user(
            username=body.username,
            password=body.password,
            display_name=body.display_name,
            email=body.email,
            role=body.role,
        )
        _write_audit_log(
            request,
            module="系统管理",
            action="创建用户",
            result="success",
            current_user=_get_request_user(request),
            target_type="用户",
            target_id=str(user["id"]),
            target_name=user["username"],
            detail=f"创建用户 {user['username']}",
        )
        return _serialize_user_record(user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=409, detail="Username already exists")
        raise


@app.put("/api/users/{user_id}", response_model=UserRecordResponse)
async def api_update_user(user_id: int, body: UserUpdateRequest, request: Request):
    """管理员更新用户资料"""
    try:
        user = update_user(
            user_id,
            display_name=body.display_name,
            email=body.email,
            role=body.role,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    _write_audit_log(
        request,
        module="系统管理",
        action="编辑用户",
        result="success",
        current_user=_get_request_user(request),
        target_type="用户",
        target_id=str(user["id"]),
        target_name=user["username"],
        detail=f"更新用户资料，角色={user['role']}",
    )
    return _serialize_user_record(user)


@app.put("/api/users/{user_id}/status", response_model=UserRecordResponse)
async def api_update_user_status(user_id: int, body: UserStatusUpdateRequest, request: Request):
    """管理员启用或禁用用户"""
    current_user = _get_request_user(request)
    if current_user and current_user["id"] == user_id and body.status != "active":
        raise HTTPException(status_code=400, detail="You cannot disable your own account")
    try:
        user = update_user_status(user_id, body.status)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    _write_audit_log(
        request,
        module="系统管理",
        action="更新用户状态",
        result="success",
        current_user=current_user,
        target_type="用户",
        target_id=str(user["id"]),
        target_name=user["username"],
        detail=f"状态更新为 {user['status']}",
    )
    return _serialize_user_record(user)


@app.put("/api/users/{user_id}/password")
async def api_reset_user_password(user_id: int, body: UserPasswordResetRequest, request: Request):
    """管理员重置用户密码"""
    try:
        user = reset_user_password(user_id, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    _write_audit_log(
        request,
        module="系统管理",
        action="重置密码",
        result="success",
        current_user=_get_request_user(request),
        target_type="用户",
        target_id=str(user["id"]),
        target_name=user["username"],
        detail=f"重置用户密码: {user['username']}",
    )
    return {"success": True}


@app.delete("/api/users/{user_id}")
async def api_delete_user(user_id: int, request: Request):
    """管理员删除用户"""
    current_user = _get_request_user(request)
    if current_user and current_user["id"] == user_id:
        raise HTTPException(status_code=400, detail="You cannot delete your own account")
    target_user = get_user(user_id)
    try:
        deleted = delete_user(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user is not None:
        _write_audit_log(
            request,
            module="系统管理",
            action="删除用户",
            result="success",
            current_user=current_user,
            target_type="用户",
            target_id=str(target_user["id"]),
            target_name=target_user["username"],
            detail=f"删除用户 {target_user['username']}",
        )
    return {"success": True}


@app.get("/api/health")
async def health_check() -> HealthResponse:
    """健康检查"""
    return HealthResponse(status="ok", version="1.0.0")


@app.post("/api/analyze")
async def analyze(
    code_changes: UploadFile = File(..., description="代码改动JSON文件"),
    test_cases_file: UploadFile = File(..., description="测试用例CSV/Excel文件"),
    mapping_file: Optional[UploadFile] = File(default=None, description="映射关系CSV文件（可选，不传则用全局映射）"),
    use_ai: bool = Form(default=True, description="是否使用AI分析"),
):
    """
    完整的代码分析流程：
    1. 解析文件
    2. 差异分析
    3. 覆盖分析
    4. 评分
    5. AI分析（可选）
    """
    start_time = time.time()

    try:
        # ---- 1. 读取和校验文件 ----
        code_content = await code_changes.read()
        test_content = await test_cases_file.read()

        # 校验文件
        err = validate_file(code_changes.filename or "", code_content, ["json"])
        if err:
            raise HTTPException(status_code=400, detail=err)

        err = validate_file(test_cases_file.filename or "", test_content, ["csv", "excel"])
        if err:
            raise HTTPException(status_code=400, detail=err)

        # ---- 2. 解析文件 ----
        # 代码改动
        code_data = parse_json(code_content)
        diff_result = analyze_code_changes(json.dumps(code_data))

        if diff_result.error:
            raise HTTPException(status_code=400, detail=f"代码改动分析失败: {diff_result.error}")

        # 映射关系：优先用上传的文件，否则用全局映射
        if mapping_file is not None:
            mapping_content = await mapping_file.read()
            err = validate_file(mapping_file.filename or "", mapping_content, ["csv"])
            if err:
                raise HTTPException(status_code=400, detail=err)
            mapping_rows = parse_csv(mapping_content)
            mapping_entries = parse_mapping_data(mapping_rows)
        else:
            # 使用全局映射
            latest_mapping = get_latest_global_mapping()
            if latest_mapping is None or not latest_mapping.get("mapping_data"):
                raise HTTPException(status_code=400, detail="未上传映射文件且未配置全局映射，请先在『映射管理』中上传映射文件")
            from services.coverage_analyzer import MappingEntry
            mapping_entries = [
                MappingEntry(
                    package_name=m["package_name"],
                    class_name=m["class_name"],
                    method_name=m["method_name"],
                    description=m["description"],
                )
                for m in latest_mapping["mapping_data"]
            ]

        # 测试用例
        test_file_type = detect_file_type(test_cases_file.filename or "")
        if test_file_type == "csv":
            test_rows = parse_csv(test_content)
        elif test_file_type == "excel":
            test_rows = parse_excel(test_content)
        else:
            raise HTTPException(status_code=400, detail="测试用例文件格式不支持")

        test_case_list = parse_test_cases(test_rows)

        # ---- 3. AST分析提取变更方法 ----
        changed_methods = []
        code_json = parse_code_changes_data(code_data)
        for i in range(len(code_json.get("current", []))):
            current = code_json["current"][i] if i < len(code_json["current"]) else ""
            history = code_json["history"][i] if i < len(code_json["history"]) else ""
            methods = extract_changed_methods(current, history)
            for m in methods:
                changed_methods.append({
                    "package_name": m.package_name,
                    "class_name": m.class_name,
                    "method_name": m.method_name,
                })

        # ---- 4. 覆盖分析 ----
        coverage_result = analyze_coverage(changed_methods, mapping_entries, test_case_list)

        # ---- 5. 评分 ----
        score_result = calculate_score(
            total_changed_methods=coverage_result.total_changed_methods,
            covered_count=len(coverage_result.covered_methods),
            test_cases=test_case_list,
        )

        # ---- 6. AI分析（可选）----
        ai_result = None
        ai_cost = None
        if use_ai:
            diff_summary = format_diff_summary(diff_result)
            mapping_text = "\n".join(
                f"{e.package_name}.{e.class_name}.{e.method_name} -> {e.description}"
                for e in mapping_entries
            )
            test_text = "\n".join(
                f"{tc.test_id}: {tc.test_function} | {tc.test_steps} | {tc.expected_result}"
                for tc in test_case_list
            )

            messages = build_analysis_messages(diff_summary, mapping_text, test_text)
            ai_response = await call_deepseek(messages)

            if "error" in ai_response:
                ai_result = {"error": ai_response["error"]}
            else:
                ai_result = ai_response["result"]
                ai_cost = calculate_cost(
                    ai_response["usage"],
                    provider=ai_response.get("provider_key"),
                )

        # ---- 组装返回结果 ----
        duration_ms = int((time.time() - start_time) * 1000)

        result = {
            "diff_analysis": {
                "total_files": len(diff_result.diffs),
                "total_added": diff_result.total_added,
                "total_removed": diff_result.total_removed,
                "files": [
                    {
                        "package": d.package_path,
                        "added": len(d.added_lines),
                        "removed": len(d.removed_lines),
                    }
                    for d in diff_result.diffs
                ],
            },
            "coverage": {
                "total_changed_methods": coverage_result.total_changed_methods,
                "covered": coverage_result.covered_methods,
                "uncovered": coverage_result.uncovered_methods,
                "coverage_rate": coverage_result.coverage_rate,
                "details": coverage_result.coverage_details,
            },
            "score": {
                "total_score": score_result.total_score,
                "grade": score_result.grade,
                "summary": score_result.summary,
                "dimensions": [
                    {
                        "dimension": d.dimension,
                        "score": d.score,
                        "weight": d.weight,
                        "weighted_score": d.weighted_score,
                        "details": d.details,
                    }
                    for d in score_result.dimensions
                ],
            },
            "test_case_count": len(test_case_list),
            "ai_analysis": ai_result,
            "ai_cost": ai_cost,
            "duration_ms": duration_ms,
        }

        return AnalyzeResponse(success=True, data=result, duration_ms=duration_ms)

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"分析失败: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


def parse_code_changes_data(data: dict) -> dict:
    """从JSON数据中提取current/history"""
    if "data" in data:
        return normalize_code_changes_payload(data["data"])
    if "current" in data and "history" in data:
        return normalize_code_changes_payload(data)
    return {"current": [], "history": []}


def parse_tabular_rows(filename: str, content: bytes) -> tuple[str, list[dict]]:
    """Parse CSV/Excel content into rows."""
    err = validate_file(filename, content, ["csv", "excel"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    file_type = detect_file_type(filename)
    if file_type == "csv":
        rows = parse_csv(content)
    elif file_type == "excel":
        rows = parse_excel(content)
    else:
        raise HTTPException(
            status_code=400,
            detail="仅支持 Excel 或 CSV 文件",
        )

    return file_type, rows


@app.post("/api/upload/validate")
async def validate_upload(file: UploadFile = File(...)):
    """仅校验文件格式，不做分析"""
    content = await file.read()
    err = validate_file(
        file.filename or "",
        content,
        ["csv", "excel", "json"],
    )
    if err:
        return JSONResponse(status_code=400, content={"valid": False, "error": err})

    file_type = detect_file_type(file.filename or "")
    row_count = 0
    try:
        if file_type == "csv":
            rows = parse_csv(content)
            row_count = len(rows)
        elif file_type == "excel":
            rows = parse_excel(content)
            row_count = len(rows)
        elif file_type == "json":
            parse_json(content)
    except (ValueError, ImportError) as e:
        return JSONResponse(status_code=400, content={"valid": False, "error": str(e)})

    return {"valid": True, "file_type": file_type, "row_count": row_count}


@app.post("/api/issue-analysis/import")
async def import_issue_analysis(file: UploadFile = File(..., description="生产问题Excel/CSV文件")):
    """导入生产问题文件并输出统计图表数据"""
    start_time = time.time()
    content = await file.read()

    err = validate_file(file.filename or "", content, ["csv", "excel"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    file_type = detect_file_type(file.filename or "")
    try:
        if file_type == "csv":
            rows = parse_csv(content)
        elif file_type == "excel":
            rows = parse_excel(content)
        else:
            raise HTTPException(status_code=400, detail="仅支持 Excel 或 CSV 文件")

        result = analyze_issue_rows(rows)
        duration_ms = int((time.time() - start_time) * 1000)
        return AnalyzeResponse(success=True, data=result, duration_ms=duration_ms)
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"生产问题分析失败: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


# ============ 文件管理路由 ============

@app.get("/api/production-issue-files")
async def api_list_production_issue_files():
    """List uploaded production issue files."""
    return {"success": True, "data": list_production_issue_files()}


@app.post("/api/production-issue-files")
async def api_upload_production_issue_file(
    request: Request,
    file: UploadFile = File(..., description="Production issue Excel or CSV file"),
):
    """Upload and persist a production issue file."""
    content = await file.read()

    try:
        file_type, rows = parse_tabular_rows(file.filename or "", content)
        analyze_issue_rows(rows)

        record = save_production_issue_file(
            file_name=file.filename or "未命名文件",
            file_type=file_type,
            file_size=len(content),
            row_count=len(rows),
            content=content,
        )
        _write_audit_log(
            request,
            module="配置管理",
            action="上传生产问题文件",
            result="success",
            current_user=_get_request_user(request),
            target_type="文件",
            target_id=str(record["id"]),
            target_name=record["file_name"],
            file_name=record["file_name"],
            detail=f"上传生产问题文件 {record['file_name']}",
        )
        return {"success": True, "data": record}
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"failed to save production issue file: {e}")
        raise HTTPException(
            status_code=500,
            detail="服务器内部错误",
        )


@app.get("/api/production-issue-files/{file_id}/analysis")
async def api_get_production_issue_file_analysis(file_id: int):
    """Analyze a stored production issue file."""
    record = get_production_issue_file(file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="生产问题文件不存在")

    try:
        file_type = record["file_type"]
        content = record["content"]
        if file_type == "csv":
            rows = parse_csv(content)
        elif file_type == "excel":
            rows = parse_excel(content)
        else:
            raise HTTPException(status_code=400, detail="仅支持 Excel 或 CSV 文件")

        result = analyze_issue_rows(rows)
        return {"success": True, "data": result}
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"failed to analyze stored production issue file: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@app.get("/api/test-issue-files")
async def api_list_test_issue_files(project_id: Optional[int] = None):
    """List uploaded test issue files."""
    return {"success": True, "data": list_test_issue_files(project_id=project_id)}


@app.post("/api/test-issue-files")
async def api_upload_test_issue_file(
    project_id: int = Form(..., description="绑定的项目ID"),
    file: UploadFile = File(..., description="Test issue Excel or CSV file"),
):
    """Upload and persist a test issue file bound to a project."""
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    content = await file.read()

    try:
        file_type, rows = parse_tabular_rows(file.filename or "", content)
        analyze_defect_rows(rows)

        record = save_test_issue_file(
            project_id=project_id,
            file_name=file.filename or "未命名文件",
            file_type=file_type,
            file_size=len(content),
            row_count=len(rows),
            content=content,
        )
        return {"success": True, "data": record}
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"failed to save test issue file: {e}")
        raise HTTPException(
            status_code=500,
            detail="服务器内部错误",
        )


@app.get("/api/test-issue-files/{file_id}/analysis")
async def api_get_test_issue_file_analysis(file_id: int):
    """Generate analysis dashboard from a stored test issue file."""
    stored_file = get_test_issue_file(file_id)
    if stored_file is None:
        raise HTTPException(status_code=404, detail="测试问题文件不存在")

    content = stored_file["content"]
    file_type = stored_file["file_type"]

    try:
        if file_type == "csv":
            rows = parse_csv(content)
        elif file_type == "excel":
            rows = parse_excel(content)
        else:
            raise HTTPException(status_code=400, detail="仅支持 Excel 或 CSV 文件")

        result = analyze_defect_rows(rows)
        return {"success": True, "data": result}
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"failed to analyze stored test issue file: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


@app.get("/api/requirement-mapping-template")
async def api_download_requirement_mapping_template():
    template_content = build_requirement_mapping_template()
    return StreamingResponse(
        iter([template_content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": 'attachment; filename="requirement-mapping-template.xlsx"',
        },
    )


@app.get("/api/projects/{project_id}/requirement-mapping")
async def api_get_requirement_mapping_detail(project_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    mapping_record = get_requirement_mapping(project_id)
    if mapping_record is None:
        raise HTTPException(status_code=404, detail="需求映射关系不存在")

    return {"success": True, "data": _serialize_requirement_mapping(mapping_record)}


@app.post("/api/projects/{project_id}/requirement-mapping")
async def api_upload_requirement_mapping(
    project_id: int,
    file: UploadFile = File(..., description="需求映射关系 Excel 文件"),
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    content = await file.read()
    err = validate_file(file.filename or "", content, ["excel"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    try:
        parsed_mapping = parse_requirement_mapping_file(file.filename or "", content)
        saved_record = save_requirement_mapping(
            project_id=project_id,
            source_type="upload",
            groups=parsed_mapping["groups"],
            last_file_name=file.filename or "未命名文件",
            last_file_type=parsed_mapping["excel_subtype"],
            sheet_name=parsed_mapping["sheet_name"],
        )
        return {"success": True, "data": _serialize_requirement_mapping(saved_record)}
    except (ValueError, ImportError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(f"failed to save requirement mapping file: {exc}")
        raise HTTPException(status_code=500, detail="服务器内部错误") from exc


@app.put("/api/projects/{project_id}/requirement-mapping")
async def api_update_requirement_mapping(
    project_id: int,
    body: RequirementMappingUpdateRequest,
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    existing_record = get_requirement_mapping(project_id)

    try:
        groups = normalize_requirement_mapping_groups(
            [item.model_dump() for item in body.groups]
        )
        if not groups:
            deleted = delete_requirement_mapping(project_id)
            return {"success": True, "data": None, "deleted": deleted}

        source_type = "manual"
        if existing_record is not None and existing_record.get("source_type") in {"upload", "mixed"}:
            source_type = "mixed"

        saved_record = save_requirement_mapping(
            project_id=project_id,
            source_type=source_type,
            groups=groups,
            last_file_name=existing_record.get("last_file_name") if existing_record else None,
            last_file_type=existing_record.get("last_file_type") if existing_record else None,
            sheet_name=existing_record.get("sheet_name") if existing_record else None,
        )
        return {"success": True, "data": _serialize_requirement_mapping(saved_record)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(f"failed to update requirement mapping: {exc}")
        raise HTTPException(status_code=500, detail="服务器内部错误") from exc


@app.post("/api/requirement-analysis/analyze")
async def api_requirement_analysis(
    project_id: int = Form(..., description="??ID"),
    requirement_file: UploadFile = File(..., description="???? DOC/DOCX ??"),
    use_ai: bool = Form(default=True, description="????AI??"),
):
    """??????????????????????"""
    start_time = time.time()

    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="?????")

    requirement_content = await requirement_file.read()
    err = validate_file(requirement_file.filename or "", requirement_content, ["doc", "docx"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    try:
        parsed_document = parse_requirement_document(
            requirement_content,
            requirement_file.filename or "",
        )
        requirement_mapping_record = get_requirement_mapping(project_id)
        requirement_mapping_groups = (
            requirement_mapping_record.get("groups", [])
            if requirement_mapping_record is not None
            else []
        )
        result = analyze_requirement_points(
            parsed_document["points"],
            mapping_groups=requirement_mapping_groups,
        )

        ai_provider_label = get_ai_provider_label()
        ai_analysis: dict | None = {"provider": ai_provider_label, "enabled": use_ai}
        ai_cost = None
        token_usage = 0

        if use_ai and result["requirement_hits"]:
            ai_payload = [
                {
                    "requirement_point_id": hit["point_id"],
                    "section_number": hit["section_number"],
                    "section_title": hit["section_title"],
                    "requirement_text": hit["text"],
                    "mapping_matches": [
                        {
                            "tag": match["tag"],
                            "requirement_keyword": match["requirement_keyword"],
                            "matched_requirement_keyword": match.get("matched_requirement_keyword"),
                            "matched_scenarios": match.get("matched_scenarios", []),
                            "related_scenarios": match.get("related_scenarios", []),
                            "additional_scenarios": match.get("additional_scenarios", []),
                        }
                        for match in hit.get("mapping_matches", [])
                    ],
                }
                for hit in result["requirement_hits"]
            ]
            ai_response = await call_deepseek(
                build_requirement_analysis_messages(project["name"], ai_payload)
            )
            if "error" in ai_response:
                error_message = ai_response["error"]
                current_provider = ai_response.get("provider") or ai_provider_label
                if is_ai_configuration_error(error_message):
                    ai_analysis = {
                        "provider": current_provider,
                        "enabled": False,
                        "summary": f"?????{current_provider}?????????????????????????????",
                        "overall_assessment": "??????",
                        "key_findings": [
                            "???????????????????????????",
                        ],
                        "risk_table": [],
                    }
                else:
                    ai_analysis = {
                        "provider": current_provider,
                        "enabled": True,
                        "error": error_message,
                    }
            else:
                ai_analysis = _sanitize_requirement_ai_analysis(
                    {
                        "provider": ai_response.get("provider") or ai_provider_label,
                        "enabled": True,
                        **ai_response["result"],
                    },
                    result["requirement_hits"],
                )
                ai_cost = calculate_cost(
                    ai_response["usage"],
                    provider=ai_response.get("provider_key"),
                )
                token_usage = ai_response["usage"].get("total_tokens", 0)
        elif use_ai:
            ai_analysis = {
                "provider": ai_provider_label,
                "enabled": True,
                "summary": "?????????????????????????????????????",
                "overall_assessment": "???????",
                "key_findings": [
                    "?????????????????????????",
                    "???????????????????????????",
                ],
                "risk_table": [],
            }

        duration_ms = int((time.time() - start_time) * 1000)
        result["overview"]["use_ai"] = use_ai
        result["overview"]["duration_ms"] = duration_ms
        ai_analysis = ensure_requirement_ai_risk_table(
            ai_analysis,
            result.get("requirement_hits", []),
        )
        result["source_files"] = {
            "project_id": project_id,
            "project_name": project["name"],
            "requirement_file_name": requirement_file.filename or "???????",
            "requirement_mapping_available": requirement_mapping_record is not None,
            "requirement_mapping_source_type": requirement_mapping_record.get("source_type")
            if requirement_mapping_record is not None
            else None,
            "requirement_mapping_file_name": requirement_mapping_record.get("last_file_name")
            if requirement_mapping_record is not None
            else None,
            "requirement_mapping_group_count": requirement_mapping_record.get("group_count", 0)
            if requirement_mapping_record is not None
            else 0,
            "requirement_mapping_updated_at": requirement_mapping_record.get("updated_at")
            if requirement_mapping_record is not None
            else None,
        }
        result["score"] = calculate_requirement_score(result, ai_analysis)
        result["ai_analysis"] = ai_analysis
        result["ai_cost"] = ai_cost

        record = save_requirement_analysis_record(
            project_id=project_id,
            requirement_file_name=requirement_file.filename or "???????",
            section_snapshot=parsed_document,
            result_snapshot=result,
            ai_analysis=ai_analysis,
            token_usage=token_usage,
            cost=0.0,
            duration_ms=duration_ms,
        )

        return {
            "success": True,
            "data": {
                **result,
                "record_id": record["id"],
            },
            "duration_ms": duration_ms,
        }
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"??????: {e}")
        raise HTTPException(status_code=500, detail="???????")


@app.get("/api/requirement-analysis/records")
async def api_list_requirement_analysis_records(
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    records = list_requirement_analysis_records(project_id=project_id, limit=limit, offset=offset)
    return {"success": True, "data": [_serialize_requirement_record_summary(item) for item in records]}


@app.get("/api/requirement-analysis/rules")
async def api_list_requirement_analysis_rules():
    rules = list_requirement_analysis_rules()
    return {"success": True, "data": [_serialize_requirement_rule(item) for item in rules]}


@app.post("/api/requirement-analysis/rules")
async def api_create_requirement_analysis_rule(body: RequirementAnalysisRuleCreateRequest):
    try:
        rule = create_requirement_analysis_rule(body.rule_type, body.keyword)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"success": True, "data": _serialize_requirement_rule(rule)}


@app.put("/api/requirement-analysis/rules/{rule_id}")
async def api_update_requirement_analysis_rule(rule_id: int, body: RequirementAnalysisRuleUpdateRequest):
    try:
        rule = update_requirement_analysis_rule(rule_id, body.rule_type, body.keyword)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if rule is None:
        raise HTTPException(status_code=404, detail="过滤规则不存在")
    return {"success": True, "data": _serialize_requirement_rule(rule)}


@app.delete("/api/requirement-analysis/rules/{rule_id}")
async def api_delete_requirement_analysis_rule(rule_id: int):
    deleted = delete_requirement_analysis_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="过滤规则不存在")
    return {"success": True}


@app.get("/api/prompt-templates")
async def api_list_prompt_templates():
    templates = list_prompt_templates()
    return {"success": True, "data": [_serialize_prompt_template(item) for item in templates]}


@app.post("/api/prompt-templates")
async def api_create_prompt_template(body: PromptTemplateCreateRequest, request: Request):
    try:
        template = create_prompt_template(body.name, body.prompt)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    _write_audit_log(
        request,
        module="配置管理",
        action="新增提示词",
        result="success",
        current_user=_get_request_user(request),
        target_type="提示词",
        target_id=str(template["id"]),
        target_name=template["name"],
        detail=f"新增提示词 {template['name']}",
        metadata={"agent_key": template["agent_key"]},
    )
    return {"success": True, "data": _serialize_prompt_template(template)}


@app.put("/api/prompt-templates/{template_id}")
async def api_update_prompt_template(template_id: int, body: PromptTemplateUpdateRequest, request: Request):
    try:
        template = update_prompt_template(template_id, body.name, body.prompt)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    if template is None:
        raise HTTPException(status_code=404, detail="提示词不存在")

    _write_audit_log(
        request,
        module="配置管理",
        action="编辑提示词",
        result="success",
        current_user=_get_request_user(request),
        target_type="提示词",
        target_id=str(template["id"]),
        target_name=template["name"],
        detail=f"编辑提示词 {template['name']}",
        metadata={"agent_key": template["agent_key"]},
    )
    return {"success": True, "data": _serialize_prompt_template(template)}


@app.delete("/api/prompt-templates/{template_id}")
async def api_delete_prompt_template(template_id: int, request: Request):
    existing = get_prompt_template(template_id)
    if existing is None:
        raise HTTPException(status_code=404, detail="提示词不存在")

    deleted = delete_prompt_template(template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="提示词不存在")

    _write_audit_log(
        request,
        module="配置管理",
        action="删除提示词",
        result="success",
        current_user=_get_request_user(request),
        target_type="提示词",
        target_id=str(existing["id"]),
        target_name=existing["name"],
        detail=f"删除提示词 {existing['name']}",
        metadata={"agent_key": existing["agent_key"]},
    )
    return {"success": True}


@app.get("/api/requirement-analysis/records/{record_id}")
async def api_get_requirement_analysis_record_detail(record_id: int):
    record = get_requirement_analysis_record(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="需求分析记录不存在")
    return {"success": True, "data": _serialize_requirement_record_detail(record)}


@app.post("/api/defect-analysis/import")
async def import_defect_analysis(file: UploadFile = File(..., description="测试问题Excel/CSV文件")):
    """导入测试问题文件并输出统计图表数据"""
    start_time = time.time()
    content = await file.read()

    err = validate_file(file.filename or "", content, ["csv", "excel"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    file_type = detect_file_type(file.filename or "")
    try:
        if file_type == "csv":
            rows = parse_csv(content)
        elif file_type == "excel":
            rows = parse_excel(content)
        else:
            raise HTTPException(status_code=400, detail="仅支持 Excel 或 CSV 文件")

        result = analyze_defect_rows(rows)
        duration_ms = int((time.time() - start_time) * 1000)
        return AnalyzeResponse(success=True, data=result, duration_ms=duration_ms)
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"测试问题分析失败: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


# ============ 项目管理路由 ============

@app.get("/api/projects")
async def api_list_projects():
    """列出所有项目"""
    projects = list_projects()
    return {"success": True, "data": projects}


@app.post("/api/projects")
async def api_create_project(body: ProjectCreate, request: Request):
    """创建新项目"""
    project = create_project(name=body.name, description=body.description)
    _write_audit_log(
        request,
        module="项目管理",
        action="创建项目",
        result="success",
        current_user=_get_request_user(request),
        target_type="项目",
        target_id=str(project["id"]),
        target_name=project["name"],
        detail=f"创建项目 {project['name']}",
    )
    _write_audit_log(
        request,
        module="项目管理",
        action="编辑项目",
        result="success",
        current_user=_get_request_user(request),
        target_type="项目",
        target_id=str(project["id"]),
        target_name=project["name"],
        detail=f"更新项目 {project['name']}",
    )
    return {"success": True, "data": project}


@app.get("/api/projects/{project_id}")
async def api_get_project(project_id: int):
    """获取项目详情及统计信息"""
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    stats = get_project_stats(project_id)
    return {"success": True, "data": {**project, "stats": stats}}


@app.put("/api/projects/{project_id}")
async def api_update_project(project_id: int, body: ProjectUpdate, request: Request):
    """更新项目信息"""
    project = update_project(
        project_id=project_id,
        name=body.name,
        description=body.description,
    )
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"success": True, "data": project}


@app.delete("/api/projects/{project_id}")
async def api_delete_project(project_id: int):
    """删除项目"""
    deleted = delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"success": True, "message": "项目已删除"}


@app.post("/api/projects/{project_id}/mapping")
async def api_upload_project_mapping(
    project_id: int,
    mapping_file: UploadFile = File(..., description="代码映射关系 CSV / Excel 文件"),
):
    """上传映射文件绑定到项目"""
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    try:
        content = await mapping_file.read()
        err = validate_file(mapping_file.filename or "", content, ["csv", "excel"])
        if err:
            raise HTTPException(status_code=400, detail=err)

        mapping_file_type = detect_file_type(mapping_file.filename or "")
        if mapping_file_type == "csv":
            mapping_rows = parse_csv(content)
        elif mapping_file_type == "excel":
            mapping_rows = parse_excel(content)
        else:
            raise HTTPException(status_code=400, detail="仅支持 CSV 或 Excel 代码映射文件")

        mapping_data = normalize_project_mapping_entries(mapping_rows)

    except HTTPException:
        raise
    except (ValueError, ImportError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    updated = update_project(project_id=project_id, mapping_data=mapping_data)
    return {"success": True, "data": updated, "mapping_count": len(mapping_data)}


@app.post("/api/projects/{project_id}/mapping/entries")
async def api_create_project_mapping_entry(
    project_id: int,
    body: ProjectMappingEntryPayload,
):
    """向项目代码映射中保存单条映射；若方法已存在则覆盖更新"""
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    try:
        existing_entries = normalize_project_mapping_entries(
            project.get("mapping_data") or [],
            require_description=False,
        )
        next_entry = normalize_project_mapping_entries([body.model_dump()])[0]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    existing_index = next(
        (
            index
            for index, item in enumerate(existing_entries)
            if item["package_name"] == next_entry["package_name"]
            and item["class_name"] == next_entry["class_name"]
            and item["method_name"] == next_entry["method_name"]
        ),
        None,
    )

    if existing_index is None:
        next_mapping_data = [*existing_entries, next_entry]
        action = "created"
    else:
        next_mapping_data = [*existing_entries]
        next_mapping_data[existing_index] = next_entry
        action = "updated"

    updated = update_project(
        project_id=project_id,
        mapping_data=next_mapping_data,
    )
    return {
        "success": True,
        "data": updated,
        "mapping_count": len((updated or {}).get("mapping_data") or []),
        "action": action,
    }


@app.put("/api/projects/{project_id}/mapping/entries")
async def api_update_project_mapping_entry(
    project_id: int,
    body: ProjectMappingEntryUpdateRequest,
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    try:
        existing_entries = normalize_project_mapping_entries(
            project.get("mapping_data") or [],
            require_description=False,
        )
        next_entry = normalize_project_mapping_entries([body.entry.model_dump()])[0]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    original_key = _normalize_mapping_entry_key(
        body.original_key.package_name,
        body.original_key.class_name,
        body.original_key.method_name,
    )
    if not all(original_key):
        raise HTTPException(status_code=400, detail="original_key 缺少必要字段")

    target_index = next(
        (
            index
            for index, item in enumerate(existing_entries)
            if _normalize_mapping_entry_key(
                item.get("package_name"),
                item.get("class_name"),
                item.get("method_name"),
            ) == original_key
        ),
        None,
    )
    if target_index is None:
        raise HTTPException(status_code=404, detail="代码映射条目不存在")

    next_key = _normalize_mapping_entry_key(
        next_entry["package_name"],
        next_entry["class_name"],
        next_entry["method_name"],
    )
    has_conflict = any(
        index != target_index
        and _normalize_mapping_entry_key(
            item.get("package_name"),
            item.get("class_name"),
            item.get("method_name"),
        ) == next_key
        for index, item in enumerate(existing_entries)
    )
    if has_conflict:
        raise HTTPException(status_code=409, detail="代码映射条目已存在")

    next_mapping_data = [*existing_entries]
    next_mapping_data[target_index] = next_entry
    updated = update_project(project_id=project_id, mapping_data=next_mapping_data)
    return {
        "success": True,
        "data": updated,
        "mapping_count": len((updated or {}).get("mapping_data") or []),
        "action": "updated",
    }


@app.delete("/api/projects/{project_id}/mapping/entries")
async def api_delete_project_mapping_entry(
    project_id: int,
    package_name: str,
    class_name: str,
    method_name: str,
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    try:
        existing_entries = normalize_project_mapping_entries(
            project.get("mapping_data") or [],
            require_description=False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    target_key = _normalize_mapping_entry_key(package_name, class_name, method_name)
    if not all(target_key):
        raise HTTPException(status_code=400, detail="package_name/class_name/method_name 不能为空")

    target_index = next(
        (
            index
            for index, item in enumerate(existing_entries)
            if _normalize_mapping_entry_key(
                item.get("package_name"),
                item.get("class_name"),
                item.get("method_name"),
            ) == target_key
        ),
        None,
    )
    if target_index is None:
        raise HTTPException(status_code=404, detail="代码映射条目不存在")

    next_mapping_data = [item for index, item in enumerate(existing_entries) if index != target_index]
    updated = update_project(project_id=project_id, mapping_data=next_mapping_data)
    return {
        "success": True,
        "data": updated,
        "mapping_count": len((updated or {}).get("mapping_data") or []),
        "action": "deleted",
    }


@app.get("/api/project-mapping-template")
async def api_download_project_mapping_template():
    """下载代码映射关系模板"""
    template_content = build_project_mapping_template()
    headers = {
        "Content-Disposition": 'attachment; filename="code-mapping-template.xlsx"',
    }
    return StreamingResponse(
        io.BytesIO(template_content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


# ============ 分析记录路由 ============

@app.get("/api/records")
async def api_list_records(
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    """列出分析记录"""
    records = list_analysis_records(project_id=project_id, limit=limit, offset=offset)
    return {"success": True, "data": [_serialize_analysis_record(item) for item in records]}


@app.get("/api/records/{record_id}")
async def api_get_record(record_id: int):
    """获取单条分析记录"""
    record = get_analysis_record(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"success": True, "data": _serialize_analysis_record(record)}


@app.post("/api/case-quality/records")
async def api_create_case_quality_record(request: Request, body: CaseQualityRecordCreateRequest):
    project = get_project(body.project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    requirement_record = get_requirement_analysis_record(body.requirement_analysis_record_id)
    if requirement_record is None:
        raise HTTPException(status_code=404, detail="需求分析记录不存在")

    analysis_record = get_analysis_record(body.analysis_record_id)
    if analysis_record is None:
        raise HTTPException(status_code=404, detail="案例分析记录不存在")

    if (
        requirement_record["project_id"] != body.project_id
        or analysis_record["project_id"] != body.project_id
        or requirement_record["project_id"] != analysis_record["project_id"]
    ):
        raise HTTPException(status_code=400, detail="分析记录与项目不匹配")

    requirement_result_snapshot = requirement_record.get("result_snapshot_json") or {}
    requirement_section_snapshot = requirement_record.get("section_snapshot_json") or {}
    case_result_snapshot = _build_case_result_snapshot(analysis_record)
    (
        combined_result_snapshot,
        requirement_score,
        case_score,
        total_token_usage,
        total_cost,
        total_duration_ms,
    ) = _build_case_quality_combined_report(
        project=project,
        requirement_record=requirement_record,
        analysis_record=analysis_record,
        case_result_snapshot=case_result_snapshot,
    )

    saved_record = save_case_quality_record(
        project_id=body.project_id,
        requirement_analysis_record_id=body.requirement_analysis_record_id,
        analysis_record_id=body.analysis_record_id,
        requirement_file_name=requirement_record.get("requirement_file_name") or "未命名需求文档",
        code_changes_file_name=body.code_changes_file_name,
        test_cases_file_name=body.test_cases_file_name,
        requirement_score=requirement_score,
        case_score=case_score,
        total_token_usage=total_token_usage,
        total_cost=total_cost,
        total_duration_ms=total_duration_ms,
        requirement_section_snapshot=requirement_section_snapshot,
        requirement_result_snapshot=requirement_result_snapshot,
        case_result_snapshot=case_result_snapshot,
        combined_result_snapshot=combined_result_snapshot,
    )
    _write_audit_log(
        request,
        module="功能测试",
        action="生成案例质检报告",
        result="success",
        current_user=_get_request_user(request),
        target_type="案例质检记录",
        target_id=str(saved_record["id"]),
        target_name=project["name"],
        file_name=body.test_cases_file_name,
        detail=(
            f"项目 {project['name']} 生成案例质检报告，"
            f"需求记录 #{body.requirement_analysis_record_id}，分析记录 #{body.analysis_record_id}"
        ),
        metadata={
            "project_id": body.project_id,
            "requirement_analysis_record_id": body.requirement_analysis_record_id,
            "analysis_record_id": body.analysis_record_id,
            "code_changes_file_name": body.code_changes_file_name,
            "test_cases_file_name": body.test_cases_file_name,
        },
    )
    return {"success": True, "data": _serialize_case_quality_record_detail(saved_record)}


@app.get("/api/case-quality/records")
async def api_list_case_quality_records(
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    records = list_case_quality_records(project_id=project_id, limit=limit, offset=offset)
    return {"success": True, "data": [_serialize_case_quality_record_summary(item) for item in records]}


@app.get("/api/case-quality/records/{record_id}")
async def api_get_case_quality_record_detail(record_id: int):
    record = get_case_quality_record(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="案例质检记录不存在")
    return {"success": True, "data": _serialize_case_quality_record_detail(record)}


# ============ 项目分析路由 ============

@app.post("/api/projects/{project_id}/analyze")
async def api_analyze_with_project(
    request: Request,
    project_id: int,
    code_changes: UploadFile = File(..., description="代码改动JSON文件"),
    test_cases_file: UploadFile = File(..., description="测试用例CSV/Excel文件"),
    mapping_file: Optional[UploadFile] = File(default=None, description="映射关系CSV文件（可选，不提供则使用项目存储的映射）"),
    use_ai: bool = Form(default=True, description="是否使用AI分析"),
):
    """基于项目上下文的分析，结果自动保存到分析记录"""
    start_time = time.time()

    # 检查项目是否存在
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    try:
        # ---- 1. 读取和校验文件 ----
        code_content = await code_changes.read()
        test_content = await test_cases_file.read()

        err = validate_file(code_changes.filename or "", code_content, ["json"])
        if err:
            raise HTTPException(status_code=400, detail=err)

        err = validate_file(test_cases_file.filename or "", test_content, ["csv", "excel"])
        if err:
            raise HTTPException(status_code=400, detail=err)

        # ---- 2. 解析映射数据 ----
        if mapping_file is not None:
            mapping_content = await mapping_file.read()
            err = validate_file(mapping_file.filename or "", mapping_content, ["csv"])
            if err:
                raise HTTPException(status_code=400, detail=err)
            mapping_rows = parse_csv(mapping_content)
            mapping_entries = parse_mapping_data(mapping_rows)
        elif project.get("mapping_data"):
            # 使用项目存储的映射数据
            from services.coverage_analyzer import MappingEntry
            mapping_entries = [
                MappingEntry(
                    package_name=m["package_name"],
                    class_name=m["class_name"],
                    method_name=m["method_name"],
                    description=m["description"],
                )
                for m in project["mapping_data"]
            ]
        else:
            raise HTTPException(status_code=400, detail="未提供映射文件且项目未绑定映射数据")

        # ---- 3. 解析代码改动和测试用例 ----
        code_data = parse_json(code_content)
        diff_result = analyze_code_changes(json.dumps(code_data))

        if diff_result.error:
            raise HTTPException(status_code=400, detail=f"代码改动分析失败: {diff_result.error}")

        test_file_type = detect_file_type(test_cases_file.filename or "")
        if test_file_type == "csv":
            test_rows = parse_csv(test_content)
        elif test_file_type == "excel":
            test_rows = parse_excel(test_content)
        else:
            raise HTTPException(status_code=400, detail="测试用例文件格式不支持")

        test_case_list = parse_test_cases(test_rows)

        # ---- 4. AST分析提取变更方法 ----
        changed_methods = []
        code_json = parse_code_changes_data(code_data)
        for i in range(len(code_json.get("current", []))):
            current = code_json["current"][i] if i < len(code_json["current"]) else ""
            history = code_json["history"][i] if i < len(code_json["history"]) else ""
            methods = extract_changed_methods(current, history)
            for m in methods:
                changed_methods.append({
                    "package_name": m.package_name,
                    "class_name": m.class_name,
                    "method_name": m.method_name,
                })

        # ---- 5. 覆盖分析 ----
        coverage_result = analyze_coverage(changed_methods, mapping_entries, test_case_list)

        # ---- 6. 评分 ----
        score_result = calculate_score(
            total_changed_methods=coverage_result.total_changed_methods,
            covered_count=len(coverage_result.covered_methods),
            test_cases=test_case_list,
        )

        # ---- 7. AI分析（可选）----
        ai_result = None
        ai_cost = None
        token_usage = 0
        if use_ai:
            diff_summary = format_diff_summary(diff_result)
            mapping_text = "\n".join(
                f"{e.package_name}.{e.class_name}.{e.method_name} -> {e.description}"
                for e in mapping_entries
            )
            test_text = "\n".join(
                f"{tc.test_id}: {tc.test_function} | {tc.test_steps} | {tc.expected_result}"
                for tc in test_case_list
            )

            messages = build_analysis_messages(diff_summary, mapping_text, test_text)
            ai_response = await call_deepseek(messages)

            if "error" in ai_response:
                ai_result = {"error": ai_response["error"]}
            else:
                ai_result = ai_response["result"]
                ai_cost = calculate_cost(
                    ai_response["usage"],
                    provider=ai_response.get("provider_key"),
                )
                token_usage = ai_response["usage"].get("total_tokens", 0)

        # ---- 组装结果 ----
        duration_ms = int((time.time() - start_time) * 1000)

        result = {
            "diff_analysis": {
                "total_files": len(diff_result.diffs),
                "total_added": diff_result.total_added,
                "total_removed": diff_result.total_removed,
                "files": [
                    {
                        "package": d.package_path,
                        "added": len(d.added_lines),
                        "removed": len(d.removed_lines),
                    }
                    for d in diff_result.diffs
                ],
            },
            "coverage": {
                "total_changed_methods": coverage_result.total_changed_methods,
                "covered": coverage_result.covered_methods,
                "uncovered": coverage_result.uncovered_methods,
                "coverage_rate": coverage_result.coverage_rate,
                "details": coverage_result.coverage_details,
            },
            "score": {
                "total_score": score_result.total_score,
                "grade": score_result.grade,
                "summary": score_result.summary,
                "dimensions": [
                    {
                        "dimension": d.dimension,
                        "score": d.score,
                        "weight": d.weight,
                        "weighted_score": d.weighted_score,
                        "details": d.details,
                    }
                    for d in score_result.dimensions
                ],
            },
            "test_case_count": len(test_case_list),
            "ai_analysis": ai_result,
            "ai_cost": ai_cost,
            "duration_ms": duration_ms,
        }

        # ---- 保存分析记录 ----
        record = save_analysis_record(
            project_id=project_id,
            code_changes_summary=result["diff_analysis"],
            test_coverage_result=result["coverage"],
            test_score=score_result.total_score,
            score_snapshot=result["score"],
            ai_suggestions=ai_result,
            token_usage=token_usage,
            cost=0.0,
            duration_ms=duration_ms,
            test_case_count=len(test_case_list),
        )
        _write_audit_log(
            request,
            module="功能测试",
            action="案例分析",
            result="success",
            current_user=_get_request_user(request),
            target_type="分析记录",
            target_id=str(record["id"]),
            target_name=project["name"],
            file_name=test_cases_file.filename or code_changes.filename,
            detail=(
                f"项目 {project['name']} 完成案例分析，"
                f"代码文件 {code_changes.filename or '未命名文件'}，"
                f"测试用例文件 {test_cases_file.filename or '未命名文件'}"
            ),
            metadata={
                "project_id": project_id,
                "analysis_record_id": record["id"],
                "code_changes_file_name": code_changes.filename,
                "test_cases_file_name": test_cases_file.filename,
                "mapping_file_name": mapping_file.filename if mapping_file is not None else None,
                "use_ai": use_ai,
            },
        )

        return AnalyzeResponse(
            success=True,
            data={**result, "record_id": record["id"]},
            duration_ms=duration_ms,
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"项目分析失败: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


# ============ 接口自动化路由 ============
@app.post("/api/ai-tools/agents/chat")
async def api_chat_with_ai_agent(
    request: Request,
    question: str = Form(..., description="用户问题"),
    agent_key: Optional[str] = Form(default=None, description="AI助手标识"),
    custom_prompt: Optional[str] = Form(default=None, description="自定义AI助手提示词"),
    attachments: Optional[list[UploadFile]] = File(default=None, description="附件列表"),
):
    current_user = _get_request_user(request)
    question_text = question.strip()
    if not question_text:
        raise HTTPException(status_code=400, detail="请输入问题内容")

    try:
        agent_profile = resolve_ai_agent(agent_key, custom_prompt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    attachment_payloads: list[dict] = []
    for attachment in attachments or []:
        content = await attachment.read()
        err = validate_file(
            attachment.filename or "",
            content,
            SUPPORTED_AI_AGENT_ATTACHMENT_TYPES,
        )
        if err:
            raise HTTPException(status_code=400, detail=err)

        try:
            attachment_payload = extract_ai_agent_attachment_text(
                attachment.filename or "未命名附件",
                content,
            )
        except (ValueError, RuntimeError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        attachment_payloads.append(attachment_payload)

    messages = build_ai_agent_messages(question_text, agent_profile, attachment_payloads)
    ai_result = await call_ai_text(
        messages=messages,
        max_tokens=3000,
        temperature=0.2,
        timeout_seconds=120,
        max_retries=0,
    )
    if ai_result.get("error"):
        detail = str(ai_result["error"])
        status_code = 503 if is_ai_configuration_error(detail) else 502
        if "超时" in detail:
            status_code = 504
        raise HTTPException(status_code=status_code, detail=detail)

    _write_audit_log(
        request,
        module="AI辅助工具",
        action="AI助手问答",
        result="success",
        current_user=current_user,
        target_type="AI助手",
        target_name=str(agent_profile.get("name") or agent_profile.get("key") or "默认AI助手"),
        detail=f"提交问题并返回回答，附件数 {len(attachment_payloads)}",
        metadata={
            "agent_key": agent_profile.get("key"),
            "agent_name": agent_profile.get("name"),
            "attachment_count": len(attachment_payloads),
            "provider": ai_result.get("provider"),
            "builtin_agent_keys": [item["key"] for item in list_builtin_ai_agents()],
        },
    )

    return {
        "success": True,
        "data": {
            "answer": ai_result.get("answer") or ai_result.get("final_content") or "",
            "provider": ai_result.get("provider"),
            "provider_key": ai_result.get("provider_key"),
            "agent_key": agent_profile.get("key"),
            "agent_name": agent_profile.get("name"),
            "prompt_used": agent_profile.get("prompt"),
            "attachments": [
                {
                    "file_name": item["file_name"],
                    "file_type": item["file_type"],
                    "file_size": item["file_size"],
                    "excerpt": item["excerpt"],
                    "truncated": bool(item["content_truncated"]),
                }
                for item in attachment_payloads
            ],
        },
    }


@app.get("/api/projects/{project_id}/api-automation/environment")
async def api_get_api_automation_environment(project_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    config = get_api_test_environment_config(project_id)
    return {"success": True, "data": _serialize_api_test_environment_config(project_id, config)}


@app.put("/api/projects/{project_id}/api-automation/environment")
async def api_save_api_automation_environment(
    project_id: int,
    body: ApiAutomationEnvironmentUpdateRequest,
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    config = save_api_test_environment_config(
        project_id=project_id,
        base_url=body.base_url,
        timeout_ms=body.timeout_ms,
        auth_mode=body.auth_mode,
        common_headers=body.common_headers,
        auth_config=body.auth_config,
        signature_template=body.signature_template,
        login_binding=body.login_binding,
    )
    return {"success": True, "data": _serialize_api_test_environment_config(project_id, config)}


@app.post("/api/projects/{project_id}/api-automation/documents")
async def api_upload_api_automation_document(
    project_id: int,
    document_file: UploadFile = File(..., description="接口文档 PDF / Word / OpenAPI JSON/YAML"),
    use_ai: bool = Form(default=True, description="是否使用 AI 增强文档解析"),
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    content = await document_file.read()
    err = validate_file(document_file.filename or "", content, ["pdf", "doc", "docx", "json", "yaml"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    try:
        parsed = await parse_api_document(content, document_file.filename or "未命名接口文档", use_ai=use_ai)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    record = save_api_document_record(
        project_id=project_id,
        file_name=parsed["file_name"],
        file_type=detect_file_type(document_file.filename or ""),
        source_type=parsed["source_type"],
        raw_text_excerpt=parsed.get("raw_text_excerpt") or "",
        raw_text=parsed.get("raw_text") or "",
        endpoints=parsed.get("endpoints") or [],
        missing_fields=parsed.get("missing_fields") or [],
    )
    return {"success": True, "data": _serialize_api_document_record(record)}


@app.get("/api/projects/{project_id}/api-automation/documents/latest")
async def api_get_latest_api_automation_document(project_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    record = get_latest_api_document_record(project_id)
    return {"success": True, "data": _serialize_api_document_record(record) if record else None}


@app.post("/api/projects/{project_id}/api-automation/cases/generate")
async def api_generate_api_automation_cases(
    project_id: int,
    body: ApiAutomationCaseGenerateRequest,
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    document_record = get_latest_api_document_record(project_id)
    if document_record is None:
        raise HTTPException(status_code=404, detail="请先上传接口文档")

    start_time = time.time()
    generated = await generate_cases_with_ai(document_record, use_ai=body.use_ai)
    duration_ms = int((time.time() - start_time) * 1000)
    suite = save_api_test_suite(
        project_id=project_id,
        document_record_id=document_record["id"],
        name=body.name or f"{document_record['file_name']} 用例集",
        endpoints=document_record.get("endpoints") or [],
        cases=generated.get("cases") or [],
        ai_analysis=generated.get("ai_analysis"),
        token_usage=generated.get("token_usage", 0),
        cost=0.0,
        duration_ms=duration_ms,
    )
    return {"success": True, "data": _serialize_api_test_suite(suite)}


@app.get("/api/projects/{project_id}/api-automation/suites/latest")
async def api_get_latest_api_automation_suite(project_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    suite = get_latest_api_test_suite(project_id)
    return {"success": True, "data": _serialize_api_test_suite(suite) if suite else None}


@app.get("/api/projects/{project_id}/api-automation/suites/{suite_id}")
async def api_get_api_automation_suite(project_id: int, suite_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    suite = get_api_test_suite(suite_id)
    if suite is None or suite["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="接口自动化用例集不存在")
    return {"success": True, "data": _serialize_api_test_suite(suite)}


@app.put("/api/projects/{project_id}/api-automation/suites/{suite_id}")
async def api_update_api_automation_suite(
    project_id: int,
    suite_id: int,
    body: ApiAutomationSuiteUpdateRequest,
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    existing_suite = get_api_test_suite(suite_id)
    if existing_suite is None or existing_suite["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="接口自动化用例集不存在")
    suite = save_api_test_suite(
        project_id=project_id,
        document_record_id=existing_suite.get("document_record_id"),
        name=body.name,
        endpoints=body.endpoints if body.endpoints is not None else (existing_suite.get("endpoints") or []),
        cases=body.cases,
        ai_analysis=existing_suite.get("ai_analysis"),
        token_usage=existing_suite.get("token_usage", 0),
        cost=0.0,
        duration_ms=existing_suite.get("duration_ms", 0),
        suite_id=suite_id,
    )
    return {"success": True, "data": _serialize_api_test_suite(suite)}


@app.get("/api/projects/{project_id}/api-automation/runs")
async def api_list_api_automation_runs(project_id: int, limit: int = 50, offset: int = 0):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    runs = list_api_test_runs(project_id, limit=limit, offset=offset)
    return {"success": True, "data": [_serialize_api_test_run_summary(item) for item in runs]}


@app.post("/api/projects/{project_id}/api-automation/runs")
async def api_create_api_automation_run(project_id: int, body: ApiAutomationRunCreateRequest):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    suite = get_api_test_suite(body.suite_id)
    if suite is None or suite["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="接口自动化用例集不存在")
    environment = _serialize_api_test_environment_config(project_id, get_api_test_environment_config(project_id))
    report = await execute_api_test_suite(environment, suite)
    overview = report.get("overview") or {}
    run = save_api_test_run(
        project_id=project_id,
        suite_id=body.suite_id,
        status=str(overview.get("status") or "completed"),
        total_cases=int(overview.get("total_cases", 0)),
        passed_cases=int(overview.get("passed_cases", 0)),
        failed_cases=int(overview.get("failed_cases", 0)),
        blocked_cases=int(overview.get("blocked_cases", 0)),
        duration_ms=int(overview.get("duration_ms", 0)),
        environment_snapshot=report.get("environment_snapshot") or {},
        report_snapshot=report,
        items=report.get("items") or [],
    )
    return {"success": True, "data": _serialize_api_test_run_detail(run)}


@app.get("/api/projects/{project_id}/api-automation/runs/{run_id}")
async def api_get_api_automation_run(project_id: int, run_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    run = get_api_test_run(run_id)
    if run is None or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="接口自动化执行记录不存在")
    return {"success": True, "data": _serialize_api_test_run_detail(run)}


@app.get("/api/projects/{project_id}/api-automation/runs/{run_id}/report")
async def api_get_api_automation_run_report(project_id: int, run_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    run = get_api_test_run(run_id)
    if run is None or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="接口自动化执行记录不存在")
    return {"success": True, "data": run.get("report_snapshot") or {}}


@app.post("/api/projects/{project_id}/api-automation/runs/{run_id}/rerun")
async def api_rerun_api_automation_run(project_id: int, run_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    previous_run = get_api_test_run(run_id)
    if previous_run is None or previous_run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="接口自动化执行记录不存在")
    suite = get_api_test_suite(previous_run["suite_id"])
    if suite is None or suite["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="接口自动化用例集不存在")
    environment = _serialize_api_test_environment_config(project_id, get_api_test_environment_config(project_id))
    report = await execute_api_test_suite(environment, suite)
    overview = report.get("overview") or {}
    rerun = save_api_test_run(
        project_id=project_id,
        suite_id=previous_run["suite_id"],
        status=str(overview.get("status") or "completed"),
        total_cases=int(overview.get("total_cases", 0)),
        passed_cases=int(overview.get("passed_cases", 0)),
        failed_cases=int(overview.get("failed_cases", 0)),
        blocked_cases=int(overview.get("blocked_cases", 0)),
        duration_ms=int(overview.get("duration_ms", 0)),
        environment_snapshot=report.get("environment_snapshot") or {},
        report_snapshot=report,
        items=report.get("items") or [],
    )
    return {"success": True, "data": _serialize_api_test_run_detail(rerun)}


# ============ 全局映射管理路由 ============

@app.get("/api/mapping")
async def api_list_mappings():
    """获取所有全局映射列表"""
    mappings = list_global_mappings()
    return {"success": True, "data": mappings}


@app.get("/api/mapping/latest")
async def api_get_latest_mapping():
    """获取最新的全局映射详情"""
    mapping = get_latest_global_mapping()
    if mapping is None:
        return {"success": True, "data": None}
    return {"success": True, "data": mapping}


@app.get("/api/mapping/{mapping_id}")
async def api_get_mapping(mapping_id: int):
    """获取单个映射详情"""
    mapping = get_global_mapping(mapping_id)
    if mapping is None:
        raise HTTPException(status_code=404, detail="映射不存在")
    return {"success": True, "data": mapping}


@app.post("/api/mapping")
async def api_upload_mapping(
    mapping_file: UploadFile = File(..., description="映射关系CSV文件"),
):
    """上传全局映射文件"""
    content = await mapping_file.read()
    err = validate_file(mapping_file.filename or "", content, ["csv"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    mapping_rows = parse_csv(content)
    mapping_data = normalize_project_mapping_entries(mapping_rows)

    record = save_global_mapping(
        name=mapping_file.filename or "未命名",
        mapping_data=mapping_data,
        row_count=len(mapping_data),
    )
    return {"success": True, "data": record}


@app.delete("/api/mapping/{mapping_id}")
async def api_delete_mapping(mapping_id: int):
    """删除全局映射"""
    deleted = delete_global_mapping(mapping_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="映射不存在")
    return {"success": True, "message": "映射已删除"}

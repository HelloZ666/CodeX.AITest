"""
CodeTestGuard - FastAPI 鍏ュ彛

Vercel Serverless Function 鍏ュ彛鏂囦欢銆?
鎵€鏈?/api/* 璺敱閮界敱姝ゆ枃浠跺鐞嗐€?
"""

import io
import json
import re
import sys
import time
from contextlib import asynccontextmanager
from typing import Any, Optional
from urllib.parse import quote

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
    build_case_quality_test_advice_messages,
    build_requirement_analysis_messages,
    call_ai_text,
    call_deepseek,
    calculate_cost,
    get_ai_provider_label,
    is_ai_configuration_error,
)
from services.ai_agent import (
    SUPPORTED_AI_AGENT_ATTACHMENT_TYPES,
    build_ai_agent_conversation_title,
    build_ai_agent_messages,
    build_ai_agent_user_turn,
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
    parse_markdown_rows,
    detect_file_type,
    validate_file,
)
from services.issue_analysis import analyze_issue_rows
from services.defect_analysis import analyze_defect_rows
from services.performance_analysis import analyze_performance_workbook, load_workbook_sheets
from services.requirement_mapping import (
    build_requirement_mapping_template,
    flatten_requirement_mapping_groups,
    normalize_requirement_mapping_groups,
    parse_requirement_mapping_file,
)
from services.requirement_case_generator import generate_requirement_cases
from services.project_mapping import (
    build_project_mapping_template,
    normalize_project_mapping_entries,
)
from services.prompt_template_runtime import resolve_prompt_template_text
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
    create_ai_agent_conversation,
    create_knowledge_system_overview,
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
    delete_knowledge_system_overview,
    delete_requirement_mapping,
    delete_user_session,
    ensure_initial_admin,
    get_api_test_environment_config,
    get_api_test_run,
    get_api_test_suite,
    get_latest_api_document_record,
    get_latest_api_test_suite,
    get_analysis_record,
    get_ai_agent_conversation,
    get_db_path,
    get_shared_connection,
    get_functional_test_case_record,
    get_global_mapping,
    get_latest_global_mapping,
    get_knowledge_system_overview,
    get_knowledge_system_overview_by_project,
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
    list_ai_agent_messages,
    list_audit_logs,
    list_api_test_runs,
    list_case_quality_records,
    list_functional_test_case_records,
    list_global_mappings,
    list_knowledge_system_overviews,
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
    save_ai_agent_message,
    save_functional_test_case_record,
    save_global_mapping,
    save_requirement_mapping,
    save_requirement_analysis_record,
    get_user_by_username,
    update_prompt_template,
    update_requirement_analysis_rule,
    update_project,
    update_knowledge_system_overview,
    update_ai_agent_conversation,
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
from services.performance_analysis_file_store import (
    get_performance_analysis_file,
    list_performance_analysis_files,
    save_performance_analysis_file,
)
from services.test_issue_file_store import (
    get_test_issue_file,
    save_test_issue_file,
    list_test_issue_files,
)
from services.config_library_store import (
    build_requirement_document_hash,
    build_test_case_asset_hash,
    ensure_config_library_tables,
    get_requirement_document,
    list_requirement_documents,
    list_test_case_assets,
    get_test_case_asset,
    normalize_test_case_asset_cases,
    upsert_requirement_document,
    upsert_test_case_asset,
)


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    """搴旂敤鐢熷懡鍛ㄦ湡绠＄悊"""
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

# ============ 鍝嶅簲妯″瀷 ============

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
    test_manager_ids: list[int] = Field(default_factory=list)
    tester_ids: list[int] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    test_manager_ids: Optional[list[int]] = None
    tester_ids: Optional[list[int]] = None


class KnowledgeSystemOverviewCreateRequest(BaseModel):
    project_id: int
    title: Optional[str] = Field(default=None, max_length=255)
    outline_category: str = Field(default="功能视图", pattern="^(功能视图|通用模板)$")
    description: str = ""


class KnowledgeSystemOverviewUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    outline_category: Optional[str] = Field(default=None, pattern="^(功能视图|通用模板)$")
    description: Optional[str] = None
    mind_map_data: Optional[dict] = None
    source_format: Optional[str] = Field(default=None, pattern="^(manual|xmind|markdown)$")
    source_file_name: Optional[str] = Field(default=None, max_length=255)


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
    code_changes_file_name: Optional[str] = Field(default=None, max_length=255)
    test_cases_file_name: str = Field(min_length=1, max_length=255)
    use_ai: bool = True
    reasoning_level: Optional[str] = Field(default=None, pattern="^(low|medium|high)$")


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
    prompt_template_key: Optional[str] = Field(default=None, max_length=100)


class ApiAutomationSuiteUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    cases: list[dict]
    endpoints: Optional[list[dict]] = None


class ApiAutomationRunCreateRequest(BaseModel):
    suite_id: int


def _resolve_selected_prompt_template_text(
    use_ai: bool,
    prompt_template_key: str | None,
) -> str | None:
    if not use_ai:
        return None
    return resolve_prompt_template_text(prompt_template_key)


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


_ASSESSMENT_SPLIT_RE = re.compile(r"[,，。；;\r\n]+")
_PARENTHESIZED_COUNT_RE = re.compile(r"\((\d+)[^)]*\)")


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

        for matched in _PARENTHESIZED_COUNT_RE.finditer(details):
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


def _resolve_operator_name(record: dict) -> str | None:
    return record.get("operator_display_name") or record.get("operator_username")


def _resolve_creator_name(record: dict) -> str | None:
    return record.get("creator_display_name") or record.get("creator_username")


def _serialize_knowledge_system_overview_summary(record: dict) -> dict:
    return {
        "id": record["id"],
        "project_id": record["project_id"],
        "project_name": record.get("project_name"),
        "title": record.get("title"),
        "outline_category": record.get("outline_category") or "功能视图",
        "description": record.get("description") or "",
        "creator_name": _resolve_creator_name(record),
        "creator_user_id": record.get("creator_user_id"),
        "creator_username": record.get("creator_username"),
        "creator_display_name": record.get("creator_display_name"),
        "source_format": record.get("source_format") or "manual",
        "source_file_name": record.get("source_file_name"),
        "created_at": record.get("created_at"),
        "updated_at": record.get("updated_at") or record.get("created_at"),
    }


def _serialize_knowledge_system_overview_detail(record: dict) -> dict:
    return {
        **_serialize_knowledge_system_overview_summary(record),
        "mind_map_data": record.get("mind_map_data") or {},
    }


def _serialize_functional_test_case_record_summary(record: dict) -> dict:
    requirement_file_name = record["requirement_file_name"]
    normalized_name = (record.get("name") or "").strip()
    resolved_name = normalized_name or _build_case_name_fallback(requirement_file_name)
    return {
        "id": record["id"],
        "project_id": record.get("project_id"),
        "project_name": record.get("project_name"),
        "requirement_file_name": requirement_file_name,
        "name": resolved_name,
        "iteration_version": record.get("iteration_version"),
        "operator_name": _resolve_operator_name(record),
        "case_count": record.get("case_count", 0),
        "created_at": record.get("created_at"),
    }


def _serialize_functional_test_case_record_detail(record: dict) -> dict:
    return {
        **_serialize_functional_test_case_record_summary(record),
        "prompt_template_key": record.get("prompt_template_key"),
        "summary": record.get("summary") or "",
        "generation_mode": record.get("generation_mode") or "fallback",
        "provider": record.get("provider"),
        "ai_cost": record.get("ai_cost"),
        "error": record.get("error"),
        "cases": record.get("cases") or [],
        "operator_user_id": record.get("operator_user_id"),
        "operator_username": record.get("operator_username"),
        "operator_display_name": record.get("operator_display_name"),
    }


def _serialize_config_requirement_document(record: dict) -> dict:
    return {
        "id": record["id"],
        "file_name": record["file_name"],
        "file_type": record.get("file_type"),
        "file_size": record.get("file_size", 0),
        "project_id": record.get("project_id"),
        "project_name": record.get("project_name"),
        "source_page": record.get("source_page"),
        "operator_name": _resolve_operator_name(record),
        "operator_user_id": record.get("operator_user_id"),
        "operator_username": record.get("operator_username"),
        "operator_display_name": record.get("operator_display_name"),
        "operated_at": record.get("updated_at") or record.get("created_at"),
        "created_at": record.get("created_at"),
    }


def _serialize_config_test_case_asset_summary(record: dict) -> dict:
    return {
        "id": record["id"],
        "name": record["name"],
        "iteration_version": record.get("iteration_version"),
        "asset_type": record.get("asset_type"),
        "file_type": record.get("file_type"),
        "file_size": record.get("file_size", 0),
        "case_count": record.get("case_count", 0),
        "requirement_file_name": record.get("requirement_file_name"),
        "generation_mode": record.get("generation_mode"),
        "provider": record.get("provider"),
        "project_id": record.get("project_id"),
        "project_name": record.get("project_name"),
        "source_page": record.get("source_page"),
        "operator_name": _resolve_operator_name(record),
        "operator_user_id": record.get("operator_user_id"),
        "operator_username": record.get("operator_username"),
        "operator_display_name": record.get("operator_display_name"),
        "operated_at": record.get("updated_at") or record.get("created_at"),
        "created_at": record.get("created_at"),
    }


def _serialize_config_test_case_asset_detail(record: dict) -> dict:
    return {
        **_serialize_config_test_case_asset_summary(record),
        "prompt_template_key": record.get("prompt_template_key"),
        "cases": record.get("cases") or [],
    }


def _infer_storage_file_type(file_name: str, fallback: str = "unknown") -> str:
    normalized_name = (file_name or "").strip().lower()
    if "." in normalized_name:
        suffix = normalized_name.rsplit(".", 1)[-1]
        if suffix:
            return suffix
    return fallback


def _build_generated_test_case_asset_name(requirement_file_name: str) -> str:
    normalized = (requirement_file_name or "需求文档").strip()
    if "." in normalized:
        normalized = normalized.rsplit(".", 1)[0]
    return f"{normalized or '需求文档'}-测试用例"


def _resolve_requirement_document_media_type(file_type: Optional[str], file_name: str) -> str:
    normalized_file_type = (file_type or "").strip().lower() or _infer_storage_file_type(
        file_name,
        "bin",
    )
    return {
        "doc": "application/msword",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "md": "text/markdown; charset=utf-8",
        "markdown": "text/markdown; charset=utf-8",
        "pdf": "application/pdf",
        "txt": "text/plain; charset=utf-8",
    }.get(normalized_file_type, "application/octet-stream")


def _build_attachment_content_disposition(file_name: str, fallback_base_name: str) -> str:
    normalized_file_name = (file_name or fallback_base_name).strip() or fallback_base_name
    if "." in normalized_file_name:
        file_base_name, file_suffix = normalized_file_name.rsplit(".", 1)
        file_extension = f".{file_suffix}"
    else:
        file_base_name = normalized_file_name
        file_extension = ""

    ascii_base_name = re.sub(r"[^A-Za-z0-9_-]", "_", file_base_name).strip("._")
    ascii_file_name = f"{ascii_base_name or fallback_base_name}{file_extension}"
    encoded_file_name = quote(normalized_file_name, safe="")
    return f'attachment; filename="{ascii_file_name}"; filename*=UTF-8\'\'{encoded_file_name}'


def _build_case_name_fallback(requirement_file_name: str) -> str:
    normalized = (requirement_file_name or "requirement").strip()
    if "." in normalized:
        normalized = normalized.rsplit(".", 1)[0]
    return normalized or "requirement"


def _normalize_optional_text(value: Optional[str]) -> Optional[str]:
    normalized = (value or "").strip()
    return normalized or None


def _normalize_reasoning_level(value: Optional[str]) -> Optional[str]:
    normalized = (value or "").strip().lower()
    if not normalized:
        return None
    if normalized not in {"low", "medium", "high"}:
        raise HTTPException(status_code=400, detail="reasoning_level must be one of: low, medium, high")
    return normalized


def _parse_snapshot_form_field(raw_value: Optional[str], field_name: str) -> dict[str, Any]:
    normalized = (raw_value or "").strip()
    if not normalized:
        return {}
    try:
        parsed = json.loads(normalized)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"{field_name} must be valid JSON object") from exc
    if not isinstance(parsed, dict):
        raise HTTPException(status_code=400, detail=f"{field_name} must be JSON object")
    return parsed


def _build_requirement_mapping_preview_result(
    *,
    project: dict,
    project_id: int,
    requirement_file_name: str,
    parsed_document: dict,
) -> dict[str, Any]:
    requirement_mapping_record = get_requirement_mapping(project_id)
    requirement_mapping_groups = (
        requirement_mapping_record.get("groups", [])
        if requirement_mapping_record is not None
        else []
    )
    result = analyze_requirement_points(
        parsed_document.get("points") or [],
        mapping_groups=requirement_mapping_groups,
    )
    result["ai_analysis"] = None
    result["ai_cost"] = None
    result["score"] = calculate_requirement_score(result, None)
    result["source_files"] = {
        "project_id": project_id,
        "project_name": project["name"],
        "requirement_file_name": requirement_file_name,
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
    overview = result.get("overview") or {}
    overview["use_ai"] = False
    result["overview"] = overview
    return result


def _normalize_generation_result_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    raw_cases = snapshot.get("cases")
    if raw_cases is None:
        raw_cases = []
    if not isinstance(raw_cases, list):
        raise HTTPException(status_code=400, detail="generation_result_snapshot.cases must be array")
    normalized_cases = [item for item in raw_cases if isinstance(item, dict)]
    if len(normalized_cases) != len(raw_cases):
        raise HTTPException(status_code=400, detail="generation_result_snapshot.cases must contain objects")

    generation_mode = str(snapshot.get("generation_mode") or "fallback").strip() or "fallback"
    if generation_mode not in {"ai", "fallback"}:
        generation_mode = "fallback"

    ai_cost = snapshot.get("ai_cost")
    if ai_cost is not None and not isinstance(ai_cost, dict):
        ai_cost = None

    provider = snapshot.get("provider")
    if provider is not None:
        provider = str(provider).strip() or None

    error = snapshot.get("error")
    if error is not None:
        error = str(error).strip() or None

    return {
        **snapshot,
        "summary": str(snapshot.get("summary") or "").strip(),
        "generation_mode": generation_mode,
        "provider": provider,
        "ai_cost": ai_cost,
        "error": error,
        "cases": normalized_cases,
        "total": len(normalized_cases),
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


def _serialize_ai_agent_message(message: dict) -> dict:
    return {
        "id": message["id"],
        "role": message["role"],
        "content": message["content"],
        "attachments": message.get("attachments") or [],
        "agent_key": message.get("agent_key"),
        "agent_name": message.get("agent_name"),
        "provider": message.get("provider"),
        "provider_key": message.get("provider_key"),
        "created_at": message.get("created_at"),
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


def _compact_requirement_assessment(value: object, fallback: str = "鑱氱劍鏄犲皠鍥炲綊") -> str:
    text = _normalize_requirement_text(value)
    if not text:
        return fallback

    parts = [
        part.strip(" ,，。；;")
        for part in _ASSESSMENT_SPLIT_RE.split(text)
        if part.strip(" ,，。；;")
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


CASE_QUALITY_OPTIONAL_CODE_FILE_NAME = "未上传差异代码"


def _normalize_case_quality_code_file_name(file_name: Optional[str]) -> str:
    normalized = (file_name or "").strip()
    return normalized or CASE_QUALITY_OPTIONAL_CODE_FILE_NAME


def _build_empty_diff_analysis() -> dict:
    return {
        "total_files": 0,
        "total_added": 0,
        "total_removed": 0,
        "files": [],
    }


def _downgrade_case_score_without_diff(score_result, reason: str) -> None:
    normalized_reason = reason.strip() or "当前未识别到可用于覆盖评分的代码差异。"
    for dimension in score_result.dimensions:
        if dimension.dimension == "覆盖范围":
            dimension.score = 0.0
            dimension.weighted_score = 0.0
            dimension.details = normalized_reason
            break

    total_score = round(
        min(100.0, max(0.0, sum(dimension.weighted_score for dimension in score_result.dimensions))),
        1,
    )
    score_result.total_score = total_score
    score_result.grade = _resolve_case_analysis_grade(total_score)
    score_result.summary = "当前未识别到可用于覆盖评分的代码差异，已按测试用例内容做静态质量评估。"


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
        "ai_analysis": None,
        "ai_cost": None,
        "duration_ms": record.get("duration_ms", 0),
        "record_id": record.get("id"),
    }


def _sanitize_case_quality_priority(value: object) -> str:
    normalized = _normalize_requirement_text(value).upper()
    if normalized in {"P0", "HIGH", "H"}:
        return "P0"
    if normalized in {"P2", "LOW", "L"}:
        return "P2"
    if normalized.startswith("P0") or normalized.startswith("高"):
        return "P0"
    if normalized.startswith("P2") or normalized.startswith("低"):
        return "P2"
    return "P1"


def _parse_case_quality_method_identifier(method_name: object) -> Optional[tuple[str, str, str]]:
    normalized = _normalize_requirement_text(method_name)
    if not normalized:
        return None

    parts = normalized.split(".")
    if len(parts) < 3:
        return None

    return ".".join(parts[:-2]), parts[-2], parts[-1]


def _normalize_case_quality_mapping_entries(project: dict) -> list[dict]:
    raw_entries = project.get("mapping_data") or []
    if not raw_entries:
        return []

    try:
        return normalize_project_mapping_entries(raw_entries, require_description=False)
    except ValueError as exc:
        logger.warning(f"failed to normalize project mapping entries for case quality ai advice: {exc}")
        return []


def _build_case_quality_requirement_suggestions(requirement_result_snapshot: dict) -> list[str]:
    mapping_suggestions = requirement_result_snapshot.get("mapping_suggestions") or []
    suggestions: list[str] = []

    for item in mapping_suggestions:
        if not isinstance(item, dict):
            continue

        section_label = " ".join(
            part
            for part in (
                _normalize_requirement_text(item.get("section_number")),
                _normalize_requirement_text(item.get("section_title")),
            )
            if part
        )
        suggestion = _normalize_requirement_text(item.get("suggestion"))
        if not suggestion:
            continue
        suggestions.append(f"【{section_label}】{suggestion}" if section_label else suggestion)

    deduped_suggestions = _dedupe_requirement_texts(suggestions, limit=8)
    if deduped_suggestions:
        return deduped_suggestions

    requirement_hits = requirement_result_snapshot.get("requirement_hits") or []
    for hit in requirement_hits:
        if not isinstance(hit, dict):
            continue
        section_label = " ".join(
            part
            for part in (
                _normalize_requirement_text(hit.get("section_number")),
                _normalize_requirement_text(hit.get("section_title")),
            )
            if part
        )
        suggestion = _normalize_requirement_text(hit.get("mapping_suggestion"))
        if not suggestion:
            continue
        suggestions.append(f"【{section_label}】{suggestion}" if section_label else suggestion)

    deduped_hit_suggestions = _dedupe_requirement_texts(suggestions, limit=8)
    if deduped_hit_suggestions:
        return deduped_hit_suggestions

    mapping_hit_count = int((requirement_result_snapshot.get("overview") or {}).get("mapping_hit_count") or 0)
    if mapping_hit_count > 0:
        return [f"本次命中 {mapping_hit_count} 组需求映射，建议将同组关联场景一并纳入回归验证。"]

    return []


def _build_case_quality_code_suggestions(
    case_result_snapshot: dict,
    mapping_entries: list[dict],
) -> list[dict]:
    if not mapping_entries:
        return []

    mapping_lookup = {
        _normalize_mapping_entry_key(
            entry.get("package_name"),
            entry.get("class_name"),
            entry.get("method_name"),
        ): entry
        for entry in mapping_entries
        if any(_normalize_mapping_entry_key(
            entry.get("package_name"),
            entry.get("class_name"),
            entry.get("method_name"),
        ))
    }

    suggestions: list[dict] = []
    seen_keys: set[str] = set()
    coverage_details = (case_result_snapshot.get("coverage") or {}).get("details") or []

    for detail in coverage_details:
        if not isinstance(detail, dict):
            continue

        parsed_method = _parse_case_quality_method_identifier(detail.get("method"))
        if parsed_method is None:
            continue

        mapping_entry = mapping_lookup.get(parsed_method)
        if mapping_entry is None:
            continue

        key = ".".join(parsed_method)
        if key in seen_keys:
            continue
        seen_keys.add(key)

        suggestions.append(
            {
                "method": _normalize_requirement_text(detail.get("method")),
                "description": _normalize_requirement_text(mapping_entry.get("description"))
                or _normalize_requirement_text(detail.get("description")),
                "test_point": _normalize_requirement_text(mapping_entry.get("test_point")),
                "is_covered": bool(detail.get("is_covered")),
            }
        )

        if len(suggestions) >= 8:
            break

    return suggestions


def _build_case_quality_ai_payload(
    project: dict,
    requirement_result_snapshot: dict,
    case_result_snapshot: dict,
) -> dict:
    mapping_entries = _normalize_case_quality_mapping_entries(project)
    coverage_snapshot = case_result_snapshot.get("coverage") or {}
    coverage_details = coverage_snapshot.get("details") or []
    uncovered_details = [
        item for item in coverage_details
        if isinstance(item, dict) and not bool(item.get("is_covered"))
    ]
    covered_details = [
        item for item in coverage_details
        if isinstance(item, dict) and bool(item.get("is_covered"))
    ]

    requirement_hits_payload: list[dict] = []
    for hit in (requirement_result_snapshot.get("requirement_hits") or [])[:8]:
        if not isinstance(hit, dict):
            continue

        requirement_hits_payload.append(
            {
                "point_id": _normalize_requirement_text(hit.get("point_id")),
                "section_number": _normalize_requirement_text(hit.get("section_number")),
                "section_title": _normalize_requirement_text(hit.get("section_title")),
                "requirement_text": _normalize_requirement_text(hit.get("text"))[:240],
                "mapping_suggestion": _normalize_requirement_text(hit.get("mapping_suggestion")),
                "mapping_matches": [
                    {
                        "tag": _normalize_requirement_text(match.get("tag")),
                        "requirement_keyword": _normalize_requirement_text(match.get("requirement_keyword")),
                        "matched_requirement_keyword": _normalize_requirement_text(
                            match.get("matched_requirement_keyword")
                        ),
                        "matched_scenarios": _dedupe_requirement_texts(match.get("matched_scenarios", []), limit=5),
                        "related_scenarios": _dedupe_requirement_texts(match.get("related_scenarios", []), limit=5),
                        "additional_scenarios": _dedupe_requirement_texts(
                            match.get("additional_scenarios", []),
                            limit=5,
                        ),
                    }
                    for match in (hit.get("mapping_matches") or [])
                    if isinstance(match, dict)
                ][:4],
            }
        )

    unmatched_requirements_payload: list[dict] = []
    for item in (requirement_result_snapshot.get("unmatched_requirements") or [])[:5]:
        if not isinstance(item, dict):
            continue

        unmatched_requirements_payload.append(
            {
                "point_id": _normalize_requirement_text(item.get("point_id")),
                "section_number": _normalize_requirement_text(item.get("section_number")),
                "section_title": _normalize_requirement_text(item.get("section_title")),
                "requirement_text": _normalize_requirement_text(item.get("text"))[:200],
            }
        )

    def _serialize_coverage_items(items: list[dict], limit: int) -> list[dict]:
        serialized: list[dict] = []
        for item in items[:limit]:
            serialized.append(
                {
                    "method": _normalize_requirement_text(item.get("method")),
                    "description": _normalize_requirement_text(item.get("description")),
                    "matched_tests": _dedupe_requirement_texts(item.get("matched_tests", []), limit=6),
                }
            )
        return serialized

    return {
        "project": {
            "id": project.get("id"),
            "name": project.get("name"),
            "description": _normalize_requirement_text(project.get("description")),
        },
        "requirement_analysis": {
            "overview": requirement_result_snapshot.get("overview") or {},
            "score": requirement_result_snapshot.get("score") or {},
            "requirement_hits": requirement_hits_payload,
            "unmatched_requirements": unmatched_requirements_payload,
        },
        "case_analysis": {
            "diff_analysis": case_result_snapshot.get("diff_analysis") or {},
            "coverage": {
                "total_changed_methods": coverage_snapshot.get("total_changed_methods", 0),
                "covered_count": len(coverage_snapshot.get("covered") or []),
                "uncovered_count": len(coverage_snapshot.get("uncovered") or []),
                "coverage_rate": coverage_snapshot.get("coverage_rate", 0),
                "uncovered_methods": _serialize_coverage_items(uncovered_details, limit=8),
                "covered_methods": _serialize_coverage_items(covered_details, limit=5),
            },
            "score": case_result_snapshot.get("score") or {},
            "test_case_count": _resolve_test_case_count(case_result_snapshot),
        },
        "rule_suggestions": {
            "requirement_suggestions": _build_case_quality_requirement_suggestions(requirement_result_snapshot),
            "code_suggestions": _build_case_quality_code_suggestions(case_result_snapshot, mapping_entries),
        },
        "history_risks": [],
    }


def _sanitize_case_quality_advice_item(
    item: object,
    allowed_requirement_ids: set[str],
    allowed_methods: set[str],
) -> Optional[dict]:
    if not isinstance(item, dict):
        return None

    title = _normalize_requirement_text(item.get("title"))
    reason = _normalize_requirement_text(item.get("reason"))
    evidence = _normalize_requirement_text(item.get("evidence"))
    test_focus = _normalize_requirement_text(item.get("test_focus"))
    expected_risk = _normalize_requirement_text(item.get("expected_risk"))
    if not title or not (reason or evidence or test_focus):
        return None

    requirement_ids = [
        requirement_id
        for requirement_id in _dedupe_requirement_texts(item.get("requirement_ids", []), limit=6)
        if requirement_id in allowed_requirement_ids
    ]
    methods = [
        method_name
        for method_name in _dedupe_requirement_texts(item.get("methods", []), limit=6)
        if method_name in allowed_methods
    ]

    return {
        "title": title,
        "priority": _sanitize_case_quality_priority(item.get("priority")),
        "reason": reason,
        "evidence": evidence,
        "requirement_ids": requirement_ids,
        "methods": methods,
        "test_focus": test_focus,
        "expected_risk": expected_risk,
    }


def _sanitize_case_quality_ai_test_advice(
    ai_result: dict,
    requirement_result_snapshot: dict,
    case_result_snapshot: dict,
) -> dict:
    allowed_requirement_ids = {
        _normalize_requirement_text(item.get("point_id"))
        for item in [
            *(requirement_result_snapshot.get("requirement_hits") or []),
            *(requirement_result_snapshot.get("unmatched_requirements") or []),
        ]
        if isinstance(item, dict) and _normalize_requirement_text(item.get("point_id"))
    }
    allowed_methods = {
        _normalize_requirement_text(item.get("method"))
        for item in ((case_result_snapshot.get("coverage") or {}).get("details") or [])
        if isinstance(item, dict) and _normalize_requirement_text(item.get("method"))
    }

    def _sanitize_item_list(values: object, limit: int) -> list[dict]:
        sanitized_items: list[dict] = []
        seen_keys: set[str] = set()
        for raw_item in values or []:
            sanitized_item = _sanitize_case_quality_advice_item(
                raw_item,
                allowed_requirement_ids=allowed_requirement_ids,
                allowed_methods=allowed_methods,
            )
            if sanitized_item is None:
                continue
            dedupe_key = (
                f"{sanitized_item['priority']}::{sanitized_item['title']}::"
                f"{'|'.join(sanitized_item['requirement_ids'])}::{'|'.join(sanitized_item['methods'])}"
            )
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)
            sanitized_items.append(sanitized_item)
            if len(sanitized_items) >= limit:
                break
        return sanitized_items

    coverage_snapshot = case_result_snapshot.get("coverage") or {}
    uncovered_count = len(coverage_snapshot.get("uncovered") or [])
    mapping_hit_count = int((requirement_result_snapshot.get("overview") or {}).get("mapping_hit_count") or 0)
    total_changed_methods = int(coverage_snapshot.get("total_changed_methods") or 0)
    fallback_summary = (
        f"本次案例质检命中 {mapping_hit_count} 组需求映射，涉及变更方法 {total_changed_methods} 个，"
        f"其中未覆盖 {uncovered_count} 个，建议优先围绕高风险需求点与未覆盖方法补齐测试。"
    )
    fallback_assessment = "优先补齐未覆盖链路" if uncovered_count > 0 else "聚焦高风险回归"

    return {
        **ai_result,
        "summary": _normalize_requirement_text(ai_result.get("summary")) or fallback_summary,
        "overall_assessment": (
            _normalize_requirement_text(ai_result.get("overall_assessment"))[:24] or fallback_assessment
        ),
        "must_test": _sanitize_item_list(ai_result.get("must_test"), limit=5),
        "should_test": _sanitize_item_list(ai_result.get("should_test"), limit=5),
        "regression_scope": _dedupe_requirement_texts(ai_result.get("regression_scope", []), limit=8),
        "missing_information": _dedupe_requirement_texts(ai_result.get("missing_information", []), limit=6),
    }


async def _generate_case_quality_ai_test_advice(
    project: dict,
    requirement_result_snapshot: dict,
    case_result_snapshot: dict,
    reasoning_level: Optional[str] = None,
) -> tuple[dict, int, float, int]:
    start_time = time.time()
    ai_provider_label = get_ai_provider_label()
    payload = _build_case_quality_ai_payload(project, requirement_result_snapshot, case_result_snapshot)
    ai_response = await call_deepseek(
        build_case_quality_test_advice_messages(
            project_name=str(project.get("name") or ""),
            payload=payload,
        ),
        reasoning_level=reasoning_level,
    )
    duration_ms = int((time.time() - start_time) * 1000)

    if "error" in ai_response:
        error_message = ai_response["error"]
        current_provider = ai_response.get("provider") or ai_provider_label
        if is_ai_configuration_error(error_message):
            return (
                {
                    "provider": current_provider,
                    "enabled": False,
                    "summary": f"未生成 AI 测试意见，{current_provider} 当前未完成配置，可先参考下方规则建议。",
                    "overall_assessment": "AI 未启用",
                    "must_test": [],
                    "should_test": [],
                    "regression_scope": [],
                    "missing_information": [],
                    "error": error_message,
                },
                0,
                0.0,
                duration_ms,
            )

        return (
            {
                "provider": current_provider,
                "enabled": True,
                "summary": "AI 测试意见生成失败，请先参考下方规则建议并稍后重试。",
                "overall_assessment": "AI 杈撳嚭寮傚父",
                "must_test": [],
                "should_test": [],
                "regression_scope": [],
                "missing_information": [],
                "error": error_message,
            },
            0,
            0.0,
            duration_ms,
        )

    usage = ai_response.get("usage") or {}
    return (
        _sanitize_case_quality_ai_test_advice(
            {
                "provider": ai_response.get("provider") or ai_provider_label,
                "enabled": True,
                **(ai_response.get("result") or {}),
            },
            requirement_result_snapshot=requirement_result_snapshot,
            case_result_snapshot=case_result_snapshot,
        ),
        int(usage.get("total_tokens") or 0),
        0.0,
        duration_ms,
    )


async def _build_case_quality_combined_report(
    project: dict,
    requirement_record: dict,
    analysis_record: dict,
    case_result_snapshot: dict,
    use_ai: bool = True,
    reasoning_level: Optional[str] = None,
) -> tuple[dict, int, float, int, float, int]:
    requirement_result_snapshot = requirement_record.get("result_snapshot_json") or {}
    case_result_snapshot = _with_resolved_test_case_count(case_result_snapshot)
    requirement_report_snapshot = {
        **requirement_result_snapshot,
        "ai_analysis": None,
        "ai_cost": None,
    }
    requirement_score = int((requirement_result_snapshot.get("score") or {}).get("total_score") or 0)
    case_score = float((case_result_snapshot.get("score") or {}).get("total_score") or 0)
    if use_ai:
        ai_test_advice, advice_token_usage, advice_cost, _advice_duration_ms = await _generate_case_quality_ai_test_advice(
            project=project,
            requirement_result_snapshot=requirement_result_snapshot,
            case_result_snapshot=case_result_snapshot,
            reasoning_level=reasoning_level,
        )
    else:
        ai_test_advice = {
            "provider": get_ai_provider_label(),
            "enabled": False,
            "must_test": [],
            "should_test": [],
            "regression_scope": [],
            "missing_information": [],
            "error": "案例质检已关闭 AI，本次不会调用 AI 生成测试建议。",
        }
        advice_token_usage = 0
        advice_cost = 0.0
    total_token_usage = (
        int(requirement_record.get("token_usage", 0) or 0)
        + int(analysis_record.get("token_usage", 0) or 0)
        + advice_token_usage
    )
    total_cost = advice_cost
    total_duration_ms = int(requirement_record.get("duration_ms", 0) or 0) + int(analysis_record.get("duration_ms", 0) or 0)

    return (
        {
            "project_id": project["id"],
            "project_name": project.get("name"),
            "requirement_analysis_record_id": requirement_record["id"],
            "analysis_record_id": analysis_record["id"],
            "requirement_report": requirement_report_snapshot,
            "case_report": case_result_snapshot,
            "ai_test_advice": ai_test_advice,
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

# ============ 璺敱 ============

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


def _normalize_project_member_ids(member_ids: list[int] | None, field_label: str) -> list[int]:
    normalized_ids: list[int] = []
    seen_ids: set[int] = set()
    for user_id in member_ids or []:
        if user_id <= 0 or user_id in seen_ids:
            continue
        user = get_user(user_id)
        if user is None:
            raise HTTPException(status_code=400, detail=f"{field_label}鍖呭惈涓嶅瓨鍦ㄧ殑鐢ㄦ埛")
        if user.get("auth_source") != "external":
            raise HTTPException(status_code=400, detail=f"{field_label}鍙兘閫夋嫨P13鐢ㄦ埛")
        seen_ids.add(user_id)
        normalized_ids.append(user_id)
    return normalized_ids


PROJECT_ROUTE_PATTERN = re.compile(r"^/api/projects/(?P<project_id>\d+)(?:/|$)")


def _is_admin_user(user: Optional[dict]) -> bool:
    return bool(user and user.get("role") == "admin")


def _get_project_member_ids(project: dict) -> set[int]:
    member_ids: set[int] = set()
    for field_name in ("test_manager_ids", "tester_ids"):
        for member_id in project.get(field_name) or []:
            if isinstance(member_id, int) and member_id > 0:
                member_ids.add(member_id)
    return member_ids


def _user_can_access_project(user: Optional[dict], project: Optional[dict]) -> bool:
    if project is None or user is None:
        return False
    if _is_admin_user(user):
        return True
    user_id = user.get("id")
    return isinstance(user_id, int) and user_id in _get_project_member_ids(project)


def _filter_projects_for_user(projects: list[dict], user: Optional[dict]) -> list[dict]:
    if _is_admin_user(user):
        return projects
    return [project for project in projects if _user_can_access_project(user, project)]


def _get_accessible_project_ids_for_user(user: Optional[dict]) -> set[int]:
    if _is_admin_user(user):
        return {
            project["id"]
            for project in list_projects()
            if isinstance(project.get("id"), int)
        }
    return {
        project["id"]
        for project in _filter_projects_for_user(list_projects(), user)
        if isinstance(project.get("id"), int)
    }


def _get_request_user(request: Request) -> Optional[dict]:
    return getattr(request.state, "current_user", None)


def _ensure_request_project_access(
    request: Request,
    project_id: int,
    *,
    not_found_detail: str = "项目不存在",
) -> dict:
    project = get_project(project_id)
    if project is None or not _user_can_access_project(_get_request_user(request), project):
        raise HTTPException(status_code=404, detail=not_found_detail)
    return project


def _filter_project_scoped_records(
    records: list[dict],
    user: Optional[dict],
    *,
    project_id_key: str = "project_id",
    allow_unassigned: bool = False,
) -> list[dict]:
    if _is_admin_user(user):
        return records

    accessible_project_ids = _get_accessible_project_ids_for_user(user)
    filtered_records: list[dict] = []
    for record in records:
        project_id = record.get(project_id_key)
        if project_id is None:
            if allow_unassigned:
                filtered_records.append(record)
            continue
        if isinstance(project_id, int) and project_id in accessible_project_ids:
            filtered_records.append(record)
    return filtered_records


def _ensure_project_record_visible(
    request: Request,
    record: Optional[dict],
    *,
    not_found_detail: str,
    project_id_key: str = "project_id",
    allow_unassigned: bool = False,
) -> dict:
    if record is None:
        raise HTTPException(status_code=404, detail=not_found_detail)

    visible_records = _filter_project_scoped_records(
        [record],
        _get_request_user(request),
        project_id_key=project_id_key,
        allow_unassigned=allow_unassigned,
    )
    if not visible_records:
        raise HTTPException(status_code=404, detail=not_found_detail)
    return visible_records[0]


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
        prompt_template_management_path = (
            (path == "/api/prompt-templates" and request.method == "POST")
            or (path.startswith("/api/prompt-templates/") and request.method in {"PUT", "DELETE"})
        )
        requires_admin_access = path.startswith(admin_only_prefixes) or prompt_template_management_path
        if requires_admin_access and current_user["role"] != "admin":
            _write_audit_log(
                request,
                module="绯荤粺绠＄悊",
                action="瓒婃潈璁块棶",
                result="failure",
                current_user=current_user,
                target_type="鎺ュ彛",
                target_name=f"{request.method} {path}",
                detail="Admin access required",
            )
            return JSONResponse(status_code=403, content={"detail": "Admin access required"})

        project_route_match = PROJECT_ROUTE_PATTERN.match(path)
        project_id = int(project_route_match.group("project_id")) if project_route_match else None
        project_root_path = f"/api/projects/{project_id}" if project_id is not None else None
        requires_project_admin_access = (
            (path == "/api/projects" and request.method == "POST")
            or (project_root_path == path and request.method in {"PUT", "DELETE"})
        )
        if requires_project_admin_access and current_user["role"] != "admin":
            _write_audit_log(
                request,
                module="椤圭洰绠＄悊",
                action="瓒婃潈璁块棶",
                result="failure",
                current_user=current_user,
                target_type="鎺ュ彛",
                target_name=f"{request.method} {path}",
                detail="Admin access required",
            )
            return JSONResponse(status_code=403, content={"detail": "Admin access required"})

        if project_id is not None:
            project = get_project(project_id)
            if project is None or not _user_can_access_project(current_user, project):
                _write_audit_log(
                    request,
                    module="椤圭洰绠＄悊",
                    action="瓒婃潈璁块棶",
                    result="failure",
                    current_user=current_user,
                    target_type="鎺ュ彛",
                    target_name=f"{request.method} {path}",
                    detail="Project access denied",
                )
                return JSONResponse(status_code=404, content={"detail": "项目不存在"})
    elif path.startswith("/api/auth"):
        session_token = get_session_cookie_from_headers(request.headers.get("cookie"))
        if session_token:
            current_user = get_user_by_session_token(session_token)
            if current_user and current_user["status"] == "active":
                request.state.current_user = current_user

    return await call_next(request)


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, request: Request, response: Response):
    """鐢ㄦ埛鐧诲綍骞跺啓鍏ヤ細璇?Cookie"""
    try:
        user = await _authenticate_with_available_sources(body.username, body.password)
        if user["status"] != "active":
            raise HTTPException(status_code=403, detail="Account is disabled")
    except HTTPException as exc:
        _write_audit_log(
            request,
            module="璁よ瘉",
            action="鐧诲綍",
            result="failure",
            attempted_username=body.username,
            target_type="鐢ㄦ埛",
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
        module="璁よ瘉",
        action="鐧诲綍",
        result="success",
        current_user=user,
        target_type="鐢ㄦ埛",
        target_id=str(user["id"]),
        target_name=user["username"],
        detail="鐢ㄦ埛鐧诲綍鎴愬姛",
    )
    return LoginResponse(success=True, user=_serialize_auth_user(user))


@app.get("/api/auth/me", response_model=AuthUserResponse)
async def get_current_user_profile(request: Request):
    """杩斿洖褰撳墠鐧诲綍鐢ㄦ埛"""
    current_user = _get_request_user(request)
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return _serialize_auth_user(current_user)


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    """鐧诲嚭褰撳墠浼氳瘽"""
    session_token = get_session_cookie_from_headers(request.headers.get("cookie"))
    current_user = _get_request_user(request)
    if session_token:
        delete_user_session(session_token)
    cookie_settings = get_session_cookie_settings()
    response.delete_cookie(cookie_settings["key"], path=cookie_settings["path"])
    if current_user is not None:
        _write_audit_log(
            request,
            module="璁よ瘉",
            action="退出登录",
            result="success",
            current_user=current_user,
            target_type="鐢ㄦ埛",
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
            module="绯荤粺绠＄悊",
            action="鍒涘缓鐢ㄦ埛",
            result="success",
            current_user=_get_request_user(request),
            target_type="鐢ㄦ埛",
            target_id=str(user["id"]),
            target_name=user["username"],
            detail=f"鍒涘缓鐢ㄦ埛 {user['username']}",
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
        module="绯荤粺绠＄悊",
        action="缂栬緫鐢ㄦ埛",
        result="success",
        current_user=_get_request_user(request),
        target_type="鐢ㄦ埛",
        target_id=str(user["id"]),
        target_name=user["username"],
        detail=f"鏇存柊鐢ㄦ埛璧勬枡锛岃鑹?{user['role']}",
    )
    return _serialize_user_record(user)


@app.put("/api/users/{user_id}/status", response_model=UserRecordResponse)
async def api_update_user_status(user_id: int, body: UserStatusUpdateRequest, request: Request):
    """绠＄悊鍛樺惎鐢ㄦ垨绂佺敤鐢ㄦ埛"""
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
        module="绯荤粺绠＄悊",
        action="更新用户状态",
        result="success",
        current_user=current_user,
        target_type="鐢ㄦ埛",
        target_id=str(user["id"]),
        target_name=user["username"],
        detail=f"鐘舵€佹洿鏂颁负 {user['status']}",
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
        module="绯荤粺绠＄悊",
        action="閲嶇疆瀵嗙爜",
        result="success",
        current_user=_get_request_user(request),
        target_type="鐢ㄦ埛",
        target_id=str(user["id"]),
        target_name=user["username"],
        detail=f"閲嶇疆鐢ㄦ埛瀵嗙爜: {user['username']}",
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
            module="绯荤粺绠＄悊",
            action="鍒犻櫎鐢ㄦ埛",
            result="success",
            current_user=current_user,
            target_type="鐢ㄦ埛",
            target_id=str(target_user["id"]),
            target_name=target_user["username"],
            detail=f"鍒犻櫎鐢ㄦ埛 {target_user['username']}",
        )
    return {"success": True}


@app.get("/api/health")
async def health_check() -> HealthResponse:
    """健康检查"""
    return HealthResponse(status="ok", version="1.0.0")


@app.post("/api/analyze")
async def analyze(
    code_changes: UploadFile = File(..., description="浠ｇ爜鏀瑰姩JSON鏂囦欢"),
    test_cases_file: UploadFile = File(..., description="测试用例 CSV / Excel / Markdown 文件"),
    mapping_file: Optional[UploadFile] = File(default=None, description="映射关系CSV文件（可选，不传则用全局映射）"),
    use_ai: bool = Form(default=True, description="鏄惁浣跨敤AI鍒嗘瀽"),
    prompt_template_key: Optional[str] = Form(default=None, description="AI 鎻愮ず璇嶆ā鏉挎爣璇嗭紙鍙€夛級"),
):
    """
    瀹屾暣鐨勪唬鐮佸垎鏋愭祦绋嬶細
    1. 瑙ｆ瀽鏂囦欢
    2. 宸紓鍒嗘瀽
    3. 瑕嗙洊鍒嗘瀽
    4. 璇勫垎
    5. AI鍒嗘瀽锛堝彲閫夛級
    """
    start_time = time.time()

    try:
        # ---- 1. 璇诲彇鍜屾牎楠屾枃浠?----
        code_content = await code_changes.read()
        test_content = await test_cases_file.read()

        # 鏍￠獙鏂囦欢
        err = validate_file(code_changes.filename or "", code_content, ["json"])
        if err:
            raise HTTPException(status_code=400, detail=err)

        err = validate_file(test_cases_file.filename or "", test_content, ["csv", "excel", "markdown"])
        if err:
            raise HTTPException(status_code=400, detail=err)

        # ---- 2. 瑙ｆ瀽鏂囦欢 ----
        # 浠ｇ爜鏀瑰姩
        code_data = parse_json(code_content)
        diff_result = analyze_code_changes(json.dumps(code_data))

        if diff_result.error:
            raise HTTPException(status_code=400, detail=f"浠ｇ爜鏀瑰姩鍒嗘瀽澶辫触: {diff_result.error}")

        # 鏄犲皠鍏崇郴锛氫紭鍏堢敤涓婁紶鐨勬枃浠讹紝鍚﹀垯鐢ㄥ叏灞€鏄犲皠
        if mapping_file is not None:
            mapping_content = await mapping_file.read()
            err = validate_file(mapping_file.filename or "", mapping_content, ["csv"])
            if err:
                raise HTTPException(status_code=400, detail=err)
            mapping_rows = parse_csv(mapping_content)
            mapping_entries = parse_mapping_data(mapping_rows)
        else:
            # 浣跨敤鍏ㄥ眬鏄犲皠
            latest_mapping = get_latest_global_mapping()
            if latest_mapping is None or not latest_mapping.get("mapping_data"):
                raise HTTPException(status_code=400, detail="鏈笂浼犳槧灏勬枃浠朵笖鏈厤缃叏灞€鏄犲皠锛岃鍏堝湪銆庢槧灏勭鐞嗐€忎腑涓婁紶鏄犲皠鏂囦欢")
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

        # 娴嬭瘯鐢ㄤ緥
        test_file_type = detect_file_type(test_cases_file.filename or "")
        if test_file_type == "csv":
            test_rows = parse_csv(test_content)
        elif test_file_type == "excel":
            test_rows = parse_excel(test_content)
        elif test_file_type == "markdown":
            test_rows = parse_markdown_rows(test_content)
        else:
            raise HTTPException(status_code=400, detail="测试用例文件格式不支持")

        test_case_list = parse_test_cases(test_rows)

        # ---- 3. AST鍒嗘瀽鎻愬彇鍙樻洿鏂规硶 ----
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

        # ---- 4. 瑕嗙洊鍒嗘瀽 ----
        coverage_result = analyze_coverage(changed_methods, mapping_entries, test_case_list)

        # ---- 5. 璇勫垎 ----
        score_result = calculate_score(
            total_changed_methods=coverage_result.total_changed_methods,
            covered_count=len(coverage_result.covered_methods),
            test_cases=test_case_list,
        )

        # ---- 6. AI鍒嗘瀽锛堝彲閫夛級----
        ai_result = None
        ai_cost = None
        if use_ai:
            prompt_template_text = _resolve_selected_prompt_template_text(use_ai, prompt_template_key)
            diff_summary = format_diff_summary(diff_result)
            mapping_text = "\n".join(
                f"{e.package_name}.{e.class_name}.{e.method_name} -> {e.description}"
                for e in mapping_entries
            )
            test_text = "\n".join(
                f"{tc.test_id}: {tc.test_function} | {tc.test_steps} | {tc.expected_result}"
                for tc in test_case_list
            )

            messages = build_analysis_messages(
                diff_summary,
                mapping_text,
                test_text,
                prompt_template_text=prompt_template_text,
            )
            ai_response = await call_deepseek(messages)

            if "error" in ai_response:
                ai_result = {"error": ai_response["error"]}
            else:
                ai_result = ai_response["result"]
                ai_cost = calculate_cost(
                    ai_response["usage"],
                    provider=ai_response.get("provider_key"),
                )

        # ---- 缁勮杩斿洖缁撴灉 ----
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
        logger.error(f"鍒嗘瀽澶辫触: {e}")
        raise HTTPException(status_code=500, detail=f"鏈嶅姟鍣ㄥ唴閮ㄩ敊璇? {str(e)}")


def parse_code_changes_data(data: dict) -> dict:
    """浠嶫SON鏁版嵁涓彁鍙朿urrent/history"""
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
            detail="浠呮敮鎸?Excel 鎴?CSV 鏂囦欢",
        )

    return file_type, rows


@app.post("/api/upload/validate")
async def validate_upload(file: UploadFile = File(...)):
    """浠呮牎楠屾枃浠舵牸寮忥紝涓嶅仛鍒嗘瀽"""
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
async def import_issue_analysis(file: UploadFile = File(..., description="鐢熶骇闂Excel/CSV鏂囦欢")):
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
            raise HTTPException(status_code=400, detail="浠呮敮鎸?Excel 鎴?CSV 鏂囦欢")

        result = analyze_issue_rows(rows)
        duration_ms = int((time.time() - start_time) * 1000)
        return AnalyzeResponse(success=True, data=result, duration_ms=duration_ms)
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"鐢熶骇闂鍒嗘瀽澶辫触: {e}")
        raise HTTPException(status_code=500, detail=f"鏈嶅姟鍣ㄥ唴閮ㄩ敊璇? {str(e)}")


# ============ 鏂囦欢绠＄悊璺敱 ============

@app.get("/api/performance-analysis-files")
async def api_list_performance_analysis_files():
    """List uploaded efficiency-analysis workbooks."""
    return {"success": True, "data": list_performance_analysis_files()}


@app.post("/api/performance-analysis-files")
async def api_upload_performance_analysis_file(
    request: Request,
    file: UploadFile = File(..., description="Efficiency analysis Excel workbook"),
):
    """Upload and persist an efficiency-analysis workbook."""
    content = await file.read()
    err = validate_file(file.filename or "", content, ["excel"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    file_type = detect_file_type(file.filename or "")

    try:
        sheets = load_workbook_sheets(content)
        analyze_performance_workbook(content)

        record = save_performance_analysis_file(
            file_name=file.filename or "未命名文件",
            file_type=file_type,
            file_size=len(content),
            sheet_count=len(sheets),
            content=content,
        )
        _write_audit_log(
            request,
            module="璐ㄩ噺鐪嬫澘",
            action="上传性能分析工作簿",
            result="success",
            current_user=_get_request_user(request),
            target_type="鏂囦欢",
            target_id=str(record["id"]),
            target_name=record["file_name"],
            file_name=record["file_name"],
            detail=f"上传性能分析工作簿 {record['file_name']}",
        )
        return {"success": True, "data": record}
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"failed to save performance analysis file: {e}")
        raise HTTPException(status_code=500, detail="服务端内部错误")


@app.get("/api/performance-analysis-files/{file_id}/analysis")
async def api_get_performance_analysis(file_id: int):
    """Build the efficiency-analysis dashboard from a stored workbook."""
    record = get_performance_analysis_file(file_id)
    if record is None:
        raise HTTPException(status_code=404, detail="性能分析文件不存在")

    try:
        result = analyze_performance_workbook(record["content"])
        result["source_file"] = {
            "id": record["id"],
            "file_name": record["file_name"],
            "file_type": record["file_type"],
            "file_size": record["file_size"],
            "sheet_count": record["sheet_count"],
            "created_at": record["created_at"],
        }
        return {"success": True, "data": result}
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"failed to analyze stored performance analysis file: {e}")
        raise HTTPException(status_code=500, detail="服务端内部错误")


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
            module="閰嶇疆绠＄悊",
            action="涓婁紶鐢熶骇闂鏂囦欢",
            result="success",
            current_user=_get_request_user(request),
            target_type="鏂囦欢",
            target_id=str(record["id"]),
            target_name=record["file_name"],
            file_name=record["file_name"],
            detail=f"涓婁紶鐢熶骇闂鏂囦欢 {record['file_name']}",
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
            raise HTTPException(status_code=400, detail="浠呮敮鎸?Excel 鎴?CSV 鏂囦欢")

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
async def api_list_test_issue_files(request: Request, project_id: Optional[int] = None):
    """List uploaded test issue files."""
    if project_id is not None:
        _ensure_request_project_access(request, project_id)
    records = list_test_issue_files(project_id=project_id)
    records = _filter_project_scoped_records(records, _get_request_user(request))
    return {"success": True, "data": records}


@app.post("/api/test-issue-files")
async def api_upload_test_issue_file(
    request: Request,
    project_id: int = Form(..., description="缁戝畾鐨勯」鐩甀D"),
    file: UploadFile = File(..., description="Test issue Excel or CSV file"),
):
    """Upload and persist a test issue file bound to a project."""
    _ensure_request_project_access(request, project_id)

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
async def api_get_test_issue_file_analysis(request: Request, file_id: int):
    """Generate analysis dashboard from a stored test issue file."""
    stored_file = _ensure_project_record_visible(
        request,
        get_test_issue_file(file_id),
        not_found_detail="测试问题文件不存在",
    )

    content = stored_file["content"]
    file_type = stored_file["file_type"]

    try:
        if file_type == "csv":
            rows = parse_csv(content)
        elif file_type == "excel":
            rows = parse_excel(content)
        else:
            raise HTTPException(status_code=400, detail="浠呮敮鎸?Excel 鎴?CSV 鏂囦欢")

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
    mapping_record = get_requirement_mapping(project_id)
    if mapping_record is None:
        raise HTTPException(status_code=404, detail="闇€姹傛槧灏勫叧绯讳笉瀛樺湪")

    return {"success": True, "data": _serialize_requirement_mapping(mapping_record)}


@app.post("/api/projects/{project_id}/requirement-mapping")
async def api_upload_requirement_mapping(
    project_id: int,
    file: UploadFile = File(..., description="闇€姹傛槧灏勫叧绯?Excel 鏂囦欢"),
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
    request: Request,
    project_id: int = Form(..., description="??ID"),
    requirement_file: UploadFile = File(..., description="???? DOC/DOCX/MD ??"),
    use_ai: bool = Form(default=True, description="????AI??"),
    prompt_template_key: Optional[str] = Form(default=None, description="AI 鎻愮ず璇嶆ā鏉挎爣璇嗭紙鍙€夛級"),
    source_page: Optional[str] = Form(default=None, description="鏉ユ簮椤甸潰"),
    reasoning_level: Optional[str] = Form(default=None, description="AI reasoning level"),
):
    """??????????????????????"""
    start_time = time.time()

    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="?????")

    requirement_content = await requirement_file.read()
    requirement_allowed_types = (
        ["doc", "docx"]
        if (source_page or "").strip() == "案例质检"
        else ["doc", "docx", "markdown"]
    )
    err = validate_file(requirement_file.filename or "", requirement_content, requirement_allowed_types)
    if err:
        raise HTTPException(status_code=400, detail=err)
    current_user = _get_request_user(request)
    normalized_reasoning_level = _normalize_reasoning_level(reasoning_level)

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
            prompt_template_text = _resolve_selected_prompt_template_text(use_ai, prompt_template_key)
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
                build_requirement_analysis_messages(
                    project["name"],
                    ai_payload,
                    prompt_template_text=prompt_template_text,
                ),
                reasoning_level=normalized_reasoning_level,
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
        upsert_requirement_document(
            content_hash=build_requirement_document_hash(parsed_document),
            file_name=requirement_file.filename or "requirement.docx",
            file_type=_infer_storage_file_type(requirement_file.filename or "", "docx"),
            file_size=len(requirement_content),
            content=requirement_content,
            project_id=project_id,
            source_page=(source_page or "").strip() or "需求分析",
            operator_user_id=current_user.get("id") if current_user else None,
            operator_username=current_user.get("username") if current_user else None,
            operator_display_name=current_user.get("display_name") if current_user else None,
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


@app.post("/api/functional-testing/case-generation/map")
async def api_map_requirement_points_for_case_generation(
    request: Request,
    project_id: int = Form(..., description="鍏宠仈椤圭洰 ID"),
    requirement_file: UploadFile = File(..., description="闇€姹傛枃妗ｏ紝浠呮敮鎸?DOC / DOCX"),
):
    start_time = time.time()
    requirement_content = await requirement_file.read()
    err = validate_file(requirement_file.filename or "", requirement_content, ["doc", "docx"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    try:
        project = _ensure_request_project_access(request, project_id, not_found_detail="关联项目不存在")
        parsed_document = parse_requirement_document(
            requirement_content,
            requirement_file.filename or "",
        )
        result = _build_requirement_mapping_preview_result(
            project=project,
            project_id=project_id,
            requirement_file_name=requirement_file.filename or "requirement.docx",
            parsed_document=parsed_document,
        )
        result["overview"]["duration_ms"] = int((time.time() - start_time) * 1000)
        return {
            "success": True,
            "data": result,
            "duration_ms": result["overview"]["duration_ms"],
        }
    except HTTPException:
        raise
    except (ValueError, ImportError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(f"闇€姹傛槧灏勯瑙堝け璐? {exc}")
        raise HTTPException(status_code=500, detail="需求映射预览失败，请稍后重试") from exc


@app.post("/api/functional-testing/case-generation/generate")
async def api_preview_functional_test_cases(
    request: Request,
    project_id: int = Form(..., description="鍏宠仈椤圭洰 ID"),
    requirement_file: UploadFile = File(..., description="闇€姹傛枃妗ｏ紝浠呮敮鎸?DOC / DOCX"),
    prompt_template_key: Optional[str] = Form(default=None, description="提示词模板标识"),
    mapping_result_snapshot: Optional[str] = Form(default=None, description="鏄犲皠缁撴灉蹇収 JSON"),
    reasoning_level: Optional[str] = Form(default=None, description="AI reasoning level"),
):
    start_time = time.time()
    requirement_content = await requirement_file.read()
    err = validate_file(requirement_file.filename or "", requirement_content, ["doc", "docx"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    try:
        project = _ensure_request_project_access(request, project_id, not_found_detail="关联项目不存在")

        normalized_prompt_template_key = _normalize_optional_text(prompt_template_key)
        normalized_reasoning_level = _normalize_reasoning_level(reasoning_level)
        parsed_document = parse_requirement_document(
            requirement_content,
            requirement_file.filename or "",
        )
        parsed_mapping_snapshot = _parse_snapshot_form_field(
            mapping_result_snapshot,
            "mapping_result_snapshot",
        )
        mapping_snapshot = parsed_mapping_snapshot or _build_requirement_mapping_preview_result(
            project=project,
            project_id=project_id,
            requirement_file_name=requirement_file.filename or "requirement.docx",
            parsed_document=parsed_document,
        )

        generation_result = await generate_requirement_cases(
            parsed_document,
            prompt_template_text=resolve_prompt_template_text(normalized_prompt_template_key),
            mapping_result_snapshot=mapping_snapshot,
            reasoning_level=normalized_reasoning_level,
        )
        cases = generation_result.get("cases") or []
        return {
            "success": True,
            "data": {
                "file_name": requirement_file.filename or "requirement.docx",
                "project_id": project_id,
                "project_name": project.get("name"),
                "prompt_template_key": normalized_prompt_template_key,
                "summary": generation_result.get("summary") or "",
                "generation_mode": generation_result.get("generation_mode") or "fallback",
                "provider": generation_result.get("provider"),
                "ai_cost": generation_result.get("ai_cost"),
                "error": generation_result.get("error"),
                "total": len(cases),
                "cases": cases,
            },
            "duration_ms": int((time.time() - start_time) * 1000),
        }
    except HTTPException:
        raise
    except (ValueError, ImportError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error(f"娴嬭瘯鐢ㄤ緥棰勮鐢熸垚澶辫触: {exc}")
        raise HTTPException(status_code=500, detail="娴嬭瘯鐢ㄤ緥鐢熸垚澶辫触锛岃绋嶅悗閲嶈瘯") from exc


@app.post("/api/functional-testing/case-generation/save")
async def api_save_functional_test_case_generation(
    request: Request,
    project_id: int = Form(..., description="鍏宠仈椤圭洰 ID"),
    requirement_file: UploadFile = File(..., description="闇€姹傛枃妗ｏ紝浠呮敮鎸?DOC / DOCX"),
    prompt_template_key: Optional[str] = Form(default=None, description="提示词模板标识"),
    case_name: str = Form(..., description="妗堜緥鍚嶇О"),
    iteration_version: Optional[str] = Form(default=None, description="杩唬鐗堟湰"),
    mapping_result_snapshot: str = Form(..., description="鏄犲皠缁撴灉蹇収 JSON"),
    generation_result_snapshot: str = Form(..., description="鐢熸垚缁撴灉蹇収 JSON"),
    source_page: Optional[str] = Form(default=None, description="鏉ユ簮椤甸潰"),
):
    requirement_content = await requirement_file.read()
    err = validate_file(requirement_file.filename or "", requirement_content, ["doc", "docx"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    project = _ensure_request_project_access(request, project_id, not_found_detail="关联项目不存在")

    normalized_case_name = _normalize_optional_text(case_name)
    if normalized_case_name is None:
        raise HTTPException(status_code=400, detail="娴嬭瘯妗堜緥鍚嶇О涓嶈兘涓虹┖")

    parsed_mapping_snapshot = _parse_snapshot_form_field(
        mapping_result_snapshot,
        "mapping_result_snapshot",
    )
    parsed_generation_snapshot = _normalize_generation_result_snapshot(
        _parse_snapshot_form_field(
            generation_result_snapshot,
            "generation_result_snapshot",
        )
    )
    normalized_prompt_template_key = _normalize_optional_text(prompt_template_key)
    normalized_iteration_version = _normalize_optional_text(iteration_version)
    normalized_source_page = (source_page or "").strip() or "妗堜緥鐢熸垚"
    current_user = _get_request_user(request)
    cases = parsed_generation_snapshot.get("cases") or []
    if not cases:
        raise HTTPException(status_code=400, detail="预览结果中没有可保存的测试用例")
    normalized_cases = normalize_test_case_asset_cases(cases)

    parsed_document = parse_requirement_document(
        requirement_content,
        requirement_file.filename or "",
    )
    requirement_file_name = requirement_file.filename or "requirement.docx"
    mapping_snapshot = parsed_mapping_snapshot or _build_requirement_mapping_preview_result(
        project=project,
        project_id=project_id,
        requirement_file_name=requirement_file_name,
        parsed_document=parsed_document,
    )

    overview = mapping_snapshot.get("overview")
    duration_ms = int(overview.get("duration_ms", 0)) if isinstance(overview, dict) else 0
    ai_analysis = mapping_snapshot.get("ai_analysis")
    if ai_analysis is not None and not isinstance(ai_analysis, dict):
        ai_analysis = None

    token_usage = 0
    mapping_ai_cost_payload = mapping_snapshot.get("ai_cost")
    if isinstance(mapping_ai_cost_payload, dict):
        total_tokens = mapping_ai_cost_payload.get("total_tokens")
        if isinstance(total_tokens, (int, float)):
            token_usage = int(total_tokens)
    ai_cost_payload = parsed_generation_snapshot.get("ai_cost")
    if token_usage == 0 and isinstance(ai_cost_payload, dict):
        total_tokens = ai_cost_payload.get("total_tokens")
        if isinstance(total_tokens, (int, float)):
            token_usage = int(total_tokens)

    conn = get_shared_connection()
    try:
        ensure_config_library_tables(conn=conn)
        conn.execute("BEGIN")
        requirement_record = save_requirement_analysis_record(
            project_id=project_id,
            requirement_file_name=requirement_file_name,
            section_snapshot=parsed_document,
            result_snapshot=mapping_snapshot,
            ai_analysis=ai_analysis,
            token_usage=token_usage,
            cost=0.0,
            duration_ms=duration_ms,
            conn=conn,
        )
        saved_record = save_functional_test_case_record(
            project_id=project_id,
            requirement_file_name=requirement_file_name,
            prompt_template_key=normalized_prompt_template_key,
            summary=parsed_generation_snapshot.get("summary") or "",
            generation_mode=parsed_generation_snapshot.get("generation_mode") or "fallback",
            provider=parsed_generation_snapshot.get("provider"),
            ai_cost=ai_cost_payload if isinstance(ai_cost_payload, dict) else None,
            error=parsed_generation_snapshot.get("error"),
            case_count=len(cases),
            cases=cases,
            operator_user_id=current_user.get("id") if current_user else None,
            operator_username=current_user.get("username") if current_user else None,
            operator_display_name=current_user.get("display_name") if current_user else None,
            name=normalized_case_name,
            iteration_version=normalized_iteration_version,
            conn=conn,
        )
        upsert_requirement_document(
            content_hash=build_requirement_document_hash(parsed_document),
            file_name=requirement_file_name,
            file_type=_infer_storage_file_type(requirement_file.filename or "", "docx"),
            file_size=len(requirement_content),
            content=requirement_content,
            project_id=project_id,
            source_page=normalized_source_page,
            operator_user_id=current_user.get("id") if current_user else None,
            operator_username=current_user.get("username") if current_user else None,
            operator_display_name=current_user.get("display_name") if current_user else None,
            conn=conn,
        )
        saved_asset = upsert_test_case_asset(
            content_hash=build_test_case_asset_hash(normalized_cases),
            asset_type="generated",
            name=normalized_case_name,
            file_type="generated",
            file_size=0,
            cases=normalized_cases,
            requirement_file_name=requirement_file_name,
            generation_mode=parsed_generation_snapshot.get("generation_mode"),
            provider=parsed_generation_snapshot.get("provider"),
            prompt_template_key=normalized_prompt_template_key,
            iteration_version=normalized_iteration_version,
            project_id=project_id,
            source_page=normalized_source_page,
            operator_user_id=current_user.get("id") if current_user else None,
            operator_username=current_user.get("username") if current_user else None,
            operator_display_name=current_user.get("display_name") if current_user else None,
            conn=conn,
        )
        create_audit_log(
            module="鍔熻兘娴嬭瘯",
            action="淇濆瓨娴嬭瘯妗堜緥",
            result="success",
            target_type="娴嬭瘯妗堜緥璁板綍",
            target_id=str(saved_record["id"]),
            target_name=normalized_case_name,
            file_name=requirement_file_name,
            detail=f"\u5df2\u4fdd\u5b58 {len(cases)} \u6761\u6d4b\u8bd5\u7528\u4f8b",
            operator_user_id=current_user.get("id") if current_user else None,
            operator_username=current_user.get("username") if current_user else None,
            operator_display_name=current_user.get("display_name") if current_user else None,
            operator_role=current_user.get("role") if current_user else None,
            request_method=request.method,
            request_path=request.url.path,
            ip_address=_get_request_ip(request),
            user_agent=request.headers.get("user-agent"),
            metadata={
                "record_id": saved_record["id"],
                "requirement_analysis_record_id": requirement_record["id"],
                "project_id": project_id,
                "project_name": project.get("name"),
                "case_count": len(cases),
                "generation_mode": parsed_generation_snapshot.get("generation_mode") or "fallback",
                "provider": parsed_generation_snapshot.get("provider"),
                "asset_id": saved_asset["id"],
            },
            conn=conn,
        )
        conn.commit()
    except HTTPException:
        conn.rollback()
        raise
    except Exception as exc:
        conn.rollback()
        logger.error(f"淇濆瓨娴嬭瘯妗堜緥澶辫触: {exc}")
        raise HTTPException(status_code=500, detail="淇濆瓨娴嬭瘯妗堜緥澶辫触锛岃绋嶅悗閲嶈瘯") from exc
    finally:
        conn.close()

    return {
        "success": True,
        "data": {
            "id": saved_record["id"],
            "record_id": saved_record["id"],
            "requirement_analysis_record_id": requirement_record["id"],
            "asset_id": saved_asset["id"],
            "project_id": project_id,
            "project_name": project.get("name"),
            "requirement_file_name": requirement_file_name,
            "name": normalized_case_name,
            "case_name": normalized_case_name,
            "iteration_version": normalized_iteration_version,
            "case_count": len(cases),
            "created_at": saved_record.get("created_at"),
            "operator_name": _resolve_operator_name(saved_record),
        },
    }


@app.get("/api/functional-testing/test-cases")
async def api_list_functional_test_case_records(request: Request, limit: int = 50, offset: int = 0):
    records = list_functional_test_case_records(limit=limit, offset=offset)
    records = _filter_project_scoped_records(
        records,
        _get_request_user(request),
        allow_unassigned=True,
    )
    return {"success": True, "data": [_serialize_functional_test_case_record_summary(item) for item in records]}


@app.get("/api/functional-testing/test-cases/{record_id}")
async def api_get_functional_test_case_record(request: Request, record_id: int):
    record = _ensure_project_record_visible(
        request,
        get_functional_test_case_record(record_id),
        not_found_detail="测试用例记录不存在",
        allow_unassigned=True,
    )
    return {"success": True, "data": _serialize_functional_test_case_record_detail(record)}


@app.get("/api/knowledge-base/system-overviews")
async def api_list_knowledge_system_overviews(request: Request):
    records = list_knowledge_system_overviews()
    records = _filter_project_scoped_records(records, _get_request_user(request))
    return {"success": True, "data": [_serialize_knowledge_system_overview_summary(item) for item in records]}


@app.post("/api/knowledge-base/system-overviews")
async def api_create_knowledge_system_overview(body: KnowledgeSystemOverviewCreateRequest, request: Request):
    current_user = _get_request_user(request)
    _ensure_request_project_access(request, body.project_id)
    try:
        record = create_knowledge_system_overview(
            project_id=body.project_id,
            title=body.title,
            outline_category=body.outline_category,
            description=body.description,
            creator_user_id=current_user.get("id") if current_user else None,
            creator_username=current_user.get("username") if current_user else None,
            creator_display_name=current_user.get("display_name") if current_user else None,
        )
    except ValueError as error:
        if str(error) == "project_not_found":
            raise HTTPException(status_code=404, detail="项目不存在") from error
        raise HTTPException(status_code=400, detail="创建系统功能全景图失败") from error

    _write_audit_log(
        request,
        module="知识库管理",
        action="创建系统功能全景图",
        result="success",
        current_user=current_user,
        target_type="系统功能全景图",
        target_id=str(record["id"]),
        target_name=record.get("title"),
        detail=f"为项目 {record.get('project_name')} 创建系统功能全景图",
        metadata={"project_id": record["project_id"], "outline_category": record.get("outline_category")},
    )
    return {"success": True, "data": _serialize_knowledge_system_overview_detail(record)}


@app.get("/api/knowledge-base/system-overviews/{overview_id}")
async def api_get_knowledge_system_overview(request: Request, overview_id: int):
    record = _ensure_project_record_visible(
        request,
        get_knowledge_system_overview(overview_id),
        not_found_detail="系统功能全景图不存在",
    )
    return {"success": True, "data": _serialize_knowledge_system_overview_detail(record)}


@app.put("/api/knowledge-base/system-overviews/{overview_id}")
async def api_update_knowledge_system_overview(
    overview_id: int,
    body: KnowledgeSystemOverviewUpdateRequest,
    request: Request,
):
    _ensure_project_record_visible(
        request,
        get_knowledge_system_overview(overview_id),
        not_found_detail="系统功能全景图不存在",
    )
    try:
        record = update_knowledge_system_overview(
            overview_id,
            title=body.title,
            outline_category=body.outline_category,
            description=body.description,
            mind_map_data=body.mind_map_data,
            source_format=body.source_format,
            source_file_name=body.source_file_name,
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail="系统功能全景图更新失败") from error

    if record is None:
        raise HTTPException(status_code=404, detail="系统功能全景图不存在")

    action = "保存系统功能全景图"
    detail = f"更新项目 {record.get('project_name')} 的系统功能全景图"
    if body.source_format in {"xmind", "markdown"}:
        action = "导入系统功能全景图"
        detail = f"导入 {body.source_format} 文件到项目 {record.get('project_name')} 的系统功能全景图"

    _write_audit_log(
        request,
        module="知识库管理",
        action=action,
        result="success",
        current_user=_get_request_user(request),
        target_type="系统功能全景图",
        target_id=str(record["id"]),
        target_name=record.get("title"),
        detail=detail,
        metadata={
            "project_id": record["project_id"],
            "outline_category": record.get("outline_category"),
            "source_format": record.get("source_format"),
            "source_file_name": record.get("source_file_name"),
        },
    )
    return {"success": True, "data": _serialize_knowledge_system_overview_detail(record)}


@app.delete("/api/knowledge-base/system-overviews/{overview_id}")
async def api_delete_knowledge_system_overview(overview_id: int, request: Request):
    existing = _ensure_project_record_visible(
        request,
        get_knowledge_system_overview(overview_id),
        not_found_detail="系统功能全景图不存在",
    )

    deleted = delete_knowledge_system_overview(overview_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="系统功能全景图不存在")

    _write_audit_log(
        request,
        module="知识库管理",
        action="删除系统功能全景图",
        result="success",
        current_user=_get_request_user(request),
        target_type="系统功能全景图",
        target_id=str(existing["id"]),
        target_name=existing.get("title"),
        detail=f"删除项目 {existing.get('project_name')} 的系统功能全景图",
        metadata={"project_id": existing["project_id"], "outline_category": existing.get("outline_category")},
    )
    return {"success": True}


@app.get("/api/config-management/requirement-documents")
async def api_list_config_requirement_documents(request: Request, limit: int = 100, offset: int = 0):
    records = list_requirement_documents(limit=limit, offset=offset)
    records = _filter_project_scoped_records(
        records,
        _get_request_user(request),
        allow_unassigned=True,
    )
    return {"success": True, "data": [_serialize_config_requirement_document(item) for item in records]}


@app.get("/api/config-management/requirement-documents/{document_id}/download")
async def api_download_config_requirement_document(request: Request, document_id: int):
    record = _ensure_project_record_visible(
        request,
        get_requirement_document(document_id),
        not_found_detail="需求文档不存在",
        allow_unassigned=True,
    )

    content = record.get("content")
    if not isinstance(content, (bytes, bytearray)):
        raise HTTPException(status_code=500, detail="需求文档内容异常，无法下载")

    file_name = str(record.get("file_name") or "需求文档")
    return Response(
        content=bytes(content),
        media_type=_resolve_requirement_document_media_type(record.get("file_type"), file_name),
        headers={
            "Content-Disposition": _build_attachment_content_disposition(
                file_name,
                "requirement-document",
            )
        },
    )


@app.get("/api/config-management/test-cases")
async def api_list_config_test_case_assets(request: Request, limit: int = 100, offset: int = 0):
    records = list_test_case_assets(limit=limit, offset=offset)
    records = _filter_project_scoped_records(
        records,
        _get_request_user(request),
        allow_unassigned=True,
    )
    return {"success": True, "data": [_serialize_config_test_case_asset_summary(item) for item in records]}


@app.get("/api/config-management/test-cases/{asset_id}")
async def api_get_config_test_case_asset(request: Request, asset_id: int):
    record = _ensure_project_record_visible(
        request,
        get_test_case_asset(asset_id),
        not_found_detail="测试用例记录不存在",
        allow_unassigned=True,
    )
    return {"success": True, "data": _serialize_config_test_case_asset_detail(record)}


@app.get("/api/requirement-analysis/records")
async def api_list_requirement_analysis_records(
    request: Request,
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    if project_id is not None:
        _ensure_request_project_access(request, project_id)
    records = list_requirement_analysis_records(project_id=project_id, limit=limit, offset=offset)
    records = _filter_project_scoped_records(records, _get_request_user(request))
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
        module="閰嶇疆绠＄悊",
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
        raise HTTPException(status_code=404, detail="鎻愮ず璇嶄笉瀛樺湪")

    _write_audit_log(
        request,
        module="閰嶇疆绠＄悊",
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
        raise HTTPException(status_code=404, detail="鎻愮ず璇嶄笉瀛樺湪")

    deleted = delete_prompt_template(template_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="鎻愮ず璇嶄笉瀛樺湪")

    _write_audit_log(
        request,
        module="閰嶇疆绠＄悊",
        action="删除提示词",
        result="success",
        current_user=_get_request_user(request),
        target_type="提示词",
        target_id=str(existing["id"]),
        target_name=existing["name"],
        detail=f"鍒犻櫎鎻愮ず璇?{existing['name']}",
        metadata={"agent_key": existing["agent_key"]},
    )
    return {"success": True}


@app.get("/api/requirement-analysis/records/{record_id}")
async def api_get_requirement_analysis_record_detail(request: Request, record_id: int):
    record = _ensure_project_record_visible(
        request,
        get_requirement_analysis_record(record_id),
        not_found_detail="闇€姹傚垎鏋愯褰曚笉瀛樺湪",
    )
    return {"success": True, "data": _serialize_requirement_record_detail(record)}


@app.post("/api/defect-analysis/import")
async def import_defect_analysis(file: UploadFile = File(..., description="娴嬭瘯闂Excel/CSV鏂囦欢")):
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
            raise HTTPException(status_code=400, detail="浠呮敮鎸?Excel 鎴?CSV 鏂囦欢")

        result = analyze_defect_rows(rows)
        duration_ms = int((time.time() - start_time) * 1000)
        return AnalyzeResponse(success=True, data=result, duration_ms=duration_ms)
    except HTTPException:
        raise
    except (ValueError, ImportError) as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"娴嬭瘯闂鍒嗘瀽澶辫触: {e}")
        raise HTTPException(status_code=500, detail=f"鏈嶅姟鍣ㄥ唴閮ㄩ敊璇? {str(e)}")


# ============ 椤圭洰绠＄悊璺敱 ============

@app.get("/api/projects")
async def api_list_projects(request: Request):
    """列出所有项目"""
    projects = _filter_projects_for_user(list_projects(), _get_request_user(request))
    return {"success": True, "data": projects}


@app.post("/api/projects")
async def api_create_project(body: ProjectCreate, request: Request):
    """创建新项目"""
    project = create_project(
        name=body.name,
        description=body.description,
        test_manager_ids=_normalize_project_member_ids(body.test_manager_ids, "娴嬭瘯缁忕悊"),
        tester_ids=_normalize_project_member_ids(body.tester_ids, "娴嬭瘯浜哄憳"),
    )
    _write_audit_log(
        request,
        module="椤圭洰绠＄悊",
        action="鍒涘缓椤圭洰",
        result="success",
        current_user=_get_request_user(request),
        target_type="椤圭洰",
        target_id=str(project["id"]),
        target_name=project["name"],
        detail=f"鍒涘缓椤圭洰 {project['name']}",
    )
    _write_audit_log(
        request,
        module="椤圭洰绠＄悊",
        action="缂栬緫椤圭洰",
        result="success",
        current_user=_get_request_user(request),
        target_type="椤圭洰",
        target_id=str(project["id"]),
        target_name=project["name"],
        detail=f"鏇存柊椤圭洰 {project['name']}",
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
    """鏇存柊椤圭洰淇℃伅"""
    project = update_project(
        project_id=project_id,
        name=body.name,
        description=body.description,
        test_manager_ids=(
            _normalize_project_member_ids(body.test_manager_ids, "娴嬭瘯缁忕悊")
            if body.test_manager_ids is not None
            else None
        ),
        tester_ids=(
            _normalize_project_member_ids(body.tester_ids, "娴嬭瘯浜哄憳")
            if body.tester_ids is not None
            else None
        ),
    )
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"success": True, "data": project}


@app.delete("/api/projects/{project_id}")
async def api_delete_project(project_id: int):
    """鍒犻櫎椤圭洰"""
    deleted = delete_project(project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="项目不存在")
    return {"success": True, "message": "项目已删除"}


@app.post("/api/projects/{project_id}/mapping")
async def api_upload_project_mapping(
    project_id: int,
    mapping_file: UploadFile = File(..., description="浠ｇ爜鏄犲皠鍏崇郴 CSV / Excel 鏂囦欢"),
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
            raise HTTPException(status_code=400, detail="浠呮敮鎸?CSV 鎴?Excel 浠ｇ爜鏄犲皠鏂囦欢")

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
    """鍚戦」鐩唬鐮佹槧灏勪腑淇濆瓨鍗曟潯鏄犲皠锛涜嫢鏂规硶宸插瓨鍦ㄥ垯瑕嗙洊鏇存柊"""
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
        raise HTTPException(status_code=400, detail="original_key 缂哄皯蹇呰瀛楁")

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
        raise HTTPException(status_code=400, detail="package_name/class_name/method_name 涓嶈兘涓虹┖")

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
    """涓嬭浇浠ｇ爜鏄犲皠鍏崇郴妯℃澘"""
    template_content = build_project_mapping_template()
    headers = {
        "Content-Disposition": 'attachment; filename="code-mapping-template.xlsx"',
    }
    return StreamingResponse(
        io.BytesIO(template_content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )


# ============ 鍒嗘瀽璁板綍璺敱 ============

@app.get("/api/records")
async def api_list_records(
    request: Request,
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    """鍒楀嚭鍒嗘瀽璁板綍"""
    if project_id is not None:
        _ensure_request_project_access(request, project_id)
    records = list_analysis_records(project_id=project_id, limit=limit, offset=offset)
    records = _filter_project_scoped_records(records, _get_request_user(request))
    return {"success": True, "data": [_serialize_analysis_record(item) for item in records]}


@app.get("/api/records/{record_id}")
async def api_get_record(request: Request, record_id: int):
    """鑾峰彇鍗曟潯鍒嗘瀽璁板綍"""
    record = _ensure_project_record_visible(
        request,
        get_analysis_record(record_id),
        not_found_detail="记录不存在",
    )
    return {"success": True, "data": _serialize_analysis_record(record)}


@app.post("/api/case-quality/records")
async def api_create_case_quality_record(request: Request, body: CaseQualityRecordCreateRequest):
    project = _ensure_request_project_access(request, body.project_id)
    normalized_reasoning_level = _normalize_reasoning_level(body.reasoning_level)

    requirement_record = _ensure_project_record_visible(
        request,
        get_requirement_analysis_record(body.requirement_analysis_record_id),
        not_found_detail="闇€姹傚垎鏋愯褰曚笉瀛樺湪",
    )

    analysis_record = _ensure_project_record_visible(
        request,
        get_analysis_record(body.analysis_record_id),
        not_found_detail="案例分析记录不存在",
    )

    if (
        requirement_record["project_id"] != body.project_id
        or analysis_record["project_id"] != body.project_id
        or requirement_record["project_id"] != analysis_record["project_id"]
    ):
        raise HTTPException(status_code=400, detail="鍒嗘瀽璁板綍涓庨」鐩笉鍖归厤")

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
    ) = await _build_case_quality_combined_report(
        project=project,
        requirement_record=requirement_record,
        analysis_record=analysis_record,
        case_result_snapshot=case_result_snapshot,
        use_ai=body.use_ai,
        reasoning_level=normalized_reasoning_level,
    )

    saved_record = save_case_quality_record(
        project_id=body.project_id,
        requirement_analysis_record_id=body.requirement_analysis_record_id,
        analysis_record_id=body.analysis_record_id,
        requirement_file_name=requirement_record.get("requirement_file_name") or "未命名需求文档",
        code_changes_file_name=_normalize_case_quality_code_file_name(body.code_changes_file_name),
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
            "code_changes_file_name": _normalize_case_quality_code_file_name(body.code_changes_file_name),
            "test_cases_file_name": body.test_cases_file_name,
            "use_ai": body.use_ai,
            "reasoning_level": normalized_reasoning_level,
        },
    )
    return {"success": True, "data": _serialize_case_quality_record_detail(saved_record)}


@app.get("/api/case-quality/records")
async def api_list_case_quality_records(
    request: Request,
    project_id: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
):
    if project_id is not None:
        _ensure_request_project_access(request, project_id)
    records = list_case_quality_records(project_id=project_id, limit=limit, offset=offset)
    records = _filter_project_scoped_records(records, _get_request_user(request))
    return {"success": True, "data": [_serialize_case_quality_record_summary(item) for item in records]}


@app.get("/api/case-quality/records/{record_id}")
async def api_get_case_quality_record_detail(request: Request, record_id: int):
    record = _ensure_project_record_visible(
        request,
        get_case_quality_record(record_id),
        not_found_detail="案例质检记录不存在",
    )
    return {"success": True, "data": _serialize_case_quality_record_detail(record)}


# ============ 椤圭洰鍒嗘瀽璺敱 ============

@app.post("/api/projects/{project_id}/analyze")
async def api_analyze_with_project(
    request: Request,
    project_id: int,
    code_changes: Optional[UploadFile] = File(default=None, description="浠ｇ爜鏀瑰姩JSON鏂囦欢锛堝彲閫夛級"),
    test_cases_file: UploadFile = File(..., description="测试用例 CSV / Excel / Markdown 文件"),
    mapping_file: Optional[UploadFile] = File(default=None, description="鏄犲皠鍏崇郴CSV鏂囦欢锛堝彲閫夛紝涓嶆彁渚涘垯浣跨敤椤圭洰瀛樺偍鐨勬槧灏勶級"),
    use_ai: bool = Form(default=True, description="鏄惁浣跨敤AI鍒嗘瀽"),
    source_page: Optional[str] = Form(default=None, description="鏉ユ簮椤甸潰"),
    reasoning_level: Optional[str] = Form(default=None, description="AI reasoning level"),
):
    """鍩轰簬椤圭洰涓婁笅鏂囩殑鍒嗘瀽锛岀粨鏋滆嚜鍔ㄤ繚瀛樺埌鍒嗘瀽璁板綍"""
    start_time = time.time()

    # 妫€鏌ラ」鐩槸鍚﹀瓨鍦?
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    normalized_reasoning_level = _normalize_reasoning_level(reasoning_level)

    try:
        # ---- 1. 璇诲彇鍜屾牎楠屾枃浠?----
        code_content = await code_changes.read() if code_changes is not None else None
        test_content = await test_cases_file.read()

        if code_changes is not None and code_content is not None:
            err = validate_file(code_changes.filename or "", code_content, ["json"])
            if err:
                raise HTTPException(status_code=400, detail=err)

        err = validate_file(test_cases_file.filename or "", test_content, ["csv", "excel", "markdown"])
        if err:
            raise HTTPException(status_code=400, detail=err)

        # ---- 2. 瑙ｆ瀽鏄犲皠鏁版嵁 ----
        if mapping_file is not None:
            mapping_content = await mapping_file.read()
            err = validate_file(mapping_file.filename or "", mapping_content, ["csv"])
            if err:
                raise HTTPException(status_code=400, detail=err)
            mapping_rows = parse_csv(mapping_content)
            mapping_entries = parse_mapping_data(mapping_rows)
        elif project.get("mapping_data"):
            # 浣跨敤椤圭洰瀛樺偍鐨勬槧灏勬暟鎹?
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
            raise HTTPException(status_code=400, detail="未提供映射文件，且项目未绑定映射数据")

        # ---- 3. 瑙ｆ瀽浠ｇ爜鏀瑰姩鍜屾祴璇曠敤渚?----
        code_data = None
        diff_result = None
        diff_analysis = _build_empty_diff_analysis()
        if code_content is not None:
            code_data = parse_json(code_content)
            diff_result = analyze_code_changes(json.dumps(code_data))

            if diff_result.error:
                raise HTTPException(status_code=400, detail=f"浠ｇ爜鏀瑰姩鍒嗘瀽澶辫触: {diff_result.error}")

            diff_analysis = {
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
            }

        test_file_type = detect_file_type(test_cases_file.filename or "")
        if test_file_type == "csv":
            test_rows = parse_csv(test_content)
        elif test_file_type == "excel":
            test_rows = parse_excel(test_content)
        elif test_file_type == "markdown":
            test_rows = parse_markdown_rows(test_content)
        else:
            raise HTTPException(status_code=400, detail="测试用例文件格式不支持")

        test_case_list = parse_test_cases(test_rows)
        normalized_test_cases = normalize_test_case_asset_cases(
            [test_case.to_dict() for test_case in test_case_list]
        )

        # ---- 4. AST鍒嗘瀽鎻愬彇鍙樻洿鏂规硶 ----
        changed_methods = []
        if code_data is not None:
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

        # ---- 5. 瑕嗙洊鍒嗘瀽 ----
        coverage_result = analyze_coverage(changed_methods, mapping_entries, test_case_list)

        # ---- 6. 璇勫垎 ----
        score_result = calculate_score(
            total_changed_methods=coverage_result.total_changed_methods,
            covered_count=len(coverage_result.covered_methods),
            test_cases=test_case_list,
        )
        if code_data is None:
            coverage_result.error = "未上传差异代码，本次仅对测试用例内容做静态分析。"
            _downgrade_case_score_without_diff(score_result, "未上传差异代码，覆盖范围未纳入本次评分。")
        elif coverage_result.error:
            _downgrade_case_score_without_diff(score_result, coverage_result.error)

        # ---- 7. AI鍒嗘瀽锛堝彲閫夛級----
        ai_result = None
        ai_cost = None
        token_usage = 0
        if use_ai:
            prompt_template_text = _resolve_selected_prompt_template_text(
                use_ai,
                request.query_params.get("prompt_template_key"),
            )
            diff_summary = (
                "本次未上传差异代码文件，无法基于 current/history 还原代码变更范围。"
                if diff_result is None
                else format_diff_summary(diff_result)
            )
            mapping_text = "\n".join(
                f"{e.package_name}.{e.class_name}.{e.method_name} -> {e.description}"
                for e in mapping_entries
            )
            test_text = "\n".join(
                f"{tc.test_id}: {tc.test_function} | {tc.test_steps} | {tc.expected_result}"
                for tc in test_case_list
            )

            messages = build_analysis_messages(
                diff_summary,
                mapping_text,
                test_text,
                prompt_template_text=prompt_template_text,
            )
            ai_response = await call_deepseek(messages, reasoning_level=normalized_reasoning_level)

            if "error" in ai_response:
                ai_result = {"error": ai_response["error"]}
            else:
                ai_result = ai_response["result"]
                ai_cost = calculate_cost(
                    ai_response["usage"],
                    provider=ai_response.get("provider_key"),
                )
                token_usage = ai_response["usage"].get("total_tokens", 0)

        # ---- 缁勮缁撴灉 ----
        duration_ms = int((time.time() - start_time) * 1000)

        result = {
            "diff_analysis": diff_analysis,
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

        # ---- 淇濆瓨鍒嗘瀽璁板綍 ----
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
        current_user = _get_request_user(request)
        upsert_test_case_asset(
            content_hash=build_test_case_asset_hash(normalized_test_cases),
            asset_type="upload",
            name=test_cases_file.filename or "娴嬭瘯鐢ㄤ緥",
            file_type=_infer_storage_file_type(test_cases_file.filename or "", detect_file_type(test_cases_file.filename or "")),
            file_size=len(test_content),
            original_content=test_content,
            cases=normalized_test_cases,
            project_id=project_id,
            source_page=(source_page or "").strip() or "妗堜緥璐ㄦ",
            operator_user_id=current_user.get("id") if current_user else None,
            operator_username=current_user.get("username") if current_user else None,
            operator_display_name=current_user.get("display_name") if current_user else None,
        )
        _write_audit_log(
            request,
            module="鍔熻兘娴嬭瘯",
            action="妗堜緥鍒嗘瀽",
            result="success",
            current_user=current_user,
            target_type="鍒嗘瀽璁板綍",
            target_id=str(record["id"]),
            target_name=project["name"],
            file_name=test_cases_file.filename or (
                code_changes.filename if code_changes is not None else CASE_QUALITY_OPTIONAL_CODE_FILE_NAME
            ),
            detail=(
                f"项目 {project['name']} 完成案例分析，"
                f"代码文件 {code_changes.filename if code_changes is not None else CASE_QUALITY_OPTIONAL_CODE_FILE_NAME}，"
                f"测试用例文件 {test_cases_file.filename or '未命名文件'}"
            ),
            metadata={
                "project_id": project_id,
                "analysis_record_id": record["id"],
                "code_changes_file_name": (
                    code_changes.filename if code_changes is not None else CASE_QUALITY_OPTIONAL_CODE_FILE_NAME
                ),
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
        logger.error(f"椤圭洰鍒嗘瀽澶辫触: {e}")
        raise HTTPException(status_code=500, detail=f"鏈嶅姟鍣ㄥ唴閮ㄩ敊璇? {str(e)}")


# ============ 鎺ュ彛鑷姩鍖栬矾鐢?============
@app.post("/api/ai-tools/agents/chat")
async def api_chat_with_ai_agent(
    request: Request,
    question: str = Form(..., description="鐢ㄦ埛闂"),
    agent_key: Optional[str] = Form(default=None, description="AI鍔╂墜鏍囪瘑"),
    custom_prompt: Optional[str] = Form(default=None, description="自定义 AI 助手提示词"),
    conversation_id: Optional[str] = Form(default=None, description="浼氳瘽 ID"),
    attachments: Optional[list[UploadFile]] = File(default=None, description="闄勪欢鍒楄〃"),
):
    current_user = _get_request_user(request)
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

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

    normalized_conversation_id = (conversation_id or "").strip()
    if normalized_conversation_id:
        conversation = get_ai_agent_conversation(normalized_conversation_id, user_id=current_user["id"])
        if conversation is None:
            raise HTTPException(status_code=404, detail="AI 助手会话不存在")
        if (
            conversation.get("agent_key") != agent_profile.get("key")
            or conversation.get("agent_name") != agent_profile.get("name")
        ):
            updated_conversation = update_ai_agent_conversation(
                normalized_conversation_id,
                agent_key=str(agent_profile.get("key") or ""),
                agent_name=str(agent_profile.get("name") or ""),
            )
            if updated_conversation is not None:
                conversation = updated_conversation
    else:
        conversation = create_ai_agent_conversation(
            user_id=current_user["id"],
            title=build_ai_agent_conversation_title(question_text),
            agent_key=str(agent_profile.get("key") or ""),
            agent_name=str(agent_profile.get("name") or ""),
        )

    history_records = list_ai_agent_messages(str(conversation["id"]), limit=12)
    messages = build_ai_agent_messages(
        question_text,
        agent_profile,
        attachment_payloads,
        history=history_records,
    )
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
        if "瓒呮椂" in detail:
            status_code = 504
        raise HTTPException(status_code=status_code, detail=detail)

    answer_text = ai_result.get("answer") or ai_result.get("final_content") or ""
    current_turn = build_ai_agent_user_turn(question_text, attachment_payloads)
    attachment_summaries = [
        {
            "file_name": item["file_name"],
            "file_type": item["file_type"],
            "file_size": item["file_size"],
            "excerpt": item["excerpt"],
            "truncated": bool(item["content_truncated"]),
        }
        for item in attachment_payloads
    ]
    user_message = save_ai_agent_message(
        str(conversation["id"]),
        "user",
        current_turn["question"],
        attachments=attachment_summaries,
        context_text=current_turn["context_text"],
        agent_key=str(agent_profile.get("key") or ""),
        agent_name=str(agent_profile.get("name") or ""),
    )
    assistant_message = save_ai_agent_message(
        str(conversation["id"]),
        "assistant",
        answer_text,
        agent_key=str(agent_profile.get("key") or ""),
        agent_name=str(agent_profile.get("name") or ""),
        provider=str(ai_result.get("provider") or ""),
        provider_key=str(ai_result.get("provider_key") or ""),
    )

    _write_audit_log(
        request,
        module="AI杈呭姪宸ュ叿",
        action="AI鍔╂墜闂瓟",
        result="success",
        current_user=current_user,
        target_type="AI鍔╂墜",
        target_name=str(agent_profile.get("name") or agent_profile.get("key") or "榛樿AI鍔╂墜"),
        detail=f"鎻愪氦闂骞惰繑鍥炲洖绛旓紝浼氳瘽 {conversation['id']}锛岄檮浠舵暟 {len(attachment_payloads)}",
        metadata={
            "conversation_id": conversation["id"],
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
            "answer": answer_text,
            "provider": ai_result.get("provider"),
            "provider_key": ai_result.get("provider_key"),
            "agent_key": agent_profile.get("key"),
            "agent_name": agent_profile.get("name"),
            "prompt_used": agent_profile.get("prompt"),
            "conversation_id": conversation["id"],
            "conversation_title": conversation["title"],
            "attachments": attachment_summaries,
            "user_message": _serialize_ai_agent_message(user_message),
            "assistant_message": _serialize_ai_agent_message(assistant_message),
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
    request: Request,
    project_id: int,
    document_file: UploadFile = File(..., description="鎺ュ彛鏂囨。 PDF / Word / OpenAPI JSON/YAML"),
    use_ai: bool = Form(default=True, description="鏄惁浣跨敤 AI 澧炲己鏂囨。瑙ｆ瀽"),
):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    content = await document_file.read()
    err = validate_file(document_file.filename or "", content, ["pdf", "doc", "docx", "json", "yaml"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    try:
        parsed = await parse_api_document(
            content,
            document_file.filename or "未命名接口文档",
            use_ai=use_ai,
            prompt_template_text=_resolve_selected_prompt_template_text(
                use_ai,
                request.query_params.get("prompt_template_key"),
            ),
        )
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
        raise HTTPException(status_code=404, detail="璇峰厛涓婁紶鎺ュ彛鏂囨。")

    start_time = time.time()
    generated = await generate_cases_with_ai(
        document_record,
        use_ai=body.use_ai,
        prompt_template_text=_resolve_selected_prompt_template_text(body.use_ai, body.prompt_template_key),
    )
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
        raise HTTPException(status_code=404, detail="鎺ュ彛鑷姩鍖栨墽琛岃褰曚笉瀛樺湪")
    return {"success": True, "data": _serialize_api_test_run_detail(run)}


@app.get("/api/projects/{project_id}/api-automation/runs/{run_id}/report")
async def api_get_api_automation_run_report(project_id: int, run_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    run = get_api_test_run(run_id)
    if run is None or run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="鎺ュ彛鑷姩鍖栨墽琛岃褰曚笉瀛樺湪")
    return {"success": True, "data": run.get("report_snapshot") or {}}


@app.post("/api/projects/{project_id}/api-automation/runs/{run_id}/rerun")
async def api_rerun_api_automation_run(project_id: int, run_id: int):
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")
    previous_run = get_api_test_run(run_id)
    if previous_run is None or previous_run["project_id"] != project_id:
        raise HTTPException(status_code=404, detail="鎺ュ彛鑷姩鍖栨墽琛岃褰曚笉瀛樺湪")
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


# ============ 鍏ㄥ眬鏄犲皠绠＄悊璺敱 ============

@app.get("/api/mapping")
async def api_list_mappings():
    """鑾峰彇鎵€鏈夊叏灞€鏄犲皠鍒楄〃"""
    mappings = list_global_mappings()
    return {"success": True, "data": mappings}


@app.get("/api/mapping/latest")
async def api_get_latest_mapping():
    """鑾峰彇鏈€鏂扮殑鍏ㄥ眬鏄犲皠璇︽儏"""
    mapping = get_latest_global_mapping()
    if mapping is None:
        return {"success": True, "data": None}
    return {"success": True, "data": mapping}


@app.get("/api/mapping/{mapping_id}")
async def api_get_mapping(mapping_id: int):
    """鑾峰彇鍗曚釜鏄犲皠璇︽儏"""
    mapping = get_global_mapping(mapping_id)
    if mapping is None:
        raise HTTPException(status_code=404, detail="映射不存在")
    return {"success": True, "data": mapping}


@app.post("/api/mapping")
async def api_upload_mapping(
    mapping_file: UploadFile = File(..., description="鏄犲皠鍏崇郴CSV鏂囦欢"),
):
    """涓婁紶鍏ㄥ眬鏄犲皠鏂囦欢"""
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
    """鍒犻櫎鍏ㄥ眬鏄犲皠"""
    deleted = delete_global_mapping(mapping_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="映射不存在")
    return {"success": True, "message": "映射已删除"}

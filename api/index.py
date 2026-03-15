"""
CodeTestGuard - FastAPI 入口

Vercel Serverless Function 入口文件。
所有 /api/* 路由都由此文件处理。
"""

import io
import json
import re
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from loguru import logger
from pydantic import BaseModel, Field

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
    call_deepseek,
    calculate_cost,
)
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
    create_requirement_analysis_rule,
    create_project,
    create_user,
    create_user_session,
    delete_requirement_analysis_rule,
    delete_global_mapping,
    delete_project,
    delete_requirement_mapping,
    delete_user_session,
    ensure_initial_admin,
    get_analysis_record,
    get_global_mapping,
    get_latest_global_mapping,
    get_project,
    get_project_stats,
    get_requirement_mapping,
    get_requirement_analysis_record,
    get_user_by_session_token,
    init_db,
    list_analysis_records,
    list_global_mappings,
    list_projects,
    list_requirement_analysis_records,
    list_requirement_analysis_rules,
    list_users,
    reset_user_password,
    save_analysis_record,
    save_global_mapping,
    save_requirement_mapping,
    save_requirement_analysis_record,
    update_requirement_analysis_rule,
    update_project,
    update_user,
    update_user_status,
)
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


def _serialize_requirement_record_summary(record: dict) -> dict:
    overview = (record.get("result_snapshot_json") or {}).get("overview", {})
    return {
        "id": record["id"],
        "project_id": record["project_id"],
        "project_name": record.get("project_name"),
        "requirement_file_name": record["requirement_file_name"],
        "matched_requirements": overview.get("matched_requirements", 0),
        "mapping_hit_count": overview.get("mapping_hit_count", 0),
        "use_ai": overview.get("use_ai", False),
        "token_usage": record.get("token_usage", 0),
        "cost": record.get("cost", 0.0),
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


def _serialize_requirement_rule(rule: dict) -> dict:
    return {
        "id": rule["id"],
        "rule_type": rule["rule_type"],
        "keyword": rule["keyword"],
        "rule_source": rule.get("rule_source", "custom"),
        "created_at": rule.get("created_at"),
        "updated_at": rule.get("updated_at"),
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

# ============ 路由 ============

class AuthUserResponse(BaseModel):
    id: int
    username: str
    display_name: str
    email: Optional[str] = None
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
        if path.startswith("/api/users") and current_user["role"] != "admin":
            return JSONResponse(status_code=403, content={"detail": "Admin access required"})
    elif path.startswith("/api/auth"):
        session_token = get_session_cookie_from_headers(request.headers.get("cookie"))
        if session_token:
            current_user = get_user_by_session_token(session_token)
            if current_user and current_user["status"] == "active":
                request.state.current_user = current_user

    return await call_next(request)


@app.post("/api/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, response: Response):
    """用户登录并写入会话 Cookie"""
    user = authenticate_user(body.username, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    if user["status"] != "active":
        raise HTTPException(status_code=403, detail="Account is disabled")

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
    if session_token:
        delete_user_session(session_token)
    cookie_settings = get_session_cookie_settings()
    response.delete_cookie(cookie_settings["key"], path=cookie_settings["path"])
    return {"success": True}


@app.get("/api/users")
async def api_list_users(
    keyword: Optional[str] = None,
    role: Optional[str] = None,
    status: Optional[str] = None,
):
    """管理员获取用户列表"""
    return {"success": True, "data": list_users(keyword=keyword, role=role, status=status)}


@app.post("/api/users", response_model=UserRecordResponse)
async def api_create_user(body: UserCreateRequest):
    """管理员创建用户"""
    try:
        user = create_user(
            username=body.username,
            password=body.password,
            display_name=body.display_name,
            email=body.email,
            role=body.role,
        )
        return _serialize_user_record(user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        if "UNIQUE constraint failed" in str(exc):
            raise HTTPException(status_code=409, detail="Username already exists")
        raise


@app.put("/api/users/{user_id}", response_model=UserRecordResponse)
async def api_update_user(user_id: int, body: UserUpdateRequest):
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
    return _serialize_user_record(user)


@app.put("/api/users/{user_id}/password")
async def api_reset_user_password(user_id: int, body: UserPasswordResetRequest):
    """管理员重置用户密码"""
    user = reset_user_password(user_id, body.password)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
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
            test_cases=test_rows,
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
                ai_cost = calculate_cost(ai_response["usage"])

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
    project_id: int = Form(..., description="项目ID"),
    requirement_file: UploadFile = File(..., description="需求文档 DOC/DOCX 文件"),
    use_ai: bool = Form(default=True, description="是否使用AI分析"),
):
    """基于需求文档和项目需求映射关系进行需求分析。"""
    start_time = time.time()

    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

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

        ai_analysis: dict | None = {"provider": "DeepSeek", "enabled": use_ai}
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
                if "客户端初始化失败" in error_message or "API Key" in error_message:
                    ai_analysis = {
                        "provider": "DeepSeek",
                        "enabled": False,
                        "summary": "当前未配置 DeepSeek，已返回规则分析结果，可直接按命中的映射场景补齐回归范围。",
                        "overall_assessment": "使用规则结果",
                        "key_findings": [
                            "命中关系仍由规则引擎判定，可直接参考规则结果执行回归。",
                        ],
                        "risk_table": [],
                    }
                else:
                    ai_analysis = {"provider": "DeepSeek", "enabled": True, "error": error_message}
            else:
                ai_analysis = _sanitize_requirement_ai_analysis(
                    {"provider": "DeepSeek", "enabled": True, **ai_response["result"]},
                    result["requirement_hits"],
                )
                ai_cost = calculate_cost(ai_response["usage"])
                token_usage = ai_response["usage"].get("total_tokens", 0)
        elif use_ai:
            ai_analysis = {
                "provider": "DeepSeek",
                "enabled": True,
                "summary": "本次未命中项目需求映射关系，建议继续围绕主流程、异常流和边界值做基础验证。",
                "overall_assessment": "未命中映射扩展",
                "key_findings": [
                    "当前需求点未与所选项目的需求映射关系形成直接命中。",
                    "建议仍围绕主流程、异常流、边界值和提示文案做基础验证。",
                ],
                "risk_table": [],
            }

        duration_ms = int((time.time() - start_time) * 1000)
        result["overview"]["use_ai"] = use_ai
        result["overview"]["duration_ms"] = duration_ms
        result["source_files"] = {
            "project_id": project_id,
            "project_name": project["name"],
            "requirement_file_name": requirement_file.filename or "未命名需求文档",
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
        result["ai_analysis"] = ai_analysis
        result["ai_cost"] = ai_cost

        record = save_requirement_analysis_record(
            project_id=project_id,
            requirement_file_name=requirement_file.filename or "未命名需求文档",
            section_snapshot=parsed_document,
            result_snapshot=result,
            ai_analysis=ai_analysis,
            token_usage=token_usage,
            cost=ai_cost["total_cost"] if ai_cost else 0.0,
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
        logger.error(f"需求分析失败: {e}")
        raise HTTPException(status_code=500, detail="服务器内部错误")


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
async def api_create_project(body: ProjectCreate):
    """创建新项目"""
    project = create_project(name=body.name, description=body.description)
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
async def api_update_project(project_id: int, body: ProjectUpdate):
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

        mapping_entries = parse_mapping_data(mapping_rows)

        # 将映射数据序列化存储
        mapping_data = normalize_project_mapping_entries(
            [
                {
                    "package_name": e.package_name,
                    "class_name": e.class_name,
                    "method_name": e.method_name,
                    "description": e.description,
                }
                for e in mapping_entries
            ]
        )
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
    return {"success": True, "data": records}


@app.get("/api/records/{record_id}")
async def api_get_record(record_id: int):
    """获取单条分析记录"""
    record = get_analysis_record(record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="记录不存在")
    return {"success": True, "data": record}


# ============ 项目分析路由 ============

@app.post("/api/projects/{project_id}/analyze")
async def api_analyze_with_project(
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
            test_cases=test_rows,
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
                ai_cost = calculate_cost(ai_response["usage"])
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
            ai_suggestions=ai_result,
            token_usage=token_usage,
            cost=ai_cost["total_cost"] if ai_cost else 0.0,
            duration_ms=duration_ms,
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
    mapping_entries = parse_mapping_data(mapping_rows)

    mapping_data = [
        {
            "package_name": e.package_name,
            "class_name": e.class_name,
            "method_name": e.method_name,
            "description": e.description,
        }
        for e in mapping_entries
    ]

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

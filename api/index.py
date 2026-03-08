"""
CodeTestGuard - FastAPI 入口

Vercel Serverless Function 入口文件。
所有 /api/* 路由都由此文件处理。
"""

import json
import time
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import BaseModel

from services.diff_analyzer import analyze_code_changes, format_diff_summary
from services.ast_parser import parse_java_code, extract_changed_methods
from services.coverage_analyzer import (
    parse_mapping_data,
    parse_test_cases,
    analyze_coverage,
)
from services.scoring_model import calculate_score
from services.deepseek_client import (
    build_analysis_messages,
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
from services.database import (
    init_db,
    create_project,
    get_project,
    list_projects,
    update_project,
    delete_project,
    save_analysis_record,
    get_analysis_record,
    list_analysis_records,
    get_project_stats,
    save_global_mapping,
    get_global_mapping,
    list_global_mappings,
    get_latest_global_mapping,
    delete_global_mapping,
)


@asynccontextmanager
async def lifespan(app_instance: FastAPI):
    """应用生命周期管理"""
    # Startup
    init_db()
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
    allow_origins=["*"],
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

# ============ 路由 ============

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
        return data["data"]
    if "current" in data and "history" in data:
        return data
    return {"current": [], "history": []}


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
async def import_issue_analysis(file: UploadFile = File(..., description="问题归纳Excel/CSV文件")):
    """导入问题归纳文件并输出统计图表数据"""
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
        logger.error(f"问题归纳分析失败: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


# ============ 项目管理路由 ============

@app.post("/api/defect-analysis/import")
async def import_defect_analysis(file: UploadFile = File(..., description="缺陷总结Excel/CSV文件")):
    """导入缺陷总结文件并输出统计图表数据"""
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
        logger.error(f"缺陷总结分析失败: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {str(e)}")


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
    mapping_file: UploadFile = File(..., description="映射关系CSV文件"),
):
    """上传映射文件绑定到项目"""
    project = get_project(project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="项目不存在")

    content = await mapping_file.read()
    err = validate_file(mapping_file.filename or "", content, ["csv"])
    if err:
        raise HTTPException(status_code=400, detail=err)

    mapping_rows = parse_csv(content)
    mapping_entries = parse_mapping_data(mapping_rows)

    # 将映射数据序列化存储
    mapping_data = [
        {
            "package_name": e.package_name,
            "class_name": e.class_name,
            "method_name": e.method_name,
            "description": e.description,
        }
        for e in mapping_entries
    ]

    updated = update_project(project_id=project_id, mapping_data=mapping_data)
    return {"success": True, "data": updated, "mapping_count": len(mapping_data)}


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

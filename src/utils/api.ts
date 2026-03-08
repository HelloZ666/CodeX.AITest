import axios from 'axios';
import type {
  AnalyzeResponse,
  Project,
  ProjectDetail,
  AnalysisRecord,
  AnalysisRecordSummary,
  ProjectAnalyzeResponse,
  IssueInsightResponse,
  DefectInsightResponse,
} from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 120000,
});

/** 健康检查 */
export async function healthCheck(): Promise<{ status: string; version: string }> {
  const { data } = await api.get('/health');
  return data;
}

/** 上传文件并分析（使用全局映射） */
export async function analyzeFiles(
  codeChanges: File,
  testCases: File,
  useAI: boolean = true,
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append('code_changes', codeChanges);
  formData.append('test_cases_file', testCases);
  formData.append('use_ai', String(useAI));

  const { data } = await api.post<AnalyzeResponse>('/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** 验证上传文件格式 */
export async function validateFile(
  file: File,
): Promise<{ valid: boolean; file_type?: string; row_count?: number; error?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const { data } = await api.post('/upload/validate', formData);
    return data;
  } catch (err: any) {
    if (err.response?.data) {
      return err.response.data;
    }
    return { valid: false, error: '网络异常，请稍后重试' };
  }
}

/** 导入问题归纳 Excel/CSV 文件并生成图表数据 */
export async function importIssueAnalysis(file: File): Promise<IssueInsightResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<IssueInsightResponse>('/issue-analysis/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** 导入缺陷总结 Excel/CSV 文件并生成图表数据 */
export async function importDefectAnalysis(file: File): Promise<DefectInsightResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<DefectInsightResponse>('/defect-analysis/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}


// ============ 项目管理 API ============

/** 获取项目列表 */
export async function listProjects(): Promise<Project[]> {
  const { data } = await api.get('/projects');
  return data.data ?? data;
}

/** 创建项目 */
export async function createProject(name: string, description: string = ''): Promise<Project> {
  const { data } = await api.post('/projects', { name, description });
  return data.data ?? data;
}

/** 获取项目详情 */
export async function getProject(projectId: number): Promise<ProjectDetail> {
  const { data } = await api.get(`/projects/${projectId}`);
  return data.data ?? data;
}

/** 更新项目 */
export async function updateProject(
  projectId: number,
  updates: { name?: string; description?: string },
): Promise<Project> {
  const { data } = await api.put(`/projects/${projectId}`, updates);
  return data.data ?? data;
}

/** 删除项目 */
export async function deleteProject(projectId: number): Promise<void> {
  await api.delete(`/projects/${projectId}`);
}

/** 上传映射文件到项目 */
export async function uploadProjectMapping(projectId: number, mappingFile: File): Promise<Project> {
  const formData = new FormData();
  formData.append('mapping_file', mappingFile);
  const { data } = await api.post(`/projects/${projectId}/mapping`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data ?? data;
}

/** 项目内分析（使用项目绑定的映射文件） */
export async function analyzeWithProject(
  projectId: number,
  codeChanges: File,
  testCases: File,
  mappingFile?: File,
  useAI: boolean = true,
): Promise<ProjectAnalyzeResponse> {
  const formData = new FormData();
  formData.append('code_changes', codeChanges);
  formData.append('test_cases_file', testCases);
  if (mappingFile) {
    formData.append('mapping_file', mappingFile);
  }
  formData.append('use_ai', String(useAI));

  const { data } = await api.post<ProjectAnalyzeResponse>(`/projects/${projectId}/analyze`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// ============ 分析记录 API ============

/** 获取分析记录列表 */
export async function listRecords(params?: {
  project_id?: number;
  limit?: number;
  offset?: number;
}): Promise<AnalysisRecordSummary[]> {
  const { data } = await api.get('/records', { params });
  return data.data ?? data;
}

/** 获取分析记录详情 */
export async function getRecord(recordId: number): Promise<AnalysisRecord> {
  const { data } = await api.get(`/records/${recordId}`);
  return data.data ?? data;
}

// ============ 报告导出 ============

/** 导出分析报告为JSON */
export async function exportReportJSON(recordId: number): Promise<Blob> {
  const { data } = await api.get(`/records/${recordId}`, { responseType: 'blob' });
  return data;
}

export default api;


// ============ 全局映射管理 API ============

/** 获取映射列表 */
export async function listMappings(): Promise<{ success: boolean; data: Array<{ id: number; name: string; row_count: number; created_at: string }> }> {
  const { data } = await api.get('/mapping');
  return data;
}

/** 获取最新映射详情 */
export async function getLatestMapping(): Promise<{ success: boolean; data: Record<string, unknown> | null }> {
  const { data } = await api.get('/mapping/latest');
  return data;
}

/** 上传全局映射文件 */
export async function uploadMapping(file: File): Promise<{ success: boolean; data: Record<string, unknown> }> {
  const formData = new FormData();
  formData.append('mapping_file', file);
  const { data } = await api.post('/mapping', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

/** 删除全局映射 */
export async function deleteMapping(mappingId: number): Promise<void> {
  await api.delete(`/mapping/${mappingId}`);
}

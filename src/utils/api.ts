import axios from 'axios';
import type {
  AnalysisRecord,
  AnalysisRecordSummary,
  AnalyzeResponse,
  AuthUser,
  DefectInsightResponse,
  IssueInsightResponse,
  ProductionIssueFileRecord,
  Project,
  ProjectAnalyzeResponse,
  ProjectDetail,
  RequirementAnalysisRule,
  RequirementAnalysisRuleList,
  RequirementAnalysisRecord,
  RequirementAnalysisRecordSummary,
  RequirementAnalysisResponse,
  TestIssueFileRecord,
  UserListResponse,
  UserRecord,
  UserRole,
  UserStatus,
} from '../types';

export const AUTH_EXPIRED_EVENT = 'codetestguard:auth-expired';
const DEFAULT_API_TIMEOUT_MS = 120000;
const AUTH_REQUEST_TIMEOUT_MS = 10000;
const API_ERROR_MESSAGE_MAP: Record<string, string> = {
  'Invalid username or password': '账号或密码错误，请重试',
  'Account is disabled': '账号已禁用，请联系管理员',
};

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: DEFAULT_API_TIMEOUT_MS,
  withCredentials: true,
});

function shouldSkipAuthEvent(url?: string): boolean {
  return Boolean(url?.startsWith('/auth/'));
}

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const detail = error?.response?.data?.detail;
    const requestUrl = error?.config?.url as string | undefined;
    const shouldDispatch =
      !shouldSkipAuthEvent(requestUrl)
      && (status === 401 || (status === 403 && detail === 'Account is disabled'));

    if (shouldDispatch && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    }

    return Promise.reject(error);
  },
);

export function extractApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return API_ERROR_MESSAGE_MAP[detail] || detail;
    }
    if (error.code === 'ECONNABORTED') {
      return '服务响应超时，请确认后端服务已正常启动';
    }
    if (!error.response) {
      return '无法连接到后端服务，请确认本地 API 已启动';
    }
  }
  return fallback;
}

function unwrapData<T>(payload: T | { success?: boolean; data?: T }): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export async function healthCheck(): Promise<{ status: string; version: string }> {
  const { data } = await api.get('/health');
  return data;
}

export async function login(username: string, password: string): Promise<AuthUser> {
  const { data } = await api.post<{ success: boolean; user: AuthUser }>('/auth/login', {
    username,
    password,
  }, {
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data.user;
}

export async function getCurrentUser(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me', {
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout', undefined, {
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
}

export async function listUsers(params?: {
  keyword?: string;
  role?: UserRole | '';
  status?: UserStatus | '';
}): Promise<UserRecord[]> {
  const { data } = await api.get<UserListResponse>('/users', {
    params: {
      keyword: params?.keyword || undefined,
      role: params?.role || undefined,
      status: params?.status || undefined,
    },
  });
  return data.data ?? [];
}

export async function createUser(input: {
  username: string;
  password: string;
  display_name: string;
  email?: string;
  role: UserRole;
}): Promise<UserRecord> {
  const { data } = await api.post<UserRecord>('/users', input);
  return data;
}

export async function updateUser(
  userId: number,
  input: {
    display_name?: string;
    email?: string;
    role?: UserRole;
  },
): Promise<UserRecord> {
  const { data } = await api.put<UserRecord>(`/users/${userId}`, input);
  return data;
}

export async function updateUserStatus(userId: number, status: UserStatus): Promise<UserRecord> {
  const { data } = await api.put<UserRecord>(`/users/${userId}/status`, { status });
  return data;
}

export async function resetUserPassword(userId: number, password: string): Promise<void> {
  await api.put(`/users/${userId}/password`, { password });
}

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

export async function validateFile(
  file: File,
): Promise<{ valid: boolean; file_type?: string; row_count?: number; error?: string }> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const { data } = await api.post('/upload/validate', formData);
    return data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.data) {
      return error.response.data;
    }
    return { valid: false, error: '网络异常，请稍后重试' };
  }
}

export async function importIssueAnalysis(file: File): Promise<IssueInsightResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<IssueInsightResponse>('/issue-analysis/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function importDefectAnalysis(file: File): Promise<DefectInsightResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<DefectInsightResponse>('/defect-analysis/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function listProductionIssueFiles(): Promise<ProductionIssueFileRecord[]> {
  const { data } = await api.get<{ success: boolean; data: ProductionIssueFileRecord[] }>('/production-issue-files');
  return data.data ?? [];
}

export async function uploadProductionIssueFile(file: File): Promise<ProductionIssueFileRecord> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<{ success: boolean; data: ProductionIssueFileRecord }>(
    '/production-issue-files',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export async function getProductionIssueAnalysis(fileId: number): Promise<IssueInsightResponse> {
  const { data } = await api.get<IssueInsightResponse>(`/production-issue-files/${fileId}/analysis`);
  return data;
}

export async function listTestIssueFiles(projectId?: number): Promise<TestIssueFileRecord[]> {
  const { data } = await api.get<{ success: boolean; data: TestIssueFileRecord[] }>('/test-issue-files', {
    params: projectId ? { project_id: projectId } : undefined,
  });
  return data.data ?? [];
}

export async function getTestIssueAnalysis(fileId: number): Promise<DefectInsightResponse> {
  const { data } = await api.get<DefectInsightResponse>(`/test-issue-files/${fileId}/analysis`);
  return data;
}

export async function uploadTestIssueFile(projectId: number, file: File): Promise<TestIssueFileRecord> {
  const formData = new FormData();
  formData.append('project_id', String(projectId));
  formData.append('file', file);

  const { data } = await api.post<{ success: boolean; data: TestIssueFileRecord }>(
    '/test-issue-files',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export async function analyzeRequirement(
  projectId: number,
  requirementFile: File,
  useAI: boolean = true,
): Promise<RequirementAnalysisResponse> {
  const formData = new FormData();
  formData.append('project_id', String(projectId));
  formData.append('requirement_file', requirementFile);
  formData.append('use_ai', String(useAI));

  const { data } = await api.post<RequirementAnalysisResponse>('/requirement-analysis/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function listRequirementAnalysisRecords(params?: {
  project_id?: number;
  limit?: number;
  offset?: number;
}): Promise<RequirementAnalysisRecordSummary[]> {
  const { data } = await api.get<
    RequirementAnalysisRecordSummary[] | { data?: RequirementAnalysisRecordSummary[] }
  >('/requirement-analysis/records', { params });
  return unwrapData(data) ?? [];
}

export async function getRequirementAnalysisRecord(recordId: number): Promise<RequirementAnalysisRecord> {
  const { data } = await api.get<RequirementAnalysisRecord | { data?: RequirementAnalysisRecord }>(
    `/requirement-analysis/records/${recordId}`,
  );
  return unwrapData(data);
}

export async function listRequirementAnalysisRules(): Promise<RequirementAnalysisRuleList> {
  const { data } = await api.get<RequirementAnalysisRuleList | { data?: RequirementAnalysisRuleList }>(
    '/requirement-analysis/rules',
  );
  return unwrapData(data);
}

export async function createRequirementAnalysisRule(
  ruleType: 'ignore' | 'allow',
  keyword: string,
): Promise<RequirementAnalysisRule> {
  const { data } = await api.post<RequirementAnalysisRule | { data?: RequirementAnalysisRule }>(
    '/requirement-analysis/rules',
    {
      rule_type: ruleType,
      keyword,
    },
  );
  return unwrapData(data);
}

export async function updateRequirementAnalysisRule(
  ruleId: number,
  ruleType: 'ignore' | 'allow',
  keyword: string,
): Promise<RequirementAnalysisRule> {
  const { data } = await api.put<RequirementAnalysisRule | { data?: RequirementAnalysisRule }>(
    `/requirement-analysis/rules/${ruleId}`,
    {
      rule_type: ruleType,
      keyword,
    },
  );
  return unwrapData(data);
}

export async function deleteRequirementAnalysisRule(ruleId: number): Promise<void> {
  await api.delete(`/requirement-analysis/rules/${ruleId}`);
}

export async function listProjects(): Promise<Project[]> {
  const { data } = await api.get<Project[] | { success?: boolean; data?: Project[] }>('/projects');
  return unwrapData(data) ?? [];
}

export async function createProject(name: string, description: string = ''): Promise<Project> {
  const { data } = await api.post<Project | { data?: Project }>('/projects', { name, description });
  return unwrapData(data);
}

export async function getProject(projectId: number): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail | { data?: ProjectDetail }>(`/projects/${projectId}`);
  return unwrapData(data);
}

export async function updateProject(
  projectId: number,
  updates: { name?: string; description?: string },
): Promise<Project> {
  const { data } = await api.put<Project | { data?: Project }>(`/projects/${projectId}`, updates);
  return unwrapData(data);
}

export async function deleteProject(projectId: number): Promise<void> {
  await api.delete(`/projects/${projectId}`);
}

export async function uploadProjectMapping(projectId: number, mappingFile: File): Promise<Project> {
  const formData = new FormData();
  formData.append('mapping_file', mappingFile);
  const { data } = await api.post<Project | { data?: Project }>(`/projects/${projectId}/mapping`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return unwrapData(data);
}

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

export async function listRecords(params?: {
  project_id?: number;
  limit?: number;
  offset?: number;
}): Promise<AnalysisRecordSummary[]> {
  const { data } = await api.get<AnalysisRecordSummary[] | { data?: AnalysisRecordSummary[] }>('/records', { params });
  return unwrapData(data) ?? [];
}

export async function getRecord(recordId: number): Promise<AnalysisRecord> {
  const { data } = await api.get<AnalysisRecord | { data?: AnalysisRecord }>(`/records/${recordId}`);
  return unwrapData(data);
}

export async function exportReportJSON(recordId: number): Promise<Blob> {
  const { data } = await api.get(`/records/${recordId}`, { responseType: 'blob' });
  return data;
}

export async function listMappings(): Promise<{ success: boolean; data: Array<{ id: number; name: string; row_count: number; created_at: string }> }> {
  const { data } = await api.get('/mapping');
  return data;
}

export async function getLatestMapping(): Promise<{ success: boolean; data: Record<string, unknown> | null }> {
  const { data } = await api.get('/mapping/latest');
  return data;
}

export async function uploadMapping(file: File): Promise<{ success: boolean; data: Record<string, unknown> }> {
  const formData = new FormData();
  formData.append('mapping_file', file);
  const { data } = await api.post('/mapping', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteMapping(mappingId: number): Promise<void> {
  await api.delete(`/mapping/${mappingId}`);
}

export default api;

import axios from 'axios';
import type {
  AIAgentChatResult,
  AnalysisRecord,
  AnalysisRecordSummary,
  AuditLogListResponse,
  AuditLogRecord,
  ApiAutomationEnvironment,
  ApiDocumentRecord,
  ApiRunDetail,
  ApiRunReport,
  ApiRunSummary,
  ApiTestSuite,
  AnalyzeResponse,
  AuthUser,
  CaseQualityRecordDetail,
  CaseQualityRecordSummary,
  CodeMappingEntry,
  ConfigRequirementDocumentRecord,
  ConfigTestCaseAssetDetail,
  ConfigTestCaseAssetSummary,
  DefectInsightResponse,
  FunctionalCaseGenerationResponse,
  FunctionalTestCaseRecordDetail,
  FunctionalTestCaseRecordSummary,
  IssueInsightResponse,
  ProductionIssueFileRecord,
  Project,
  ProjectMappingEntryKey,
  ProjectAnalyzeResponse,
  ProjectDetail,
  PromptTemplate,
  PerformanceAnalysisDashboardV2,
  PerformanceAnalysisFileRecord,
  RequirementAnalysisRule,
  RequirementAnalysisRuleList,
  RequirementAnalysisRecord,
  RequirementAnalysisRecordSummary,
  RequirementAnalysisResponse,
  RequirementMappingDetail,
  RequirementMappingGroup,
  TestIssueFileRecord,
  UpdateProjectMappingEntryPayload,
  UserListResponse,
  UserRecord,
  UserRole,
  UserStatus,
} from '../types';

export const AUTH_EXPIRED_EVENT = 'codetestguard:auth-expired';
const DEFAULT_API_TIMEOUT_MS = 120000;
const AUTH_REQUEST_TIMEOUT_MS = 10000;
const LONG_RUNNING_API_TIMEOUT_MS = 300000;
const LOCAL_API_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0']);
const API_ERROR_MESSAGE_MAP: Record<string, string> = {
  'Invalid username or password': '账号或密码错误，请重试',
  'Account is disabled': '账号已禁用，请联系管理员',
};

type BrowserLocationLike = Pick<Location, 'protocol' | 'hostname' | 'port'>;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function normalizePromptTemplateKey(promptTemplateKey?: string): string | undefined {
  const normalizedKey = promptTemplateKey?.trim();
  return normalizedKey ? normalizedKey : undefined;
}

function resolveLocalApiOrigin(location: BrowserLocationLike): string {
  const apiHost = location.hostname === '0.0.0.0'
    ? '127.0.0.1'
    : location.hostname;
  return `${location.protocol}//${apiHost}:8000`;
}

export function resolveApiBaseUrl(
  configuredBaseUrl: string | undefined = import.meta.env.VITE_API_URL,
  location: BrowserLocationLike | undefined = typeof window !== 'undefined' ? window.location : undefined,
): string {
  const explicitBaseUrl = configuredBaseUrl?.trim();
  if (explicitBaseUrl) {
    return trimTrailingSlash(explicitBaseUrl);
  }

  if (!location) {
    return '/api';
  }

  if (location.protocol === 'file:') {
    return 'http://127.0.0.1:8000/api';
  }

  if (LOCAL_API_HOSTS.has(location.hostname) && location.port !== '8000') {
    return `${resolveLocalApiOrigin(location)}/api`;
  }

  return '/api';
}

const api = axios.create({
  baseURL: resolveApiBaseUrl(),
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
      return '服务响应超时，请确认后端服务正常；若当前操作开启了 AI，可关闭 AI 后重试';
    }
    if (!error.response) {
      return '无法连接到后端服务，请确认本地 API 已启动';
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
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

export async function deleteUser(userId: number): Promise<void> {
  await api.delete(`/users/${userId}`);
}

export async function listAuditLogs(params?: {
  keyword?: string;
  module?: string;
  result?: 'success' | 'failure' | '';
  limit?: number;
  offset?: number;
}): Promise<{ records: AuditLogRecord[]; total: number }> {
  const { data } = await api.get<AuditLogListResponse>('/audit-logs', {
    params: {
      keyword: params?.keyword || undefined,
      module: params?.module || undefined,
      result: params?.result || undefined,
      limit: params?.limit ?? 50,
      offset: params?.offset ?? 0,
    },
  });
  return {
    records: data.data ?? [],
    total: data.total ?? 0,
  };
}

export async function analyzeFiles(
  codeChanges: File,
  testCases: File,
  useAI: boolean = true,
  promptTemplateKey?: string,
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append('code_changes', codeChanges);
  formData.append('test_cases_file', testCases);
  formData.append('use_ai', String(useAI));
  const normalizedPromptTemplateKey = useAI ? normalizePromptTemplateKey(promptTemplateKey) : undefined;
  if (normalizedPromptTemplateKey) {
    formData.append('prompt_template_key', normalizedPromptTemplateKey);
  }

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

export async function listPerformanceAnalysisFiles(): Promise<PerformanceAnalysisFileRecord[]> {
  const { data } = await api.get<{ success: boolean; data: PerformanceAnalysisFileRecord[] }>('/performance-analysis-files');
  return data.data ?? [];
}

export async function uploadPerformanceAnalysisFile(file: File): Promise<PerformanceAnalysisFileRecord> {
  const formData = new FormData();
  formData.append('file', file);

  const { data } = await api.post<{ success: boolean; data: PerformanceAnalysisFileRecord }>(
    '/performance-analysis-files',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data.data;
}

export async function getPerformanceAnalysis(fileId: number): Promise<PerformanceAnalysisDashboardV2> {
  const { data } = await api.get<{ success: boolean; data: PerformanceAnalysisDashboardV2 }>(
    `/performance-analysis-files/${fileId}/analysis`,
  );
  return data.data;
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
  promptTemplateKey?: string,
  sourcePage?: string,
): Promise<RequirementAnalysisResponse> {
  const formData = new FormData();
  formData.append('project_id', String(projectId));
  formData.append('requirement_file', requirementFile);
  formData.append('use_ai', String(useAI));
  const normalizedPromptTemplateKey = useAI ? normalizePromptTemplateKey(promptTemplateKey) : undefined;
  if (normalizedPromptTemplateKey) {
    formData.append('prompt_template_key', normalizedPromptTemplateKey);
  }
  if (sourcePage?.trim()) {
    formData.append('source_page', sourcePage.trim());
  }

  const { data } = await api.post<RequirementAnalysisResponse>('/requirement-analysis/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function generateFunctionalTestCases(
  promptTemplateKey: string | undefined,
  requirementFile: File,
  sourcePage?: string,
): Promise<FunctionalCaseGenerationResponse> {
  const formData = new FormData();
  formData.append('requirement_file', requirementFile);
  const normalizedPromptTemplateKey = normalizePromptTemplateKey(promptTemplateKey);
  if (normalizedPromptTemplateKey) {
    formData.append('prompt_template_key', normalizedPromptTemplateKey);
  }
  if (sourcePage?.trim()) {
    formData.append('source_page', sourcePage.trim());
  }

  const { data } = await api.post<FunctionalCaseGenerationResponse>(
    '/functional-testing/case-generation/generate',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: LONG_RUNNING_API_TIMEOUT_MS,
    },
  );
  return data;
}

export async function listFunctionalTestCaseRecords(params?: {
  limit?: number;
  offset?: number;
}): Promise<FunctionalTestCaseRecordSummary[]> {
  const { data } = await api.get<
    FunctionalTestCaseRecordSummary[] | { data?: FunctionalTestCaseRecordSummary[] }
  >('/functional-testing/test-cases', { params });
  return unwrapData(data) ?? [];
}

export async function getFunctionalTestCaseRecord(recordId: number): Promise<FunctionalTestCaseRecordDetail> {
  const { data } = await api.get<
    FunctionalTestCaseRecordDetail | { data?: FunctionalTestCaseRecordDetail }
  >(`/functional-testing/test-cases/${recordId}`);
  return unwrapData(data);
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

export async function createProject(input: {
  name: string;
  description?: string;
  test_manager_ids?: number[];
  tester_ids?: number[];
}): Promise<Project> {
  const { data } = await api.post<Project | { data?: Project }>('/projects', input);
  return unwrapData(data);
}

export async function getProject(projectId: number): Promise<ProjectDetail> {
  const { data } = await api.get<ProjectDetail | { data?: ProjectDetail }>(`/projects/${projectId}`);
  return unwrapData(data);
}

export async function updateProject(
  projectId: number,
  updates: {
    name?: string;
    description?: string;
    test_manager_ids?: number[];
    tester_ids?: number[];
  },
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

export async function createProjectMappingEntry(
  projectId: number,
  entry: CodeMappingEntry,
): Promise<Project> {
  const { data } = await api.post<Project | { data?: Project }>(
    `/projects/${projectId}/mapping/entries`,
    entry,
  );
  return unwrapData(data);
}

export async function updateProjectMappingEntry(
  projectId: number,
  payload: UpdateProjectMappingEntryPayload,
): Promise<Project> {
  const { data } = await api.put<Project | { data?: Project }>(
    `/projects/${projectId}/mapping/entries`,
    payload,
  );
  return unwrapData(data);
}

export async function deleteProjectMappingEntry(
  projectId: number,
  entryKey: ProjectMappingEntryKey,
): Promise<Project> {
  const { data } = await api.delete<Project | { data?: Project }>(`/projects/${projectId}/mapping/entries`, {
    params: entryKey,
  });
  return unwrapData(data);
}

export async function downloadProjectMappingTemplate(): Promise<Blob> {
  const { data } = await api.get('/project-mapping-template', { responseType: 'blob' });
  return data;
}

export async function getRequirementMapping(projectId: number): Promise<RequirementMappingDetail | null> {
  try {
    const { data } = await api.get<RequirementMappingDetail | { data?: RequirementMappingDetail }>(
      `/projects/${projectId}/requirement-mapping`,
    );
    return unwrapData(data);
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function uploadRequirementMapping(
  projectId: number,
  file: File,
): Promise<RequirementMappingDetail> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<RequirementMappingDetail | { data?: RequirementMappingDetail }>(
    `/projects/${projectId}/requirement-mapping`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return unwrapData(data);
}

export async function saveRequirementMapping(
  projectId: number,
  groups: RequirementMappingGroup[],
): Promise<RequirementMappingDetail | null> {
  const { data } = await api.put<RequirementMappingDetail | { data?: RequirementMappingDetail } | { data: null }>(
    `/projects/${projectId}/requirement-mapping`,
    { groups },
  );
  return unwrapData(data) ?? null;
}

export async function downloadRequirementMappingTemplate(): Promise<Blob> {
  const { data } = await api.get('/requirement-mapping-template', { responseType: 'blob' });
  return data;
}

export async function analyzeWithProject(
  projectId: number,
  codeChanges: File,
  testCases: File,
  mappingFile?: File,
  useAI: boolean = true,
  promptTemplateKey?: string,
  sourcePage?: string,
): Promise<ProjectAnalyzeResponse> {
  const formData = new FormData();
  formData.append('code_changes', codeChanges);
  formData.append('test_cases_file', testCases);
  if (mappingFile) {
    formData.append('mapping_file', mappingFile);
  }
  formData.append('use_ai', String(useAI));
  if (sourcePage?.trim()) {
    formData.append('source_page', sourcePage.trim());
  }
  const normalizedPromptTemplateKey = useAI ? normalizePromptTemplateKey(promptTemplateKey) : undefined;

  const { data } = await api.post<ProjectAnalyzeResponse>(`/projects/${projectId}/analyze`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    params: normalizedPromptTemplateKey
      ? { prompt_template_key: normalizedPromptTemplateKey }
      : undefined,
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

export async function listConfigRequirementDocuments(params?: {
  limit?: number;
  offset?: number;
}): Promise<ConfigRequirementDocumentRecord[]> {
  const { data } = await api.get<
    ConfigRequirementDocumentRecord[] | { data?: ConfigRequirementDocumentRecord[] }
  >('/config-management/requirement-documents', { params });
  return unwrapData(data) ?? [];
}

export async function listConfigTestCaseAssets(params?: {
  limit?: number;
  offset?: number;
}): Promise<ConfigTestCaseAssetSummary[]> {
  const { data } = await api.get<
    ConfigTestCaseAssetSummary[] | { data?: ConfigTestCaseAssetSummary[] }
  >('/config-management/test-cases', { params });
  return unwrapData(data) ?? [];
}

export async function getConfigTestCaseAsset(assetId: number): Promise<ConfigTestCaseAssetDetail> {
  const { data } = await api.get<
    ConfigTestCaseAssetDetail | { data?: ConfigTestCaseAssetDetail }
  >(`/config-management/test-cases/${assetId}`);
  return unwrapData(data);
}

export async function createCaseQualityRecord(input: {
  project_id: number;
  requirement_analysis_record_id: number;
  analysis_record_id: number;
  code_changes_file_name: string;
  test_cases_file_name: string;
  use_ai: boolean;
}): Promise<CaseQualityRecordDetail> {
  const { data } = await api.post<CaseQualityRecordDetail | { data?: CaseQualityRecordDetail }>(
    '/case-quality/records',
    input,
  );
  return unwrapData(data);
}

export async function listCaseQualityRecords(params?: {
  project_id?: number;
  limit?: number;
  offset?: number;
}): Promise<CaseQualityRecordSummary[]> {
  const { data } = await api.get<
    CaseQualityRecordSummary[] | { data?: CaseQualityRecordSummary[] }
  >('/case-quality/records', { params });
  return unwrapData(data) ?? [];
}

export async function getCaseQualityRecord(recordId: number): Promise<CaseQualityRecordDetail> {
  const { data } = await api.get<CaseQualityRecordDetail | { data?: CaseQualityRecordDetail }>(
    `/case-quality/records/${recordId}`,
  );
  return unwrapData(data);
}

export async function exportReportJSON(recordId: number): Promise<Blob> {
  const { data } = await api.get(`/records/${recordId}`, { responseType: 'blob' });
  return data;
}

export async function getApiAutomationEnvironment(projectId: number): Promise<ApiAutomationEnvironment> {
  const { data } = await api.get<ApiAutomationEnvironment | { data?: ApiAutomationEnvironment }>(
    `/projects/${projectId}/api-automation/environment`,
  );
  return unwrapData(data);
}

export async function saveApiAutomationEnvironment(
  projectId: number,
  payload: {
    base_url: string;
    timeout_ms: number;
    auth_mode: string;
    common_headers: Record<string, string>;
    auth_config: Record<string, unknown>;
    signature_template: Record<string, unknown>;
    login_binding: Record<string, unknown>;
  },
): Promise<ApiAutomationEnvironment> {
  const { data } = await api.put<ApiAutomationEnvironment | { data?: ApiAutomationEnvironment }>(
    `/projects/${projectId}/api-automation/environment`,
    payload,
  );
  return unwrapData(data);
}

export async function uploadApiAutomationDocument(
  projectId: number,
  file: File,
  useAI: boolean = true,
  promptTemplateKey?: string,
): Promise<ApiDocumentRecord> {
  const formData = new FormData();
  formData.append('document_file', file);
  formData.append('use_ai', String(useAI));
  const normalizedPromptTemplateKey = useAI ? normalizePromptTemplateKey(promptTemplateKey) : undefined;
  const { data } = await api.post<ApiDocumentRecord | { data?: ApiDocumentRecord }>(
    `/projects/${projectId}/api-automation/documents`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: normalizedPromptTemplateKey
        ? { prompt_template_key: normalizedPromptTemplateKey }
        : undefined,
      timeout: LONG_RUNNING_API_TIMEOUT_MS,
    },
  );
  return unwrapData(data);
}

export async function getLatestApiAutomationDocument(projectId: number): Promise<ApiDocumentRecord | null> {
  const { data } = await api.get<ApiDocumentRecord | { data?: ApiDocumentRecord | null }>(
    `/projects/${projectId}/api-automation/documents/latest`,
  );
  return unwrapData(data) ?? null;
}

export async function generateApiAutomationCases(
  projectId: number,
  payload: { use_ai: boolean; name?: string; prompt_template_key?: string },
): Promise<ApiTestSuite> {
  const normalizedPromptTemplateKey = payload.use_ai
    ? normalizePromptTemplateKey(payload.prompt_template_key)
    : undefined;
  const { data } = await api.post<ApiTestSuite | { data?: ApiTestSuite }>(
    `/projects/${projectId}/api-automation/cases/generate`,
    {
      use_ai: payload.use_ai,
      name: payload.name,
      ...(normalizedPromptTemplateKey ? { prompt_template_key: normalizedPromptTemplateKey } : {}),
    },
    { timeout: LONG_RUNNING_API_TIMEOUT_MS },
  );
  return unwrapData(data);
}

export async function getLatestApiAutomationSuite(projectId: number): Promise<ApiTestSuite | null> {
  const { data } = await api.get<ApiTestSuite | { data?: ApiTestSuite | null }>(
    `/projects/${projectId}/api-automation/suites/latest`,
  );
  return unwrapData(data) ?? null;
}

export async function getApiAutomationSuite(projectId: number, suiteId: number): Promise<ApiTestSuite> {
  const { data } = await api.get<ApiTestSuite | { data?: ApiTestSuite }>(
    `/projects/${projectId}/api-automation/suites/${suiteId}`,
  );
  return unwrapData(data);
}

export async function saveApiAutomationSuite(
  projectId: number,
  suiteId: number,
  payload: { name: string; endpoints?: Array<Record<string, unknown>>; cases: Array<Record<string, unknown>> },
): Promise<ApiTestSuite> {
  const { data } = await api.put<ApiTestSuite | { data?: ApiTestSuite }>(
    `/projects/${projectId}/api-automation/suites/${suiteId}`,
    payload,
  );
  return unwrapData(data);
}

export async function listApiAutomationRuns(projectId: number): Promise<ApiRunSummary[]> {
  const { data } = await api.get<ApiRunSummary[] | { data?: ApiRunSummary[] }>(
    `/projects/${projectId}/api-automation/runs`,
  );
  return unwrapData(data) ?? [];
}

export async function createApiAutomationRun(
  projectId: number,
  payload: { suite_id: number },
): Promise<ApiRunDetail> {
  const { data } = await api.post<ApiRunDetail | { data?: ApiRunDetail }>(
    `/projects/${projectId}/api-automation/runs`,
    payload,
    { timeout: LONG_RUNNING_API_TIMEOUT_MS },
  );
  return unwrapData(data);
}

export async function getApiAutomationRun(projectId: number, runId: number): Promise<ApiRunDetail> {
  const { data } = await api.get<ApiRunDetail | { data?: ApiRunDetail }>(
    `/projects/${projectId}/api-automation/runs/${runId}`,
  );
  return unwrapData(data);
}

export async function getApiAutomationRunReport(projectId: number, runId: number): Promise<ApiRunReport> {
  const { data } = await api.get<ApiRunReport | { data?: ApiRunReport }>(
    `/projects/${projectId}/api-automation/runs/${runId}/report`,
  );
  return unwrapData(data);
}

export async function rerunApiAutomationRun(projectId: number, runId: number): Promise<ApiRunDetail> {
  const { data } = await api.post<ApiRunDetail | { data?: ApiRunDetail }>(
    `/projects/${projectId}/api-automation/runs/${runId}/rerun`,
    undefined,
    { timeout: LONG_RUNNING_API_TIMEOUT_MS },
  );
  return unwrapData(data);
}

export async function listPromptTemplates(): Promise<PromptTemplate[]> {
  try {
    const { data } = await api.get<PromptTemplate[] | { data?: PromptTemplate[] }>('/prompt-templates');
    return unwrapData(data) ?? [];
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return [];
    }
    throw error;
  }
}

export async function createPromptTemplate(input: {
  name: string;
  prompt: string;
}): Promise<PromptTemplate> {
  const { data } = await api.post<PromptTemplate | { data?: PromptTemplate }>('/prompt-templates', input);
  return unwrapData(data);
}

export async function updatePromptTemplate(
  templateId: number,
  input: {
    name: string;
    prompt: string;
  },
): Promise<PromptTemplate> {
  const { data } = await api.put<PromptTemplate | { data?: PromptTemplate }>(
    `/prompt-templates/${templateId}`,
    input,
  );
  return unwrapData(data);
}

export async function deletePromptTemplate(templateId: number): Promise<void> {
  await api.delete(`/prompt-templates/${templateId}`);
}

export async function chatWithAIAgent(input: {
  question: string;
  agent_key?: string;
  custom_prompt?: string;
  conversation_id?: string;
  attachments?: File[];
}): Promise<AIAgentChatResult> {
  const formData = new FormData();
  formData.append('question', input.question);
  if (input.agent_key?.trim()) {
    formData.append('agent_key', input.agent_key.trim());
  }
  if (input.custom_prompt?.trim()) {
    formData.append('custom_prompt', input.custom_prompt.trim());
  }
  if (input.conversation_id?.trim()) {
    formData.append('conversation_id', input.conversation_id.trim());
  }
  for (const file of input.attachments ?? []) {
    formData.append('attachments', file);
  }

  const { data } = await api.post<AIAgentChatResult | { data?: AIAgentChatResult }>(
    '/ai-tools/agents/chat',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: LONG_RUNNING_API_TIMEOUT_MS,
    },
  );
  return unwrapData(data);
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

import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  analyzeRequirement,
  analyzeWithProject,
  chatWithAIAgent,
  createPromptTemplate,
  createProject,
  createUser,
  deletePromptTemplate,
  extractApiErrorMessage,
  exportReportJSON,
  generateFunctionalTestCases,
  generateApiAutomationCases,
  getCurrentUser,
  healthCheck,
  listPromptTemplates,
  listProjects,
  listUsers,
  login,
  resetUserPassword,
  resolveApiBaseUrl,
  uploadApiAutomationDocument,
  updatePromptTemplate,
  updateUserStatus,
  validateFile,
} from './api';

const { mockAxios } = vi.hoisted(() => ({
  mockAxios: {
    create: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}));

vi.mock('axios', () => ({
  default: {
    ...mockAxios,
    create: vi.fn(() => mockAxios),
    isAxiosError: vi.fn((error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError)),
  },
}));

const mockedAxios = axios as unknown as typeof mockAxios & {
  isAxiosError: (error: unknown) => boolean;
};

describe('api utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(axios.isAxiosError).mockImplementation(
      (error: unknown) => Boolean((error as { isAxiosError?: boolean })?.isAxiosError),
    );
  });

  it('calls health endpoint', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { status: 'ok', version: '1.0.0' } });

    const result = await healthCheck();

    expect(result.status).toBe('ok');
    expect(mockedAxios.get).toHaveBeenCalledWith('/health');
  });

  it('resolves local preview and file protocol api base url to backend default port', () => {
    expect(resolveApiBaseUrl(undefined, {
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: '4173',
    })).toBe('http://127.0.0.1:8000/api');

    expect(resolveApiBaseUrl(undefined, {
      protocol: 'http:',
      hostname: 'localhost',
      port: '5173',
    })).toBe('http://localhost:8000/api');

    expect(resolveApiBaseUrl(undefined, {
      protocol: 'http:',
      hostname: '0.0.0.0',
      port: '5173',
    })).toBe('http://127.0.0.1:8000/api');

    expect(resolveApiBaseUrl(undefined, {
      protocol: 'file:',
      hostname: '',
      port: '',
    })).toBe('http://127.0.0.1:8000/api');
  });

  it('prefers configured api base url and trims trailing slash', () => {
    expect(resolveApiBaseUrl('http://localhost:9000/api/')).toBe('http://localhost:9000/api');
    expect(resolveApiBaseUrl(undefined, {
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: '8000',
    })).toBe('/api');
  });

  it('logs in and returns current user', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        user: {
          id: 1,
          username: 'admin',
          display_name: '管理员',
          email: null,
          role: 'admin',
          status: 'active',
        },
      },
    });

    const result = await login('admin', 'Admin123!');

    expect(result.username).toBe('admin');
    expect(mockedAxios.post).toHaveBeenCalledWith('/auth/login', {
      username: 'admin',
      password: 'Admin123!',
    }, {
      timeout: 10000,
    });
  });

  it('gets current authenticated user', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        id: 1,
        username: 'admin',
        display_name: '管理员',
        email: null,
        role: 'admin',
        status: 'active',
      },
    });

    const result = await getCurrentUser();

    expect(result.role).toBe('admin');
    expect(mockedAxios.get).toHaveBeenCalledWith('/auth/me', {
      timeout: 10000,
    });
  });

  it('extracts friendly message for timeout and offline errors', () => {
    mockedAxios.isAxiosError = vi.fn(() => true);

    expect(
      extractApiErrorMessage(
        { isAxiosError: true, response: { data: { detail: 'Invalid username or password' } } },
        'fallback',
      ),
    ).toBe('账号或密码错误，请重试');
    expect(extractApiErrorMessage({ isAxiosError: true, code: 'ECONNABORTED' }, 'fallback')).toBe(
      '服务响应超时，请确认后端服务正常；若当前操作开启了 AI，可关闭 AI 后重试',
    );
    expect(extractApiErrorMessage({ isAxiosError: true }, 'fallback')).toBe(
      '无法连接到后端服务，请确认本地 API 已启动',
    );
  });

  it('prefers explicit non-axios error messages', () => {
    mockedAxios.isAxiosError = vi.fn(() => false);

    expect(extractApiErrorMessage(new Error('签名模板 不是合法 JSON，请检查花括号、双引号和逗号'), 'fallback')).toBe(
      '签名模板 不是合法 JSON，请检查花括号、双引号和逗号',
    );
  });

  it('uses longer timeout for api automation case generation and only sends prompt template when AI is enabled', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { id: 1, name: 'suite' } } });

    await generateApiAutomationCases(1, {
      use_ai: true,
      name: 'suite',
      prompt_template_key: 'api-template',
    });

    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/projects/1/api-automation/cases/generate',
      { use_ai: true, name: 'suite', prompt_template_key: 'api-template' },
      { timeout: 300000 },
    );
  });

  it('lists users with filters', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          {
            id: 2,
            username: 'reader',
            display_name: '普通用户',
            email: 'reader@example.com',
            role: 'user',
            status: 'active',
            last_login_at: null,
            created_at: '2026-03-08T00:00:00',
            updated_at: '2026-03-08T00:00:00',
          },
        ],
      },
    });

    const result = await listUsers({ keyword: 'reader', role: 'user', status: 'active' });

    expect(result).toHaveLength(1);
    expect(mockedAxios.get).toHaveBeenCalledWith('/users', {
      params: { keyword: 'reader', role: 'user', status: 'active' },
    });
  });

  it('creates user with json body', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        id: 3,
        username: 'operator',
        display_name: '运营',
        email: null,
        role: 'user',
        status: 'active',
        last_login_at: null,
        created_at: '2026-03-08T00:00:00',
        updated_at: '2026-03-08T00:00:00',
      },
    });

    const result = await createUser({
      username: 'operator',
      password: 'Operator123!',
      display_name: '运营',
      role: 'user',
    });

    expect(result.username).toBe('operator');
    expect(mockedAxios.post).toHaveBeenCalledWith('/users', {
      username: 'operator',
      password: 'Operator123!',
      display_name: '运营',
      role: 'user',
    });
  });

  it('updates user status', async () => {
    mockedAxios.put.mockResolvedValueOnce({
      data: {
        id: 2,
        username: 'reader',
        display_name: '普通用户',
        email: null,
        role: 'user',
        status: 'disabled',
        last_login_at: null,
        created_at: '2026-03-08T00:00:00',
        updated_at: '2026-03-08T00:00:00',
      },
    });

    const result = await updateUserStatus(2, 'disabled');

    expect(result.status).toBe('disabled');
    expect(mockedAxios.put).toHaveBeenCalledWith('/users/2/status', { status: 'disabled' });
  });

  it('resets user password', async () => {
    mockedAxios.put.mockResolvedValueOnce({ data: { success: true } });

    await resetUserPassword(2, 'Reset12345!');

    expect(mockedAxios.put).toHaveBeenCalledWith('/users/2/password', { password: 'Reset12345!' });
  });

  it('returns validation error payload when upload validation fails', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        data: { valid: false, error: '格式错误' },
      },
    });

    const result = await validateFile(new File(['x'], 'bad.txt'));

    expect(result.valid).toBe(false);
    expect(result.error).toBe('格式错误');
  });

  it('lists and creates projects', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { data: [{ id: 1, name: '项目A', description: '' }] } });
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { id: 2, name: '项目B', description: 'desc' } } });

    const listResult = await listProjects();
    const createResult = await createProject({ name: '项目B', description: 'desc' });

    expect(listResult).toHaveLength(1);
    expect(createResult.name).toBe('项目B');
  });

  it('uploads analyze request with prompt template when AI is enabled', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true, data: { duration_ms: 123 } } });

    const codeFile = new File(['{}'], 'code.json', { type: 'application/json' });
    const testFile = new File(['id,name'], 'tests.csv', { type: 'text/csv' });
    const result = await analyzeWithProject(1, codeFile, testFile, undefined, true, 'case-template');

    expect(result.success).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/projects/1/analyze',
      expect.any(FormData),
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { prompt_template_key: 'case-template' },
      },
    );
  });

  it('does not send prompt template when AI is disabled', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true, data: { duration_ms: 123 } } });

    const codeFile = new File(['{}'], 'code.json', { type: 'application/json' });
    const testFile = new File(['id,name'], 'tests.csv', { type: 'text/csv' });

    await analyzeWithProject(1, codeFile, testFile, undefined, false, 'case-template');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/projects/1/analyze',
      expect.any(FormData),
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: undefined,
      },
    );
  });

  it('appends requirement prompt template only when AI is enabled', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true, data: { overview: { duration_ms: 123 } } } });

    const requirementFile = new File(['docx'], 'requirement.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await analyzeRequirement(1, requirementFile, true, 'requirement-template');

    const formData = mockedAxios.post.mock.calls[0]?.[1] as FormData;
    expect(formData.get('prompt_template_key')).toBe('requirement-template');
  });

  it('uploads requirement document to generate functional test cases with long timeout', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true, data: { total: 2, cases: [] } } });

    const requirementFile = new File(['docx'], 'requirement.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    await generateFunctionalTestCases('requirement', requirementFile);

    const formData = mockedAxios.post.mock.calls[0]?.[1] as FormData;
    expect(formData.get('requirement_file')).toBe(requirementFile);
    expect(formData.get('prompt_template_key')).toBe('requirement');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/functional-testing/case-generation/generate',
      expect.any(FormData),
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      },
    );
  });

  it('passes api automation document prompt template through query params only when AI is enabled', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { data: { id: 1, file_name: 'openapi.json' } } });

    const documentFile = new File(['{}'], 'openapi.json', { type: 'application/json' });
    await uploadApiAutomationDocument(1, documentFile, true, 'document-template');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/projects/1/api-automation/documents',
      expect.any(FormData),
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        params: { prompt_template_key: 'document-template' },
        timeout: 300000,
      },
    );
  });

  it('exports report as blob', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    mockedAxios.get.mockResolvedValueOnce({ data: blob });

    const result = await exportReportJSON(8);

    expect(result).toBeInstanceOf(Blob);
    expect(mockedAxios.get).toHaveBeenCalledWith('/records/8', { responseType: 'blob' });
  });

  it('lists prompt templates', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 1, agent_key: 'general', name: '通用助手', prompt: 'prompt' }],
      },
    });

    const result = await listPromptTemplates();

    expect(result).toHaveLength(1);
    expect(mockedAxios.get).toHaveBeenCalledWith('/prompt-templates');
  });

  it('returns an empty prompt template list when the endpoint is unavailable', async () => {
    mockedAxios.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 404,
      },
    });

    const result = await listPromptTemplates();

    expect(result).toEqual([]);
    expect(mockedAxios.get).toHaveBeenCalledWith('/prompt-templates');
  });

  it('creates, updates, and deletes prompt templates', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { data: { id: 1, agent_key: 'general', name: '通用助手', prompt: 'prompt' } },
    });
    mockedAxios.put.mockResolvedValueOnce({
      data: { data: { id: 1, agent_key: 'general', name: '通用助手', prompt: 'new prompt' } },
    });
    mockedAxios.delete.mockResolvedValueOnce({ data: { success: true } });

    const created = await createPromptTemplate({ name: '通用助手', prompt: 'prompt' });
    const updated = await updatePromptTemplate(1, { name: '通用助手', prompt: 'new prompt' });
    await deletePromptTemplate(1);

    expect(created.agent_key).toBe('general');
    expect(updated.prompt).toBe('new prompt');
    expect(mockedAxios.post).toHaveBeenCalledWith('/prompt-templates', {
      name: '通用助手',
      prompt: 'prompt',
    });
    expect(mockedAxios.put).toHaveBeenCalledWith('/prompt-templates/1', {
      name: '通用助手',
      prompt: 'new prompt',
    });
    expect(mockedAxios.delete).toHaveBeenCalledWith('/prompt-templates/1');
  });

  it('submits ai agent chat with multipart form data', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        data: {
          answer: '已生成回答',
          provider: 'DeepSeek',
          provider_key: 'deepseek',
          agent_key: 'general',
          agent_name: '通用助手',
          prompt_used: 'prompt',
          attachments: [],
        },
      },
    });

    const attachment = new File(['{}'], 'context.json', { type: 'application/json' });
    const result = await chatWithAIAgent({
      question: '帮我总结一下',
      agent_key: 'general',
      attachments: [attachment],
    });

    expect(result.answer).toBe('已生成回答');
    expect(mockedAxios.post).toHaveBeenCalledWith(
      '/ai-tools/agents/chat',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000,
      }),
    );
  });
});

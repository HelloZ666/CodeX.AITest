import { describe, expect, it, vi, beforeEach } from 'vitest';
import axios from 'axios';
import {
  analyzeWithProject,
  createProject,
  createUser,
  extractApiErrorMessage,
  exportReportJSON,
  getCurrentUser,
  healthCheck,
  listProjects,
  listUsers,
  login,
  resetUserPassword,
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
  });

  it('calls health endpoint', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { status: 'ok', version: '1.0.0' } });

    const result = await healthCheck();

    expect(result.status).toBe('ok');
    expect(mockedAxios.get).toHaveBeenCalledWith('/health');
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
      '服务响应超时，请确认后端服务已正常启动',
    );
    expect(extractApiErrorMessage({ isAxiosError: true }, 'fallback')).toBe(
      '无法连接到后端服务，请确认本地 API 已启动',
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
    const createResult = await createProject('项目B', 'desc');

    expect(listResult).toHaveLength(1);
    expect(createResult.name).toBe('项目B');
  });

  it('uploads analyze request with form data', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { success: true, data: { duration_ms: 123 } } });

    const codeFile = new File(['{}'], 'code.json', { type: 'application/json' });
    const testFile = new File(['id,name'], 'tests.csv', { type: 'text/csv' });
    const result = await analyzeWithProject(1, codeFile, testFile);

    expect(result.success).toBe(true);
    expect(mockedAxios.post).toHaveBeenCalled();
  });

  it('exports report as blob', async () => {
    const blob = new Blob(['{}'], { type: 'application/json' });
    mockedAxios.get.mockResolvedValueOnce({ data: blob });

    const result = await exportReportJSON(8);

    expect(result).toBeInstanceOf(Blob);
    expect(mockedAxios.get).toHaveBeenCalledWith('/records/8', { responseType: 'blob' });
  });
});

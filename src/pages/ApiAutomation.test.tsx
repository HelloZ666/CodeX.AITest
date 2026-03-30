import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import ApiAutomationPage, { parseJsonInput } from './ApiAutomation';

vi.mock('../utils/api', () => ({
  createApiAutomationRun: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  generateApiAutomationCases: vi.fn(),
  getApiAutomationEnvironment: vi.fn(),
  getApiAutomationRun: vi.fn(),
  getApiAutomationRunReport: vi.fn(),
  getLatestApiAutomationDocument: vi.fn(),
  getLatestApiAutomationSuite: vi.fn(),
  listApiAutomationRuns: vi.fn(),
  listPromptTemplates: vi.fn(),
  listProjects: vi.fn(),
  rerunApiAutomationRun: vi.fn(),
  saveApiAutomationEnvironment: vi.fn(),
  saveApiAutomationSuite: vi.fn(),
  uploadApiAutomationDocument: vi.fn(),
}));

import {
  createApiAutomationRun,
  generateApiAutomationCases,
  getApiAutomationEnvironment,
  getApiAutomationRun,
  getLatestApiAutomationDocument,
  getLatestApiAutomationSuite,
  listApiAutomationRuns,
  listPromptTemplates,
  listProjects,
  saveApiAutomationSuite,
  uploadApiAutomationDocument,
} from '../utils/api';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

const scrollIntoViewMock = vi.fn();

Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
  writable: true,
  value: scrollIntoViewMock,
});

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ApiAutomationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function getFlow() {
  return screen.getByLabelText('接口自动化流程');
}

function getOperationArea() {
  return screen.getByLabelText('当前步骤操作区');
}

function getFlowStep(name: string) {
  return within(getFlow()).getByRole('button', { name });
}

async function selectProject(projectName?: string) {
  const operationArea = getOperationArea();
  const comboBox = await within(operationArea).findByRole('combobox');
  const trigger = comboBox.closest('.ant-select')?.querySelector('.ant-select-selector') ?? comboBox;
  fireEvent.mouseDown(trigger);

  if (projectName) {
    try {
      fireEvent.click(await screen.findByText(projectName, {}, { timeout: 1000 }));
      return;
    } catch {
      // Fall back to the first option when the dropdown text rendering differs.
    }
  }

  fireEvent.click((await screen.findAllByRole('option'))[0]);
}

const environment = {
  project_id: 1,
  base_url: 'http://example.test',
  timeout_ms: 15000,
  auth_mode: 'bearer' as const,
  common_headers: { 'Content-Type': 'application/json' },
  auth_config: { token: 'fixed-token' },
  signature_template: { enabled: true },
  login_binding: {},
  created_at: null,
  updated_at: null,
};

const latestDocument = {
  id: 11,
  project_id: 1,
  file_name: 'openapi.json',
  file_type: 'json',
  source_type: 'openapi',
  raw_text_excerpt: '{"openapi":"3.0.1"}',
  raw_text: '{"openapi":"3.0.1","paths":{"/sales/visit/query":{"post":{}}}}',
  endpoint_count: 1,
  missing_fields: [],
  endpoints: [
    {
      endpoint_id: 'post-sales-visit-query',
      group_name: '面访',
      name: '业务员面访数据查询',
      method: 'POST',
      path: '/sales/visit/query',
      summary: '业务员面访数据查询',
      headers: [],
      path_params: [],
      query_params: [],
      body_schema: { type: 'object' },
      response_schema: { type: 'object' },
      error_codes: [],
      dependency_hints: ['需要鉴权'],
      missing_fields: [],
      source_type: 'openapi_json',
    },
  ],
  created_at: '2026-03-23 10:00:00',
};

const suite = {
  id: 88,
  project_id: 1,
  document_record_id: 11,
  name: '首版接口套件',
  endpoints: latestDocument.endpoints,
  cases: [
    {
      case_id: 'case-001',
      endpoint_id: 'post-sales-visit-query',
      enabled: true,
      test_scene: '正常查询',
      title: '正常查询返回 200',
      precondition: '已配置 token',
      request_method: 'POST',
      request_url: '/sales/visit/query',
      request_headers: { Authorization: 'Bearer {{runtime.token}}' },
      request_params: {},
      request_body: { employeeIds: 'ZJ000163' },
      expected_status_code: 200,
      expected_response_keywords: ['data'],
      expected_db_check: '仅备注',
      test_level: '功能',
      assertions: [{ type: 'status_code', operator: 'equals', path: '', expected: 200 }],
      extract_rules: [],
      depends_on: [],
      source: 'rule',
      missing_fields: [],
      request_options: {},
      sort_index: 1,
    },
  ],
  ai_analysis: null,
  token_usage: 120,
  cost: 0.02,
  duration_ms: 240,
  created_at: '2026-03-23 10:00:00',
  updated_at: '2026-03-23 10:00:00',
};

const runDetail = {
  id: 501,
  project_id: 1,
  suite_id: 88,
  status: 'completed',
  total_cases: 1,
  passed_cases: 1,
  failed_cases: 0,
  blocked_cases: 0,
  duration_ms: 38,
  created_at: '2026-03-23 10:30:00',
  environment_snapshot: { base_url: 'http://example.test' },
  report_snapshot: {
    overview: {
      status: 'completed',
      total_cases: 1,
      passed_cases: 1,
      failed_cases: 0,
      blocked_cases: 0,
      pass_rate: 100,
      duration_ms: 38,
    },
    environment_snapshot: { base_url: 'http://example.test' },
    suite_snapshot: { suite_id: 88 },
    endpoint_distribution: [{ endpoint_id: 'post-sales-visit-query', count: 1 }],
    items: [
      {
        case_id: 'case-001',
        case_title: '正常查询返回 200',
        endpoint_id: 'post-sales-visit-query',
        status: 'passed',
        duration_ms: 38,
        request_snapshot: {},
        response_snapshot: {},
        assertion_results: [],
        extracted_variables: { token: 'abc123' },
        error_message: null,
      },
    ],
    runtime_variables: { token: 'abc123' },
    failure_reasons: [],
  },
  items: [
    {
      case_id: 'case-001',
      case_title: '正常查询返回 200',
      endpoint_id: 'post-sales-visit-query',
      status: 'passed',
      duration_ms: 38,
      request_snapshot: {},
      response_snapshot: {},
      assertion_results: [],
      extracted_variables: { token: 'abc123' },
      error_message: null,
    },
  ],
};

const previousRunDetail = {
  ...runDetail,
  id: 502,
  status: 'failed',
  passed_cases: 0,
  failed_cases: 1,
  duration_ms: 56,
  created_at: '2026-03-23 09:45:00',
  report_snapshot: {
    ...runDetail.report_snapshot,
    overview: {
      ...runDetail.report_snapshot.overview,
      status: 'failed',
      passed_cases: 0,
      failed_cases: 1,
      pass_rate: 0,
      duration_ms: 56,
    },
    runtime_variables: { token: 'expired-token' },
    failure_reasons: [
      { case_id: 'case-001', title: '正常查询返回 200', reason: '响应状态码不是 200' },
    ],
  },
  items: [
    {
      ...runDetail.items[0],
      status: 'failed',
      duration_ms: 56,
      error_message: '响应状态码不是 200',
    },
  ],
};

describe('ApiAutomationPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scrollIntoViewMock.mockClear();

    (listProjects as Mock).mockResolvedValue([
      {
        id: 1,
        name: '智能测试平台项目',
        description: '',
        mapping_data: null,
        created_at: '2026-03-23 10:00:00',
        updated_at: '2026-03-23 10:00:00',
      },
      {
        id: 2,
        name: '空白项目',
        description: '',
        mapping_data: null,
        created_at: '2026-03-23 10:00:00',
        updated_at: '2026-03-23 10:00:00',
      },
    ]);

    (getApiAutomationEnvironment as Mock).mockImplementation(async (projectId: number) => ({
      ...environment,
      project_id: projectId,
    }));
    (listPromptTemplates as Mock).mockResolvedValue([]);
    (getLatestApiAutomationDocument as Mock).mockImplementation(async (projectId: number) => (
      projectId === 1 ? latestDocument : null
    ));
    (getLatestApiAutomationSuite as Mock).mockImplementation(async (projectId: number) => (
      projectId === 1 ? suite : null
    ));
    (listApiAutomationRuns as Mock).mockImplementation(async (projectId: number) => (
      projectId === 1 ? [runDetail, previousRunDetail] : []
    ));
    (getApiAutomationRun as Mock).mockImplementation(async (_projectId: number, runId: number) => {
      if (runId === previousRunDetail.id) {
        return previousRunDetail;
      }
      return runDetail;
    });
    (saveApiAutomationSuite as Mock).mockResolvedValue(suite);
    (uploadApiAutomationDocument as Mock).mockResolvedValue(latestDocument);
    (createApiAutomationRun as Mock).mockResolvedValue(runDetail);
    (generateApiAutomationCases as Mock).mockResolvedValue(suite);
  });

  it('renders the horizontal step rail and switches the operation panel by current step', async () => {
    renderWithProviders();

    expect(await screen.findByText('接口自动化工作台')).toBeInTheDocument();

    const flow = getFlow();
    const operationArea = getOperationArea();

    expect(getFlowStep('第1步 选择项目')).toHaveAttribute('aria-current', 'step');
    expect(getFlowStep('第2步 配置环境')).toBeDisabled();
    expect(within(operationArea).getByText('项目上下文')).toBeInTheDocument();

    await selectProject('智能测试平台项目');

    await waitFor(() => {
      expect(getApiAutomationEnvironment).toHaveBeenCalledWith(1);
      expect(getLatestApiAutomationDocument).toHaveBeenCalledWith(1);
      expect(getLatestApiAutomationSuite).toHaveBeenCalledWith(1);
      expect(listApiAutomationRuns).toHaveBeenCalledWith(1);
    });

    expect(within(flow).getByRole('button', { name: '第2步 配置环境' })).toHaveAttribute('aria-current', 'step');
    expect(within(operationArea).getByRole('button', { name: '保存执行环境' })).toBeInTheDocument();
    await waitFor(() => {
      expect(getFlowStep('第3步 上传文档')).not.toBeDisabled();
      expect(getFlowStep('第4步 生成案例')).not.toBeDisabled();
      expect(getFlowStep('第5步 执行报告')).not.toBeDisabled();
    });

    fireEvent.click(getFlowStep('第3步 上传文档'));
    expect(await within(operationArea).findByText('当前项目已存在历史解析快照，本次文档解析成功前不展示历史接口信息。')).toBeInTheDocument();
    expect(within(operationArea).queryByText('/sales/visit/query')).not.toBeInTheDocument();
    expect(within(operationArea).queryByDisplayValue(latestDocument.raw_text_excerpt)).not.toBeInTheDocument();

    fireEvent.click(getFlowStep('第4步 生成案例'));
    expect(await within(operationArea).findByDisplayValue('首版接口套件')).toBeInTheDocument();

    fireEvent.click(getFlowStep('第5步 执行报告'));
    expect(within(flow).getByRole('button', { name: '第5步 执行报告' })).toHaveAttribute('aria-current', 'step');
    expect(await within(operationArea).findByRole('button', { name: '执行当前用例集' })).toBeInTheDocument();
    expect(await within(operationArea).findByText('Suite ID')).toBeInTheDocument();
  }, 25000);

  it('switches to the selected historical run report and scrolls back to the report detail area', async () => {
    renderWithProviders();

    await selectProject('智能测试平台项目');
    await waitFor(() => {
      expect(getFlowStep('第5步 执行报告')).not.toBeDisabled();
    });

    fireEvent.click(getFlowStep('第5步 执行报告'));

    const previousRunCell = await within(getOperationArea()).findByText(previousRunDetail.created_at);
    const previousRunRow = previousRunCell.closest('tr');
    expect(previousRunRow).not.toBeNull();

    fireEvent.click(within(previousRunRow as HTMLElement).getByRole('button', { name: '查看报告' }));

    await waitFor(() => {
      expect(getApiAutomationRun).toHaveBeenCalledWith(1, previousRunDetail.id);
    });

    expect(await within(getOperationArea()).findByText('响应状态码不是 200')).toBeInTheDocument();
    expect(scrollIntoViewMock).toHaveBeenCalled();
  }, 15000);

  it('renders compact advanced environment panels and expands them on demand', async () => {
    renderWithProviders();

    await selectProject('智能测试平台项目');

    await waitFor(() => {
      expect(getFlowStep('第2步 配置环境')).toHaveAttribute('aria-current', 'step');
    });

    const operationArea = getOperationArea();

    expect(await within(operationArea).findByText('高级 JSON 配置')).toBeInTheDocument();
    expect(within(operationArea).queryByDisplayValue(/fixed-token/)).not.toBeInTheDocument();

    fireEvent.click(within(operationArea).getByRole('tab', { name: /鉴权配置/ }));

    expect(await within(operationArea).findByDisplayValue(/fixed-token/)).toBeInTheDocument();
  }, 15000);

  it('falls back to defaults when collapsed environment json fields are missing', () => {
    expect(parseJsonInput(undefined, {})).toEqual({});
    expect(parseJsonInput(null, [])).toEqual([]);
    expect(parseJsonInput('   ', { enabled: false })).toEqual({ enabled: false });
  });

  it('returns a labeled message when environment json is invalid', () => {
    expect(() => parseJsonInput('{hah1}', {}, '签名模板')).toThrow(
      '签名模板 不是合法 JSON，请检查花括号、双引号和逗号',
    );
  });

  it('auto-saves the current suite before execution in the step-based layout', async () => {
    renderWithProviders();

    await selectProject('智能测试平台项目');

    await waitFor(() => {
      expect(getLatestApiAutomationSuite).toHaveBeenCalledWith(1);
    });

    await waitFor(() => {
      expect(getFlowStep('第5步 执行报告')).not.toBeDisabled();
    });
    fireEvent.click(getFlowStep('第5步 执行报告'));
    fireEvent.click(await within(getOperationArea()).findByRole('button', { name: '执行当前用例集' }));

    await waitFor(() => {
      expect(saveApiAutomationSuite).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(createApiAutomationRun).toHaveBeenCalledWith(1, { suite_id: 88 });
    });
  }, 15000);

  it('clears the previous draft when switching to another project and re-locks later steps', async () => {
    renderWithProviders();

    await selectProject('智能测试平台项目');
    await waitFor(() => {
      expect(getLatestApiAutomationSuite).toHaveBeenCalledWith(1);
    });

    fireEvent.click(getFlowStep('第4步 生成案例'));
    expect(await within(getOperationArea()).findByDisplayValue('首版接口套件')).toBeInTheDocument();

    fireEvent.click(getFlowStep('第1步 选择项目'));
    await selectProject('空白项目');

    await waitFor(() => {
      expect(getLatestApiAutomationSuite).toHaveBeenCalledWith(2);
    });

    expect(getFlowStep('第2步 配置环境')).toHaveAttribute('aria-current', 'step');
    expect(getFlowStep('第4步 生成案例')).toBeDisabled();
    expect(getFlowStep('第5步 执行报告')).toBeDisabled();
    expect(within(getOperationArea()).queryByDisplayValue('首版接口套件')).not.toBeInTheDocument();

    fireEvent.click(getFlowStep('第3步 上传文档'));
    expect(await within(getOperationArea()).findByText('当前项目尚未上传接口文档。')).toBeInTheDocument();
  }, 15000);

  it('hides historical endpoints until the current document is parsed successfully', async () => {
    renderWithProviders();

    await selectProject('智能测试平台项目');
    fireEvent.click(getFlowStep('第3步 上传文档'));

    const operationArea = getOperationArea();
    expect(await within(operationArea).findByText('当前项目已存在历史解析快照，本次文档解析成功前不展示历史接口信息。')).toBeInTheDocument();
    expect(within(operationArea).queryByText('/sales/visit/query')).not.toBeInTheDocument();
    expect(within(getOperationArea()).queryByDisplayValue(latestDocument.raw_text_excerpt)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(latestDocument.raw_text)).not.toBeInTheDocument();

    const fileInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const file = new File(['{"openapi":"3.0.1"}'], 'current-openapi.json', { type: 'application/json' });
    fireEvent.change(fileInput as HTMLInputElement, {
      target: { files: [file] },
    });

    fireEvent.click(await within(operationArea).findByRole('button', { name: '上传并解析' }));

    await waitFor(() => {
      expect(uploadApiAutomationDocument).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'current-openapi.json' }),
        true,
        undefined,
      );
    });
    expect(await within(operationArea).findByText('/sales/visit/query')).toBeInTheDocument();
  }, 15000);

  it('still loads generated rule cases when AI completion times out', async () => {
    (generateApiAutomationCases as Mock).mockResolvedValue({
      ...suite,
      ai_analysis: { error: 'AI 分析超时，请减少分析范围后重试' },
    });

    renderWithProviders();

    await selectProject('智能测试平台项目');
    await waitFor(() => {
      expect(getFlowStep('第4步 生成案例')).not.toBeDisabled();
    });
    fireEvent.click(getFlowStep('第4步 生成案例'));
    fireEvent.click(await within(getOperationArea()).findByRole('button', { name: '生成接口测试案例' }));

    await waitFor(() => {
      expect(generateApiAutomationCases).toHaveBeenCalledWith(1, {
        use_ai: true,
        name: 'openapi.json 用例集',
        prompt_template_key: undefined,
      });
    });

    expect(await within(getOperationArea()).findByDisplayValue('正常查询返回 200')).toBeInTheDocument();
  }, 15000);
});

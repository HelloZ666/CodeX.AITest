import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UploadPage from './Upload';

vi.mock('../utils/api', () => ({
  analyzeWithProject: vi.fn(),
  createProjectMappingEntry: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  listPromptTemplates: vi.fn(),
  listProjects: vi.fn(),
}));

vi.mock('../components/ScoreCard/ScoreCard', () => ({
  default: () => <div data-testid="score-card">ScoreCard</div>,
}));

vi.mock('../components/AISuggestions/AISuggestions', () => ({
  default: () => <div>AI 智能建议</div>,
}));

import {
  analyzeWithProject,
  createProjectMappingEntry,
  listPromptTemplates,
  listProjects,
} from '../utils/api';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

if (!Object.prototype.hasOwnProperty.call(HTMLElement.prototype, 'scrollIntoView')) {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
} else {
  HTMLElement.prototype.scrollIntoView = vi.fn();
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectProject(projectName: string = '渠道投保项目') {
  const projectSection = screen.getByText('项目选择').closest('section');
  expect(projectSection).not.toBeNull();
  const comboBox = await within(projectSection as HTMLElement).findByRole('combobox');
  const trigger = comboBox.closest('.ant-select')?.querySelector('.ant-select-selector') ?? comboBox;
  fireEvent.mouseDown(trigger);

  try {
    const optionText = await screen.findByText(projectName, {}, { timeout: 1000 });
    fireEvent.click(optionText.closest('.ant-select-item-option') ?? optionText);
  } catch {
    fireEvent.click((await screen.findAllByRole('option'))[0]);
  }

  await waitFor(() => {
    expect(within(projectSection as HTMLElement).getByText('已绑定映射关系')).toBeInTheDocument();
  });
}

describe('UploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (listProjects as Mock).mockResolvedValue([
      {
        id: 1,
        name: '渠道投保项目',
        description: '',
        mapping_data: [
          {
            package_name: 'com.example.user',
            class_name: 'UserService',
            method_name: 'handleStartAnalysis',
            description: '触发智能分析按钮',
            test_point: '',
          },
        ],
        created_at: '2026-03-08 10:00:00',
        updated_at: '2026-03-08 10:00:00',
      },
    ]);
    (listPromptTemplates as Mock).mockResolvedValue([]);

    (analyzeWithProject as Mock).mockResolvedValue({
      success: true,
      data: {
        record_id: 18,
        diff_analysis: {
          total_files: 2,
          total_added: 12,
          total_removed: 3,
          files: [
            { package: 'src/pages/Upload.tsx', added: 10, removed: 2 },
            { package: 'src/index.css', added: 2, removed: 1 },
          ],
        },
        coverage: {
          total_changed_methods: 2,
          covered: ['com.example.user.UserService.handleStartAnalysis'],
          uncovered: ['com.example.order.OrderService.handleFileChange'],
          coverage_rate: 0.5,
          details: [
            {
              method: 'com.example.user.UserService.handleStartAnalysis',
              description: '触发智能分析按钮',
              is_covered: true,
              matched_tests: ['TC-001'],
            },
            {
              method: 'com.example.order.OrderService.handleFileChange',
              description: '无映射描述',
              is_covered: false,
              matched_tests: [],
            },
          ],
        },
        score: {
          total_score: 88,
          grade: 'A',
          summary: '整体质量良好',
          dimensions: [
            {
              dimension: '覆盖率',
              score: 85,
              weight: 0.5,
              weighted_score: 42.5,
              details: '主流程用例覆盖较完整',
            },
          ],
        },
        ai_analysis: {
          risk_assessment: 'medium',
          coverage_gaps: '建议补齐边界与异常流测试。',
          suggested_test_cases: [
            {
              test_id: 'TC-002',
              test_function: '上传替换',
              test_steps: '重复上传两个文件并重新解析',
              expected_result: '报告正确刷新',
            },
          ],
          improvement_suggestions: ['为上传失败路径补充回归用例'],
        },
        ai_cost: {
          total_tokens: 150,
        },
        duration_ms: 420,
      },
    });
  });

  it('uploads two files and renders the report workflow', async () => {
    const { container } = renderWithProviders(<UploadPage />);

    expect(await screen.findByText('案例分析工作台')).toBeInTheDocument();
    expect(screen.getByText('支持真实 Excel 模板（首行说明、第二行表头）和旧简化模板')).toBeInTheDocument();

    await selectProject();

    const uploadInputs = (container.querySelectorAll('input[type="file"]').length
      ? container.querySelectorAll('input[type="file"]')
      : document.body.querySelectorAll('input[type="file"]'));

    expect(uploadInputs.length).toBe(2);

    const codeFile = new File(['{"current":[]}'], 'changes.json', { type: 'application/json' });
    const testFile = new File(['id,name'], 'cases.csv', { type: 'text/csv' });

    await act(async () => {
      fireEvent.change(uploadInputs[0], { target: { files: [codeFile] } });
      fireEvent.change(uploadInputs[1], { target: { files: [testFile] } });
    });

    const actionButton = screen.getByRole('button', { name: /开始智能解析/ });

    await waitFor(() => {
      expect(actionButton).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(actionButton);
    });

    await waitFor(() => {
      expect(analyzeWithProject).toHaveBeenCalledWith(1, codeFile, testFile, undefined, true, undefined);
    });

    expect(await screen.findByText('案例分析报告详情')).toBeInTheDocument();
    expect(screen.getByText('记录 ID：18')).toBeInTheDocument();
    expect(screen.getAllByText('整体质量良好').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('AI 智能建议')).toBeInTheDocument();
  }, 15000);

  it('adds mapping from uncovered coverage row in report', async () => {
    (createProjectMappingEntry as Mock).mockResolvedValue({
      id: 1,
      name: '渠道投保项目',
      description: '',
      mapping_data: [
        {
          package_name: 'com.example.user',
          class_name: 'UserService',
          method_name: 'handleStartAnalysis',
          description: '触发智能分析按钮',
          test_point: '',
        },
        {
          package_name: 'com.example.order',
          class_name: 'OrderService',
          method_name: 'handleFileChange',
          description: '处理文件上传反馈',
          test_point: '',
        },
      ],
      created_at: '2026-03-08 10:00:00',
      updated_at: '2026-03-08 10:00:00',
    });

    const { container } = renderWithProviders(<UploadPage />);

    await selectProject();

    const uploadInputs = (container.querySelectorAll('input[type="file"]').length
      ? container.querySelectorAll('input[type="file"]')
      : document.body.querySelectorAll('input[type="file"]'));

    await act(async () => {
      fireEvent.change(uploadInputs[0], {
        target: { files: [new File(['{}'], 'changes.json', { type: 'application/json' })] },
      });
      fireEvent.change(uploadInputs[1], {
        target: { files: [new File(['id,name'], 'cases.csv', { type: 'text/csv' })] },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /开始智能解析/ }));
    });

    expect(await screen.findByText('案例分析报告详情')).toBeInTheDocument();

    const addButton = await screen.findByRole('button', { name: /新增/ });
    await act(async () => {
      fireEvent.click(addButton);
    });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('com.example.order')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('OrderService')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('handleFileChange')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText('例如：创建订单并校验库存'), {
      target: { value: '处理文件上传反馈' },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));
    });

    await waitFor(() => {
      expect(createProjectMappingEntry).toHaveBeenCalledWith(1, {
        package_name: 'com.example.order',
        class_name: 'OrderService',
        method_name: 'handleFileChange',
        description: '处理文件上传反馈',
        test_point: '',
      });
    });

    expect(await screen.findByRole('button', { name: '已保存' })).toBeDisabled();
  }, 30000);
});

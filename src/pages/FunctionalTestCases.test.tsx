import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FunctionalTestCasesPage from './FunctionalTestCases';

vi.mock('../utils/api', () => ({
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  getFunctionalTestCaseRecord: vi.fn(),
  listFunctionalTestCaseRecords: vi.fn(),
}));

vi.mock('../utils/exportTestCases', () => ({
  exportFunctionalTestCasesCsv: vi.fn(),
}));

import {
  getFunctionalTestCaseRecord,
  listFunctionalTestCaseRecords,
} from '../utils/api';
import { exportFunctionalTestCasesCsv } from '../utils/exportTestCases';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <FunctionalTestCasesPage embedded />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('FunctionalTestCasesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (listFunctionalTestCaseRecords as Mock).mockResolvedValue([
      {
        id: 8,
        project_id: 11,
        project_name: '核心投保项目',
        name: '资格校验回归包',
        iteration_version: null,
        requirement_file_name: '投保资格校验.docx',
        operator_name: '张三',
        case_count: 2,
        created_at: '2026-04-06T10:20:00Z',
      },
    ]);

    (getFunctionalTestCaseRecord as Mock).mockResolvedValue({
      id: 8,
      project_id: 11,
      project_name: '核心投保项目',
      name: '资格校验回归包',
      iteration_version: null,
      requirement_file_name: '投保资格校验.docx',
      operator_name: '张三',
      case_count: 2,
      created_at: '2026-04-06T10:20:00Z',
      prompt_template_key: 'requirement',
      summary: '覆盖资格校验失败和界面提示两个重点场景。',
      generation_mode: 'ai',
      provider: 'DeepSeek',
      ai_cost: { total_tokens: 120 },
      error: null,
      cases: [
        {
          case_id: 'TC-001',
          description: '资格校验失败时禁止提交',
          steps: '1. 输入不满足条件的数据\n2. 点击提交',
          expected_result: '系统阻止提交并提示失败原因',
          source: 'ai',
        },
        {
          case_id: 'TC-002',
          description: '资格校验失败时显示引导文案',
          steps: '1. 触发资格校验失败\n2. 检查页面提示',
          expected_result: '页面显示明确提示文案和引导信息',
          source: 'ai',
        },
      ],
    });
  });

  it('renders saved records and previews detail fields', async () => {
    renderWithProviders();

    expect(await screen.findByText('测试案例记录')).toBeInTheDocument();
    expect(await screen.findByText('资格校验回归包')).toBeInTheDocument();
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent?.trim()).slice(0, 7),
    ).toEqual([
      '项目名称',
      '测试案例名称',
      '迭代版本',
      '需求文档名称',
      '案例条数',
      '操作人',
      '生成时间',
    ]);
    expect(await screen.findByText('投保资格校验.docx')).toBeInTheDocument();
    expect(screen.getByText('核心投保项目')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^预览$/ }));

    expect(await screen.findByText('测试案例预览')).toBeInTheDocument();
    expect(await screen.findByText('覆盖资格校验失败和界面提示两个重点场景。')).toBeInTheDocument();
    expect(screen.getByText('测试案例名称：')).toBeInTheDocument();
    expect(screen.getByText('迭代版本：')).toBeInTheDocument();
    expect(screen.getByText('需求文档：')).toBeInTheDocument();
    expect(screen.getByText('资格校验失败时禁止提交')).toBeInTheDocument();
    expect(screen.getByText('资格校验失败时显示引导文案')).toBeInTheDocument();
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(2);

    await waitFor(() => {
      expect(getFunctionalTestCaseRecord).toHaveBeenCalledWith(8);
    });
  });

  it('exports saved cases from the list', async () => {
    renderWithProviders();

    await screen.findByText('投保资格校验.docx');
    fireEvent.click(screen.getByRole('button', { name: /^导出$/ }));

    await waitFor(() => {
      expect(getFunctionalTestCaseRecord).toHaveBeenCalledWith(8);
      expect(exportFunctionalTestCasesCsv).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ case_id: 'TC-001' }),
        ]),
        '资格校验回归包',
      );
    });
  });
});

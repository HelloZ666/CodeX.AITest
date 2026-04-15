import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigTestCasesPage from './ConfigTestCases';

vi.mock('../utils/api', () => ({
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  getConfigTestCaseAsset: vi.fn(),
  listConfigTestCaseAssets: vi.fn(),
}));

vi.mock('../utils/exportTestCases', () => ({
  exportFunctionalTestCasesCsv: vi.fn(),
}));

import {
  getConfigTestCaseAsset,
  listConfigTestCaseAssets,
} from '../utils/api';
import { exportFunctionalTestCasesCsv } from '../utils/exportTestCases';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConfigTestCasesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ConfigTestCasesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (listConfigTestCaseAssets as Mock).mockResolvedValue([
      {
        id: 7,
        name: '保全变更-测试用例',
        asset_type: 'generated',
        file_type: 'generated',
        file_size: 0,
        case_count: 2,
        requirement_file_name: '保全变更.docx',
        generation_mode: 'ai',
        provider: 'DeepSeek',
        project_id: null,
        project_name: null,
        source_page: '案例生成',
        operator_name: '李四',
        operator_username: 'lisi',
        operated_at: '2026-04-06T10:20:00Z',
        created_at: '2026-04-06T10:20:00Z',
      },
    ]);

    (getConfigTestCaseAsset as Mock).mockResolvedValue({
      id: 7,
      name: '保全变更-测试用例',
      asset_type: 'generated',
      file_type: 'generated',
      file_size: 0,
      case_count: 2,
      requirement_file_name: '保全变更.docx',
      generation_mode: 'ai',
      provider: 'DeepSeek',
      project_id: null,
      project_name: null,
      source_page: '案例生成',
      operator_name: '李四',
      operator_username: 'lisi',
      operated_at: '2026-04-06T10:20:00Z',
      created_at: '2026-04-06T10:20:00Z',
      prompt_template_key: 'requirement',
      cases: [
        {
          case_id: 'TC-001',
          description: '保全变更成功提交',
          steps: '1. 填写变更信息\n2. 点击提交',
          expected_result: '系统提交成功并提示受理。',
          source: 'ai',
        },
        {
          case_id: 'TC-002',
          description: '缺少必填项时阻止提交',
          steps: '1. 留空必填项\n2. 点击提交',
          expected_result: '系统阻止提交并提示必填项。',
          source: 'ai',
        },
      ],
    });
  });

  it('renders stored test cases and supports preview/export', async () => {
    renderWithProviders();

    expect(await screen.findByText('测试用例')).toBeInTheDocument();
    expect(await screen.findByText('保全变更-测试用例')).toBeInTheDocument();
    expect(screen.getByText('自动生成')).toBeInTheDocument();
    expect(screen.getByText('李四')).toBeInTheDocument();
    expect(screen.getByText('lisi')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^预览$/ }));

    expect(await screen.findByText('测试用例预览')).toBeInTheDocument();
    expect(await screen.findByText('保全变更成功提交')).toBeInTheDocument();
    expect(screen.getByText('缺少必填项时阻止提交')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^导出$/ }));

    await waitFor(() => {
      expect(getConfigTestCaseAsset).toHaveBeenCalledWith(7);
      expect(exportFunctionalTestCasesCsv).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ case_id: 'TC-001' }),
        ]),
        '保全变更-测试用例',
      );
    });
  });
});

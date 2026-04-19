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
        name: 'Policy change suite',
        iteration_version: '2026Q2-S1',
        asset_type: 'generated',
        file_type: 'generated',
        file_size: 0,
        case_count: 2,
        requirement_file_name: 'requirement.docx',
        generation_mode: 'ai',
        provider: 'DeepSeek',
        project_id: null,
        project_name: null,
        source_page: 'case-generation',
        operator_name: 'Lisa',
        operator_username: 'lisi',
        operated_at: '2026-04-06T10:20:00Z',
        created_at: '2026-04-06T10:20:00Z',
      },
    ]);

    (getConfigTestCaseAsset as Mock).mockResolvedValue({
      id: 7,
      name: 'Policy change suite',
      iteration_version: null,
      asset_type: 'generated',
      file_type: 'generated',
      file_size: 0,
      case_count: 2,
      requirement_file_name: 'requirement.docx',
      generation_mode: 'ai',
      provider: 'DeepSeek',
      project_id: null,
      project_name: null,
      source_page: 'case-generation',
      operator_name: 'Lisa',
      operator_username: 'lisi',
      operated_at: '2026-04-06T10:20:00Z',
      created_at: '2026-04-06T10:20:00Z',
      prompt_template_key: 'requirement',
      cases: [
        {
          case_id: 'TC-001',
          description: 'submit succeeds after valid input',
          steps: '1. fill valid fields\n2. submit',
          expected_result: 'system accepts the request',
          source: 'ai',
        },
        {
          case_id: 'TC-002',
          description: 'submit is blocked when required field is missing',
          steps: '1. leave required field empty\n2. submit',
          expected_result: 'system blocks the request',
          source: 'ai',
        },
      ],
    });
  });

  it('renders stored test cases and supports preview/export', async () => {
    renderWithProviders();

    expect(await screen.findByText('Policy change suite')).toBeInTheDocument();
    expect(
      screen.getAllByRole('columnheader').map((header) => header.textContent?.trim()).slice(0, 10),
    ).toEqual([
      '项目',
      '测试案例名称',
      '迭代版本',
      '类型',
      '关联需求文档',
      '来源页面',
      '操作人',
      '操作时间',
      '操作账号',
      '案例条数',
    ]);
    expect(screen.getByText('2026Q2-S1')).toBeInTheDocument();
    expect(screen.getByText('Lisa')).toBeInTheDocument();
    expect(screen.getByText('lisi')).toBeInTheDocument();

    const actionButtons = document.querySelectorAll<HTMLButtonElement>('.glass-table-action-button');
    expect(actionButtons).toHaveLength(2);
    fireEvent.click(actionButtons[0]);

    expect(await screen.findByText('submit succeeds after valid input')).toBeInTheDocument();
    expect(screen.getByText('submit is blocked when required field is missing')).toBeInTheDocument();
    expect(screen.getByText('--')).toBeInTheDocument();

    fireEvent.click(actionButtons[1]);

    await waitFor(() => {
      expect(getConfigTestCaseAsset).toHaveBeenCalledWith(7);
      expect(exportFunctionalTestCasesCsv).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ case_id: 'TC-001' }),
        ]),
        'Policy change suite',
      );
    });
  });
});

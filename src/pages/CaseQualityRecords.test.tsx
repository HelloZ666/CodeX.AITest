import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import CaseQualityRecordsPage from './CaseQualityRecords';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  listCaseQualityRecords: vi.fn(),
}));

import { listCaseQualityRecords, listProjects } from '../utils/api';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CaseQualityRecordsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CaseQualityRecordsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state', async () => {
    (listProjects as Mock).mockResolvedValue([]);
    (listCaseQualityRecords as Mock).mockResolvedValue([]);

    renderWithProviders();

    expect(await screen.findByText('案例质检分析记录')).toBeInTheDocument();
    expect(await screen.findByText('暂无案例质检记录')).toBeInTheDocument();
  });

  it('renders records and opens detail page', async () => {
    (listProjects as Mock).mockResolvedValue([
      { id: 1, name: '项目A', description: '', mapping_data: null, created_at: '', updated_at: '' },
    ]);
    (listCaseQualityRecords as Mock).mockResolvedValue([
      {
        id: 11,
        project_id: 1,
        project_name: '项目A',
        requirement_analysis_record_id: 101,
        analysis_record_id: 201,
        requirement_file_name: 'requirement.docx',
        code_changes_file_name: 'changes.json',
        test_cases_file_name: 'cases.csv',
        requirement_score: 85,
        case_score: 90,
        total_token_usage: 1200,
        total_cost: 0.01,
        total_duration_ms: 920,
        created_at: '2026-03-22T10:00:00Z',
      },
    ]);

    renderWithProviders();

    expect(await screen.findByText('requirement.docx')).toBeInTheDocument();
    expect(document.querySelector('.glass-records-table')).not.toBeNull();
    expect(screen.getByRole('button', { name: /详情/ })).toHaveClass('glass-table-action-button');
    fireEvent.click(screen.getByRole('button', { name: /详情/ }));

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith('/functional-testing/records/11');
    });
  });

  it('refetches records when project filter changes', async () => {
    (listProjects as Mock).mockResolvedValue([
      { id: 1, name: '项目A', description: '', mapping_data: null, created_at: '', updated_at: '' },
    ]);
    (listCaseQualityRecords as Mock).mockResolvedValue([]);

    renderWithProviders();

    const combobox = await screen.findByRole('combobox');
    fireEvent.mouseDown(combobox);
    fireEvent.click(await screen.findByText('项目A'));

    await waitFor(() => {
      expect(listCaseQualityRecords).toHaveBeenLastCalledWith({ project_id: 1, limit: 100 });
    });
  });
});

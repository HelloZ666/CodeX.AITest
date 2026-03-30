import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import HistoryPage from './History';

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

vi.mock('../components/AISuggestions/AISuggestions', () => ({
  default: () => <div data-testid="ai-suggestions">AISuggestions</div>,
}));

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  listRecords: vi.fn(),
  getRecord: vi.fn(),
}));

import { getRecord, listProjects, listRecords } from '../utils/api';
import { saveAs } from 'file-saver';

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

async function openFirstRecordDetail() {
  const scoreCell = await screen.findByText('80.0');
  const row = scoreCell.closest('tr');

  expect(row).not.toBeNull();

  const buttons = row ? Array.from(row.querySelectorAll('button')) : [];
  expect(buttons.length).toBeGreaterThan(0);

  fireEvent.click(buttons[0] as HTMLButtonElement);
}

function findButtonByText(text: string) {
  return screen.getAllByRole('button').find((button) => button.textContent?.includes(text)) ?? null;
}

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state', async () => {
    vi.mocked(listProjects).mockResolvedValue([]);
    vi.mocked(listRecords).mockResolvedValue([]);

    renderWithProviders(<HistoryPage />);

    expect(screen.getByText('历史记录')).toBeInTheDocument();
    expect(await screen.findByText('暂无分析记录')).toBeInTheDocument();
  });

  it('renders records without cost column', async () => {
    vi.mocked(listProjects).mockResolvedValue([
      { id: 1, name: '测试项目', description: '', mapping_data: null, created_at: '', updated_at: '' },
    ]);
    vi.mocked(listRecords).mockResolvedValue([
      {
        id: 1,
        project_id: 1,
        test_score: 85.5,
        token_usage: 1500,
        cost: 0.006,
        duration_ms: 3200,
        created_at: '2025-01-15T10:30:00Z',
      },
    ]);

    renderWithProviders(<HistoryPage />);

    expect(await screen.findByText('85.5')).toBeInTheDocument();
    expect(screen.getByText('1,500')).toBeInTheDocument();
    expect(screen.queryByText(/成本/)).not.toBeInTheDocument();
    expect(screen.queryByText(/¥|￥/)).not.toBeInTheDocument();
  });

  it('opens detail drawer and hides cost info', async () => {
    vi.mocked(listProjects).mockResolvedValue([]);
    vi.mocked(listRecords).mockResolvedValue([
      {
        id: 10,
        project_id: 1,
        test_score: 80,
        token_usage: 1000,
        cost: 0.004,
        duration_ms: 2500,
        created_at: '2025-01-15T10:30:00Z',
      },
    ]);
    vi.mocked(getRecord).mockResolvedValue({
      id: 10,
      project_id: 1,
      code_changes_summary: {},
      test_coverage_result: {},
      test_score: 80,
      ai_suggestions: null,
      token_usage: 1000,
      cost: 0,
      duration_ms: 2500,
      created_at: '2025-01-15T10:30:00Z',
    });

    renderWithProviders(<HistoryPage />);
    await openFirstRecordDetail();

    expect(await screen.findByText(/分析记录详情 #10/)).toBeInTheDocument();
    const drawer = await screen.findByRole('dialog');
    expect(screen.getAllByText('80.0').length).toBeGreaterThanOrEqual(1);
    expect(within(drawer).getByText('2500ms')).toBeInTheDocument();
    expect(within(drawer).getByText('1,000')).toBeInTheDocument();
    expect(screen.queryByText(/成本/)).not.toBeInTheDocument();
    expect(screen.queryByText(/¥|￥/)).not.toBeInTheDocument();
  });

  it('exports json from drawer', async () => {
    vi.mocked(listProjects).mockResolvedValue([]);
    vi.mocked(listRecords).mockResolvedValue([
      {
        id: 10,
        project_id: 1,
        test_score: 80,
        token_usage: 1000,
        cost: 0,
        duration_ms: 2500,
        created_at: '2025-01-15T10:30:00Z',
      },
    ]);
    vi.mocked(getRecord).mockResolvedValue({
      id: 10,
      project_id: 1,
      code_changes_summary: {},
      test_coverage_result: {},
      test_score: 80,
      ai_suggestions: null,
      token_usage: 1000,
      cost: 0,
      duration_ms: 2500,
      created_at: '2025-01-15T10:30:00Z',
    });

    renderWithProviders(<HistoryPage />);
    await openFirstRecordDetail();
    await screen.findByText(/分析记录详情 #10/);

    const jsonButton = findButtonByText('JSON');
    expect(jsonButton).not.toBeNull();
    fireEvent.click(jsonButton as HTMLButtonElement);

    await waitFor(() => {
      expect(saveAs).toHaveBeenCalled();
    });
  });

  it('renders dash when token usage is zero', async () => {
    vi.mocked(listProjects).mockResolvedValue([]);
    vi.mocked(listRecords).mockResolvedValue([
      {
        id: 6,
        project_id: 1,
        test_score: 70,
        token_usage: 0,
        cost: 0,
        duration_ms: 1000,
        created_at: '2025-01-15T10:30:00Z',
      },
    ]);

    renderWithProviders(<HistoryPage />);

    await screen.findByText('70.0');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });
});

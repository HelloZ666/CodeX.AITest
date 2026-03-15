import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ProjectDetailPage from './ProjectDetail';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../utils/api', () => ({
  getProject: vi.fn(),
  uploadProjectMapping: vi.fn(),
  analyzeWithProject: vi.fn(),
  createProjectMappingEntry: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  listRecords: vi.fn(),
}));

vi.mock('../components/FileUpload/FileUpload', () => ({
  default: ({ onFilesReady, loading }: { onFilesReady: (files: { codeChanges: File; testCases: File; mappingFile?: File }) => void; loading?: boolean }) => (
    <div data-testid="file-upload">
      <button
        data-testid="mock-submit"
        onClick={() => onFilesReady({
          codeChanges: new File(['c'], 'code.json'),
          testCases: new File(['t'], 'tests.csv'),
          mappingFile: new File(['m'], 'mapping.xlsx'),
        })}
      >
        {loading ? 'Loading...' : 'Submit'}
      </button>
    </div>
  ),
}));

vi.mock('../components/ScoreCard/ScoreCard', () => ({
  default: () => <div data-testid="score-card">ScoreCard</div>,
}));

vi.mock('../components/AISuggestions/AISuggestions', () => ({
  default: () => <div data-testid="ai-suggestions">AISuggestions</div>,
}));

vi.mock('../components/Charts/ScoreTrendChart', () => ({
  default: () => <div data-testid="score-trend-chart">ScoreTrendChart</div>,
}));

vi.mock('../components/Charts/CoverageChart', () => ({
  default: () => <div data-testid="coverage-chart">CoverageChart</div>,
}));

import {
  analyzeWithProject,
  createProjectMappingEntry,
  getProject,
  listRecords,
} from '../utils/api';

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

const mockProject = {
  id: 1,
  name: '测试项目',
  description: '项目描述',
  mapping_data: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  stats: {
    analysis_count: 5,
    avg_score: 82.5,
    latest_analysis: '2025-01-15T10:00:00Z',
  },
};

const mockProjectWithMapping = {
  ...mockProject,
  mapping_data: [
    {
      package_name: 'com.example.user',
      class_name: 'UserService',
      method_name: 'deleteUser',
      description: '删除用户',
    },
  ],
};

describe('ProjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading spinner while fetching project', () => {
    (getProject as Mock).mockReturnValue(new Promise(() => {}));
    (listRecords as Mock).mockResolvedValue([]);

    renderWithProviders(<ProjectDetailPage />);

    expect(document.querySelector('.ant-spin')).toBeInTheDocument();
  });

  it('shows empty state when project not found', async () => {
    (getProject as Mock).mockResolvedValue(null);
    (listRecords as Mock).mockResolvedValue([]);

    renderWithProviders(<ProjectDetailPage />);

    expect(await screen.findByText('项目不存在')).toBeInTheDocument();
  });

  it('renders project info and mapping warning when no mapping data', async () => {
    (getProject as Mock).mockResolvedValue(mockProject);
    (listRecords as Mock).mockResolvedValue([]);

    renderWithProviders(<ProjectDetailPage />);

    expect(await screen.findByText('测试项目')).toBeInTheDocument();
    expect(screen.getByText('项目描述')).toBeInTheDocument();
    expect(screen.getAllByText('未绑定映射文件').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/请先上传代码映射文件/)).toBeInTheDocument();
  });

  it('renders mapped status and score trend chart when data exists', async () => {
    (getProject as Mock).mockResolvedValue(mockProjectWithMapping);
    (listRecords as Mock).mockResolvedValue([
      { id: 1, project_id: 1, test_score: 80, token_usage: 100, cost: 0.01, duration_ms: 500, created_at: '2025-01-01T00:00:00Z' },
    ]);

    renderWithProviders(<ProjectDetailPage />);

    expect(await screen.findAllByText('已绑定映射文件')).toHaveLength(2);
    expect(screen.getByTestId('score-trend-chart')).toBeInTheDocument();
  });

  it('triggers analysis mutation when files submitted', async () => {
    (getProject as Mock).mockResolvedValue(mockProjectWithMapping);
    (listRecords as Mock).mockResolvedValue([]);
    (analyzeWithProject as Mock).mockResolvedValue({
      success: true,
      data: {
        diff_analysis: { total_files: 1, total_added: 10, total_removed: 5, files: [] },
        coverage: { total_changed_methods: 3, covered: ['a'], uncovered: ['b'], coverage_rate: 0.5, details: [] },
        score: { total_score: 80, grade: 'B', summary: 'Good', dimensions: [] },
        ai_analysis: null,
        ai_cost: null,
        duration_ms: 1500,
      },
    });

    renderWithProviders(<ProjectDetailPage />);
    fireEvent.click(await screen.findByTestId('mock-submit'));

    await waitFor(() => {
      expect(analyzeWithProject).toHaveBeenCalled();
    });
  });

  it('adds mapping from uncovered row in analysis report', async () => {
    (getProject as Mock).mockResolvedValue(mockProjectWithMapping);
    (listRecords as Mock).mockResolvedValue([]);
    (analyzeWithProject as Mock).mockResolvedValue({
      success: true,
      data: {
        diff_analysis: { total_files: 1, total_added: 10, total_removed: 5, files: [] },
        coverage: {
          total_changed_methods: 1,
          covered: [],
          uncovered: ['com.example.order.OrderService.createOrder'],
          coverage_rate: 0,
          details: [
            {
              method: 'com.example.order.OrderService.createOrder',
              description: '无映射描述',
              is_covered: false,
              matched_tests: [],
            },
          ],
        },
        score: { total_score: 80, grade: 'B', summary: 'Good', dimensions: [] },
        ai_analysis: null,
        ai_cost: null,
        duration_ms: 1500,
      },
    });
    (createProjectMappingEntry as Mock).mockResolvedValue({
      ...mockProjectWithMapping,
      mapping_data: [
        ...mockProjectWithMapping.mapping_data,
        {
          package_name: 'com.example.order',
          class_name: 'OrderService',
          method_name: 'createOrder',
          description: '创建订单并校验库存',
        },
      ],
    });

    renderWithProviders(<ProjectDetailPage />);
    fireEvent.click(await screen.findByTestId('mock-submit'));

    expect(await screen.findByText('本次分析报告')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /新增/ }));
    });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByDisplayValue('com.example.order')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('OrderService')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('createOrder')).toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText('例如：创建订单并校验库存'), {
      target: { value: '创建订单并校验库存' },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));
    });

    await waitFor(() => {
      expect(createProjectMappingEntry).toHaveBeenCalledWith(1, {
        package_name: 'com.example.order',
        class_name: 'OrderService',
        method_name: 'createOrder',
        description: '创建订单并校验库存',
      });
    });

    expect(await screen.findByRole('button', { name: '已保存' })).toBeDisabled();
  });
});

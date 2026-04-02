import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PerformanceAnalysisPage from './PerformanceAnalysis';

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echart" />,
}));

vi.mock('../utils/api', () => ({
  listPerformanceAnalysisFiles: vi.fn(),
  getPerformanceAnalysis: vi.fn(),
  uploadPerformanceAnalysisFile: vi.fn(),
}));

import {
  getPerformanceAnalysis,
  listPerformanceAnalysisFiles,
} from '../utils/api';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

function buildDashboard() {
  return {
    source_file: {
      id: 1,
      file_name: 'efficiency-dashboard.xlsx',
      file_type: 'excel',
      file_size: 1024,
      sheet_count: 6,
      created_at: '2026-04-02 08:00:00',
    },
    available_businesses: ['寿险', '健康险'] as const,
    sheet_names: ['寿险汇总数据-含外协（2026）', '寿险对外数据（2026）'],
    businesses: {
      寿险: {
        business: '寿险' as const,
        available_years: [2025, 2026],
        latest_month: { year: 2026, month: 2, month_label: '2月' },
        annual_benchmarks: [
          {
            year: 2025,
            avg_sync_tasks: 100,
            avg_total_tasks: 150,
            avg_release_count: 20,
            avg_demand_count: 80,
            avg_defect_count: 40,
            avg_defect_rate: 0.003,
            avg_cycle_days: 4.5,
            avg_design_cases: 10000,
            avg_execution_cases: 16000,
            avg_functional_manpower: 10,
            avg_automation_coverage: 0.7,
            avg_automation_pass_rate: 0.95,
          },
          {
            year: 2026,
            avg_sync_tasks: 110,
            avg_total_tasks: 165,
            avg_release_count: 22,
            avg_demand_count: 85,
            avg_defect_count: 42.5,
            avg_defect_rate: 0.0028,
            avg_cycle_days: 4.4,
            avg_design_cases: 11000,
            avg_execution_cases: 17500,
            avg_functional_manpower: 10.5,
            avg_automation_coverage: 0.72,
            avg_automation_pass_rate: 0.96,
          },
        ],
        monthly_metrics: [
          {
            business: '寿险' as const,
            year: 2026,
            month: 1,
            month_label: '1月',
            sync_tasks: 100,
            total_tasks: 150,
            release_count: 20,
            demand_count: 80,
            defect_count: 40,
            total_defect_count: 40,
            avg_cycle_days: 4.2,
            design_cases: 10000,
            execution_cases: 16000,
            functional_manpower: 10,
            performance_manpower: 1,
            qa_manpower: 1,
            manpower_input: 10,
            defect_rate: 0.004,
            production_defect_count: 1,
            production_defect_detection_rate: 0.9,
            automation_coverage: 0.7,
            automation_pass_rate: 0.95,
            planned_app_count: 10,
            connected_app_count: 8,
            precision_access_rate: 0.8,
          },
          {
            business: '寿险' as const,
            year: 2026,
            month: 2,
            month_label: '2月',
            sync_tasks: 120,
            total_tasks: 180,
            release_count: 24,
            demand_count: 90,
            defect_count: 45,
            total_defect_count: 45,
            avg_cycle_days: 4.6,
            design_cases: 12000,
            execution_cases: 19000,
            functional_manpower: 11,
            performance_manpower: 1,
            qa_manpower: 1,
            manpower_input: 11,
            defect_rate: 0.00375,
            production_defect_count: 0,
            production_defect_detection_rate: 1,
            automation_coverage: 0.72,
            automation_pass_rate: 0.96,
            planned_app_count: 10,
            connected_app_count: 9,
            precision_access_rate: 0.9,
          },
        ],
        team_snapshots: [
          {
            business: '寿险' as const,
            year: 2026,
            month: 2,
            month_label: '2月',
            teams: [
              {
                team_name: 'A团队',
                system_count: 12,
                sync_tasks: 70,
                total_tasks: 100,
                demand_count: 50,
                bug_count: 22,
                total_bug_count: 22,
                design_cases: 6800,
                execution_cases: 11000,
                staff_count: 6.5,
                per_capita_task: 15.38,
                per_capita_task_rank: 1,
                per_capita_demand: 7.69,
                per_capita_demand_rank: 1,
                per_capita_bug: 3.38,
                per_capita_bug_rank: 2,
                defect_rate: 0.0032,
                defect_rate_rank: 1,
                avg_design_cases: 1046.15,
                avg_design_cases_rank: 2,
                avg_execution_cases: 1692.31,
                avg_execution_cases_rank: 2,
              },
            ],
          },
        ],
      },
      健康险: {
        business: '健康险' as const,
        available_years: [2026],
        latest_month: { year: 2026, month: 2, month_label: '2月' },
        annual_benchmarks: [],
        monthly_metrics: [],
        team_snapshots: [],
      },
    },
  };
}

describe('PerformanceAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listPerformanceAnalysisFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        file_name: 'efficiency-dashboard.xlsx',
        file_type: 'excel',
        file_size: 1024,
        sheet_count: 6,
        created_at: '2026-04-02 08:00:00',
      },
    ]);
    (getPerformanceAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue(buildDashboard());
  });

  it('renders dashboard header, kpis and team table', async () => {
    renderWithProviders(<PerformanceAnalysisPage />);

    expect(await screen.findByText('效能分析')).toBeInTheDocument();

    await waitFor(() => {
      expect(getPerformanceAnalysis).toHaveBeenCalledWith(1);
    });

    expect(screen.getByText(/最新周期：2026年2月/)).toBeInTheDocument();
    expect(screen.getByText('当期同步任务')).toBeInTheDocument();
    expect(screen.getByText('人均任务负载')).toBeInTheDocument();
    expect(screen.getByText('整体承接趋势')).toBeInTheDocument();
    expect(screen.getByText('核心团队测试健康度')).toBeInTheDocument();
    expect(screen.getAllByText('A团队').length).toBeGreaterThan(0);
    expect(screen.getByText('导入新版数据')).toBeInTheDocument();
  });
});

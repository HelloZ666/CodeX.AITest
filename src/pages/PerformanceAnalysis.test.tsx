import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import PerformanceAnalysisPage from './PerformanceAnalysis';

vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');

  type CascaderOption = {
    value: string | number;
    label: React.ReactNode;
    children?: CascaderOption[];
  };

  function flattenCascaderOptions(
    options: CascaderOption[],
    parentValues: Array<string | number> = [],
    parentLabels: string[] = [],
  ): Array<{ key: string; label: string; value: Array<string | number> }> {
    return options.flatMap((item) => {
      const nextValues = [...parentValues, item.value];
      const nextLabels = [...parentLabels, String(item.label)];

      if (item.children && item.children.length > 0) {
        return flattenCascaderOptions(item.children, nextValues, nextLabels);
      }

      return [{
        key: JSON.stringify(nextValues),
        label: nextLabels.join(' / '),
        value: nextValues,
      }];
    });
  }

  const Cascader = ({
    options = [],
    value,
    onChange,
    style,
    allowClear: _allowClear,
    ...props
  }: {
    options?: CascaderOption[];
    value?: Array<string | number>;
    onChange?: (value: Array<string | number>) => void;
    style?: React.CSSProperties;
    allowClear?: boolean;
    'aria-label'?: string;
    'data-testid'?: string;
  }) => (
    <select
      {...props}
      value={value?.length ? JSON.stringify(value) : ''}
      onChange={(event) => {
        const nextValue = flattenCascaderOptions(options).find((item) => item.key === event.target.value)?.value ?? [];
        onChange?.(nextValue);
      }}
      style={style}
    >
      {flattenCascaderOptions(options).map((item) => (
        <option key={item.key} value={item.key}>
          {item.label}
        </option>
      ))}
    </select>
  );

  return {
    ...actual,
    Cascader,
  };
});

const chartOptions: EChartsOption[] = [];

vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: EChartsOption }) => {
    chartOptions.push(option);
    return <div data-testid="echart" />;
  },
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

function buildMonthOptions(enabledMonths: number[]) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    return {
      month,
      month_label: `${month}月`,
      has_data: enabledMonths.includes(month),
      disabled: !enabledMonths.includes(month),
    };
  });
}

function buildMonths(summaryFactory: (month: number) => Record<string, unknown> | null) {
  return Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return [
        month,
        {
          summary: summaryFactory(month),
          external: summaryFactory(month)
            ? {
                business: month === 1 ? '寿险' : '寿险',
                year: 2026,
                month,
                month_label: `${month}月`,
                defect_rate: month === 1 ? 0.004 : 0.00375,
                automation_coverage: month === 1 ? 0.7 : 0.72,
                automation_pass_rate: month === 1 ? 0.95 : 0.96,
                production_defect_count: month === 1 ? 1 : 0,
                production_defect_detection_rate: month === 1 ? 0.9 : 1,
                planned_app_count: 10,
                connected_app_count: month === 1 ? 8 : 9,
                precision_access_rate: month === 1 ? 0.8 : 0.9,
              }
            : null,
          team_snapshot: month === 2
            ? {
                business: '寿险',
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
              }
            : null,
        },
      ];
    }),
  );
}

function buildDashboard() {
  return {
    source_file: {
      id: 1,
      file_name: 'efficiency-dashboard.xlsx',
      file_type: 'excel',
      file_size: 1024,
      sheet_count: 8,
      created_at: '2026-04-02 08:00:00',
    },
    available_businesses: ['寿险', '健康险'] as const,
    current_year: 2026,
    sheet_names: [
      '寿险汇总数据-历年数据',
      '健康险汇总数据-历年数据',
      '寿险汇总数据-含外协（2026）',
      '寿险对外数据（2026）',
      '各团队数据（寿险）-2026',
      '健康险汇总数据-含外协（2026）',
      '健康险对外数据（2026）',
      '各团队数据（健康险）-2026',
    ],
    businesses: {
      寿险: {
        business: '寿险' as const,
        history: {
          business: '寿险' as const,
          available_years: [2023, 2024, 2025],
          latest_year: 2025,
          yearly_summary: [
            { business: '寿险' as const, year: 2023, sync_tasks: 866.08, total_tasks: 1124.5, release_count: 258.42, demand_count: 692.33, defect_count: 1380.17, defect_rate: 0.00171, avg_cycle_days: 4.75, design_cases: 807913.5, execution_cases: 1343149.83, functional_manpower: 144.4, performance_manpower: null, qa_manpower: 4 },
            { business: '寿险' as const, year: 2024, sync_tasks: 942.5, total_tasks: 1262.5, release_count: 315.92, demand_count: 731.92, defect_count: 2432.17, defect_rate: 0.00139, avg_cycle_days: 4.41, design_cases: 1752366.75, execution_cases: 2590632.17, functional_manpower: 114.59, performance_manpower: 7.67, qa_manpower: 3.67 },
            { business: '寿险' as const, year: 2025, sync_tasks: 1136.42, total_tasks: 1443.67, release_count: 307.58, demand_count: 878.5, defect_count: 3041, defect_rate: 0.00124, avg_cycle_days: 4.79, design_cases: 2454535.25, execution_cases: 3444162.58, functional_manpower: 116.58, performance_manpower: 8.08, qa_manpower: 4 },
          ],
          yearly_per_capita: [
            { business: '寿险' as const, year: 2023, per_capita_sync_tasks: 6, per_capita_total_tasks: 7.79, per_capita_demand_count: 4.79, per_capita_defect_count: 9.56, defect_rate: 0.00171, avg_design_cases: 5594.97, avg_execution_cases: 9301.59 },
            { business: '寿险' as const, year: 2024, per_capita_sync_tasks: 8.22, per_capita_total_tasks: 11.02, per_capita_demand_count: 6.39, per_capita_defect_count: 21.22, defect_rate: 0.00139, avg_design_cases: 15292.49, avg_execution_cases: 22607.84 },
            { business: '寿险' as const, year: 2025, per_capita_sync_tasks: 9.75, per_capita_total_tasks: 12.38, per_capita_demand_count: 7.54, per_capita_defect_count: 26.09, defect_rate: 0.00124, avg_design_cases: 21054.51, avg_execution_cases: 29543.34 },
          ],
          yearly_summary_table: {
            headers: ['月份', '同步任务数', '同步+回归', '发布总次数', '需求数(同步+需求号去重)', '缺陷数 除性能、代码扫描外所有任务类型（SIT+FT）', '', '测试任务平均时效', '设计用例数', '执行案例数', '功能人月投入', '性能人月投入', 'QA人月投入'],
            rows: [
              ['2023年平均数据', 866.08, 1124.5, 258.42, 692.33, 1380.17, null, 4.75, 807913.5, 1343149.83, 144.4, null, 4],
              ['2024年平均数据', 942.5, 1262.5, 315.92, 731.92, 2432.17, null, 4.41, 1752366.75, 2590632.17, 114.59, 7.67, 3.67],
              ['2025年平均数据', 1136.42, 1443.67, 307.58, 878.5, 3041, null, 4.79, 2454535.25, 3444162.58, 116.58, 8.08, 4],
            ],
          },
          yearly_per_capita_table: {
            headers: ['月份', '人均同步任务', '人均（同步+回归）', '人均需求数', '人均总缺陷数', '缺陷率', '', '平均设计案例数', '执行案例数（同步+回归+安全）'],
            rows: [
              ['23年人均任务数', 5.99778393351801, 7.78739612188366, 4.79452908587258, 9.55796398891967, 0.00170831407075139, null, 5594.9688365651, 9301.59162049862],
              ['24年人均任务数', 8.22497600139628, 11.0175407976263, 6.38729383017715, 21.2249760013963, 0.00138793434650595, null, 15292.4928004189, 22607.8381185095],
              ['25年人均任务数', 9.7479842168468, 12.383513467147, 7.53559787270544, 26.085091782467, 0.00123893107666716, null, 21054.5140675931, 29543.3400240178],
            ],
          },
        },
        current: {
          business: '寿险' as const,
          year: 2026,
          latest_month: { year: 2026, month: 2, month_label: '2月' },
          month_options: buildMonthOptions([1, 2]),
          months: buildMonths((month) => (
            month <= 2
              ? {
                  business: '寿险',
                  year: 2026,
                  month,
                  month_label: `${month}月`,
                  sync_tasks: month === 1 ? 1061 : 480,
                  total_tasks: month === 1 ? 1153 : 606,
                  release_count: month === 1 ? 305 : 126,
                  demand_count: month === 1 ? 836 : 387,
                  defect_count: month === 1 ? 1995 : 986,
                  avg_cycle_days: month === 1 ? 4.34 : 5.2,
                  design_cases: month === 1 ? 2116264 : 861716,
                  execution_cases: month === 1 ? 3181423 : 1266448,
                  functional_manpower: month === 1 ? 121.6 : 118.5,
                }
              : null
          )),
        },
      },
      健康险: {
        business: '健康险' as const,
        history: {
          business: '健康险' as const,
          available_years: [2024, 2025],
          latest_year: 2025,
          yearly_summary: [
            { business: '健康险' as const, year: 2024, sync_tasks: 108.5, total_tasks: 157.67, release_count: 49.17, demand_count: 95.92, defect_count: 37.67, defect_rate: 0.00099, avg_cycle_days: 3.98, design_cases: 37882.25, execution_cases: 68710, functional_manpower: 9.59 },
            { business: '健康险' as const, year: 2025, sync_tasks: 135.75, total_tasks: 193.42, release_count: 57.5, demand_count: 117.75, defect_count: 103.42, defect_rate: 0.00144, avg_cycle_days: 4.56, design_cases: 71890.75, execution_cases: 106039.25, functional_manpower: 11.45 },
          ],
          yearly_per_capita: [
            { business: '健康险' as const, year: 2024, per_capita_sync_tasks: 11.31, per_capita_total_tasks: 16.44, per_capita_demand_count: 10, per_capita_defect_count: 3.93, defect_rate: 0.00099, avg_design_cases: 3950.18, avg_execution_cases: 7164.75 },
            { business: '健康险' as const, year: 2025, per_capita_sync_tasks: 11.86, per_capita_total_tasks: 16.89, per_capita_demand_count: 10.28, per_capita_defect_count: 9.03, defect_rate: 0.00144, avg_design_cases: 6278.67, avg_execution_cases: 9261.07 },
          ],
          yearly_summary_table: {
            headers: ['月份', '同步任务数', '同步+回归', '发布总次数', '需求数(同步+需求号去重)', '缺陷数', '测试任务平均时效', '设计用例数', '执行案例数', '功能人月投入'],
            rows: [
              ['2024年平均数据', 108.5, 157.67, 49.17, 95.92, 37.67, 3.98, 37882.25, 68710, 9.59],
              ['2025年平均数据', 135.75, 193.42, 57.5, 117.75, 103.42, 4.56, 71890.75, 106039.25, 11.45],
            ],
          },
          yearly_per_capita_table: {
            headers: ['月份', '人均同步任务', '人均（同步+回归）', '人均需求数', '人均总缺陷数', '缺陷率', '平均设计案例数', '执行案例数（同步+回归+安全）'],
            rows: [
              ['24年人均任务数', 11.31, 16.44, 10, 3.93, 0.00099, 3950.18, 7164.75],
              ['25年人均任务数', 11.86, 16.89, 10.28, 9.03, 0.00144, 6278.67, 9261.07],
            ],
          },
        },
        current: {
          business: '健康险' as const,
          year: 2026,
          latest_month: { year: 2026, month: 1, month_label: '1月' },
          month_options: buildMonthOptions([1]),
          months: Object.fromEntries(
            Array.from({ length: 12 }, (_, index) => {
              const month = index + 1;
              return [
                month,
                {
                  summary: month === 1
                    ? {
                        business: '健康险',
                        year: 2026,
                        month: 1,
                        month_label: '1月',
                        sync_tasks: 131,
                        total_tasks: 158,
                        release_count: 60,
                        demand_count: 114,
                        defect_count: 163,
                        avg_cycle_days: 4.53,
                        design_cases: 77258,
                        execution_cases: 120106,
                        functional_manpower: 13.75,
                      }
                    : null,
                  external: month === 1
                    ? {
                        business: '健康险',
                        year: 2026,
                        month: 1,
                        month_label: '1月',
                        defect_rate: 0.00211,
                        automation_coverage: null,
                        automation_pass_rate: null,
                        production_defect_count: 0,
                        production_defect_detection_rate: 1,
                        planned_app_count: 4,
                        connected_app_count: 3,
                        precision_access_rate: 0.75,
                      }
                    : null,
                  team_snapshot: null,
                },
              ];
            }),
          ),
        },
      },
    },
  };
}

function findChartOption(seriesNames: string[]): EChartsOption | undefined {
  for (let index = chartOptions.length - 1; index >= 0; index -= 1) {
    const option = chartOptions[index];
    const series = option.series
      ? (Array.isArray(option.series) ? option.series : [option.series])
      : [];
    const optionSeriesNames = series.map((item) => (
      typeof item === 'object' && item !== null && 'name' in item
        ? String(item.name ?? '')
        : ''
    ));
    if (seriesNames.every((name) => optionSeriesNames.includes(name))) {
      return option;
    }
  }

  return undefined;
}

function getSeriesData(option: EChartsOption | undefined, seriesName: string): Array<number | null> {
  if (!option?.series) {
    return [];
  }

  const series = Array.isArray(option.series) ? option.series : [option.series];
  const target = series.find((item) => (
    typeof item === 'object'
    && item !== null
    && 'name' in item
    && String(item.name ?? '') === seriesName
  ));

  if (!target || typeof target !== 'object' || !('data' in target) || !Array.isArray(target.data)) {
    return [];
  }

  return target.data.map((value) => (typeof value === 'number' ? value : value === null ? null : null));
}

function getTooltipFormatter(option: EChartsOption) {
  const tooltip = option.tooltip;
  if (!tooltip || Array.isArray(tooltip) || typeof tooltip !== 'object') {
    return null;
  }

  return typeof tooltip.formatter === 'function' ? tooltip.formatter : null;
}

function runTooltipFormatter(
  formatter: NonNullable<ReturnType<typeof getTooltipFormatter>>,
  params: unknown,
): string {
  return String(formatter(params as never, '', () => {}));
}

describe('PerformanceAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chartOptions.length = 0;
    (listPerformanceAnalysisFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        file_name: 'efficiency-dashboard.xlsx',
        file_type: 'excel',
        file_size: 1024,
        sheet_count: 8,
        created_at: '2026-04-02 08:00:00',
      },
    ]);
    (getPerformanceAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue(buildDashboard());
  });

  it('renders latest imported current data by default and hides file selector', async () => {
    renderWithProviders(<PerformanceAnalysisPage />);

    expect(await screen.findByText('效能分析')).toBeInTheDocument();

    await waitFor(() => {
      expect(getPerformanceAnalysis).toHaveBeenCalledWith(1);
    });

    await waitFor(() => {
      expect(screen.getByLabelText('级联筛选')).toHaveValue(JSON.stringify(['current', '寿险', '2']));
    });
    expect(screen.queryByLabelText('文件版本筛选')).not.toBeInTheDocument();
    expect(screen.getByText('当年趋势总览')).toBeInTheDocument();
    expect(screen.queryByText('自动化与线上质量')).not.toBeInTheDocument();
    expect(screen.getByText('团队健康明细')).toBeInTheDocument();
    expect(screen.getByText('所选月测试缺陷数')).toBeInTheDocument();
    expect(screen.getByText('986')).toBeInTheDocument();
    expect(screen.getByText('0.32%')).toBeInTheDocument();
    expect(screen.getAllByText('A团队').length).toBeGreaterThan(0);
  });

  it('switches to history mode through cascader and hides current-only modules', async () => {
    renderWithProviders(<PerformanceAnalysisPage />);

    expect(await screen.findByText('效能分析')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('级联筛选'), {
      target: { value: JSON.stringify(['history', '寿险']) },
    });

    expect(await screen.findByText('历年汇总明细')).toBeInTheDocument();
    expect(screen.getByText('最新历年缺陷数')).toBeInTheDocument();
    expect(screen.getByText('2023年平均数据')).toBeInTheDocument();
    expect(screen.getByText('23年人均任务数')).toBeInTheDocument();
    expect(screen.queryByText('字段7')).not.toBeInTheDocument();
    expect(screen.getByText('6.00')).toBeInTheDocument();
    expect(screen.getByText('0.17%')).toBeInTheDocument();
    expect(screen.getByText('5,594.97')).toBeInTheDocument();
    expect(screen.queryByLabelText('月份筛选')).not.toBeInTheDocument();
    expect(screen.queryByText('团队健康明细')).not.toBeInTheDocument();
  });

  it('formats defect-rate tooltips as percentages in current and history charts', async () => {
    renderWithProviders(<PerformanceAnalysisPage />);

    expect(await screen.findByText('效能分析')).toBeInTheDocument();
    await waitFor(() => {
      expect(chartOptions.length).toBeGreaterThan(0);
    });

    const currentOption = findChartOption(['同步任务数', '需求数', '缺陷率']);
    expect(currentOption).toBeTruthy();

    const currentTooltipFormatter = currentOption ? getTooltipFormatter(currentOption) : null;
    expect(currentTooltipFormatter).toBeTruthy();
    expect(
      currentTooltipFormatter
        ? runTooltipFormatter(currentTooltipFormatter, [
        {
          axisValueLabel: '2月',
          marker: '',
          seriesName: '缺陷率',
          value: 0.00375,
        },
        ])
        : '',
    ).toContain('0.38%');

    chartOptions.length = 0;
    fireEvent.change(screen.getByLabelText('级联筛选'), {
      target: { value: JSON.stringify(['history', '寿险']) },
    });
    expect(await screen.findByText('历年汇总明细')).toBeInTheDocument();
    await waitFor(() => {
      expect(chartOptions.length).toBeGreaterThan(0);
    });

    const historyOption = findChartOption(['人均同步+回归', '缺陷率']);
    expect(historyOption).toBeTruthy();

    const historyTooltipFormatter = historyOption ? getTooltipFormatter(historyOption) : null;
    expect(historyTooltipFormatter).toBeTruthy();
    expect(
      historyTooltipFormatter
        ? runTooltipFormatter(historyTooltipFormatter, [
        {
          axisValueLabel: '2024年',
          marker: '',
          seriesName: '缺陷率',
          value: 0.00138793434650595,
        },
        ])
        : '',
    ).toContain('0.14%');
  });

  it('keeps enough axis title spacing in team defect chart', async () => {
    renderWithProviders(<PerformanceAnalysisPage />);

    expect(await screen.findByText('效能分析')).toBeInTheDocument();

    await waitFor(() => {
      const teamDefectOption = findChartOption(['人均任务', '缺陷率']);
      expect(teamDefectOption).toBeTruthy();

      expect(teamDefectOption?.grid).toMatchObject({
        top: 32,
        right: 56,
        left: 64,
      });

      const yAxis = Array.isArray(teamDefectOption?.yAxis) ? teamDefectOption.yAxis : [];
      expect(yAxis[0]).toMatchObject({
        name: '人均任务',
        nameTextStyle: {
          color: '#667085',
          padding: [0, 0, 0, 12],
        },
      });
      expect(yAxis[1]).toMatchObject({
        name: '缺陷率',
        nameTextStyle: {
          color: '#667085',
          padding: [0, 14, 0, 0],
        },
      });
    });
  });

  it('shows cascaded current branches and switches to health current latest month', async () => {
    renderWithProviders(<PerformanceAnalysisPage />);

    expect(await screen.findByText('效能分析')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByLabelText('级联筛选')).toHaveValue(JSON.stringify(['current', '寿险', '2']));
    });

    expect(screen.getByRole('option', { name: '当年数据 / 寿险 / 2026年2月' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '当年数据 / 健康险 / 2026年1月' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: '当年数据 / 健康险 / 2026年3月' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('级联筛选'), {
      target: { value: JSON.stringify(['current', '健康险', '1']) },
    });

    await waitFor(() => {
      expect(screen.getByLabelText('级联筛选')).toHaveValue(JSON.stringify(['current', '健康险', '1']));
    });

    expect(screen.getByText('当前月份：2026年1月')).toBeInTheDocument();
    expect(screen.getByText('163')).toBeInTheDocument();
  });

  it('keeps all available current-year months in the trend chart', async () => {
    renderWithProviders(<PerformanceAnalysisPage />);

    expect(await screen.findByText('效能分析')).toBeInTheDocument();

    await waitFor(() => {
      const currentOption = findChartOption(['同步任务数', '需求数', '缺陷率']);
      expect(getSeriesData(currentOption, '同步任务数')[1]).toBe(480);
      expect(getSeriesData(currentOption, '需求数')[1]).toBe(387);
      expect(getSeriesData(currentOption, '缺陷率')[1]).toBe(0.00375);
    });
  });
});

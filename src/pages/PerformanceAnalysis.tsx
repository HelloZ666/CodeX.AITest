import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Cascader,
  Card,
  Empty,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import type { ColumnsType } from 'antd/es/table';
import {
  ClockCircleOutlined,
  DashboardOutlined,
  FileExcelOutlined,
  InboxOutlined,
  LineChartOutlined,
  RiseOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EChartsOption,
  TooltipComponentFormatterCallback,
  TooltipComponentFormatterCallbackParams,
} from 'echarts';
import ChartSurface from '../components/Charts/ChartSurface';
import {
  getPerformanceAnalysis,
  listPerformanceAnalysisFiles,
  uploadPerformanceAnalysisFile,
} from '../utils/api';
import type {
  PerformanceAnalysisDashboardV2,
  PerformanceAnalysisFileRecord,
  PerformanceBusinessDashboardV2,
  PerformanceBusinessType,
  PerformanceCurrentView,
  PerformanceHistoryView,
  PerformanceHistoryPerCapitaRow,
  PerformanceHistoryRawTable,
  PerformanceHistorySummaryRow,
  PerformanceMetricPoint,
  PerformanceTeamRow,
  PerformanceWorkbookCell,
} from '../types';

const { Dragger } = Upload;
const { Paragraph, Text, Title } = Typography;

type AnalysisScope = 'current' | 'history';
type HistoryTableRecord = { key: string } & Record<string, PerformanceWorkbookCell>;

const CHART_TOOLTIP_BG = 'rgba(28, 37, 54, 0.94)';
const CHART_AXIS_COLOR = '#667085';
const CHART_GRID_COLOR = 'rgba(148, 163, 184, 0.18)';

function formatDateTime(value: string): string {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }
  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }
  return `${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
}

function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '--';
  }
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function formatDecimal(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined) {
    return '--';
  }
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatFixedDecimal(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined) {
    return '--';
  }
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatRate(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined) {
    return '--';
  }
  return `${(value * 100).toFixed(digits)}%`;
}

type TooltipFormatterItem<T> = T extends readonly (infer Item)[] ? Item : T;
type TooltipFormatterParam = TooltipFormatterItem<TooltipComponentFormatterCallbackParams>;

function extractChartNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function isDefectRateLabel(label: string | null | undefined): boolean {
  return (label ?? '').includes('缺陷率');
}

function extractTooltipNumber(value: TooltipFormatterParam['value']): number | null {
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const numericValue = extractChartNumber(value[index]);
      if (numericValue !== null) {
        return numericValue;
      }
    }
    return null;
  }

  return extractChartNumber(value);
}

function formatTooltipMarker(marker: TooltipFormatterParam['marker']): string {
  if (typeof marker === 'string') {
    return marker;
  }
  return marker?.content ?? '';
}

function formatTooltipText(value: unknown): string {
  if (value === null || value === undefined) {
    return '--';
  }
  return String(value);
}

function formatTooltipValue(seriesName: string | undefined, value: TooltipFormatterParam['value']): string {
  if (isDefectRateLabel(seriesName)) {
    return formatRate(extractTooltipNumber(value), 2);
  }

  if (Array.isArray(value)) {
    return value.map((item) => formatTooltipText(item)).join(', ');
  }

  return formatTooltipText(value);
}

const buildAxisTooltipFormatter: TooltipComponentFormatterCallback<TooltipComponentFormatterCallbackParams> = (params) => {
  const items = Array.isArray(params) ? params : [params];
  const title = items[0] && 'axisValueLabel' in items[0]
    ? formatTooltipText(items[0].axisValueLabel)
    : formatTooltipText(items[0]?.name);
  const lines = items.map((item) => `${formatTooltipMarker(item.marker)}${item.seriesName ?? ''} ${formatTooltipValue(item.seriesName, item.value)}`.trim());
  return [title, ...lines].filter((line) => line).join('<br/>');
};

function buildDeltaText(
  current: number | null | undefined,
  previous: number | null | undefined,
  mode: 'percent' | 'absolute' = 'percent',
): string {
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return '暂无上期对比';
  }

  if (mode === 'absolute') {
    const delta = current - previous;
    const prefix = delta > 0 ? '+' : '';
    return `较上期 ${prefix}${delta.toFixed(2)}`;
  }

  if (previous === 0) {
    return '暂无上期对比';
  }

  const rate = ((current - previous) / previous) * 100;
  const prefix = rate > 0 ? '+' : '';
  return `较上期 ${prefix}${rate.toFixed(1)}%`;
}

function buildHealthTag(rate: number | null | undefined) {
  if (rate === null || rate === undefined) {
    return <Tag>待补充</Tag>;
  }
  if (rate <= 0.0015) {
    return <Tag color="success">稳健</Tag>;
  }
  if (rate <= 0.003) {
    return <Tag color="processing">关注</Tag>;
  }
  return <Tag color="warning">预警</Tag>;
}

function mergeCurrentMetric(
  summary: PerformanceMetricPoint | null | undefined,
  external: Partial<PerformanceMetricPoint> | null | undefined,
): PerformanceMetricPoint | null {
  if (!summary && !external) {
    return null;
  }

  const merged = {
    ...(external ?? {}),
    ...(summary ?? {}),
  } as PerformanceMetricPoint;

  if (merged.defect_rate === null || merged.defect_rate === undefined) {
    if (merged.defect_count !== null && merged.defect_count !== undefined && merged.design_cases) {
      merged.defect_rate = merged.defect_count / merged.design_cases;
    }
  }

  if (
    (merged.functional_manpower === null || merged.functional_manpower === undefined)
    && merged.manpower_input !== null
    && merged.manpower_input !== undefined
  ) {
    merged.functional_manpower = merged.manpower_input;
  }

  return merged;
}

function getCurrentRecords(currentView: PerformanceCurrentView | null | undefined): PerformanceMetricPoint[] {
  if (!currentView) {
    return [];
  }

  return currentView.month_options
    .filter((item) => item.has_data)
    .map((item) => mergeCurrentMetric(currentView.months[item.month]?.summary, currentView.months[item.month]?.external))
    .filter((item): item is PerformanceMetricPoint => item !== null)
    .sort((left, right) => left.month - right.month);
}

function hasHistoryViewData(historyView: PerformanceHistoryView | null | undefined): boolean {
  return Boolean(
    historyView
    && (
      historyView.available_years.length > 0
      || historyView.yearly_summary.length > 0
      || historyView.yearly_per_capita.length > 0
    ),
  );
}

function getAvailableCurrentMonths(currentView: PerformanceCurrentView | null | undefined) {
  return (currentView?.month_options ?? []).filter((item) => item.has_data && !item.disabled);
}

function getLatestAvailableMonth(currentView: PerformanceCurrentView | null | undefined): number | null {
  const availableMonths = getAvailableCurrentMonths(currentView);
  if (availableMonths.length === 0) {
    return null;
  }

  const latestMonth = currentView?.latest_month?.month;
  if (latestMonth && availableMonths.some((item) => item.month === latestMonth)) {
    return latestMonth;
  }

  return availableMonths[availableMonths.length - 1]?.month ?? null;
}

function formatCurrentMonthLabel(
  year: number | null | undefined,
  monthLabel: string | null | undefined,
): string {
  if (!monthLabel) {
    return '--';
  }
  return year ? `${year}年${monthLabel}` : monthLabel;
}

function getPreferredBusiness(businesses: PerformanceBusinessType[]): PerformanceBusinessType | null {
  if (businesses.length === 0) {
    return null;
  }

  return businesses.includes('寿险') ? '寿险' : businesses[0];
}

function isPerformanceBusinessType(value: string | number | undefined): value is PerformanceBusinessType {
  return value === '寿险' || value === '健康险';
}

function getPreviousMetric(
  allMetrics: Array<Partial<PerformanceMetricPoint>>,
  latestMetric: Partial<PerformanceMetricPoint> | null,
): Partial<PerformanceMetricPoint> | null {
  if (!latestMetric || latestMetric.month === undefined || latestMetric.month === null) {
    return null;
  }
  const index = allMetrics.findIndex((item) => item.month === latestMetric.month && item.year === latestMetric.year);
  if (index <= 0) {
    return null;
  }
  return allMetrics[index - 1] ?? null;
}

function formatWorkbookCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toLocaleString('zh-CN', { hour12: false });
  }
  return String(value);
}

function normalizeHistoryRawTable(table: PerformanceHistoryRawTable | null | undefined): PerformanceHistoryRawTable {
  const headers = table?.headers ?? [];
  const rows = table?.rows ?? [];
  if (headers.length === 0) {
    return { headers: [], rows: [] };
  }

  const keepIndexes = headers
    .map((_, index) => index)
    .filter((index) => {
      if (headers[index]?.trim()) {
        return true;
      }
      return rows.some((row) => formatWorkbookCell(row[index] ?? null).trim() !== '');
    });

  return {
    headers: keepIndexes.map((index) => headers[index]),
    rows: rows.map((row) => keepIndexes.map((index) => row[index] ?? null)),
  };
}

function formatRawHistoryCell(
  value: PerformanceWorkbookCell,
  header: string,
  mode: 'default' | 'perCapita' = 'default',
): string {
  const parsedNumericValue = extractChartNumber(value);
  if (parsedNumericValue !== null && isDefectRateLabel(header)) {
    return formatRate(parsedNumericValue, 2);
  }

  if (mode === 'perCapita') {
    const numericValue = extractChartNumber(value);
    if (numericValue !== null) {
      if (header.includes('缺陷率')) {
        return formatRate(numericValue, 2);
      }
      return formatFixedDecimal(numericValue, 2);
    }
  }
  return formatWorkbookCell(value);
}

function buildHistoryTableColumns(
  headers: string[],
  mode: 'default' | 'perCapita' = 'default',
): ColumnsType<HistoryTableRecord> {
  return headers.map((header, index) => ({
    title: header || `字段${index + 1}`,
    dataIndex: `col_${index}`,
    key: `col_${index}`,
    width: index === 0 ? 180 : 140,
    render: (value: PerformanceWorkbookCell) => formatRawHistoryCell(value, header, mode),
  }));
}

function buildHistoryTableData(rows: PerformanceWorkbookCell[][]): HistoryTableRecord[] {
  return rows.map((row, rowIndex) => {
    const record: HistoryTableRecord = { key: `row-${rowIndex}` };
    row.forEach((value, cellIndex) => {
      record[`col_${cellIndex}`] = value;
    });
    return record;
  });
}

function getHistoryDefectRate(row: PerformanceHistorySummaryRow | null | undefined): number | null {
  if (!row) {
    return null;
  }
  if (row.defect_rate !== null && row.defect_rate !== undefined) {
    return row.defect_rate;
  }
  if (row.defect_count !== null && row.defect_count !== undefined && row.design_cases) {
    return row.defect_count / row.design_cases;
  }
  return null;
}

function buildCurrentTrendOption(records: PerformanceMetricPoint[]): EChartsOption {
  const monthAxis = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const metricMap = new Map(records.map((item) => [item.month, item]));

  return {
    color: ['#8AA6FF', '#4F7CFF', '#FF8E66'],
    tooltip: {
      trigger: 'axis',
      formatter: buildAxisTooltipFormatter,
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    legend: {
      bottom: 0,
      textStyle: { color: CHART_AXIS_COLOR },
    },
    grid: {
      top: 28,
      right: 22,
      bottom: 48,
      left: 38,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: monthAxis,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_GRID_COLOR } },
      axisLabel: { color: CHART_AXIS_COLOR },
    },
    yAxis: [
      {
        type: 'value',
        name: '任务/需求',
        axisLabel: { color: CHART_AXIS_COLOR },
        splitLine: { lineStyle: { color: CHART_GRID_COLOR, type: 'dashed' } },
      },
      {
        type: 'value',
        name: '缺陷率',
        axisLabel: {
          color: CHART_AXIS_COLOR,
          formatter: (value: number) => `${(value * 100).toFixed(2)}%`,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '同步任务数',
        type: 'bar',
        barMaxWidth: 28,
        data: monthAxis.map((_, index) => metricMap.get(index + 1)?.sync_tasks ?? null),
        itemStyle: { color: '#B6C8FF', borderRadius: [10, 10, 4, 4] },
      },
      {
        name: '需求数',
        type: 'line',
        smooth: true,
        symbolSize: 8,
        data: monthAxis.map((_, index) => metricMap.get(index + 1)?.demand_count ?? null),
        lineStyle: { width: 3, color: '#4F7CFF' },
        itemStyle: { color: '#4F7CFF' },
        areaStyle: { color: 'rgba(79, 124, 255, 0.12)' },
      },
      {
        name: '缺陷率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 8,
        data: monthAxis.map((_, index) => metricMap.get(index + 1)?.defect_rate ?? null),
        lineStyle: { width: 2.5, color: '#FF8E66' },
        itemStyle: { color: '#FF8E66' },
      },
    ],
  };
}

function buildHistoryComparisonOption(rows: PerformanceHistorySummaryRow[]): EChartsOption {
  return {
    color: ['#90A9FF'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    grid: {
      top: 18,
      right: 18,
      bottom: 18,
      left: 58,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: CHART_AXIS_COLOR },
      splitLine: { lineStyle: { color: CHART_GRID_COLOR, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((item) => `${item.year}年`),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: CHART_AXIS_COLOR },
    },
    series: [
      {
        name: '同步+回归均值',
        type: 'bar',
        barWidth: 16,
        data: rows.map((item) => item.total_tasks ?? item.sync_tasks),
        label: {
          show: true,
          position: 'right',
          color: '#344054',
          formatter: (params) => formatInteger(extractChartNumber(params.value)),
        },
        itemStyle: {
          color: '#90A9FF',
          borderRadius: [0, 10, 10, 0],
        },
      },
    ],
  };
}

function buildHistoryPerCapitaOption(rows: PerformanceHistoryPerCapitaRow[]): EChartsOption {
  return {
    color: ['#6F8DF7', '#FF8E66'],
    tooltip: {
      trigger: 'axis',
      formatter: buildAxisTooltipFormatter,
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    legend: {
      bottom: 0,
      textStyle: { color: CHART_AXIS_COLOR },
    },
    grid: {
      top: 28,
      right: 22,
      bottom: 48,
      left: 38,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: rows.map((item) => `${item.year}年`),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_GRID_COLOR } },
      axisLabel: { color: CHART_AXIS_COLOR },
    },
    yAxis: [
      {
        type: 'value',
        name: '人均任务',
        axisLabel: { color: CHART_AXIS_COLOR },
        splitLine: { lineStyle: { color: CHART_GRID_COLOR, type: 'dashed' } },
      },
      {
        type: 'value',
        name: '缺陷率',
        axisLabel: {
          color: CHART_AXIS_COLOR,
          formatter: (value: number) => `${(value * 100).toFixed(2)}%`,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '人均同步+回归',
        type: 'bar',
        barMaxWidth: 28,
        data: rows.map((item) => item.per_capita_total_tasks),
        itemStyle: { color: '#B6C8FF', borderRadius: [10, 10, 4, 4] },
      },
      {
        name: '缺陷率',
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbolSize: 8,
        data: rows.map((item) => item.defect_rate),
        lineStyle: { width: 2.5, color: '#FF8E66' },
        itemStyle: { color: '#FF8E66' },
      },
    ],
  };
}

function buildTeamLoadOption(teams: PerformanceTeamRow[]): EChartsOption {
  const rows = [...teams]
    .filter((item) => item.staff_count && item.staff_count > 0)
    .sort((left, right) => (right.per_capita_task ?? 0) - (left.per_capita_task ?? 0))
    .slice(0, 6);

  return {
    color: ['#7C9BFF'],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    grid: {
      top: 18,
      right: 18,
      bottom: 18,
      left: 64,
      containLabel: true,
    },
    xAxis: {
      type: 'value',
      axisLabel: { color: CHART_AXIS_COLOR },
      splitLine: { lineStyle: { color: CHART_GRID_COLOR, type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: rows.map((item) => item.team_name),
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: CHART_AXIS_COLOR },
    },
    series: [
      {
        name: '人均任务',
        type: 'bar',
        barWidth: 14,
        data: rows.map((item) => item.per_capita_task),
        label: {
          show: true,
          position: 'right',
          color: '#344054',
          formatter: (params) => formatDecimal(extractChartNumber(params.value), 2),
        },
        itemStyle: {
          color: '#A6B8FF',
          borderRadius: [0, 10, 10, 0],
        },
      },
    ],
  };
}

function buildTeamDefectOption(teams: PerformanceTeamRow[]): EChartsOption {
  const rows = [...teams]
    .filter((item) => item.staff_count && item.staff_count > 0)
    .sort((left, right) => (right.per_capita_task ?? 0) - (left.per_capita_task ?? 0))
    .slice(0, 6);

  return {
    color: ['#A9B8D0', '#FF7F7F'],
    tooltip: {
      trigger: 'axis',
      formatter: buildAxisTooltipFormatter,
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    legend: {
      bottom: 0,
      textStyle: { color: CHART_AXIS_COLOR },
    },
    grid: {
      top: 32,
      right: 56,
      bottom: 48,
      left: 64,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: rows.map((item) => item.team_name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_GRID_COLOR } },
      axisLabel: { color: CHART_AXIS_COLOR },
    },
    yAxis: [
      {
        type: 'value',
        name: '人均任务',
        nameTextStyle: {
          color: CHART_AXIS_COLOR,
          padding: [0, 0, 0, 12],
        },
        axisLabel: { color: CHART_AXIS_COLOR },
        splitLine: { lineStyle: { color: CHART_GRID_COLOR, type: 'dashed' } },
      },
      {
        type: 'value',
        name: '缺陷率',
        nameTextStyle: {
          color: CHART_AXIS_COLOR,
          padding: [0, 14, 0, 0],
        },
        axisLabel: {
          color: CHART_AXIS_COLOR,
          formatter: (value: number) => `${(value * 100).toFixed(2)}%`,
        },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '人均任务',
        type: 'bar',
        barMaxWidth: 28,
        data: rows.map((item) => item.per_capita_task),
        itemStyle: { color: '#B4C0D2', borderRadius: [10, 10, 4, 4] },
      },
      {
        name: '缺陷率',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbolSize: 8,
        data: rows.map((item) => item.defect_rate),
        lineStyle: { width: 2.5, color: '#FF8383' },
        itemStyle: { color: '#FF8383' },
      },
    ],
  };
}

interface PanelCardProps {
  title: string;
  subtitle?: string;
  extra?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

const PanelCard: React.FC<PanelCardProps> = ({ title, subtitle, extra, className, children }) => (
  <Card
    variant="borderless"
    className={`efficiency-panel${className ? ` ${className}` : ''}`}
    extra={extra}
  >
    <div className="efficiency-panel__header">
      <div>
        <h3 className="efficiency-panel__title">{title}</h3>
        {subtitle ? <p className="efficiency-panel__subtitle">{subtitle}</p> : null}
      </div>
    </div>
    {children}
  </Card>
);

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  delta: string;
  tone?: 'blue' | 'orange' | 'green' | 'indigo';
}

const MetricCard: React.FC<MetricCardProps> = ({
  icon,
  label,
  value,
  delta,
  tone = 'blue',
}) => (
  <article className={`efficiency-kpi-card efficiency-kpi-card--${tone}`}>
    <div className="efficiency-kpi-card__icon">{icon}</div>
    <div className="efficiency-kpi-card__body">
      <span className="efficiency-kpi-card__label">{label}</span>
      <strong className="efficiency-kpi-card__value">{value}</strong>
      <span className="efficiency-kpi-card__delta">{delta}</span>
    </div>
  </article>
);

const PerformanceAnalysisPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<PerformanceBusinessType | null>(null);
  const [selectedScope, setSelectedScope] = useState<AnalysisScope>('current');
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);

  const filesQuery = useQuery({
    queryKey: ['performance-analysis-files'],
    queryFn: listPerformanceAnalysisFiles,
    staleTime: 30_000,
  });

  useEffect(() => {
    const latestFileId = filesQuery.data?.[0]?.id ?? null;
    if (selectedFileId === latestFileId) {
      return;
    }

    setSelectedFileId(latestFileId);
  }, [filesQuery.data, selectedFileId]);

  const dashboardQuery = useQuery<PerformanceAnalysisDashboardV2>({
    queryKey: ['performance-analysis', selectedFileId],
    queryFn: () => getPerformanceAnalysis(selectedFileId as number),
    enabled: selectedFileId !== null,
    staleTime: 30_000,
  });

  useEffect(() => {
    const businesses = dashboardQuery.data?.available_businesses ?? [];
    if (businesses.length === 0) {
      setSelectedBusiness(null);
      return;
    }

    if (!selectedBusiness || !businesses.includes(selectedBusiness)) {
      setSelectedBusiness(getPreferredBusiness(businesses));
    }
  }, [dashboardQuery.data, selectedBusiness]);

  const businessDashboard: PerformanceBusinessDashboardV2 | null = useMemo(() => {
    if (!dashboardQuery.data || !selectedBusiness) {
      return null;
    }
    return dashboardQuery.data.businesses[selectedBusiness] ?? null;
  }, [dashboardQuery.data, selectedBusiness]);

  const historyView = businessDashboard?.history ?? null;
  const currentView = businessDashboard?.current ?? null;

  const hasHistoryData = hasHistoryViewData(historyView);
  const hasCurrentData = getAvailableCurrentMonths(currentView).length > 0;

  useEffect(() => {
    if (!businessDashboard) {
      return;
    }
    if (selectedScope === 'current' && !hasCurrentData && hasHistoryData) {
      setSelectedScope('history');
    }
    if (selectedScope === 'history' && !hasHistoryData && hasCurrentData) {
      setSelectedScope('current');
    }
  }, [businessDashboard, hasCurrentData, hasHistoryData, selectedScope]);

  useEffect(() => {
    if (!currentView) {
      setSelectedMonth(null);
      return;
    }

    const availableMonths = getAvailableCurrentMonths(currentView);
    if (availableMonths.length === 0) {
      setSelectedMonth(null);
      return;
    }

    if (!selectedMonth || !availableMonths.some((item) => item.month === selectedMonth)) {
      setSelectedMonth(getLatestAvailableMonth(currentView));
    }
  }, [currentView, selectedMonth]);

  const currentRecords = useMemo(() => getCurrentRecords(currentView), [currentView]);
  const currentMonthData = useMemo(() => {
    if (!currentView || selectedMonth === null) {
      return null;
    }
    return currentView.months[selectedMonth] ?? null;
  }, [currentView, selectedMonth]);
  const currentMetric = useMemo(
    () => mergeCurrentMetric(currentMonthData?.summary, currentMonthData?.external),
    [currentMonthData],
  );
  const previousCurrentMetric = useMemo(
    () => getPreviousMetric(currentRecords, currentMetric),
    [currentMetric, currentRecords],
  );

  const historySummaryRows = historyView?.yearly_summary ?? [];
  const historyPerCapitaRows = historyView?.yearly_per_capita ?? [];
  const historySummaryTable = historyView?.yearly_summary_table ?? null;
  const historyPerCapitaTable = historyView?.yearly_per_capita_table ?? null;
  const normalizedHistorySummaryTable = useMemo(
    () => normalizeHistoryRawTable(historySummaryTable),
    [historySummaryTable],
  );
  const normalizedHistoryPerCapitaTable = useMemo(
    () => normalizeHistoryRawTable(historyPerCapitaTable),
    [historyPerCapitaTable],
  );
  const latestHistoryRow = historySummaryRows.length > 0 ? historySummaryRows[historySummaryRows.length - 1] : null;
  const previousHistoryRow = historySummaryRows.length > 1 ? historySummaryRows[historySummaryRows.length - 2] : null;
  const teamRows = useMemo(
    () => (currentMonthData?.team_snapshot?.teams ?? []).filter((item) => (item.staff_count ?? 0) > 0),
    [currentMonthData],
  );

  const uploadMutation = useMutation({
    mutationFn: uploadPerformanceAnalysisFile,
    onSuccess: (record) => {
      setFile(null);
      setUploadModalOpen(false);
      setSelectedFileId(record.id);
      queryClient.setQueryData<PerformanceAnalysisFileRecord[]>(
        ['performance-analysis-files'],
        (previous = []) => [record, ...previous.filter((item) => item.id !== record.id)],
      );
      message.success(`导入完成，已保存 ${record.sheet_count} 个工作表`);
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      const msg = err.response?.data?.detail || err.message || '导入失败';
      message.error(msg);
    },
  });

  const fileList: UploadFile[] = file
    ? [{ uid: file.name, name: file.name, status: 'done' }]
    : [];

  const latestFile = dashboardQuery.data?.source_file ?? filesQuery.data?.[0] ?? null;
  const currentTrendOption = useMemo(() => buildCurrentTrendOption(currentRecords), [currentRecords]);
  const historyComparisonOption = useMemo(() => buildHistoryComparisonOption(historySummaryRows), [historySummaryRows]);
  const historyPerCapitaOption = useMemo(() => buildHistoryPerCapitaOption(historyPerCapitaRows), [historyPerCapitaRows]);
  const teamLoadOption = useMemo(() => buildTeamLoadOption(teamRows), [teamRows]);
  const teamDefectOption = useMemo(() => buildTeamDefectOption(teamRows), [teamRows]);
  const historySummaryTableColumns = useMemo(
    () => buildHistoryTableColumns(normalizedHistorySummaryTable.headers),
    [normalizedHistorySummaryTable],
  );
  const historySummaryTableData = useMemo(
    () => buildHistoryTableData(normalizedHistorySummaryTable.rows),
    [normalizedHistorySummaryTable],
  );
  const historyPerCapitaTableColumns = useMemo(
    () => buildHistoryTableColumns(normalizedHistoryPerCapitaTable.headers, 'perCapita'),
    [normalizedHistoryPerCapitaTable],
  );
  const historyPerCapitaTableData = useMemo(
    () => buildHistoryTableData(normalizedHistoryPerCapitaTable.rows),
    [normalizedHistoryPerCapitaTable],
  );
  const hasHistorySummaryRawTable = normalizedHistorySummaryTable.headers.length > 0;
  const hasHistoryPerCapitaRawTable = normalizedHistoryPerCapitaTable.headers.length > 0;
  const filterOptions = useMemo(() => {
    const businesses = dashboardQuery.data?.available_businesses ?? [];
    const currentBusinessOptions = businesses
      .map((business) => {
        const nextCurrentView = dashboardQuery.data?.businesses[business]?.current ?? null;
        const availableMonths = getAvailableCurrentMonths(nextCurrentView);

        if (availableMonths.length === 0) {
          return null;
        }

        return {
          value: business,
          label: business,
          children: availableMonths.map((item) => ({
            value: String(item.month),
            label: formatCurrentMonthLabel(nextCurrentView?.year, item.month_label),
          })),
        };
      })
      .filter((item): item is { value: PerformanceBusinessType; label: PerformanceBusinessType; children: Array<{ value: string; label: string }> } => item !== null);

    const historyBusinessOptions = businesses
      .filter((business) => hasHistoryViewData(dashboardQuery.data?.businesses[business]?.history))
      .map((business) => ({
        value: business,
        label: business,
      }));

    return [
      {
        value: 'current',
        label: '当年数据',
        children: currentBusinessOptions,
        disabled: currentBusinessOptions.length === 0,
      },
      {
        value: 'history',
        label: '历年数据',
        children: historyBusinessOptions,
        disabled: historyBusinessOptions.length === 0,
      },
    ];
  }, [dashboardQuery.data]);
  const filterValue = useMemo(() => {
    if (!selectedBusiness) {
      return [] as string[];
    }

    if (selectedScope === 'current' && selectedMonth !== null) {
      return [selectedScope, selectedBusiness, String(selectedMonth)];
    }

    return [selectedScope, selectedBusiness];
  }, [selectedBusiness, selectedMonth, selectedScope]);
  const handleFilterChange = (value: string[]) => {
    const [nextScope, nextBusiness, nextMonth] = value;
    if (nextScope !== 'current' && nextScope !== 'history') {
      return;
    }
    if (!isPerformanceBusinessType(nextBusiness)) {
      return;
    }

    setSelectedScope(nextScope);
    setSelectedBusiness(nextBusiness);

    if (nextScope === 'current') {
      const normalizedMonth = typeof nextMonth === 'number' ? nextMonth : Number(nextMonth);
      setSelectedMonth(Number.isFinite(normalizedMonth) ? normalizedMonth : getLatestAvailableMonth(dashboardQuery.data?.businesses[nextBusiness]?.current ?? null));
      return;
    }

    setSelectedMonth(null);
  };

  const historySummaryColumns: ColumnsType<PerformanceHistorySummaryRow> = [
    { title: '年份', dataIndex: 'year', key: 'year', width: 90 },
    { title: '同步任务均值', dataIndex: 'sync_tasks', key: 'sync_tasks', render: (value) => formatDecimal(value, 2) },
    { title: '同步+回归均值', dataIndex: 'total_tasks', key: 'total_tasks', render: (value) => formatDecimal(value, 2) },
    { title: '需求均值', dataIndex: 'demand_count', key: 'demand_count', render: (value) => formatDecimal(value, 2) },
    { title: '缺陷均值', dataIndex: 'defect_count', key: 'defect_count', render: (value) => formatDecimal(value, 2) },
    {
      title: '缺陷率',
      key: 'defect_rate',
      render: (_, record) => formatRate(getHistoryDefectRate(record), 2),
    },
    { title: '平均时效(天)', dataIndex: 'avg_cycle_days', key: 'avg_cycle_days', render: (value) => formatDecimal(value, 2) },
    { title: '设计案例均值', dataIndex: 'design_cases', key: 'design_cases', render: (value) => formatDecimal(value, 0) },
    { title: '执行案例均值', dataIndex: 'execution_cases', key: 'execution_cases', render: (value) => formatDecimal(value, 0) },
    { title: '功能人月投入', dataIndex: 'functional_manpower', key: 'functional_manpower', render: (value) => formatDecimal(value, 2) },
  ];

  const historyPerCapitaColumns: ColumnsType<PerformanceHistoryPerCapitaRow> = [
    { title: '年份', dataIndex: 'year', key: 'year', width: 90 },
    { title: '人均同步任务', dataIndex: 'per_capita_sync_tasks', key: 'per_capita_sync_tasks', render: (value) => formatFixedDecimal(value, 2) },
    { title: '人均同步+回归', dataIndex: 'per_capita_total_tasks', key: 'per_capita_total_tasks', render: (value) => formatFixedDecimal(value, 2) },
    { title: '人均需求数', dataIndex: 'per_capita_demand_count', key: 'per_capita_demand_count', render: (value) => formatFixedDecimal(value, 2) },
    { title: '人均缺陷数', dataIndex: 'per_capita_defect_count', key: 'per_capita_defect_count', render: (value) => formatFixedDecimal(value, 2) },
    { title: '缺陷率', dataIndex: 'defect_rate', key: 'defect_rate', render: (value) => formatRate(value, 2) },
    { title: '平均设计案例数', dataIndex: 'avg_design_cases', key: 'avg_design_cases', render: (value) => formatFixedDecimal(value, 2) },
    { title: '平均执行案例数', dataIndex: 'avg_execution_cases', key: 'avg_execution_cases', render: (value) => formatFixedDecimal(value, 2) },
  ];

  const teamColumns: ColumnsType<PerformanceTeamRow> = [
    { title: '团队', dataIndex: 'team_name', key: 'team_name', fixed: 'left', width: 120 },
    { title: '同步任务数', dataIndex: 'sync_tasks', key: 'sync_tasks', width: 110, render: (value) => formatInteger(value) },
    { title: '总需求数', dataIndex: 'demand_count', key: 'demand_count', width: 110, render: (value) => formatInteger(value) },
    { title: '人月数', dataIndex: 'staff_count', key: 'staff_count', width: 100, render: (value) => formatDecimal(value, 2) },
    { title: '人均任务', dataIndex: 'per_capita_task', key: 'per_capita_task', width: 110, render: (value) => formatDecimal(value, 2) },
    { title: '人均需求数', dataIndex: 'per_capita_demand', key: 'per_capita_demand', width: 110, render: (value) => formatDecimal(value, 2) },
    { title: '缺陷率', dataIndex: 'defect_rate', key: 'defect_rate', width: 110, render: (value) => formatRate(value, 2) },
    { title: '健康状态', dataIndex: 'defect_rate', key: 'health_state', width: 110, render: (value) => buildHealthTag(value) },
    { title: '平均设计案例数', dataIndex: 'avg_design_cases', key: 'avg_design_cases', width: 140, render: (value) => formatDecimal(value, 0) },
    { title: '平均执行案例数', dataIndex: 'avg_execution_cases', key: 'avg_execution_cases', width: 140, render: (value) => formatDecimal(value, 0) },
  ];

  if (filesQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }

  if ((filesQuery.data?.length ?? 0) === 0) {
    return (
      <div className="efficiency-board efficiency-board--empty">
        <Card variant="borderless" className="efficiency-empty-card">
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Title level={2} className="efficiency-empty-card__title">效能分析</Title>
              <Paragraph className="efficiency-empty-card__description">
                上传完整的寿险/健康险效能工作簿后，系统会按历年/当年、业务线与月份拆分数据，并自动识别约定的 8 张业务表。
              </Paragraph>
            </div>
            <Button type="primary" icon={<UploadOutlined />} size="large" onClick={() => setUploadModalOpen(true)}>
              上传工作簿
            </Button>
          </Space>
        </Card>

        <Modal
          title="上传效能分析工作簿"
          open={uploadModalOpen}
          onOk={() => file && uploadMutation.mutate(file)}
          onCancel={() => {
            setFile(null);
            setUploadModalOpen(false);
          }}
          okText="上传并解析"
          confirmLoading={uploadMutation.isPending}
        >
          <Dragger
            accept=".xlsx,.xls"
            maxCount={1}
            multiple={false}
            beforeUpload={(nextFile) => {
              setFile(nextFile);
              return false;
            }}
            onRemove={() => setFile(null)}
            fileList={fileList}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">拖拽工作簿到这里，或点击选择文件</p>
            <p className="ant-upload-hint">建议上传包含历年表和当前年 6 张业务表的完整工作簿</p>
          </Dragger>
        </Modal>
      </div>
    );
  }

  if (dashboardQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }

  if (dashboardQuery.isError) {
    return (
      <div className="efficiency-board">
        <Alert
          type="error"
          showIcon
          className="efficiency-board__alert"
          message="效能分析加载失败"
          description="当前工作簿解析失败，请检查表结构和命名规则后重新上传。"
        />
      </div>
    );
  }

  if (!dashboardQuery.data || !businessDashboard || !selectedBusiness) {
    return (
      <div className="efficiency-board">
        <Card variant="borderless" className="efficiency-empty-card">
          <Empty description="当前版本暂无可展示的效能分析数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      </div>
    );
  }

  const currentMonthLabel = formatCurrentMonthLabel(
    currentView?.year,
    currentView?.month_options.find((item) => item.month === selectedMonth)?.month_label,
  );

  return (
    <div className="efficiency-board">
      <section className="efficiency-toolbar">
        <div className="efficiency-toolbar__left">
          <div>
            <span className="efficiency-toolbar__eyebrow">质量看板</span>
            <Title level={2} className="efficiency-toolbar__title">效能分析</Title>
            <Paragraph className="efficiency-toolbar__description">
              看板按历年/当年、寿险/健康险、月份三层筛选展示数据。历年模式只看汇总，当年模式展示月度承接、对外指标和团队效能明细。
            </Paragraph>
          </div>
          <Space wrap>
            <Tag color="processing">
              {selectedScope === 'current'
                ? `当前年度：${currentView?.year ?? '--'}`
                : `最新历年：${historyView?.latest_year ? `${historyView.latest_year}年` : '--'}`}
            </Tag>
            <Tag>
              {selectedScope === 'current'
                ? `当前月份：${currentMonthLabel}`
                : `历年范围：${historyView?.available_years.length ? `${historyView.available_years[0]}-${historyView.available_years[historyView.available_years.length - 1]}` : '--'}`}
            </Tag>
            <Tag>识别工作表：{dashboardQuery.data.sheet_names.length} 个</Tag>
          </Space>
        </div>

        <div className="efficiency-toolbar__right">
          <div className="efficiency-toolbar__meta">
            <Text type="secondary">数据更新时间：{latestFile ? formatDateTime(latestFile.created_at) : '--'}</Text>
            <Text type="secondary">文件大小：{latestFile ? formatFileSize(latestFile.file_size) : '--'}</Text>
          </div>
          <div className="efficiency-toolbar__filters">
            <Cascader
              aria-label="级联筛选"
              data-testid="analysis-filter-cascader"
              allowClear={false}
              options={filterOptions}
              value={filterValue}
              placeholder="请选择数据范围"
              style={{ minWidth: 320 }}
              onChange={handleFilterChange}
            />
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
              导入新版数据
            </Button>
          </div>
        </div>
      </section>

      {selectedScope === 'history' ? (
        <>
          <section className="efficiency-kpi-grid">
            <MetricCard
              icon={<DashboardOutlined />}
              label="最新历年同步任务均值"
              value={formatDecimal(latestHistoryRow?.sync_tasks, 2)}
              delta={buildDeltaText(latestHistoryRow?.sync_tasks, previousHistoryRow?.sync_tasks)}
              tone="blue"
            />
            <MetricCard
              icon={<LineChartOutlined />}
              label="最新历年需求均值"
              value={formatDecimal(latestHistoryRow?.demand_count, 2)}
              delta={buildDeltaText(latestHistoryRow?.demand_count, previousHistoryRow?.demand_count)}
              tone="indigo"
            />
            <MetricCard
              icon={<RiseOutlined />}
              label="最新历年缺陷数"
              value={formatDecimal(latestHistoryRow?.defect_count, 2)}
              delta={buildDeltaText(latestHistoryRow?.defect_count, previousHistoryRow?.defect_count)}
              tone="green"
            />
            <MetricCard
              icon={<ClockCircleOutlined />}
              label="最新历年平均时效"
              value={latestHistoryRow?.avg_cycle_days === null || latestHistoryRow?.avg_cycle_days === undefined ? '--' : `${formatDecimal(latestHistoryRow.avg_cycle_days, 2)} 天`}
              delta={buildDeltaText(latestHistoryRow?.avg_cycle_days, previousHistoryRow?.avg_cycle_days, 'absolute')}
              tone="orange"
            />
          </section>

          <section className="efficiency-chart-grid efficiency-chart-grid--history">
            <PanelCard
              title="历年任务规模对比"
              subtitle={`${selectedBusiness} 历年同步+回归任务均值对比`}
            >
              {historySummaryRows.length > 0 ? (
                <ChartSurface option={historyComparisonOption} height={320} refreshKey={`${selectedBusiness}-history-summary`} />
              ) : (
                <div className="efficiency-empty-state">
                  <Empty description="当前业务线暂无历年汇总数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </PanelCard>

            <PanelCard
              title="历年人均趋势"
              subtitle={`${selectedBusiness} 历年人均任务与缺陷率变化`}
            >
              {historyPerCapitaRows.length > 0 ? (
                <ChartSurface option={historyPerCapitaOption} height={320} refreshKey={`${selectedBusiness}-history-per-capita`} />
              ) : (
                <div className="efficiency-empty-state">
                  <Empty description="当前业务线暂无历年人均数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </PanelCard>
          </section>

          <section className="efficiency-table-section">
            <PanelCard
              title="历年汇总明细"
              subtitle="仅展示历年汇总和人均口径，不展示团队、自动化和精准测试模块"
              className="efficiency-panel--table"
            >
              {hasHistorySummaryRawTable ? (
                <Table<HistoryTableRecord>
                  rowKey="key"
                  dataSource={historySummaryTableData}
                  columns={historySummaryTableColumns}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  className="efficiency-table"
                />
              ) : historySummaryRows.length > 0 ? (
                <Table<PerformanceHistorySummaryRow>
                  rowKey="year"
                  dataSource={historySummaryRows}
                  columns={historySummaryColumns}
                  pagination={false}
                  scroll={{ x: 1280 }}
                  className="efficiency-table"
                />
              ) : (
                <div className="efficiency-empty-state">
                  <Empty description="当前业务线暂无历年汇总数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </PanelCard>

            <PanelCard
              title="历年人均指标"
              subtitle="历年表中的年度人均任务与缺陷率明细"
              className="efficiency-panel--table"
            >
              {hasHistoryPerCapitaRawTable ? (
                <Table<HistoryTableRecord>
                  rowKey="key"
                  dataSource={historyPerCapitaTableData}
                  columns={historyPerCapitaTableColumns}
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                  className="efficiency-table"
                />
              ) : historyPerCapitaRows.length > 0 ? (
                <Table<PerformanceHistoryPerCapitaRow>
                  rowKey="year"
                  dataSource={historyPerCapitaRows}
                  columns={historyPerCapitaColumns}
                  pagination={false}
                  scroll={{ x: 1120 }}
                  className="efficiency-table"
                />
              ) : (
                <div className="efficiency-empty-state">
                  <Empty description="当前业务线暂无历年人均数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </PanelCard>
          </section>
        </>
      ) : (
        <>
          <section className="efficiency-kpi-grid">
            <MetricCard
              icon={<DashboardOutlined />}
              label="所选月同步任务数"
              value={formatInteger(currentMetric?.sync_tasks)}
              delta={buildDeltaText(currentMetric?.sync_tasks, previousCurrentMetric?.sync_tasks)}
              tone="blue"
            />
            <MetricCard
              icon={<LineChartOutlined />}
              label="所选月需求数"
              value={formatInteger(currentMetric?.demand_count)}
              delta={buildDeltaText(currentMetric?.demand_count, previousCurrentMetric?.demand_count)}
              tone="indigo"
            />
            <MetricCard
              icon={<RiseOutlined />}
              label="所选月测试缺陷数"
              value={formatInteger(currentMetric?.defect_count)}
              delta={buildDeltaText(currentMetric?.defect_count, previousCurrentMetric?.defect_count)}
              tone="green"
            />
            <MetricCard
              icon={<ClockCircleOutlined />}
              label="所选月平均时效"
              value={currentMetric?.avg_cycle_days === null || currentMetric?.avg_cycle_days === undefined ? '--' : `${formatDecimal(currentMetric.avg_cycle_days, 2)} 天`}
              delta={buildDeltaText(currentMetric?.avg_cycle_days, previousCurrentMetric?.avg_cycle_days, 'absolute')}
              tone="orange"
            />
          </section>

          <section className="efficiency-chart-grid">
            <PanelCard
              title="当年趋势总览"
              subtitle={`${selectedBusiness}${currentView?.year ?? ''}年 1-12 月趋势视图，无数据月份保留但不计入曲线`}
              className="efficiency-panel--wide"
            >
              <ChartSurface option={currentTrendOption} height={320} refreshKey={`${selectedBusiness}-${currentView?.year ?? 'current'}-trend`} />
            </PanelCard>

            <PanelCard
              title="团队人均任务负载 Top6"
              subtitle={currentMonthData?.team_snapshot ? `${currentMonthData.team_snapshot.year}年${currentMonthData.team_snapshot.month_label} 团队人均任务对比` : '当前月份暂无团队快照'}
            >
              {teamRows.length > 0 ? (
                <ChartSurface option={teamLoadOption} height={300} refreshKey={`${selectedBusiness}-${selectedMonth}-team-load`} />
              ) : (
                <div className="efficiency-empty-state">
                  <Empty description="当前月份暂无团队快照" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </PanelCard>

            <PanelCard
              title="团队任务密度与缺陷率"
              subtitle="缺陷率统一按百分比展示"
            >
              {teamRows.length > 0 ? (
                <ChartSurface option={teamDefectOption} height={300} refreshKey={`${selectedBusiness}-${selectedMonth}-team-defect`} />
              ) : (
                <div className="efficiency-empty-state">
                  <Empty description="当前月份暂无团队快照" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </PanelCard>
          </section>

          <section className="efficiency-table-section">
            <PanelCard
              title="团队健康明细"
              subtitle={currentMonthData?.team_snapshot ? `${currentMonthData.team_snapshot.year}年${currentMonthData.team_snapshot.month_label} 团队关键指标明细` : '当前月份暂无团队明细'}
              extra={currentMonthData?.team_snapshot ? <Tag>{teamRows.length} 个团队</Tag> : null}
              className="efficiency-panel--table"
            >
              {teamRows.length > 0 ? (
                <Table<PerformanceTeamRow>
                  rowKey="team_name"
                  dataSource={teamRows}
                  columns={teamColumns}
                  pagination={false}
                  scroll={{ x: 1180 }}
                  className="efficiency-table"
                />
              ) : (
                <div className="efficiency-empty-state">
                  <Empty description="当前月份暂无团队明细" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                </div>
              )}
            </PanelCard>
          </section>
        </>
      )}

      <Modal
        title="上传效能分析工作簿"
        open={uploadModalOpen}
        onOk={() => file && uploadMutation.mutate(file)}
        onCancel={() => {
          setFile(null);
          setUploadModalOpen(false);
        }}
        okText="上传并解析"
        confirmLoading={uploadMutation.isPending}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="导入说明"
            description="建议上传完整工作簿。系统会按历年 2 张表和当前年 6 张业务表构建看板，其余工作表不会参与计算。"
          />
          <Dragger
            accept=".xlsx,.xls"
            maxCount={1}
            multiple={false}
            beforeUpload={(nextFile) => {
              setFile(nextFile);
              return false;
            }}
            onRemove={() => setFile(null)}
            fileList={fileList}
            style={{ background: 'rgba(246, 248, 252, 0.9)' }}
          >
            <p className="ant-upload-drag-icon">
              <FileExcelOutlined style={{ color: '#5B7CFF' }} />
            </p>
            <p className="ant-upload-text">拖拽文件到这里，或点击选择工作簿</p>
            <p className="ant-upload-hint">支持 `.xlsx / .xls`，导入后会自动切换到最新版本</p>
          </Dragger>
          <Paragraph style={{ marginBottom: 0 }}>
            {file ? `当前文件：${file.name}` : '尚未选择文件'}
          </Paragraph>
        </Space>
      </Modal>
    </div>
  );
};

export default PerformanceAnalysisPage;

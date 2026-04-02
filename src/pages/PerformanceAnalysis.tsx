import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Segmented,
  Select,
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
import type { EChartsOption } from 'echarts';
import ChartSurface from '../components/Charts/ChartSurface';
import {
  getPerformanceAnalysis,
  listPerformanceAnalysisFiles,
  uploadPerformanceAnalysisFile,
} from '../utils/api';
import type {
  PerformanceAnalysisDashboard,
  PerformanceAnalysisFileRecord,
  PerformanceAnnualBenchmark,
  PerformanceBusinessDashboard,
  PerformanceBusinessType,
  PerformanceMetricPoint,
  PerformanceTeamRow,
  PerformanceTeamSnapshot,
} from '../types';

const { Dragger } = Upload;
const { Paragraph, Text, Title } = Typography;

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

function formatRate(value: number | null | undefined, digits: number = 2): string {
  if (value === null || value === undefined) {
    return '--';
  }
  return `${(value * 100).toFixed(digits)}%`;
}

function extractChartNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const numericValue = extractChartNumber(value[index]);
      if (numericValue !== null) {
        return numericValue;
      }
    }
  }

  return null;
}

function buildDeltaText(current: number | null | undefined, previous: number | null | undefined, mode: 'percent' | 'absolute' = 'percent'): string {
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

function getOverallLoad(metric: PerformanceMetricPoint | null | undefined): number | null {
  if (!metric?.total_tasks || !metric.functional_manpower) {
    return null;
  }
  if (metric.functional_manpower === 0) {
    return null;
  }
  return metric.total_tasks / metric.functional_manpower;
}

function getPreviousMetric(allMetrics: PerformanceMetricPoint[], latestMetric: PerformanceMetricPoint | null): PerformanceMetricPoint | null {
  if (!latestMetric) {
    return null;
  }
  const index = allMetrics.findIndex((item) => item.year === latestMetric.year && item.month === latestMetric.month);
  if (index <= 0) {
    return null;
  }
  return allMetrics[index - 1];
}

function buildTrendOption(records: PerformanceMetricPoint[]): EChartsOption {
  const monthAxis = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const metricMap = new Map(records.map((item) => [item.month, item]));

  return {
    color: ['#8AA6FF', '#4F7CFF', '#FF8E66'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
      valueFormatter: (value) => `${Array.isArray(value) ? value.join(' / ') : value ?? '--'}`,
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
        areaStyle: {
          color: 'rgba(79, 124, 255, 0.12)',
        },
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

function buildAnnualComparisonOption(benchmarks: PerformanceAnnualBenchmark[]): EChartsOption {
  const years = benchmarks.map((item) => `${item.year}年`);
  return {
    color: ['#6F8DF7'],
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
      data: years,
      axisTick: { show: false },
      axisLine: { show: false },
      axisLabel: { color: CHART_AXIS_COLOR },
    },
    series: [
      {
        name: '平均总任务量',
        type: 'bar',
        barWidth: 16,
        data: benchmarks.map((item) => item.avg_total_tasks),
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

function buildRadarOption(team: PerformanceTeamRow | null, teamRows: PerformanceTeamRow[]): EChartsOption | null {
  if (!team) {
    return null;
  }

  const indicators = [
    { key: 'per_capita_task', name: '人均任务' },
    { key: 'per_capita_demand', name: '人均需求' },
    { key: 'per_capita_bug', name: '人均缺陷' },
    { key: 'avg_design_cases', name: '平均设计案例' },
    { key: 'avg_execution_cases', name: '平均执行案例' },
    { key: 'defect_rate', name: '稳定性' },
  ] as const;

  const values = indicators.map(({ key }) => {
    const max = Math.max(...teamRows.map((item) => Number(item[key] ?? 0)), 0);
    const current = Number(team[key] ?? 0);
    if (max <= 0) {
      return 0;
    }
    if (key === 'defect_rate') {
      return Number((((max - current) / max) * 100).toFixed(2));
    }
    return Number(((current / max) * 100).toFixed(2));
  });

  return {
    tooltip: {
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    radar: {
      radius: '62%',
      splitNumber: 4,
      axisName: { color: '#475467' },
      splitArea: {
        areaStyle: {
          color: ['rgba(255,255,255,0.4)', 'rgba(235, 241, 255, 0.55)'],
        },
      },
      splitLine: { lineStyle: { color: 'rgba(124, 155, 255, 0.22)' } },
      axisLine: { lineStyle: { color: 'rgba(124, 155, 255, 0.24)' } },
      indicator: indicators.map((item) => ({ name: item.name, max: 100 })),
    },
    series: [
      {
        type: 'radar',
        data: [
          {
            value: values,
            name: team.team_name,
            areaStyle: { color: 'rgba(111, 141, 247, 0.24)' },
            lineStyle: { color: '#6F8DF7', width: 2.5 },
            itemStyle: { color: '#6F8DF7' },
          },
        ],
      },
    ],
  };
}

function buildDensityOption(teams: PerformanceTeamRow[]): EChartsOption {
  const rows = [...teams]
    .filter((item) => item.staff_count && item.staff_count > 0)
    .sort((left, right) => (right.per_capita_task ?? 0) - (left.per_capita_task ?? 0))
    .slice(0, 6);

  return {
    color: ['#A9B8D0', '#FF7F7F'],
    tooltip: {
      trigger: 'axis',
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    legend: {
      bottom: 0,
      textStyle: { color: CHART_AXIS_COLOR },
    },
    grid: {
      top: 24,
      right: 18,
      bottom: 48,
      left: 38,
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
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const filesQuery = useQuery({
    queryKey: ['performance-analysis-files'],
    queryFn: listPerformanceAnalysisFiles,
    staleTime: 30_000,
  });

  useEffect(() => {
    const latest = filesQuery.data?.[0] ?? null;
    if (!latest) {
      if (selectedFileId !== null) {
        setSelectedFileId(null);
      }
      return;
    }

    if (selectedFileId !== null && filesQuery.data?.some((item) => item.id === selectedFileId)) {
      return;
    }

    setSelectedFileId(latest.id);
  }, [filesQuery.data, selectedFileId]);

  const dashboardQuery = useQuery<PerformanceAnalysisDashboard>({
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
      setSelectedBusiness(businesses[0]);
    }
  }, [dashboardQuery.data, selectedBusiness]);

  const businessDashboard: PerformanceBusinessDashboard | null = useMemo(() => {
    if (!dashboardQuery.data || !selectedBusiness) {
      return null;
    }
    return dashboardQuery.data.businesses[selectedBusiness];
  }, [dashboardQuery.data, selectedBusiness]);

  useEffect(() => {
    const years = businessDashboard?.available_years ?? [];
    if (years.length === 0) {
      setSelectedYear(null);
      return;
    }
    if (!selectedYear || !years.includes(selectedYear)) {
      setSelectedYear(years[years.length - 1]);
    }
  }, [businessDashboard, selectedYear]);

  const yearMetrics = useMemo(
    () => (businessDashboard?.monthly_metrics ?? []).filter((item) => item.year === selectedYear),
    [businessDashboard, selectedYear],
  );

  const latestMetric = yearMetrics.length > 0 ? yearMetrics[yearMetrics.length - 1] : null;
  const previousMetric = getPreviousMetric(businessDashboard?.monthly_metrics ?? [], latestMetric);

  const teamSnapshot = useMemo<PerformanceTeamSnapshot | null>(() => {
    const snapshots = businessDashboard?.team_snapshots ?? [];
    const sameYear = snapshots.filter((item) => item.year === selectedYear);
    if (sameYear.length === 0) {
      return null;
    }
    return sameYear[sameYear.length - 1];
  }, [businessDashboard, selectedYear]);

  const teamRows = useMemo(
    () => (teamSnapshot?.teams ?? []).filter((item) => (item.staff_count ?? 0) > 0),
    [teamSnapshot],
  );

  const spotlightTeam = useMemo(
    () => [...teamRows].sort((left, right) => (right.per_capita_task ?? 0) - (left.per_capita_task ?? 0))[0] ?? null,
    [teamRows],
  );

  const annualBenchmarks = useMemo(
    () => (businessDashboard?.annual_benchmarks ?? []).filter((item) => item.year <= (selectedYear ?? item.year)),
    [businessDashboard, selectedYear],
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

  const latestFile = filesQuery.data?.find((item) => item.id === selectedFileId) ?? filesQuery.data?.[0] ?? null;
  const trendOption = useMemo(() => buildTrendOption(yearMetrics), [yearMetrics]);
  const annualOption = useMemo(() => buildAnnualComparisonOption(annualBenchmarks), [annualBenchmarks]);
  const teamLoadOption = useMemo(() => buildTeamLoadOption(teamRows), [teamRows]);
  const radarOption = useMemo(() => buildRadarOption(spotlightTeam, teamRows), [spotlightTeam, teamRows]);
  const densityOption = useMemo(() => buildDensityOption(teamRows), [teamRows]);

  const teamColumns: ColumnsType<PerformanceTeamRow> = [
    {
      title: '团队',
      dataIndex: 'team_name',
      key: 'team_name',
      fixed: 'left',
      width: 120,
    },
    {
      title: '同步任务数',
      dataIndex: 'sync_tasks',
      key: 'sync_tasks',
      width: 110,
      render: (value: number | null) => formatInteger(value),
    },
    {
      title: '总需求数',
      dataIndex: 'demand_count',
      key: 'demand_count',
      width: 110,
      render: (value: number | null) => formatInteger(value),
    },
    {
      title: '人月数',
      dataIndex: 'staff_count',
      key: 'staff_count',
      width: 100,
      render: (value: number | null) => formatDecimal(value, 2),
    },
    {
      title: '人均任务',
      dataIndex: 'per_capita_task',
      key: 'per_capita_task',
      width: 110,
      render: (value: number | null) => formatDecimal(value, 2),
    },
    {
      title: '人均需求',
      dataIndex: 'per_capita_demand',
      key: 'per_capita_demand',
      width: 110,
      render: (value: number | null) => formatDecimal(value, 2),
    },
    {
      title: '缺陷率',
      dataIndex: 'defect_rate',
      key: 'defect_rate',
      width: 110,
      render: (value: number | null) => formatRate(value, 2),
    },
    {
      title: '健康状态',
      dataIndex: 'defect_rate',
      key: 'health_state',
      width: 110,
      render: (value: number | null) => buildHealthTag(value),
    },
    {
      title: '平均设计案例数',
      dataIndex: 'avg_design_cases',
      key: 'avg_design_cases',
      width: 140,
      render: (value: number | null) => formatDecimal(value, 0),
    },
    {
      title: '平均执行案例数',
      dataIndex: 'avg_execution_cases',
      key: 'avg_execution_cases',
      width: 140,
      render: (value: number | null) => formatDecimal(value, 0),
    },
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
                上传寿险/健康险效能分析工作簿后，系统会自动提取月度汇总、对外数据和团队数据，生成质量看板中的效能分析页。
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
            <p className="ant-upload-hint">支持 `.xlsx / .xls`，建议直接上传完整月度统计工作簿</p>
          </Dragger>
        </Modal>
      </div>
    );
  }

  if (dashboardQuery.isLoading || !dashboardQuery.data || !businessDashboard || !selectedBusiness || !selectedYear) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }

  return (
    <div className="efficiency-board">
      <section className="efficiency-toolbar">
        <div className="efficiency-toolbar__left">
          <div>
            <span className="efficiency-toolbar__eyebrow">质量看板</span>
            <Title level={2} className="efficiency-toolbar__title">效能分析</Title>
            <Paragraph className="efficiency-toolbar__description">
              围绕同步任务、需求规模、缺陷率、团队负载和年度趋势，持续追踪寿险与健康险测试承接效能。
            </Paragraph>
          </div>
          <Space wrap>
            <Tag color="processing">最新周期：{latestMetric ? `${latestMetric.year}年${latestMetric.month_label}` : '待导入'}</Tag>
            <Tag>团队快照：{teamSnapshot ? `${teamSnapshot.year}年${teamSnapshot.month_label}` : '暂无'}</Tag>
            <Tag>已识别工作表：{dashboardQuery.data.sheet_names.length} 个</Tag>
          </Space>
        </div>

        <div className="efficiency-toolbar__right">
          <div className="efficiency-toolbar__meta">
            <Text type="secondary">数据更新时间：{latestFile ? formatDateTime(latestFile.created_at) : '--'}</Text>
            <Text type="secondary">文件大小：{latestFile ? formatFileSize(latestFile.file_size) : '--'}</Text>
          </div>
          <div className="efficiency-toolbar__filters">
            <Segmented<PerformanceBusinessType>
              options={dashboardQuery.data.available_businesses}
              value={selectedBusiness}
              onChange={(value) => setSelectedBusiness(value)}
            />
            <Select
              value={selectedYear}
              style={{ width: 120 }}
              options={businessDashboard.available_years.map((year) => ({
                value: year,
                label: `${year}年`,
              }))}
              onChange={(value) => setSelectedYear(value)}
            />
            <Select
              value={selectedFileId ?? undefined}
              style={{ width: 260 }}
              options={(filesQuery.data ?? []).map((item) => ({
                value: item.id,
                label: `${item.file_name} · ${formatDateTime(item.created_at)}`,
              }))}
              onChange={(value) => setSelectedFileId(value)}
            />
            <Button type="primary" icon={<UploadOutlined />} onClick={() => setUploadModalOpen(true)}>
              导入新版数据
            </Button>
          </div>
        </div>
      </section>

      {dashboardQuery.isError ? (
        <Alert
          type="error"
          showIcon
          className="efficiency-board__alert"
          message="效能分析加载失败"
          description="当前工作簿解析失败，请检查格式后重新上传。"
        />
      ) : null}

      <section className="efficiency-kpi-grid">
        <MetricCard
          icon={<DashboardOutlined />}
          label="当期同步任务"
          value={formatInteger(latestMetric?.sync_tasks)}
          delta={buildDeltaText(latestMetric?.sync_tasks, previousMetric?.sync_tasks)}
          tone="blue"
        />
        <MetricCard
          icon={<LineChartOutlined />}
          label="当期需求规模"
          value={formatInteger(latestMetric?.demand_count)}
          delta={buildDeltaText(latestMetric?.demand_count, previousMetric?.demand_count)}
          tone="indigo"
        />
        <MetricCard
          icon={<RiseOutlined />}
          label="人均任务负载"
          value={formatDecimal(getOverallLoad(latestMetric), 2)}
          delta={buildDeltaText(getOverallLoad(latestMetric), getOverallLoad(previousMetric), 'percent')}
          tone="green"
        />
        <MetricCard
          icon={<ClockCircleOutlined />}
          label="平均处理时效"
          value={latestMetric?.avg_cycle_days === null || latestMetric?.avg_cycle_days === undefined ? '--' : `${formatDecimal(latestMetric.avg_cycle_days, 2)} 天`}
          delta={buildDeltaText(latestMetric?.avg_cycle_days, previousMetric?.avg_cycle_days, 'absolute')}
          tone="orange"
        />
      </section>

      <section className="efficiency-chart-grid">
        <PanelCard
          title="整体承接趋势"
          subtitle={`${selectedBusiness}${selectedYear}年各月同步任务、需求规模与缺陷率波动`}
          className="efficiency-panel--wide"
        >
          <ChartSurface option={trendOption} height={320} refreshKey={`${selectedBusiness}-${selectedYear}-trend`} />
        </PanelCard>

        <PanelCard
          title="历年平均任务量"
          subtitle={`${selectedBusiness} 2023-2026 年月均总任务量对比`}
        >
          <ChartSurface option={annualOption} height={320} refreshKey={`${selectedBusiness}-${selectedYear}-annual`} />
        </PanelCard>

        <PanelCard
          title="团队效能画像"
          subtitle={spotlightTeam ? `聚焦 ${spotlightTeam.team_name} 的负载、需求、缺陷与案例产出` : '当前年份暂无团队快照'}
          extra={spotlightTeam ? <Tag color="processing">{spotlightTeam.team_name}</Tag> : null}
        >
          {radarOption ? (
            <ChartSurface option={radarOption} height={300} refreshKey={`${selectedBusiness}-${selectedYear}-radar`} />
          ) : (
            <div className="efficiency-empty-state">
              <Empty description="当前年份暂无团队维度数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="团队任务密度与缺陷率"
          subtitle={teamSnapshot ? `${teamSnapshot.year}年${teamSnapshot.month_label} 最新团队快照` : '当前年份暂无团队快照'}
          extra={teamSnapshot ? <Tag color="blue">{teamSnapshot.month_label}</Tag> : null}
        >
          {teamRows.length > 0 ? (
            <ChartSurface option={densityOption} height={300} refreshKey={`${selectedBusiness}-${selectedYear}-density`} />
          ) : (
            <div className="efficiency-empty-state">
              <Empty description="当前年份暂无团队维度数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </PanelCard>

        <PanelCard
          title="团队人均任务负载 Top6"
          subtitle={teamSnapshot ? `${teamSnapshot.year}年${teamSnapshot.month_label} 团队人均任务对比` : '当前年份暂无团队快照'}
          className="efficiency-panel--wide"
        >
          {teamRows.length > 0 ? (
            <ChartSurface option={teamLoadOption} height={280} refreshKey={`${selectedBusiness}-${selectedYear}-load`} />
          ) : (
            <div className="efficiency-empty-state">
              <Empty description="当前年份暂无团队维度数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </PanelCard>
      </section>

      <section className="efficiency-table-section">
        <PanelCard
          title="核心团队测试健康度"
          subtitle={teamSnapshot ? `${teamSnapshot.year}年${teamSnapshot.month_label} 团队关键指标明细` : '当前年份暂无团队明细'}
          extra={teamSnapshot ? <Tag>{teamRows.length} 个团队</Tag> : null}
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
              <Empty description="当前年份暂无团队明细" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </PanelCard>
      </section>

      <Modal
        title="导入效能分析工作簿"
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
            description="建议上传完整的寿险/健康险效能分析工作簿，系统会自动提取月度汇总、对外数据和团队数据，并保留版本记录。"
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
            <p className="ant-upload-hint">支持 `.xlsx / .xls`，上传后会自动覆盖当前分析视图到最新版本</p>
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

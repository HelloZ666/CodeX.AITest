import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Card,
  Empty,
  Select,
} from 'antd';
import {
  BarChartOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import ImportPreviewTable from '../components/AnalysisPreview/ImportPreviewTable';
import ChartSurface from '../components/Charts/ChartSurface';
import GlassDashboardShowcase from '../components/Layout/GlassDashboardShowcase';
import InsightMetricCard from '../components/Layout/InsightMetricCard';
import {
  getTestIssueAnalysis,
  listProjects,
  listTestIssueFiles,
} from '../utils/api';
import type {
  DefectInsightData,
  IssueInsightChartItem,
  Project,
} from '../types';

const CHART_COLORS = ['#7F9FE0', '#98B2E6', '#B8CAE9', '#6B84BF', '#C8D2E0', '#8A94A5'];
const CHART_TOOLTIP_BG = 'rgba(44, 54, 70, 0.94)';
const CHART_AXIS_COLOR = '#7B8798';
const CHART_LABEL_COLOR = '#475467';
const CHART_GRID_COLOR = 'rgba(123, 135, 152, 0.18)';
const CHART_BACKGROUND_BAR = 'rgba(194, 203, 216, 0.24)';
const CHART_PIE_BORDER = 'rgba(245, 247, 250, 0.92)';

function shortenLabel(value: string, limit: number = 10) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function buildBarOption(items: IssueInsightChartItem[], color: string) {
  return {
    animationDuration: 760,
    animationDurationUpdate: 420,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicInOut',
    color: [color],
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const item = params[0];
        return `${item.name}<br/>数量：${item.value}`;
      },
    },
    grid: {
      top: 24,
      right: 16,
      bottom: items.length > 5 ? 72 : 36,
      left: 36,
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      data: items.map((item) => item.name),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: CHART_GRID_COLOR } },
      axisLabel: {
        interval: 0,
        rotate: items.length > 4 ? 20 : 0,
        formatter: (value: string) => shortenLabel(value, 8),
        color: CHART_AXIS_COLOR,
      },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: CHART_AXIS_COLOR },
      splitLine: { lineStyle: { color: CHART_GRID_COLOR, type: 'dashed' as const } },
    },
    series: [
      {
        type: 'bar' as const,
        data: items.map((item) => item.count),
        barMaxWidth: 34,
        universalTransition: true,
        showBackground: true,
        backgroundStyle: {
          color: CHART_BACKGROUND_BAR,
        },
        itemStyle: {
          color,
          borderRadius: [12, 12, 4, 4],
        },
        label: {
          show: true,
          position: 'top' as const,
          color: CHART_LABEL_COLOR,
          fontWeight: 600,
        },
      },
    ],
  };
}

function buildPieOption(items: IssueInsightChartItem[]) {
  return {
    animationDuration: 760,
    animationDurationUpdate: 420,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicInOut',
    tooltip: {
      trigger: 'item' as const,
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
      type: 'scroll' as const,
      textStyle: { color: CHART_AXIS_COLOR },
      formatter: (value: string) => shortenLabel(value, 10),
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['42%', '72%'],
        center: ['50%', '45%'],
        label: {
          color: CHART_LABEL_COLOR,
          formatter: (params: { name: string; percent: number }) => `${shortenLabel(params.name, 8)}\n${params.percent}%`,
        },
        itemStyle: {
          borderRadius: 14,
          borderColor: CHART_PIE_BORDER,
          borderWidth: 3,
        },
        universalTransition: true,
        data: items.map((item, index) => ({
          value: item.count,
          name: item.name,
          itemStyle: { color: CHART_COLORS[index % CHART_COLORS.length] },
        })),
      },
    ],
  };
}

function parseDateTime(value: string): Date | null {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTimestamp(value: string): number {
  return parseDateTime(value)?.getTime() ?? 0;
}

interface ChartCardProps {
  title: string;
  option: object | null;
  height?: number;
  caption?: string;
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  option,
  height = 320,
  caption,
}) => (
  <Card
    title={title}
    extra={caption ? <span className="insight-panel__meta">{caption}</span> : null}
    variant="borderless"
    className="insight-panel insight-panel--chart"
  >
    {option ? (
      <ChartSurface option={option as EChartsOption} height={height} refreshKey={JSON.stringify(option)} />
    ) : (
      <div className="dashboard-empty">
        <Empty description="暂无图表数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )}
  </Card>
);

interface InsightSectionHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
}

const InsightSectionHeader: React.FC<InsightSectionHeaderProps> = ({
  eyebrow,
  title,
  description,
}) => (
  <div className="insight-section-header">
    <span className="insight-section-header__eyebrow">{eyebrow}</span>
    <h2 className="insight-section-header__title">{title}</h2>
    <p className="insight-section-header__description">{description}</p>
  </div>
);

const DefectAnalysisPage: React.FC = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  useEffect(() => {
    const projects = projectsQuery.data ?? [];
    if (projects.length === 0) {
      if (selectedProjectId !== null) {
        setSelectedProjectId(null);
      }
      return;
    }

    if (selectedProjectId !== null && projects.some((item) => item.id === selectedProjectId)) {
      return;
    }

    setSelectedProjectId(projects[0].id);
  }, [projectsQuery.data, selectedProjectId]);

  const selectedProject: Project | null = useMemo(
    () => (projectsQuery.data ?? []).find((item) => item.id === selectedProjectId) ?? null,
    [projectsQuery.data, selectedProjectId],
  );

  const testIssueFilesQuery = useQuery({
    queryKey: ['test-issue-files', selectedProjectId],
    queryFn: () => listTestIssueFiles(selectedProjectId as number),
    enabled: selectedProjectId !== null,
    staleTime: 30_000,
  });

  const projectFiles = useMemo(
    () => [...(testIssueFilesQuery.data ?? [])].sort((left, right) => {
      const timestampDiff = getTimestamp(right.created_at) - getTimestamp(left.created_at);
      if (timestampDiff !== 0) {
        return timestampDiff;
      }
      return right.id - left.id;
    }),
    [testIssueFilesQuery.data],
  );

  const selectedFile = useMemo(
    () => projectFiles[0] ?? null,
    [projectFiles],
  );
  const selectedFileId = selectedFile?.id ?? null;

  const analysisQuery = useQuery({
    queryKey: ['test-issue-analysis', selectedFileId],
    queryFn: () => getTestIssueAnalysis(selectedFileId as number),
    enabled: selectedFileId !== null,
    staleTime: 30_000,
  });

  const result: DefectInsightData | null = analysisQuery.data?.success && analysisQuery.data.data
    ? analysisQuery.data.data
    : null;

  const currentTimeLabel = useMemo(
    () => new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()),
    [],
  );

  const fileCount = projectFiles.length;
  const severityRatioPercent = Math.round((result?.overview.top_severity?.ratio ?? 0) * 100);

  return (
    <div className="insight-board insight-board--defect">
      <section className="insight-board__first-screen">
        <GlassDashboardShowcase
          className="glass-dashboard-showcase--defect-compact"
          toolbar={(
            <div className="insight-project-selector">
              <span className="insight-selector-block__label">项目选择</span>
              <Select
                showSearch
                placeholder="请选择项目名称"
                value={selectedProjectId ?? undefined}
                className="insight-selector insight-selector--hero"
                optionFilterProp="label"
                options={(projectsQuery.data ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                onChange={(value) => {
                  setSelectedProjectId(value);
                }}
              />
            </div>
          )}
          title="测试问题分析"
          chips={[
            { label: selectedProject ? `当前项目：${selectedProject.name}` : '等待选择项目', tone: 'accent' },
            { label: selectedFile ? `当前文件：${selectedFile.file_name}` : '等待选择测试问题文件' },
            { label: result ? `缺陷记录：${result.overview.total_records} 条` : `已绑定 ${fileCount} 份问题文件`, tone: 'slate' },
          ]}
          mainExtra={result ? (
            <div className="insight-metric-grid insight-metric-grid--hero">
              <InsightMetricCard
                icon={<BarChartOutlined />}
                label="缺陷记录数"
                value={result.overview.total_records}
                detail="当前文件覆盖的缺陷记录总量"
                className="insight-metric-card--compact"
              />
              <InsightMetricCard
                icon={<SafetyCertificateOutlined />}
                label="严重度分类数"
                value={result.overview.severity_count}
                detail="用于观察严重等级分层"
                tone="ice"
                className="insight-metric-card--compact"
              />
              <InsightMetricCard
                icon={<RocketOutlined />}
                label="缺陷来源数"
                value={result.overview.source_count}
                detail="追踪问题来源分布"
                tone="slate"
                className="insight-metric-card--compact"
              />
              <InsightMetricCard
                icon={<TagsOutlined />}
                label="缺陷原因数"
                value={result.overview.reason_count}
                detail="原因分类覆盖范围"
                className="insight-metric-card--compact"
              />
            </div>
          ) : null}
          spotlightEyebrow="质量热区"
          spotlightTitle={currentTimeLabel}
          spotlightValue={severityRatioPercent}
          spotlightUnit="%"
          spotlightCaption="Top 严重度占比"
          spotlightProgress={result?.overview.top_severity?.ratio ?? 0}
          spotlightStats={[
            {
              label: '高频严重度',
              value: result?.overview.top_severity?.name ?? '待分析',
              note: result?.overview.top_severity ? `${Math.round(result.overview.top_severity.ratio * 100)}% 缺陷聚集` : '选择项目后自动生成',
            },
            {
              label: '高频来源',
              value: result?.overview.top_source?.name ?? '待分析',
              note: result?.overview.top_source ? `${Math.round(result.overview.top_source.ratio * 100)}% 来源热度` : '来源分布将在此处展示',
            },
          ]}
        />
      </section>

      {projectsQuery.isLoading ? (
        <Card variant="borderless" loading className="insight-panel insight-panel--loading" />
      ) : (projectsQuery.data ?? []).length === 0 ? (
        <Card variant="borderless" className="insight-panel insight-panel--empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 16, color: '#667085' }}>暂无项目，请先到项目管理中创建项目</span>}
          />
        </Card>
      ) : (
        <>
          {(testIssueFilesQuery.data?.length ?? 0) === 0 && !testIssueFilesQuery.isLoading ? (
            <Card
              variant="borderless"
              title="当前项目暂无测试问题文件"
              extra={<span className="insight-panel__meta">请先到配置管理上传并绑定项目</span>}
              className="insight-panel insight-panel--empty-state"
            >
              <div className="insight-toolbar insight-toolbar--compact">
                <div className="insight-toolbar__item">
                  <span>当前项目</span>
                  <strong>{selectedProject?.name ?? '待选择'}</strong>
                </div>
                <div className="insight-toolbar__item">
                  <span>绑定文件</span>
                  <strong>{fileCount} 份</strong>
                </div>
                <div className="insight-toolbar__item">
                  <span>说明</span>
                  <strong>上传后将自动展示最新文件</strong>
                </div>
              </div>
              <div className="insight-panel__empty-inner">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={selectedProject ? `项目「${selectedProject.name}」暂无测试问题文件，请先到配置管理中上传并绑定项目` : '请先选择项目'}
                />
              </div>
            </Card>
          ) : null}

          {analysisQuery.isError ? (
            <Alert
              type="error"
              showIcon
              className="insight-board__alert"
              message="测试问题看板加载失败"
              description="当前文件分析失败，请检查文件内容或重新上传。"
            />
          ) : null}

          {analysisQuery.isLoading && !result && !analysisQuery.isError && selectedFileId !== null ? (
            <Card variant="borderless" loading className="insight-panel insight-panel--loading" />
          ) : null}

          {result ? (
            <>
              <section className="insight-board__section">
                <InsightSectionHeader
                  eyebrow="数据图谱"
                  title="问题结构分布"
                  description="先查看严重度、业务影响、来源与原因的整体结构，再继续下钻热点摘要，快速识别当前项目质量风险集中区域。"
                />
                <div className="insight-chart-grid">
                  <ChartCard
                    title="缺陷严重度分布"
                    caption="识别严重等级占比"
                    option={result.charts.severity_distribution.length > 0 ? buildPieOption(result.charts.severity_distribution) : null}
                  />
                  <ChartCard
                    title="业务影响分布"
                    caption="定位高影响业务区域"
                    option={result.charts.business_impact_distribution.length > 0 ? buildBarOption(result.charts.business_impact_distribution, '#98B2E6') : null}
                  />
                  <ChartCard
                    title="缺陷来源分布"
                    caption="观察来源结构"
                    option={result.charts.source_distribution.length > 0 ? buildBarOption(result.charts.source_distribution, '#7F9FE0') : null}
                  />
                  <ChartCard
                    title="缺陷原因 Top 10"
                    caption="提炼高频缺陷原因"
                    option={result.charts.reason_distribution.length > 0 ? buildBarOption(result.charts.reason_distribution, '#8A94A5') : null}
                  />
                  <ChartCard
                    title="缺陷子原因 Top 10"
                    caption="继续下钻原因分层"
                    option={result.charts.sub_reason_distribution.length > 0 ? buildBarOption(result.charts.sub_reason_distribution, '#6B84BF') : null}
                  />
                  <ChartCard
                    title="缺陷摘要热点 Top 10"
                    caption="快速识别高频摘要"
                    option={result.charts.summary_distribution.length > 0 ? buildBarOption(result.charts.summary_distribution, '#B8CAE9') : null}
                  />
                </div>
              </section>

              <section className="insight-board__section">
                <InsightSectionHeader
                  eyebrow="治理建议"
                  title="关键归纳与治理动作"
                  description="将图表中的高频问题收敛为可执行结论，先看关键归纳，再按治理动作安排专项排查和责任跟进。"
                />
                <div className="insight-board__insight-grid insight-board__insight-grid--summary">
                  <Card title="关键归纳" variant="borderless" className="insight-panel insight-panel--insight insight-panel--insight-note">
                    <div className="insight-note-list">
                      {result.summary.key_findings.map((item, index) => (
                        <article key={item} className="insight-note-item">
                          <span className="insight-note-item__index">{String(index + 1).padStart(2, '0')}</span>
                          <p>{item}</p>
                        </article>
                      ))}
                    </div>
                  </Card>

                  <Card title="建议优先推进的治理动作" variant="borderless" className="insight-panel insight-panel--insight insight-panel--insight-action">
                    {result.summary.recommended_actions.length > 0 ? (
                      <div className="insight-action-list">
                        {result.summary.recommended_actions.map((item) => (
                          <article key={item} className="insight-action-item">
                            <span className="insight-action-item__marker" />
                            <p>{item}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <Empty description="暂无治理建议" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </div>
              </section>

              <section className="insight-board__section">
                <InsightSectionHeader
                  eyebrow="导入明细"
                  title="导入明细列表"
                  description="最后回看本次导入的原始记录，支持分页与横向滚动，便于按字段核对图表结论与治理动作来源。"
                />
                <ImportPreviewTable
                  rows={result.preview_rows}
                  title="导入明细列表"
                  className="insight-panel insight-panel--preview"
                  extra={<span className="insight-panel__meta">共 {result.preview_rows.length} 条 · 支持横向滚动</span>}
                />
              </section>
            </>
          ) : null}
        </>
      )}
    </div>
  );
};

export default DefectAnalysisPage;

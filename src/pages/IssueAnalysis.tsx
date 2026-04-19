import React, { useMemo } from 'react';
import {
  Alert,
  Card,
  Empty,
} from 'antd';
import {
  BarChartOutlined,
  FireOutlined,
  NodeIndexOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import ImportPreviewTable from '../components/AnalysisPreview/ImportPreviewTable';
import ChartSurface from '../components/Charts/ChartSurface';
import GlassDashboardShowcase from '../components/Layout/GlassDashboardShowcase';
import InsightMetricCard from '../components/Layout/InsightMetricCard';
import {
  getProductionIssueAnalysis,
  listProductionIssueFiles,
} from '../utils/api';
import type {
  IssueInsightChartItem,
  IssueInsightData,
  IssueStageHumanMatrixItem,
  ProductionIssueFileRecord,
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

function buildStackedBarOption(items: IssueStageHumanMatrixItem[]) {
  return {
    animationDuration: 760,
    animationDurationUpdate: 420,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicInOut',
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      backgroundColor: CHART_TOOLTIP_BG,
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    legend: {
      top: 0,
      textStyle: { color: CHART_AXIS_COLOR },
    },
    grid: {
      top: 42,
      right: 16,
      bottom: items.length > 5 ? 72 : 36,
      left: 36,
      containLabel: true,
    },
    xAxis: {
      type: 'category' as const,
      data: items.map((item) => item.stage),
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
        name: '人为原因',
        type: 'bar' as const,
        stack: 'total',
        universalTransition: true,
        data: items.map((item) => item.human),
        itemStyle: { color: '#7F9FE0', borderRadius: [10, 10, 0, 0] },
      },
      {
        name: '非人为原因',
        type: 'bar' as const,
        stack: 'total',
        universalTransition: true,
        data: items.map((item) => item.non_human),
        itemStyle: { color: '#949FB1', borderRadius: [10, 10, 0, 0] },
      },
      {
        name: '待确认',
        type: 'bar' as const,
        stack: 'total',
        universalTransition: true,
        data: items.map((item) => item.unknown),
        itemStyle: { color: '#B8CAE9', borderRadius: [10, 10, 0, 0] },
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
  wide?: boolean;
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  option,
  height = 320,
  caption,
  wide = false,
}) => (
  <Card
    title={title}
    extra={caption ? <span className="insight-panel__meta">{caption}</span> : null}
    variant="borderless"
    className={`insight-panel insight-panel--chart${wide ? ' insight-panel--chart-wide' : ''}`}
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

const IssueAnalysisPage: React.FC = () => {
  const productionIssueFilesQuery = useQuery({
    queryKey: ['production-issue-files'],
    queryFn: listProductionIssueFiles,
    staleTime: 30_000,
  });

  const productionFiles = useMemo(
    () => [...(productionIssueFilesQuery.data ?? [])].sort((left, right) => {
      const timestampDiff = getTimestamp(right.created_at) - getTimestamp(left.created_at);
      if (timestampDiff !== 0) {
        return timestampDiff;
      }
      return right.id - left.id;
    }),
    [productionIssueFilesQuery.data],
  );

  const selectedFile: ProductionIssueFileRecord | null = useMemo(
    () => productionFiles[0] ?? null,
    [productionFiles],
  );

  const selectedFileId = selectedFile?.id ?? null;

  const analysisQuery = useQuery({
    queryKey: ['production-issue-analysis', selectedFileId],
    queryFn: () => getProductionIssueAnalysis(selectedFileId as number),
    enabled: selectedFileId !== null,
    staleTime: 30_000,
  });

  const result: IssueInsightData | null = analysisQuery.data?.success && analysisQuery.data.data
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

  const fileCount = productionFiles.length;
  const humanRatioPercent = Math.round((result?.overview.human_related_ratio ?? 0) * 100);

  return (
    <div className="insight-board insight-board--issue">
      <section className="insight-board__first-screen">
        <GlassDashboardShowcase
          className="glass-dashboard-showcase--issue-compact"
          title="生产问题分析"
          chips={[
            { label: selectedFile ? `当前文件：${selectedFile.file_name}` : '等待选择生产问题文件', tone: 'accent' },
            { label: `已收录 ${fileCount} 份生产问题文件` },
            { label: result ? `问题记录：${result.overview.total_records} 条` : '等待生成分析结果', tone: 'slate' },
          ]}
          mainExtra={result ? (
            <div className="insight-metric-grid insight-metric-grid--hero">
              <InsightMetricCard
                icon={<BarChartOutlined />}
                label="问题记录数"
                value={result.overview.total_records}
                detail="当前文件覆盖的生产问题记录总量"
                className="insight-metric-card--compact"
              />
              <InsightMetricCard
                icon={<NodeIndexOutlined />}
                label="发生阶段数"
                value={result.overview.stage_count}
                detail="用于观察问题集中爆发的环节"
                tone="ice"
                className="insight-metric-card--compact"
              />
              <InsightMetricCard
                icon={<TagsOutlined />}
                label="标签分类数"
                value={result.overview.tag_count}
                detail="标签维度覆盖范围"
                tone="slate"
                className="insight-metric-card--compact"
              />
              <InsightMetricCard
                icon={<FireOutlined />}
                label="人为原因占比"
                value={humanRatioPercent}
                suffix="%"
                detail={`人为原因记录 ${result.overview.human_related_count} 条`}
                className="insight-metric-card--compact"
              />
            </div>
          ) : null}
          spotlightEyebrow="质量热区"
          spotlightTitle={currentTimeLabel}
          spotlightValue={humanRatioPercent}
          spotlightUnit="%"
          spotlightCaption="人为因素占比"
          spotlightProgress={result?.overview.human_related_ratio ?? 0}
          spotlightStats={[
            {
              label: '高频阶段',
              value: result?.overview.top_stage?.name ?? '待分析',
              note: result?.overview.top_stage ? `${Math.round(result.overview.top_stage.ratio * 100)}% 记录聚集` : '最新文件分析后自动生成',
            },
            {
              label: '高频标签',
              value: result?.overview.top_tag?.name ?? '待分析',
              note: result?.overview.top_tag ? `${Math.round(result.overview.top_tag.ratio * 100)}% 标签热度` : '标签热点将在此处展示',
            },
          ]}
        />
      </section>

      {productionIssueFilesQuery.isLoading ? (
        <Card variant="borderless" loading className="insight-panel insight-panel--loading" />
      ) : productionFiles.length === 0 ? (
        <Card variant="borderless" className="insight-panel insight-panel--empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 16, color: '#667085' }}>暂无生产问题文件，请先到缺陷管理中上传</span>}
          />
        </Card>
      ) : (
        <>
          {analysisQuery.isError ? (
            <Alert
              type="error"
              showIcon
              className="insight-board__alert"
              message="生产问题看板加载失败"
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
                  description="先查看发生阶段、人为因素、标签、原因与改善动作的整体结构，再继续下钻交叉图，快速识别当前生产问题的风险集中区域。"
                />
                <div className="insight-chart-grid">
                  <ChartCard
                    title="发生阶段分布"
                    caption="观察问题集中出现的阶段"
                    option={result.charts.stage_distribution.length > 0 ? buildBarOption(result.charts.stage_distribution, '#7F9FE0') : null}
                  />
                  <ChartCard
                    title="人为原因占比"
                    caption="确认人为与非人为因素结构"
                    option={result.charts.human_factor_distribution.length > 0 ? buildPieOption(result.charts.human_factor_distribution) : null}
                  />
                  <ChartCard
                    title="标签热点 Top 10"
                    caption="查看高频标签分布"
                    option={result.charts.tag_distribution.length > 0 ? buildBarOption(result.charts.tag_distribution, '#98B2E6') : null}
                  />
                  <ChartCard
                    title="问题原因主题 Top 10"
                    caption="提炼高频原因主题"
                    option={result.charts.issue_reason_distribution.length > 0 ? buildBarOption(result.charts.issue_reason_distribution, '#8A94A5') : null}
                  />
                  <ChartCard
                    title="发生原因总结 Top 10"
                    caption="对问题原因进行二次聚合"
                    option={result.charts.reason_summary_distribution.length > 0 ? buildBarOption(result.charts.reason_summary_distribution, '#6B84BF') : null}
                  />
                  <ChartCard
                    title="改善举措 Top 10"
                    caption="识别最常见的治理动作"
                    option={result.charts.action_distribution.length > 0 ? buildBarOption(result.charts.action_distribution, '#B8CAE9') : null}
                  />
                  <ChartCard
                    title="阶段与人为原因交叉分布"
                    caption="交叉观察阶段与人为因素"
                    option={result.charts.stage_human_matrix.length > 0 ? buildStackedBarOption(result.charts.stage_human_matrix) : null}
                    height={360}
                    wide
                  />
                </div>
              </section>

              <section className="insight-board__section">
                <InsightSectionHeader
                  eyebrow="治理建议"
                  title="关键归纳与治理动作"
                  description="将图表中的高频生产问题收敛为可执行结论，先看关键归纳，再按治理动作安排专项排查和责任跟进。"
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
                      <Empty description="暂无改善举措建议" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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

export default IssueAnalysisPage;

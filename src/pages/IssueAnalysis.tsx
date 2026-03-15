import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  BarChartOutlined,
  FileExcelOutlined,
  NodeIndexOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import ImportPreviewTable from '../components/AnalysisPreview/ImportPreviewTable';
import ChartSurface from '../components/Charts/ChartSurface';
import DashboardHero from '../components/Layout/DashboardHero';
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

const { Title, Text } = Typography;

const CHART_COLORS = ['#2A6DF4', '#60A5FA', '#93C5FD', '#1D4ED8', '#94A3B8', '#64748B'];

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
      backgroundColor: 'rgba(30, 41, 59, 0.92)',
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
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.24)' } },
      axisLabel: {
        interval: 0,
        rotate: items.length > 4 ? 20 : 0,
        color: '#64748B',
      },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#64748B' },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)', type: 'dashed' as const } },
    },
    series: [
      {
        type: 'bar' as const,
        data: items.map((item) => item.count),
        barMaxWidth: 34,
        universalTransition: true,
        showBackground: true,
        backgroundStyle: {
          color: 'rgba(0,0,0,0.04)',
        },
        itemStyle: {
          color,
          borderRadius: [10, 10, 3, 3],
        },
        label: {
          show: true,
          position: 'top' as const,
          color: '#334155',
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
      backgroundColor: 'rgba(30, 41, 59, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff' },
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
      type: 'scroll' as const,
      textStyle: { color: '#64748B' },
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['42%', '72%'],
        center: ['50%', '45%'],
        label: {
          color: '#334155',
          formatter: '{b}\n{d}%',
        },
        itemStyle: {
          borderRadius: 12,
          borderColor: '#fff',
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
      backgroundColor: 'rgba(30, 41, 59, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    legend: {
      top: 0,
      textStyle: { color: '#64748B' },
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
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.24)' } },
      axisLabel: {
        interval: 0,
        rotate: items.length > 4 ? 20 : 0,
        color: '#64748B',
      },
    },
    yAxis: {
      type: 'value' as const,
      axisLabel: { color: '#64748B' },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)', type: 'dashed' as const } },
    },
    series: [
      {
        name: '人为原因',
        type: 'bar' as const,
        stack: 'total',
        universalTransition: true,
        data: items.map((item) => item.human),
        itemStyle: { color: '#2A6DF4', borderRadius: [8, 8, 0, 0] },
      },
      {
        name: '非人为原因',
        type: 'bar' as const,
        stack: 'total',
        universalTransition: true,
        data: items.map((item) => item.non_human),
        itemStyle: { color: '#64748B', borderRadius: [8, 8, 0, 0] },
      },
      {
        name: '待确认',
        type: 'bar' as const,
        stack: 'total',
        universalTransition: true,
        data: items.map((item) => item.unknown),
        itemStyle: { color: '#93C5FD', borderRadius: [8, 8, 0, 0] },
      },
    ],
  };
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

function formatDateTime(value: string): string {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

interface ChartCardProps {
  title: string;
  option: object | null;
  height?: number;
}

const ChartCard: React.FC<ChartCardProps> = ({ title, option, height = 320 }) => (
  <Card title={title} variant="borderless" style={{ height: '100%' }}>
    {option ? (
      <ChartSurface option={option as EChartsOption} height={height} refreshKey={JSON.stringify(option)} />
    ) : (
      <div className="dashboard-empty">
        <Empty description="暂无图表数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      </div>
    )}
  </Card>
);

const IssueAnalysisPage: React.FC = () => {
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);

  const productionIssueFilesQuery = useQuery({
    queryKey: ['production-issue-files'],
    queryFn: listProductionIssueFiles,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (selectedFileId !== null) {
      return;
    }
    const firstFile = productionIssueFilesQuery.data?.[0];
    if (firstFile) {
      setSelectedFileId(firstFile.id);
    }
  }, [productionIssueFilesQuery.data, selectedFileId]);

  const selectedFile = useMemo(
    () => (productionIssueFilesQuery.data ?? []).find((item) => item.id === selectedFileId) ?? null,
    [productionIssueFilesQuery.data, selectedFileId],
  );

  const analysisQuery = useQuery({
    queryKey: ['production-issue-analysis', selectedFileId],
    queryFn: () => getProductionIssueAnalysis(selectedFileId as number),
    enabled: selectedFileId !== null,
    staleTime: 30_000,
  });

  const result: IssueInsightData | null = analysisQuery.data?.success && analysisQuery.data.data
    ? analysisQuery.data.data
    : null;

  return (
    <div>
      <DashboardHero
        title="生产问题分析"
        chips={[
          { label: `文件总数 ${productionIssueFilesQuery.data?.length ?? 0}`, tone: 'gold' },
          { label: selectedFile ? `当前文件：${selectedFile.file_name}` : '请选择数据文件' },
        ]}
      />

      {(productionIssueFilesQuery.data?.length ?? 0) === 0 ? (
        <Card variant="borderless" className="dashboard-empty-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 16, color: '#666' }}>暂无生产问题文件，请先到文件管理中上传</span>}
          />
        </Card>
      ) : (
        <>
          <Card
            variant="borderless"
            title="数据来源文件"
            style={{ marginBottom: 24 }}
            extra={<Text type="secondary">共 {productionIssueFilesQuery.data?.length ?? 0} 个文件</Text>}
          >
            <Table<ProductionIssueFileRecord>
              size="small"
              rowKey="id"
              loading={productionIssueFilesQuery.isLoading}
              dataSource={productionIssueFilesQuery.data ?? []}
              pagination={{ pageSize: 5, hideOnSinglePage: true }}
              rowClassName={(record) => (record.id === selectedFileId ? 'glass-table-row ant-table-row-selected' : 'glass-table-row')}
              columns={[
                {
                  title: '文件名',
                  dataIndex: 'file_name',
                  key: 'file_name',
                  ellipsis: true,
                },
                {
                  title: '类型',
                  dataIndex: 'file_type',
                  key: 'file_type',
                  width: 100,
                  render: (value: string) => value.toUpperCase(),
                },
                {
                  title: '记录数',
                  dataIndex: 'row_count',
                  key: 'row_count',
                  width: 110,
                },
                {
                  title: '文件大小',
                  dataIndex: 'file_size',
                  key: 'file_size',
                  width: 130,
                  render: (value: number) => formatFileSize(value),
                },
                {
                  title: '上传时间',
                  dataIndex: 'created_at',
                  key: 'created_at',
                  width: 180,
                  render: (value: string) => formatDateTime(value),
                },
                {
                  title: '操作',
                  key: 'actions',
                  width: 120,
                  render: (_: unknown, record: ProductionIssueFileRecord) => (
                    <Button
                      size="small"
                      type={record.id === selectedFileId ? 'primary' : 'default'}
                      icon={<FileExcelOutlined />}
                      onClick={() => setSelectedFileId(record.id)}
                    >
                      查看看板
                    </Button>
                  ),
                },
              ]}
            />
          </Card>

          {analysisQuery.isError ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 24 }}
              title="生产问题看板加载失败"
              description="当前文件分析失败，请检查文件内容或重新上传。"
            />
          ) : null}

          {result ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <Card variant="borderless" loading={analysisQuery.isLoading}>
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Space wrap size={[12, 12]}>
                    <Tag color="purple">{result.overview.top_stage?.name || '暂无阶段'}</Tag>
                    <Tag color="cyan">{result.overview.top_tag?.name || '暂无标签'}</Tag>
                  </Space>
                  <Title level={3} style={{ margin: 0 }}>{result.summary.headline}</Title>
                </Space>
              </Card>

              <Row gutter={[24, 24]}>
                <Col xs={24} sm={12} xl={6}>
                  <Card variant="borderless">
                    <Statistic title="问题记录数" value={result.overview.total_records} prefix={<BarChartOutlined />} />
                  </Card>
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <Card variant="borderless">
                    <Statistic title="发生阶段数" value={result.overview.stage_count} prefix={<NodeIndexOutlined />} />
                  </Card>
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <Card variant="borderless">
                    <Statistic title="标签分类数" value={result.overview.tag_count} prefix={<TagsOutlined />} />
                  </Card>
                </Col>
                <Col xs={24} sm={12} xl={6}>
                  <Card variant="borderless">
                    <Statistic title="人为原因占比" value={result.overview.human_related_ratio * 100} precision={1} suffix="%" />
                  </Card>
                </Col>
              </Row>

              <Row gutter={[24, 24]}>
                <Col xs={24} lg={14}>
                  <Card title="关键归纳" variant="borderless" style={{ height: '100%' }}>
                    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                      {result.summary.key_findings.map((item) => (
                        <Alert key={item} type="info" showIcon title={item} />
                      ))}
                    </Space>
                  </Card>
                </Col>
                <Col xs={24} lg={10}>
                  <Card title="建议优先推进的改善举措" variant="borderless" style={{ height: '100%' }}>
                    {result.summary.recommended_actions.length > 0 ? (
                      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                        {result.summary.recommended_actions.map((item) => (
                          <div key={item} className="suggestion-block">{item}</div>
                        ))}
                      </Space>
                    ) : (
                      <Empty description="暂无改善举措建议" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </Col>
              </Row>

              <Row gutter={[24, 24]}>
                <Col xs={24} lg={12}>
                  <ChartCard
                    title="发生阶段分布"
                    option={result.charts.stage_distribution.length > 0 ? buildBarOption(result.charts.stage_distribution, '#2A6DF4') : null}
                  />
                </Col>
                <Col xs={24} lg={12}>
                  <ChartCard
                    title="人为原因占比"
                    option={result.charts.human_factor_distribution.length > 0 ? buildPieOption(result.charts.human_factor_distribution) : null}
                  />
                </Col>
                <Col xs={24} lg={12}>
                  <ChartCard
                    title="标签热点 Top 10"
                    option={result.charts.tag_distribution.length > 0 ? buildBarOption(result.charts.tag_distribution, '#60A5FA') : null}
                  />
                </Col>
                <Col xs={24} lg={12}>
                  <ChartCard
                    title="问题原因主题 Top 10"
                    option={result.charts.issue_reason_distribution.length > 0 ? buildBarOption(result.charts.issue_reason_distribution, '#64748B') : null}
                  />
                </Col>
                <Col xs={24} lg={12}>
                  <ChartCard
                    title="发生原因总结 Top 10"
                    option={result.charts.reason_summary_distribution.length > 0 ? buildBarOption(result.charts.reason_summary_distribution, '#1D4ED8') : null}
                  />
                </Col>
                <Col xs={24} lg={12}>
                  <ChartCard
                    title="改善举措 Top 10"
                    option={result.charts.action_distribution.length > 0 ? buildBarOption(result.charts.action_distribution, '#93C5FD') : null}
                  />
                </Col>
                <Col span={24}>
                  <ChartCard
                    title="阶段与人为原因交叉分布"
                    option={result.charts.stage_human_matrix.length > 0 ? buildStackedBarOption(result.charts.stage_human_matrix) : null}
                    height={360}
                  />
                </Col>
              </Row>

              <ImportPreviewTable rows={result.preview_rows} />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
};

export default IssueAnalysisPage;

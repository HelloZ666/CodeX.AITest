import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  BarChartOutlined,
  FileExcelOutlined,
  RocketOutlined,
  SafetyCertificateOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';
import ImportPreviewTable from '../components/AnalysisPreview/ImportPreviewTable';
import ChartSurface from '../components/Charts/ChartSurface';
import DashboardHero from '../components/Layout/DashboardHero';
import {
  getTestIssueAnalysis,
  listProjects,
  listTestIssueFiles,
} from '../utils/api';
import type {
  DefectInsightData,
  IssueInsightChartItem,
  Project,
  TestIssueFileRecord,
} from '../types';

const { Title, Text } = Typography;

const CHART_COLORS = ['#2A6DF4', '#60A5FA', '#93C5FD', '#1D4ED8', '#94A3B8', '#64748B'];

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
        formatter: (value: string) => shortenLabel(value, 8),
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
      formatter: (value: string) => shortenLabel(value, 10),
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['42%', '72%'],
        center: ['50%', '45%'],
        label: {
          color: '#334155',
          formatter: (params: { name: string; percent: number }) => `${shortenLabel(params.name, 8)}\n${params.percent}%`,
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

const DefectAnalysisPage: React.FC = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);

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

  useEffect(() => {
    const files = testIssueFilesQuery.data ?? [];
    if (files.length === 0) {
      if (selectedFileId !== null) {
        setSelectedFileId(null);
      }
      return;
    }

    if (selectedFileId !== null && files.some((item) => item.id === selectedFileId)) {
      return;
    }

    setSelectedFileId(files[0].id);
  }, [testIssueFilesQuery.data, selectedFileId]);

  const selectedFile = useMemo(
    () => (testIssueFilesQuery.data ?? []).find((item) => item.id === selectedFileId) ?? null,
    [testIssueFilesQuery.data, selectedFileId],
  );

  const analysisQuery = useQuery({
    queryKey: ['test-issue-analysis', selectedFileId],
    queryFn: () => getTestIssueAnalysis(selectedFileId as number),
    enabled: selectedFileId !== null,
    staleTime: 30_000,
  });

  const result: DefectInsightData | null = analysisQuery.data?.success && analysisQuery.data.data
    ? analysisQuery.data.data
    : null;

  if (projectsQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }

  return (
    <div>
      <DashboardHero
        title="测试问题分析"
        chips={[
          { label: selectedProject ? `当前项目：${selectedProject.name}` : '尚未选择项目', tone: 'gold' },
          { label: selectedFile ? `当前文件：${selectedFile.file_name}` : '请选择数据文件' },
        ]}
      />

      {(projectsQuery.data ?? []).length === 0 ? (
        <Card variant="borderless" className="dashboard-empty-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 16, color: '#666' }}>暂无项目，请先到项目管理中创建项目</span>}
          />
        </Card>
      ) : (
        <>
          <Card
            variant="borderless"
            title="选择项目"
            style={{ marginBottom: 24 }}
            extra={<Text type="secondary">共 {projectsQuery.data?.length ?? 0} 个项目</Text>}
          >
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Select
                showSearch
                placeholder="请选择项目名称"
                value={selectedProjectId ?? undefined}
                style={{ width: '100%', maxWidth: 420 }}
                optionFilterProp="label"
                options={(projectsQuery.data ?? []).map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                onChange={(value) => {
                  setSelectedProjectId(value);
                  setSelectedFileId(null);
                }}
              />
              {selectedProject ? (
                <Text type="secondary">
                  当前项目：{selectedProject.name}
                  {selectedProject.description ? `，${selectedProject.description}` : ''}
                </Text>
              ) : null}
            </Space>
          </Card>

          {testIssueFilesQuery.isLoading ? (
            <Card variant="borderless" loading style={{ marginBottom: 24 }} />
          ) : (testIssueFilesQuery.data?.length ?? 0) === 0 ? (
            <Card variant="borderless" className="dashboard-empty-card">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={(
                  <span style={{ fontSize: 16, color: '#666' }}>
                    {selectedProject ? `项目「${selectedProject.name}」暂无测试问题文件，请先到文件管理中上传并绑定项目` : '请先选择项目'}
                  </span>
                )}
              />
            </Card>
          ) : (
            <>
              <Card
                variant="borderless"
                title="数据来源文件"
                style={{ marginBottom: 24 }}
                extra={<Text type="secondary">当前项目：{selectedProject?.name ?? '-'}，共 {testIssueFilesQuery.data?.length ?? 0} 个文件</Text>}
              >
                <Table<TestIssueFileRecord>
                  size="small"
                  rowKey="id"
                  loading={testIssueFilesQuery.isFetching}
                  dataSource={testIssueFilesQuery.data ?? []}
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
                      render: (_: unknown, record: TestIssueFileRecord) => (
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

              {analysisQuery.isLoading && !result && !analysisQuery.isError ? (
                <Card variant="borderless" loading style={{ marginBottom: 24 }} />
              ) : null}

              {analysisQuery.isError ? (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 24 }}
                  title="测试问题看板加载失败"
                  description="当前文件分析失败，请检查文件内容或重新上传。"
                />
              ) : null}

              {result ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <Card variant="borderless" loading={analysisQuery.isFetching}>
                    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                      <Space wrap size={[12, 12]}>
                        <Tag color="purple">{result.overview.top_severity?.name || '暂无严重度'}</Tag>
                        <Tag color="cyan">{result.overview.top_source?.name || '暂无来源'}</Tag>
                      </Space>
                      <Title level={3} style={{ margin: 0 }}>{result.summary.headline}</Title>
                    </Space>
                  </Card>

                  <Row gutter={[24, 24]}>
                    <Col xs={24} sm={12} xl={6}>
                      <Card variant="borderless">
                        <Statistic title="缺陷记录数" value={result.overview.total_records} prefix={<BarChartOutlined />} />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <Card variant="borderless">
                        <Statistic title="严重度分类数" value={result.overview.severity_count} prefix={<SafetyCertificateOutlined />} />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <Card variant="borderless">
                        <Statistic title="缺陷来源数" value={result.overview.source_count} prefix={<RocketOutlined />} />
                      </Card>
                    </Col>
                    <Col xs={24} sm={12} xl={6}>
                      <Card variant="borderless">
                        <Statistic title="缺陷原因数" value={result.overview.reason_count} prefix={<TagsOutlined />} />
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
                      <Card title="建议优先推进的治理动作" variant="borderless" style={{ height: '100%' }}>
                        {result.summary.recommended_actions.length > 0 ? (
                          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                            {result.summary.recommended_actions.map((item) => (
                              <div key={item} className="suggestion-block">{item}</div>
                            ))}
                          </Space>
                        ) : (
                          <Empty description="暂无治理建议" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </Card>
                    </Col>
                  </Row>

                  <Row gutter={[24, 24]}>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷严重度分布"
                        option={result.charts.severity_distribution.length > 0 ? buildPieOption(result.charts.severity_distribution) : null}
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="业务影响分布"
                        option={result.charts.business_impact_distribution.length > 0 ? buildBarOption(result.charts.business_impact_distribution, '#60A5FA') : null}
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷来源分布"
                        option={result.charts.source_distribution.length > 0 ? buildBarOption(result.charts.source_distribution, '#2A6DF4') : null}
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷原因 Top 10"
                        option={result.charts.reason_distribution.length > 0 ? buildBarOption(result.charts.reason_distribution, '#64748B') : null}
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷子原因 Top 10"
                        option={result.charts.sub_reason_distribution.length > 0 ? buildBarOption(result.charts.sub_reason_distribution, '#1D4ED8') : null}
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷摘要热点 Top 10"
                        option={result.charts.summary_distribution.length > 0 ? buildBarOption(result.charts.summary_distribution, '#93C5FD') : null}
                      />
                    </Col>
                  </Row>

                  <ImportPreviewTable rows={result.preview_rows} />
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default DefectAnalysisPage;

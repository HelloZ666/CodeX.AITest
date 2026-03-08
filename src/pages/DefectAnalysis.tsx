import React, { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
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

const CHART_COLORS = ['#4f7cff', '#00b894', '#fa8c16', '#eb2f96', '#13c2c2', '#1677ff'];

function shortenLabel(value: string, limit: number = 10) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function buildBarOption(items: IssueInsightChartItem[], color: string) {
  return {
    color: [color],
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
      formatter: (params: Array<{ name: string; value: number }>) => {
        const item = params[0];
        return `${item.name}<br/>数量：${item.value}`;
      },
    },
    grid: {
      top: 24,
      right: 16,
      bottom: items.length > 5 ? 72 : 36,
      left: 48,
    },
    xAxis: {
      type: 'category' as const,
      data: items.map((item) => item.name),
      axisLabel: {
        interval: 0,
        rotate: items.length > 4 ? 20 : 0,
        formatter: (value: string) => shortenLabel(value, 8),
      },
    },
    yAxis: {
      type: 'value' as const,
    },
    series: [
      {
        type: 'bar' as const,
        data: items.map((item) => item.count),
        barMaxWidth: 42,
        showBackground: true,
        backgroundStyle: {
          color: 'rgba(0,0,0,0.04)',
        },
        label: {
          show: true,
          position: 'top' as const,
        },
      },
    ],
  };
}

function buildPieOption(items: IssueInsightChartItem[]) {
  return {
    tooltip: {
      trigger: 'item' as const,
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      bottom: 0,
      type: 'scroll' as const,
      formatter: (value: string) => shortenLabel(value, 10),
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['42%', '72%'],
        center: ['50%', '45%'],
        label: {
          formatter: (params: { name: string; percent: number }) => `${shortenLabel(params.name, 8)}\n${params.percent}%`,
        },
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2,
        },
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
      <ReactECharts option={option} style={{ height }} />
    ) : (
      <Empty description="暂无图表数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 32,
          background: 'rgba(255,255,255,0.4)',
          padding: '16px 24px',
          borderRadius: 16,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.3)',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <Title
            level={2}
            style={{
              margin: '0 0 4px 0',
              background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            测试问题分析
          </Title>
        </div>
        <Space wrap>
          <Tag color="blue" style={{ paddingInline: 12, lineHeight: '28px' }}>
            数据来源：文件管理
          </Tag>
          <Tag color="green" style={{ paddingInline: 12, lineHeight: '28px' }}>
            按项目查看看板
          </Tag>
        </Space>
      </div>

      {(projectsQuery.data ?? []).length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
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
              {selectedProject && (
                <Text type="secondary">
                  当前项目：{selectedProject.name}
                  {selectedProject.description ? `，${selectedProject.description}` : ''}
                </Text>
              )}
            </Space>
          </Card>

          {testIssueFilesQuery.isLoading ? (
            <Card variant="borderless" loading style={{ marginBottom: 24 }} />
          ) : (testIssueFilesQuery.data?.length ?? 0) === 0 ? (
            <Card style={{ textAlign: 'center', padding: 48 }}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span style={{ fontSize: 16, color: '#666' }}>
                    {selectedProject ? `项目「${selectedProject.name}」暂无测试问题文件，请先到文件管理中上传并绑定项目` : '请先选择项目'}
                  </span>
                }
              />
            </Card>
          ) : (
            <>
              <Card
                variant="borderless"
                title="数据来源文件"
                style={{ marginBottom: 24 }}
                extra={
                  <Text type="secondary">
                    当前项目：{selectedProject?.name ?? '-'}，共 {testIssueFilesQuery.data?.length ?? 0} 个文件
                  </Text>
                }
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

              {selectedFile && (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 24 }}
                  title={`当前看板项目：${selectedProject?.name ?? '-'}，文件：${selectedFile.file_name}`}
                  description={`记录数 ${selectedFile.row_count} 条，文件大小 ${formatFileSize(selectedFile.file_size)}，上传时间 ${formatDateTime(selectedFile.created_at)}`}
                />
              )}

              {analysisQuery.isLoading && !result && !analysisQuery.isError && (
                <Card variant="borderless" loading style={{ marginBottom: 24 }} />
              )}

              {analysisQuery.isError && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 24 }}
                  title="测试问题看板加载失败"
                  description="当前文件分析失败，请检查文件内容或重新上传。"
                />
              )}

              {result && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  <Card variant="borderless" loading={analysisQuery.isFetching}>
                    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                      <Space wrap size={[12, 12]}>
                        <Tag color="purple">{result.overview.top_severity?.name || '暂无严重度'}</Tag>
                        <Tag color="cyan">{result.overview.top_source?.name || '暂无来源'}</Tag>
                      </Space>
                      <Title level={3} style={{ margin: 0 }}>
                        {result.summary.headline}
                      </Title>
                      <Text type="secondary">系统已根据所选项目下已上传的测试问题文件自动完成统计归纳，下面的图表和表格会随项目或文件切换。</Text>
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
                              <div
                                key={item}
                                style={{
                                  background: 'linear-gradient(135deg, rgba(17,153,142,0.12), rgba(56,239,125,0.08))',
                                  borderRadius: 12,
                                  padding: '12px 14px',
                                }}
                              >
                                {item}
                              </div>
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
                        option={
                          result.charts.severity_distribution.length > 0
                            ? buildPieOption(result.charts.severity_distribution)
                            : null
                        }
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="业务影响分布"
                        option={
                          result.charts.business_impact_distribution.length > 0
                            ? buildBarOption(result.charts.business_impact_distribution, '#00b894')
                            : null
                        }
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷来源分布"
                        option={
                          result.charts.source_distribution.length > 0
                            ? buildBarOption(result.charts.source_distribution, '#4f7cff')
                            : null
                        }
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷原因 Top 10"
                        option={
                          result.charts.reason_distribution.length > 0
                            ? buildBarOption(result.charts.reason_distribution, '#fa8c16')
                            : null
                        }
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷子原因 Top 10"
                        option={
                          result.charts.sub_reason_distribution.length > 0
                            ? buildBarOption(result.charts.sub_reason_distribution, '#eb2f96')
                            : null
                        }
                      />
                    </Col>
                    <Col xs={24} lg={12}>
                      <ChartCard
                        title="缺陷摘要热点 Top 10"
                        option={
                          result.charts.summary_distribution.length > 0
                            ? buildBarOption(result.charts.summary_distribution, '#13c2c2')
                            : null
                        }
                      />
                    </Col>
                  </Row>

                  <Card title="导入明细预览" variant="borderless">
                    <Table
                      rowKey="row_id"
                      dataSource={result.preview_rows}
                      pagination={{ pageSize: 8 }}
                      scroll={{ x: 1280 }}
                      columns={[
                        {
                          title: '缺陷ID',
                          dataIndex: '缺陷ID',
                          key: '缺陷ID',
                          width: 120,
                        },
                        {
                          title: '缺陷摘要',
                          dataIndex: '缺陷摘要',
                          key: '缺陷摘要',
                          ellipsis: true,
                          width: 260,
                        },
                        {
                          title: '缺陷严重度',
                          dataIndex: '缺陷严重度',
                          key: '缺陷严重度',
                          width: 140,
                        },
                        {
                          title: '业务影响',
                          dataIndex: '业务影响',
                          key: '业务影响',
                          ellipsis: true,
                          width: 200,
                        },
                        {
                          title: '缺陷来源',
                          dataIndex: '缺陷来源',
                          key: '缺陷来源',
                          width: 160,
                        },
                        {
                          title: '缺陷原因',
                          dataIndex: '缺陷原因',
                          key: '缺陷原因',
                          ellipsis: true,
                          width: 220,
                        },
                        {
                          title: '缺陷子原因',
                          dataIndex: '缺陷子原因',
                          key: '缺陷子原因',
                          ellipsis: true,
                          width: 220,
                        },
                      ]}
                    />
                  </Card>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default DefectAnalysisPage;

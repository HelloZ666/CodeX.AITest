import React, { useState } from 'react';
import ReactECharts from 'echarts-for-react';
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
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  BarChartOutlined,
  FileExcelOutlined,
  InboxOutlined,
  NodeIndexOutlined,
  RocketOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { importIssueAnalysis } from '../utils/api';
import type {
  IssueInsightChartItem,
  IssueInsightData,
  IssueStageHumanMatrixItem,
} from '../types';

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

const REQUIRED_FIELDS = [
  '出现该问题的原因',
  '改善举措',
  '发生阶段',
  '是否人为原因',
  '发生原因总结',
  '标签',
];

const CHART_COLORS = ['#4f7cff', '#00b894', '#fa8c16', '#eb2f96', '#13c2c2', '#722ed1'];

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
    },
    series: [
      {
        type: 'pie' as const,
        radius: ['42%', '72%'],
        center: ['50%', '45%'],
        label: {
          formatter: '{b}\n{d}%',
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

function buildStackedBarOption(items: IssueStageHumanMatrixItem[]) {
  return {
    tooltip: {
      trigger: 'axis' as const,
      axisPointer: { type: 'shadow' as const },
    },
    legend: {
      top: 0,
    },
    grid: {
      top: 42,
      right: 16,
      bottom: items.length > 5 ? 72 : 36,
      left: 48,
    },
    xAxis: {
      type: 'category' as const,
      data: items.map((item) => item.stage),
      axisLabel: {
        interval: 0,
        rotate: items.length > 4 ? 20 : 0,
      },
    },
    yAxis: {
      type: 'value' as const,
    },
    series: [
      {
        name: '人为原因',
        type: 'bar' as const,
        stack: 'total',
        data: items.map((item) => item.human),
        itemStyle: { color: '#ff7875' },
      },
      {
        name: '非人为原因',
        type: 'bar' as const,
        stack: 'total',
        data: items.map((item) => item.non_human),
        itemStyle: { color: '#36cfc9' },
      },
      {
        name: '待确认',
        type: 'bar' as const,
        stack: 'total',
        data: items.map((item) => item.unknown),
        itemStyle: { color: '#ffc53d' },
      },
    ],
  };
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

const IssueAnalysisPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<IssueInsightData | null>(null);

  const mutation = useMutation({
    mutationFn: importIssueAnalysis,
    onSuccess: (response) => {
      if (response.success && response.data) {
        setResult(response.data);
        message.success(`导入完成，共识别 ${response.data.overview.total_records} 条记录`);
      } else {
        message.error(response.error || '导入分析失败');
      }
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      const msg = err.response?.data?.detail || err.message || '导入分析失败';
      message.error(msg);
    },
  });

  const fileList: UploadFile[] = file
    ? [{ uid: file.name, name: file.name, status: 'done' }]
    : [];

  const handleAnalyze = () => {
    if (!file) {
      message.warning('请先选择要导入的 Excel 文件');
      return;
    }
    mutation.mutate(file);
  };

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
            问题归纳
          </Title>
          <Text type="secondary">导入问题 Excel，自动做归纳总结并生成可视化图表</Text>
        </div>
        <Space wrap>
          <Tag color="blue" style={{ paddingInline: 12, lineHeight: '28px' }}>
            支持 .xlsx / .xls / .csv
          </Tag>
          <Tag color="green" style={{ paddingInline: 12, lineHeight: '28px' }}>
            输出摘要 + 图表 + 明细预览
          </Tag>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
        title="导入字段要求"
        description={
          <Space wrap>
            {REQUIRED_FIELDS.map((field) => (
              <Tag key={field} color="processing">
                {field}
              </Tag>
            ))}
          </Space>
        }
      />

      <Card
        variant="borderless"
        title={
          <Space>
            <FileExcelOutlined style={{ color: '#4f7cff' }} />
            <span>上传问题台账</span>
          </Space>
        }
        style={{ marginBottom: 24 }}
      >
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} lg={16}>
            <Dragger
              accept=".xlsx,.xls,.csv"
              maxCount={1}
              multiple={false}
              beforeUpload={(nextFile) => {
                setFile(nextFile);
                setResult(null);
                return false;
              }}
              onRemove={() => {
                setFile(null);
                setResult(null);
              }}
              fileList={fileList}
              style={{ background: 'rgba(255,255,255,0.45)' }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#667eea' }} />
              </p>
              <p className="ant-upload-text">拖拽文件到这里，或点击选择文件</p>
              <p className="ant-upload-hint">建议使用 Excel 首个工作表，字段名与系统要求保持一致。</p>
            </Dragger>
          </Col>
          <Col xs={24} lg={8}>
            <Card
              variant="borderless"
              style={{
                height: '100%',
                background: 'linear-gradient(135deg, rgba(102,126,234,0.12), rgba(79,172,254,0.12))',
              }}
            >
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <div>
                  <Text strong>当前文件</Text>
                  <Paragraph style={{ margin: '8px 0 0', minHeight: 44 }}>
                    {file ? file.name : '未选择文件'}
                  </Paragraph>
                </div>
                <Button
                  type="primary"
                  size="large"
                  block
                  icon={<RocketOutlined />}
                  onClick={handleAnalyze}
                  loading={mutation.isPending}
                  style={{ height: 48, borderRadius: 24 }}
                >
                  开始归纳分析
                </Button>
                <Text type="secondary">
                  系统会自动统计阶段分布、人为原因占比、标签热点、原因主题和改善举措。
                </Text>
              </Space>
            </Card>
          </Col>
        </Row>
      </Card>

      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <Card variant="borderless">
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Space wrap size={[12, 12]}>
                <Tag color="purple">{result.overview.top_stage?.name || '暂无阶段'}</Tag>
                <Tag color="cyan">{result.overview.top_tag?.name || '暂无标签'}</Tag>
              </Space>
              <Title level={3} style={{ margin: 0 }}>
                {result.summary.headline}
              </Title>
              <Text type="secondary">基于导入文件自动完成统计归纳，下面的图表和表格会随文件重新计算。</Text>
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
                <Statistic title="标签数" value={result.overview.tag_count} prefix={<TagsOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card variant="borderless">
                <Statistic
                  title="人为原因占比"
                  value={Number((result.overview.human_related_ratio * 100).toFixed(1))}
                  suffix="%"
                  prefix={<BarChartOutlined />}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[24, 24]}>
            <Col xs={24} lg={14}>
              <Card title="关键归纳" variant="borderless" style={{ height: '100%' }}>
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  {result.summary.key_findings.map((item) => (
                    <div
                      key={item}
                      style={{
                        background: 'rgba(255,255,255,0.45)',
                        borderRadius: 12,
                        padding: '12px 14px',
                        border: '1px solid rgba(0,0,0,0.05)',
                      }}
                    >
                      {item}
                    </div>
                  ))}
                </Space>
              </Card>
            </Col>
            <Col xs={24} lg={10}>
              <Card title="建议优先推进的改善举措" variant="borderless" style={{ height: '100%' }}>
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
                  <Empty description="暂无改善举措建议" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                )}
              </Card>
            </Col>
          </Row>

          <Row gutter={[24, 24]}>
            <Col xs={24} lg={12}>
              <ChartCard
                title="发生阶段分布"
                option={
                  result.charts.stage_distribution.length > 0
                    ? buildBarOption(result.charts.stage_distribution, '#4f7cff')
                    : null
                }
              />
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard
                title="人为原因占比"
                option={
                  result.charts.human_factor_distribution.length > 0
                    ? buildPieOption(result.charts.human_factor_distribution)
                    : null
                }
              />
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard
                title="标签热点 Top 10"
                option={
                  result.charts.tag_distribution.length > 0
                    ? buildBarOption(result.charts.tag_distribution, '#00b894')
                    : null
                }
              />
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard
                title="问题原因主题 Top 10"
                option={
                  result.charts.issue_reason_distribution.length > 0
                    ? buildBarOption(result.charts.issue_reason_distribution, '#fa8c16')
                    : null
                }
              />
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard
                title="发生原因总结 Top 10"
                option={
                  result.charts.reason_summary_distribution.length > 0
                    ? buildBarOption(result.charts.reason_summary_distribution, '#eb2f96')
                    : null
                }
              />
            </Col>
            <Col xs={24} lg={12}>
              <ChartCard
                title="改善举措 Top 10"
                option={
                  result.charts.action_distribution.length > 0
                    ? buildBarOption(result.charts.action_distribution, '#13c2c2')
                    : null
                }
              />
            </Col>
            <Col span={24}>
              <ChartCard
                title="阶段与人为原因交叉分布"
                option={
                  result.charts.stage_human_matrix.length > 0
                    ? buildStackedBarOption(result.charts.stage_human_matrix)
                    : null
                }
                height={360}
              />
            </Col>
          </Row>

          <Card title="导入明细预览" variant="borderless">
            <Table
              rowKey="row_id"
              dataSource={result.preview_rows}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 1200 }}
              columns={[
                {
                  title: '出现该问题的原因',
                  dataIndex: '出现该问题的原因',
                  key: '出现该问题的原因',
                  ellipsis: true,
                  width: 240,
                },
                {
                  title: '改善举措',
                  dataIndex: '改善举措',
                  key: '改善举措',
                  ellipsis: true,
                  width: 220,
                },
                {
                  title: '发生阶段',
                  dataIndex: '发生阶段',
                  key: '发生阶段',
                  width: 140,
                },
                {
                  title: '是否人为原因',
                  dataIndex: '是否人为原因',
                  key: '是否人为原因',
                  width: 140,
                  render: (value: string) => {
                    const color =
                      value === '人为原因' ? 'error' : value === '非人为原因' ? 'success' : 'warning';
                    return <Tag color={color}>{value}</Tag>;
                  },
                },
                {
                  title: '发生原因总结',
                  dataIndex: '发生原因总结',
                  key: '发生原因总结',
                  ellipsis: true,
                  width: 220,
                },
                {
                  title: '标签',
                  dataIndex: '标签',
                  key: '标签',
                  width: 220,
                  render: (value: string[]) => (
                    <Space wrap>
                      {value.map((tag) => (
                        <Tag key={tag} color="processing">
                          {tag}
                        </Tag>
                      ))}
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </div>
      )}
    </div>
  );
};

export default IssueAnalysisPage;

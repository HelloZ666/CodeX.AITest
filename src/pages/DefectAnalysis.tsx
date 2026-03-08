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
  RocketOutlined,
  SafetyCertificateOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { importDefectAnalysis } from '../utils/api';
import type {
  DefectInsightData,
  IssueInsightChartItem,
} from '../types';

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

const REQUIRED_FIELDS = [
  '缺陷ID',
  '缺陷摘要',
  '任务编号',
  '系统名称',
  '系统CODE',
  '需求编号',
  '计划发布日期',
  '缺陷状态',
  '缺陷修复人',
  '缺陷修复人p13',
  '缺陷严重度',
  '重现频率',
  '业务影响',
  '缺陷来源',
  '缺陷原因',
  '缺陷子原因',
  '缺陷描述',
  '缺陷修复描述',
  '测试阶段',
  '分配处理人',
  '分配处理人P13',
  '缺陷修复时长',
  '修复轮次',
  '功能区',
  '缺陷关闭时间',
  '开发团队',
  '测试团队',
  '测试用例库',
  '功能模块',
  '测试项',
  '创建人姓名',
  '创建人P13',
  '创建时间',
  '是否初级缺陷',
  '初级缺陷依据',
];

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
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<DefectInsightData | null>(null);

  const mutation = useMutation({
    mutationFn: importDefectAnalysis,
    onSuccess: (response) => {
      if (response.success && response.data) {
        setResult(response.data);
        message.success(`导入完成，共识别 ${response.data.overview.total_records} 条缺陷记录`);
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
            缺陷总结
          </Title>
          <Text type="secondary">上传缺陷台账 Excel，按摘要、严重度、业务影响、来源、原因和子原因自动归纳并输出图表</Text>
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
        title="导入字段要求（共 35 项）"
        description={
          <Space wrap size={[8, 8]}>
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
            <span>上传缺陷台账</span>
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
              <p className="ant-upload-hint">模板需包含完整缺陷字段，系统会重点围绕缺陷摘要、严重度、业务影响、来源、原因和子原因做归纳。</p>
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
                  系统会自动统计严重度分布、业务影响、缺陷来源、原因热点、子原因热点和缺陷摘要热点。
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
                <Tag color="red">{result.overview.top_severity?.name || '暂无严重度'}</Tag>
                <Tag color="blue">{result.overview.top_source?.name || '暂无来源'}</Tag>
              </Space>
              <Title level={3} style={{ margin: 0 }}>
                {result.summary.headline}
              </Title>
              <Text type="secondary">系统已根据导入文件自动完成缺陷归纳，下面的图表和表格会随文件重新计算。</Text>
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
                <Statistic title="缺陷来源分类数" value={result.overview.source_count} prefix={<TagsOutlined />} />
              </Card>
            </Col>
            <Col xs={24} sm={12} xl={6}>
              <Card variant="borderless">
                <Statistic title="缺陷原因分类数" value={result.overview.reason_count} prefix={<BarChartOutlined />} />
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
              <Card title="建议优先治理方向" variant="borderless" style={{ height: '100%' }}>
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
    </div>
  );
};

export default DefectAnalysisPage;

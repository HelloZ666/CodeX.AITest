import React, { useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import {
  DownloadOutlined,
  EyeOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { saveAs } from 'file-saver';
import AISuggestions from '../components/AISuggestions/AISuggestions';
import type { AnalysisRecord, AnalysisRecordSummary, Project } from '../types';
import { listProjects, listRecords, getRecord } from '../utils/api';
import { exportReportHTML } from '../utils/exportReport';

const { Title, Text } = Typography;

function getGradeTag(score: number) {
  if (score >= 90) return <Tag color="green">A</Tag>;
  if (score >= 80) return <Tag color="blue">B</Tag>;
  if (score >= 60) return <Tag color="orange">C</Tag>;
  if (score >= 40) return <Tag color="volcano">D</Tag>;
  return <Tag color="red">F</Tag>;
}

const HistoryPage: React.FC = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery({
    queryKey: ['records', selectedProjectId],
    queryFn: () => listRecords({ project_id: selectedProjectId, limit: 50 }),
  });

  const { data: recordDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['record', selectedRecordId],
    queryFn: () => getRecord(selectedRecordId!),
    enabled: !!selectedRecordId,
  });

  const handleExportJSON = (record: AnalysisRecord) => {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    saveAs(blob, `analysis-report-${record.id}.json`);
  };

  const handleExportHTML = (record: AnalysisRecord) => {
    const project = projects.find((item: Project) => item.id === record.project_id);
    exportReportHTML(record, project?.name);
  };

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
    },
    {
      title: '项目',
      dataIndex: 'project_id',
      key: 'project_id',
      width: 120,
      render: (id: number) => {
        const project = projects.find((item: Project) => item.id === id);
        return project ? project.name : `#${id}`;
      },
    },
    {
      title: '评分',
      dataIndex: 'test_score',
      key: 'test_score',
      width: 100,
      render: (score: number) => score != null ? (
        <Space>
          {getGradeTag(score)}
          <Text>{score.toFixed(1)}</Text>
        </Space>
      ) : '—',
      sorter: (a: AnalysisRecordSummary, b: AnalysisRecordSummary) => a.test_score - b.test_score,
    },
    {
      title: 'Token 用量',
      dataIndex: 'token_usage',
      key: 'token_usage',
      width: 120,
      render: (value: number) => value != null && value > 0 ? value.toLocaleString() : '—',
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 90,
      render: (value: number) => value != null ? `${value}ms` : '—',
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 88,
      render: (_: unknown, record: AnalysisRecordSummary) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRecordId(record.id);
            setDrawerOpen(true);
          }}
        >
          详情
        </Button>
      ),
    },
  ];

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
            <HistoryOutlined style={{ marginRight: 12 }} />
            历史记录
          </Title>
        </div>
        <Space>
          <Text strong>筛选项目：</Text>
          <Select
            style={{ width: 240 }}
            placeholder="全部项目"
            allowClear
            value={selectedProjectId}
            onChange={setSelectedProjectId}
            options={projects.map((project: Project) => ({ label: project.name, value: project.id }))}
            size="large"
          />
        </Space>
      </div>

      {recordsLoading ? (
        <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
      ) : records.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <Empty description="暂无分析记录" />
        </Card>
      ) : (
        <Card bordered={false} bodyStyle={{ padding: 0 }} style={{ background: 'transparent', boxShadow: 'none' }}>
          <Table
            dataSource={records}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 20 }}
            rowClassName="glass-table-row"
          />
        </Card>
      )}

      <Drawer
        title={`分析记录详情 #${selectedRecordId}`}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedRecordId(null);
        }}
        width={720}
        extra={recordDetail ? (
          <Space>
            <Button icon={<DownloadOutlined />} onClick={() => handleExportJSON(recordDetail)}>
              JSON
            </Button>
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => handleExportHTML(recordDetail)}>
              导出报告
            </Button>
          </Space>
        ) : null}
      >
        {detailLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
        ) : recordDetail ? (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space size="large">
                <Text>评分：<Text strong>{recordDetail.test_score?.toFixed(1) ?? '—'}</Text></Text>
                <Text>耗时：<Text strong>{recordDetail.duration_ms ?? 0}ms</Text></Text>
                <Text>Token：<Text strong>{(recordDetail.token_usage ?? 0).toLocaleString()}</Text></Text>
              </Space>
            </Card>

            {recordDetail.test_coverage_result && (() => {
              const coverage = recordDetail.test_coverage_result as Record<string, unknown>;
              const details = (coverage.details || []) as Array<Record<string, unknown>>;
              const covered = (coverage.covered || []) as string[];
              const uncovered = (coverage.uncovered || []) as string[];
              const rate = typeof coverage.coverage_rate === 'number' ? coverage.coverage_rate : 0;

              return (
                <Card title="覆盖率详情" size="small" style={{ marginBottom: 16 }}>
                  <Space size="large" style={{ marginBottom: 12 }}>
                    <Text>覆盖率：<Text strong>{(rate * 100).toFixed(1)}%</Text></Text>
                    <Text>已覆盖：<Tag color="green">{covered.length}</Tag></Text>
                    <Text>未覆盖：<Tag color="red">{uncovered.length}</Tag></Text>
                  </Space>
                  <Table
                    dataSource={details}
                    rowKey={(_, index) => String(index)}
                    size="small"
                    pagination={false}
                    columns={[
                      { title: '方法', dataIndex: 'method', key: 'method' },
                      { title: '描述', dataIndex: 'description', key: 'description' },
                      {
                        title: '状态',
                        dataIndex: 'is_covered',
                        key: 'is_covered',
                        width: 80,
                        render: (value: boolean) => value
                          ? <Tag color="green">已覆盖</Tag>
                          : <Tag color="red">未覆盖</Tag>,
                      },
                      {
                        title: '匹配用例',
                        dataIndex: 'matched_tests',
                        key: 'matched_tests',
                        render: (value: string[]) => (value || []).join(', ') || '—',
                      },
                    ]}
                  />
                </Card>
              );
            })()}

            {recordDetail.ai_suggestions ? (
              <AISuggestions
                analysis={recordDetail.ai_suggestions as never}
                usage={null}
              />
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
};

export default HistoryPage;

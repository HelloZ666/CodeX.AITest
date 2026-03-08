import React, { useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Select,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import { EyeOutlined, HistoryOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import RequirementAnalysisResultView from '../components/RequirementAnalysis/RequirementAnalysisResult';
import {
  getRequirementAnalysisRecord,
  listProjects,
  listRequirementAnalysisRecords,
} from '../utils/api';
import type { Project, RequirementAnalysisRecordSummary } from '../types';

const { Title } = Typography;

const RequirementAnalysisHistoryPage: React.FC = () => {
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const recordsQuery = useQuery({
    queryKey: ['requirement-analysis-records', selectedProjectId],
    queryFn: () => listRequirementAnalysisRecords({ project_id: selectedProjectId, limit: 50 }),
  });

  const detailQuery = useQuery({
    queryKey: ['requirement-analysis-record', selectedRecordId],
    queryFn: () => getRequirementAnalysisRecord(selectedRecordId as number),
    enabled: selectedRecordId !== null,
  });

  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 72 },
    { title: '项目', dataIndex: 'project_name', key: 'project_name', width: 160, render: (value: string | null) => value || '—' },
    { title: '需求文档', dataIndex: 'requirement_file_name', key: 'requirement_file_name', width: 220, ellipsis: true },
    { title: '生产问题文件', dataIndex: 'production_issue_file_name', key: 'production_issue_file_name', width: 180, ellipsis: true, render: (value: string | null) => value || '—' },
    { title: '测试问题文件', dataIndex: 'test_issue_file_name', key: 'test_issue_file_name', width: 180, ellipsis: true, render: (value: string | null) => value || '—' },
    { title: '命中需求点', dataIndex: 'matched_requirements', key: 'matched_requirements', width: 112 },
    { title: '生产命中', dataIndex: 'production_hit_count', key: 'production_hit_count', width: 100 },
    { title: '测试命中', dataIndex: 'test_hit_count', key: 'test_hit_count', width: 100 },
    {
      title: 'AI',
      dataIndex: 'use_ai',
      key: 'use_ai',
      width: 90,
      render: (value: boolean) => <Tag color={value ? 'success' : 'default'}>{value ? 'DeepSeek' : '关闭'}</Tag>,
    },
    {
      title: 'Token',
      dataIndex: 'token_usage',
      key: 'token_usage',
      width: 100,
      render: (value: number) => value ? value.toLocaleString() : '—',
    },
    {
      title: '成本',
      dataIndex: 'cost',
      key: 'cost',
      width: 100,
      render: (value: number) => value ? `¥${value.toFixed(6)}` : '—',
    },
    {
      title: '耗时',
      dataIndex: 'duration_ms',
      key: 'duration_ms',
      width: 90,
      render: (value: number) => `${value}ms`,
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
      width: 96,
      render: (_: unknown, record: RequirementAnalysisRecordSummary) => (
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
            <HistoryOutlined style={{ marginRight: 12 }} />
            分析记录
          </Title>
        </div>
        <Select
          allowClear
          placeholder="按项目筛选"
          style={{ width: 260 }}
          value={selectedProjectId}
          onChange={(value) => setSelectedProjectId(value)}
          onClear={() => setSelectedProjectId(undefined)}
          options={(projectsQuery.data ?? []).map((project: Project) => ({
            value: project.id,
            label: project.name,
          }))}
        />
      </div>

      <Card variant="borderless">
        {recordsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />
        ) : (recordsQuery.data ?? []).length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无需求分析记录" />
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={recordsQuery.data}
            scroll={{ x: 1500 }}
            pagination={{ pageSize: 10 }}
          />
        )}
      </Card>

      <Drawer
        title="需求分析详情"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={960}
      >
        {detailQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
        ) : detailQuery.data ? (
          <RequirementAnalysisResultView result={detailQuery.data.result_snapshot} />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未找到记录详情" />
        )}
      </Drawer>
    </div>
  );
};

export default RequirementAnalysisHistoryPage;

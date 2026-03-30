import React, { useState } from 'react';
import { Button, Card, Empty, Select, Space, Spin, Table } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  EyeOutlined,
  HistoryOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import DashboardHero from '../components/Layout/DashboardHero';
import type { CaseQualityRecordSummary, Project } from '../types';
import { listCaseQualityRecords, listProjects } from '../utils/api';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

const CaseQualityRecordsPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const recordsQuery = useQuery({
    queryKey: ['case-quality-records', selectedProjectId],
    queryFn: () => listCaseQualityRecords({ project_id: selectedProjectId, limit: 100 }),
  });

  const columns: ColumnsType<CaseQualityRecordSummary> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 84,
    },
    {
      title: '项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 180,
      render: (value: string | null, record) => value || `#${record.project_id}`,
    },
    {
      title: '需求文档',
      dataIndex: 'requirement_file_name',
      key: 'requirement_file_name',
      width: 220,
      ellipsis: true,
    },
    {
      title: '代码改动文件',
      dataIndex: 'code_changes_file_name',
      key: 'code_changes_file_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: '测试用例文件',
      dataIndex: 'test_cases_file_name',
      key: 'test_cases_file_name',
      width: 200,
      ellipsis: true,
    },
    {
      title: '需求得分',
      dataIndex: 'requirement_score',
      key: 'requirement_score',
      width: 100,
      render: (value: number | null) => (value == null ? '--' : value),
    },
    {
      title: '案例得分',
      dataIndex: 'case_score',
      key: 'case_score',
      width: 100,
      render: (value: number | null) => (value == null ? '--' : value),
    },
    {
      title: '总耗时',
      dataIndex: 'total_duration_ms',
      key: 'total_duration_ms',
      width: 110,
      render: (value: number) => `${value}ms`,
    },
    {
      title: '总 Token',
      dataIndex: 'total_token_usage',
      key: 'total_token_usage',
      width: 120,
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 108,
      fixed: 'right',
      render: (_, record) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          className="glass-table-action-button"
          onClick={() => navigate(`/functional-testing/records/${record.id}`)}
        >
          详情
        </Button>
      ),
    },
  ];

  return (
    <div>
      <DashboardHero
        title="案例质检分析记录"
        actions={(
          <Button
            type="primary"
            size="large"
            icon={<SafetyCertificateOutlined />}
            onClick={() => navigate('/functional-testing/case-quality')}
          >
            进入案例质检
          </Button>
        )}
      />

      <Card variant="borderless" style={{ marginBottom: 24 }}>
        <Select
          allowClear
          showSearch
          size="large"
          style={{ width: '100%' }}
          placeholder="按项目筛选"
          value={selectedProjectId}
          options={(projectsQuery.data ?? []).map((project: Project) => ({
            value: project.id,
            label: project.name,
          }))}
          onChange={(value) => setSelectedProjectId(value)}
          onClear={() => setSelectedProjectId(undefined)}
          optionFilterProp="label"
        />
      </Card>

      <Card
        variant="borderless"
        title={(
          <Space>
            <HistoryOutlined />
            <span>综合记录列表</span>
          </Space>
        )}
        styles={{ body: { padding: 0 } }}
      >
        {recordsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : (recordsQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="暂无案例质检记录" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={recordsQuery.data}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1500 }}
            className="glass-records-table"
            rowClassName="glass-table-row"
          />
        )}
      </Card>
    </div>
  );
};

export default CaseQualityRecordsPage;

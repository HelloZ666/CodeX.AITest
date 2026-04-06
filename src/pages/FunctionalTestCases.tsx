import React, { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DownloadOutlined,
  EyeOutlined,
  FolderOpenOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import DashboardHero from '../components/Layout/DashboardHero';
import type {
  FunctionalTestCase,
  FunctionalTestCaseRecordSummary,
} from '../types';
import { exportFunctionalTestCasesCsv } from '../utils/exportTestCases';
import {
  extractApiErrorMessage,
  getFunctionalTestCaseRecord,
  listFunctionalTestCaseRecords,
} from '../utils/api';

const { Text, Title } = Typography;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

function buildExportFileName(record: Pick<FunctionalTestCaseRecordSummary, 'requirement_file_name'>): string {
  const baseName = record.requirement_file_name.replace(/\.[^.]+$/, '').trim();
  return `${baseName || '测试案例'}-测试案例`;
}

const caseColumns: ColumnsType<FunctionalTestCase> = [
  {
    title: '用例 ID',
    dataIndex: 'case_id',
    key: 'case_id',
    width: 140,
    render: (value: string) => <Text code>{value}</Text>,
  },
  {
    title: '用例描述',
    dataIndex: 'description',
    key: 'description',
    width: 240,
  },
  {
    title: '测试步骤',
    dataIndex: 'steps',
    key: 'steps',
    render: (value: string) => <div style={{ whiteSpace: 'pre-wrap' }}>{value}</div>,
  },
  {
    title: '预期结果',
    dataIndex: 'expected_result',
    key: 'expected_result',
    render: (value: string) => <div style={{ whiteSpace: 'pre-wrap' }}>{value}</div>,
  },
];

const FunctionalTestCasesPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportingRecordId, setExportingRecordId] = useState<number | null>(null);

  const recordsQuery = useQuery({
    queryKey: ['functional-test-case-records'],
    queryFn: () => listFunctionalTestCaseRecords({ limit: 100 }),
  });

  const detailQuery = useQuery({
    queryKey: ['functional-test-case-record', selectedRecordId],
    queryFn: () => getFunctionalTestCaseRecord(selectedRecordId as number),
    enabled: selectedRecordId !== null,
  });

  const handlePreview = (recordId: number) => {
    setSelectedRecordId(recordId);
    setDrawerOpen(true);
  };

  const handleExport = async (record: FunctionalTestCaseRecordSummary) => {
    setExportingRecordId(record.id);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ['functional-test-case-record', record.id],
        queryFn: () => getFunctionalTestCaseRecord(record.id),
      });
      exportFunctionalTestCasesCsv(detail.cases, buildExportFileName(record));
      message.success('测试案例导出成功');
    } catch (error) {
      message.error(extractApiErrorMessage(error, '测试案例导出失败'));
    } finally {
      setExportingRecordId(null);
    }
  };

  const columns: ColumnsType<FunctionalTestCaseRecordSummary> = [
    {
      title: '生成时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '需求文档名称',
      dataIndex: 'requirement_file_name',
      key: 'requirement_file_name',
      ellipsis: true,
    },
    {
      title: '操作人',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 140,
      render: (value: string | null) => value || '--',
    },
    {
      title: '案例条数',
      dataIndex: 'case_count',
      key: 'case_count',
      width: 110,
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      onCell: () => ({ className: 'functional-test-cases__actions-cell' }),
      render: (_, record) => (
        <div className="functional-test-cases__actions">
          <Button
            size="small"
            aria-label="预览"
            icon={<EyeOutlined />}
            className="glass-table-action-button functional-test-cases__action-button"
            onClick={() => handlePreview(record.id)}
          >
            预览
          </Button>
          <Button
            size="small"
            aria-label="导出"
            icon={<DownloadOutlined />}
            className="glass-table-action-button functional-test-cases__action-button"
            loading={exportingRecordId === record.id}
            onClick={() => void handleExport(record)}
          >
            导出
          </Button>
        </div>
      ),
    },
  ];

  const selectedDetail = detailQuery.data;

  return (
    <div>
      <DashboardHero
        eyebrow="功能测试"
        title="测试案例"
        description="案例生成模块产出的测试用例会自动保存到这里，支持统一预览和导出。"
        chips={[
          { label: `已保存 ${recordsQuery.data?.length ?? 0} 条记录`, tone: 'accent' },
        ]}
        actions={(
          <Button
            type="primary"
            size="large"
            icon={<FolderOpenOutlined />}
            onClick={() => navigate('/functional-testing/case-generation')}
          >
            去生成案例
          </Button>
        )}
      />

      <Card
        variant="borderless"
        title="测试案例记录"
        styles={{ body: { padding: 0 } }}
      >
        {recordsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : (recordsQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="暂无已保存的测试案例" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={recordsQuery.data}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 980 }}
            className="glass-records-table"
            rowClassName="glass-table-row"
          />
        )}
      </Card>

      <Drawer
        title="测试案例预览"
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedRecordId(null);
        }}
        size="large"
        extra={selectedDetail ? (
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exportingRecordId === selectedDetail.id}
            onClick={() => void handleExport(selectedDetail)}
          >
            导出当前案例
          </Button>
        ) : null}
      >
        {detailQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : selectedDetail ? (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space size={[12, 12]} wrap>
                <Tag color="processing">{formatDateTime(selectedDetail.created_at)}</Tag>
                <Tag>{selectedDetail.operator_name || '未知操作人'}</Tag>
                <Tag color="blue">{selectedDetail.case_count} 条案例</Tag>
                <Tag color={selectedDetail.generation_mode === 'ai' ? 'success' : 'default'}>
                  {selectedDetail.generation_mode === 'ai' ? 'AI 生成' : '规则回退'}
                </Tag>
                {selectedDetail.provider ? <Tag>{selectedDetail.provider}</Tag> : null}
              </Space>
              <div style={{ marginTop: 12 }}>
                <Text strong>需求文档：</Text>
                <Text>{selectedDetail.requirement_file_name}</Text>
              </div>
            </Card>

            {selectedDetail.summary ? (
              <Alert
                type={selectedDetail.generation_mode === 'ai' ? 'info' : 'warning'}
                showIcon
                title="生成摘要"
                description={selectedDetail.summary}
                style={{ marginBottom: 16 }}
              />
            ) : null}

            {selectedDetail.error ? (
              <Alert
                type="warning"
                showIcon
                title="生成说明"
                description={selectedDetail.error}
                style={{ marginBottom: 16 }}
              />
            ) : null}

            <Title level={5} style={{ marginTop: 0 }}>案例明细</Title>
            <Table
              rowKey="case_id"
              columns={caseColumns}
              dataSource={selectedDetail.cases}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 980 }}
            />
          </div>
        ) : (
          <Empty description="未找到测试案例详情" />
        )}
      </Drawer>
    </div>
  );
};

export default FunctionalTestCasesPage;

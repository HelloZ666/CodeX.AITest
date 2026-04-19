import React, { useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { saveAs } from 'file-saver';
import DashboardHero from '../components/Layout/DashboardHero';
import type { ConfigRequirementDocumentRecord } from '../types';
import {
  downloadConfigRequirementDocument,
  extractApiErrorMessage,
  listConfigRequirementDocuments,
} from '../utils/api';

const { Text } = Typography;

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
  return new Date(value).toLocaleString('zh-CN');
}

const ConfigRequirementDocumentsPage: React.FC = () => {
  const [downloadingDocumentId, setDownloadingDocumentId] = useState<number | null>(null);

  const documentsQuery = useQuery({
    queryKey: ['config-requirement-documents'],
    queryFn: () => listConfigRequirementDocuments({ limit: 100 }),
  });

  const handleDownload = async (record: ConfigRequirementDocumentRecord) => {
    setDownloadingDocumentId(record.id);
    try {
      const blob = await downloadConfigRequirementDocument(record.id);
      saveAs(blob, record.file_name || '需求文档');
    } catch (error) {
      message.error(extractApiErrorMessage(error, '下载需求文档失败'));
    } finally {
      setDownloadingDocumentId(null);
    }
  };

  const columns: ColumnsType<ConfigRequirementDocumentRecord> = [
    {
      title: '项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 160,
      render: (value: string | null) => value || <Text type="secondary">通用</Text>,
    },
    {
      title: '需求文档',
      dataIndex: 'file_name',
      key: 'file_name',
      ellipsis: true,
      width: 260,
    },
    {
      title: '类型',
      dataIndex: 'file_type',
      key: 'file_type',
      width: 100,
      render: (value: string) => <Tag>{value.toUpperCase()}</Tag>,
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 120,
      render: (value: number) => formatFileSize(value),
    },
    {
      title: '来源页面',
      dataIndex: 'source_page',
      key: 'source_page',
      width: 140,
    },
    {
      title: '操作人',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 140,
      render: (value: string | null) => value || '--',
    },
    {
      title: '操作账号',
      dataIndex: 'operator_username',
      key: 'operator_username',
      width: 140,
      render: (value: string | null) => value || '--',
    },
    {
      title: '操作时间',
      dataIndex: 'operated_at',
      key: 'operated_at',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 156,
      fixed: 'right',
      render: (_, record) => (
        <Space size={8}>
          <Button
            size="small"
            aria-label="下载需求文档"
            icon={<DownloadOutlined />}
            className="glass-table-action-button"
            loading={downloadingDocumentId === record.id}
            onClick={() => void handleDownload(record)}
          >
            下载
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <DashboardHero
        eyebrow="知识库管理"
        title="测试需求"
        description="功能测试相关页面提交过的需求文档会在这里按内容去重沉淀，形成测试需求台账，并保留最近一次操作信息。"
        chips={[
          { label: `去重后 ${documentsQuery.data?.length ?? 0} 份文档`, tone: 'accent' },
        ]}
      />

      <Card variant="borderless" title="测试需求台账" styles={{ body: { padding: 0 } }}>
        {documentsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : (documentsQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="暂无已沉淀的测试需求" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={documentsQuery.data}
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

export default ConfigRequirementDocumentsPage;

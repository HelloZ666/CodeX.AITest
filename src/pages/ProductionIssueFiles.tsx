import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  CheckCircleOutlined,
  FileExcelOutlined,
  InboxOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listProductionIssueFiles,
  uploadProductionIssueFile,
} from '../utils/api';
import type { ProductionIssueFileRecord } from '../types';

const { Dragger } = Upload;
const { Title, Text, Paragraph } = Typography;

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

function getTimeValue(value: string): number {
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const timestamp = new Date(normalized).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

const ProductionIssueFilesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [latestRecord, setLatestRecord] = useState<ProductionIssueFileRecord | null>(null);

  const filesQuery = useQuery({
    queryKey: ['production-issue-files'],
    queryFn: listProductionIssueFiles,
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: uploadProductionIssueFile,
    onSuccess: (record) => {
      setLatestRecord(record);
      setFile(null);
      setUploadModalOpen(false);
      queryClient.setQueryData<ProductionIssueFileRecord[]>(
        ['production-issue-files'],
        (previous = []) => [record, ...previous.filter((item) => item.id !== record.id)],
      );
      message.success(`上传完成，已保存 ${record.row_count} 条生产问题记录`);
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      const msg = err.response?.data?.detail || err.message || '上传失败';
      message.error(msg);
    },
  });

  const fileList: UploadFile[] = file
    ? [{ uid: file.name, name: file.name, status: 'done' }]
    : [];

  const latestFileId = useMemo(() => {
    let latestFile: ProductionIssueFileRecord | null = null;

    for (const item of filesQuery.data ?? []) {
      if (!latestFile || getTimeValue(item.created_at) > getTimeValue(latestFile.created_at)) {
        latestFile = item;
      }
    }

    return latestFile?.id ?? null;
  }, [filesQuery.data]);

  const openUploadModal = () => {
    setFile(null);
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setFile(null);
    setUploadModalOpen(false);
  };

  const handleUpload = () => {
    if (!file) {
      message.warning('请先选择要上传的生产问题文件');
      return;
    }
    uploadMutation.mutate(file);
  };

  const columns = [
    {
      title: '生产问题文件',
      dataIndex: 'file_name',
      key: 'file_name',
      render: (value: string, record: ProductionIssueFileRecord) => (
        <Space>
          {record.id === latestFileId ? (
            <Tag icon={<CheckCircleOutlined />} color="success">
              当前生效
            </Tag>
          ) : null}
          <Tooltip
            title={`文件：${record.file_name}｜记录数：${record.row_count}｜大小：${formatFileSize(record.file_size)}`}
          >
            <Text ellipsis style={{ maxWidth: 220 }}>
              {value}
            </Text>
          </Tooltip>
        </Space>
      ),
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
  ];

  if (filesQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
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
            生产环境缺陷
          </Title>
        </div>
      </div>

      {latestRecord && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 24 }}
          title={`最近上传：${latestRecord.file_name}`}
          description={`已保存 ${latestRecord.row_count} 条记录，上传时间 ${formatDateTime(latestRecord.created_at)}`}
        />
      )}

      <Card
        variant="borderless"
        styles={{ body: { padding: 0 } }}
        style={{ background: 'transparent', boxShadow: 'none' }}
        title="已上传生产问题文件"
        extra={(
          <Space wrap>
            <Text type="secondary">共 {filesQuery.data?.length ?? 0} 个文件</Text>
            <Button type="primary" icon={<UploadOutlined />} onClick={openUploadModal}>
              上传文件
            </Button>
          </Space>
        )}
      >
        <Table<ProductionIssueFileRecord>
          rowKey="id"
          dataSource={filesQuery.data ?? []}
          columns={columns}
          pagination={{ pageSize: 10 }}
          rowClassName="glass-table-row"
          locale={{
            emptyText: filesQuery.isError ? '加载失败，请稍后重试' : '暂无上传记录',
          }}
        />
      </Card>

      <Modal
        title="上传生产问题文件"
        open={uploadModalOpen}
        onOk={handleUpload}
        onCancel={closeUploadModal}
        confirmLoading={uploadMutation.isPending}
        okText="上传并保存"
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="上传说明"
            description={(
              <Space direction="vertical" size={4}>
                <span>支持 `.xlsx / .xls / .csv`，上传全局生产问题台账后会直接更新当前文件列表。</span>
                <span>需求分析和生产问题分析默认使用最新上传文件。</span>
                <span>字段要求与“生产问题分析”页面一致，系统会在上传时校验格式。</span>
              </Space>
            )}
          />
          <Card
            variant="borderless"
            title={
              <Space>
                <FileExcelOutlined style={{ color: '#4f7cff' }} />
                <span>上传生产问题台账</span>
              </Space>
            }
          >
            <Dragger
              accept=".xlsx,.xls,.csv"
              maxCount={1}
              multiple={false}
              beforeUpload={(nextFile) => {
                setFile(nextFile);
                return false;
              }}
              onRemove={() => {
                setFile(null);
              }}
              fileList={fileList}
              style={{ background: 'rgba(255,255,255,0.45)' }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#667eea' }} />
              </p>
              <p className="ant-upload-text">拖拽文件到这里，或点击选择文件</p>
            </Dragger>
            <Paragraph style={{ margin: '16px 0 0', minHeight: 22 }}>
              {file ? `当前文件：${file.name}` : '未选择文件'}
            </Paragraph>
          </Card>
        </Space>
      </Modal>
    </div>
  );
};

export default ProductionIssueFilesPage;

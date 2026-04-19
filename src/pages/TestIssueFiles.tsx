import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
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
  listProjects,
  listTestIssueFiles,
  uploadTestIssueFile,
} from '../utils/api';
import type {
  Project,
  TestIssueFileRecord,
} from '../types';

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

interface ProjectRow extends Project {
  latest_test_issue_file: TestIssueFileRecord | null;
}

const TestIssueFilesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [uploadingProject, setUploadingProject] = useState<Project | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [latestRecord, setLatestRecord] = useState<TestIssueFileRecord | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const filesQuery = useQuery({
    queryKey: ['test-issue-files', 'all'],
    queryFn: () => listTestIssueFiles(),
    staleTime: 30_000,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ projectId, nextFile }: { projectId: number; nextFile: File }) =>
      uploadTestIssueFile(projectId, nextFile),
    onSuccess: (record) => {
      setLatestRecord(record);
      setFile(null);
      setUploadingProject(null);
      queryClient.setQueryData<TestIssueFileRecord[]>(
        ['test-issue-files', 'all'],
        (previous = []) => [record, ...previous.filter((item) => item.id !== record.id)],
      );
      message.success(`上传完成，项目「${record.project_name}」已绑定 ${record.row_count} 条测试问题记录`);
    },
    onError: (err: Error & { response?: { data?: { detail?: string } } }) => {
      const msg = err.response?.data?.detail || err.message || '上传失败';
      message.error(msg);
    },
  });

  const rows = useMemo<ProjectRow[]>(() => {
    const latestByProject = new Map<number, TestIssueFileRecord>();
    for (const item of filesQuery.data ?? []) {
      if (!latestByProject.has(item.project_id)) {
        latestByProject.set(item.project_id, item);
      }
    }

    return (projectsQuery.data ?? []).map((project) => ({
      ...project,
      latest_test_issue_file: latestByProject.get(project.id) ?? null,
    }));
  }, [filesQuery.data, projectsQuery.data]);

  const fileList: UploadFile[] = file
    ? [{ uid: file.name, name: file.name, status: 'done' }]
    : [];

  const openUploadModal = (project: Project) => {
    setUploadingProject(project);
    setFile(null);
  };

  const closeUploadModal = () => {
    setUploadingProject(null);
    setFile(null);
  };

  const handleUpload = () => {
    if (!uploadingProject) {
      message.warning('请先选择项目');
      return;
    }
    if (!file) {
      message.warning('请先选择要上传的测试问题文件');
      return;
    }
    uploadMutation.mutate({ projectId: uploadingProject.id, nextFile: file });
  };

  const columns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '项目描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (value: string) => value || <Text type="secondary">无描述</Text>,
    },
    {
      title: '测试问题文件',
      dataIndex: 'latest_test_issue_file',
      key: 'latest_test_issue_file',
      width: 260,
      render: (record: TestIssueFileRecord | null) => (
        <Space>
          {record ? (
            <>
              <Tag icon={<CheckCircleOutlined />} color="success">已绑定</Tag>
              <Tooltip
                title={`文件：${record.file_name}｜记录数：${record.row_count}｜大小：${formatFileSize(record.file_size)}`}
              >
                <Text ellipsis style={{ maxWidth: 140 }}>
                  {record.file_name}
                </Text>
              </Tooltip>
            </>
          ) : (
            <Tag color="default">未上传</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '最近上传时间',
      dataIndex: 'latest_test_issue_file',
      key: 'latest_upload_time',
      width: 180,
      render: (record: TestIssueFileRecord | null) =>
        record ? formatDateTime(record.created_at) : <Text type="secondary">暂无</Text>,
    },
    {
      title: '项目创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: ProjectRow) => (
        <Button
          size="small"
          icon={<UploadOutlined />}
          onClick={() => openUploadModal(record)}
        >
          {record.latest_test_issue_file ? '替换' : '上传'}
        </Button>
      ),
    },
  ];

  if (projectsQuery.isLoading || filesQuery.isLoading) {
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
            测试版本缺陷
          </Title>
        </div>
      </div>

      {(projectsQuery.data ?? []).length === 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 24 }}
          title="请先维护项目"
          description="当前还没有可绑定的项目，请先到“项目管理”中创建项目。"
        />
      )}

      {latestRecord && (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 24 }}
          title={`最近上传：${latestRecord.file_name}`}
          description={`已绑定到项目「${latestRecord.project_name}」，保存 ${latestRecord.row_count} 条记录，上传时间 ${formatDateTime(latestRecord.created_at)}`}
        />
      )}

      {(projectsQuery.data ?? []).length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 16, color: '#666' }}>暂无项目，请先到项目管理中创建项目</span>}
          />
        </Card>
      ) : (
        <Card
          variant="borderless"
          styles={{ body: { padding: 0 } }}
          style={{ background: 'transparent', boxShadow: 'none' }}
        >
          <Table
            dataSource={rows}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            rowClassName="glass-table-row"
          />
        </Card>
      )}

      <Modal
        title={`上传测试问题文件 — ${uploadingProject?.name ?? ''}`}
        open={uploadingProject !== null}
        onOk={handleUpload}
        onCancel={closeUploadModal}
        confirmLoading={uploadMutation.isPending}
        okText="上传并绑定"
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="上传说明"
            description={(
              <Space direction="vertical" size={4}>
                <span>当前项目：{uploadingProject?.name ?? '未选择'}</span>
                <span>支持 `.xlsx / .xls / .csv`，请先确认项目后再上传测试问题文件。</span>
                <span>新文件会绑定到当前项目，并作为该项目测试问题分析的最新数据来源。</span>
                <span>字段要求与“测试问题分析”页面一致，系统会在上传时校验格式。</span>
              </Space>
            )}
          />
          <Card
            variant="borderless"
            title={
              <Space>
                <FileExcelOutlined style={{ color: '#4f7cff' }} />
                <span>上传测试问题台账</span>
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

export default TestIssueFilesPage;

import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  DownloadOutlined,
  FilePdfOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveAs } from 'file-saver';
import DashboardHero from '../components/Layout/DashboardHero';
import { PdfSnapshotPreview } from '../components/PdfPreview/PdfSnapshotPreview';
import type { PdfTemplate, PdfTemplateDetail } from '../types';
import {
  deletePdfTemplate,
  downloadPdfTemplate,
  extractApiErrorMessage,
  getPdfTemplate,
  listPdfTemplates,
  listProjects,
  uploadPdfTemplate,
} from '../utils/api';

const { Text } = Typography;

interface UploadTemplateFormValues {
  name?: string;
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

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

const ConfigPdfTemplatesPage: React.FC = () => {
  const [form] = Form.useForm<UploadTemplateFormValues>();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [downloadingTemplateId, setDownloadingTemplateId] = useState<number | null>(null);
  const [previewTemplateId, setPreviewTemplateId] = useState<number | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (selectedProjectId === undefined && (projectsQuery.data ?? []).length > 0) {
      setSelectedProjectId(projectsQuery.data?.[0]?.id);
    }
  }, [projectsQuery.data, selectedProjectId]);

  const templatesQuery = useQuery({
    queryKey: ['pdf-templates', selectedProjectId],
    queryFn: () => listPdfTemplates({ project_id: selectedProjectId, limit: 100 }),
    enabled: selectedProjectId !== undefined,
  });

  const previewQuery = useQuery<PdfTemplateDetail>({
    queryKey: ['pdf-template-preview', previewTemplateId],
    queryFn: () => getPdfTemplate(previewTemplateId as number),
    enabled: previewTemplateId !== null,
  });

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project) => ({ value: project.id, label: project.name })),
    [projectsQuery.data],
  );

  const uploadMutation = useMutation({
    mutationFn: async (values: UploadTemplateFormValues) => {
      if (selectedProjectId === undefined) {
        throw new Error('请先选择项目');
      }
      if (!templateFile) {
        throw new Error('请上传 PDF 模板文件');
      }
      return uploadPdfTemplate(selectedProjectId, templateFile, values.name);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pdf-templates', selectedProjectId] });
      message.success('PDF模板已上传');
      setUploadOpen(false);
      setTemplateFile(null);
      form.resetFields();
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '上传PDF模板失败')),
  });

  const deleteMutation = useMutation({
    mutationFn: deletePdfTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pdf-templates', selectedProjectId] });
      message.success('PDF模板已删除');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '删除PDF模板失败')),
  });

  const openUpload = () => {
    setTemplateFile(null);
    form.resetFields();
    setUploadOpen(true);
  };

  const handleDownload = async (record: PdfTemplate) => {
    setDownloadingTemplateId(record.id);
    try {
      const blob = await downloadPdfTemplate(record.id);
      saveAs(blob, record.file_name || `${record.name}.pdf`);
    } catch (error) {
      message.error(extractApiErrorMessage(error, '下载PDF模板失败'));
    } finally {
      setDownloadingTemplateId(null);
    }
  };

  const columns: ColumnsType<PdfTemplate> = [
    {
      title: '模板名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (value: string) => (
        <Space>
          <FilePdfOutlined />
          <Text strong>{value}</Text>
        </Space>
      ),
    },
    {
      title: '项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 160,
      render: (value: string | null) => value || '--',
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      ellipsis: true,
      width: 260,
    },
    {
      title: '页数',
      dataIndex: 'page_count',
      key: 'page_count',
      width: 90,
      render: (value: number) => <Tag>{value}</Tag>,
    },
    {
      title: '大小',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 110,
      render: formatFileSize,
    },
    {
      title: '上传人',
      dataIndex: 'operator_display_name',
      key: 'operator_display_name',
      width: 140,
      render: (_value: string | null, record) => record.operator_display_name || record.operator_username || '--',
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={8}>
          <Button
            size="small"
            aria-label="预览PDF模板"
            icon={<FileSearchOutlined />}
            onClick={() => setPreviewTemplateId(record.id)}
          />
          <Button
            size="small"
            aria-label="下载PDF模板"
            icon={<DownloadOutlined />}
            loading={downloadingTemplateId === record.id}
            onClick={() => void handleDownload(record)}
          />
          <Popconfirm
            title="确认删除该PDF模板吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger size="small" aria-label="删除PDF模板" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="pdf-template-page">
      <DashboardHero
        eyebrow="配置管理"
        title="PDF模板"
        description="按项目维护用于 PDF 核对的基准模板，删除仅做逻辑删除。"
        chips={[
          { label: `${templatesQuery.data?.length ?? 0} 个模板`, tone: 'accent' },
          { label: selectedProjectId ? '项目隔离' : '未选择项目', tone: 'neutral' },
        ]}
        actions={(
          <Space wrap>
            <Select
              showSearch
              value={selectedProjectId}
              options={projectOptions}
              loading={projectsQuery.isLoading}
              placeholder="选择项目"
              style={{ width: 260 }}
              onChange={setSelectedProjectId}
            />
            <Button
              icon={<ReloadOutlined />}
              disabled={selectedProjectId === undefined}
              onClick={() => void templatesQuery.refetch()}
            >
              刷新
            </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={selectedProjectId === undefined}
              onClick={openUpload}
            >
              上传模板
            </Button>
          </Space>
        )}
      />

      <Card variant="borderless" title="模板列表" styles={{ body: { padding: 0 } }}>
        {templatesQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : selectedProjectId === undefined ? (
          <div style={{ padding: 48 }}>
            <Empty description="请选择项目后维护PDF模板" />
          </div>
        ) : (templatesQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="当前项目暂无PDF模板" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={templatesQuery.data}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1330 }}
            className="glass-records-table"
            rowClassName="glass-table-row"
          />
        )}
      </Card>

      <Modal
        title="上传PDF模板"
        open={uploadOpen}
        onCancel={() => setUploadOpen(false)}
        okText="上传"
        confirmLoading={uploadMutation.isPending}
        onOk={() => void form.validateFields().then((values) => uploadMutation.mutate(values))}
      >
        <Form form={form} layout="vertical">
          <Form.Item label="所属项目">
            <Select value={selectedProjectId} options={projectOptions} disabled />
          </Form.Item>
          <Form.Item name="name" label="模板名称">
            <Input placeholder="不填则使用文件名" maxLength={100} />
          </Form.Item>
          <Form.Item label="PDF文件" required>
            <Upload.Dragger
              accept=".pdf,application/pdf"
              maxCount={1}
              showUploadList={false}
              beforeUpload={(file) => {
                setTemplateFile(file);
                return Upload.LIST_IGNORE;
              }}
            >
              <p className="ant-upload-drag-icon">
                <UploadOutlined />
              </p>
              <p className="ant-upload-text">{templateFile ? templateFile.name : '点击或拖拽PDF文件到这里'}</p>
            </Upload.Dragger>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={previewQuery.data ? `PDF模板预览：${previewQuery.data.name}` : 'PDF模板预览'}
        open={previewTemplateId !== null}
        onCancel={() => setPreviewTemplateId(null)}
        footer={null}
        width={980}
        className="pdf-template-preview-modal"
      >
        {previewQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : previewQuery.data ? (
          <div className="pdf-template-preview-scroll">
            <PdfSnapshotPreview snapshot={previewQuery.data.extraction} title={previewQuery.data.file_name} />
          </div>
        ) : (
          <Empty description="未找到PDF模板" />
        )}
      </Modal>
    </div>
  );
};

export default ConfigPdfTemplatesPage;

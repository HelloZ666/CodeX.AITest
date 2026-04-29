import React, { useMemo, useRef, useState } from 'react';
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
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EditOutlined,
  FolderOpenOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import DashboardHero from '../components/Layout/DashboardHero';
import type { KnowledgeSystemOverviewOutlineCategory, KnowledgeSystemOverviewSummary, Project } from '../types';
import {
  createKnowledgeSystemOverview,
  deleteKnowledgeSystemOverview,
  extractApiErrorMessage,
  listKnowledgeSystemOverviews,
  listProjects,
  updateKnowledgeSystemOverview,
} from '../utils/api';
import { parseKnowledgeSystemOverviewImport } from '../utils/knowledgeSystemOverview';

const { Text } = Typography;
const DEFAULT_OUTLINE_CATEGORY: KnowledgeSystemOverviewOutlineCategory = '功能视图';
const OUTLINE_CATEGORY_OPTIONS: Array<{
  label: KnowledgeSystemOverviewOutlineCategory;
  value: KnowledgeSystemOverviewOutlineCategory;
}> = [
  { label: '功能视图', value: '功能视图' },
  { label: '通用模板', value: '通用模板' },
];

interface CreateOverviewFormValues {
  project_id: number;
  title?: string;
  outline_category?: KnowledgeSystemOverviewOutlineCategory;
  description?: string;
}

interface EditOverviewFormValues {
  title?: string;
  outline_category?: KnowledgeSystemOverviewOutlineCategory;
  description?: string;
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

function resolveDefaultTitle(projectName: string): string {
  return `${projectName}系统功能全景图`;
}

function getSourceTagColor(sourceFormat: KnowledgeSystemOverviewSummary['source_format']): string {
  if (sourceFormat === 'xmind') {
    return 'processing';
  }
  if (sourceFormat === 'markdown') {
    return 'success';
  }
  return 'default';
}

function getSourceTagLabel(sourceFormat: KnowledgeSystemOverviewSummary['source_format']): string {
  if (sourceFormat === 'xmind') {
    return 'XMind导入';
  }
  if (sourceFormat === 'markdown') {
    return 'Markdown导入';
  }
  return '手工维护';
}

const KnowledgeSystemOverviewPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [keyword, setKeyword] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<KnowledgeSystemOverviewSummary | null>(null);
  const [pendingImportRecord, setPendingImportRecord] = useState<KnowledgeSystemOverviewSummary | null>(null);
  const [creatingForm] = Form.useForm<CreateOverviewFormValues>();
  const [editingForm] = Form.useForm<EditOverviewFormValues>();

  const overviewsQuery = useQuery({
    queryKey: ['knowledge-system-overviews'],
    queryFn: listKnowledgeSystemOverviews,
  });

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const overviews = overviewsQuery.data ?? [];
  const projects = projectsQuery.data ?? [];

  const filteredOverviews = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return overviews;
    }

    return overviews.filter((item) => (
      item.project_name.toLowerCase().includes(normalizedKeyword)
      || item.title.toLowerCase().includes(normalizedKeyword)
      || (item.outline_category || DEFAULT_OUTLINE_CATEGORY).toLowerCase().includes(normalizedKeyword)
      || (item.creator_name || '').toLowerCase().includes(normalizedKeyword)
      || (item.description || '').toLowerCase().includes(normalizedKeyword)
    ));
  }, [keyword, overviews]);

  const invalidateOverviews = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['knowledge-system-overviews'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (values: CreateOverviewFormValues) => createKnowledgeSystemOverview(values),
    onSuccess: async () => {
      message.success('系统功能全景图创建成功');
      await invalidateOverviews();
      setCreateModalOpen(false);
      creatingForm.resetFields();
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '系统功能全景图创建失败'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { overviewId: number; values: EditOverviewFormValues }) => (
      updateKnowledgeSystemOverview(payload.overviewId, payload.values)
    ),
    onSuccess: async () => {
      message.success('系统功能全景图信息已更新');
      await invalidateOverviews();
      setEditingRecord(null);
      editingForm.resetFields();
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '系统功能全景图更新失败'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteKnowledgeSystemOverview,
    onSuccess: async () => {
      message.success('系统功能全景图已删除');
      await invalidateOverviews();
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '系统功能全景图删除失败'));
    },
  });

  const importMutation = useMutation({
    mutationFn: async (payload: { overview: KnowledgeSystemOverviewSummary; file: File }) => {
      const parsed = await parseKnowledgeSystemOverviewImport(
        payload.file,
        payload.overview.title,
        null,
      );
      return updateKnowledgeSystemOverview(payload.overview.id, {
        mind_map_data: parsed.data,
        source_format: parsed.sourceFormat,
        source_file_name: parsed.sourceFileName,
      });
    },
    onSuccess: async () => {
      message.success('系统功能全景图导入成功');
      await invalidateOverviews();
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '系统功能全景图导入失败'));
    },
    onSettled: () => {
      setPendingImportRecord(null);
      if (importInputRef.current) {
        importInputRef.current.value = '';
      }
    },
  });

  const projectOptions = useMemo(
    () => projects.map((project: Project) => ({
      label: project.name,
      value: project.id,
    })),
    [projects],
  );

  const openCreateModal = () => {
    creatingForm.resetFields();
    creatingForm.setFieldValue('outline_category', DEFAULT_OUTLINE_CATEGORY);
    setCreateModalOpen(true);
  };

  const openEditModal = (record: KnowledgeSystemOverviewSummary) => {
    setEditingRecord(record);
    editingForm.setFieldsValue({
      title: record.title,
      outline_category: record.outline_category || DEFAULT_OUTLINE_CATEGORY,
      description: record.description,
    });
  };

  const handleCreateSubmit = async () => {
    const values = await creatingForm.validateFields();
    createMutation.mutate(values);
  };

  const handleEditSubmit = async () => {
    if (!editingRecord) {
      return;
    }
    const values = await editingForm.validateFields();
    updateMutation.mutate({
      overviewId: editingRecord.id,
      values,
    });
  };

  const handleProjectSelect = (projectId: number) => {
    const project = projects.find((item) => item.id === projectId);
    if (!project) {
      return;
    }
    const currentTitle = creatingForm.getFieldValue('title');
    if (!currentTitle?.trim()) {
      creatingForm.setFieldValue('title', resolveDefaultTitle(project.name));
    }
  };

  const handleImportClick = (record: KnowledgeSystemOverviewSummary) => {
    setPendingImportRecord(record);
    importInputRef.current?.click();
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !pendingImportRecord) {
      return;
    }
    importMutation.mutate({
      overview: pendingImportRecord,
      file,
    });
  };

  const columns: ColumnsType<KnowledgeSystemOverviewSummary> = [
    {
      title: '项目名称',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 220,
      render: (value: string) => (
        <div className="knowledge-overview-table__project">
          <div className="knowledge-overview-table__project-name">{value}</div>
        </div>
      ),
    },
    {
      title: '大纲标题',
      dataIndex: 'title',
      key: 'title',
      width: 240,
      render: (value: string) => value || <Text type="secondary">--</Text>,
    },
    {
      title: '大纲类别',
      dataIndex: 'outline_category',
      key: 'outline_category',
      width: 130,
      render: (value: KnowledgeSystemOverviewOutlineCategory | undefined) => (
        <Tag color={value === '通用模板' ? 'gold' : 'blue'}>
          {value || DEFAULT_OUTLINE_CATEGORY}
        </Tag>
      ),
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      width: 260,
      render: (value: string) => value || <Text type="secondary">--</Text>,
    },
    {
      title: '创建人',
      dataIndex: 'creator_name',
      key: 'creator_name',
      width: 160,
      render: (value: string | null) => value || <Text type="secondary">--</Text>,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '最近更新',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '来源',
      dataIndex: 'source_format',
      key: 'source_format',
      width: 140,
      render: (_value: KnowledgeSystemOverviewSummary['source_format'], record) => (
        <Space orientation="vertical" size={4}>
          <Tag color={getSourceTagColor(record.source_format)}>
            {getSourceTagLabel(record.source_format)}
          </Tag>
          {record.source_file_name ? (
            <Text type="secondary" className="knowledge-overview-table__source-file">
              {record.source_file_name}
            </Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 280,
      render: (_: unknown, record) => (
        <Space wrap size={8}>
          <Button
            size="small"
            type="primary"
            icon={<FolderOpenOutlined />}
            onClick={() => navigate(`/knowledge-base/system-overview/${record.id}`)}
          >
            大纲
          </Button>
          <Button
            size="small"
            icon={<UploadOutlined />}
            loading={importMutation.isPending && pendingImportRecord?.id === record.id}
            onClick={() => handleImportClick(record)}
          >
            导入
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => openEditModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除该系统功能全景图？"
            description="删除后该大纲画布与维护记录将一并移除。"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button
              size="small"
              danger
              icon={<DeleteOutlined />}
              loading={deleteMutation.isPending}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <DashboardHero
        title="系统功能全景图"
        chips={[
          { label: `已创建 ${overviews.length} 份大纲`, tone: 'accent' },
          { label: `可选项目 ${projects.length} 个`, tone: 'gold' },
        ]}
        actions={(
          <Button
            type="primary"
            size="large"
            icon={<PlusOutlined />}
            onClick={openCreateModal}
            disabled={projects.length === 0}
          >
            新建大纲
          </Button>
        )}
      />

      <Card variant="borderless" style={{ marginBottom: 24 }}>
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined />}
          placeholder="输入项目名称、大纲标题、大纲类别、说明或创建人进行筛选"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </Card>

      {overviews.length === 0 ? (
        <Card variant="borderless" className="dashboard-empty-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={(
              <span style={{ fontSize: 16, color: '#666' }}>
                {projects.length === 0
                  ? '暂无项目，请先到项目管理中创建项目'
                  : '暂无系统功能全景图，开始为项目创建第一份大纲吧'}
              </span>
            )}
          >
            <Button
              type="primary"
              size="large"
              onClick={openCreateModal}
              disabled={projects.length === 0}
              style={{ marginTop: 16 }}
            >
              新建大纲
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card variant="borderless" styles={{ body: { padding: 0 } }}>
          <Table
            rowKey="id"
            dataSource={filteredOverviews}
            columns={columns}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            rowClassName="glass-table-row"
            className="glass-records-table"
            scroll={{ x: 1800 }}
            locale={{ emptyText: '暂无匹配的系统功能全景图' }}
            loading={overviewsQuery.isLoading || projectsQuery.isLoading}
          />
        </Card>
      )}

      <Modal
        title="新建系统功能全景图"
        open={createModalOpen}
        onOk={() => void handleCreateSubmit()}
        onCancel={() => {
          setCreateModalOpen(false);
          creatingForm.resetFields();
        }}
        confirmLoading={createMutation.isPending}
      >
        <Form<CreateOverviewFormValues>
          form={creatingForm}
          layout="vertical"
          initialValues={{ outline_category: DEFAULT_OUTLINE_CATEGORY }}
        >
          <Form.Item
            name="project_id"
            label="所属项目"
            rules={[{ required: true, message: '请选择所属项目' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="请选择项目"
              options={projectOptions}
              onChange={handleProjectSelect}
              notFoundContent="暂无项目"
            />
          </Form.Item>
          <Form.Item
            name="outline_category"
            label="大纲类别"
            rules={[{ required: true, message: '请选择大纲类别' }]}
          >
            <Select options={OUTLINE_CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="title" label="大纲标题">
            <Input placeholder="默认使用“项目名系统功能全景图”" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={4} placeholder="可填写该全景图的业务范围、维护说明或使用约定" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑系统功能全景图信息"
        open={editingRecord !== null}
        onOk={() => void handleEditSubmit()}
        onCancel={() => {
          setEditingRecord(null);
          editingForm.resetFields();
        }}
        confirmLoading={updateMutation.isPending}
      >
        <Form<EditOverviewFormValues> form={editingForm} layout="vertical">
          <Form.Item label="所属项目">
            <Input value={editingRecord?.project_name} readOnly />
          </Form.Item>
          <Form.Item
            name="outline_category"
            label="大纲类别"
            rules={[{ required: true, message: '请选择大纲类别' }]}
          >
            <Select options={OUTLINE_CATEGORY_OPTIONS} />
          </Form.Item>
          <Form.Item name="title" label="大纲标题">
            <Input placeholder="请输入大纲标题" />
          </Form.Item>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={4} placeholder="可填写该全景图的业务范围、维护说明或使用约定" />
          </Form.Item>
        </Form>
      </Modal>

      <input
        ref={importInputRef}
        type="file"
        accept=".xmind,.md,.markdown,text/markdown"
        className="knowledge-overview-import-input"
        onChange={(event) => void handleImportFileChange(event)}
      />
    </div>
  );
};

export default KnowledgeSystemOverviewPage;

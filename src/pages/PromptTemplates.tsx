import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Popconfirm,
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
  EyeOutlined,
  MessageOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPromptTemplate,
  deletePromptTemplate,
  extractApiErrorMessage,
  listPromptTemplates,
  updatePromptTemplate,
} from '../utils/api';
import type { PromptTemplate } from '../types';

const { Paragraph, Text, Title } = Typography;

const heroStyle: React.CSSProperties = {
  marginBottom: 24,
  background: 'linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,255,255,0.55))',
  border: '1px solid rgba(255,255,255,0.35)',
  boxShadow: '0 18px 36px rgba(15, 34, 60, 0.08)',
};

type EditorMode = 'create' | 'edit';

const normalizeSearchValue = (value: string) => value.trim().toLowerCase();

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '--';
  }

  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', { hour12: false });
};

const PromptTemplatesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [detailTemplate, setDetailTemplate] = useState<PromptTemplate | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['prompt-templates'],
    queryFn: listPromptTemplates,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; prompt: string }) => createPromptTemplate(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      message.success('提示词已新增');
      handleCloseEditor(true);
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '新增提示词失败'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ templateId, input }: { templateId: number; input: { name: string; prompt: string } }) => (
      updatePromptTemplate(templateId, input)
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      message.success('提示词已更新');
      handleCloseEditor(true);
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '更新提示词失败'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (templateId: number) => deletePromptTemplate(templateId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['prompt-templates'] });
      message.success('提示词已删除');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '删除提示词失败'));
    },
  });

  const templates = templatesQuery.data ?? [];

  const filteredTemplates = useMemo(() => {
    const keyword = normalizeSearchValue(searchKeyword);
    if (!keyword) {
      return templates;
    }
    return templates.filter((item) => normalizeSearchValue(item.name).includes(keyword));
  }, [searchKeyword, templates]);

  const handleOpenCreate = () => {
    setEditorMode('create');
    setEditingTemplateId(null);
    setName('');
    setPrompt('');
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (template: PromptTemplate) => {
    setEditorMode('edit');
    setEditingTemplateId(template.id);
    setName(template.name);
    setPrompt(template.prompt);
    setIsEditorOpen(true);
  };

  const handleCloseEditor = (force = false) => {
    if (!force && (createMutation.isPending || updateMutation.isPending)) {
      return;
    }
    setIsEditorOpen(false);
    setEditingTemplateId(null);
    setName('');
    setPrompt('');
  };

  const handleSubmit = () => {
    const nextName = name.trim();
    const nextPrompt = prompt.trim();
    if (!nextName) {
      message.warning('请输入提示词名称');
      return;
    }
    if (!nextPrompt) {
      message.warning('请输入提示词内容');
      return;
    }

    if (editorMode === 'create') {
      createMutation.mutate({ name: nextName, prompt: nextPrompt });
      return;
    }

    if (editingTemplateId === null) {
      message.error('未找到要编辑的提示词');
      return;
    }

    updateMutation.mutate({
      templateId: editingTemplateId,
      input: { name: nextName, prompt: nextPrompt },
    });
  };

  const columns: ColumnsType<PromptTemplate> = [
    {
      title: '提示词名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '标识',
      dataIndex: 'agent_key',
      key: 'agent_key',
      width: 220,
      render: (value: string) => <Text type="secondary">{value}</Text>,
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      render: (_value, record) => (
        <Space size="small">
          <Button type="text" icon={<EyeOutlined />} onClick={() => setDetailTemplate(record)}>
            详情
          </Button>
          <Button type="text" icon={<EditOutlined />} onClick={() => handleOpenEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除这条提示词吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger type="text" icon={<DeleteOutlined />} loading={deleteMutation.isPending}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Card variant="borderless" style={heroStyle}>
        <Space orientation="vertical" size={8}>
          <Space wrap>
            <Tag color="processing">配置管理</Tag>
            <Tag color="blue">提示词管理</Tag>
            <Tag color="purple">AI 助手可选提示词</Tag>
          </Space>
          <Title level={2} style={{ margin: 0 }}>提示词管理</Title>
          <Text type="secondary">AI 助手未配置提示词时也可直接使用；这里用于维护可切换的提示词模板。</Text>
        </Space>
      </Card>

      <Card
        title={(
          <Space>
            <MessageOutlined style={{ color: '#4f7cff' }} />
            <span>提示词列表</span>
          </Space>
        )}
        extra={(
          <Space wrap size={12}>
            <Input.Search
              allowClear
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
              placeholder="搜索提示词名称"
              style={{ width: 260 }}
            />
            <Button type="primary" icon={<PlusOutlined />} onClick={handleOpenCreate}>
              新增
            </Button>
          </Space>
        )}
        variant="borderless"
      >
        <Table
          size="small"
          rowKey="id"
          loading={templatesQuery.isLoading}
          columns={columns}
          dataSource={filteredTemplates}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          locale={{ emptyText: searchKeyword.trim() ? '暂无匹配的提示词' : '暂无提示词' }}
        />
      </Card>

      <Modal
        title={editorMode === 'create' ? '新增提示词' : '编辑提示词'}
        open={isEditorOpen}
        onCancel={() => handleCloseEditor()}
        onOk={handleSubmit}
        okText="保存"
        cancelText="取消"
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
      >
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text strong>提示词名称</Text>
            <Input
              style={{ marginTop: 12 }}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：接口回归助手"
              maxLength={100}
              onPressEnter={handleSubmit}
            />
          </div>
          <div>
            <Text strong>提示词内容</Text>
            <Input.TextArea
              style={{ marginTop: 12 }}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="请输入完整提示词内容"
              autoSize={{ minRows: 6, maxRows: 12 }}
            />
          </div>
        </Space>
      </Modal>

      <Modal
        title={detailTemplate ? `${detailTemplate.name} - 提示词详情` : '提示词详情'}
        open={detailTemplate !== null}
        onCancel={() => setDetailTemplate(null)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
          {detailTemplate?.prompt}
        </Paragraph>
      </Modal>
    </div>
  );
};

export default PromptTemplatesPage;

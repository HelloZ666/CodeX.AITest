import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Table,
  Typography,
  message,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createProject,
  deleteProject,
  listProjects,
  updateProject,
} from '../utils/api';
import type { Project } from '../types';

const { Title, Text } = Typography;

const ProjectManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const filteredProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return projects;
    }
    return projects.filter((project) =>
      project.name.toLowerCase().includes(normalizedKeyword)
      || project.description.toLowerCase().includes(normalizedKeyword),
    );
  }, [keyword, projects]);

  const createMutation = useMutation({
    mutationFn: (values: { name: string; description: string }) =>
      createProject(values.name, values.description),
    onSuccess: () => {
      message.success('项目创建成功');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      closeModal();
    },
    onError: () => message.error('创建失败'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: { id: number; name: string; description: string }) =>
      updateProject(values.id, { name: values.name, description: values.description }),
    onSuccess: () => {
      message.success('项目更新成功');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      closeModal();
    },
    onError: () => message.error('更新失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      message.success('项目已删除');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: () => message.error('删除失败'),
  });

  const openCreateModal = () => {
    setEditingProject(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project) => {
    setEditingProject(project);
    form.setFieldsValue({ name: project.name, description: project.description });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
    form.resetFields();
  };

  const handleSubmit = () => {
    form.validateFields().then((values) => {
      if (editingProject) {
        updateMutation.mutate({ id: editingProject.id, ...values });
      } else {
        createMutation.mutate(values);
      }
    });
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
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_: unknown, record: Project) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Popconfirm
            title="确定删除此项目？"
            description="绑定的测试问题文件和分析记录也会被删除"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (isLoading) {
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
            项目管理
          </Title>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
          size="large"
          style={{ borderRadius: 20, paddingLeft: 24, paddingRight: 24 }}
        >
          新建项目
        </Button>
      </div>

      <Card
        variant="borderless"
        style={{ marginBottom: 24 }}
        styles={{ body: { padding: 20 } }}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="输入项目名称或描述进行查询"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <Text type="secondary">
            共 {projects.length} 个项目，当前匹配 {filteredProjects.length} 个
          </Text>
        </Space>
      </Card>

      {projects.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 16, color: '#666' }}>暂无项目，开始创建您的第一个项目吧</span>}
          >
            <Button type="primary" onClick={openCreateModal} size="large" style={{ marginTop: 16 }}>
              创建第一个项目
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card
          variant="borderless"
          styles={{ body: { padding: 0 } }}
          style={{ background: 'transparent', boxShadow: 'none' }}
        >
          <Table
            dataSource={filteredProjects}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            locale={{ emptyText: '没有匹配的项目' }}
          />
        </Card>
      )}

      <Modal
        title={editingProject ? '编辑项目' : '新建项目'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={closeModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="例如：用户管理模块" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea placeholder="可选的项目描述" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectManagementPage;

import React, { useMemo, useState } from 'react';
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
import DashboardHero from '../components/Layout/DashboardHero';
import {
  createProject,
  deleteProject,
  listProjects,
  listUsers,
  updateProject,
} from '../utils/api';
import type { Project, UserRecord } from '../types';

const { Text } = Typography;

interface ProjectFormValues {
  name: string;
  description?: string;
  test_manager_ids?: number[];
  tester_ids?: number[];
}

const ProjectManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [keyword, setKeyword] = useState('');
  const [form] = Form.useForm<ProjectFormValues>();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const { data: p13Users = [], isLoading: isUsersLoading } = useQuery({
    queryKey: ['users', 'project-members'],
    queryFn: async () => {
      const users = await listUsers();
      return users.filter((user) => user.auth_source === 'external');
    },
  });

  const p13UserMap = useMemo(
    () => new Map<number, UserRecord>(p13Users.map((user) => [user.id, user])),
    [p13Users],
  );

  const p13UserOptions = useMemo(
    () => p13Users.map((user) => ({
      label: `${user.display_name}${user.dept_name ? ` / ${user.dept_name}` : ''} (${user.username})`,
      value: user.id,
    })),
    [p13Users],
  );

  const renderProjectMembers = (memberIds?: number[]) => {
    const normalizedIds = memberIds ?? [];
    if (normalizedIds.length === 0) {
      return <Text type="secondary">{'\u672a\u8bbe\u7f6e'}</Text>;
    }

    return normalizedIds
      .map((userId) => {
        const user = p13UserMap.get(userId);
        return user ? user.display_name : `\u6210\u5458ID:${userId}`;
      })
      .join('\u3001');
  };

  const normalizeProjectFormValues = (values: ProjectFormValues) => ({
    name: values.name,
    description: values.description ?? '',
    test_manager_ids: values.test_manager_ids ?? [],
    tester_ids: values.tester_ids ?? [],
  });

  const filteredProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return projects;
    }
    return projects.filter((project) => (
      project.name.toLowerCase().includes(normalizedKeyword)
      || project.description.toLowerCase().includes(normalizedKeyword)
    ));
  }, [keyword, projects]);

  const createMutation = useMutation({
    mutationFn: (values: ProjectFormValues) => createProject(normalizeProjectFormValues(values)),
    onSuccess: () => {
      message.success('项目创建成功');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      closeModal();
    },
    onError: () => message.error('创建失败'),
  });

  const updateMutation = useMutation({
    mutationFn: (values: { id: number } & ProjectFormValues) => (
      updateProject(values.id, normalizeProjectFormValues(values))
    ),
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
    form.setFieldsValue({
      name: project.name,
      description: project.description,
      test_manager_ids: project.test_manager_ids ?? [],
      tester_ids: project.tester_ids ?? [],
    });
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
      title: '\u6d4b\u8bd5\u7ecf\u7406',
      dataIndex: 'test_manager_ids',
      key: 'test_manager_ids',
      width: 220,
      render: (value?: number[]) => renderProjectMembers(value),
    },
    {
      title: '\u6d4b\u8bd5\u4eba\u5458',
      dataIndex: 'tester_ids',
      key: 'tester_ids',
      width: 260,
      render: (value?: number[]) => renderProjectMembers(value),
    },
    {
      title: '\u521b\u5efa\u65f6\u95f4',
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

  if (isLoading || isUsersLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <DashboardHero
        title="项目管理"
        actions={(
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={openCreateModal}>
            新建项目
          </Button>
        )}
      />

      <Card variant="borderless" style={{ marginBottom: 24 }}>
        <Input
          allowClear
          size="large"
          prefix={<SearchOutlined />}
          placeholder="输入项目名称或描述进行查询"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </Card>

      {projects.length === 0 ? (
        <Card variant="borderless" className="dashboard-empty-card">
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
        <Card variant="borderless" styles={{ body: { padding: 0 } }}>
          <Table
            dataSource={filteredProjects}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            rowClassName="glass-table-row"
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
        <Form<ProjectFormValues> form={form} layout="vertical">
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
          <Form.Item name="test_manager_ids" label="测试经理">
            <Select
              mode="multiple"
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="请选择测试经理"
              options={p13UserOptions}
              maxTagCount="responsive"
              notFoundContent="暂无可选的 P13 用户"
            />
          </Form.Item>
          <Form.Item name="tester_ids" label="测试人员">
            <Select
              mode="multiple"
              showSearch
              allowClear
              optionFilterProp="label"
              placeholder="请选择测试人员"
              options={p13UserOptions}
              maxTagCount="responsive"
              notFoundContent="暂无可选的 P13 用户"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ProjectManagementPage;

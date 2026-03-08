import React, { useState } from 'react';
import {
  Typography,
  Button,
  Table,
  Modal,
  Form,
  Input,
  Upload,
  Space,
  Tag,
  Popconfirm,
  message,
  Card,
  Empty,
  Spin,
  Tooltip,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  FolderOpenOutlined,
  CheckCircleOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  uploadProjectMapping,
  getProject,
} from '../utils/api';
import type { Project } from '../types';

const { Title, Text } = Typography;

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [mappingModalProject, setMappingModalProject] = useState<Project | null>(null);
  const [mappingData, setMappingData] = useState<Array<{ package_name: string; class_name: string; method_name: string; description: string }>>([]);
  const [form] = Form.useForm();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

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

  const mappingMutation = useMutation({
    mutationFn: ({ projectId, file }: { projectId: number; file: File }) =>
      uploadProjectMapping(projectId, file),
    onSuccess: () => {
      message.success('映射文件上传成功');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: () => message.error('上传失败'),
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

  const viewMapping = async (project: Project) => {
    try {
      const detail = await getProject(project.id);
      const data = (detail as unknown as Record<string, unknown>)?.mapping_data;
      if (Array.isArray(data)) {
        setMappingData(data as Array<{ package_name: string; class_name: string; method_name: string; description: string }>);
      } else {
        setMappingData([]);
      }
      setMappingModalProject(project);
    } catch {
      message.error('获取映射详情失败');
    }
  };

  const columns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Project) => (
        <Button type="link" onClick={() => navigate(`/project/${record.id}`)}>
          <FolderOpenOutlined /> {name}
        </Button>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => desc || <Text type="secondary">无描述</Text>,
    },
    {
      title: '映射文件',
      dataIndex: 'mapping_data',
      key: 'mapping',
      width: 200,
      render: (data: unknown, record: Project) => (
        <Space>
          {data ? (
            <>
              <Tag icon={<CheckCircleOutlined />} color="success">已绑定</Tag>
              <Tooltip title="查看映射详情">
                <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => viewMapping(record)} />
              </Tooltip>
            </>
          ) : (
            <Tag color="warning">未绑定</Tag>
          )}
          <Upload
            accept=".csv"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              mappingMutation.mutate({ projectId: record.id, file });
              return false;
            }}
          >
            <Button size="small" icon={<UploadOutlined />}>
              {data ? '替换' : '上传'}
            </Button>
          </Upload>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: unknown, record: Project) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)} />
          <Popconfirm
            title="确定删除此项目？"
            description="关联的分析记录也会被删除"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const mappingColumns = [
    { title: '包名', dataIndex: 'package_name', key: 'package_name' },
    { title: '类名', dataIndex: 'class_name', key: 'class_name' },
    { title: '方法名', dataIndex: 'method_name', key: 'method_name' },
    { title: '功能描述', dataIndex: 'description', key: 'description' },
  ];

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: 32,
        background: 'rgba(255,255,255,0.4)',
        padding: '16px 24px',
        borderRadius: 16,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.3)'
      }}>
        <div>
          <Title level={2} style={{ margin: '0 0 4px 0', background: 'linear-gradient(135deg, #1a1a2e, #0f3460)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            代码映射关系
          </Title>
          <Text type="secondary">管理测试项目以及代码与测试用例之间的映射关系</Text>
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
            dataSource={projects}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            rowClassName="glass-table-row"
          />
        </Card>
      )}

      {/* 新建/编辑项目 Modal */}
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

      {/* 映射详情 Modal */}
      <Modal
        title={`映射详情 — ${mappingModalProject?.name ?? ''}`}
        open={mappingModalProject !== null}
        onCancel={() => setMappingModalProject(null)}
        footer={null}
        width={800}
      >
        <Table
          dataSource={mappingData}
          columns={mappingColumns}
          rowKey={(_, idx) => String(idx)}
          size="small"
          pagination={false}
          locale={{ emptyText: '暂无映射数据' }}
        />
      </Modal>
    </div>
  );
};

export default ProjectsPage;

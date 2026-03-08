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
  Tag,
  Typography,
  message,
} from 'antd';
import {
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  SearchOutlined,
  StopOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import type { UserRecord, UserRole, UserStatus } from '../types';
import { useAuth } from '../auth/AuthContext';
import AutofillGuard from '../components/Auth/AutofillGuard';
import {
  createUser,
  extractApiErrorMessage,
  listUsers,
  resetUserPassword,
  updateUser,
  updateUserStatus,
} from '../utils/api';

const { Title, Text } = Typography;

interface UserFormValues {
  username?: string;
  password?: string;
  display_name: string;
  email?: string;
  role: UserRole;
}

interface PasswordFormValues {
  password: string;
}

const roleOptions = [
  { label: '管理员', value: 'admin' },
  { label: '普通用户', value: 'user' },
] satisfies Array<{ label: string; value: UserRole }>;

const statusOptions = [
  { label: '启用', value: 'active' },
  { label: '禁用', value: 'disabled' },
] satisfies Array<{ label: string; value: UserStatus }>;

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

const UserManagementPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [keyword, setKeyword] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | ''>('');
  const [statusFilter, setStatusFilter] = useState<UserStatus | ''>('');
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [passwordUser, setPasswordUser] = useState<UserRecord | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [userForm] = Form.useForm<UserFormValues>();
  const [passwordForm] = Form.useForm<PasswordFormValues>();

  const queryParams = useMemo(
    () => ({ keyword: keyword.trim(), role: roleFilter, status: statusFilter }),
    [keyword, roleFilter, statusFilter],
  );

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users', queryParams],
    queryFn: () => listUsers(queryParams),
  });

  const refreshUsers = async () => {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      message.success('用户创建成功');
      closeUserModal();
      await refreshUsers();
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '用户创建失败')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, values }: { userId: number; values: Parameters<typeof updateUser>[1] }) =>
      updateUser(userId, values),
    onSuccess: async () => {
      message.success('用户更新成功');
      closeUserModal();
      await refreshUsers();
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '用户更新失败')),
  });

  const statusMutation = useMutation({
    mutationFn: ({ userId, status }: { userId: number; status: UserStatus }) => updateUserStatus(userId, status),
    onSuccess: async (_, variables) => {
      message.success(variables.status === 'active' ? '用户已启用' : '用户已禁用');
      await refreshUsers();
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '状态更新失败')),
  });

  const passwordMutation = useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) => resetUserPassword(userId, password),
    onSuccess: async () => {
      message.success('密码重置成功');
      closePasswordModal();
      await refreshUsers();
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '密码重置失败')),
  });

  const openCreateModal = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({ role: 'user' });
    setIsUserModalOpen(true);
  };

  const openEditModal = (record: UserRecord) => {
    setEditingUser(record);
    userForm.setFieldsValue({
      display_name: record.display_name,
      email: record.email ?? undefined,
      role: record.role,
    });
    setIsUserModalOpen(true);
  };

  const closeUserModal = () => {
    setEditingUser(null);
    setIsUserModalOpen(false);
    userForm.resetFields();
  };

  const openPasswordModal = (record: UserRecord) => {
    setPasswordUser(record);
    passwordForm.resetFields();
    setIsPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    setPasswordUser(null);
    setIsPasswordModalOpen(false);
    passwordForm.resetFields();
  };

  const handleUserSubmit = async () => {
    const values = await userForm.validateFields();
    if (editingUser) {
      updateMutation.mutate({
        userId: editingUser.id,
        values: {
          display_name: values.display_name,
          email: values.email,
          role: values.role,
        },
      });
      return;
    }

    createMutation.mutate({
      username: values.username || '',
      password: values.password || '',
      display_name: values.display_name,
      email: values.email,
      role: values.role,
    });
  };

  const handlePasswordSubmit = async () => {
    const values = await passwordForm.validateFields();
    if (!passwordUser) {
      return;
    }
    passwordMutation.mutate({ userId: passwordUser.id, password: values.password });
  };

  const columns: ColumnsType<UserRecord> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 140,
    },
    {
      title: '姓名/显示名',
      dataIndex: 'display_name',
      key: 'display_name',
      width: 180,
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (value: string | null) => value || '—',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 110,
      render: (role: UserRole) => (
        <Tag color={role === 'admin' ? 'blue' : 'default'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: UserStatus) => (
        <Tag color={status === 'active' ? 'success' : 'error'}>
          {status === 'active' ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '最近登录时间',
      dataIndex: 'last_login_at',
      key: 'last_login_at',
      width: 180,
      render: (value: string | null) => formatDateTime(value),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record) => {
        const isSelf = currentUser?.id === record.id;
        const nextStatus: UserStatus = record.status === 'active' ? 'disabled' : 'active';
        const actionText = nextStatus === 'active' ? '启用' : '禁用';

        return (
          <Space size="small">
            <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(record)}>
              编辑
            </Button>
            <Popconfirm
              title={`确定${actionText}该用户？`}
              onConfirm={() => statusMutation.mutate({ userId: record.id, status: nextStatus })}
              disabled={isSelf && nextStatus === 'disabled'}
            >
              <Button
                size="small"
                disabled={isSelf && nextStatus === 'disabled'}
                icon={nextStatus === 'active' ? <CheckCircleOutlined /> : <StopOutlined />}
              >
                {actionText}
              </Button>
            </Popconfirm>
            <Button size="small" icon={<KeyOutlined />} onClick={() => openPasswordModal(record)}>
              重置密码
            </Button>
          </Space>
        );
      },
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
            用户管理
          </Title>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={openCreateModal}
          size="large"
          style={{ borderRadius: 20, paddingLeft: 24, paddingRight: 24 }}
        >
          新建用户
        </Button>
      </div>

      <Card variant="borderless" style={{ marginBottom: 24 }} styles={{ body: { padding: 20 } }}>
        <Space size="middle" wrap style={{ width: '100%' }}>
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="输入用户名、显示名或邮箱搜索"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            style={{ width: 280 }}
          />
          <Select
            allowClear
            size="large"
            placeholder="按角色筛选"
            value={roleFilter || undefined}
            onChange={(value) => setRoleFilter((value ?? '') as UserRole | '')}
            options={roleOptions}
            style={{ width: 160 }}
          />
          <Select
            allowClear
            size="large"
            placeholder="按状态筛选"
            value={statusFilter || undefined}
            onChange={(value) => setStatusFilter((value ?? '') as UserStatus | '')}
            options={statusOptions}
            style={{ width: 160 }}
          />
          <Text type="secondary">共 {users.length} 个用户</Text>
        </Space>
      </Card>

      {users.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 16, color: '#666' }}>暂无符合条件的用户</span>}
          >
            <Button type="primary" onClick={openCreateModal} size="large" style={{ marginTop: 16 }}>
              创建第一个用户
            </Button>
          </Empty>
        </Card>
      ) : (
        <Card variant="borderless" styles={{ body: { padding: 0 } }} style={{ background: 'transparent', boxShadow: 'none' }}>
          <Table
            dataSource={users}
            columns={columns}
            rowKey="id"
            pagination={{ pageSize: 10 }}
            scroll={{ x: 1200 }}
            locale={{ emptyText: '暂无用户数据' }}
          />
        </Card>
      )}

      <Modal
        title={editingUser ? '编辑用户' : '新建用户'}
        open={isUserModalOpen}
        onOk={() => void handleUserSubmit()}
        onCancel={closeUserModal}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        destroyOnHidden
      >
        <Form<UserFormValues> form={userForm} layout="vertical" preserve={false} autoComplete="off">
          <AutofillGuard idPrefix="create-user" />
          {!editingUser ? (
            <>
              <Form.Item
                name="username"
                label="用户名"
                rules={[{ required: true, message: '请输入用户名' }]}
              >
                <Input
                  id="create-user-username"
                  name="create_user_username"
                  placeholder="请输入用户名"
                  autoComplete="off"
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="初始密码"
                rules={[
                  { required: true, message: '请输入初始密码' },
                  { min: 8, message: '密码不少于 8 位' },
                ]}
              >
                <Input.Password
                  id="create-user-initial-password"
                  name="create_user_initial_password"
                  placeholder="请输入初始密码"
                  autoComplete="new-password"
                />
              </Form.Item>
            </>
          ) : null}
          <Form.Item
            name="display_name"
            label="显示名"
            rules={[{ required: true, message: '请输入显示名' }]}
          >
            <Input placeholder="请输入显示名" />
          </Form.Item>
          <Form.Item name="email" label="邮箱">
            <Input placeholder="请输入邮箱（可选）" />
          </Form.Item>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select options={roleOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={passwordUser ? `重置密码：${passwordUser.display_name}` : '重置密码'}
        open={isPasswordModalOpen}
        onOk={() => void handlePasswordSubmit()}
        onCancel={closePasswordModal}
        confirmLoading={passwordMutation.isPending}
        destroyOnHidden
      >
        <Form<PasswordFormValues> form={passwordForm} layout="vertical" preserve={false} autoComplete="off">
          <AutofillGuard idPrefix="reset-user-password" />
          <Form.Item
            name="password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码不少于 8 位' },
            ]}
          >
            <Input.Password
              id="reset-user-password"
              name="reset_user_password"
              placeholder="请输入新密码"
              autoComplete="new-password"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagementPage;

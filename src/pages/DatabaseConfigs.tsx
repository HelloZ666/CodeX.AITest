import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
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
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardHero from '../components/Layout/DashboardHero';
import type {
  DatabaseColumnMetadata,
  DatabaseConfig,
  DatabaseConfigPayload,
  DatabaseTableMetadata,
  DatabaseType,
} from '../types';
import {
  createDatabaseConfig,
  deleteDatabaseConfig,
  extractApiErrorMessage,
  getDatabaseConfig,
  listDatabaseColumns,
  listDatabaseConfigs,
  listDatabaseTables,
  testDatabaseConfig,
  updateDatabaseConfig,
} from '../utils/api';

const { Text } = Typography;
const PASSWORD_MASK = '....';

type EditorMode = 'create' | 'edit';

export interface DatabaseConfigFormValues {
  name: string;
  db_type: DatabaseType;
  host?: string;
  port?: number | null;
  database?: string;
  username?: string;
  password?: string;
  schema?: string;
  sqlite_path?: string;
  description?: string;
}

interface DatabaseConfigFilters {
  keyword?: string;
  db_type?: DatabaseType | 'all';
}

const DATABASE_TYPE_OPTIONS: Array<{ value: DatabaseType; label: string }> = [
  { value: 'sqlite', label: 'SQLite' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'oracle', label: 'Oracle' },
  { value: 'oceanbase-mysql', label: 'OceanBase MySQL' },
  { value: 'oceanbase-oracle', label: 'OceanBase Oracle' },
];

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function getDatabaseTypeLabel(value: DatabaseType): string {
  return DATABASE_TYPE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function formatConnection(record: DatabaseConfig): string {
  if (record.db_type === 'sqlite') {
    return record.sqlite_path || record.database || '--';
  }
  return `${record.host || '--'}:${record.port ?? '--'} / ${record.database || '--'}`;
}

export function buildDatabaseConfigPayload(
  values: DatabaseConfigFormValues,
  options: { omitEmptyPassword?: boolean; passwordMask?: string; unchangedPassword?: string } = {},
): DatabaseConfigPayload {
  const payload: DatabaseConfigPayload = {
    name: values.name.trim(),
    db_type: values.db_type,
    host: values.host?.trim() || '',
    port: values.port ?? null,
    database: values.database?.trim() || '',
    username: values.username?.trim() || '',
    password: values.password ?? '',
    schema: values.schema?.trim() || '',
    sqlite_path: values.sqlite_path?.trim() || '',
    description: values.description?.trim() || '',
  };

  const isUnchangedPassword = Boolean(
    options.omitEmptyPassword
    && (
      payload.password === ''
      || payload.password === options.passwordMask
      || (options.unchangedPassword !== undefined && payload.password === options.unchangedPassword)
    ),
  );

  if (isUnchangedPassword) {
    delete payload.password;
  }

  return payload;
}

const DatabaseConfigsPage: React.FC = () => {
  const [form] = Form.useForm<DatabaseConfigFormValues>();
  const [filterForm] = Form.useForm<DatabaseConfigFilters>();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<DatabaseConfigFilters>({});
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingConfig, setEditingConfig] = useState<DatabaseConfig | null>(null);
  const [metadataConfig, setMetadataConfig] = useState<DatabaseConfig | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [storedPassword, setStoredPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const activeEditConfigIdRef = useRef<number | null>(null);

  const configsQuery = useQuery({
    queryKey: ['database-configs'],
    queryFn: listDatabaseConfigs,
  });

  const tablesQuery = useQuery({
    queryKey: ['database-config-tables', metadataConfig?.id],
    queryFn: () => listDatabaseTables(metadataConfig?.id as number, false),
    enabled: metadataConfig !== null,
  });

  const columnsQuery = useQuery({
    queryKey: ['database-config-columns', metadataConfig?.id, selectedTable],
    queryFn: () => listDatabaseColumns(metadataConfig?.id as number, selectedTable as string, false),
    enabled: metadataConfig !== null && selectedTable !== null,
  });

  const createMutation = useMutation({
    mutationFn: createDatabaseConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['database-configs'] });
      message.success('数据库配置已新增');
      closeEditor();
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '新增数据库配置失败')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ configId, input }: { configId: number; input: DatabaseConfigPayload }) => (
      updateDatabaseConfig(configId, input)
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['database-configs'] });
      message.success('数据库配置已更新');
      closeEditor();
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '更新数据库配置失败')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDatabaseConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['database-configs'] });
      message.success('数据库配置已删除');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '删除数据库配置失败')),
  });

  const testMutation = useMutation({
    mutationFn: testDatabaseConfig,
    onSuccess: (result) => {
      const tableCountText = typeof result.table_count === 'number' ? `，表数量 ${result.table_count}` : '';
      message.success(`${result.message}${tableCountText}`);
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '数据库连接测试失败')),
  });

  const refreshTablesMutation = useMutation({
    mutationFn: (configId: number) => listDatabaseTables(configId, true),
    onSuccess: (tables) => {
      void queryClient.invalidateQueries({ queryKey: ['database-config-tables', metadataConfig?.id] });
      setSelectedTable(tables[0]?.table_name ?? null);
      message.success('表清单已刷新');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '刷新表清单失败')),
  });

  const refreshColumnsMutation = useMutation({
    mutationFn: ({ configId, tableName }: { configId: number; tableName: string }) => (
      listDatabaseColumns(configId, tableName, true)
    ),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['database-config-columns', metadataConfig?.id, selectedTable],
      });
      message.success('字段清单已刷新');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '刷新字段清单失败')),
  });

  const configs = configsQuery.data ?? [];
  const tables = tablesQuery.data ?? [];
  const columns = columnsQuery.data ?? [];
  const dbType = Form.useWatch('db_type', form) ?? 'sqlite';
  const passwordValue = Form.useWatch('password', form) ?? '';

  const tableOptions = useMemo(
    () => tables.map((table) => ({ value: table.table_name, label: table.table_name })),
    [tables],
  );

  const filteredConfigs = useMemo(() => {
    const keyword = filters.keyword?.trim().toLowerCase();
    const selectedDbType = filters.db_type;
    return configs.filter((config) => {
      const matchesType = !selectedDbType || selectedDbType === 'all' || config.db_type === selectedDbType;
      const searchableText = [
        config.name,
        config.db_type,
        config.host,
        config.database,
        config.username,
        config.schema,
        config.sqlite_path,
        config.description,
      ].join(' ').toLowerCase();
      const matchesKeyword = !keyword || searchableText.includes(keyword);
      return matchesType && matchesKeyword;
    });
  }, [configs, filters]);

  const openCreate = () => {
    activeEditConfigIdRef.current = null;
    setEditorMode('create');
    setEditingConfig(null);
    setStoredPassword('');
    setPasswordVisible(false);
    setPasswordLoading(false);
    form.resetFields();
    form.setFieldsValue({ db_type: 'sqlite', name: '', sqlite_path: '' });
    setEditorOpen(true);
  };

  const openEdit = (record: DatabaseConfig) => {
    activeEditConfigIdRef.current = record.id;
    setEditorMode('edit');
    setEditingConfig(record);
    setStoredPassword('');
    setPasswordVisible(false);
    setPasswordLoading(true);
    form.setFieldsValue({ ...record, password: PASSWORD_MASK });
    setEditorOpen(true);
    void getDatabaseConfig(record.id)
      .then((detail) => {
        if (activeEditConfigIdRef.current !== record.id) {
          return;
        }
        const detailPassword = detail.password || '';
        setEditingConfig(detail);
        setStoredPassword(detailPassword);
        form.setFieldsValue({ ...detail, password: detailPassword ? PASSWORD_MASK : '' });
      })
      .catch((error) => {
        if (activeEditConfigIdRef.current !== record.id) {
          return;
        }
        form.setFieldsValue({ password: '' });
        message.error(extractApiErrorMessage(error, '读取数据库密码失败'));
      })
      .finally(() => {
        if (activeEditConfigIdRef.current === record.id) {
          setPasswordLoading(false);
        }
      });
  };

  const closeEditor = () => {
    activeEditConfigIdRef.current = null;
    setEditorOpen(false);
    setEditingConfig(null);
    setStoredPassword('');
    setPasswordVisible(false);
    setPasswordLoading(false);
    form.resetFields();
  };

  const togglePasswordVisible = () => {
    const currentPassword = form.getFieldValue('password') ?? '';
    if (!passwordVisible) {
      if (editorMode === 'edit' && currentPassword === PASSWORD_MASK) {
        form.setFieldsValue({ password: storedPassword });
      }
      setPasswordVisible(true);
      return;
    }

    if (editorMode === 'edit' && storedPassword && currentPassword === storedPassword) {
      form.setFieldsValue({ password: PASSWORD_MASK });
    }
    setPasswordVisible(false);
  };

  const openMetadata = (record: DatabaseConfig) => {
    setMetadataConfig(record);
    setSelectedTable(null);
  };

  const submitForm = () => {
    void form.validateFields().then((values) => {
      const payload = buildDatabaseConfigPayload(values, {
        omitEmptyPassword: editorMode === 'edit',
        passwordMask: PASSWORD_MASK,
        unchangedPassword: storedPassword,
      });
      if (editorMode === 'edit' && editingConfig) {
        updateMutation.mutate({ configId: editingConfig.id, input: payload });
        return;
      }
      createMutation.mutate(payload);
    });
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setFilters({});
  };

  const passwordRevealDisabled = passwordLoading || (editorMode === 'edit' && !storedPassword && !passwordValue);
  const passwordShowsMask = editorMode === 'edit' && !passwordVisible && passwordValue === PASSWORD_MASK;
  const passwordInputType = passwordVisible || passwordShowsMask ? 'text' : 'password';

  const configColumns: ColumnsType<DatabaseConfig> = [
    {
      title: '配置名称',
      dataIndex: 'name',
      key: 'name',
      width: 190,
      fixed: 'left',
      render: (value: string, record) => (
        <Space direction="vertical" size={2}>
          <Text strong>{value}</Text>
          {record.description ? <Text type="secondary">{record.description}</Text> : null}
        </Space>
      ),
    },
    {
      title: '数据库类型',
      dataIndex: 'db_type',
      key: 'db_type',
      width: 160,
      render: (value: DatabaseType) => <Tag color="blue">{getDatabaseTypeLabel(value)}</Tag>,
    },
    {
      title: '数据库地址',
      key: 'connection',
      width: 300,
      ellipsis: true,
      render: (_, record) => <Text>{formatConnection(record)}</Text>,
    },
    {
      title: '数据库用户',
      dataIndex: 'username',
      key: 'username',
      width: 160,
      render: (value: string) => value || '--',
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 230,
      fixed: 'right',
      render: (_, record) => (
        <Space size={6} wrap>
          <Button
            size="small"
            icon={<CheckCircleOutlined />}
            loading={testMutation.isPending}
            onClick={() => testMutation.mutate(record.id)}
          />
          <Button size="small" icon={<EyeOutlined />} onClick={() => openMetadata(record)} />
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)} />
          <Popconfirm
            title="确认删除该数据库配置吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />} loading={deleteMutation.isPending} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const tableColumns: ColumnsType<DatabaseTableMetadata> = [
    { title: '表名', dataIndex: 'table_name', key: 'table_name' },
    { title: '说明', dataIndex: 'table_comment', key: 'table_comment', render: (value: string) => value || '--' },
    { title: '同步时间', dataIndex: 'synced_at', key: 'synced_at', width: 180, render: formatDateTime },
  ];

  const columnColumns: ColumnsType<DatabaseColumnMetadata> = [
    { title: '字段名', dataIndex: 'column_name', key: 'column_name' },
    { title: '类型', dataIndex: 'data_type', key: 'data_type', width: 160 },
    {
      title: '允许空',
      dataIndex: 'is_nullable',
      key: 'is_nullable',
      width: 100,
      render: (value: boolean) => (value ? <Tag>是</Tag> : <Tag color="success">否</Tag>),
    },
    { title: '说明', dataIndex: 'column_comment', key: 'column_comment', render: (value: string) => value || '--' },
  ];

  return (
    <div className="database-validation-page">
      <DashboardHero
        eyebrow="配置管理"
        title="数据库配置"
        description="按源系统的配置台交互维护数据库连接：先筛选定位，再通过弹窗新增、编辑、测试连接，并同步表字段元数据供回归验证和端到端测试使用。"
        chips={[
          { label: `${configs.length} 个配置`, tone: 'accent' },
          { label: '连接测试', tone: 'neutral' },
          { label: '表字段同步', tone: 'neutral' },
        ]}
        actions={(
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增数据库配置
          </Button>
        )}
      />

      <Card variant="borderless" className="database-workbench-card">
        <Form
          form={filterForm}
          className="database-toolbar"
          layout="inline"
          onFinish={(values) => setFilters(values)}
        >
          <Form.Item name="keyword" label="关键字">
            <Input allowClear placeholder="配置名称 / 地址 / 用户" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="db_type" label="数据库类型">
            <Select
              allowClear
              placeholder="全部类型"
              style={{ width: 180 }}
              options={DATABASE_TYPE_OPTIONS}
            />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                搜索
              </Button>
              <Button icon={<UndoOutlined />} onClick={resetFilters}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        {configsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '96px auto' }} />
        ) : filteredConfigs.length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="暂无数据库配置" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={configColumns}
            dataSource={filteredConfigs}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 1220, y: 460 }}
          />
        )}
      </Card>

      <Modal
        title={editorMode === 'create' ? '新增数据库信息' : '修改数据库信息'}
        open={editorOpen}
        onCancel={closeEditor}
        width={720}
        centered
        destroyOnHidden
        footer={(
          <Space>
            <Button onClick={() => form.resetFields()}>重置</Button>
            <Button
              type="primary"
              onClick={submitForm}
              loading={createMutation.isPending || updateMutation.isPending}
            >
              提交
            </Button>
          </Space>
        )}
      >
        <Alert
          type="info"
          showIcon
          className="database-inline-alert"
          message="配置保存后可在列表中执行连接测试；测试通过后再进入表字段查看同步元数据。"
        />
        <Form form={form} layout="vertical" initialValues={{ db_type: 'sqlite' }}>
          <Form.Item name="name" label="系统/配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input placeholder="例如：核心保单库" />
          </Form.Item>
          <Form.Item name="db_type" label="数据库类型" rules={[{ required: true, message: '请选择数据库类型' }]}>
            <Select options={DATABASE_TYPE_OPTIONS} />
          </Form.Item>
          {dbType === 'sqlite' ? (
            <Form.Item name="sqlite_path" label="SQLite 文件路径" rules={[{ required: true, message: '请输入 SQLite 文件路径' }]}>
              <Input placeholder="D:\\data\\business.db" />
            </Form.Item>
          ) : (
            <>
              <Form.Item name="host" label="数据库 IP" rules={[{ required: true, message: '请输入数据库 IP' }]}>
                <Input placeholder="127.0.0.1" />
              </Form.Item>
              <Form.Item name="port" label="数据库端口" rules={[{ required: true, message: '请输入数据库端口' }]}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="database" label="数据库实例" rules={[{ required: true, message: '请输入数据库实例' }]}>
                <Input placeholder="database/service" />
              </Form.Item>
              <Form.Item name="schema" label="Schema">
                <Input placeholder="public/owner" />
              </Form.Item>
              <Form.Item name="username" label="数据库用户" rules={[{ required: true, message: '请输入数据库用户' }]}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="数据库密码">
                <Input
                  type={passwordInputType}
                  autoComplete="new-password"
                  placeholder={editorMode === 'edit' ? (passwordLoading ? '正在读取密码...' : '不填写则保持原密码') : undefined}
                  onFocus={(event) => {
                    if (passwordShowsMask) {
                      event.currentTarget.select();
                    }
                  }}
                  suffix={(
                    <Button
                      type="text"
                      size="small"
                      icon={passwordVisible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                      disabled={passwordRevealDisabled}
                      aria-label={passwordVisible ? '隐藏密码' : '查看密码'}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={togglePasswordVisible}
                    />
                  )}
                />
              </Form.Item>
            </>
          )}
          <Form.Item name="description" label="说明">
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 5 }} placeholder="用途、环境、注意事项" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={metadataConfig ? `${metadataConfig.name} 表字段` : '表字段'}
        open={metadataConfig !== null}
        onCancel={() => {
          setMetadataConfig(null);
          setSelectedTable(null);
        }}
        width={980}
        centered
        footer={null}
        className="database-detail-modal"
      >
        {metadataConfig ? (
          <div className="database-detail-modal-actions">
            <Button
              icon={<ReloadOutlined />}
              loading={refreshTablesMutation.isPending}
              onClick={() => refreshTablesMutation.mutate(metadataConfig.id)}
            >
              拉取表、字段信息
            </Button>
          </div>
        ) : null}

        {metadataConfig ? (
          <Descriptions size="small" column={{ xs: 1, md: 2 }} className="database-detail-descriptions">
            <Descriptions.Item label="数据库类型">{getDatabaseTypeLabel(metadataConfig.db_type)}</Descriptions.Item>
            <Descriptions.Item label="连接信息">{formatConnection(metadataConfig)}</Descriptions.Item>
            <Descriptions.Item label="数据库用户">{metadataConfig.username || '--'}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDateTime(metadataConfig.updated_at)}</Descriptions.Item>
          </Descriptions>
        ) : null}

        {tablesQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '80px auto' }} />
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Table
              rowKey="table_name"
              size="small"
              columns={tableColumns}
              dataSource={tables}
              pagination={{ pageSize: 6, showSizeChanger: false }}
              onRow={(record) => ({ onClick: () => setSelectedTable(record.table_name) })}
            />
            <Space wrap>
              <Text strong>字段表：</Text>
              <Select
                showSearch
                style={{ width: 300 }}
                placeholder="选择表后查看字段"
                value={selectedTable}
                options={tableOptions}
                onChange={setSelectedTable}
              />
              <Button
                icon={<ReloadOutlined />}
                disabled={!metadataConfig || !selectedTable}
                loading={refreshColumnsMutation.isPending}
                onClick={() => {
                  if (metadataConfig && selectedTable) {
                    refreshColumnsMutation.mutate({ configId: metadataConfig.id, tableName: selectedTable });
                  }
                }}
              >
                刷新字段
              </Button>
            </Space>
            {selectedTable ? (
              <Table
                rowKey="column_name"
                size="small"
                columns={columnColumns}
                dataSource={columns}
                loading={columnsQuery.isLoading}
                pagination={{ pageSize: 8, showSizeChanger: false }}
              />
            ) : (
              <Empty description="请选择或刷新表清单" />
            )}
          </Space>
        )}
      </Modal>
    </div>
  );
};

export default DatabaseConfigsPage;

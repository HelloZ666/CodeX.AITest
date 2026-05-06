import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
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
  DatabaseOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  ReloadOutlined,
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
  listDatabaseColumns,
  listDatabaseConfigs,
  listDatabaseTables,
  testDatabaseConfig,
  updateDatabaseConfig,
} from '../utils/api';

const { Text } = Typography;

type EditorMode = 'create' | 'edit';

interface DatabaseConfigFormValues {
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

function buildPayload(values: DatabaseConfigFormValues): DatabaseConfigPayload {
  return {
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
}

const DatabaseConfigsPage: React.FC = () => {
  const [form] = Form.useForm<DatabaseConfigFormValues>();
  const queryClient = useQueryClient();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('create');
  const [editingConfig, setEditingConfig] = useState<DatabaseConfig | null>(null);
  const [metadataConfig, setMetadataConfig] = useState<DatabaseConfig | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);

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

  const tableOptions = useMemo(
    () => tables.map((table) => ({ value: table.table_name, label: table.table_name })),
    [tables],
  );

  const openCreate = () => {
    setEditorMode('create');
    setEditingConfig(null);
    form.setFieldsValue({ db_type: 'sqlite', name: '', sqlite_path: '' });
    setEditorOpen(true);
  };

  const openEdit = (record: DatabaseConfig) => {
    setEditorMode('edit');
    setEditingConfig(record);
    form.setFieldsValue({ ...record, password: '' });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingConfig(null);
    form.resetFields();
  };

  const openMetadata = (record: DatabaseConfig) => {
    setMetadataConfig(record);
    setSelectedTable(null);
  };

  const submitForm = () => {
    void form.validateFields().then((values) => {
      const payload = buildPayload(values);
      if (editorMode === 'edit' && editingConfig) {
        updateMutation.mutate({ configId: editingConfig.id, input: payload });
        return;
      }
      createMutation.mutate(payload);
    });
  };

  const configColumns: ColumnsType<DatabaseConfig> = [
    {
      title: '配置名称',
      dataIndex: 'name',
      key: 'name',
      width: 180,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: '类型',
      dataIndex: 'db_type',
      key: 'db_type',
      width: 150,
      render: (value: DatabaseType) => <Tag color="processing">{getDatabaseTypeLabel(value)}</Tag>,
    },
    {
      title: '连接信息',
      key: 'connection',
      ellipsis: true,
      render: (_, record) => (
        record.db_type === 'sqlite'
          ? <Text>{record.sqlite_path || record.database}</Text>
          : <Text>{record.host}:{record.port ?? '--'} / {record.database}</Text>
      ),
    },
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 140,
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
      width: 330,
      render: (_, record) => (
        <Space size={6} wrap>
          <Button
            size="small"
            icon={<CheckCircleOutlined />}
            loading={testMutation.isPending}
            onClick={() => testMutation.mutate(record.id)}
          >
            测试
          </Button>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => openMetadata(record)}>
            表字段
          </Button>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确认删除该数据库配置吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />} loading={deleteMutation.isPending}>
              删除
            </Button>
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
        description="维护端到端测试和回归验证使用的外部数据库连接，并同步表与字段元数据。SQLite 可直接验证，MySQL、PostgreSQL、Oracle 和 OceanBase 需要后端安装对应 Python 驱动。"
        chips={[
          { label: `${configs.length} 个配置`, tone: 'accent' },
          { label: '端到端测试依赖', tone: 'neutral' },
          { label: '回归验证依赖', tone: 'neutral' },
        ]}
        actions={(
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增数据库
          </Button>
        )}
      />

      <Card variant="borderless" title={<Space><DatabaseOutlined />数据库连接</Space>} styles={{ body: { padding: 0 } }}>
        {configsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '96px auto' }} />
        ) : configs.length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="暂无数据库配置" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={configColumns}
            dataSource={configs}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1100 }}
          />
        )}
      </Card>

      <Modal
        title={editorMode === 'create' ? '新增数据库配置' : '编辑数据库配置'}
        open={editorOpen}
        onCancel={closeEditor}
        onOk={submitForm}
        confirmLoading={createMutation.isPending || updateMutation.isPending}
        okText="保存"
        cancelText="取消"
        width={720}
      >
        <Form form={form} layout="vertical" initialValues={{ db_type: 'sqlite' }}>
          <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
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
            <Space align="start" style={{ width: '100%' }} wrap>
              <Form.Item name="host" label="主机" rules={[{ required: true, message: '请输入主机' }]} style={{ width: 260 }}>
                <Input placeholder="127.0.0.1" />
              </Form.Item>
              <Form.Item name="port" label="端口" style={{ width: 140 }}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="database" label="库名/服务名" style={{ width: 240 }}>
                <Input placeholder="database/service" />
              </Form.Item>
              <Form.Item name="schema" label="Schema" style={{ width: 180 }}>
                <Input placeholder="public/owner" />
              </Form.Item>
              <Form.Item name="username" label="用户名" style={{ width: 220 }}>
                <Input />
              </Form.Item>
              <Form.Item name="password" label="密码" style={{ width: 220 }}>
                <Input.Password placeholder={editorMode === 'edit' ? '不填写则清空为空密码' : undefined} />
              </Form.Item>
            </Space>
          )}
          <Form.Item name="description" label="说明">
            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="用途、环境、注意事项" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={metadataConfig ? `${metadataConfig.name} 表字段` : '表字段'}
        open={metadataConfig !== null}
        onClose={() => {
          setMetadataConfig(null);
          setSelectedTable(null);
        }}
        size="large"
        extra={metadataConfig ? (
          <Button
            icon={<ReloadOutlined />}
            loading={refreshTablesMutation.isPending}
            onClick={() => refreshTablesMutation.mutate(metadataConfig.id)}
          >
            刷新表清单
          </Button>
        ) : null}
      >
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
                style={{ width: 260 }}
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
      </Drawer>
    </div>
  );
};

export default DatabaseConfigsPage;

import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
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
  DeleteOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardHero from '../components/Layout/DashboardHero';
import type {
  DatabaseColumnMetadata,
  DatabaseTableMetadata,
  E2ETestRun,
  E2ETestRunItem,
  E2ETestRunPayload,
} from '../types';
import {
  createE2ETestRun,
  deleteE2ETestRun,
  extractApiErrorMessage,
  getE2ETestRun,
  listDatabaseColumns,
  listDatabaseConfigs,
  listDatabaseTables,
  listE2ETestRuns,
} from '../utils/api';

const { Text } = Typography;

interface TargetSystemFormValue {
  database_config_id?: number;
  system_name?: string;
  table_name?: string;
  primary_key_column?: string;
}

interface E2EFormValues {
  name: string;
  primary_database_config_id: number;
  primary_table: string;
  primary_key_column: string;
  compare_columns: string[];
  key_values_text: string;
  target_systems: TargetSystemFormValue[];
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function splitKeyValues(value: string): string[] {
  return value
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function statusTag(status: 'passed' | 'failed') {
  return status === 'passed' ? <Tag color="success">通过</Tag> : <Tag color="error">不通过</Tag>;
}

function buildRunPayload(values: E2EFormValues): E2ETestRunPayload {
  return {
    name: values.name?.trim() || '端到端测试',
    primary_database_config_id: values.primary_database_config_id,
    primary_table: values.primary_table,
    primary_key_column: values.primary_key_column,
    compare_columns: values.compare_columns,
    key_values: splitKeyValues(values.key_values_text),
    target_systems: (values.target_systems ?? []).map((target, index) => ({
      database_config_id: Number(target.database_config_id),
      system_name: target.system_name?.trim() || `上下游系统${index + 1}`,
      table_name: target.table_name?.trim() || '',
      primary_key_column: target.primary_key_column?.trim() || values.primary_key_column,
    })),
  };
}

const EndToEndTestingPage: React.FC = () => {
  const [form] = Form.useForm<E2EFormValues>();
  const queryClient = useQueryClient();
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);

  const primaryConfigId = Form.useWatch('primary_database_config_id', form);
  const primaryTable = Form.useWatch('primary_table', form);

  const configsQuery = useQuery({
    queryKey: ['database-configs'],
    queryFn: listDatabaseConfigs,
  });

  const primaryTablesQuery = useQuery({
    queryKey: ['database-config-tables', primaryConfigId, 'e2e'],
    queryFn: () => listDatabaseTables(primaryConfigId, true),
    enabled: Boolean(primaryConfigId),
  });

  const primaryColumnsQuery = useQuery({
    queryKey: ['database-config-columns', primaryConfigId, primaryTable, 'e2e'],
    queryFn: () => listDatabaseColumns(primaryConfigId, primaryTable, true),
    enabled: Boolean(primaryConfigId && primaryTable),
  });

  const runsQuery = useQuery({
    queryKey: ['e2e-test-runs'],
    queryFn: listE2ETestRuns,
  });

  const runDetailQuery = useQuery({
    queryKey: ['e2e-test-run', selectedRunId],
    queryFn: () => getE2ETestRun(selectedRunId as number),
    enabled: selectedRunId !== null,
  });

  const createMutation = useMutation({
    mutationFn: createE2ETestRun,
    onSuccess: (run) => {
      void queryClient.invalidateQueries({ queryKey: ['e2e-test-runs'] });
      setSelectedRunId(run.id);
      message.success('端到端测试已执行');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '执行端到端测试失败')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteE2ETestRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['e2e-test-runs'] });
      message.success('端到端测试记录已删除');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '删除端到端测试记录失败')),
  });

  const configs = configsQuery.data ?? [];
  const tableOptions = useMemo(
    () => (primaryTablesQuery.data ?? []).map((table: DatabaseTableMetadata) => ({
      value: table.table_name,
      label: table.table_name,
    })),
    [primaryTablesQuery.data],
  );
  const columnOptions = useMemo(
    () => (primaryColumnsQuery.data ?? []).map((column: DatabaseColumnMetadata) => ({
      value: column.column_name,
      label: `${column.column_name}${column.data_type ? ` (${column.data_type})` : ''}`,
    })),
    [primaryColumnsQuery.data],
  );
  const configOptions = useMemo(
    () => configs.map((config) => ({ value: config.id, label: `${config.name}（${config.db_type}）` })),
    [configs],
  );

  const submit = (values: E2EFormValues) => {
    const payload = buildRunPayload(values);
    if (payload.key_values.length === 0) {
      message.warning('请输入至少一个主键值');
      return;
    }
    if (payload.target_systems.some((target) => !target.database_config_id || !target.table_name)) {
      message.warning('请补全上下游系统数据库和表名');
      return;
    }
    createMutation.mutate(payload);
  };

  const runColumns: ColumnsType<E2ETestRun> = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: statusTag },
    { title: '检查项', dataIndex: 'total_count', key: 'total_count', width: 100 },
    { title: '通过', dataIndex: 'passed_count', key: 'passed_count', width: 100 },
    { title: '不通过', dataIndex: 'failed_count', key: 'failed_count', width: 100 },
    { title: '执行时间', dataIndex: 'created_at', key: 'created_at', width: 190, render: formatDateTime },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedRunId(record.id)}>
            详情
          </Button>
          <Popconfirm
            title="确认删除这条端到端测试记录吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const itemColumns: ColumnsType<E2ETestRunItem> = [
    { title: '主键值', dataIndex: 'key_value', key: 'key_value', width: 140 },
    { title: '字段', dataIndex: 'column_name', key: 'column_name', width: 150 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: statusTag },
    { title: '说明', dataIndex: 'message', key: 'message', width: 160 },
    {
      title: '各系统值',
      key: 'values',
      render: (_, record) => (
        <Space direction="vertical" size={4}>
          {record.values.map((item) => (
            <Text key={`${record.id}-${item.system_name}-${item.column_name}`} code>
              {item.system_name}.{item.column_name} = {item.value ?? 'NULL'}
            </Text>
          ))}
        </Space>
      ),
    },
  ];

  const selectedRun = runDetailQuery.data;

  return (
    <div className="database-validation-page">
      <DashboardHero
        eyebrow="AI辅助工具"
        title="端到端测试"
        description="按旧系统语义执行多系统数据库字段一致性验证：输入主系统表、主键值和比对字段后，逐项查询上下游系统并判断字段值是否一致且非空。"
        chips={[
          { label: `${configs.length} 个数据库配置`, tone: 'accent' },
          { label: `${runsQuery.data?.length ?? 0} 次执行`, tone: 'neutral' },
        ]}
      />

      <div className="database-validation-grid">
        <Card variant="borderless" title={<Space><SwapOutlined />执行配置</Space>}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ name: '端到端字段一致性', target_systems: [{}] }}
            onFinish={submit}
          >
            <Form.Item name="name" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item
              name="primary_database_config_id"
              label="主系统数据库"
              rules={[{ required: true, message: '请选择主系统数据库' }]}
            >
              <Select
                options={configOptions}
                loading={configsQuery.isLoading}
                onChange={() => {
                  form.setFieldsValue({ primary_table: undefined, primary_key_column: undefined, compare_columns: [] });
                }}
              />
            </Form.Item>
            <Space align="start" style={{ width: '100%' }} wrap>
              <Form.Item name="primary_table" label="主系统表" rules={[{ required: true, message: '请选择主系统表' }]} style={{ width: 260 }}>
                <Select
                  showSearch
                  options={tableOptions}
                  loading={primaryTablesQuery.isFetching}
                  onChange={() => form.setFieldsValue({ primary_key_column: undefined, compare_columns: [] })}
                />
              </Form.Item>
              <Button
                icon={<ReloadOutlined />}
                disabled={!primaryConfigId}
                loading={primaryTablesQuery.isFetching}
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['database-config-tables', primaryConfigId, 'e2e'] })}
                style={{ marginTop: 30 }}
              >
                刷新表
              </Button>
            </Space>
            <Form.Item name="primary_key_column" label="主键字段" rules={[{ required: true, message: '请选择主键字段' }]}>
              <Select showSearch options={columnOptions} loading={primaryColumnsQuery.isFetching} />
            </Form.Item>
            <Form.Item name="compare_columns" label="比对字段" rules={[{ required: true, message: '请选择比对字段' }]}>
              <Select mode="multiple" showSearch options={columnOptions} loading={primaryColumnsQuery.isFetching} />
            </Form.Item>
            <Form.Item name="key_values_text" label="主键值" rules={[{ required: true, message: '请输入主键值' }]}>
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="每行一个，或用逗号分隔" />
            </Form.Item>
            <Form.List name="target_systems">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {fields.map((field, index) => (
                    <Card size="small" key={field.key} title={`上下游系统 ${index + 1}`}>
                      <Form.Item name={[field.name, 'system_name']} label="系统名称" rules={[{ required: true, message: '请输入系统名称' }]}>
                        <Input placeholder="例如：影子库" />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'database_config_id']}
                        label="数据库"
                        rules={[{ required: true, message: '请选择数据库' }]}
                      >
                        <Select options={configOptions} loading={configsQuery.isLoading} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'table_name']} label="表名" rules={[{ required: true, message: '请输入表名' }]}>
                        <Input placeholder="上下游系统表名" />
                      </Form.Item>
                      <Form.Item name={[field.name, 'primary_key_column']} label="主键字段">
                        <Input placeholder="不填则沿用主系统主键字段" />
                      </Form.Item>
                      {fields.length > 1 ? (
                        <Button danger onClick={() => remove(field.name)}>
                          移除
                        </Button>
                      ) : null}
                    </Card>
                  ))}
                  <Button icon={<PlusOutlined />} onClick={() => add({})}>
                    新增上下游系统
                  </Button>
                </Space>
              )}
            </Form.List>
            <Button type="primary" htmlType="submit" loading={createMutation.isPending} style={{ marginTop: 16 }}>
              执行端到端测试
            </Button>
          </Form>
        </Card>

        <Card variant="borderless" title="执行记录" styles={{ body: { padding: 0 } }}>
          {runsQuery.isLoading ? (
            <Spin size="large" style={{ display: 'block', margin: '96px auto' }} />
          ) : (runsQuery.data ?? []).length === 0 ? (
            <div style={{ padding: 48 }}>
              <Empty description="暂无端到端测试记录" />
            </div>
          ) : (
            <Table
              rowKey="id"
              columns={runColumns}
              dataSource={runsQuery.data}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 980 }}
            />
          )}
        </Card>
      </div>

      <Drawer
        title={selectedRun ? `${selectedRun.name} 详情` : '端到端测试详情'}
        open={selectedRunId !== null}
        onClose={() => setSelectedRunId(null)}
        size="large"
      >
        {runDetailQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '96px auto' }} />
        ) : selectedRun ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              {statusTag(selectedRun.status)}
              <Tag>检查项 {selectedRun.total_count}</Tag>
              <Tag color="success">通过 {selectedRun.passed_count}</Tag>
              <Tag color="error">不通过 {selectedRun.failed_count}</Tag>
            </Space>
            <Table
              rowKey="id"
              size="small"
              columns={itemColumns}
              dataSource={selectedRun.items ?? []}
              pagination={{ pageSize: 10, showSizeChanger: false }}
              scroll={{ x: 920 }}
            />
          </Space>
        ) : (
          <Empty description="未找到端到端测试详情" />
        )}
      </Drawer>
    </div>
  );
};

export default EndToEndTestingPage;

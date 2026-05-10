import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  DatePicker,
  Descriptions,
  Empty,
  FloatButton,
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
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
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

const { RangePicker } = DatePicker;
const { Text } = Typography;

interface TargetSystemFormValue {
  database_config_id?: number;
  system_name?: string;
  table_name?: string;
  primary_key_column?: string;
  compare_columns_text?: string;
}

interface E2EFormValues {
  name: string;
  compare_type?: string;
  test_version?: string;
  tester?: string;
  primary_database_config_id: number;
  primary_table: string;
  primary_key_column: string;
  compare_columns_text: string;
  key_values_text: string;
  target_systems: TargetSystemFormValue[];
}

interface E2EFilters {
  keyword?: string;
  status?: 'passed' | 'failed' | 'all';
  compare_type?: string;
  created_range?: [unknown, unknown];
}

interface E2EFormReader {
  validateFields: () => Promise<unknown>;
  getFieldsValue: (nameList?: true) => E2EFormValues;
}

const COMPARE_TYPE_OPTIONS = [
  { value: '常规验证', label: '常规验证' },
  { value: '新需求验证', label: '新需求验证' },
];

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function splitTextList(value?: string): string[] {
  return (value ?? '')
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toRangeMillis(range?: [unknown, unknown]): [number, number] | null {
  if (!range?.[0] || !range?.[1]) {
    return null;
  }
  const [start, end] = range;
  const startMs = Number((start as { valueOf: () => number }).valueOf());
  const endMs = Number((end as { valueOf: () => number }).valueOf());
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return null;
  }
  return [startMs, endMs];
}

function statusTag(status: 'passed' | 'failed') {
  return status === 'passed' ? <Tag color="success">通过</Tag> : <Tag color="error">不通过</Tag>;
}

function configLabel(config: DatabaseConfig): string {
  const location = config.db_type === 'sqlite'
    ? config.sqlite_path
    : `${config.host}:${config.port ?? '--'}/${config.database}`;
  return `${config.name} - ${location || config.db_type}`;
}

function targetSummary(target: TargetSystemFormValue, configs: DatabaseConfig[]): string {
  const config = configs.find((item) => item.id === target.database_config_id);
  return [
    target.system_name || config?.name || '上下游系统',
    config ? configLabel(config) : '未选择数据库',
    target.table_name || '未填写表名',
  ].join(' / ');
}

function buildRunPayload(values: E2EFormValues): E2ETestRunPayload {
  const compareColumns = splitTextList(values.compare_columns_text);
  const taskName = values.name?.trim() || '端到端测试';
  const metadata = [values.test_version?.trim(), values.compare_type?.trim(), values.tester?.trim()]
    .filter(Boolean)
    .join(' / ');
  return {
    name: metadata ? `${taskName}（${metadata}）` : taskName,
    primary_database_config_id: values.primary_database_config_id,
    primary_table: values.primary_table,
    primary_key_column: values.primary_key_column,
    compare_columns: compareColumns,
    key_values: splitTextList(values.key_values_text),
    target_systems: (values.target_systems ?? []).map((target, index) => {
      const targetColumns = splitTextList(target.compare_columns_text);
      return {
        database_config_id: Number(target.database_config_id),
        system_name: target.system_name?.trim() || `上下游系统${index + 1}`,
        table_name: target.table_name?.trim() || '',
        primary_key_column: target.primary_key_column?.trim() || values.primary_key_column,
        compare_columns: targetColumns.length > 0 ? targetColumns : compareColumns,
      };
    }),
  };
}

export async function collectE2ETestRunPayload(formReader: E2EFormReader): Promise<E2ETestRunPayload> {
  await formReader.validateFields();
  return buildRunPayload(formReader.getFieldsValue(true));
}

function runMatchesFilters(run: E2ETestRun, filters: E2EFilters): boolean {
  const keyword = filters.keyword?.trim().toLowerCase();
  const request = run.request;
  const searchable = [
    run.name,
    request.primary_table,
    request.primary_key_column,
    request.compare_columns.join(','),
    request.key_values.join(','),
    request.target_systems.map((target) => `${target.system_name} ${target.table_name}`).join(' '),
  ].join(' ').toLowerCase();
  if (keyword && !searchable.includes(keyword)) {
    return false;
  }
  if (filters.status && filters.status !== 'all' && run.status !== filters.status) {
    return false;
  }
  if (filters.compare_type && !run.name.includes(filters.compare_type)) {
    return false;
  }
  const range = toRangeMillis(filters.created_range);
  if (range) {
    const createdAt = new Date(run.created_at.includes('T') ? run.created_at : run.created_at.replace(' ', 'T')).getTime();
    if (Number.isNaN(createdAt) || createdAt < range[0] || createdAt > range[1]) {
      return false;
    }
  }
  return true;
}

const EndToEndTestingPage: React.FC = () => {
  const [form] = Form.useForm<E2EFormValues>();
  const [filterForm] = Form.useForm<E2EFilters>();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<E2EFilters>({});
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [entryStep, setEntryStep] = useState(0);

  const primaryConfigId = Form.useWatch('primary_database_config_id', { form, preserve: true });
  const primaryTable = Form.useWatch('primary_table', { form, preserve: true });
  const targetSystems = Form.useWatch('target_systems', { form, preserve: true }) ?? [];

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
      setWizardOpen(false);
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
  const selectedPrimaryConfig = configs.find((config) => config.id === primaryConfigId);
  const filteredRuns = useMemo(
    () => (runsQuery.data ?? []).filter((run) => runMatchesFilters(run, filters)),
    [runsQuery.data, filters],
  );
  const configOptions = useMemo(
    () => configs.map((config) => ({ value: config.id, label: configLabel(config) })),
    [configs],
  );
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

  const openWizard = () => {
    form.resetFields();
    form.setFieldsValue({
      name: '端到端字段一致性',
      compare_type: '常规验证',
      target_systems: [],
    });
    setEntryStep(0);
    setWizardOpen(true);
  };

  const submit = async () => {
    try {
      const payload = await collectE2ETestRunPayload(form);
      if (payload.key_values.length === 0) {
        message.warning('请输入至少一个比对值');
        setEntryStep(0);
        return;
      }
      if (!payload.primary_database_config_id) {
        message.warning('请选择主系统数据库');
        setEntryStep(1);
        return;
      }
      if (!payload.primary_table) {
        message.warning('请选择主系统表');
        setEntryStep(1);
        return;
      }
      if (!payload.primary_key_column) {
        message.warning('请选择主键字段');
        setEntryStep(1);
        return;
      }
      if (payload.compare_columns.length === 0) {
        message.warning('请输入至少一个对比字段名');
        setEntryStep(1);
        return;
      }
      if (payload.target_systems.length === 0) {
        message.warning('请至少添加一个上下游系统');
        setEntryStep(1);
        return;
      }
      if (payload.target_systems.some((target) => !target.database_config_id || !target.table_name)) {
        message.warning('请补全上下游系统数据库和表名');
        setEntryStep(1);
        return;
      }
      createMutation.mutate(payload);
    } catch {
      message.warning('请先补全端到端任务配置');
    }
  };

  const resetFilters = () => {
    filterForm.resetFields();
    setFilters({});
  };

  const runColumns: ColumnsType<E2ETestRun> = [
    {
      title: '测试版本',
      key: 'version',
      width: 110,
      render: (_, record) => record.request.name?.match(/\d{8}/)?.[0] ?? '--',
    },
    {
      title: '比对名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: '主系统表',
      key: 'primary_table',
      width: 180,
      render: (_, record) => record.request.primary_table,
    },
    {
      title: '比对值',
      key: 'key_values',
      width: 220,
      ellipsis: true,
      render: (_, record) => record.request.key_values.join(', '),
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: statusTag },
    { title: '检查项', dataIndex: 'total_count', key: 'total_count', width: 100 },
    { title: '通过', dataIndex: 'passed_count', key: 'passed_count', width: 100 },
    { title: '不通过', dataIndex: 'failed_count', key: 'failed_count', width: 100 },
    { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 190, render: formatDateTime },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedRunId(record.id)} />
          <Popconfirm
            title="确认删除这条端到端测试记录吗？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button danger size="small" icon={<DeleteOutlined />} />
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
        description="迁移源系统的端对端任务台：先在列表筛选历史任务，再新增主任务、逐个添加上下游系统，并在详情中查看每个字段的跨系统比对结果。"
        chips={[
          { label: `${configs.length} 个数据库配置`, tone: 'accent' },
          { label: `${runsQuery.data?.length ?? 0} 次执行`, tone: 'neutral' },
        ]}
        actions={(
          <Button type="primary" icon={<PlusOutlined />} onClick={openWizard}>
            新增端对端任务
          </Button>
        )}
      />

      <Card variant="borderless" className="database-workbench-card">
        <Form
          form={filterForm}
          className="database-toolbar database-toolbar--stacked"
          layout="inline"
          onFinish={(values) => setFilters(values)}
        >
          <Form.Item name="keyword" label="比对名称">
            <Input allowClear placeholder="任务 / 表 / 字段 / 比对值" prefix={<SearchOutlined />} />
          </Form.Item>
          <Form.Item name="compare_type" label="验证类型">
            <Select allowClear placeholder="全部" style={{ width: 150 }} options={COMPARE_TYPE_OPTIONS} />
          </Form.Item>
          <Form.Item name="status" label="状态">
            <Select
              allowClear
              placeholder="全部"
              style={{ width: 140 }}
              options={[
                { value: 'passed', label: '通过' },
                { value: 'failed', label: '不通过' },
              ]}
            />
          </Form.Item>
          <Form.Item name="created_range" label="创建时间">
            <RangePicker showTime />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button icon={<UndoOutlined />} onClick={resetFilters}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>

        {runsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '96px auto' }} />
        ) : filteredRuns.length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="暂无端到端测试记录" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={runColumns}
            dataSource={filteredRuns}
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 1450, y: 460 }}
          />
        )}
      </Card>

      <FloatButton
        className="database-float-action"
        type="primary"
        icon={<PlusOutlined />}
        tooltip="新增端对端任务"
        onClick={openWizard}
      />

      <Modal
        title="新增端对端任务"
        open={wizardOpen}
        onCancel={() => setWizardOpen(false)}
        width={960}
        footer={(
          <Space>
            <Button onClick={() => setEntryStep((step) => Math.max(0, step - 1))} disabled={entryStep === 0 || createMutation.isPending}>
              上一步
            </Button>
            {entryStep === 0 ? (
              <Button
                type="primary"
                onClick={() => {
                  void form.validateFields(['name', 'compare_type', 'key_values_text']).then(() => setEntryStep(1));
                }}
              >
                下一步
              </Button>
            ) : (
              <Button type="primary" loading={createMutation.isPending} onClick={() => void submit()}>
                提交
              </Button>
            )}
          </Space>
        )}
      >
        <div className="e2e-task-entry">
          <div className="e2e-task-entry__steps">
            <Button type={entryStep === 0 ? 'primary' : 'default'} onClick={() => setEntryStep(0)}>
              1. 任务信息
            </Button>
            <Button type={entryStep === 1 ? 'primary' : 'default'} onClick={() => setEntryStep(1)}>
              2. 上下游系统
            </Button>
          </div>
          <Form form={form} layout="vertical" initialValues={{ compare_type: '常规验证', target_systems: [] }}>
            {entryStep === 0 ? (
              <div className="validation-step-panel">
                <Space align="start" style={{ width: '100%' }} wrap>
                  <Form.Item name="name" label="比对名称" rules={[{ required: true, message: '请输入比对名称' }]} style={{ minWidth: 300, flex: 1 }}>
                    <Input placeholder="例如：保单状态端到端核对" />
                  </Form.Item>
                  <Form.Item name="test_version" label="测试版本" style={{ width: 180 }}>
                    <Input placeholder="YYYYMMDD" />
                  </Form.Item>
                  <Form.Item name="tester" label="测试人员" style={{ width: 180 }}>
                    <Input placeholder="姓名/工号" />
                  </Form.Item>
                  <Form.Item name="compare_type" label="验证类型" rules={[{ required: true, message: '请选择验证类型' }]} style={{ width: 180 }}>
                    <Select options={COMPARE_TYPE_OPTIONS} />
                  </Form.Item>
                </Space>
                <Form.Item name="key_values_text" label="比对值" rules={[{ required: true, message: '请输入比对值' }]}>
                  <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="可连续输入多个比对值，每行一个或用逗号分隔" />
                </Form.Item>
              </div>
            ) : (
              <div className="validation-step-panel">
                <Space align="start" style={{ width: '100%' }} wrap>
                  <Form.Item
                    name="primary_database_config_id"
                    label="主系统数据库"
                    rules={[{ required: true, message: '请选择主系统数据库' }]}
                    style={{ minWidth: 360, flex: 1 }}
                  >
                    <Select
                      showSearch
                      options={configOptions}
                      loading={configsQuery.isLoading}
                      onChange={() => {
                        form.setFieldsValue({ primary_table: undefined, primary_key_column: undefined, compare_columns_text: '' });
                      }}
                    />
                  </Form.Item>
                  <Button
                    icon={<ReloadOutlined />}
                    disabled={!primaryConfigId}
                    loading={primaryTablesQuery.isFetching}
                    onClick={() => void queryClient.invalidateQueries({ queryKey: ['database-config-tables', primaryConfigId, 'e2e'] })}
                    style={{ marginTop: 30 }}
                  >
                    拉取表
                  </Button>
                </Space>
                {selectedPrimaryConfig ? (
                  <Descriptions size="small" column={2} bordered>
                    <Descriptions.Item label="主系统">{selectedPrimaryConfig.name}</Descriptions.Item>
                    <Descriptions.Item label="连接">{configLabel(selectedPrimaryConfig)}</Descriptions.Item>
                  </Descriptions>
                ) : null}
                <Space align="start" style={{ width: '100%' }} wrap>
                  <Form.Item name="primary_table" label="主系统表" rules={[{ required: true, message: '请选择主系统表' }]} style={{ minWidth: 260, flex: 1 }}>
                    <Select
                      showSearch
                      options={tableOptions}
                      loading={primaryTablesQuery.isFetching}
                      onChange={() => form.setFieldsValue({ primary_key_column: undefined, compare_columns_text: '' })}
                    />
                  </Form.Item>
                  <Form.Item name="primary_key_column" label="主键字段名" rules={[{ required: true, message: '请选择主键字段' }]} style={{ minWidth: 220, flex: 1 }}>
                    <Select showSearch options={columnOptions} loading={primaryColumnsQuery.isFetching} />
                  </Form.Item>
                </Space>
                <Form.Item name="compare_columns_text" label="对比字段名" rules={[{ required: true, message: '请输入对比字段名' }]}>
                  <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="可连续输入多个对比字段名，每行一个或用逗号分隔" />
                </Form.Item>

                <Form.List name="target_systems">
                  {(fields, { add, remove }) => (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <div className="e2e-target-header">
                        <Text strong>上下游系统</Text>
                        <Button icon={<PlusOutlined />} onClick={() => add({})}>
                          添加
                        </Button>
                      </div>
                      {fields.length === 0 ? (
                        <Empty description="请添加至少一个上下游系统" />
                      ) : null}
                      {fields.map((field, index) => (
                        <Card size="small" key={field.key} title={`上下游系统 ${index + 1}`} className="validation-rule-card">
                          <Space align="start" style={{ width: '100%' }} wrap>
                            <Form.Item name={[field.name, 'system_name']} label="系统名称" rules={[{ required: true, message: '请输入系统名称' }]} style={{ minWidth: 220, flex: 1 }}>
                              <Input placeholder="例如：影子库" />
                            </Form.Item>
                            <Form.Item name={[field.name, 'database_config_id']} label="数据库" rules={[{ required: true, message: '请选择数据库' }]} style={{ minWidth: 320, flex: 1 }}>
                              <Select showSearch options={configOptions} loading={configsQuery.isLoading} />
                            </Form.Item>
                          </Space>
                          <Space align="start" style={{ width: '100%' }} wrap>
                            <Form.Item name={[field.name, 'table_name']} label="表名" rules={[{ required: true, message: '请输入表名' }]} style={{ minWidth: 220, flex: 1 }}>
                              <Input placeholder="上下游系统表名" />
                            </Form.Item>
                            <Form.Item name={[field.name, 'primary_key_column']} label="主键字段名" style={{ minWidth: 220, flex: 1 }}>
                              <Input placeholder="不填则沿用主系统主键字段" />
                            </Form.Item>
                          </Space>
                          <Form.Item name={[field.name, 'compare_columns_text']} label="对比字段名">
                            <Input.TextArea autoSize={{ minRows: 2, maxRows: 4 }} placeholder="不填则沿用主系统对比字段" />
                          </Form.Item>
                          <Space>
                            <Text type="secondary">{targetSummary(targetSystems[field.name] ?? {}, configs)}</Text>
                            <Button danger size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>
                              移除
                            </Button>
                          </Space>
                        </Card>
                      ))}
                    </Space>
                  )}
                </Form.List>
              </div>
            )}
          </Form>
        </div>
      </Modal>

      <Modal
        title={selectedRun ? `${selectedRun.name} 详情` : '端到端任务详情'}
        open={selectedRunId !== null}
        onCancel={() => setSelectedRunId(null)}
        width={980}
        centered
        footer={null}
        className="database-detail-modal"
      >
        {runDetailQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '96px auto' }} />
        ) : selectedRun ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={{ xs: 1, md: 2 }}>
              <Descriptions.Item label="比对名称">{selectedRun.name}</Descriptions.Item>
              <Descriptions.Item label="状态">{statusTag(selectedRun.status)}</Descriptions.Item>
              <Descriptions.Item label="主系统表">{selectedRun.request.primary_table}</Descriptions.Item>
              <Descriptions.Item label="主键字段">{selectedRun.request.primary_key_column}</Descriptions.Item>
              <Descriptions.Item label="比对字段">{selectedRun.request.compare_columns.join(', ')}</Descriptions.Item>
              <Descriptions.Item label="比对值">{selectedRun.request.key_values.join(', ')}</Descriptions.Item>
              <Descriptions.Item label="检查项">{selectedRun.total_count}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDateTime(selectedRun.created_at)}</Descriptions.Item>
            </Descriptions>
            <Space wrap>
              <Tag color="success">通过 {selectedRun.passed_count}</Tag>
              <Tag color="error">不通过 {selectedRun.failed_count}</Tag>
              {selectedRun.request.target_systems.map((target) => (
                <Tag key={`${target.system_name}-${target.table_name}`}>{target.system_name} / {target.table_name}</Tag>
              ))}
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
      </Modal>
    </div>
  );
};

export default EndToEndTestingPage;

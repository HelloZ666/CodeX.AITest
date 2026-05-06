import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
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
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardHero from '../components/Layout/DashboardHero';
import type {
  DatabaseColumnMetadata,
  DatabaseTableMetadata,
  RegressionRulePayload,
  RegressionRuleType,
  RegressionScan,
  RegressionScanItem,
  RegressionScanPayload,
} from '../types';
import {
  createRegressionScan,
  deleteRegressionScan,
  extractApiErrorMessage,
  getRegressionScan,
  listDatabaseColumns,
  listDatabaseConfigs,
  listDatabaseTables,
  listRegressionScans,
} from '../utils/api';

const { Text } = Typography;

interface RegressionRuleFormValue {
  column_name?: string;
  rule_type?: RegressionRuleType;
  expected_values_text?: string;
  min_count?: number;
}

interface RegressionFormValues {
  name: string;
  database_config_id: number;
  table_name: string;
  created_at_column?: string;
  start_time?: string;
  end_time?: string;
  rules: RegressionRuleFormValue[];
}

const RULE_TYPE_OPTIONS: Array<{ value: RegressionRuleType; label: string }> = [
  { value: 'not_null', label: '字段非空' },
  { value: 'enum_count', label: '枚举次数' },
];

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function statusTag(status: 'passed' | 'failed') {
  return status === 'passed' ? <Tag color="success">通过</Tag> : <Tag color="error">不通过</Tag>;
}

function getRuleTypeLabel(ruleType: RegressionRuleType): string {
  return RULE_TYPE_OPTIONS.find((item) => item.value === ruleType)?.label ?? ruleType;
}

function splitExpectedValues(value?: string): string[] {
  return (value ?? '')
    .split(/[\n,，]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildScanPayload(values: RegressionFormValues): RegressionScanPayload {
  const rules: RegressionRulePayload[] = (values.rules ?? []).map((rule) => ({
    column_name: rule.column_name ?? '',
    rule_type: rule.rule_type ?? 'not_null',
    expected_values: rule.rule_type === 'enum_count' ? splitExpectedValues(rule.expected_values_text) : [],
    min_count: rule.rule_type === 'enum_count' ? (rule.min_count ?? 1) : 1,
  }));

  return {
    name: values.name?.trim() || '回归验证',
    database_config_id: values.database_config_id,
    table_name: values.table_name,
    created_at_column: values.created_at_column || null,
    start_time: values.start_time?.trim() || null,
    end_time: values.end_time?.trim() || null,
    rules,
  };
}

const RegressionValidationPage: React.FC = () => {
  const [form] = Form.useForm<RegressionFormValues>();
  const queryClient = useQueryClient();
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);

  const configId = Form.useWatch('database_config_id', form);
  const tableName = Form.useWatch('table_name', form);

  const configsQuery = useQuery({
    queryKey: ['database-configs'],
    queryFn: listDatabaseConfigs,
  });

  const tablesQuery = useQuery({
    queryKey: ['database-config-tables', configId, 'regression'],
    queryFn: () => listDatabaseTables(configId, true),
    enabled: Boolean(configId),
  });

  const columnsQuery = useQuery({
    queryKey: ['database-config-columns', configId, tableName, 'regression'],
    queryFn: () => listDatabaseColumns(configId, tableName, true),
    enabled: Boolean(configId && tableName),
  });

  const scansQuery = useQuery({
    queryKey: ['regression-scans'],
    queryFn: listRegressionScans,
  });

  const scanDetailQuery = useQuery({
    queryKey: ['regression-scan', selectedScanId],
    queryFn: () => getRegressionScan(selectedScanId as number),
    enabled: selectedScanId !== null,
  });

  const createMutation = useMutation({
    mutationFn: createRegressionScan,
    onSuccess: (scan) => {
      void queryClient.invalidateQueries({ queryKey: ['regression-scans'] });
      setSelectedScanId(scan.id);
      message.success('回归验证扫描已完成');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '执行回归验证失败')),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteRegressionScan,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['regression-scans'] });
      message.success('回归验证记录已删除');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '删除回归验证记录失败')),
  });

  const configs = configsQuery.data ?? [];
  const configOptions = useMemo(
    () => configs.map((config) => ({ value: config.id, label: `${config.name}（${config.db_type}）` })),
    [configs],
  );
  const tableOptions = useMemo(
    () => (tablesQuery.data ?? []).map((table: DatabaseTableMetadata) => ({
      value: table.table_name,
      label: table.table_name,
    })),
    [tablesQuery.data],
  );
  const columnOptions = useMemo(
    () => (columnsQuery.data ?? []).map((column: DatabaseColumnMetadata) => ({
      value: column.column_name,
      label: `${column.column_name}${column.data_type ? ` (${column.data_type})` : ''}`,
    })),
    [columnsQuery.data],
  );

  const submit = (values: RegressionFormValues) => {
    const payload = buildScanPayload(values);
    if (payload.rules.some((rule) => !rule.column_name)) {
      message.warning('请为每条规则选择字段');
      return;
    }
    if (payload.rules.some((rule) => rule.rule_type === 'enum_count' && (rule.expected_values ?? []).length === 0)) {
      message.warning('枚举次数规则需要填写枚举值');
      return;
    }
    createMutation.mutate(payload);
  };

  const scanColumns: ColumnsType<RegressionScan> = [
    {
      title: '扫描名称',
      dataIndex: 'name',
      key: 'name',
      width: 220,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    { title: '表名', dataIndex: 'table_name', key: 'table_name', width: 160 },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: statusTag },
    { title: '规则数', dataIndex: 'total_rules', key: 'total_rules', width: 100 },
    { title: '通过', dataIndex: 'passed_rules', key: 'passed_rules', width: 100 },
    { title: '失败', dataIndex: 'failed_rules', key: 'failed_rules', width: 100 },
    { title: '扫描时间', dataIndex: 'created_at', key: 'created_at', width: 190, render: formatDateTime },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedScanId(record.id)}>
            详情
          </Button>
          <Popconfirm
            title="确认删除这条回归验证记录吗？"
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

  const itemColumns: ColumnsType<RegressionScanItem> = [
    { title: '字段', dataIndex: 'column_name', key: 'column_name', width: 150 },
    {
      title: '规则',
      dataIndex: 'rule_type',
      key: 'rule_type',
      width: 120,
      render: (value: RegressionRuleType) => getRuleTypeLabel(value),
    },
    { title: '状态', dataIndex: 'status', key: 'status', width: 100, render: statusTag },
    { title: '检查项', dataIndex: 'checked_count', key: 'checked_count', width: 100 },
    { title: '失败数', dataIndex: 'failed_count', key: 'failed_count', width: 100 },
    { title: '说明', dataIndex: 'message', key: 'message' },
  ];

  const selectedScan = scanDetailQuery.data;

  return (
    <div className="database-validation-page">
      <DashboardHero
        eyebrow="AI辅助工具"
        title="回归验证"
        description="按数据库字段规则执行回归扫描，支持字段非空和枚举值出现次数两类旧系统核心规则，可按创建时间字段限定扫描范围。"
        chips={[
          { label: `${configs.length} 个数据库配置`, tone: 'accent' },
          { label: `${scansQuery.data?.length ?? 0} 次扫描`, tone: 'neutral' },
        ]}
      />

      <div className="database-validation-grid">
        <Card variant="borderless" title={<Space><SafetyCertificateOutlined />扫描配置</Space>}>
          <Form
            form={form}
            layout="vertical"
            initialValues={{ name: '数据库字段回归扫描', rules: [{ rule_type: 'not_null', min_count: 1 }] }}
            onFinish={submit}
          >
            <Form.Item name="name" label="扫描名称" rules={[{ required: true, message: '请输入扫描名称' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="database_config_id" label="数据库配置" rules={[{ required: true, message: '请选择数据库配置' }]}>
              <Select
                options={configOptions}
                loading={configsQuery.isLoading}
                onChange={() => form.setFieldsValue({ table_name: undefined, created_at_column: undefined })}
              />
            </Form.Item>
            <Space align="start" style={{ width: '100%' }} wrap>
              <Form.Item name="table_name" label="扫描表" rules={[{ required: true, message: '请选择扫描表' }]} style={{ width: 260 }}>
                <Select
                  showSearch
                  options={tableOptions}
                  loading={tablesQuery.isFetching}
                  onChange={() => form.setFieldsValue({ created_at_column: undefined })}
                />
              </Form.Item>
              <Button
                icon={<ReloadOutlined />}
                disabled={!configId}
                loading={tablesQuery.isFetching}
                onClick={() => void queryClient.invalidateQueries({ queryKey: ['database-config-tables', configId, 'regression'] })}
                style={{ marginTop: 30 }}
              >
                刷新表
              </Button>
            </Space>
            <Form.Item name="created_at_column" label="创建时间字段">
              <Select allowClear showSearch options={columnOptions} loading={columnsQuery.isFetching} />
            </Form.Item>
            <Space align="start" style={{ width: '100%' }} wrap>
              <Form.Item name="start_time" label="开始时间" style={{ width: 260 }}>
                <Input placeholder="2026-05-01 00:00:00" />
              </Form.Item>
              <Form.Item name="end_time" label="结束时间" style={{ width: 260 }}>
                <Input placeholder="2026-05-02 23:59:59" />
              </Form.Item>
            </Space>
            <Form.List name="rules">
              {(fields, { add, remove }) => (
                <Space direction="vertical" size={12} style={{ width: '100%' }}>
                  {fields.map((field, index) => {
                    const ruleType = form.getFieldValue(['rules', field.name, 'rule_type']) as RegressionRuleType | undefined;
                    return (
                      <Card size="small" key={field.key} title={`规则 ${index + 1}`}>
                        <Form.Item name={[field.name, 'column_name']} label="字段" rules={[{ required: true, message: '请选择字段' }]}>
                          <Select showSearch options={columnOptions} loading={columnsQuery.isFetching} />
                        </Form.Item>
                        <Form.Item name={[field.name, 'rule_type']} label="规则类型" rules={[{ required: true, message: '请选择规则类型' }]}>
                          <Select options={RULE_TYPE_OPTIONS} />
                        </Form.Item>
                        {ruleType === 'enum_count' ? (
                          <>
                            <Form.Item name={[field.name, 'expected_values_text']} label="枚举值" rules={[{ required: true, message: '请输入枚举值' }]}>
                              <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="每行一个，或用逗号分隔" />
                            </Form.Item>
                            <Form.Item name={[field.name, 'min_count']} label="最少出现次数">
                              <InputNumber min={1} style={{ width: 160 }} />
                            </Form.Item>
                          </>
                        ) : null}
                        {fields.length > 1 ? (
                          <Button danger onClick={() => remove(field.name)}>
                            移除
                          </Button>
                        ) : null}
                      </Card>
                    );
                  })}
                  <Button icon={<PlusOutlined />} onClick={() => add({ rule_type: 'not_null', min_count: 1 })}>
                    新增规则
                  </Button>
                </Space>
              )}
            </Form.List>
            <Button type="primary" htmlType="submit" loading={createMutation.isPending} style={{ marginTop: 16 }}>
              执行回归验证
            </Button>
          </Form>
        </Card>

        <Card variant="borderless" title="扫描记录" styles={{ body: { padding: 0 } }}>
          {scansQuery.isLoading ? (
            <Spin size="large" style={{ display: 'block', margin: '96px auto' }} />
          ) : (scansQuery.data ?? []).length === 0 ? (
            <div style={{ padding: 48 }}>
              <Empty description="暂无回归验证记录" />
            </div>
          ) : (
            <Table
              rowKey="id"
              columns={scanColumns}
              dataSource={scansQuery.data}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 990 }}
            />
          )}
        </Card>
      </div>

      <Drawer
        title={selectedScan ? `${selectedScan.name} 详情` : '回归验证详情'}
        open={selectedScanId !== null}
        onClose={() => setSelectedScanId(null)}
        size="large"
      >
        {scanDetailQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '96px auto' }} />
        ) : selectedScan ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Space wrap>
              {statusTag(selectedScan.status)}
              <Tag>规则 {selectedScan.total_rules}</Tag>
              <Tag color="success">通过 {selectedScan.passed_rules}</Tag>
              <Tag color="error">失败 {selectedScan.failed_rules}</Tag>
              <Tag>{selectedScan.table_name}</Tag>
            </Space>
            <Table
              rowKey="id"
              size="small"
              columns={itemColumns}
              dataSource={selectedScan.items ?? []}
              pagination={{ pageSize: 10, showSizeChanger: false }}
            />
          </Space>
        ) : (
          <Empty description="未找到回归验证详情" />
        )}
      </Drawer>
    </div>
  );
};

export default RegressionValidationPage;

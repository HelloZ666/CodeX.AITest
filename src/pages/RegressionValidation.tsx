import React, { useMemo, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Result,
  Select,
  Space,
  Spin,
  Steps,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DeleteOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  FileSearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardHero from '../components/Layout/DashboardHero';
import type {
  DatabaseColumnMetadata,
  DatabaseConfig,
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
  name?: string;
  database_config_id?: number;
  table_name?: string;
  created_at_column?: string;
  start_time?: string;
  end_time?: string;
  rules?: RegressionRuleFormValue[];
}

interface RegressionFormReader {
  validateFields: (fields?: Array<keyof RegressionFormValues>) => Promise<unknown>;
  getFieldsValue: (nameList?: true) => RegressionFormValues;
}

const RULE_TYPE_OPTIONS: Array<{ value: RegressionRuleType; label: string }> = [
  { value: 'not_null', label: '字段非空' },
  { value: 'enum_count', label: '枚举次数' },
];

const WIZARD_STEPS = [
  { title: '选择数据库', icon: <DatabaseStepIcon /> },
  { title: '拉取表字段', icon: <ReloadOutlined /> },
  { title: '维护时间字段', icon: <FieldTimeOutlined /> },
  { title: '配置字段规则', icon: <SafetyCertificateOutlined /> },
  { title: '扫描字段规则', icon: <ScanOutlined /> },
  { title: '查询报告', icon: <FileSearchOutlined /> },
];

function DatabaseStepIcon() {
  return <SafetyCertificateOutlined />;
}

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
  const rules: RegressionRulePayload[] = (values.rules ?? [])
    .filter((rule): rule is RegressionRuleFormValue => Boolean(rule))
    .map((rule) => ({
      column_name: rule.column_name ?? '',
      rule_type: rule.rule_type ?? 'not_null',
      expected_values: rule.rule_type === 'enum_count' ? splitExpectedValues(rule.expected_values_text) : [],
      min_count: rule.rule_type === 'enum_count' ? (rule.min_count ?? 1) : 1,
    }));

  return {
    name: values.name?.trim() || '回归验证',
    database_config_id: values.database_config_id ?? 0,
    table_name: values.table_name ?? '',
    created_at_column: values.created_at_column || null,
    start_time: values.start_time?.trim() || null,
    end_time: values.end_time?.trim() || null,
    rules,
  };
}

export async function collectRegressionScanPayload(formReader: RegressionFormReader): Promise<RegressionScanPayload> {
  await formReader.validateFields(['name']);
  return buildScanPayload(formReader.getFieldsValue(true));
}

function configLabel(config: DatabaseConfig): string {
  const location = config.db_type === 'sqlite'
    ? config.sqlite_path
    : `${config.host}:${config.port ?? '--'}/${config.database}`;
  return `${config.name} - ${location || config.db_type}`;
}

const RegressionValidationPage: React.FC = () => {
  const [form] = Form.useForm<RegressionFormValues>();
  const queryClient = useQueryClient();
  const [activeStep, setActiveStep] = useState(0);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [lastScanId, setLastScanId] = useState<number | null>(null);

  const configId = Form.useWatch('database_config_id', { form, preserve: true });
  const tableName = Form.useWatch('table_name', { form, preserve: true });
  const selectedRules = Form.useWatch('rules', { form, preserve: true }) ?? [];

  const configsQuery = useQuery({
    queryKey: ['database-configs'],
    queryFn: listDatabaseConfigs,
  });

  const tablesQuery = useQuery({
    queryKey: ['database-config-tables', configId, 'regression'],
    queryFn: () => listDatabaseTables(configId as number, true),
    enabled: Boolean(configId),
  });

  const columnsQuery = useQuery({
    queryKey: ['database-config-columns', configId, tableName, 'regression'],
    queryFn: () => listDatabaseColumns(configId as number, tableName as string, true),
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
      setLastScanId(scan.id);
      setSelectedScanId(scan.id);
      setActiveStep(5);
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
  const selectedConfig = configs.find((config) => config.id === configId);
  const configOptions = useMemo(
    () => configs.map((config) => ({ value: config.id, label: configLabel(config) })),
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

  const openWizard = () => {
    form.resetFields();
    form.setFieldsValue({ name: '数据库字段回归扫描', rules: [{ rule_type: 'not_null', min_count: 1 }] });
    setLastScanId(null);
    setActiveStep(0);
    setWizardOpen(true);
  };

  const validateCurrentStep = async (): Promise<boolean> => {
    const stepFields: Array<Array<keyof RegressionFormValues>> = [
      ['database_config_id'],
      ['table_name'],
      [],
      ['rules'],
      ['name'],
      [],
    ];
    const fields = stepFields[activeStep] ?? [];
    if (fields.length === 0) {
      return true;
    }
    try {
      await form.validateFields(fields);
      return true;
    } catch {
      return false;
    }
  };

  const goNext = async () => {
    if (!(await validateCurrentStep())) {
      return;
    }
    setActiveStep((current) => Math.min(current + 1, WIZARD_STEPS.length - 1));
  };

  const goPrev = () => {
    setActiveStep((current) => Math.max(current - 1, 0));
  };

  const submit = async () => {
    try {
      const payload = await collectRegressionScanPayload(form);
      if (!payload.database_config_id) {
        message.warning('请选择数据库配置');
        setActiveStep(0);
        return;
      }
      if (!payload.table_name) {
        message.warning('请选择扫描表');
        setActiveStep(1);
        return;
      }
      if (payload.rules.length === 0) {
        message.warning('至少需要配置一条扫描规则');
        setActiveStep(3);
        return;
      }
      if (payload.rules.some((rule) => !rule.column_name)) {
        message.warning('请为每条规则选择字段');
        setActiveStep(3);
        return;
      }
      if (payload.rules.some((rule) => rule.rule_type === 'enum_count' && (rule.expected_values ?? []).length === 0)) {
        message.warning('枚举次数规则需要填写枚举值');
        setActiveStep(3);
        return;
      }
      createMutation.mutate(payload);
    } catch {
      message.warning('请先补全扫描配置');
    }
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
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space size={6}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setSelectedScanId(record.id)} />
          <Popconfirm
            title="确认删除这条回归验证记录吗？"
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
  const lastScan = scansQuery.data?.find((scan) => scan.id === lastScanId);
  const tableListEmptyText = !configId ? (
    <Empty description="请先选择数据库配置" />
  ) : tablesQuery.isFetching ? (
    <Empty description="正在拉取表字段信息" />
  ) : tablesQuery.isError ? (
    <Result
      status="warning"
      title="拉取表字段信息失败"
      subTitle={extractApiErrorMessage(tablesQuery.error, '请检查数据库配置或后端服务日志')}
      extra={(
        <Button type="primary" onClick={() => void tablesQuery.refetch()}>
          重试
        </Button>
      )}
    />
  ) : (
    <Empty description="该数据库未返回可扫描表，请确认连接的库或 Schema 是否正确" />
  );

  return (
    <div className="database-validation-page">
      <DashboardHero
        eyebrow="AI辅助工具"
        title="回归验证"
        description="迁移源系统的分步回归流程：先选择数据库，再拉取表字段、维护时间字段、配置规则、执行扫描，最后查看报告。"
        chips={[
          { label: `${configs.length} 个数据库配置`, tone: 'accent' },
          { label: `${scansQuery.data?.length ?? 0} 次扫描`, tone: 'neutral' },
        ]}
        actions={(
          <Button type="primary" icon={<PlusOutlined />} onClick={openWizard}>
            开始回归验证
          </Button>
        )}
      />

      <Card variant="borderless" className="database-workbench-card">
        <div className="validation-table-heading">
          <Space>
            <SafetyCertificateOutlined />
            <Text strong>扫描记录</Text>
          </Space>
          <Button icon={<ReloadOutlined />} onClick={() => void queryClient.invalidateQueries({ queryKey: ['regression-scans'] })}>
            刷新
          </Button>
        </div>
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
            pagination={{ pageSize: 10, showSizeChanger: true }}
            scroll={{ x: 990 }}
          />
        )}
      </Card>

      <Modal
        title="回归验证流程"
        open={wizardOpen}
        onCancel={() => setWizardOpen(false)}
        width={980}
        footer={(
          <Space>
            <Button onClick={goPrev} disabled={activeStep === 0 || createMutation.isPending}>
              上一步
            </Button>
            {activeStep < 4 ? (
              <Button type="primary" onClick={() => void goNext()}>
                下一步
              </Button>
            ) : activeStep === 4 ? (
              <Button type="primary" icon={<ScanOutlined />} loading={createMutation.isPending} onClick={() => void submit()}>
                执行扫描
              </Button>
            ) : (
              <Button type="primary" onClick={() => setWizardOpen(false)}>
                完成
              </Button>
            )}
          </Space>
        )}
      >
        <div className="validation-wizard">
          <Steps
            current={activeStep}
            items={WIZARD_STEPS}
            onChange={(nextStep) => setActiveStep(nextStep)}
            responsive
          />
          <Form
            form={form}
            layout="vertical"
            initialValues={{ name: '数据库字段回归扫描', rules: [{ rule_type: 'not_null', min_count: 1 }] }}
          >
            {activeStep === 0 ? (
              <div className="validation-step-panel">
                <Form.Item name="database_config_id" label="数据库配置" rules={[{ required: true, message: '请选择数据库配置' }]}>
                  <Select
                    showSearch
                    options={configOptions}
                    loading={configsQuery.isLoading}
                    placeholder="请选择数据库"
                    onChange={() => form.setFieldsValue({ table_name: undefined, created_at_column: undefined })}
                  />
                </Form.Item>
                {selectedConfig ? (
                  <Descriptions bordered size="small" column={2}>
                    <Descriptions.Item label="类型">{selectedConfig.db_type}</Descriptions.Item>
                    <Descriptions.Item label="连接">{configLabel(selectedConfig)}</Descriptions.Item>
                    <Descriptions.Item label="用户">{selectedConfig.username || '--'}</Descriptions.Item>
                    <Descriptions.Item label="说明">{selectedConfig.description || '--'}</Descriptions.Item>
                  </Descriptions>
                ) : null}
              </div>
            ) : null}

            {activeStep === 1 ? (
              <div className="validation-step-panel">
                <Space align="start" style={{ width: '100%' }} wrap>
                  <Form.Item name="table_name" label="扫描表" rules={[{ required: true, message: '请选择扫描表' }]} style={{ minWidth: 360, flex: 1 }}>
                    <Select
                      showSearch
                      options={tableOptions}
                      loading={tablesQuery.isFetching}
                      placeholder="选择表"
                      onChange={() => form.setFieldsValue({ created_at_column: undefined })}
                    />
                  </Form.Item>
                  <Button
                    icon={<ReloadOutlined />}
                    disabled={!configId}
                    loading={tablesQuery.isFetching}
                    onClick={() => void tablesQuery.refetch()}
                    style={{ marginTop: 30 }}
                  >
                    拉取表、字段信息
                  </Button>
                </Space>
                {configId && !tablesQuery.isFetching && !tablesQuery.isError ? (
                  <Text type="secondary">
                    已拉取 {tablesQuery.data?.length ?? 0} 张表
                  </Text>
                ) : null}
                <Table
                  rowKey="table_name"
                  size="small"
                  columns={[
                    { title: '表名', dataIndex: 'table_name', key: 'table_name' },
                    { title: '说明', dataIndex: 'table_comment', key: 'table_comment', render: (value: string) => value || '--' },
                    { title: '同步时间', dataIndex: 'synced_at', key: 'synced_at', width: 180, render: formatDateTime },
                  ]}
                  dataSource={tablesQuery.data ?? []}
                  loading={tablesQuery.isFetching}
                  locale={{ emptyText: tableListEmptyText }}
                  pagination={{ pageSize: 5 }}
                  onRow={(record) => ({ onClick: () => form.setFieldsValue({ table_name: record.table_name }) })}
                />
              </div>
            ) : null}

            {activeStep === 2 ? (
              <div className="validation-step-panel">
                <Form.Item name="created_at_column" label="表创建时间字段">
                  <Select allowClear showSearch options={columnOptions} loading={columnsQuery.isFetching} placeholder="可选，用于限定扫描范围" />
                </Form.Item>
                <Space align="start" style={{ width: '100%' }} wrap>
                  <Form.Item name="start_time" label="开始时间" style={{ width: 260 }}>
                    <Input placeholder="2026-05-01 00:00:00" />
                  </Form.Item>
                  <Form.Item name="end_time" label="结束时间" style={{ width: 260 }}>
                    <Input placeholder="2026-05-02 23:59:59" />
                  </Form.Item>
                </Space>
                <Table
                  rowKey="column_name"
                  size="small"
                  columns={[
                    { title: '字段', dataIndex: 'column_name', key: 'column_name' },
                    { title: '类型', dataIndex: 'data_type', key: 'data_type', width: 160 },
                    { title: '允许空', dataIndex: 'is_nullable', key: 'is_nullable', width: 100, render: (value: boolean) => (value ? '是' : '否') },
                  ]}
                  dataSource={columnsQuery.data ?? []}
                  loading={columnsQuery.isFetching}
                  pagination={{ pageSize: 6 }}
                />
              </div>
            ) : null}

            {activeStep === 3 ? (
              <div className="validation-step-panel">
                <Form.List name="rules">
                  {(fields, { add, remove }) => (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      {fields.map((field, index) => {
                        const ruleType = selectedRules?.[field.name]?.rule_type as RegressionRuleType | undefined;
                        return (
                          <Card size="small" key={field.key} title={`字段规则 ${index + 1}`} className="validation-rule-card">
                            <Space align="start" style={{ width: '100%' }} wrap>
                              <Form.Item name={[field.name, 'column_name']} label="字段" rules={[{ required: true, message: '请选择字段' }]} style={{ minWidth: 240, flex: 1 }}>
                                <Select showSearch options={columnOptions} loading={columnsQuery.isFetching} />
                              </Form.Item>
                              <Form.Item name={[field.name, 'rule_type']} label="规则类型" rules={[{ required: true, message: '请选择规则类型' }]} style={{ width: 180 }}>
                                <Select options={RULE_TYPE_OPTIONS} />
                              </Form.Item>
                              <Form.Item name={[field.name, 'min_count']} label="最少次数" style={{ width: 140 }}>
                                <InputNumber min={1} style={{ width: '100%' }} disabled={ruleType !== 'enum_count'} />
                              </Form.Item>
                            </Space>
                            {ruleType === 'enum_count' ? (
                              <Form.Item name={[field.name, 'expected_values_text']} label="枚举值" rules={[{ required: true, message: '请输入枚举值' }]}>
                                <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="每行一个，或用逗号分隔" />
                              </Form.Item>
                            ) : null}
                            {fields.length > 1 ? (
                              <Button danger size="small" icon={<DeleteOutlined />} onClick={() => remove(field.name)}>
                                移除规则
                              </Button>
                            ) : null}
                          </Card>
                        );
                      })}
                      <Button icon={<PlusOutlined />} onClick={() => add({ rule_type: 'not_null', min_count: 1 })}>
                        新增字段规则
                      </Button>
                    </Space>
                  )}
                </Form.List>
              </div>
            ) : null}

            {activeStep === 4 ? (
              <div className="validation-step-panel">
                <Form.Item name="name" label="扫描名称" rules={[{ required: true, message: '请输入扫描名称' }]}>
                  <Input />
                </Form.Item>
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="数据库">{selectedConfig?.name ?? '--'}</Descriptions.Item>
                  <Descriptions.Item label="扫描表">{tableName ?? '--'}</Descriptions.Item>
                  <Descriptions.Item label="时间字段">{form.getFieldValue('created_at_column') || '--'}</Descriptions.Item>
                  <Descriptions.Item label="规则数量">{selectedRules.length}</Descriptions.Item>
                </Descriptions>
              </div>
            ) : null}

            {activeStep === 5 ? (
              <div className="validation-step-panel">
                {lastScan ? (
                  <Descriptions bordered size="small" column={3}>
                    <Descriptions.Item label="扫描名称">{lastScan.name}</Descriptions.Item>
                    <Descriptions.Item label="状态">{statusTag(lastScan.status)}</Descriptions.Item>
                    <Descriptions.Item label="扫描表">{lastScan.table_name}</Descriptions.Item>
                    <Descriptions.Item label="规则数">{lastScan.total_rules}</Descriptions.Item>
                    <Descriptions.Item label="通过">{lastScan.passed_rules}</Descriptions.Item>
                    <Descriptions.Item label="失败">{lastScan.failed_rules}</Descriptions.Item>
                  </Descriptions>
                ) : (
                  <Empty description="执行扫描后将在这里展示报告摘要" />
                )}
              </div>
            ) : null}
          </Form>
        </div>
      </Modal>

      <Modal
        title={selectedScan ? `${selectedScan.name} 详情` : '回归验证详情'}
        open={selectedScanId !== null}
        onCancel={() => setSelectedScanId(null)}
        width={920}
        centered
        footer={null}
        className="database-detail-modal"
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
      </Modal>
    </div>
  );
};

export default RegressionValidationPage;

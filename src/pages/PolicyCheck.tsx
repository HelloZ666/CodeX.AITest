import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
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
  CloseCircleOutlined,
  EditOutlined,
  FileSearchOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  ReloadOutlined,
  ScanOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { PdfSnapshotPreview } from '../components/PdfPreview/PdfSnapshotPreview';
import { GlassStepCard, GlowActionButton } from '../components/Workbench/GlassWorkbench';
import { PROMPT_TEMPLATE_MODULE_POLICY_CHECK, getPromptTemplateModuleLabel } from '../constants/promptTemplates';
import type { PdfCheckRecordDetail, PdfCheckRecordSummary, PdfCheckResult, PromptTemplate } from '../types';
import {
  createPolicyCheckRecord,
  extractApiErrorMessage,
  getPolicyCheckRecord,
  listPolicyCheckRecords,
  listProjects,
  listPromptTemplates,
  updatePdfCheckManualResult,
} from '../utils/api';

const { Title, Text } = Typography;

type SelectRawValue = number | string | { value?: number | string | null } | null | undefined;

interface PolicyCheckFormValues {
  project_id?: SelectRawValue;
  test_version?: string;
  source_policy_code?: string;
  target_policy_code?: string;
  prompt_template_key?: string;
}

interface ManualResultFormValues {
  final_result: PdfCheckResult;
  note?: string;
}

interface PolicyCheckSubmitValues {
  project_id: number;
  test_version: string;
  source_policy_code: string;
  target_policy_code: string;
  prompt_template_key: string;
}

type PolicyCheckFinding = NonNullable<NonNullable<PdfCheckRecordDetail['ai_analysis']>['findings']>[number];

const PDF_DETAIL_STALE_TIME_MS = 10 * 60_000;
const PDF_DETAIL_CACHE_TIME_MS = 30 * 60_000;
const TEST_VERSION_DATE_FORMAT = 'YYYYMMDD';
const POLICY_CHECK_STAGES = ['获取保单PDF', '提取页面文本', '调用大模型判定', '生成预览结果'];

function coerceSelectId(value: SelectRawValue): number | undefined {
  const rawValue = typeof value === 'object' && value !== null ? value.value : value;
  if (typeof rawValue === 'number' && Number.isInteger(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue === 'string' && /^\d+$/.test(rawValue.trim())) {
    return Number(rawValue.trim());
  }
  return undefined;
}

function getCurrentTestVersion(): string {
  return dayjs().format(TEST_VERSION_DATE_FORMAT);
}

function parseTestVersionDate(value?: string | null): Dayjs | null {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec((value ?? '').trim());
  if (!match) {
    return null;
  }
  const date = dayjs(`${match[1]}-${match[2]}-${match[3]}`);
  return date.isValid() && date.format(TEST_VERSION_DATE_FORMAT) === value ? date : null;
}

function normalizeTestVersionValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value && typeof value === 'object') {
    const formatter = (value as { format?: (template: string) => string }).format;
    if (typeof formatter === 'function') {
      return formatter.call(value, TEST_VERSION_DATE_FORMAT);
    }
  }
  return '';
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

function resultTag(result: PdfCheckResult) {
  return result === 'passed' ? (
    <Tag className="pdf-check-result-tag pdf-check-result-tag--passed" icon={<CheckCircleOutlined />}>通过</Tag>
  ) : (
    <Tag className="pdf-check-result-tag pdf-check-result-tag--failed" icon={<CloseCircleOutlined />}>失败</Tag>
  );
}

function resultSourceTag(source: string) {
  return source === 'manual' ? <Tag color="warning">人工修改</Tag> : <Tag>AI判定</Tag>;
}

function operatorName(record: PdfCheckRecordSummary): string {
  return record.operator_display_name || record.operator_username || '--';
}

function promptTemplateLabel(template: PromptTemplate): string {
  const moduleLabel = getPromptTemplateModuleLabel(template.module);
  return moduleLabel === PROMPT_TEMPLATE_MODULE_POLICY_CHECK
    ? template.name
    : `${template.name}（${moduleLabel}）`;
}

function confidenceLabel(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '--';
  }
  return `${Math.round(value * 100)}%`;
}

const PolicyCheckPage: React.FC = () => {
  const [form] = Form.useForm<PolicyCheckFormValues>();
  const [manualForm] = Form.useForm<ManualResultFormValues>();
  const queryClient = useQueryClient();
  const [visibleStep, setVisibleStep] = useState(0);
  const [selectedRecordId, setSelectedRecordId] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [detailFullscreen, setDetailFullscreen] = useState(false);
  const [policyCheckStageIndex, setPolicyCheckStageIndex] = useState(0);
  const initialFormValues = useMemo(() => ({ test_version: getCurrentTestVersion() }), []);

  const watchedProjectValue = Form.useWatch('project_id', { form, preserve: true }) as SelectRawValue;
  const selectedProjectId = coerceSelectId(watchedProjectValue);
  const testVersion = normalizeTestVersionValue(Form.useWatch('test_version', { form, preserve: true }));
  const sourcePolicyCode = (Form.useWatch('source_policy_code', { form, preserve: true }) ?? '').trim();
  const targetPolicyCode = (Form.useWatch('target_policy_code', { form, preserve: true }) ?? '').trim();
  const promptTemplateKey = (Form.useWatch('prompt_template_key', { form, preserve: true }) ?? '').trim();

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (selectedProjectId === undefined && (projectsQuery.data ?? []).length > 0) {
      form.setFieldValue('project_id', projectsQuery.data?.[0]?.id);
    }
  }, [form, projectsQuery.data, selectedProjectId]);

  const promptTemplatesQuery = useQuery({
    queryKey: ['prompt-templates', PROMPT_TEMPLATE_MODULE_POLICY_CHECK],
    queryFn: () => listPromptTemplates({ module: PROMPT_TEMPLATE_MODULE_POLICY_CHECK }),
    staleTime: 30_000,
  });

  const recordsQuery = useQuery({
    queryKey: ['policy-check-records', selectedProjectId],
    queryFn: () => listPolicyCheckRecords({ project_id: selectedProjectId, limit: 100 }),
    enabled: selectedProjectId !== undefined,
  });

  const detailQuery = useQuery({
    queryKey: ['policy-check-record', selectedRecordId],
    queryFn: () => getPolicyCheckRecord(selectedRecordId as number),
    enabled: selectedRecordId !== null,
    staleTime: PDF_DETAIL_STALE_TIME_MS,
    gcTime: PDF_DETAIL_CACHE_TIME_MS,
    refetchOnWindowFocus: false,
  });

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project) => ({ value: project.id, label: project.name })),
    [projectsQuery.data],
  );

  const promptOptions = useMemo(
    () => (promptTemplatesQuery.data ?? []).map((template) => ({
      value: template.agent_key,
      label: promptTemplateLabel(template),
    })),
    [promptTemplatesQuery.data],
  );

  const updateRecordCaches = (record: PdfCheckRecordDetail) => {
    queryClient.setQueryData(['policy-check-record', record.id], record);
    void queryClient.invalidateQueries({ queryKey: ['policy-check-records'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: PolicyCheckSubmitValues) => (
      createPolicyCheckRecord({
        project_id: values.project_id,
        test_version: values.test_version,
        source_policy_code: values.source_policy_code,
        target_policy_code: values.target_policy_code,
        prompt_template_key: values.prompt_template_key,
      })
    ),
    onSuccess: (record) => {
      updateRecordCaches(record);
      setSelectedRecordId(record.id);
      message.success(record.final_result === 'passed' ? 'AI保单核对通过' : 'AI保单核对失败');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, 'AI保单核对失败')),
  });

  const manualMutation = useMutation({
    mutationFn: ({ recordId, values }: { recordId: number; values: ManualResultFormValues }) =>
      updatePdfCheckManualResult(recordId, values),
    onSuccess: (record) => {
      updateRecordCaches(record);
      setManualOpen(false);
      message.success('人工结果已保存');
    },
    onError: (error) => message.error(extractApiErrorMessage(error, '保存人工结果失败')),
  });

  const isPolicyCheckRunning = createMutation.isPending;

  useEffect(() => {
    if (!isPolicyCheckRunning) {
      setPolicyCheckStageIndex(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setPolicyCheckStageIndex((current) => (current + 1) % POLICY_CHECK_STAGES.length);
    }, 1400);

    return () => {
      window.clearInterval(timer);
    };
  }, [isPolicyCheckRunning]);

  const selectedRecord = detailQuery.data ?? null;
  const policyCodesReady = Boolean(sourcePolicyCode && targetPolicyCode && sourcePolicyCode !== targetPolicyCode);
  const unlockedStep = selectedRecord
    ? 4
    : promptTemplateKey
      ? 4
      : policyCodesReady
        ? 3
        : testVersion
          ? 2
          : selectedProjectId
            ? 1
            : 0;

  useEffect(() => {
    if (visibleStep > unlockedStep) {
      setVisibleStep(unlockedStep);
    }
  }, [unlockedStep, visibleStep]);

  const runCheck = () => {
    const values = form.getFieldsValue(true) as PolicyCheckFormValues;
    const projectId = coerceSelectId(values.project_id);
    const testVersionValue = normalizeTestVersionValue(values.test_version);
    const sourceCode = (values.source_policy_code ?? '').trim();
    const targetCode = (values.target_policy_code ?? '').trim();
    const selectedPromptKey = (values.prompt_template_key ?? '').trim();

    if (projectId === undefined) {
      message.warning('请选择项目');
      setVisibleStep(0);
      return;
    }
    if (!testVersionValue) {
      message.warning('请填写测试版本');
      setVisibleStep(1);
      return;
    }
    if (!sourceCode || !targetCode) {
      message.warning('请输入两个要对比的保单号');
      setVisibleStep(2);
      return;
    }
    if (sourceCode === targetCode) {
      message.warning('两个保单号不能相同');
      setVisibleStep(2);
      return;
    }
    if (!selectedPromptKey) {
      message.warning('请选择提示词');
      setVisibleStep(3);
      return;
    }

    createMutation.mutate({
      project_id: projectId,
      test_version: testVersionValue,
      source_policy_code: sourceCode,
      target_policy_code: targetCode,
      prompt_template_key: selectedPromptKey,
    });
  };

  const openManualModal = () => {
    if (!selectedRecord) {
      return;
    }
    manualForm.setFieldsValue({ final_result: selectedRecord.final_result, note: '' });
    setManualOpen(true);
  };

  const closeDetailModal = () => {
    setSelectedRecordId(null);
    setDetailFullscreen(false);
  };

  const recordColumns: ColumnsType<PdfCheckRecordSummary> = [
    {
      title: '测试版本',
      dataIndex: 'test_version',
      key: 'test_version',
      width: 140,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: '最终结果',
      dataIndex: 'final_result',
      key: 'final_result',
      width: 110,
      render: resultTag,
    },
    {
      title: '来源',
      dataIndex: 'result_source',
      key: 'result_source',
      width: 110,
      render: resultSourceTag,
    },
    {
      title: 'AI问题',
      dataIndex: 'diff_count',
      key: 'diff_count',
      width: 110,
      render: (value: number) => <Tag color={value > 0 ? 'error' : 'success'}>{value}</Tag>,
    },
    {
      title: '源保单号',
      dataIndex: 'source_policy_code',
      key: 'source_policy_code',
      width: 180,
      ellipsis: true,
    },
    {
      title: '目标保单号',
      dataIndex: 'target_policy_code',
      key: 'target_policy_code',
      width: 180,
      ellipsis: true,
    },
    {
      key: 'operator',
      title: '操作人',
      width: 130,
      ellipsis: true,
      render: (_, record) => operatorName(record),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '操作',
      key: 'actions',
      width: 104,
      fixed: 'right',
      render: (_, record) => (
        <Button
          size="small"
          icon={<FileSearchOutlined />}
          onClick={() => setSelectedRecordId(record.id)}
        >
          预览
        </Button>
      ),
    },
  ];

  const findingColumns: ColumnsType<PolicyCheckFinding> = [
    {
      title: '问题',
      dataIndex: 'title',
      key: 'title',
      width: 180,
      ellipsis: true,
      render: (value: string | undefined) => value || '--',
    },
    {
      title: '级别',
      dataIndex: 'severity',
      key: 'severity',
      width: 90,
      render: (value: string | undefined) => <Tag color={value === '高' ? 'error' : value === '低' ? 'default' : 'warning'}>{value || '中'}</Tag>,
    },
    {
      title: '页码',
      dataIndex: 'page_number',
      key: 'page_number',
      width: 80,
      render: (value: number | null | undefined) => value ?? '--',
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      render: (value: string | undefined) => value || '--',
    },
  ];

  const progressSteps = [
    { title: '选择项目', description: selectedProjectId ? '项目已选定' : '选择核对所属项目' },
    { title: '填写版本', description: testVersion || '选择测试日期' },
    { title: '输入保单号', description: policyCodesReady ? `${sourcePolicyCode} vs ${targetPolicyCode}` : '输入两份保单号' },
    { title: '选择提示词', description: promptTemplateKey ? '提示词已选择' : '从提示词管理选择模板' },
    {
      title: '查看结果',
      description: isPolicyCheckRunning
        ? POLICY_CHECK_STAGES[policyCheckStageIndex]
        : selectedRecord
          ? `AI问题 ${selectedRecord.diff_count}`
          : '生成AI判定',
    },
  ];

  const stepState = (index: number) => {
    if (visibleStep === index) {
      return 'active';
    }
    if (unlockedStep > index) {
      return 'complete';
    }
    return 'idle';
  };

  const policyCheckTransition = isPolicyCheckRunning ? (
    <section className="case-generation-transition policy-check-transition" aria-live="polite" role="status">
      <span className="case-generation-transition__sr-only">
        当前阶段：{POLICY_CHECK_STAGES[policyCheckStageIndex]}
      </span>
      <div className="case-generation-transition__glow" aria-hidden="true" />
      <div className="case-generation-transition__mesh" aria-hidden="true" />

      <div className="case-generation-transition__core">
        <span
          className="case-generation-transition__halo case-generation-transition__halo--outer"
          aria-hidden="true"
        />
        <span
          className="case-generation-transition__halo case-generation-transition__halo--middle"
          aria-hidden="true"
        />
        <span
          className="case-generation-transition__halo case-generation-transition__halo--inner"
          aria-hidden="true"
        />
        <span className="case-generation-transition__scanner" aria-hidden="true" />
        <span className="case-generation-transition__energy" aria-hidden="true" />
        <span
          className="case-generation-transition__spark case-generation-transition__spark--one"
          aria-hidden="true"
        />
        <span
          className="case-generation-transition__spark case-generation-transition__spark--two"
          aria-hidden="true"
        />
        <span
          className="case-generation-transition__spark case-generation-transition__spark--three"
          aria-hidden="true"
        />

        <div className="case-generation-transition__nodes" aria-hidden="true">
          {POLICY_CHECK_STAGES.map((item, index) => (
            <span
              key={item}
              className={`case-generation-transition__node${index === policyCheckStageIndex ? ' is-active' : ''}`}
              style={{ '--node-angle': `${45 + index * 90}deg` } as React.CSSProperties}
            />
          ))}
        </div>

        <div className="case-generation-transition__copy">
          <Title level={3} style={{ margin: 0 }}>保单核对中</Title>
          <Text type="secondary">{POLICY_CHECK_STAGES[policyCheckStageIndex]}</Text>
        </div>
      </div>
    </section>
  ) : null;

  return (
    <div className="glass-workbench-page case-generation-page pdf-check-page">
      <section className="glass-workbench-hero case-generation-hero pdf-check-hero">
        <div className="glass-workbench-hero__content">
          <div className="glass-workbench-hero__eyebrow">
            <Tag color="blue">AI辅助工具</Tag>
            <span>AI保单核对</span>
          </div>
          <h1 className="glass-workbench-hero__title">AI保单核对工作台</h1>
          <p className="glass-workbench-hero__description">
            输入两份保单号自动获取PDF，按所选提示词调用大模型判定核对结果，并保留源样式预览。
          </p>
        </div>
        <div className="glass-workbench-hero__actions">
          <Tag color="processing">{recordsQuery.data?.length ?? 0} 条记录</Tag>
          <Tag>{promptTemplatesQuery.data?.length ?? 0} 个可用提示词</Tag>
        </div>
      </section>

      <section className="case-generation-console pdf-check-console policy-check-console" aria-label="AI保单核对流程">
        <aside className="case-generation-progress pdf-check-progress policy-check-progress" aria-label="AI保单核对完整进度">
          <div className="case-generation-progress__header">
            <span>进度</span>
            <strong>{Math.min(visibleStep + 1, progressSteps.length)}/{progressSteps.length}</strong>
          </div>
          <div className="case-generation-progress__meter" aria-hidden="true">
            <span style={{ width: `${((visibleStep + 1) / progressSteps.length) * 100}%` }} />
          </div>
          <ol className="case-generation-progress__list policy-check-progress__list">
            {progressSteps.map((step, index) => {
              const isCurrent = visibleStep === index || (isPolicyCheckRunning && index === 4);
              const status = isPolicyCheckRunning && index === 4
                ? 'loading'
                : visibleStep === index
                  ? 'active'
                  : unlockedStep > index
                    ? 'complete'
                    : 'waiting';
              return (
                <li
                  key={step.title}
                  className="case-generation-progress__item"
                  data-status={status}
                  data-current={isCurrent}
                >
                  <button
                    type="button"
                    className="case-generation-progress__button"
                    disabled={isPolicyCheckRunning || index > unlockedStep}
                    onClick={() => setVisibleStep(index)}
                  >
                    <span className="case-generation-progress__badge">{index + 1}</span>
                    <span className="case-generation-progress__copy">
                      <strong>{step.title}</strong>
                      <span>{step.description}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <Form form={form} layout="vertical" initialValues={initialFormValues} className="case-generation-flow pdf-check-flow policy-check-flow">
          {visibleStep === 0 ? (
            <GlassStepCard
              step={1}
              title="选择项目"
              description="保单核对记录按项目隔离"
              state={stepState(0)}
              statusNode={selectedProjectId ? <Tag color="blue">已选择</Tag> : <Tag>待选择</Tag>}
            >
              <Form.Item name="project_id" label="项目" rules={[{ required: true, message: '请选择项目' }]}>
                <Select
                  showSearch
                  options={projectOptions}
                  loading={projectsQuery.isLoading}
                  placeholder="选择项目"
                  onChange={(value) => {
                    form.setFieldsValue({ project_id: coerceSelectId(value as SelectRawValue) });
                    setSelectedRecordId(null);
                  }}
                />
              </Form.Item>
              <Button type="primary" disabled={!selectedProjectId} onClick={() => setVisibleStep(1)}>
                下一步
              </Button>
            </GlassStepCard>
          ) : null}

          {visibleStep === 1 ? (
            <GlassStepCard
              step={2}
              title="填写测试版本"
              description="用于记录本次AI保单核对的版本上下文"
              state={stepState(1)}
              statusNode={testVersion ? <Tag color="blue">已填写</Tag> : <Tag>待填写</Tag>}
            >
              <Form.Item
                name="test_version"
                label="测试版本"
                rules={[{ required: true, message: '请填写测试版本' }]}
                getValueProps={(value?: string) => ({ value: parseTestVersionDate(value) })}
                normalize={(value: Dayjs | null) => (value ? value.format(TEST_VERSION_DATE_FORMAT) : '')}
              >
                <DatePicker
                  allowClear={false}
                  inputReadOnly
                  format={TEST_VERSION_DATE_FORMAT}
                  placeholder="选择测试日期"
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Space>
                <Button onClick={() => setVisibleStep(0)}>上一步</Button>
                <Button
                  type="primary"
                  onClick={() => void form.validateFields(['test_version']).then(() => setVisibleStep(2))}
                >
                  下一步
                </Button>
              </Space>
            </GlassStepCard>
          ) : null}

          {visibleStep === 2 ? (
            <GlassStepCard
              step={3}
              title="输入保单号"
              description="系统会按保单号获取两份电子投保单PDF"
              state={stepState(2)}
              statusNode={policyCodesReady ? <Tag color="blue">已填写</Tag> : <Tag>待填写</Tag>}
            >
              <Form.Item
                name="source_policy_code"
                label="源保单号"
                rules={[{ required: true, message: '请输入源保单号' }]}
              >
                <Input placeholder="请输入第一个保单号" allowClear maxLength={100} />
              </Form.Item>
              <Form.Item
                name="target_policy_code"
                label="目标保单号"
                rules={[{ required: true, message: '请输入目标保单号' }]}
              >
                <Input placeholder="请输入第二个保单号" allowClear maxLength={100} />
              </Form.Item>
              <Space>
                <Button onClick={() => setVisibleStep(1)}>上一步</Button>
                <Button
                  type="primary"
                  onClick={() => void form.validateFields(['source_policy_code', 'target_policy_code']).then(() => {
                    if (sourcePolicyCode === targetPolicyCode) {
                      message.warning('两个保单号不能相同');
                      return;
                    }
                    setVisibleStep(3);
                  })}
                >
                  下一步
                </Button>
              </Space>
            </GlassStepCard>
          ) : null}

          {visibleStep === 3 ? (
            <GlassStepCard
              step={4}
              title="选择提示词"
              description="提示词来源于配置管理的提示词管理页"
              state={stepState(3)}
              statusNode={promptTemplateKey ? <Tag color="blue">已选择</Tag> : <Tag>待选择</Tag>}
            >
              <Form.Item name="prompt_template_key" label="核对提示词" rules={[{ required: true, message: '请选择提示词' }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  options={promptOptions}
                  loading={promptTemplatesQuery.isLoading}
                  placeholder="请选择AI保单核对提示词"
                  notFoundContent={promptTemplatesQuery.isLoading ? <Spin size="small" /> : '暂无可用提示词'}
                />
              </Form.Item>
              {promptTemplatesQuery.isError ? (
                <Alert type="warning" showIcon message="提示词加载失败" description="请到配置管理 > 提示词管理检查提示词配置。" />
              ) : null}
              <Space>
                <Button onClick={() => setVisibleStep(2)}>上一步</Button>
                <Button
                  type="primary"
                  disabled={!promptTemplateKey}
                  onClick={() => void form.validateFields(['prompt_template_key']).then(() => setVisibleStep(4))}
                >
                  下一步
                </Button>
              </Space>
            </GlassStepCard>
          ) : null}

          {visibleStep === 4 ? (
            <GlassStepCard
              step={5}
              title="生成核对结果"
              description="系统下载PDF后调用大模型判定，并展示源样式预览"
              state={isPolicyCheckRunning ? 'loading' : stepState(4)}
              statusNode={isPolicyCheckRunning ? <Tag color="processing">核对中</Tag> : selectedRecord ? resultTag(selectedRecord.final_result) : <Tag>待核对</Tag>}
            >
              {policyCheckTransition}
              <Space wrap>
                <Button disabled={isPolicyCheckRunning} onClick={() => setVisibleStep(3)}>上一步</Button>
                <GlowActionButton
                  type="primary"
                  icon={<ScanOutlined />}
                  loading={isPolicyCheckRunning}
                  onClick={runCheck}
                >
                  开始核对
                </GlowActionButton>
                <Button
                  icon={<ReloadOutlined />}
                  disabled={isPolicyCheckRunning || selectedProjectId === undefined}
                  onClick={() => void recordsQuery.refetch()}
                >
                  刷新记录
                </Button>
              </Space>
            </GlassStepCard>
          ) : null}
        </Form>
      </section>

      <section className="glass-report-detail case-generation-records pdf-check-records">
        <div className="case-generation-result__header">
          <div>
            <Text type="secondary">历史留存</Text>
            <h2>保单核对记录</h2>
          </div>
          <Button
            icon={<ReloadOutlined />}
            disabled={selectedProjectId === undefined}
            onClick={() => void recordsQuery.refetch()}
          >
            刷新
          </Button>
        </div>
        {recordsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : selectedProjectId === undefined ? (
          <div style={{ padding: 48 }}>
            <Empty description="请选择项目后查看AI保单核对记录" />
          </div>
        ) : (recordsQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="当前项目暂无AI保单核对记录" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={recordColumns}
            dataSource={recordsQuery.data}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1340 }}
            className="glass-records-table pdf-check-records-table"
            rowClassName="glass-table-row"
          />
        )}
      </section>

      <Modal
        title={selectedRecord ? `AI保单核对详情 #${selectedRecord.id}` : 'AI保单核对详情'}
        open={selectedRecordId !== null}
        onCancel={closeDetailModal}
        width={detailFullscreen ? 'calc(100vw - 32px)' : 1220}
        footer={selectedRecord ? (
          <Space>
            <Button
              icon={detailFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
              onClick={() => setDetailFullscreen((value) => !value)}
            >
              {detailFullscreen ? '退出全屏' : '全屏预览'}
            </Button>
            <Button icon={<EditOutlined />} onClick={openManualModal}>
              人工改判
            </Button>
          </Space>
        ) : null}
        className={`pdf-check-detail-modal${detailFullscreen ? ' pdf-check-detail-modal--fullscreen' : ''}`}
      >
        {detailQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : selectedRecord ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }} className="pdf-check-detail-content">
            <Space wrap>
              <Text strong>AI判定</Text>
              {resultTag(selectedRecord.system_result)}
              <Text strong>最终结果</Text>
              {resultTag(selectedRecord.final_result)}
              {resultSourceTag(selectedRecord.result_source)}
              <Tag color={selectedRecord.diff_count > 0 ? 'error' : 'success'}>AI问题 {selectedRecord.diff_count}</Tag>
              {selectedRecord.ai_analysis?.provider ? <Tag color="processing">{selectedRecord.ai_analysis.provider}</Tag> : null}
              <Tag>置信度 {confidenceLabel(selectedRecord.ai_analysis?.confidence)}</Tag>
            </Space>

            {selectedRecord.ai_analysis?.summary ? (
              <Alert
                type={selectedRecord.final_result === 'passed' ? 'success' : 'error'}
                showIcon
                message="AI核对结论"
                description={selectedRecord.ai_analysis.summary}
              />
            ) : null}

            {selectedRecord.extraction_warning ? (
              <Alert
                type="warning"
                showIcon
                message="文本提取提示"
                description={selectedRecord.extraction_warning}
              />
            ) : null}

            <Descriptions bordered size="small" column={3}>
              <Descriptions.Item label="项目">{selectedRecord.project_name || selectedRecord.project_id}</Descriptions.Item>
              <Descriptions.Item label="测试版本">{selectedRecord.test_version}</Descriptions.Item>
              <Descriptions.Item label="提示词">{selectedRecord.prompt_template_key || '--'}</Descriptions.Item>
              <Descriptions.Item label="源保单号">{selectedRecord.source_policy_code || '--'}</Descriptions.Item>
              <Descriptions.Item label="目标保单号">{selectedRecord.target_policy_code || '--'}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{formatDateTime(selectedRecord.created_at)}</Descriptions.Item>
            </Descriptions>

            <Table
              rowKey={(item, index) => `${item.title || 'finding'}-${index}`}
              size="small"
              columns={findingColumns}
              dataSource={selectedRecord.ai_analysis?.findings ?? []}
              pagination={{ pageSize: 5, showSizeChanger: false }}
              locale={{ emptyText: <Empty description="AI未发现阻断问题" /> }}
            />

            <div className="pdf-check-preview-scroll">
              <div className="pdf-check-preview-grid">
                <PdfSnapshotPreview snapshot={selectedRecord.template_snapshot} title="源保单PDF" />
                <PdfSnapshotPreview snapshot={selectedRecord.candidate_snapshot} title="目标保单PDF" />
              </div>
            </div>
          </Space>
        ) : (
          <Empty description="未找到AI保单核对记录" />
        )}
      </Modal>

      <Modal
        title="人工修改核对结果"
        open={manualOpen}
        onCancel={() => setManualOpen(false)}
        okText="保存"
        confirmLoading={manualMutation.isPending}
        onOk={() => void manualForm.validateFields().then((values) => {
          if (selectedRecordId !== null) {
            manualMutation.mutate({ recordId: selectedRecordId, values });
          }
        })}
      >
        <Form form={manualForm} layout="vertical">
          <Form.Item name="final_result" label="最终结果" rules={[{ required: true, message: '请选择最终结果' }]}>
            <Select
              options={[
                { value: 'passed', label: '通过' },
                { value: 'failed', label: '失败' },
              ]}
            />
          </Form.Item>
          <Form.Item name="note" label="修改说明">
            <Input.TextArea rows={4} maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PolicyCheckPage;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowRightOutlined,
  CheckOutlined,
  CloudUploadOutlined,
  ReloadOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveAs } from 'file-saver';
import DashboardHero from '../components/Layout/DashboardHero';
import {
  GlassHintButton,
  GlassStatusCheck,
  GlassStepCard,
  GlowActionButton,
} from '../components/Workbench/GlassWorkbench';
import type {
  ApiAssertionRule,
  ApiAutomationAuthMode,
  ApiDocumentRecord,
  ApiExtractRule,
  ApiRunDetail,
  ApiRunItem,
  ApiRunSummary,
  ApiTestCaseDraft,
  ApiTestSuite,
  Project,
} from '../types';
import {
  createApiAutomationRun,
  extractApiErrorMessage,
  generateApiAutomationCases,
  getApiAutomationEnvironment,
  getApiAutomationRun,
  getApiAutomationRunReport,
  getLatestApiAutomationDocument,
  getLatestApiAutomationSuite,
  listApiAutomationRuns,
  listProjects,
  rerunApiAutomationRun,
  saveApiAutomationEnvironment,
  saveApiAutomationSuite,
  uploadApiAutomationDocument,
} from '../utils/api';

const { Dragger } = Upload;

type StepId = 1 | 2 | 3 | 4 | 5;

interface StepRailCardProps {
  step: StepId;
  title: string;
  active: boolean;
  complete: boolean;
  unlocked: boolean;
  onClick: (step: StepId) => void;
}

interface ApiAutomationFlowStep {
  step: StepId;
  title: string;
  summary: string;
  description?: string;
}

interface EditableCaseRow extends ApiTestCaseDraft {
  request_headers_text: string;
  request_params_text: string;
  request_body_text: string;
  assertions_text: string;
  extract_rules_text: string;
  keywords_text: string;
  depends_on_text: string;
  missing_fields_text: string;
}

interface EnvironmentFormValues {
  base_url: string;
  timeout_ms: number;
  auth_mode: ApiAutomationAuthMode;
  common_headers_text: string;
  auth_config_text: string;
  signature_template_text: string;
  login_binding_text: string;
}

const AUTH_MODE_OPTIONS: Array<{ value: ApiAutomationAuthMode; label: string }> = [
  { value: 'none', label: '无鉴权' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'cookie', label: 'Cookie' },
  { value: 'custom_header', label: '自定义 Header' },
  { value: 'login_extract', label: '先登录提取凭证' },
];

const AUTH_MODE_USAGE_HELP = (
  <div className="api-automation-help">
    <div>鉴权方式使用说明：</div>
    <div>无鉴权：不自动附带认证信息，适合开放接口或仅依赖签名模板。</div>
    <div>Bearer Token：自动拼接 `Authorization: Bearer token`，适合固定 token。</div>
    <div>Basic Auth：自动拼接 Basic Authorization 头，适合账号密码直连接口。</div>
    <div>Cookie：自动写入 Cookie 头，适合固定会话或网关 Cookie。</div>
    <div>自定义 Header：按 `header_name/header_value` 写入指定请求头，适合 x-token 一类场景。</div>
    <div>先登录提取凭证：先调用登录接口提取 token/cookie/header，再注入后续请求。</div>
  </div>
);

const METHOD_OPTIONS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const TEST_LEVEL_OPTIONS = ['功能', '异常', '安全', '性能'];

const DEFAULT_ENVIRONMENT_VALUES: EnvironmentFormValues = {
  base_url: '',
  timeout_ms: 30000,
  auth_mode: 'none',
  common_headers_text: '{}',
  auth_config_text: '{}',
  signature_template_text: '{}',
  login_binding_text: '{}',
};
const CASE_EDITOR_AUTO_SIZE = { minRows: 2, maxRows: 6 };
const ENVIRONMENT_EDITOR_AUTO_SIZE = { minRows: 3, maxRows: 8 };

const API_AUTOMATION_FLOW_STEPS = [
  {
    step: 1 as StepId,
    title: '选择项目',
    summary: '绑定项目并加载最近一次接口自动化上下文。',
    description: '切换项目会重置当前未保存的编辑态，并重新加载环境、文档、用例集和执行历史。',
  },
  {
    step: 2 as StepId,
    title: '配置环境',
    summary: '维护 Base URL、鉴权、登录绑定和签名模板。',
    description: '首版固定为单项目单活动环境，支持固定 token/cookie、自定义 Header、登录提取与签名模板。',
  },
  {
    step: 3 as StepId,
    title: '上传文档',
    summary: '上传接口文档并核对最新解析结果。',
    description: '支持 PDF、Word、OpenAPI 3.x JSON/YAML；PDF 仅支持可提取文本，不支持 OCR 扫描件。',
  },
  {
    step: 4 as StepId,
    title: '生成案例',
    summary: '生成、编辑并保存当前接口测试用例集。',
    description: '规则生成覆盖基础场景，AI 补全高价值场景、断言、依赖和提取规则。',
  },
  {
    step: 5 as StepId,
    title: '执行报告',
    summary: '执行当前用例集，查看最新报告与历史记录。',
    description: '执行前会自动保存当前编辑稿，当前版本按依赖顺序串行执行。',
  },
] as const satisfies readonly ApiAutomationFlowStep[];

function safeJsonStringify(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '';
  }
}

function parseJsonInput<T>(value: string, fallback: T): T {
  const text = value.trim();
  if (!text) {
    return fallback;
  }
  return JSON.parse(text) as T;
}

function normalizeCompactConfigText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function hasMeaningfulJsonConfig(value: string): boolean {
  const compact = normalizeCompactConfigText(value);
  return compact !== '' && compact !== '{}' && compact !== 'null';
}

function getAuthModeLabel(value: ApiAutomationAuthMode): string {
  return AUTH_MODE_OPTIONS.find((item) => item.value === value)?.label ?? value;
}

function getEnvironmentConfigSummary(
  panel: 'headers' | 'auth' | 'signature' | 'login',
  value: string,
  authMode: ApiAutomationAuthMode,
): string {
  if (panel === 'headers') {
    return hasMeaningfulJsonConfig(value) ? '已配置公共请求头' : '默认 {}';
  }

  if (panel === 'auth') {
    if (authMode === 'none') {
      return '当前鉴权方式无需额外配置';
    }
    return hasMeaningfulJsonConfig(value) ? `已配置 ${getAuthModeLabel(authMode)}` : `待配置 ${getAuthModeLabel(authMode)}`;
  }

  if (panel === 'signature') {
    return hasMeaningfulJsonConfig(value) ? '已启用签名模板' : '未启用';
  }

  if (authMode !== 'login_extract') {
    return '仅 login_extract 使用';
  }
  return hasMeaningfulJsonConfig(value) ? '已配置登录绑定' : '待配置登录绑定';
}

function toEditableCase(caseItem: ApiTestCaseDraft): EditableCaseRow {
  return {
    ...caseItem,
    request_headers_text: safeJsonStringify(caseItem.request_headers),
    request_params_text: safeJsonStringify(caseItem.request_params),
    request_body_text: safeJsonStringify(caseItem.request_body),
    assertions_text: safeJsonStringify(caseItem.assertions),
    extract_rules_text: safeJsonStringify(caseItem.extract_rules),
    keywords_text: (caseItem.expected_response_keywords ?? []).join(', '),
    depends_on_text: (caseItem.depends_on ?? []).join(', '),
    missing_fields_text: (caseItem.missing_fields ?? []).join(', '),
  };
}

function fromEditableCase(row: EditableCaseRow): ApiTestCaseDraft {
  return {
    case_id: row.case_id,
    endpoint_id: row.endpoint_id,
    enabled: row.enabled,
    test_scene: row.test_scene,
    title: row.title,
    precondition: row.precondition,
    request_method: row.request_method,
    request_url: row.request_url,
    request_headers: parseJsonInput<Record<string, unknown>>(row.request_headers_text, {}),
    request_params: parseJsonInput<Record<string, unknown>>(row.request_params_text, {}),
    request_body: parseJsonInput<unknown>(row.request_body_text, null),
    expected_status_code: row.expected_status_code,
    expected_response_keywords: row.keywords_text.split(',').map((item) => item.trim()).filter(Boolean),
    expected_db_check: row.expected_db_check,
    test_level: row.test_level,
    assertions: parseJsonInput<ApiAssertionRule[]>(row.assertions_text, []),
    extract_rules: parseJsonInput<ApiExtractRule[]>(row.extract_rules_text, []),
    depends_on: row.depends_on_text.split(',').map((item) => item.trim()).filter(Boolean),
    source: row.source,
    missing_fields: row.missing_fields_text.split(',').map((item) => item.trim()).filter(Boolean),
    request_options: row.request_options,
    sort_index: row.sort_index,
  };
}

function renderJsonEditor(
  value: string,
  onChange: (nextValue: string) => void,
  placeholder: string,
): React.ReactNode {
  return (
    <Input.TextArea
      value={value}
      autoSize={CASE_EDITOR_AUTO_SIZE}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="api-automation-json-editor"
    />
  );
}

function renderTextEditor(
  value: string,
  onChange: (nextValue: string) => void,
  placeholder?: string,
): React.ReactNode {
  return (
    <Input.TextArea
      value={value}
      autoSize={CASE_EDITOR_AUTO_SIZE}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="api-automation-cell-textarea"
    />
  );
}

function renderRunStatus(status: string): React.ReactNode {
  if (status === 'completed') {
    return <Tag color="success">completed</Tag>;
  }
  if (status === 'running') {
    return <Tag color="processing">running</Tag>;
  }
  return <Tag color="default">{status}</Tag>;
}

const StepRailCard: React.FC<StepRailCardProps> = ({
  step,
  title,
  active,
  complete,
  unlocked,
  onClick,
}) => (
  <button
    type="button"
    className="glass-case-quality-step"
    data-active={active ? 'true' : 'false'}
    data-complete={complete ? 'true' : 'false'}
    data-locked={unlocked ? 'false' : 'true'}
    aria-current={active ? 'step' : undefined}
    aria-label={`第${step}步 ${title}`}
    disabled={!unlocked}
    onClick={() => onClick(step)}
  >
    <span className="glass-case-quality-step__index">0{step}</span>
    <div className="glass-case-quality-step__content">
      <strong className="glass-case-quality-step__title">{title}</strong>
    </div>
    {complete ? (
      <span className="glass-case-quality-step__check" aria-hidden="true">
        <CheckOutlined />
      </span>
    ) : active ? <span className="glass-case-quality-step__dot" aria-hidden="true" /> : null}
  </button>
);

const ApiAutomationPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm<EnvironmentFormValues>();
  const [activeStep, setActiveStep] = useState<StepId>(1);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [showResolvedDocumentEndpoints, setShowResolvedDocumentEndpoints] = useState(false);
  const [useAI, setUseAI] = useState(true);
  const [suiteDraft, setSuiteDraft] = useState<ApiTestSuite | null>(null);
  const [editableCases, setEditableCases] = useState<EditableCaseRow[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const runReportRef = useRef<HTMLDivElement | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  const selectedProject = useMemo(
    () => (projectsQuery.data ?? []).find((project) => project.id === selectedProjectId) ?? null,
    [projectsQuery.data, selectedProjectId],
  );
  const watchedAuthMode = Form.useWatch('auth_mode', form) ?? DEFAULT_ENVIRONMENT_VALUES.auth_mode;
  const watchedCommonHeadersText = Form.useWatch('common_headers_text', form) ?? DEFAULT_ENVIRONMENT_VALUES.common_headers_text;
  const watchedAuthConfigText = Form.useWatch('auth_config_text', form) ?? DEFAULT_ENVIRONMENT_VALUES.auth_config_text;
  const watchedSignatureTemplateText = Form.useWatch('signature_template_text', form)
    ?? DEFAULT_ENVIRONMENT_VALUES.signature_template_text;
  const watchedLoginBindingText = Form.useWatch('login_binding_text', form) ?? DEFAULT_ENVIRONMENT_VALUES.login_binding_text;

  const environmentQuery = useQuery({
    queryKey: ['api-automation-environment', selectedProjectId],
    queryFn: () => getApiAutomationEnvironment(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const latestDocumentQuery = useQuery({
    queryKey: ['api-automation-document', selectedProjectId],
    queryFn: () => getLatestApiAutomationDocument(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const latestSuiteQuery = useQuery({
    queryKey: ['api-automation-suite', selectedProjectId],
    queryFn: () => getLatestApiAutomationSuite(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const runsQuery = useQuery({
    queryKey: ['api-automation-runs', selectedProjectId],
    queryFn: () => listApiAutomationRuns(selectedProjectId as number),
    enabled: selectedProjectId !== null,
  });

  const runDetailQuery = useQuery({
    queryKey: ['api-automation-run-detail', selectedProjectId, selectedRunId],
    queryFn: () => getApiAutomationRun(selectedProjectId as number, selectedRunId as number),
    enabled: selectedProjectId !== null && selectedRunId !== null,
  });

  useEffect(() => {
    if (!environmentQuery.data) {
      form.setFieldsValue(DEFAULT_ENVIRONMENT_VALUES);
      return;
    }

    form.setFieldsValue({
      base_url: environmentQuery.data.base_url,
      timeout_ms: environmentQuery.data.timeout_ms,
      auth_mode: environmentQuery.data.auth_mode,
      common_headers_text: safeJsonStringify(environmentQuery.data.common_headers) || '{}',
      auth_config_text: safeJsonStringify(environmentQuery.data.auth_config) || '{}',
      signature_template_text: safeJsonStringify(environmentQuery.data.signature_template) || '{}',
      login_binding_text: safeJsonStringify(environmentQuery.data.login_binding) || '{}',
    });
  }, [environmentQuery.data, form]);

  useEffect(() => {
    setSuiteDraft(latestSuiteQuery.data ?? null);
    setEditableCases((latestSuiteQuery.data?.cases ?? []).map(toEditableCase));
  }, [latestSuiteQuery.data]);

  useEffect(() => {
    if (!runsQuery.data?.length) {
      setSelectedRunId(null);
      return;
    }
    setSelectedRunId((current) => current ?? runsQuery.data?.[0]?.id ?? null);
  }, [runsQuery.data]);

  useEffect(() => {
    if (!selectedProjectId && activeStep !== 1) {
      setActiveStep(1);
      return;
    }

    if (activeStep > 3 && !latestDocumentQuery.data) {
      setActiveStep(selectedProjectId ? 3 : 1);
      return;
    }

    if (activeStep > 4 && !suiteDraft) {
      setActiveStep(latestDocumentQuery.data ? 4 : selectedProjectId ? 3 : 1);
    }
  }, [activeStep, latestDocumentQuery.data, selectedProjectId, suiteDraft]);

  useEffect(() => {
    if (activeStep !== 5 || selectedRunId === null) {
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      runReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeStep, selectedRunId]);

  const persistCurrentSuite = async (): Promise<ApiTestSuite> => {
    if (!suiteDraft || selectedProjectId === null) {
      throw new Error('当前没有可保存的接口自动化用例集');
    }

    const savedSuite = await saveApiAutomationSuite(selectedProjectId, suiteDraft.id, {
      name: suiteDraft.name,
      endpoints: suiteDraft.endpoints as unknown as Array<Record<string, unknown>>,
      cases: editableCases.map(fromEditableCase) as unknown as Array<Record<string, unknown>>,
    });

    setSuiteDraft(savedSuite);
    setEditableCases(savedSuite.cases.map(toEditableCase));
    return savedSuite;
  };

  const saveEnvironmentMutation = useMutation({
    mutationFn: async (values: EnvironmentFormValues) => saveApiAutomationEnvironment(selectedProjectId as number, {
      base_url: values.base_url,
      timeout_ms: values.timeout_ms,
      auth_mode: values.auth_mode,
      common_headers: parseJsonInput<Record<string, string>>(values.common_headers_text, {}),
      auth_config: parseJsonInput<Record<string, unknown>>(values.auth_config_text, {}),
      signature_template: parseJsonInput<Record<string, unknown>>(values.signature_template_text, {}),
      login_binding: parseJsonInput<Record<string, unknown>>(values.login_binding_text, {}),
    }),
    onSuccess: () => {
      message.success('执行环境已保存');
      setActiveStep(3);
      queryClient.invalidateQueries({ queryKey: ['api-automation-environment', selectedProjectId] });
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '保存执行环境失败'));
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: () => uploadApiAutomationDocument(selectedProjectId as number, documentFile as File, useAI),
    onSuccess: (record) => {
      message.success(`接口文档解析完成，识别到 ${record.endpoint_count} 个接口`);
      setDocumentFile(null);
      setShowResolvedDocumentEndpoints(true);
      setSuiteDraft(null);
      setEditableCases([]);
      setSelectedRunId(null);
      if (selectedProjectId !== null) {
        queryClient.setQueryData(['api-automation-document', selectedProjectId], record);
      }
      queryClient.invalidateQueries({ queryKey: ['api-automation-document', selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['api-automation-suite', selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['api-automation-runs', selectedProjectId] });
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '上传接口文档失败'));
    },
  });

  const generateCasesMutation = useMutation({
    mutationFn: () => generateApiAutomationCases(selectedProjectId as number, {
      use_ai: useAI,
      name: latestDocumentQuery.data?.file_name ? `${latestDocumentQuery.data.file_name} 用例集` : undefined,
    }),
    onSuccess: (suite) => {
      setSuiteDraft(suite);
      setEditableCases(suite.cases.map(toEditableCase));
      setActiveStep(4);
      const aiError = (
        suite.ai_analysis
        && typeof suite.ai_analysis === 'object'
        && 'error' in suite.ai_analysis
        && typeof suite.ai_analysis.error === 'string'
      )
        ? suite.ai_analysis.error
        : '';
      if (aiError) {
        message.warning(`AI 补全未完成，已回退生成 ${suite.cases.length} 条规则案例：${aiError}`);
      } else {
        message.success(`已生成 ${suite.cases.length} 条接口测试案例`);
      }
      queryClient.invalidateQueries({ queryKey: ['api-automation-suite', selectedProjectId] });
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '生成接口测试案例失败'));
    },
  });

  const saveSuiteMutation = useMutation({
    mutationFn: persistCurrentSuite,
    onSuccess: () => {
      message.success('接口自动化用例集已保存');
      setActiveStep(4);
      queryClient.invalidateQueries({ queryKey: ['api-automation-suite', selectedProjectId] });
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '保存用例集失败，请检查 JSON 格式'));
    },
  });

  const createRunMutation = useMutation({
    mutationFn: async () => {
      const savedSuite = await persistCurrentSuite();
      return createApiAutomationRun(selectedProjectId as number, { suite_id: savedSuite.id });
    },
    onSuccess: (run) => {
      setSelectedRunId(run.id);
      setActiveStep(5);
      message.success('执行完成，报告已生成');
      queryClient.invalidateQueries({ queryKey: ['api-automation-suite', selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['api-automation-runs', selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['api-automation-run-detail', selectedProjectId, run.id] });
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '执行失败'));
    },
  });

  const rerunMutation = useMutation({
    mutationFn: (runId: number) => rerunApiAutomationRun(selectedProjectId as number, runId),
    onSuccess: (run) => {
      setSelectedRunId(run.id);
      setActiveStep(5);
      message.success('已重新执行并生成新报告');
      queryClient.invalidateQueries({ queryKey: ['api-automation-runs', selectedProjectId] });
      queryClient.invalidateQueries({ queryKey: ['api-automation-run-detail', selectedProjectId, run.id] });
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '重新执行失败'));
    },
  });

  const handleProjectChange = (projectId: number | null) => {
    setActiveStep(projectId ? 2 : 1);
    setSelectedProjectId(projectId);
    setDocumentFile(null);
    setShowResolvedDocumentEndpoints(false);
    setSuiteDraft(null);
    setEditableCases([]);
    setSelectedRunId(null);
    form.resetFields();
    form.setFieldsValue(DEFAULT_ENVIRONMENT_VALUES);
  };

  const updateCase = (caseId: string, updater: (current: EditableCaseRow) => EditableCaseRow) => {
    setEditableCases((current) => current.map((item) => (item.case_id === caseId ? updater(item) : item)));
  };

  const handleViewReport = (runId: number) => {
    setSelectedRunId((current) => (current === runId ? current : runId));
    setActiveStep(5);

    window.requestAnimationFrame(() => {
      runReportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleDownloadReport = async (runId: number) => {
    try {
      const report = await getApiAutomationRunReport(selectedProjectId as number, runId);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json;charset=utf-8' });
      saveAs(blob, `api-automation-run-${runId}.json`);
    } catch (error) {
      message.error(extractApiErrorMessage(error, '下载报告失败'));
    }
  };

  const selectedProjectSummary = useMemo(() => ({
    endpointCount: latestDocumentQuery.data?.endpoint_count ?? 0,
    caseCount: latestSuiteQuery.data?.cases.length ?? 0,
    runCount: runsQuery.data?.length ?? 0,
  }), [latestDocumentQuery.data, latestSuiteQuery.data, runsQuery.data]);
  const environmentPanelItems = useMemo(() => ([
    {
      key: 'common_headers',
      label: (
        <div className="api-automation-env-panel-label">
          <span className="api-automation-env-panel-label__title">公共请求头</span>
          <span className="api-automation-env-panel-label__summary">
            {getEnvironmentConfigSummary('headers', watchedCommonHeadersText, watchedAuthMode)}
          </span>
        </div>
      ),
      children: (
        <div className="api-automation-env-panel">
          <p className="api-automation-env-panel__hint">例如：{`{"Content-Type":"application/json"}`}</p>
          <Form.Item name="common_headers_text" className="api-automation-env-panel__field">
            <Input.TextArea
              autoSize={ENVIRONMENT_EDITOR_AUTO_SIZE}
              disabled={!selectedProjectId}
              className="api-automation-json-editor"
            />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'auth_config',
      label: (
        <div className="api-automation-env-panel-label">
          <span className="api-automation-env-panel-label__title">鉴权配置</span>
          <span className="api-automation-env-panel-label__summary">
            {getEnvironmentConfigSummary('auth', watchedAuthConfigText, watchedAuthMode)}
          </span>
        </div>
      ),
      children: (
        <div className="api-automation-env-panel">
          <p className="api-automation-env-panel__hint">
            例如 Bearer：{`{"token":"xxx"}`}；Cookie：{`{"cookie":"k=v"}`}；自定义 Header：
            {` {"header_name":"X-Token","header_value":"xxx"}`}
          </p>
          <Form.Item name="auth_config_text" className="api-automation-env-panel__field">
            <Input.TextArea
              autoSize={ENVIRONMENT_EDITOR_AUTO_SIZE}
              disabled={!selectedProjectId}
              className="api-automation-json-editor"
            />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'signature_template',
      label: (
        <div className="api-automation-env-panel-label">
          <span className="api-automation-env-panel-label__title">签名模板</span>
          <span className="api-automation-env-panel-label__summary">
            {getEnvironmentConfigSummary('signature', watchedSignatureTemplateText, watchedAuthMode)}
          </span>
        </div>
      ),
      children: (
        <div className="api-automation-env-panel">
          <p className="api-automation-env-panel__hint">
            支持 saltValue、timestamp、header_fields、sign_header 等字段，兼容首版约定的参数排序 +
            时间戳 + 固定盐值签名流程。
          </p>
          <Form.Item name="signature_template_text" className="api-automation-env-panel__field">
            <Input.TextArea
              autoSize={ENVIRONMENT_EDITOR_AUTO_SIZE}
              disabled={!selectedProjectId}
              className="api-automation-json-editor"
            />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'login_binding',
      label: (
        <div className="api-automation-env-panel-label">
          <span className="api-automation-env-panel-label__title">登录绑定</span>
          <span className="api-automation-env-panel-label__summary">
            {getEnvironmentConfigSummary('login', watchedLoginBindingText, watchedAuthMode)}
          </span>
        </div>
      ),
      children: (
        <div className="api-automation-env-panel">
          <p className="api-automation-env-panel__hint">
            用于配置登录接口、请求体、提取 token/cookie/header 的规则，供 login_extract 模式复用。
          </p>
          <Form.Item name="login_binding_text" className="api-automation-env-panel__field">
            <Input.TextArea
              autoSize={ENVIRONMENT_EDITOR_AUTO_SIZE}
              disabled={!selectedProjectId}
              className="api-automation-json-editor"
            />
          </Form.Item>
        </div>
      ),
    },
  ]), [
    selectedProjectId,
    watchedAuthConfigText,
    watchedAuthMode,
    watchedCommonHeadersText,
    watchedLoginBindingText,
    watchedSignatureTemplateText,
  ]);

  const caseColumns: ColumnsType<EditableCaseRow> = [
    {
      title: '启用',
      dataIndex: 'enabled',
      width: 84,
      render: (_, record) => (
        <Switch
          checked={record.enabled}
          onChange={(checked) => updateCase(record.case_id, (current) => ({ ...current, enabled: checked }))}
        />
      ),
    },
    {
      title: '用例编号',
      dataIndex: 'case_id',
      width: 170,
      render: (value: string) => <span>{value}</span>,
    },
    {
      title: '测试场景',
      dataIndex: 'test_scene',
      width: 160,
      render: (_, record) => renderTextEditor(
        record.test_scene,
        (nextValue) => updateCase(record.case_id, (current) => ({ ...current, test_scene: nextValue })),
      ),
    },
    {
      title: '用例标题',
      dataIndex: 'title',
      width: 220,
      render: (_, record) => renderTextEditor(
        record.title,
        (nextValue) => updateCase(record.case_id, (current) => ({ ...current, title: nextValue })),
      ),
    },
    {
      title: '请求方法',
      dataIndex: 'request_method',
      width: 120,
      render: (_, record) => (
        <Select
          value={record.request_method}
          options={METHOD_OPTIONS.map((item) => ({ label: item, value: item }))}
          style={{ width: '100%' }}
          onChange={(value) => updateCase(record.case_id, (current) => ({ ...current, request_method: value }))}
        />
      ),
    },
    {
      title: '请求 URL',
      dataIndex: 'request_url',
      width: 220,
      render: (_, record) => renderTextEditor(
        record.request_url,
        (nextValue) => updateCase(record.case_id, (current) => ({ ...current, request_url: nextValue })),
        '/maApi/v1/api/sales/visit/query',
      ),
    },
    {
      title: '预期状态码',
      dataIndex: 'expected_status_code',
      width: 140,
      render: (_, record) => (
        <InputNumber
          min={100}
          max={599}
          value={record.expected_status_code}
          style={{ width: '100%' }}
          onChange={(value) => {
            updateCase(record.case_id, (current) => ({ ...current, expected_status_code: Number(value ?? 200) }));
          }}
        />
      ),
    },
  ];

  const renderCaseExpandedRow = (record: EditableCaseRow) => (
    <div className="api-automation-case-detail-grid">
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">前置条件</span>
        {renderTextEditor(
          record.precondition,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, precondition: nextValue })),
          '例如：先完成登录并拿到 token',
        )}
      </div>
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">依赖用例</span>
        {renderTextEditor(
          record.depends_on_text,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, depends_on_text: nextValue })),
          '多个用例编号使用逗号分隔',
        )}
      </div>
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">请求头(JSON)</span>
        {renderJsonEditor(
          record.request_headers_text,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, request_headers_text: nextValue })),
          '{"Authorization":"Bearer {{runtime.token}}"}',
        )}
      </div>
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">请求参数(JSON)</span>
        {renderJsonEditor(
          record.request_params_text,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, request_params_text: nextValue })),
          '{"queryType":"1"}',
        )}
      </div>
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">请求体(JSON)</span>
        {renderJsonEditor(
          record.request_body_text,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, request_body_text: nextValue })),
          '{"employeeIds":"ZJ000163"}',
        )}
      </div>
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">预期响应体关键字段</span>
        {renderTextEditor(
          record.keywords_text,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, keywords_text: nextValue })),
          '多个关键字段使用逗号分隔',
        )}
      </div>
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">预期数据库校验</span>
        {renderTextEditor(
          record.expected_db_check,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, expected_db_check: nextValue })),
          '如涉及落库，请校验关键业务字段已正确更新',
        )}
      </div>
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">测试级别</span>
        <Select
          value={record.test_level}
          options={TEST_LEVEL_OPTIONS.map((item) => ({ label: item, value: item }))}
          style={{ width: '100%' }}
          onChange={(value) => updateCase(record.case_id, (current) => ({ ...current, test_level: value }))}
        />
      </div>
      <div className="api-automation-case-detail-card">
        <span className="api-automation-case-detail-card__label">来源</span>
        <Tag color={record.source === 'ai' ? 'purple' : record.source === 'rule' ? 'blue' : 'default'}>
          {record.source}
        </Tag>
      </div>
      <div className="api-automation-case-detail-card api-automation-case-detail-card--wide">
        <span className="api-automation-case-detail-card__label">缺失字段标记</span>
        {renderTextEditor(
          record.missing_fields_text,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, missing_fields_text: nextValue })),
          '多个字段使用逗号分隔',
        )}
      </div>
      <div className="api-automation-case-detail-card api-automation-case-detail-card--wide">
        <span className="api-automation-case-detail-card__label">断言规则(JSON)</span>
        {renderJsonEditor(
          record.assertions_text,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, assertions_text: nextValue })),
          '[{"type":"status_code","operator":"equals","expected":200}]',
        )}
      </div>
      <div className="api-automation-case-detail-card api-automation-case-detail-card--wide">
        <span className="api-automation-case-detail-card__label">变量提取规则(JSON)</span>
        {renderJsonEditor(
          record.extract_rules_text,
          (nextValue) => updateCase(record.case_id, (current) => ({ ...current, extract_rules_text: nextValue })),
          '[{"source":"json","path":"data.token","target_key":"token"}]',
        )}
      </div>
    </div>
  );

  const endpointColumns: ColumnsType<ApiDocumentRecord['endpoints'][number]> = [
    {
      title: '接口名称',
      dataIndex: 'name',
      width: 220,
      render: (value: string) => <span className="api-automation-endpoint-text">{value}</span>,
    },
    {
      title: '方法',
      dataIndex: 'method',
      width: 100,
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: '路径',
      dataIndex: 'path',
      width: 260,
      render: (value: string) => <span className="api-automation-endpoint-text api-automation-endpoint-text--mono">{value}</span>,
    },
    { title: '分组', dataIndex: 'group_name', width: 140 },
  ];

  const renderEndpointExpandedRow = (record: ApiDocumentRecord['endpoints'][number]) => (
    <div className="api-automation-endpoint-detail-grid">
      <div className="api-automation-endpoint-detail-card">
        <span className="api-automation-endpoint-detail-card__label">依赖提示</span>
        {record.dependency_hints?.length ? (
          <div className="api-automation-tag-wall">
            {record.dependency_hints.map((item) => (
              <Tag key={item} className="api-automation-tag-wall__tag">
                {item}
              </Tag>
            ))}
          </div>
        ) : (
          <span className="api-automation-endpoint-detail-card__empty">无</span>
        )}
      </div>
      <div className="api-automation-endpoint-detail-card">
        <span className="api-automation-endpoint-detail-card__label">缺失字段</span>
        {record.missing_fields?.length ? (
          <div className="api-automation-tag-wall">
            {record.missing_fields.map((item) => (
              <Tag key={item} color="warning" className="api-automation-tag-wall__tag">
                {item}
              </Tag>
            ))}
          </div>
        ) : (
          <span className="api-automation-endpoint-detail-card__empty">无</span>
        )}
      </div>
    </div>
  );

  const runColumns: ColumnsType<ApiRunSummary> = [
    { title: '执行 ID', dataIndex: 'id', width: 100 },
    { title: '状态', dataIndex: 'status', width: 120, render: (value: string) => renderRunStatus(value) },
    { title: '总数', dataIndex: 'total_cases', width: 90 },
    { title: '通过', dataIndex: 'passed_cases', width: 90 },
    { title: '失败', dataIndex: 'failed_cases', width: 90 },
    { title: '阻塞', dataIndex: 'blocked_cases', width: 90 },
    { title: '耗时(ms)', dataIndex: 'duration_ms', width: 120 },
    { title: '执行时间', dataIndex: 'created_at', width: 180 },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record) => (
        <Space wrap>
          <Button
            size="small"
            onClick={() => handleViewReport(record.id)}
          >
            查看报告
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={rerunMutation.isPending}
            onClick={() => rerunMutation.mutate(record.id)}
          >
            重新执行
          </Button>
          <Button size="small" onClick={() => void handleDownloadReport(record.id)}>
            下载 JSON
          </Button>
        </Space>
      ),
    },
  ];

  const activeRun: ApiRunDetail | null = runDetailQuery.data ?? null;
  const isRunReportLoading = selectedRunId !== null
    && (runDetailQuery.isLoading || (runDetailQuery.isFetching && activeRun?.id !== selectedRunId));
  const runReportErrorMessage = runDetailQuery.isError
    ? extractApiErrorMessage(runDetailQuery.error, '加载执行报告失败')
    : '';
  const projectOptions = (projectsQuery.data ?? []).map((project: Project) => ({
    label: project.name,
    value: project.id,
  }));
  const stepUnlocked = useMemo<Record<StepId, boolean>>(
    () => ({
      1: true,
      2: Boolean(selectedProjectId),
      3: Boolean(selectedProjectId),
      4: Boolean(selectedProjectId && latestDocumentQuery.data),
      5: Boolean(selectedProjectId && suiteDraft),
    }),
    [latestDocumentQuery.data, selectedProjectId, suiteDraft],
  );
  const stepCompleted = useMemo<Record<StepId, boolean>>(
    () => ({
      1: Boolean(selectedProjectId),
      2: Boolean(environmentQuery.data),
      3: Boolean(latestDocumentQuery.data),
      4: Boolean(suiteDraft),
      5: Boolean(activeRun),
    }),
    [activeRun, environmentQuery.data, latestDocumentQuery.data, selectedProjectId, suiteDraft],
  );

  const handleStepNavigation = (step: StepId) => {
    if (!stepUnlocked[step]) {
      return;
    }

    setActiveStep(step);
  };

  const getStepCardState = (step: StepId): 'active' | 'complete' | 'disabled' | 'idle' => {
    if (!stepUnlocked[step]) {
      return 'disabled';
    }

    if (activeStep === step) {
      return 'active';
    }

    if (stepCompleted[step]) {
      return 'complete';
    }

    return 'idle';
  };

  return (
    <div className="glass-workbench-page api-automation-page">
      <DashboardHero
        title="接口自动化工作台"
        chips={[
          {
            label: selectedProject ? `当前项目：${selectedProject.name}` : '请先选择项目',
            tone: selectedProject ? 'accent' : 'neutral',
          },
          {
            label: suiteDraft ? `当前用例：${editableCases.length} 条` : '尚未生成用例',
            tone: suiteDraft ? 'gold' : 'neutral',
          },
          {
            label: activeRun ? `最近报告 #${activeRun.id}` : '暂无执行报告',
            tone: activeRun ? 'accent' : 'neutral',
          },
        ]}
        actions={(
          <div className="dashboard-switch-panel">
            <div className="dashboard-switch-panel__copy">
              <span className="dashboard-switch-panel__label">AI 案例补全</span>
              <span className="dashboard-switch-panel__value">{useAI ? '已开启' : '已关闭'}</span>
            </div>
            <Switch checked={useAI} onChange={setUseAI} />
          </div>
        )}
      />

      {activeStep !== 2 ? <Form form={form} component={false} /> : null}

      <section className="api-automation-flow" aria-label="接口自动化流程">
        {API_AUTOMATION_FLOW_STEPS.map((item, index) => {
          const nextItem = API_AUTOMATION_FLOW_STEPS[index + 1];
          return (
            <React.Fragment key={item.step}>
              <StepRailCard
                step={item.step}
                title={item.title}
                active={activeStep === item.step}
                complete={stepCompleted[item.step]}
                unlocked={stepUnlocked[item.step]}
                onClick={handleStepNavigation}
              />

              {nextItem ? (
                <div
                  className="glass-case-quality-flow__connector"
                  data-active={stepUnlocked[nextItem.step] ? 'true' : 'false'}
                  aria-hidden="true"
                >
                  <ArrowRightOutlined />
                </div>
              ) : null}
            </React.Fragment>
          );
        })}
      </section>

      <div className="api-automation-grid" aria-label="当前步骤操作区">
        {activeStep === 1 ? (
          <GlassStepCard
            step={1}
            title="选择项目"
            className="glass-step-card--project"
            state={getStepCardState(1)}
            statusNode={selectedProjectId ? <GlassStatusCheck label="项目已绑定" /> : <span className="glass-step-pill">必选</span>}
          >
            <div className="glass-step-stack">
              {projectsQuery.isLoading ? (
                <Skeleton.Input active block className="glass-skeleton-input" />
              ) : (
                <Select
                  size="large"
                  value={selectedProjectId ?? undefined}
                  placeholder="请选择项目"
                  options={projectOptions}
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  onChange={(value) => handleProjectChange(value ?? null)}
                />
              )}

              <div className="glass-inline-note">
                <span className="glass-inline-note__label">项目上下文</span>
                <div className="glass-inline-note__value">
                  {selectedProject ? (
                    <>
                      <Tag color="blue">{selectedProject.name}</Tag>
                      <span>切换项目会重置当前未保存的接口自动化编辑态，并重新加载该项目最近一次环境、文档、用例集和执行历史。</span>
                    </>
                  ) : (
                    <span>请先选择项目，然后继续配置环境与上传接口文档。</span>
                  )}
                </div>
              </div>

              {selectedProject ? (
                <Descriptions bordered size="small" column={3}>
                  <Descriptions.Item label="最近接口数">{selectedProjectSummary.endpointCount}</Descriptions.Item>
                  <Descriptions.Item label="最近用例数">{selectedProjectSummary.caseCount}</Descriptions.Item>
                  <Descriptions.Item label="历史执行数">{selectedProjectSummary.runCount}</Descriptions.Item>
                </Descriptions>
              ) : null}
            </div>
          </GlassStepCard>
        ) : null}

        {activeStep === 2 ? (
          <GlassStepCard
            step={2}
            title="配置执行环境"
            help={AUTH_MODE_USAGE_HELP}
            state={getStepCardState(2)}
            statusNode={environmentQuery.data ? <GlassStatusCheck label="环境可编辑" /> : <span className="glass-step-pill">单环境</span>}
          >
            <Form
              form={form}
              layout="vertical"
              initialValues={DEFAULT_ENVIRONMENT_VALUES}
              onFinish={(values) => saveEnvironmentMutation.mutate(values)}
            >
            <div className="api-automation-form-grid">
              <Form.Item
                name="base_url"
                label="Base URL"
                rules={[{ required: true, message: '请输入 Base URL' }]}
              >
                <Input placeholder="例如：http://lf22acmg-sit.life.cpic.com" disabled={!selectedProjectId} />
              </Form.Item>
              <Form.Item
                name="timeout_ms"
                label="超时(ms)"
                rules={[{ required: true, message: '请输入超时时间' }]}
              >
                <InputNumber min={1000} max={120000} style={{ width: '100%' }} disabled={!selectedProjectId} />
              </Form.Item>
              <Form.Item name="auth_mode" label="鉴权方式">
                <Select
                  disabled={!selectedProjectId}
                  options={AUTH_MODE_OPTIONS.map((item) => ({ label: item.label, value: item.value }))}
                />
              </Form.Item>
            </div>

            <div className="api-automation-environment-section">
              <div className="api-automation-environment-section__head">
                <div className="api-automation-environment-section__copy">
                  <strong className="api-automation-environment-section__title">高级 JSON 配置</strong>
                  <span className="api-automation-environment-section__caption">默认折叠，按需展开编辑。</span>
                </div>
                <GlassHintButton
                  ariaLabel="签名模板示例"
                  label="签名模板示例"
                  content={(
                    <div className="api-automation-help">
                      <div>与你给的签名脚本等价的示例模板：</div>
                      <pre>{`{
  "enabled": true,
  "algorithm": "md5",
  "timestamp_field": "timestamp",
  "timestamp_header": "timestamp",
  "sign_header": "sign",
  "fixed_fields": {
    "saltValue": "xJ54&8b$60"
  },
  "header_fields": {
    "sysCode": "KJGX"
  }
}`}</pre>
                    </div>
                  )}
                />
              </div>
              <Collapse
                accordion
                ghost
                destroyOnHidden
                items={environmentPanelItems}
                className="api-automation-environment-collapse"
                expandIconPlacement="end"
              />
            </div>

            <div className="api-automation-environment-note">
              <strong className="api-automation-environment-note__title">运行时变量说明</strong>
              <span className="api-automation-environment-note__text">
                支持固定 token/cookie、自定义 Header，以及先登录再提取 token/cookie/header；同一轮执行会复用这套运行时变量。
              </span>
            </div>

              <div className="api-automation-environment-actions">
                <GlowActionButton
                  htmlType="submit"
                  type="primary"
                  disabled={!selectedProjectId}
                  loading={saveEnvironmentMutation.isPending}
                >
                  保存执行环境
                </GlowActionButton>
              </div>
            </Form>
          </GlassStepCard>
        ) : null}

        {activeStep === 3 ? (
          <GlassStepCard
            step={3}
            title="上传接口文档"
            state={getStepCardState(3)}
            statusNode={latestDocumentQuery.data ? <GlassStatusCheck label="已存在最新快照" /> : <span className="glass-step-pill">PDF / Word / OpenAPI</span>}
          >
            <div className="glass-step-stack">
            <Dragger
              accept=".pdf,.doc,.docx,.json,.yaml,.yml"
              disabled={!selectedProjectId}
              multiple={false}
              showUploadList={false}
              beforeUpload={(file) => {
                setDocumentFile(file as File);
                setShowResolvedDocumentEndpoints(false);
                return false;
              }}
              className="glass-upload-dropzone glass-upload-dropzone--compact"
            >
              <div className="glass-upload-dropzone__content">
                <CloudUploadOutlined className="glass-upload-dropzone__icon" />
                <strong>拖拽或点击上传接口文档</strong>
                <span>支持 PDF、Word、OpenAPI 3.x JSON/YAML；PDF 仅支持可提取文本，不支持 OCR 扫描件。</span>
              </div>
            </Dragger>

            {documentFile ? (
              <div className="glass-upload-file glass-upload-file--spring">
                <div className="glass-upload-file__meta">
                  <span className="glass-upload-file__label">待上传文档</span>
                  <strong>{documentFile.name}</strong>
                </div>
              </div>
            ) : null}

            <Space wrap>
              <GlowActionButton
                type="primary"
                disabled={!selectedProjectId || !documentFile}
                loading={uploadDocumentMutation.isPending}
                onClick={() => uploadDocumentMutation.mutate()}
              >
                上传并解析
              </GlowActionButton>
            </Space>

            {uploadDocumentMutation.isPending ? (
              <Alert type="info" showIcon title="接口文档解析中，完成后会自动刷新当前接口清单。" />
            ) : showResolvedDocumentEndpoints && latestDocumentQuery.data ? (
              <>
                <Table
                  rowKey="endpoint_id"
                  dataSource={latestDocumentQuery.data.endpoints}
                  columns={endpointColumns}
                  className="api-automation-endpoint-table"
                  expandable={{ expandedRowRender: renderEndpointExpandedRow }}
                  pagination={false}
                  tableLayout="fixed"
                />
              </>
            ) : latestDocumentQuery.data ? (
              <Alert
                type="info"
                showIcon
                title="当前项目已存在历史解析快照，本次文档解析成功前不展示历史接口信息。"
              />
            ) : (
              <Alert type="warning" showIcon title="当前项目尚未上传接口文档。" />
            )}
            </div>
          </GlassStepCard>
        ) : null}

        {activeStep === 4 ? (
          <GlassStepCard
            step={4}
            title="生成并编辑案例"
            help="先生成规则基础案例，再由 AI 补全高价值场景。执行前会自动保存表格中的最新编辑稿。"
            state={getStepCardState(4)}
            statusNode={suiteDraft ? <GlassStatusCheck label={`已生成 ${editableCases.length} 条`} /> : <span className="glass-step-pill">可编辑表格</span>}
          >
            <div className="glass-step-stack">
            <Alert
              type="info"
              showIcon
              title="案例生成策略"
              description="规则生成会覆盖正常、缺失参数、非法值、安全、性能等基础场景；开启 AI 后会继续补全断言、依赖、提取规则和高价值业务场景。接口自动化里的 AI 最长等待 100 秒，超时或失败时仍保留规则案例可执行。"
            />

            <Space wrap>
              <GlowActionButton
                type="primary"
                disabled={!selectedProjectId || !latestDocumentQuery.data}
                loading={generateCasesMutation.isPending}
                onClick={() => generateCasesMutation.mutate()}
              >
                生成接口测试案例
              </GlowActionButton>
              <Button
                icon={<SaveOutlined />}
                disabled={!suiteDraft}
                loading={saveSuiteMutation.isPending}
                onClick={() => saveSuiteMutation.mutate()}
              >
                保存当前用例集
              </Button>
            </Space>

            {suiteDraft ? (
              <>
                <Input
                  value={suiteDraft.name}
                  placeholder="请输入用例集名称"
                  onChange={(event) => setSuiteDraft((current) => (
                    current ? { ...current, name: event.target.value } : current
                  ))}
                />
                <Descriptions bordered size="small" column={4}>
                  <Descriptions.Item label="用例集">{suiteDraft.name}</Descriptions.Item>
                  <Descriptions.Item label="接口数">{suiteDraft.endpoints.length}</Descriptions.Item>
                  <Descriptions.Item label="用例数">{editableCases.length}</Descriptions.Item>
                  <Descriptions.Item label="AI 令牌">{suiteDraft.token_usage}</Descriptions.Item>
                </Descriptions>
                <Alert
                  type="warning"
                  showIcon
                  title="编辑说明"
                  description="请求头、请求参数、请求体、断言规则、提取规则均为 JSON 字段。点击“保存当前用例集”或“执行当前用例集”时会校验 JSON 格式。数据库校验列当前仅作为备注字段，不会真实连接数据库执行。"
                />
                <Table
                  rowKey="case_id"
                  dataSource={editableCases}
                  columns={caseColumns}
                  className="api-automation-case-table"
                  expandable={{ expandedRowRender: renderCaseExpandedRow }}
                  pagination={{ pageSize: 5 }}
                  tableLayout="fixed"
                />
              </>
            ) : (
              <Alert type="warning" showIcon title="请先上传并解析接口文档，然后生成接口测试案例。" />
            )}
            </div>
          </GlassStepCard>
        ) : null}

        {activeStep === 5 ? (
          <GlassStepCard
            step={5}
            title="执行与报告"
            state={getStepCardState(5)}
            statusNode={activeRun ? <GlassStatusCheck label={`当前报告 #${activeRun.id}`} /> : <span className="glass-step-pill">顺序执行</span>}
          >
            <div className="glass-step-stack">
            <Alert
              type="info"
              showIcon
              title="执行器能力"
              description="当前版本按依赖顺序串行执行，支持 {{env.xxx}} / {{runtime.xxx}} 变量替换、鉴权注入、签名模板、状态码断言、JSON 字段断言、文本包含断言、耗时断言以及响应变量提取。"
            />

            <Space wrap>
              <GlowActionButton
                type="primary"
                disabled={!suiteDraft}
                loading={createRunMutation.isPending}
                onClick={() => createRunMutation.mutate()}
              >
                执行当前用例集
              </GlowActionButton>
              {activeRun ? (
                <>
                  <Button
                    icon={<ReloadOutlined />}
                    loading={rerunMutation.isPending}
                    onClick={() => rerunMutation.mutate(activeRun.id)}
                  >
                    重新执行
                  </Button>
                  <Button onClick={() => void handleDownloadReport(activeRun.id)}>
                    下载 JSON 报告
                  </Button>
                </>
              ) : null}
            </Space>

            {createRunMutation.isPending ? (
              <Alert type="info" showIcon title="正在执行当前用例集，执行完成后会自动刷新报告与历史列表。" />
            ) : null}

            <div
              ref={runReportRef}
              className="api-automation-run-report"
              aria-label="执行报告详情"
              aria-live="polite"
            >
            {runReportErrorMessage ? (
              <Alert
                type="error"
                showIcon
                title={selectedRunId ? `执行 #${selectedRunId} 报告加载失败` : '加载执行报告失败'}
                description={runReportErrorMessage}
              />
            ) : null}

            {isRunReportLoading ? (
              <>
                <Alert
                  type="info"
                  showIcon
                  title={`正在加载执行 #${selectedRunId} 的报告，页面已自动定位到详情区域。`}
                />
                <Skeleton active paragraph={{ rows: 6 }} />
              </>
            ) : null}

            {!runReportErrorMessage && !isRunReportLoading ? (activeRun ? (
              <>
                <Descriptions bordered size="small" column={4}>
                  <Descriptions.Item label="状态">{renderRunStatus(activeRun.status)}</Descriptions.Item>
                  <Descriptions.Item label="通过">{activeRun.report_snapshot.overview.passed_cases}</Descriptions.Item>
                  <Descriptions.Item label="失败">{activeRun.report_snapshot.overview.failed_cases}</Descriptions.Item>
                  <Descriptions.Item label="阻塞">{activeRun.report_snapshot.overview.blocked_cases}</Descriptions.Item>
                  <Descriptions.Item label="通过率">{activeRun.report_snapshot.overview.pass_rate}%</Descriptions.Item>
                  <Descriptions.Item label="总用例">{activeRun.report_snapshot.overview.total_cases}</Descriptions.Item>
                  <Descriptions.Item label="耗时">{activeRun.report_snapshot.overview.duration_ms} ms</Descriptions.Item>
                  <Descriptions.Item label="Suite ID">{activeRun.suite_id}</Descriptions.Item>
                </Descriptions>

                {(activeRun.report_snapshot.failure_reasons ?? []).length > 0 ? (
                  <Alert
                    type="warning"
                    showIcon
                    title="失败原因"
                    description={(activeRun.report_snapshot.failure_reasons ?? []).map((item) => (
                      <div key={`${String(item.case_id)}-${String(item.reason)}`}>
                        {String(item.title)}：{String(item.reason)}
                      </div>
                    ))}
                  />
                ) : null}

                <Input.TextArea
                  readOnly
                  rows={4}
                  value={safeJsonStringify(activeRun.report_snapshot.runtime_variables)}
                  placeholder="这里会展示运行时提取到的变量"
                />

                <Table<ApiRunItem>
                  rowKey="case_id"
                  dataSource={activeRun.items}
                  pagination={{ pageSize: 5 }}
                  scroll={{ x: 980 }}
                  columns={[
                    { title: '用例编号', dataIndex: 'case_id', width: 180 },
                    { title: '标题', dataIndex: 'case_title', width: 260 },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      width: 110,
                      render: (value: string) => {
                        if (value === 'passed') {
                          return <Tag color="success">passed</Tag>;
                        }
                        if (value === 'blocked') {
                          return <Tag color="warning">blocked</Tag>;
                        }
                        return <Tag color="error">failed</Tag>;
                      },
                    },
                    { title: '耗时(ms)', dataIndex: 'duration_ms', width: 120 },
                    {
                      title: '错误信息',
                      dataIndex: 'error_message',
                      width: 320,
                      render: (value: string | null) => value || '无',
                    },
                  ]}
                />
              </>
            ) : (
              <Alert type="info" showIcon title="暂无执行报告。执行当前用例集后，这里会展示最新的报告详情。" />
            )) : null}
            </div>

            <Table
              rowKey="id"
              dataSource={runsQuery.data ?? []}
              columns={runColumns}
              rowClassName={(record) => (record.id === selectedRunId ? 'api-automation-run-history-table__row--active' : '')}
              pagination={{ pageSize: 5 }}
              scroll={{ x: 1180 }}
              loading={runsQuery.isLoading}
              className="api-automation-run-history-table"
            />
            </div>
          </GlassStepCard>
        ) : null}

      </div>
    </div>
  );
};

export default ApiAutomationPage;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CloudUploadOutlined,
  FileWordOutlined,
  LinkOutlined,
  MessageOutlined,
  ProjectOutlined,
  RobotOutlined,
  SaveOutlined,
  ShareAltOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import RequirementAnalysisResultView from '../components/RequirementAnalysis/RequirementAnalysisResult';
import { GlassStepCard, GlowActionButton } from '../components/Workbench/GlassWorkbench';
import FunctionalTestCasesPage from './FunctionalTestCases';
import type {
  AiReasoningLevel,
  FunctionalCaseGenerationResult,
  FunctionalCaseSavePayload,
  FunctionalTestCase,
  Project,
  PromptTemplate,
  RequirementAnalysisResult,
} from '../types';
import {
  extractApiErrorMessage,
  generateFunctionalTestCases,
  listProjects,
  listPromptTemplates,
  mapFunctionalRequirementForCaseGeneration,
  saveFunctionalCaseGenerationResult,
} from '../utils/api';

const { Dragger } = Upload;
const { Title, Text } = Typography;

const REQUIREMENT_PROMPT_KEY = 'requirement';
const FILE_SUFFIXES = ['.doc', '.docx'];
const GENERATION_STAGES = ['分析需求要点', '抽取映射场景', '编排测试步骤', '生成预览结果'];

function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
}

interface UploadSummaryProps {
  file: File;
}

interface MappingRequestPayload {
  projectId: number;
  promptTemplateKey: string | undefined;
  requirementFile: File;
  sourcePage: string;
  requestId: number;
}

const AI_REASONING_OPTIONS: Array<{ value: AiReasoningLevel; label: string }> = [
  { value: 'low', label: '快速' },
  { value: 'medium', label: '均衡' },
  { value: 'high', label: '深度' },
];

const UploadSummary: React.FC<UploadSummaryProps> = ({ file }) => (
  <div className="case-generation-upload-summary">
    <div className="case-generation-upload-summary__icon">
      <FileWordOutlined />
    </div>
    <div className="case-generation-upload-summary__content">
      <strong>{file.name}</strong>
      <span>{formatFileSize(file.size)}</span>
    </div>
    <Tag color="processing">文档已就绪</Tag>
  </div>
);

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [selectedPromptTemplateKey, setSelectedPromptTemplateKey] = useState<string>();
  const [reasoningLevel, setReasoningLevel] = useState<AiReasoningLevel>('medium');
  const [requirementFile, setRequirementFile] = useState<File | null>(null);
  const [mappingResult, setMappingResult] = useState<RequirementAnalysisResult | null>(null);
  const [result, setResult] = useState<FunctionalCaseGenerationResult | null>(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [savedPreviewVersion, setSavedPreviewVersion] = useState<number | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isMappingPreviewOpen, setIsMappingPreviewOpen] = useState(false);
  const [caseName, setCaseName] = useState('');
  const [iterationVersion, setIterationVersion] = useState('');
  const latestMappingRequestIdRef = useRef(0);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  const promptTemplatesQuery = useQuery({
    queryKey: ['prompt-templates'],
    queryFn: listPromptTemplates,
    staleTime: 30_000,
  });

  const resetFlowResultState = () => {
    setMappingResult(null);
    setResult(null);
    setPreviewVersion(0);
    setSavedPreviewVersion(null);
    setIsMappingPreviewOpen(false);
  };

  const mapMutation = useMutation({
    mutationFn: ({ projectId, promptTemplateKey, requirementFile, sourcePage }: MappingRequestPayload) => mapFunctionalRequirementForCaseGeneration(
      projectId,
      promptTemplateKey,
      requirementFile,
      sourcePage,
    ),
    onSuccess: (response, variables) => {
      if (variables.requestId !== latestMappingRequestIdRef.current) {
        return;
      }
      if (response.success && response.data) {
        setMappingResult(response.data);
        setResult(null);
        setPreviewVersion(0);
        setSavedPreviewVersion(null);
        message.success('需求映射完成');
        return;
      }
      message.error(response.error || '需求映射失败');
    },
    onError: (error, variables) => {
      if (variables.requestId !== latestMappingRequestIdRef.current) {
        return;
      }
      message.error(extractApiErrorMessage(error, '需求映射失败'));
    },
  });

  const generateMutation = useMutation({
    mutationFn: () => generateFunctionalTestCases(
      selectedProjectId as number,
      selectedPromptTemplateKey,
      requirementFile as File,
      mappingResult,
      '案例生成',
      reasoningLevel === 'medium' ? undefined : reasoningLevel,
    ),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setResult(response.data);
        setPreviewVersion((current) => current + 1);
        setSavedPreviewVersion(null);
        message.success(`已生成 ${response.data.total} 条测试用例`);
        return;
      }
      message.error(response.error || '生成测试用例失败');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '生成测试用例失败'));
    },
  });

  const saveMutation = useMutation({
    mutationFn: (payload: FunctionalCaseSavePayload) => saveFunctionalCaseGenerationResult(payload),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setSavedPreviewVersion(previewVersion);
        setIsSaveModalOpen(false);
        message.success('案例保存成功');
        void queryClient.invalidateQueries({ queryKey: ['functional-test-case-records'] });
        void queryClient.invalidateQueries({ queryKey: ['config-requirement-documents'] });
        void queryClient.invalidateQueries({ queryKey: ['config-test-case-assets'] });
        void queryClient.invalidateQueries({ queryKey: ['requirement-analysis-records'] });
        return;
      }
      message.error(response.error || '保存案例失败');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '保存案例失败'));
    },
  });

  const selectedProject = useMemo(
    () => (projectsQuery.data ?? []).find((item) => item.id === selectedProjectId) ?? null,
    [projectsQuery.data, selectedProjectId],
  );

  const promptTemplates = promptTemplatesQuery.data ?? [];
  const selectedPromptTemplate = useMemo(
    () => promptTemplates.find((item) => item.agent_key === selectedPromptTemplateKey) ?? null,
    [promptTemplates, selectedPromptTemplateKey],
  );

  useEffect(() => {
    if (!selectedProjectId || selectedPromptTemplateKey || promptTemplates.length === 0) {
      return;
    }
    const preferredTemplate = promptTemplates.find((item) => item.agent_key === REQUIREMENT_PROMPT_KEY) ?? promptTemplates[0];
    setSelectedPromptTemplateKey(preferredTemplate?.agent_key);
  }, [promptTemplates, selectedProjectId, selectedPromptTemplateKey]);

  useEffect(() => {
    if (!selectedProjectId || !promptTemplates.length || !selectedPromptTemplateKey) {
      return;
    }
    const exists = promptTemplates.some((item) => item.agent_key === selectedPromptTemplateKey);
    if (!exists) {
      latestMappingRequestIdRef.current += 1;
      const preferredTemplate = promptTemplates.find((item) => item.agent_key === REQUIREMENT_PROMPT_KEY) ?? promptTemplates[0];
      setSelectedPromptTemplateKey(preferredTemplate?.agent_key);
      resetFlowResultState();
    }
  }, [promptTemplates, selectedProjectId, selectedPromptTemplateKey]);

  useEffect(() => {
    if (selectedProjectId === null) {
      return;
    }
    const exists = (projectsQuery.data ?? []).some((item) => item.id === selectedProjectId);
    if (!exists) {
      latestMappingRequestIdRef.current += 1;
      setSelectedProjectId(null);
      setSelectedPromptTemplateKey(undefined);
      setRequirementFile(null);
      resetFlowResultState();
    }
  }, [projectsQuery.data, selectedProjectId]);

  useEffect(() => {
    if (!generateMutation.isPending) {
      setStageIndex(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % GENERATION_STAGES.length);
    }, 1400);

    return () => {
      window.clearInterval(timer);
    };
  }, [generateMutation.isPending]);

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((item: Project) => ({
      value: item.id,
      label: item.name,
    })),
    [projectsQuery.data],
  );

  const promptOptions = useMemo(
    () => promptTemplates.map((item: PromptTemplate) => ({
      value: item.agent_key,
      label: `${item.name}（${item.agent_key}）`,
    })),
    [promptTemplates],
  );

  const isReadyToMap = Boolean(
    selectedProjectId
    && selectedPromptTemplateKey
    && requirementFile
    && !projectsQuery.isError
    && !promptTemplatesQuery.isError,
  );

  const isReadyToGenerate = Boolean(
    isReadyToMap
    && mappingResult
    && !mapMutation.isPending,
  );

  const isCurrentPreviewSaved = Boolean(
    result
    && previewVersion > 0
    && savedPreviewVersion === previewVersion,
  );

  const columns: ColumnsType<FunctionalTestCase> = [
    {
      title: '用例 ID',
      dataIndex: 'case_id',
      key: 'case_id',
      width: 140,
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: '用例描述',
      dataIndex: 'description',
      key: 'description',
      width: 240,
      render: (value: string) => <span className="case-generation-table__cell">{value}</span>,
    },
    {
      title: '测试步骤',
      dataIndex: 'steps',
      key: 'steps',
      render: (value: string) => (
        <span className="case-generation-table__cell case-generation-table__cell--multiline">{value}</span>
      ),
    },
    {
      title: '预期结果',
      dataIndex: 'expected_result',
      key: 'expected_result',
      render: (value: string) => (
        <span className="case-generation-table__cell case-generation-table__cell--multiline">{value}</span>
      ),
    },
  ];

  const handleProjectChange = (value: number | null) => {
    latestMappingRequestIdRef.current += 1;
    setSelectedProjectId(value);
    setSelectedPromptTemplateKey(undefined);
    setRequirementFile(null);
    resetFlowResultState();
  };

  const handlePromptChange = (value: string) => {
    setSelectedPromptTemplateKey(value);
    resetFlowResultState();
    if (!selectedProjectId || !requirementFile) {
      latestMappingRequestIdRef.current += 1;
      return;
    }

    const requestId = latestMappingRequestIdRef.current + 1;
    latestMappingRequestIdRef.current = requestId;
    mapMutation.mutate({
      projectId: selectedProjectId,
      promptTemplateKey: value,
      requirementFile,
      sourcePage: '案例生成',
      requestId,
    });
  };

  const handleBeforeUpload = (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) {
      message.error('当前仅支持 .doc / .docx 需求文档');
      return Upload.LIST_IGNORE;
    }

    if (!selectedProjectId || !selectedPromptTemplateKey) {
      message.warning('请先选择项目和提示词');
      return Upload.LIST_IGNORE;
    }

    const requestId = latestMappingRequestIdRef.current + 1;
    latestMappingRequestIdRef.current = requestId;
    setRequirementFile(file);
    resetFlowResultState();
    mapMutation.mutate({
      projectId: selectedProjectId,
      promptTemplateKey: selectedPromptTemplateKey,
      requirementFile: file,
      sourcePage: '案例生成',
      requestId,
    });
    return false;
  };

  const handleOpenSaveModal = () => {
    setCaseName('');
    setIterationVersion('');
    setIsSaveModalOpen(true);
  };

  const handleSave = () => {
    if (!selectedProjectId || !requirementFile || !mappingResult || !result) {
      message.error('请先完成测试用例生成');
      return;
    }
    if (!caseName.trim()) {
      message.warning('请输入测试案例名称');
      return;
    }
    if (!iterationVersion.trim()) {
      message.warning('请输入迭代版本');
      return;
    }

    saveMutation.mutate({
      project_id: selectedProjectId,
      requirement_file: requirementFile,
      prompt_template_key: selectedPromptTemplateKey ?? null,
      requirement_file_name: result.file_name || requirementFile.name,
      case_name: caseName.trim(),
      iteration_version: iterationVersion.trim(),
      mapping_result_snapshot: mappingResult,
      generation_result_snapshot: result,
      source_page: '案例生成',
    });
  };

  return (
    <div className="glass-workbench-page case-generation-page">
      <section className="glass-workbench-hero case-generation-hero">
        <div className="glass-workbench-hero__content">
          <Space wrap size={[10, 10]}>
            <Tag color="processing">功能测试</Tag>
            <Tag color="blue">案例生成</Tag>
            <Tag color="purple">需求文档驱动</Tag>
          </Space>
          <h1 className="glass-workbench-hero__title">案例生成工作台</h1>
        </div>

        <div className="glass-workbench-sidecard">
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="glass-workbench-sidecard__toggle">
              <div className="glass-workbench-sidecard__toggle-copy">
                <RobotOutlined />
                <span>AI 生成设置</span>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8 }}>
              <span className="glass-inline-note__label">推理强度</span>
              <Select
                size="middle"
                value={reasoningLevel}
                options={AI_REASONING_OPTIONS}
                className="glass-workbench-select"
                classNames={{ popup: { root: 'glass-workbench-select-dropdown' } }}
                aria-label="案例生成推理强度"
                onChange={(nextValue) => setReasoningLevel(nextValue as AiReasoningLevel)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="glass-workbench-flow case-generation-flow" aria-label="案例生成流程">
        <GlassStepCard
          step={1}
          title="选择项目"
          help="案例保存后会写入所选项目下的案例记录与配置资产。"
          state={selectedProject ? 'complete' : 'active'}
        >
          <div className="case-generation-step">
            <div className="case-generation-step__head">
              <ProjectOutlined />
              <span>项目管理 &gt; 项目列表</span>
            </div>

            {projectsQuery.isLoading ? (
              <Skeleton.Input active block className="glass-skeleton-input" />
            ) : (
              <Select
                size="large"
                value={selectedProjectId ?? undefined}
                placeholder="请选择项目"
                options={projectOptions}
                style={{ width: '100%' }}
                className="case-generation-project-select glass-workbench-select glass-workbench-select--project"
                classNames={{ popup: { root: 'glass-workbench-select-dropdown glass-workbench-select-dropdown--project' } }}
                labelRender={({ label }) => (
                  <span className="glass-project-selected-label">{label}</span>
                )}
                showSearch
                allowClear
                optionFilterProp="label"
                aria-label="案例生成项目选择"
                onChange={(value) => handleProjectChange(value ?? null)}
                onClear={() => handleProjectChange(null)}
              />
            )}

            {projectsQuery.isError ? (
              <Alert
                type="error"
                showIcon
                title="项目列表加载失败"
                description={extractApiErrorMessage(projectsQuery.error, '请稍后重试或检查后端服务')}
              />
            ) : null}

            {!projectsQuery.isLoading && !projectsQuery.isError && projectOptions.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                title="暂无项目"
                description={(
                  <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/project-management')}>
                    前往项目管理创建项目
                  </Button>
                )}
              />
            ) : null}
          </div>
        </GlassStepCard>

        <div className="glass-workbench-connector" data-active={selectedProject ? 'true' : 'false'} aria-hidden="true" />

        <GlassStepCard
          step={2}
          title="选择提示词"
          help="默认优先选择 requirement 提示词，可按需切换。"
          state={selectedPromptTemplate ? 'complete' : selectedProject ? 'active' : 'disabled'}
        >
          <div className="case-generation-step">
            <div className="case-generation-step__head">
              <MessageOutlined />
              <span>配置管理 &gt; 提示词管理</span>
            </div>

            {promptTemplatesQuery.isLoading ? (
              <Skeleton.Input active block className="glass-skeleton-input" />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                <Select
                  size="large"
                  value={selectedPromptTemplateKey}
                  placeholder="请选择提示词"
                  options={promptOptions}
                  style={{ width: '100%' }}
                  className="case-generation-prompt-select glass-workbench-select"
                  classNames={{ popup: { root: 'glass-workbench-select-dropdown' } }}
                  labelRender={({ label }) => (
                    <span className="glass-project-selected-label">{label}</span>
                  )}
                  disabled={!selectedProjectId}
                  aria-label="案例生成提示词选择"
                  onChange={(nextValue) => handlePromptChange(String(nextValue))}
                />
              </div>
            )}

            {promptTemplatesQuery.isError ? (
              <Alert
                type="error"
                showIcon
                title="提示词加载失败"
                description={(
                  <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/config-management/prompt-templates')}>
                    前往配置管理检查提示词
                  </Button>
                )}
              />
            ) : null}
          </div>
        </GlassStepCard>

        <div className="glass-workbench-connector" data-active={selectedPromptTemplate ? 'true' : 'false'} aria-hidden="true" />

        <GlassStepCard
          step={3}
          title="上传需求文档"
          help="仅支持 DOC / DOCX，上传后会自动映射需求数据，重新上传会覆盖当前文件并清空后续结果。"
          state={mapMutation.isPending ? 'loading' : requirementFile ? 'complete' : selectedPromptTemplate ? 'active' : 'disabled'}
          statusNode={mapMutation.isPending
            ? <Tag color="processing" className="case-generation-status-tag">映射中</Tag>
            : mappingResult
              ? <Tag color="cyan" className="case-generation-status-tag">映射已完成</Tag>
              : requirementFile
                ? <Tag color="blue" className="case-generation-status-tag">文档已上传</Tag>
                : null}
        >
          <div className="case-generation-step">
            <Dragger
              className="glass-upload-dropzone case-generation-dropzone"
              accept=".doc,.docx"
              maxCount={1}
              multiple={false}
              showUploadList={false}
              disabled={!selectedPromptTemplate}
              beforeUpload={handleBeforeUpload}
            >
              <div className="glass-upload-dropzone__content">
                <CloudUploadOutlined className="glass-upload-dropzone__icon" />
                <strong>点击或拖拽上传需求文档</strong>
                <span>仅支持 .doc / .docx</span>
              </div>
            </Dragger>

            {requirementFile ? <UploadSummary file={requirementFile} /> : null}

            <p className="glass-step-note">
              {!selectedProjectId
                ? '请先选择项目。'
                : !selectedPromptTemplateKey
                  ? '请先选择提示词。'
                  : !requirementFile
                    ? '上传需求文档后会自动映射需求数据，并供测试用例生成使用。'
                    : mapMutation.isPending
                      ? '正在自动映射需求数据，请稍候。'
                      : mappingResult
                        ? '需求映射数据已就绪，可在“测试用例预览”中点击“需求映射”查看。'
                        : '需求映射尚未完成，请重新上传需求文档后重试。'}
            </p>
          </div>
        </GlassStepCard>

        <div className="glass-workbench-connector" data-active={isReadyToGenerate ? 'true' : 'false'} aria-hidden="true" />

        <GlassStepCard
          step={4}
          title="生成测试用例"
          help="需求文档上传后会自动完成映射，映射就绪后即可生成预览结果。"
          state={generateMutation.isPending ? 'loading' : isReadyToGenerate ? 'active' : 'disabled'}
        >
          <div className="case-generation-step">
            <div className="case-generation-scope">
              <span>输出字段</span>
              <strong>用例 ID / 用例描述 / 测试步骤 / 预期结果</strong>
            </div>

            <GlowActionButton
              type="primary"
              size="large"
              block
              disabled={!isReadyToGenerate}
              loading={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              生成测试用例
            </GlowActionButton>

            <p className="glass-step-note">
              {!selectedProjectId
                ? '请先选择项目。'
                : !selectedPromptTemplateKey
                  ? '请先选择提示词。'
                  : !requirementFile
                    ? '请先上传需求文档。'
                    : mapMutation.isPending
                      ? '系统正在自动映射需求数据，完成后即可生成测试用例。'
                      : !mappingResult
                        ? '需求映射数据未就绪，请重新上传需求文档。'
                        : '系统会基于上传时生成的需求映射数据编排测试用例。'}
            </p>
          </div>
        </GlassStepCard>
      </section>

      {generateMutation.isPending ? (
        <section className="case-generation-transition" aria-live="polite" role="status">
          <span className="case-generation-transition__sr-only">
            当前阶段：{GENERATION_STAGES[stageIndex]}
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
              {GENERATION_STAGES.map((item, index) => (
                <span
                  key={item}
                  className={`case-generation-transition__node${index === stageIndex ? ' is-active' : ''}`}
                  style={{ '--node-angle': `${45 + index * 90}deg` } as React.CSSProperties}
                />
              ))}
            </div>

            <div className="case-generation-transition__copy">
              <Title level={3} style={{ margin: 0 }}>测试用例生成中</Title>
              <Text type="secondary">{GENERATION_STAGES[stageIndex]}</Text>
            </div>
          </div>
        </section>
      ) : null}

      <section className="glass-report-detail case-generation-result">
        <div className="case-generation-result__header">
          <div>
            <Title level={4} style={{ margin: 0 }}>测试用例预览</Title>
            <div className="case-generation-result__meta">
              {result ? (
                <>
                  <Tag color="blue">总数：{result.total}</Tag>
                  <Tag color="cyan">项目：{result.project_name || selectedProject?.name || '未关联'}</Tag>
                  <Tag color={result.generation_mode === 'ai' ? 'processing' : 'default'}>
                    生成方式：{result.generation_mode === 'ai' ? 'AI' : '规则回退'}
                  </Tag>
                  {result.provider ? <Tag>{result.provider}</Tag> : null}
                  {isCurrentPreviewSaved ? <Tag color="success">已保存</Tag> : null}
                </>
              ) : (
                <Text type="secondary">上传需求文档并完成自动映射后，这里展示测试用例预览。</Text>
              )}
            </div>
          </div>

          <Space>
            <Button
              type="primary"
              icon={<ShareAltOutlined />}
              disabled={!mappingResult}
              loading={mapMutation.isPending}
              onClick={() => setIsMappingPreviewOpen(true)}
            >
              需求映射
            </Button>
            <Button
              icon={<SaveOutlined />}
              disabled={!result?.cases?.length || isCurrentPreviewSaved}
              loading={saveMutation.isPending}
              onClick={handleOpenSaveModal}
            >
              {isCurrentPreviewSaved ? '已保存' : '保存案例'}
            </Button>
          </Space>
        </div>

        {result?.summary ? (
          <Alert
            type={result.generation_mode === 'ai' ? 'info' : 'warning'}
            showIcon
            title="生成摘要"
            description={result.summary}
            style={{ marginBottom: 18 }}
          />
        ) : null}

        {result?.error ? (
          <Alert
            type="warning"
            showIcon
            title="AI 生成异常，已自动回退"
            description={result.error}
            style={{ marginBottom: 18 }}
          />
        ) : null}

        {result?.cases?.length ? (
          <Table
            rowKey="case_id"
            columns={columns}
            dataSource={result.cases}
            pagination={{ pageSize: 6, showSizeChanger: false }}
            scroll={{ x: 980 }}
          />
        ) : (
          <div className="case-generation-result__empty">
            <Empty description="上传需求文档并完成自动映射后，这里会展示测试用例表格。" />
          </div>
        )}
      </section>

      <Modal
        title="需求映射"
        open={isMappingPreviewOpen}
        onCancel={() => setIsMappingPreviewOpen(false)}
        footer={null}
        centered
        destroyOnHidden
        width="min(1100px, calc(100vw - 32px))"
        styles={{
          body: {
            maxHeight: 'calc(100vh - 220px)',
            overflowY: 'auto',
            padding: '12px 20px 24px',
          },
        }}
      >
        {mappingResult ? (
          <RequirementAnalysisResultView result={mappingResult} hideAi />
        ) : (
          <Empty description="当前暂无可展示的需求映射数据" />
        )}
      </Modal>

      <section className="case-generation-records">
        <FunctionalTestCasesPage embedded />
      </section>

      <Modal
        title="保存案例"
        open={isSaveModalOpen}
        onCancel={() => setIsSaveModalOpen(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsSaveModalOpen(false)}>取消</Button>,
          <Button
            key="save"
            type="primary"
            loading={saveMutation.isPending}
            onClick={handleSave}
          >
            确认保存
          </Button>,
        ]}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text type="secondary">项目</Text>
            <Input value={selectedProject?.name || ''} readOnly />
          </div>
          <div>
            <Text type="secondary">需求文档名称</Text>
            <Input value={result?.file_name || requirementFile?.name || ''} readOnly />
          </div>
          <div>
            <Text type="secondary">测试案例名称</Text>
            <Input
              value={caseName}
              placeholder="请输入测试案例名称"
              onChange={(event) => setCaseName(event.target.value)}
            />
          </div>
          <div>
            <Text type="secondary">迭代版本</Text>
            <Input
              value={iterationVersion}
              placeholder="请输入迭代版本，例如 2026Q2-S1"
              onChange={(event) => setIterationVersion(event.target.value)}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default UploadPage;

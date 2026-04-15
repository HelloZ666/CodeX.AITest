import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Row,
  Select,
  Skeleton,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  ArrowRightOutlined,
  CheckOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  FileTextOutlined,
  LinkOutlined,
  RobotOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type {
  AnalyzeData,
  CaseQualityRecordDetail,
  Project,
  RequirementAnalysisResult,
} from '../types';
import RequirementAnalysisResultView from '../components/RequirementAnalysis/RequirementAnalysisResult';
import AnalysisResult from '../components/AnalysisResult/AnalysisResult';
import ScoreCard from '../components/ScoreCard/ScoreCard';
import CaseQualityAiAdvice from '../components/CaseQuality/CaseQualityAiAdvice';
import CaseQualityOverview from '../components/CaseQuality/CaseQualityOverview';
import TestSuggestions from '../components/TestSuggestions/TestSuggestions';
import { GlassHintButton, GlassStatusCheck, GlowActionButton } from '../components/Workbench/GlassWorkbench';
import {
  analyzeRequirement,
  analyzeWithProject,
  createCaseQualityRecord,
  extractApiErrorMessage,
  listProjects,
} from '../utils/api';
import { normalizeCodeMappingEntries } from '../utils/codeMapping';
import { resolveAiTestAdvice } from '../utils/caseQualityReport';
import { buildCodeTestSuggestions, buildRequirementTestSuggestions } from '../utils/testSuggestions';

const { Title } = Typography;
const { Dragger } = Upload;
const { Option } = Select;

type StepId = 1 | 2 | 3 | 4;
type UploadBeforeResult = boolean | typeof Upload.LIST_IGNORE;

interface UploadSlotCardProps {
  title: string;
  hint: string;
  accept: string;
  icon: React.ReactNode;
  file: File | null;
  disabled?: boolean;
  emptyHint: string;
  fileTypeLabel: string;
  compact?: boolean;
  onSelectFile: (file: File) => UploadBeforeResult;
  onRemoveFile: () => void;
}

interface UploadFileCardProps {
  title: string;
  file: File;
  fileTypeLabel: string;
  disabled?: boolean;
  accept: string;
  onSelectFile: (file: File) => UploadBeforeResult;
  onRemoveFile: () => void;
}

interface StepRailCardProps {
  step: StepId;
  title: string;
  active: boolean;
  complete: boolean;
  unlocked: boolean;
  onClick: (step: StepId) => void;
}

interface CaseFlowStep {
  step: StepId;
  title: string;
  summary: string;
  description?: string;
}

const CASE_UPLOAD_SLOTS = [
  {
    key: 'code-changes' as const,
    title: '代码改动 JSON',
    accept: '.json',
    hint: '建议包含 current / history 字段，用于还原本次提交范围。',
    icon: <CodeOutlined />,
  },
  {
    key: 'test-cases' as const,
    title: '测试用例 CSV / Excel',
    accept: '.csv,.xlsx,.xls',
    hint: '支持真实 Excel 模板（首行说明、第二行表头）和旧简化模板。',
    icon: <TableOutlined />,
  },
];

const CASE_FLOW_STEPS = [
  {
    step: 1 as StepId,
    title: '项目选择',
    summary: '选择目标项目并确认代码映射状态。',
    description: '切换项目会重置已上传文件、分析结果和综合报告状态。',
  },
  {
    step: 2 as StepId,
    title: '需求分析',
    summary: '上传需求文档并生成需求概览。',
  },
  {
    step: 3 as StepId,
    title: '案例分析',
    summary: '上传代码改动与测试用例并执行案例分析。',
  },
  {
    step: 4 as StepId,
    title: '汇总报告',
    summary: '查看综合报告摘要与完整分析结果。',
    description: '汇总报告会展示需求分析部分与案例分析部分。',
  },
] as const satisfies readonly CaseFlowStep[];

const MONTHLY_STATS = [
  { label: '质检项目数', value: '18', trend: '+3', caption: '本月已触发案例质检的项目' },
  { label: '已分析用例', value: '426', trend: '+12%', caption: '当前占位展示累计分析用例数' },
  { label: '平均案例得分', value: '88.6', trend: '+2.4', caption: '当前占位展示综合案例均分' },
  { label: '报告生成数', value: '31', trend: '+5', caption: '本月已输出综合报告数量' },
] as const;

function formatDuration(durationMs: number | undefined): string {
  if (!durationMs) {
    return '--';
  }

  return `${durationMs} ms`;
}

function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
}

const UploadFileCard: React.FC<UploadFileCardProps> = ({
  title,
  file,
  fileTypeLabel,
  disabled = false,
  accept,
  onSelectFile,
  onRemoveFile,
}) => (
  <div key={`${file.name}-${file.size}-${file.lastModified}`} className="glass-upload-file-card glass-upload-file-card--spring">
    <div className="glass-upload-file-card__top">
      <span className="glass-upload-file-card__type">{fileTypeLabel}</span>
      <span className="glass-upload-file__done">
        <span className="glass-upload-file__done-icon">
          <CheckOutlined />
        </span>
        上传完成
      </span>
    </div>

    <div className="glass-upload-file-card__meta">
      <span className="glass-upload-file__label">{title}</span>
      <strong>{file.name}</strong>
      <span>{formatFileSize(file.size)}</span>
    </div>

    <div className="glass-upload-file-card__actions">
      <Upload
        accept={accept}
        maxCount={1}
        multiple={false}
        showUploadList={false}
        disabled={disabled}
        beforeUpload={(nextFile) => onSelectFile(nextFile as File)}
      >
        <Button size="small">重新上传</Button>
      </Upload>

      <Button size="small" onClick={onRemoveFile}>
        移除
      </Button>
    </div>

    <div className="glass-upload-file__progress">
      <span className="glass-upload-file__progress-bar" />
    </div>
  </div>
);

const UploadSlotCard: React.FC<UploadSlotCardProps> = ({
  title,
  hint,
  accept,
  icon,
  file,
  disabled = false,
  emptyHint,
  fileTypeLabel,
  compact = false,
  onSelectFile,
  onRemoveFile,
}) => (
  <div className={`glass-upload-panel glass-upload-panel--slot${file ? ' is-filled' : ''}`}>
    <div className="glass-upload-panel__head">
      <div className="glass-upload-panel__icon">{icon}</div>
      <div className="glass-upload-panel__copy">
        <div className="glass-upload-panel__titleline">
          <strong>{title}</strong>
          <GlassHintButton content={hint} ariaLabel={`${title}说明`} />
        </div>
      </div>
    </div>

    <div className="glass-upload-panel__body">
      {file ? (
        <UploadFileCard
          title={title}
          file={file}
          fileTypeLabel={fileTypeLabel}
          disabled={disabled}
          accept={accept}
          onSelectFile={onSelectFile}
          onRemoveFile={onRemoveFile}
        />
      ) : (
        <Dragger
          className={`glass-upload-dropzone glass-upload-dropzone--slot${compact ? ' glass-upload-dropzone--compact' : ''}`}
          accept={accept}
          maxCount={1}
          multiple={false}
          showUploadList={false}
          disabled={disabled}
          beforeUpload={(nextFile) => onSelectFile(nextFile as File)}
        >
          <div className="glass-upload-dropzone__content">
            <CloudUploadOutlined className="glass-upload-dropzone__icon" />
            <strong>点击或拖拽上传</strong>
            <span>{emptyHint}</span>
          </div>
        </Dragger>
      )}
    </div>
  </div>
);

const StepRailCard: React.FC<StepRailCardProps> = ({
  step,
  title,
  active,
  complete,
  unlocked,
  onClick,
}) => {
  return (
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
};

const MonthlyStatsPanel: React.FC = () => (
  <aside className="glass-case-quality-stats-card" aria-label="本月统计">
    <div className="glass-case-quality-stats-card__header">
      <span className="glass-case-quality-stats-card__eyebrow">统计占位</span>
      <h3 className="glass-case-quality-stats-card__title">本月统计</h3>
    </div>

    <div className="glass-case-quality-stats-card__grid">
      {MONTHLY_STATS.map((item) => (
        <article key={item.label} className="glass-case-quality-stats-card__metric">
          <div className="glass-case-quality-stats-card__metric-top">
            <span>{item.label}</span>
            <strong>{item.trend}</strong>
          </div>
          <b>{item.value}</b>
          <p>{item.caption}</p>
        </article>
      ))}
    </div>

    <p className="glass-case-quality-stats-card__note">统计口径待确认，当前为占位数据</p>
  </aside>
);

const CaseQualityPage: React.FC = () => {
  const navigate = useNavigate();
  const reportDetailRef = useRef<HTMLDivElement | null>(null);

  const [activeStep, setActiveStep] = useState<StepId>(1);
  const [useAI, setUseAI] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [requirementFile, setRequirementFile] = useState<File | null>(null);
  const [codeChangesFile, setCodeChangesFile] = useState<File | null>(null);
  const [testCasesFile, setTestCasesFile] = useState<File | null>(null);
  const [requirementResult, setRequirementResult] = useState<RequirementAnalysisResult | null>(null);
  const [caseResult, setCaseResult] = useState<AnalyzeData | null>(null);
  const [requirementRecordId, setRequirementRecordId] = useState<number | null>(null);
  const [analysisRecordId, setAnalysisRecordId] = useState<number | null>(null);
  const [savedRecord, setSavedRecord] = useState<CaseQualityRecordDetail | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  const selectedProject = useMemo(
    () => (projectsQuery.data ?? []).find((project) => project.id === selectedProjectId) ?? null,
    [projectsQuery.data, selectedProjectId],
  );

  const mappingEntries = normalizeCodeMappingEntries(selectedProject?.mapping_data);
  const hasMapping = mappingEntries.length > 0;

  const stepUnlocked = useMemo<Record<StepId, boolean>>(
    () => ({
      1: true,
      2: Boolean(selectedProjectId),
      3: Boolean(requirementResult),
      4: Boolean(savedRecord),
    }),
    [requirementResult, savedRecord, selectedProjectId],
  );

  const stepCompleted = useMemo<Record<StepId, boolean>>(
    () => ({
      1: Boolean(selectedProjectId),
      2: Boolean(requirementResult),
      3: Boolean(caseResult),
      4: Boolean(savedRecord),
    }),
    [caseResult, requirementResult, savedRecord, selectedProjectId],
  );

  useEffect(() => {
    if (!selectedProjectId && activeStep !== 1) {
      setActiveStep(1);
      return;
    }

    if (activeStep > 2 && !requirementResult) {
      setActiveStep(selectedProjectId ? 2 : 1);
      return;
    }

    if (activeStep > 3 && !savedRecord) {
      setActiveStep(requirementResult ? 3 : selectedProjectId ? 2 : 1);
    }
  }, [activeStep, requirementResult, savedRecord, selectedProjectId]);

  const clearAnalysisState = () => {
    setRequirementFile(null);
    setCodeChangesFile(null);
    setTestCasesFile(null);
    setRequirementResult(null);
    setCaseResult(null);
    setRequirementRecordId(null);
    setAnalysisRecordId(null);
    setSavedRecord(null);
    setSaveErrorMessage(null);
  };

  const clearRequirementDerivedState = () => {
    setRequirementResult(null);
    setCaseResult(null);
    setRequirementRecordId(null);
    setAnalysisRecordId(null);
    setSavedRecord(null);
    setSaveErrorMessage(null);
  };

  const clearCaseDerivedState = () => {
    setCaseResult(null);
    setAnalysisRecordId(null);
    setSavedRecord(null);
    setSaveErrorMessage(null);
  };

  const scrollToNode = (node: HTMLElement | HTMLDivElement | null) => {
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleStepNavigation = (step: StepId) => {
    if (!stepUnlocked[step]) {
      return;
    }

    setActiveStep(step);
  };

  const handleProjectChange = (projectId: number | null) => {
    const nextProject = (projectsQuery.data ?? []).find((project) => project.id === projectId) ?? null;
    const nextProjectHasMapping = normalizeCodeMappingEntries(nextProject?.mapping_data).length > 0;

    clearAnalysisState();
    setSelectedProjectId(projectId);
    setActiveStep(projectId && nextProjectHasMapping ? 2 : 1);
  };

  const handleUseAiChange = (enabled: boolean) => {
    setUseAI(enabled);
    clearRequirementDerivedState();
    setActiveStep(selectedProjectId ? (requirementFile ? 2 : 1) : 1);
  };

  const handleRequirementFileChange = (file: File) => {
    setRequirementFile(file);
    clearRequirementDerivedState();
    setActiveStep(2);
  };

  const handleRequirementBeforeUpload = (file: File): UploadBeforeResult => {
    const lowerFileName = file.name.toLowerCase();
    if (!lowerFileName.endsWith('.doc') && !lowerFileName.endsWith('.docx')) {
      message.error('仅支持上传 .doc / .docx 格式需求文档');
      return Upload.LIST_IGNORE;
    }

    handleRequirementFileChange(file);
    return false;
  };

  const handleRequirementFileRemove = () => {
    setRequirementFile(null);
    clearRequirementDerivedState();
    setActiveStep(2);
  };

  const handleCaseInputChange = (type: 'code-changes' | 'test-cases', file: File) => {
    if (type === 'code-changes') {
      setCodeChangesFile(file);
    } else {
      setTestCasesFile(file);
    }

    clearCaseDerivedState();
    setActiveStep(3);
  };

  const handleCaseBeforeUpload = (type: 'code-changes' | 'test-cases', file: File): UploadBeforeResult => {
    handleCaseInputChange(type, file);
    return false;
  };

  const handleCaseInputRemove = (type: 'code-changes' | 'test-cases') => {
    if (type === 'code-changes') {
      setCodeChangesFile(null);
    } else {
      setTestCasesFile(null);
    }

    clearCaseDerivedState();
    setActiveStep(3);
  };

  const requirementMutation = useMutation({
    mutationFn: () => analyzeRequirement(
      selectedProjectId as number,
      requirementFile as File,
      useAI,
      undefined,
      '案例质检',
    ),
    onSuccess: (response) => {
      if (!response.success || !response.data) {
        message.error(response.error || '需求分析失败');
        return;
      }

      setRequirementResult(response.data);
      setRequirementRecordId(response.data.record_id ?? null);
      setCaseResult(null);
      setAnalysisRecordId(null);
      setSavedRecord(null);
      setSaveErrorMessage(null);
      setActiveStep(3);
      message.success('需求分析完成');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '需求分析失败'));
    },
  });

  const saveRecordMutation = useMutation({
    mutationFn: (payload: {
      project_id: number;
      requirement_analysis_record_id: number;
      analysis_record_id: number;
      code_changes_file_name: string;
      test_cases_file_name: string;
      use_ai: boolean;
    }) => createCaseQualityRecord(payload),
    onSuccess: (record) => {
      setSavedRecord(record);
      setSaveErrorMessage(null);
      setActiveStep(4);
      message.success('综合记录保存成功');
      window.setTimeout(() => {
        scrollToNode(reportDetailRef.current);
      }, 0);
    },
    onError: (error) => {
      const messageText = extractApiErrorMessage(error, '记录保存失败，可重试');
      setSaveErrorMessage(messageText);
      message.error('记录保存失败，可重试');
    },
  });

  const caseMutation = useMutation({
    mutationFn: () => analyzeWithProject(
      selectedProjectId as number,
      codeChangesFile as File,
      testCasesFile as File,
      undefined,
      useAI,
      undefined,
      '案例质检',
    ),
    onSuccess: async (response) => {
      if (!response.success || !response.data) {
        message.error(response.error || '案例分析失败');
        return;
      }

      setCaseResult(response.data);
      const latestAnalysisRecordId = response.data.record_id ?? null;
      setAnalysisRecordId(latestAnalysisRecordId);
      setSaveErrorMessage(null);

      if (!latestAnalysisRecordId || !requirementRecordId) {
        setSaveErrorMessage('分析记录缺失，无法保存综合记录，可重试');
        message.error('记录保存失败，可重试');
        return;
      }

      if (!selectedProjectId || !codeChangesFile || !testCasesFile) {
        setSaveErrorMessage('分析结果已生成，但缺少文件信息，无法保存综合记录');
        message.error('记录保存失败，可重试');
        return;
      }

      try {
        await saveRecordMutation.mutateAsync({
          project_id: selectedProjectId,
          requirement_analysis_record_id: requirementRecordId,
          analysis_record_id: latestAnalysisRecordId,
          code_changes_file_name: codeChangesFile.name,
          test_cases_file_name: testCasesFile.name,
          use_ai: useAI,
        });
      } catch {
        // save mutation has dedicated error handling
      }
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '案例分析失败'));
    },
  });

  const handleRetrySave = () => {
    if (!selectedProjectId || !requirementRecordId || !analysisRecordId || !codeChangesFile || !testCasesFile) {
      return;
    }

    saveRecordMutation.mutate({
      project_id: selectedProjectId,
      requirement_analysis_record_id: requirementRecordId,
      analysis_record_id: analysisRecordId,
      code_changes_file_name: codeChangesFile.name,
      test_cases_file_name: testCasesFile.name,
      use_ai: useAI,
    });
  };

  const canRunRequirement = Boolean(selectedProjectId && requirementFile);
  const filesReadyCount = Number(Boolean(codeChangesFile)) + Number(Boolean(testCasesFile));
  const canRunCase = Boolean(selectedProjectId && requirementResult && codeChangesFile && testCasesFile && hasMapping);
  const combinedDuration = savedRecord?.total_duration_ms
    ?? ((requirementResult?.overview.duration_ms ?? 0) + (caseResult?.duration_ms ?? 0) || undefined);

  const totalChangedMethods = caseResult
    ? caseResult.coverage.total_changed_methods
    : null;
  const caseCount = caseResult?.test_case_count ?? null;
  const coveredCount = caseResult?.coverage.covered.length ?? null;
  const uncoveredCount = caseResult?.coverage.uncovered.length ?? null;
  const mappingHitCount = requirementResult?.overview.mapping_hit_count ?? null;
  const coverageRate = caseResult?.coverage.coverage_rate ?? null;
  const requirementSuggestions = buildRequirementTestSuggestions(requirementResult);
  const codeSuggestions = buildCodeTestSuggestions(caseResult?.coverage, mappingEntries);
  const combinedAiTestAdvice = resolveAiTestAdvice(savedRecord?.combined_result_snapshot ?? null);
  const aiSwitchDisabled = requirementMutation.isPending || caseMutation.isPending || saveRecordMutation.isPending;
  const summaryText = [
    combinedAiTestAdvice?.summary,
    requirementResult?.score?.summary,
    caseResult?.score.summary,
  ].filter(Boolean).join('；') || '综合报告已生成，可继续查看完整内容。';

  const activeStepMeta: CaseFlowStep = CASE_FLOW_STEPS.find((item) => item.step === activeStep) ?? CASE_FLOW_STEPS[0];
  const showStatsPanel = activeStep !== 4;

  const renderActiveStepStatus = () => {
    switch (activeStep) {
      case 1:
        return selectedProjectId ? <GlassStatusCheck label="已选择" /> : <span className="glass-step-pill">必选</span>;
      case 2:
        if (requirementMutation.isPending) {
          return <span className="glass-step-pill">分析中</span>;
        }

        return requirementResult
          ? <GlassStatusCheck label="分析已完成" />
          : <span className="glass-step-pill">{requirementFile ? '文档已上传' : 'DOC / DOCX'}</span>;
      case 3:
        if (caseMutation.isPending || saveRecordMutation.isPending) {
          return <span className="glass-step-pill">分析中</span>;
        }

        return caseResult
          ? <GlassStatusCheck label="分析已完成" />
          : <span className="glass-step-pill">{filesReadyCount === 2 ? '文件已就绪' : `${filesReadyCount} / 2 文件已就绪`}</span>;
      case 4:
      default:
        if (savedRecord) {
          return <GlassStatusCheck label="已生成" />;
        }

        if (caseMutation.isPending || saveRecordMutation.isPending) {
          return <span className="glass-step-pill">生成中</span>;
        }

        return <span className="glass-step-pill glass-step-pill--muted">等待结果</span>;
    }
  };

  const renderProjectStep = () => (
    <div className="glass-step-stack">
      {projectsQuery.isLoading ? (
        <Skeleton.Input active block className="glass-skeleton-input" />
      ) : (
        <Select
          size="large"
          value={selectedProjectId ?? undefined}
          placeholder="请选择要进行案例质检的项目"
          className="glass-workbench-select glass-workbench-select--project"
          classNames={{ popup: { root: 'glass-workbench-select-dropdown glass-workbench-select-dropdown--project' } }}
          labelRender={({ label }) => (
            <span className="glass-project-selected-label">{label}</span>
          )}
          optionLabelProp="data-label"
          showSearch
          allowClear
          optionFilterProp="data-label"
          onChange={(value) => handleProjectChange(value ?? null)}
          onClear={() => handleProjectChange(null)}
        >
          {(projectsQuery.data ?? []).map((project: Project) => (
            <Option key={project.id} value={project.id} data-label={project.name}>
              <div className="glass-select-option">
                <span className={`glass-select-option__check${selectedProjectId === project.id ? ' is-active' : ''}`}>
                  <CheckOutlined />
                </span>
                <span className="glass-select-option__label">{project.name}</span>
              </div>
            </Option>
          ))}
        </Select>
      )}

      <div className="glass-inline-note">
        <span className="glass-inline-note__label">当前映射状态</span>
        <div className="glass-inline-note__value">
          {selectedProject ? (
            hasMapping ? (
              <>
                <Tag color="blue">已配置代码映射</Tag>
                <span>共 {mappingEntries.length} 条映射，可继续执行完整案例质检流程。</span>
              </>
            ) : (
              <>
                <Tag color="warning">未配置代码映射</Tag>
                <span>需求分析仍可执行，但案例分析会保持禁用。</span>
              </>
            )
          ) : (
            <span>选择项目后，这里会显示当前映射状态。</span>
          )}
        </div>
      </div>

      {selectedProject && !hasMapping ? (
        <Alert
          type="warning"
          showIcon
          title="当前项目尚未绑定代码映射"
          description={(
            <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/projects')}>
              前往配置管理维护代码映射关系
            </Button>
          )}
        />
      ) : null}
    </div>
  );

  const renderRequirementStep = () => (
    <div className="glass-step-stack">
      <UploadSlotCard
        title="上传需求文档（.doc / .docx）"
        hint="上传后在当前步骤直接发起需求分析。"
        accept=".doc,.docx"
        icon={<FileTextOutlined />}
        file={requirementFile}
        disabled={!selectedProjectId}
        emptyHint="支持标准 Word 需求文档，建议优先使用 .docx"
        fileTypeLabel="DOC / DOCX"
        onSelectFile={handleRequirementBeforeUpload}
        onRemoveFile={handleRequirementFileRemove}
      />

      <GlowActionButton
        type="primary"
        size="large"
        block
        disabled={!canRunRequirement}
        loading={requirementMutation.isPending}
        onClick={() => requirementMutation.mutate()}
      >
        开始需求分析
      </GlowActionButton>
    </div>
  );

  const renderCaseStep = () => (
    <div className="glass-step-stack">
      <div className="glass-upload-grid">
        {CASE_UPLOAD_SLOTS.map((slot) => {
          const file = slot.key === 'code-changes' ? codeChangesFile : testCasesFile;

          return (
            <UploadSlotCard
              key={slot.key}
              title={slot.title}
              hint={slot.hint}
              accept={slot.accept}
              icon={slot.icon}
              file={file}
              disabled={!selectedProjectId || !requirementResult}
              emptyHint={slot.accept.replaceAll(',', ' / ')}
              fileTypeLabel={slot.accept.replaceAll(',', ' / ').replaceAll('.', '').toUpperCase()}
              compact
              onSelectFile={(nextFile) => handleCaseBeforeUpload(slot.key, nextFile)}
              onRemoveFile={() => handleCaseInputRemove(slot.key)}
            />
          );
        })}
      </div>

      {!hasMapping && requirementResult ? (
        <Alert
          type="warning"
          showIcon
          title="当前项目未配置代码映射，无法执行案例分析"
          description={(
            <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/projects')}>
              前往配置管理维护代码映射关系
            </Button>
          )}
        />
      ) : null}

      {saveErrorMessage ? (
        <Alert
          type="error"
          showIcon
          title="综合记录保存失败，可重试"
          description={saveErrorMessage}
          action={(
            <Button
              size="small"
              type="primary"
              ghost
              loading={saveRecordMutation.isPending}
              onClick={handleRetrySave}
              disabled={!selectedProjectId || !requirementRecordId || !analysisRecordId || !codeChangesFile || !testCasesFile}
            >
              重试保存
            </Button>
          )}
        />
      ) : null}

      <GlowActionButton
        type="primary"
        size="large"
        block
        disabled={!canRunCase}
        loading={caseMutation.isPending || saveRecordMutation.isPending}
        onClick={() => caseMutation.mutate()}
      >
        开始案例分析
      </GlowActionButton>
    </div>
  );

  const renderReportStep = () => (
    caseMutation.isPending || saveRecordMutation.isPending ? (
      <div className="glass-report-state glass-report-state--loading">
        <Skeleton active paragraph={{ rows: 4 }} title={{ width: '58%' }} />
      </div>
    ) : savedRecord ? (
      <div className="glass-report-preview glass-report-preview--enter">
        <div className="glass-report-preview__headline">
          <div>
            <strong>{`综合记录 ID：${savedRecord.id}`}</strong>
            <span>{`总耗时 ${formatDuration(combinedDuration)}`}</span>
          </div>
          <Button type="link" onClick={() => scrollToNode(reportDetailRef.current)}>
            查看详情
          </Button>
        </div>

        <CaseQualityOverview
          caseScore={caseResult?.score.total_score}
          caseCount={caseCount}
          totalChangedMethods={totalChangedMethods}
          coveredCount={coveredCount}
          uncoveredCount={uncoveredCount}
          mappingHitCount={mappingHitCount}
          coverageRate={coverageRate}
        />

        <TestSuggestions
          requirementSuggestions={requirementSuggestions}
          codeSuggestions={codeSuggestions}
        />

        <p className="glass-report-preview__summary">
          {summaryText}
        </p>
      </div>
    ) : (
      <div className="glass-report-state glass-report-state--placeholder">
        <FileTextOutlined />
        <span>综合报告会在案例分析完成并保存记录后显示</span>
      </div>
    )
  );

  const renderActiveStepContent = () => {
    switch (activeStep) {
      case 1:
        return renderProjectStep();
      case 2:
        return renderRequirementStep();
      case 3:
        return renderCaseStep();
      case 4:
      default:
        return renderReportStep();
    }
  };

  return (
    <div className="glass-workbench-page glass-case-quality-page">
      <section className="glass-workbench-hero">
        <div className="glass-workbench-hero__content">
          <h1 className="glass-workbench-hero__title">案例质检工作台</h1>
        </div>

        <div className="glass-workbench-sidecard">
          <div className="glass-workbench-sidecard__toggle">
            <div className="glass-workbench-sidecard__toggle-copy">
              <RobotOutlined />
              <span>AI 测试建议</span>
            </div>
            <Switch
              checked={useAI}
              onChange={handleUseAiChange}
              checkedChildren="开"
              unCheckedChildren="关"
              disabled={aiSwitchDisabled}
            />
          </div>
          <span className={`glass-step-pill${useAI ? '' : ' glass-step-pill--muted'}`}>
            {useAI ? '开启后调用 AI 生成测试建议' : '关闭后不调用 AI'}
          </span>
        </div>
      </section>

      <section className="glass-case-quality-flow" aria-label="案例质检流程">
        {CASE_FLOW_STEPS.map((item, index) => {
          const nextItem = CASE_FLOW_STEPS[index + 1];
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

      <section
        className={`glass-case-quality-stage-layout${showStatsPanel ? '' : ' glass-case-quality-stage-layout--single'}`}
        aria-label="当前步骤操作区"
        data-step={activeStep}
      >
        <section className={`glass-case-quality-stage-card${activeStep === 4 && savedRecord ? ' glass-case-quality-stage-card--spotlight' : ''}`}>
          <div className="glass-case-quality-stage-card__header">
            <div className="glass-case-quality-stage-card__heading">
              <span className="glass-case-quality-stage-card__eyebrow">第 {activeStep} 步</span>
              <h2 className="glass-case-quality-stage-card__title">{activeStepMeta.title}</h2>
              {activeStepMeta.description ? (
                <p className="glass-case-quality-stage-card__description">{activeStepMeta.description}</p>
              ) : null}
            </div>
            <div className="glass-case-quality-stage-card__meta">
              {renderActiveStepStatus()}
            </div>
          </div>

          <div className="glass-case-quality-stage-card__body">
            {renderActiveStepContent()}
          </div>
        </section>

        {showStatsPanel ? <MonthlyStatsPanel /> : null}
      </section>

      {activeStep === 4 && savedRecord ? (
        <div ref={reportDetailRef} className="glass-step-stack">
          <section className="glass-report-detail">
            <div className="glass-report-detail__header">
              <Title level={4} style={{ margin: 0 }}>需求分析部分</Title>
              <div className="glass-report-detail__tags">
                <Tag color="blue">项目：{selectedProject?.name ?? '--'}</Tag>
                <Tag color="processing">需求记录 ID：{requirementRecordId ?? '--'}</Tag>
                <Tag color="processing">案例记录 ID：{analysisRecordId ?? '--'}</Tag>
                <Tag color="success">综合记录 ID：{savedRecord.id}</Tag>
              </div>
            </div>
            {requirementResult ? <RequirementAnalysisResultView result={requirementResult} hideAi summaryMode /> : null}
          </section>

          <section className="glass-report-detail">
            <div className="glass-report-detail__header">
              <Title level={4} style={{ margin: 0 }}>案例分析部分</Title>
            </div>
            {caseResult ? (
              <Row gutter={[24, 24]}>
                <Col xs={24} lg={16}>
                  <AnalysisResult diffAnalysis={caseResult.diff_analysis} coverage={caseResult.coverage} />
                </Col>
                <Col xs={24} lg={8}>
                  <ScoreCard score={caseResult.score} />
                </Col>
              </Row>
            ) : null}
          </section>

          <CaseQualityAiAdvice advice={combinedAiTestAdvice} />
        </div>
      ) : null}
    </div>
  );
};

export default CaseQualityPage;

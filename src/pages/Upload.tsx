import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Skeleton,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ApartmentOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  EditOutlined,
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
import KnowledgeSystemOverviewEditorPage from './KnowledgeSystemOverviewEditor';
import type {
  AiReasoningLevel,
  FunctionalCaseGenerationResult,
  FunctionalCaseSavePayload,
  FunctionalTestCase,
  KnowledgeSystemOverviewDetail,
  KnowledgeSystemOverviewMindMapData,
  KnowledgeSystemOverviewSummary,
  Project,
  PromptTemplate,
  RequirementAnalysisResult,
} from '../types';
import {
  extractApiErrorMessage,
  generateFunctionalTestCases,
  getKnowledgeSystemOverview,
  listProjects,
  listKnowledgeSystemOverviews,
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

type FunctionalOutlineNode = Record<string, unknown> & {
  data: Record<string, unknown>;
  children?: FunctionalOutlineNode[];
};

type CaseGenerationStepId = 1 | 2 | 3 | 4 | 5 | 6;
type CaseGenerationStepStatus = 'waiting' | 'active' | 'complete' | 'loading';

interface CaseGenerationProgressStep {
  key: string;
  step: CaseGenerationStepId;
  title: string;
  description: string;
  status: CaseGenerationStepStatus;
}

const AI_REASONING_OPTIONS: Array<{ value: AiReasoningLevel; label: string }> = [
  { value: 'low', label: '快速' },
  { value: 'medium', label: '均衡' },
  { value: 'high', label: '深度' },
];

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim();
}

function getDefaultCaseOutlineName(file: File | null, project: Project | null): string {
  const fileName = file ? stripFileExtension(file.name) : '';
  return fileName || (project ? `${project.name}测试用例` : '测试用例大纲');
}

function createMindMapNode(
  text: string,
  children: FunctionalOutlineNode[] = [],
  data: Record<string, unknown> = {},
): FunctionalOutlineNode {
  return {
    data: {
      ...data,
      text,
      expand: typeof data.expand === 'boolean' ? data.expand : true,
    },
    children,
  };
}

function cloneMindMapNode(node: unknown, fallbackText = '未命名节点'): FunctionalOutlineNode {
  if (!node || typeof node !== 'object') {
    return createMindMapNode(fallbackText);
  }
  const record = node as Record<string, unknown>;
  const data = record.data && typeof record.data === 'object'
    ? { ...(record.data as Record<string, unknown>) }
    : {};
  const text = String(data.text ?? fallbackText).trim() || fallbackText;
  const children = Array.isArray(record.children)
    ? record.children.map((child, index) => cloneMindMapNode(child, `${text}-${index + 1}`))
    : [];
  return {
    ...record,
    data: {
      ...data,
      text,
      expand: typeof data.expand === 'boolean' ? data.expand : true,
    },
    children,
  };
}

function splitCaseSteps(steps: string): string[] {
  const normalizedSteps = steps
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (normalizedSteps.length > 0) {
    return normalizedSteps;
  }
  return steps.trim() ? [steps.trim()] : ['补充测试步骤'];
}

function stripStepOrderPrefix(step: string): string {
  const stripped = step
    .replace(/^(?:步骤\s*)?[\(（]?\d+[\)）]?[.、．:：\s-]*/u, '')
    .trim();
  return stripped || step.trim();
}

function stripOutlineNodeLabel(text: string, labelPattern: RegExp): string {
  const stripped = text.replace(labelPattern, '').trim();
  return stripped || text.trim();
}

function buildLinearCaseChain(nodes: FunctionalOutlineNode[]): FunctionalOutlineNode[] {
  const [head, ...rest] = nodes;
  if (!head) {
    return [];
  }
  return [
    {
      ...head,
      children: buildLinearCaseChain(rest),
    },
  ];
}

function buildCaseOutlineNode(testCase: FunctionalTestCase, index: number): FunctionalOutlineNode {
  const caseId = testCase.case_id?.trim() || `TC-${String(index + 1).padStart(3, '0')}`;
  const description = testCase.description?.trim() || `测试用例 ${index + 1}`;
  const stepNodes = splitCaseSteps(testCase.steps || '').map((step) => (
    createMindMapNode(stripStepOrderPrefix(step))
  ));
  const expectedResult = testCase.expected_result?.trim() || '补充预期结果';
  const expectedNode = createMindMapNode(expectedResult, [], {
    tag: ['预期结果'],
  });

  return createMindMapNode(
    `${caseId} ${description}`,
    buildLinearCaseChain([...stepNodes, expectedNode]),
  );
}

function buildFunctionalCaseOutlineData(
  generationResult: FunctionalCaseGenerationResult,
  options: {
    caseOutlineName: string;
    reuseTemplate: boolean;
    templateDetail?: KnowledgeSystemOverviewDetail | null;
  },
): KnowledgeSystemOverviewMindMapData {
  const generatedCaseNodes = (generationResult.cases ?? []).map(buildCaseOutlineNode);
  const rootTitle = options.caseOutlineName.trim()
    || stripFileExtension(generationResult.file_name || '')
    || '测试用例大纲';

  if (!options.reuseTemplate || !options.templateDetail?.mind_map_data?.root) {
    return {
      layout: 'logicalStructure',
      theme: { template: 'default', config: {} },
      root: createMindMapNode(rootTitle, generatedCaseNodes),
    };
  }

  const templateRoot = cloneMindMapNode(
    options.templateDetail.mind_map_data.root,
    options.templateDetail.title || '复用模板',
  );

  return {
    layout: 'logicalStructure',
    theme: { template: 'default', config: {} },
    root: createMindMapNode(rootTitle, [
      createMindMapNode('复用模板', [templateRoot]),
      createMindMapNode('AI生成用例', generatedCaseNodes),
    ]),
  };
}

function getMindMapNodeText(node: FunctionalOutlineNode | Record<string, unknown> | undefined): string {
  const data = node?.data;
  if (data && typeof data === 'object') {
    return String((data as Record<string, unknown>).text ?? '').trim();
  }
  return '';
}

function getMindMapChildren(node: FunctionalOutlineNode | Record<string, unknown> | undefined): FunctionalOutlineNode[] {
  return Array.isArray(node?.children) ? node.children as FunctionalOutlineNode[] : [];
}

function normalizeCaseNodeText(text: string): { caseId: string | null; description: string } {
  const normalized = stripOutlineNodeLabel(text, /^用例概述[:：\s-]*/u);
  const match = normalized.match(/^(TC[-_\s]?\d+|CASE[-_\s]?\d+|用例[-_\s]?\d+)[:：\s-]*(.*)$/i);
  if (!match) {
    return {
      caseId: null,
      description: normalized,
    };
  }
  return {
    caseId: match[1].replace(/\s+/g, '-').toUpperCase(),
    description: match[2]?.trim() || normalized,
  };
}

function getMindMapTagTexts(node: FunctionalOutlineNode): string[] {
  const tagValue = node.data?.tag;
  if (!Array.isArray(tagValue)) {
    return [];
  }
  return tagValue
    .map((tag) => {
      if (typeof tag === 'string') {
        return tag;
      }
      if (tag && typeof tag === 'object' && 'text' in tag) {
        return String((tag as Record<string, unknown>).text ?? '');
      }
      return '';
    })
    .filter(Boolean);
}

function isExpectedResultOutlineNode(node: FunctionalOutlineNode): boolean {
  const text = getMindMapNodeText(node);
  return text.startsWith('预期结果')
    || getMindMapTagTexts(node).includes('预期结果');
}

function collectLinearCaseOutlineSections(node: FunctionalOutlineNode): {
  steps: string[];
  expectedResult: string;
} {
  const steps: string[] = [];
  let expectedResult = '';
  let current: FunctionalOutlineNode | undefined = getMindMapChildren(node)[0];
  const firstNodeText = current ? getMindMapNodeText(current) : '';
  if (firstNodeText.includes('测试步骤') || firstNodeText.includes('预期结果')) {
    return { steps, expectedResult };
  }

  while (current) {
    const text = getMindMapNodeText(current);
    if (isExpectedResultOutlineNode(current)) {
      expectedResult = stripOutlineNodeLabel(text, /^预期结果[:：\s-]*/u);
      break;
    }

    if (text) {
      steps.push(stripOutlineNodeLabel(text, /^用例步骤\s*\d*[:：\s-]*/u));
    }

    const children = getMindMapChildren(current);
    current = children.length === 1 ? children[0] : undefined;
  }

  return {
    steps,
    expectedResult,
  };
}

function findCaseSectionText(node: FunctionalOutlineNode, sectionKeyword: string): string {
  const section = getMindMapChildren(node).find((child) => getMindMapNodeText(child).includes(sectionKeyword));
  if (!section) {
    return '';
  }
  const children = getMindMapChildren(section);
  if (children.length > 0) {
    return children
      .map((child) => getMindMapNodeText(child))
      .filter(Boolean)
      .join('\n');
  }
  return getMindMapNodeText(section).replace(sectionKeyword, '').replace(/^[:：\s-]+/, '').trim();
}

function extractCasesFromOutlineData(
  outlineData: KnowledgeSystemOverviewMindMapData | null,
  fallbackCases: FunctionalTestCase[],
): FunctionalTestCase[] {
  const root = outlineData?.root as FunctionalOutlineNode | undefined;
  if (!root) {
    return fallbackCases;
  }

  const rootChildren = getMindMapChildren(root);
  const generatedBranch = rootChildren.find((child) => getMindMapNodeText(child) === 'AI生成用例');
  const candidateNodes = generatedBranch ? getMindMapChildren(generatedBranch) : rootChildren;
  const cases = candidateNodes
    .map((node, index): FunctionalTestCase | null => {
      const rawText = getMindMapNodeText(node);
      if (!rawText) {
        return null;
      }
      const normalizedCase = normalizeCaseNodeText(rawText);
      const fallbackCase = fallbackCases[index];
      const caseId = normalizedCase.caseId
        || fallbackCase?.case_id
        || `TC-${String(index + 1).padStart(3, '0')}`;
      const description = normalizedCase.description || fallbackCase?.description || rawText;
      const linearSections = collectLinearCaseOutlineSections(node);
      const steps = linearSections.steps.length > 0
        ? linearSections.steps.map((step, stepIndex) => `${stepIndex + 1}. ${step}`).join('\n')
        : findCaseSectionText(node, '测试步骤') || fallbackCase?.steps || '补充测试步骤';
      const expectedResult = linearSections.expectedResult
        || findCaseSectionText(node, '预期结果')
        || fallbackCase?.expected_result
        || '补充预期结果';

      return {
        case_id: caseId,
        description,
        steps,
        expected_result: expectedResult,
        source: fallbackCase?.source ?? 'ai',
      };
    })
    .filter((item): item is FunctionalTestCase => item !== null);

  return cases.length > 0 ? cases : fallbackCases;
}

function buildOutlineSerializedKey(data: KnowledgeSystemOverviewMindMapData | null): string {
  return data ? JSON.stringify(data) : '';
}

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
  const [reuseTemplate, setReuseTemplate] = useState(false);
  const [selectedOverviewId, setSelectedOverviewId] = useState<number | null>(null);
  const [selectedPromptTemplateKey, setSelectedPromptTemplateKey] = useState<string>();
  const [isTemplateStepConfirmed, setIsTemplateStepConfirmed] = useState(false);
  const [isPromptStepConfirmed, setIsPromptStepConfirmed] = useState(false);
  const [reasoningLevel, setReasoningLevel] = useState<AiReasoningLevel>('medium');
  const [requirementFile, setRequirementFile] = useState<File | null>(null);
  const [mappingResult, setMappingResult] = useState<RequirementAnalysisResult | null>(null);
  const [generatedDraftResult, setGeneratedDraftResult] = useState<FunctionalCaseGenerationResult | null>(null);
  const [outlineData, setOutlineData] = useState<KnowledgeSystemOverviewMindMapData | null>(null);
  const [savedOutlineSerializedKey, setSavedOutlineSerializedKey] = useState('');
  const [isOutlineEditorOpen, setIsOutlineEditorOpen] = useState(false);
  const [result, setResult] = useState<FunctionalCaseGenerationResult | null>(null);
  const [activeStep, setActiveStep] = useState<CaseGenerationStepId>(1);
  const [stageIndex, setStageIndex] = useState(0);
  const [previewVersion, setPreviewVersion] = useState(0);
  const [savedPreviewVersion, setSavedPreviewVersion] = useState<number | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isMappingPreviewOpen, setIsMappingPreviewOpen] = useState(false);
  const [caseOutlineName, setCaseOutlineName] = useState('');
  const [caseName, setCaseName] = useState('');
  const [iterationVersion, setIterationVersion] = useState('');
  const latestMappingRequestIdRef = useRef(0);
  const manualStepOverrideRef = useRef<CaseGenerationStepId | null>(null);

  const moveToWorkflowStep = useCallback((step: CaseGenerationStepId) => {
    manualStepOverrideRef.current = null;
    setActiveStep(step);
  }, []);

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

  const overviewsQuery = useQuery({
    queryKey: ['knowledge-system-overviews'],
    queryFn: listKnowledgeSystemOverviews,
    staleTime: 30_000,
    enabled: Boolean(selectedProjectId),
  });

  const selectedOverviewQuery = useQuery({
    queryKey: ['knowledge-system-overview', selectedOverviewId],
    queryFn: () => getKnowledgeSystemOverview(selectedOverviewId as number),
    staleTime: 30_000,
    enabled: reuseTemplate && selectedOverviewId !== null,
  });

  const resetGeneratedArtifactState = () => {
    setGeneratedDraftResult(null);
    setOutlineData(null);
    setSavedOutlineSerializedKey('');
    setIsOutlineEditorOpen(false);
    setResult(null);
    setPreviewVersion(0);
    setSavedPreviewVersion(null);
    setIsMappingPreviewOpen(false);
  };

  const resetFlowResultState = () => {
    setMappingResult(null);
    resetGeneratedArtifactState();
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
        moveToWorkflowStep(5);
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
        const nextOutline = buildFunctionalCaseOutlineData(response.data, {
          caseOutlineName,
          reuseTemplate,
          templateDetail: selectedOverviewQuery.data,
        });
        setGeneratedDraftResult(response.data);
        setOutlineData(nextOutline);
        setSavedOutlineSerializedKey('');
        setIsOutlineEditorOpen(false);
        setResult(null);
        setPreviewVersion(0);
        setSavedPreviewVersion(null);
        moveToWorkflowStep(5);
        message.success(`已生成 ${response.data.total} 条大纲用例，请编辑并保存大纲`);
        return;
      }
      message.error(response.error || '生成大纲失败');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '生成大纲失败'));
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
  const projectOverviews = useMemo(
    () => (overviewsQuery.data ?? []).filter((item: KnowledgeSystemOverviewSummary) => (
      item.project_id === selectedProjectId
    )),
    [overviewsQuery.data, selectedProjectId],
  );
  const selectedPromptTemplate = useMemo(
    () => promptTemplates.find((item) => item.agent_key === selectedPromptTemplateKey) ?? null,
    [promptTemplates, selectedPromptTemplateKey],
  );
  const selectedOverview = useMemo(
    () => projectOverviews.find((item) => item.id === selectedOverviewId) ?? null,
    [projectOverviews, selectedOverviewId],
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
      setIsPromptStepConfirmed(false);
      moveToWorkflowStep(isTemplateStepConfirmed ? 3 : 2);
      resetFlowResultState();
    }
  }, [isTemplateStepConfirmed, moveToWorkflowStep, promptTemplates, selectedProjectId, selectedPromptTemplateKey]);

  useEffect(() => {
    if (!selectedProjectId || selectedOverviewId === null || overviewsQuery.isLoading) {
      return;
    }
    const exists = projectOverviews.some((item) => item.id === selectedOverviewId);
    if (!exists) {
      setSelectedOverviewId(null);
      setIsTemplateStepConfirmed(false);
      setIsPromptStepConfirmed(false);
      resetGeneratedArtifactState();
    }
  }, [overviewsQuery.isLoading, projectOverviews, selectedOverviewId, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId === null) {
      return;
    }
    const exists = (projectsQuery.data ?? []).some((item) => item.id === selectedProjectId);
    if (!exists) {
      latestMappingRequestIdRef.current += 1;
      setSelectedProjectId(null);
      setReuseTemplate(false);
      setSelectedOverviewId(null);
      setSelectedPromptTemplateKey(undefined);
      setIsTemplateStepConfirmed(false);
      setIsPromptStepConfirmed(false);
      setRequirementFile(null);
      setCaseOutlineName('');
      moveToWorkflowStep(1);
      resetFlowResultState();
    }
  }, [moveToWorkflowStep, projectsQuery.data, selectedProjectId]);

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

  const overviewOptions = useMemo(
    () => projectOverviews.map((item) => ({
      value: item.id,
      label: `${item.title}（${item.outline_category || '功能视图'}）`,
    })),
    [projectOverviews],
  );

  const isTemplateReady = Boolean(!reuseTemplate || selectedOverviewId);
  const isPromptStepEnabled = Boolean(selectedProjectId && isTemplateStepConfirmed && isTemplateReady);
  const isUploadStepEnabled = Boolean(isPromptStepEnabled && isPromptStepConfirmed && selectedPromptTemplateKey);

  const isReadyToMap = Boolean(
    selectedProjectId
    && isTemplateReady
    && isTemplateStepConfirmed
    && isPromptStepConfirmed
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

  const isReadyToGenerateOutline = Boolean(
    isReadyToGenerate
    && (!reuseTemplate || selectedOverviewQuery.data)
    && !selectedOverviewQuery.isLoading,
  );

  const currentOutlineSerializedKey = buildOutlineSerializedKey(outlineData);
  const isOutlineSaved = Boolean(
    outlineData
    && savedOutlineSerializedKey
    && savedOutlineSerializedKey === currentOutlineSerializedKey,
  );

  const isReadyToFinalizeCases = Boolean(
    generatedDraftResult
    && outlineData
    && isOutlineSaved,
  );

  const isCurrentPreviewSaved = Boolean(
    result
    && previewVersion > 0
    && savedPreviewVersion === previewVersion,
  );

  const progressSteps: CaseGenerationProgressStep[] = [
    {
      key: 'project',
      step: 1,
      title: '选择项目',
      description: selectedProject?.name || '未选择',
      status: selectedProject ? 'complete' : 'active',
    },
    {
      key: 'template',
      step: 2,
      title: '复用模板',
      description: reuseTemplate ? (selectedOverview?.title || '请选择大纲') : '默认不复用',
      status: !selectedProject
        ? 'waiting'
        : isTemplateStepConfirmed && isTemplateReady
          ? 'complete'
          : 'active',
    },
    {
      key: 'prompt',
      step: 3,
      title: '选择提示词',
      description: selectedPromptTemplate?.name || '未选择',
      status: !isPromptStepEnabled
        ? 'waiting'
        : isPromptStepConfirmed && selectedPromptTemplate
          ? 'complete'
          : 'active',
    },
    {
      key: 'upload',
      step: 4,
      title: '上传需求文档',
      description: requirementFile?.name || '等待上传',
      status: !isUploadStepEnabled
        ? 'waiting'
        : mapMutation.isPending
          ? 'loading'
          : requirementFile
            ? 'complete'
            : 'active',
    },
    {
      key: 'outline',
      step: 5,
      title: '生成大纲',
      description: outlineData ? (isOutlineSaved ? '大纲已保存' : '大纲待保存') : '等待生成',
      status: generateMutation.isPending
        ? 'loading'
        : outlineData
          ? isOutlineSaved
            ? 'complete'
            : 'active'
          : isReadyToGenerate
            ? 'active'
            : 'waiting',
    },
    {
      key: 'cases',
      step: 6,
      title: '生成测试用例',
      description: result ? `已生成 ${result.total} 条` : '等待大纲保存',
      status: result
        ? 'complete'
        : isReadyToFinalizeCases
          ? 'active'
          : 'waiting',
    },
  ];
  const progressPercent = Math.round(
    (progressSteps.filter((step) => step.status === 'complete').length / progressSteps.length) * 100,
  );
  const currentWorkflowStep = (
    progressSteps.find((item) => item.status === 'active' || item.status === 'loading')
    ?? [...progressSteps].reverse().find((item) => item.status === 'complete')
    ?? progressSteps[0]
  ).step;
  const activeProgressStep = progressSteps.find((item) => item.step === activeStep) ?? progressSteps[0];

  useEffect(() => {
    if (activeProgressStep.status === 'waiting') {
      manualStepOverrideRef.current = null;
      setActiveStep(currentWorkflowStep);
      return;
    }
    if (manualStepOverrideRef.current === activeStep) {
      return;
    }
    if (activeProgressStep.status === 'complete' && activeStep < currentWorkflowStep) {
      setActiveStep(currentWorkflowStep);
    }
  }, [activeProgressStep.status, activeStep, currentWorkflowStep]);

  const handleStepNavigation = (step: CaseGenerationStepId) => {
    const targetStep = progressSteps.find((item) => item.step === step);
    if (!targetStep || targetStep.status === 'waiting') {
      return;
    }
    manualStepOverrideRef.current = step;
    setActiveStep(step);
  };

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
    setReuseTemplate(false);
    setSelectedOverviewId(null);
    setSelectedPromptTemplateKey(undefined);
    setIsTemplateStepConfirmed(false);
    setIsPromptStepConfirmed(false);
    setRequirementFile(null);
    setCaseOutlineName('');
    moveToWorkflowStep(value ? 2 : 1);
    resetFlowResultState();
  };

  const handleReuseTemplateChange = (checked: boolean) => {
    setReuseTemplate(checked);
    setSelectedOverviewId(null);
    setIsTemplateStepConfirmed(false);
    setIsPromptStepConfirmed(false);
    moveToWorkflowStep(2);
    resetGeneratedArtifactState();
  };

  const handleOverviewChange = (value: number) => {
    setSelectedOverviewId(value);
    setIsTemplateStepConfirmed(false);
    setIsPromptStepConfirmed(false);
    resetGeneratedArtifactState();
  };

  const handlePromptChange = (value: string) => {
    setSelectedPromptTemplateKey(value);
    setIsPromptStepConfirmed(false);
    resetFlowResultState();
    latestMappingRequestIdRef.current += 1;
  };

  const handleConfirmTemplateStep = () => {
    if (!selectedProjectId) {
      message.warning('请先选择项目');
      return;
    }
    if (!isTemplateReady) {
      message.warning('请先完成复用模板配置');
      return;
    }
    setIsTemplateStepConfirmed(true);
    setIsPromptStepConfirmed(false);
    moveToWorkflowStep(3);
  };

  const handleConfirmPromptStep = () => {
    if (!selectedPromptTemplateKey) {
      message.warning('请先选择提示词');
      return;
    }
    setIsPromptStepConfirmed(true);
    moveToWorkflowStep(4);
    if (!selectedProjectId || !requirementFile) {
      latestMappingRequestIdRef.current += 1;
      return;
    }
    const requestId = latestMappingRequestIdRef.current + 1;
    latestMappingRequestIdRef.current = requestId;
    resetFlowResultState();
    mapMutation.mutate({
      projectId: selectedProjectId,
      promptTemplateKey: selectedPromptTemplateKey,
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

    if (!selectedProjectId || !isTemplateStepConfirmed || !isTemplateReady || !isPromptStepConfirmed || !selectedPromptTemplateKey) {
      message.warning('请先完成项目、复用模板和提示词配置');
      return Upload.LIST_IGNORE;
    }

    const requestId = latestMappingRequestIdRef.current + 1;
    latestMappingRequestIdRef.current = requestId;
    setRequirementFile(file);
    setCaseOutlineName((current) => current.trim() || getDefaultCaseOutlineName(file, selectedProject));
    moveToWorkflowStep(4);
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
    setCaseName(caseOutlineName.trim() || getDefaultCaseOutlineName(requirementFile, selectedProject));
    setIterationVersion('');
    setIsSaveModalOpen(true);
  };

  const handleOpenOutlineEditor = () => {
    if (!outlineData) {
      message.warning('请先生成大纲');
      return;
    }
    setIsOutlineEditorOpen(true);
  };

  const handleSaveOutline = (nextOutlineData?: KnowledgeSystemOverviewMindMapData) => {
    const latestOutlineData = nextOutlineData ?? outlineData;
    if (!latestOutlineData) {
      message.warning('请先生成大纲');
      return;
    }
    setOutlineData(latestOutlineData);
    setSavedOutlineSerializedKey(buildOutlineSerializedKey(latestOutlineData));
    setIsOutlineEditorOpen(false);
    setResult(null);
    setSavedPreviewVersion(null);
    moveToWorkflowStep(6);
  };

  const handleFinalizeCases = () => {
    if (!generatedDraftResult) {
      message.warning('请先生成大纲');
      return;
    }
    const latestOutlineData = outlineData;
    if (!latestOutlineData || buildOutlineSerializedKey(latestOutlineData) !== savedOutlineSerializedKey) {
      message.warning('请先保存当前大纲');
      return;
    }
    const cases = extractCasesFromOutlineData(latestOutlineData, generatedDraftResult.cases ?? []);
    setResult({
      ...generatedDraftResult,
      summary: generatedDraftResult.summary,
      total: cases.length,
      cases,
    });
    setPreviewVersion((current) => current + 1);
    setSavedPreviewVersion(null);
    moveToWorkflowStep(6);
    message.success(`已生成 ${cases.length} 条测试用例`);
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

  const generationTransition = generateMutation.isPending ? (
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
          <Title level={3} style={{ margin: 0 }}>大纲生成中</Title>
          <Text type="secondary">{GENERATION_STAGES[stageIndex]}</Text>
        </div>
      </div>
    </section>
  ) : null;

  if (isOutlineEditorOpen && outlineData) {
    return (
      <KnowledgeSystemOverviewEditorPage
        caseGenerationOutline={{
          detail: {
            id: 0,
            project_id: selectedProjectId ?? 0,
            project_name: selectedProject?.name || generatedDraftResult?.project_name || '未关联项目',
            title: caseOutlineName.trim() || '测试用例大纲',
            outline_category: '功能视图',
            description: '案例生成流程中的临时大纲，保存后返回继续生成测试用例。',
            creator_name: null,
            creator_user_id: null,
            creator_username: null,
            creator_display_name: null,
            source_format: 'manual',
            source_file_name: requirementFile?.name || null,
            created_at: new Date().toISOString(),
            updated_at: buildOutlineSerializedKey(outlineData),
            mind_map_data: outlineData,
          },
          onBack: () => {
            setIsOutlineEditorOpen(false);
            moveToWorkflowStep(5);
          },
          onSave: handleSaveOutline,
        }}
      />
    );
  }

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

      <section className="case-generation-console" aria-label="案例生成流程">
        <aside className="case-generation-progress" aria-label="案例生成完整进度侧边栏">
          <div className="case-generation-progress__header">
            <span>流程进度</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="case-generation-progress__meter" aria-hidden="true">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <ol className="case-generation-progress__list">
            {progressSteps.map((item) => (
              <li
                key={item.key}
                className="case-generation-progress__item"
                data-status={item.status}
                data-current={activeStep === item.step ? 'true' : 'false'}
              >
                <button
                  type="button"
                  className="case-generation-progress__button"
                  disabled={item.status === 'waiting'}
                  aria-label={`第${item.step}步 ${item.title}`}
                  aria-current={activeStep === item.step ? 'step' : undefined}
                  onClick={() => handleStepNavigation(item.step)}
                >
                  <span className="case-generation-progress__badge">
                    {item.status === 'complete' ? <CheckCircleOutlined /> : item.step}
                  </span>
                  <span className="case-generation-progress__copy">
                    <strong>{item.title}</strong>
                    <span>{item.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="case-generation-flow" aria-label="当前步骤操作区">
          {activeStep === 1 ? (
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
          ) : null}

          {activeStep === 2 ? (
          <GlassStepCard
            step={2}
            title="复用模板"
            help="默认不复用；选择复用后，可从当前项目的系统功能全景图大纲中选择模板。"
            state={!selectedProject ? 'disabled' : isTemplateStepConfirmed && isTemplateReady ? 'complete' : 'active'}
            statusNode={reuseTemplate
              ? <Tag color={selectedOverview ? 'blue' : 'gold'} className="case-generation-status-tag">{selectedOverview ? '已选择模板' : '待选择模板'}</Tag>
              : <Tag color="default" className="case-generation-status-tag">不复用</Tag>}
          >
            <div className="case-generation-step">
              <div className="case-generation-step__head">
                <ApartmentOutlined />
                <span>知识库管理 &gt; 系统功能全景图</span>
              </div>

              <div className="case-generation-template-toggle">
                <div>
                  <strong>复用已有大纲模板</strong>
                  <span>关闭时，大纲只展示 AI 生成的测试用例节点。</span>
                </div>
                <Switch
                  checked={reuseTemplate}
                  checkedChildren="是"
                  unCheckedChildren="否"
                  disabled={!selectedProjectId}
                  onChange={handleReuseTemplateChange}
                  aria-label="是否复用模板"
                />
              </div>

              {reuseTemplate ? (
                <Select
                  size="large"
                  value={selectedOverviewId ?? undefined}
                  placeholder="请选择当前项目下的大纲"
                  options={overviewOptions}
                  loading={overviewsQuery.isLoading}
                  disabled={!selectedProjectId || overviewsQuery.isLoading}
                  style={{ width: '100%' }}
                  className="case-generation-template-select glass-workbench-select"
                  classNames={{ popup: { root: 'glass-workbench-select-dropdown' } }}
                  showSearch
                  optionFilterProp="label"
                  aria-label="案例生成复用模板选择"
                  onChange={(nextValue) => handleOverviewChange(Number(nextValue))}
                />
              ) : null}

              {reuseTemplate && overviewsQuery.isError ? (
                <Alert
                  type="error"
                  showIcon
                  title="大纲模板加载失败"
                  description={extractApiErrorMessage(overviewsQuery.error, '请稍后重试或检查后端服务')}
                />
              ) : null}

              {reuseTemplate && !overviewsQuery.isLoading && !overviewsQuery.isError && overviewOptions.length === 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  title="当前项目暂无可复用大纲"
                  description={(
                    <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/knowledge-base/system-overview')}>
                      前往系统功能全景图创建大纲
                    </Button>
                  )}
                />
              ) : null}

              <div className="glass-step-actions">
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  disabled={!selectedProjectId || !isTemplateReady}
                  onClick={handleConfirmTemplateStep}
                >
                  下一步
                </Button>
              </div>
            </div>
          </GlassStepCard>
          ) : null}

          {activeStep === 3 ? (
          <GlassStepCard
            step={3}
            title="选择提示词"
            help="默认优先选择 requirement 提示词，可按需切换。"
            state={isPromptStepConfirmed && selectedPromptTemplate ? 'complete' : isPromptStepEnabled ? 'active' : 'disabled'}
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
                    disabled={!isPromptStepEnabled}
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

              <div className="glass-step-actions">
                <Button
                  type="primary"
                  icon={<ArrowRightOutlined />}
                  disabled={!isPromptStepEnabled || !selectedPromptTemplateKey}
                  onClick={handleConfirmPromptStep}
                >
                  下一步
                </Button>
              </div>
            </div>
          </GlassStepCard>
          ) : null}

          {activeStep === 4 ? (
          <GlassStepCard
            step={4}
            title="上传需求文档"
            help="仅支持 DOC / DOCX，上传后会自动映射需求数据，重新上传会覆盖当前文件并清空后续结果。"
            state={mapMutation.isPending ? 'loading' : requirementFile ? 'complete' : isUploadStepEnabled ? 'active' : 'disabled'}
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
                disabled={!isUploadStepEnabled}
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
                  : !isTemplateStepConfirmed
                    ? '请先确认复用模板配置。'
                  : !isTemplateReady
                    ? '请先完成复用模板配置。'
                    : !isPromptStepConfirmed
                      ? '请先确认提示词配置。'
                    : !selectedPromptTemplateKey
                      ? '请先选择提示词。'
                      : !requirementFile
                        ? '上传需求文档后会自动映射需求数据，并供大纲生成使用。'
                        : mapMutation.isPending
                          ? '正在自动映射需求数据，请稍候。'
                          : mappingResult
                            ? '需求映射数据已就绪，可在预览区点击“需求映射”查看。'
                            : '需求映射尚未完成，请重新上传需求文档后重试。'}
              </p>
            </div>
          </GlassStepCard>
          ) : null}

          {activeStep === 5 ? (
          <GlassStepCard
            step={5}
            title="生成大纲"
            help="先生成可编辑思维导图大纲；保存大纲后才能进入最终测试用例生成。"
            state={generateMutation.isPending ? 'loading' : outlineData ? (isOutlineSaved ? 'complete' : 'active') : isReadyToGenerate ? 'active' : 'disabled'}
            statusNode={outlineData
              ? <Tag color={isOutlineSaved ? 'success' : 'gold'} className="case-generation-status-tag">{isOutlineSaved ? '大纲已保存' : '大纲待保存'}</Tag>
              : null}
          >
            <div className="case-generation-step">
              <div className="case-generation-scope">
                <span>大纲主节点</span>
                <Input
                  value={caseOutlineName}
                  placeholder="默认使用需求文档名称"
                  disabled={!requirementFile}
                  onChange={(event) => {
                    setCaseOutlineName(event.target.value);
                    resetGeneratedArtifactState();
                  }}
                />
              </div>

              <GlowActionButton
                type="primary"
                size="large"
                block
                disabled={!isReadyToGenerateOutline}
                loading={generateMutation.isPending || selectedOverviewQuery.isLoading}
                onClick={() => generateMutation.mutate()}
              >
                生成大纲
              </GlowActionButton>

              <p className="glass-step-note">
                {!mappingResult
                  ? '请先上传需求文档并等待需求映射完成。'
                  : reuseTemplate && !selectedOverview
                    ? '请先选择要复用的大纲模板。'
                    : reuseTemplate && selectedOverviewQuery.isLoading
                      ? '正在读取复用模板详情。'
                      : '生成后进入独立大纲编辑页，复用系统功能全景图的稳定画布能力。'}
              </p>

              {reuseTemplate && selectedOverviewQuery.isError ? (
                <Alert
                  type="error"
                  showIcon
                  title="复用模板详情加载失败"
                  description={extractApiErrorMessage(selectedOverviewQuery.error, '请重新选择模板或稍后重试')}
                />
              ) : null}

              {generationTransition}

              {outlineData ? (
                <div className="case-generation-outline">
                  <div className="case-generation-outline__toolbar">
                    <Space wrap>
                      <Tag color="blue">已生成大纲</Tag>
                      <Tag color={isOutlineSaved ? 'success' : 'gold'}>
                        {isOutlineSaved ? '大纲已保存' : '待编辑保存'}
                      </Tag>
                      {reuseTemplate && selectedOverview ? <Tag color="gold">复用：{selectedOverview.title}</Tag> : null}
                      {generatedDraftResult ? <Tag color="cyan">AI 用例：{generatedDraftResult.total} 条</Tag> : null}
                    </Space>
                    <div className="case-generation-outline__toolbar-actions">
                      <Button
                        type="primary"
                        icon={<EditOutlined />}
                        onClick={handleOpenOutlineEditor}
                      >
                        编辑大纲
                      </Button>
                    </div>
                  </div>
                  <div className="case-generation-outline__summary">
                    <strong>{caseOutlineName.trim() || '测试用例大纲'}</strong>
                    <span>
                      已生成思维导图大纲。点击“编辑大纲”进入独立画布维护节点、标签、撤销重做和下载；保存后自动返回当前流程。
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </GlassStepCard>
          ) : null}

          {activeStep === 6 ? (
          <GlassStepCard
            step={6}
            title="生成测试用例"
            help="保存大纲后，系统会按已确认的大纲生成最终测试用例预览。"
            state={result ? 'complete' : isReadyToFinalizeCases ? 'active' : 'disabled'}
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
                disabled={!isReadyToFinalizeCases}
                onClick={handleFinalizeCases}
              >
                生成测试用例
              </GlowActionButton>

              <p className="glass-step-note">
                {!outlineData
                  ? '请先生成大纲。'
                  : !isOutlineSaved
                    ? '请先保存当前大纲。'
                    : '将基于已保存的大纲生成最终预览，可继续保存为测试案例记录。'}
              </p>
            </div>
          </GlassStepCard>
          ) : null}
        </div>
      </section>

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
                <Text type="secondary">保存大纲并点击“生成测试用例”后，这里展示最终预览。</Text>
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
            <Empty description="保存大纲并生成测试用例后，这里会展示测试用例表格。" />
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

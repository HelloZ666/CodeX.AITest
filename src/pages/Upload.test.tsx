import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FunctionalCaseGenerationResult, RequirementAnalysisResult } from '../types';
import UploadPage from './Upload';

const {
  knowledgeMindMapCanvasSpy,
  outlineActiveNode,
  outlineExecCommandMock,
  outlineFitMock,
  outlineEnlargeMock,
  outlineNarrowMock,
  requirementAnalysisViewSpy,
} = vi.hoisted(() => ({
  knowledgeMindMapCanvasSpy: vi.fn(),
  outlineActiveNode: {
    isRoot: false,
    children: [],
    nodeData: {
      data: { text: '资格校验', tag: ['正向'] },
    },
    getData: vi.fn(() => ({ text: '资格校验', tag: ['正向'] })),
  },
  outlineExecCommandMock: vi.fn(),
  outlineFitMock: vi.fn(),
  outlineEnlargeMock: vi.fn(),
  outlineNarrowMock: vi.fn(),
  requirementAnalysisViewSpy: vi.fn(() => <div data-testid="mapping-summary">映射摘要</div>),
}));

vi.mock('./FunctionalTestCases', () => ({
  default: () => <div>测试案例记录</div>,
}));

vi.mock('../components/RequirementAnalysis/RequirementAnalysisResult', () => ({
  default: (props: unknown) => (requirementAnalysisViewSpy as Mock)(props),
}));

vi.mock('../components/KnowledgeBase/KnowledgeMindMapCanvas', () => ({
  default: (props: {
    value?: Record<string, unknown> | null;
    onReady?: (instance: {
      execCommand: (command: string, ...args: unknown[]) => void;
      getData: () => Record<string, unknown>;
      view: {
        fit: (...args: unknown[]) => void;
        enlarge: () => void;
        narrow: () => void;
      };
      renderer: {
        activeNodeList: unknown[];
      };
    } | null) => void;
    onSelectionChange?: (count: number) => void;
    onNodeContextMenu?: (event: {
      clientX: number;
      clientY: number;
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => void;
  }) => {
    const { onReady, onSelectionChange, onNodeContextMenu } = props;
    knowledgeMindMapCanvasSpy(props);
    useEffect(() => {
      onReady?.({
        execCommand: outlineExecCommandMock,
        getData: vi.fn(() => props.value as Record<string, unknown>),
        view: {
          fit: outlineFitMock,
          enlarge: outlineEnlargeMock,
          narrow: outlineNarrowMock,
        },
        renderer: {
          activeNodeList: [outlineActiveNode],
        },
      });
      return () => onReady?.(null);
    }, [onReady, props.value]);

    return (
      <div data-testid="case-outline-canvas">
        大纲编辑画布
        <button
          type="button"
          onClick={() => onSelectionChange?.(1)}
        >
          Mock Select Outline Node
        </button>
        <button
          type="button"
          onClick={() => {
            onSelectionChange?.(1);
            onNodeContextMenu?.({
              clientX: 260,
              clientY: 180,
              preventDefault: vi.fn(),
              stopPropagation: vi.fn(),
            });
          }}
        >
          Mock Outline Context Menu
        </button>
      </div>
    );
  },
}));

vi.mock('../utils/api', () => ({
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  generateFunctionalTestCases: vi.fn(),
  getKnowledgeSystemOverview: vi.fn(),
  listKnowledgeSystemOverviews: vi.fn(),
  listProjects: vi.fn(),
  listPromptTemplates: vi.fn(),
  mapFunctionalRequirementForCaseGeneration: vi.fn(),
  saveFunctionalCaseGenerationResult: vi.fn(),
  updateKnowledgeSystemOverview: vi.fn(),
}));

import {
  generateFunctionalTestCases,
  getKnowledgeSystemOverview,
  listKnowledgeSystemOverviews,
  listProjects,
  listPromptTemplates,
  mapFunctionalRequirementForCaseGeneration,
  saveFunctionalCaseGenerationResult,
} from '../utils/api';

function buildMappingResult(): RequirementAnalysisResult {
  return {
    overview: {
      total_requirements: 3,
      matched_requirements: 2,
      mapping_hit_count: 2,
      unmatched_requirements: 1,
      use_ai: false,
      duration_ms: 320,
    },
    mapping_suggestions: [
      {
        requirement_point_id: 'R-1',
        section_number: '4.1',
        section_title: '功能描述',
        requirement_text: '新增投保资格校验',
        match_count: 1,
        suggestion: '补齐边界值场景',
      },
    ],
    requirement_hits: [
      {
        point_id: 'R-1',
        section_number: '4.1',
        section_title: '功能描述',
        text: '新增投保资格校验',
        mapping_suggestion: '补齐边界值场景',
        mapping_matches: [
          {
            group_id: 'G-1',
            tag: '资格',
            requirement_keyword: '投保资格',
            matched_requirement_keyword: '投保资格',
            matched_scenarios: ['失败原因提示'],
            related_scenarios: ['失败原因提示', '拦截提交'],
            additional_scenarios: ['异常弹窗引导'],
          },
        ],
      },
    ],
    unmatched_requirements: [
      {
        point_id: 'R-2',
        section_number: '4.4',
        section_title: '界面',
        text: '页面需要展示显著提示文案',
      },
    ],
    ai_analysis: null,
    ai_cost: null,
    source_files: {
      project_id: 11,
      project_name: '核心投保项目',
      requirement_file_name: 'requirement.docx',
      requirement_mapping_available: true,
      requirement_mapping_source_type: 'upload',
      requirement_mapping_file_name: 'mapping.xlsx',
      requirement_mapping_group_count: 2,
      requirement_mapping_updated_at: '2026-04-01T00:00:00Z',
    },
  };
}

function buildGenerationResult(): FunctionalCaseGenerationResult {
  return {
    file_name: 'requirement.docx',
    project_id: 11,
    project_name: '核心投保项目',
    prompt_template_key: 'requirement',
    summary: '覆盖资格校验主流程与异常提示场景',
    generation_mode: 'ai',
    provider: 'DeepSeek',
    ai_cost: { total_tokens: 180 },
    error: null,
    total: 2,
    cases: [
      {
        case_id: 'TC-001',
        description: '资格校验失败时禁止提交',
        steps: '1. 打开投保页面\n2. 输入不满足资格条件的数据\n3. 点击提交',
        expected_result: '系统阻止提交并提示失败原因',
        source: 'ai',
      },
      {
        case_id: 'TC-002',
        description: '资格校验失败时展示显著提示',
        steps: '1. 触发资格校验失败\n2. 观察页面文案与弹窗',
        expected_result: '页面显示显著提示文案并弹出引导弹窗',
        source: 'ai',
      },
    ],
  };
}

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');

  const view = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UploadPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return {
    ...view,
    invalidateQueriesSpy,
  };
}

async function selectProject(label: string) {
  const selector = await screen.findByLabelText('案例生成项目选择');

  await act(async () => {
    fireEvent.mouseDown(selector);
  });
  await act(async () => {
    fireEvent.click(await screen.findByText(label));
  });
}

async function selectPrompt(label: string) {
  if (!screen.queryByLabelText('案例生成提示词选择')) {
    const progress = screen.getByLabelText('案例生成完整进度侧边栏');
    await act(async () => {
      fireEvent.click(within(progress).getByRole('button', { name: '第3步 选择提示词' }));
    });
  }

  const selector = await screen.findByLabelText('案例生成提示词选择');

  await act(async () => {
    fireEvent.mouseDown(selector);
  });
  await act(async () => {
    fireEvent.click(await screen.findByText(label));
  });

  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /下一步/ }));
  });

  await waitFor(() => {
    expect(screen.getByText('上传需求文档')).toBeInTheDocument();
  });
}

async function clickCurrentStepNext() {
  const operationArea = await screen.findByLabelText('当前步骤操作区');
  await act(async () => {
    fireEvent.click(within(operationArea).getByRole('button', { name: /下一步/ }));
  });
}

async function confirmDefaultTemplateAndPrompt() {
  await clickCurrentStepNext();
  await waitFor(() => {
    expect(screen.getByLabelText('案例生成提示词选择')).toBeInTheDocument();
  });
  await clickCurrentStepNext();
  await waitFor(() => {
    expect(screen.getByRole('heading', { name: '上传需求文档' })).toBeInTheDocument();
  });
}

async function selectReasoning(label: string) {
  const selector = await screen.findByLabelText('案例生成推理强度');

  await act(async () => {
    fireEvent.mouseDown(selector);
  });
  await act(async () => {
    fireEvent.click(await screen.findByText(label));
  });
}

async function uploadRequirementFile(container: HTMLElement, name = 'requirement.docx') {
  const fileInput = container.querySelector('input[type="file"]') ?? document.body.querySelector('input[type="file"]');
  expect(fileInput).not.toBeNull();

  const requirementFile = new File(['docx'], name, {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });

  await act(async () => {
    fireEvent.change(fileInput as Element, { target: { files: [requirementFile] } });
  });

  expect((await screen.findAllByText(name)).length).toBeGreaterThan(0);
  return requirementFile;
}

describe('UploadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    outlineActiveNode.children = [];
    outlineActiveNode.nodeData.data = { text: '资格校验', tag: ['正向'] };
    outlineActiveNode.getData.mockReturnValue({ text: '资格校验', tag: ['正向'] });

    (listProjects as Mock).mockResolvedValue([
      {
        id: 11,
        name: '核心投保项目',
        description: '项目说明',
        mapping_data: null,
        created_at: '2026-03-31 00:00:00',
        updated_at: '2026-03-31 00:00:00',
      },
    ]);

    (listPromptTemplates as Mock).mockResolvedValue([
      {
        id: 1,
        agent_key: 'requirement',
        name: '需求分析师',
        prompt: '优先关注主流程和异常分支',
        created_at: '2026-03-31 00:00:00',
        updated_at: '2026-03-31 00:00:00',
      },
      {
        id: 2,
        agent_key: 'general',
        name: '通用助手',
        prompt: '通用提示词',
        created_at: '2026-03-31 00:00:00',
        updated_at: '2026-03-31 00:00:00',
      },
    ]);

    (listKnowledgeSystemOverviews as Mock).mockResolvedValue([
      {
        id: 31,
        project_id: 11,
        project_name: '核心投保项目',
        title: '核心投保通用模板',
        outline_category: '通用模板',
        description: '模板说明',
        creator_name: '管理员',
        creator_username: 'admin',
        source_format: 'manual',
        source_file_name: null,
        created_at: '2026-03-31 00:00:00',
        updated_at: '2026-03-31 00:00:00',
      },
    ]);

    (getKnowledgeSystemOverview as Mock).mockResolvedValue({
      id: 31,
      project_id: 11,
      project_name: '核心投保项目',
      title: '核心投保通用模板',
      outline_category: '通用模板',
      description: '模板说明',
      creator_name: '管理员',
      creator_username: 'admin',
      source_format: 'manual',
      source_file_name: null,
      created_at: '2026-03-31 00:00:00',
      updated_at: '2026-03-31 00:00:00',
      mind_map_data: {
        layout: 'logicalStructure',
        root: {
          data: { text: '核心投保通用模板', expand: true },
          children: [
            { data: { text: '资格校验', expand: true }, children: [] },
          ],
        },
      },
    });

    (mapFunctionalRequirementForCaseGeneration as Mock).mockResolvedValue({
      success: true,
      data: buildMappingResult(),
    });

    (generateFunctionalTestCases as Mock).mockResolvedValue({
      success: true,
      data: buildGenerationResult(),
    });

    (saveFunctionalCaseGenerationResult as Mock).mockResolvedValue({
      success: true,
      data: {
        id: 99,
        project_id: 11,
        project_name: '核心投保项目',
        requirement_file_name: 'requirement.docx',
        case_name: '投保资格回归案例',
        iteration_version: '2026Q2-S1',
        case_count: 2,
        created_at: '2026-04-19T00:00:00Z',
      },
    });
  });

  it('renders only the current operation module in the step flow', async () => {
    renderWithProviders();

    const operationArea = await screen.findByLabelText('当前步骤操作区');
    expect(within(operationArea).getByText('选择项目')).toBeInTheDocument();
    expect(within(operationArea).queryByText('复用模板')).not.toBeInTheDocument();
    expect(within(operationArea).queryByRole('button', { name: '生成大纲' })).not.toBeInTheDocument();

    await selectProject('核心投保项目');

    await waitFor(() => {
      expect(within(operationArea).getByText('复用模板')).toBeInTheDocument();
    });
    expect(within(operationArea).queryByText('选择项目')).not.toBeInTheDocument();

    await clickCurrentStepNext();
    await waitFor(() => {
      expect(within(operationArea).getByText('选择提示词')).toBeInTheDocument();
    });
    expect(screen.getByTitle('需求分析师（requirement）')).toBeInTheDocument();

    await clickCurrentStepNext();
    await waitFor(() => {
      expect(within(operationArea).getByRole('heading', { name: '上传需求文档' })).toBeInTheDocument();
    });
  });

  it('automatically maps after upload and opens requirement mapping from preview', async () => {
    const { container, invalidateQueriesSpy } = renderWithProviders();

    expect(await screen.findByText('案例生成工作台')).toBeInTheDocument();
    expect(await screen.findByText('测试案例记录')).toBeInTheDocument();

    await selectProject('核心投保项目');
    await confirmDefaultTemplateAndPrompt();
    const requirementFile = await uploadRequirementFile(container);

    expect(screen.queryByRole('button', { name: '映射测试点' })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(mapFunctionalRequirementForCaseGeneration).toHaveBeenCalledWith(
        11,
        'requirement',
        requirementFile,
        '案例生成',
      );
    });

    const generateOutlineButton = screen.getByRole('button', { name: '生成大纲' });
    await waitFor(() => {
      expect(generateOutlineButton).toBeEnabled();
    });

    const mappingButton = screen.getByRole('button', { name: /需求映射/ });
    expect(mappingButton).toBeEnabled();

    await act(async () => {
      fireEvent.click(mappingButton);
    });

    const mappingDialog = await screen.findByRole('dialog');
    expect(within(mappingDialog).getByTestId('mapping-summary')).toBeInTheDocument();
    const mappingSpyCalls = requirementAnalysisViewSpy.mock.calls as unknown as Array<[unknown]>;
    const latestMappingProps = (mappingSpyCalls.at(-1)?.[0] ?? {}) as Record<string, unknown>;
    expect(latestMappingProps.hideAi).toBe(true);
    expect(latestMappingProps.summaryMode).not.toBe(true);

    await act(async () => {
      fireEvent.click(generateOutlineButton);
    });

    await waitFor(() => {
      expect(generateFunctionalTestCases).toHaveBeenCalledWith(
        11,
        'requirement',
        requirementFile,
        expect.objectContaining({
          overview: expect.objectContaining({
            total_requirements: 3,
            matched_requirements: 2,
          }),
        }),
        '案例生成',
        undefined,
      );
    });

    expect(screen.getByText('已生成思维导图大纲。点击“编辑大纲”进入独立画布维护节点、标签、撤销重做和下载；保存后自动返回当前流程。')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /编辑大纲/ }));
    });

    expect(await screen.findByTestId('case-outline-canvas')).toBeInTheDocument();
    expect(screen.getByText('案例生成临时大纲')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /返回案例生成/ })).toBeInTheDocument();
    expect(screen.queryByText('测试案例记录')).not.toBeInTheDocument();
    const latestCanvasProps = knowledgeMindMapCanvasSpy.mock.calls.at(-1)?.[0] as {
      value?: {
        root?: {
          children?: Array<{
            data?: { text?: string };
            children?: Array<unknown>;
          }>;
        };
      };
    };
    type OutlineTestNode = {
      data?: { text?: string; tag?: string[] };
      children?: OutlineTestNode[];
    };
    const firstCaseNode = latestCanvasProps.value?.root?.children?.[0] as OutlineTestNode | undefined;
    expect(firstCaseNode?.data?.text).toBe('TC-001 资格校验失败时禁止提交');
    expect(firstCaseNode?.children?.[0]?.data?.text).toBe('打开投保页面');
    expect(firstCaseNode?.children?.[0]?.children?.[0]?.data?.text).toBe('输入不满足资格条件的数据');
    expect(firstCaseNode?.children?.[0]?.children?.[0]?.children?.[0]?.data?.text).toBe('点击提交');
    expect(firstCaseNode?.children?.[0]?.children?.[0]?.children?.[0]?.children?.[0]?.data).toEqual(
      expect.objectContaining({
        text: '系统阻止提交并提示失败原因',
        tag: expect.arrayContaining(['预期结果']),
      }),
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /保存大纲并返回/ }));
    });

    const finalizeButton = screen.getByRole('button', { name: '生成测试用例' });
    await waitFor(() => {
      expect(finalizeButton).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(finalizeButton);
    });

    expect(await screen.findByText('资格校验失败时禁止提交')).toBeInTheDocument();
    expect(screen.getAllByText((_content, element) => (
      element?.classList.contains('case-generation-table__cell--multiline') === true
      && element.textContent?.includes('1. 打开投保页面') === true
      && element.textContent.includes('2. 输入不满足资格条件的数据')
      && element.textContent.includes('3. 点击提交')
    )).length).toBeGreaterThan(0);
    expect(screen.getByText('系统阻止提交并提示失败原因')).toBeInTheDocument();
    expect(invalidateQueriesSpy).not.toHaveBeenCalled();
  }, 20000);

  it('shows the outline generation transition inside the current step while generating', async () => {
    let resolveGeneration: ((value: unknown) => void) | undefined;
    (generateFunctionalTestCases as Mock).mockReturnValue(new Promise((resolve) => {
      resolveGeneration = resolve;
    }));
    const { container } = renderWithProviders();

    await selectProject('核心投保项目');
    await confirmDefaultTemplateAndPrompt();
    await uploadRequirementFile(container);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '生成大纲' })).toBeEnabled();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成大纲' }));
    });

    const operationArea = screen.getByLabelText('当前步骤操作区');
    await waitFor(() => {
      expect(within(operationArea).getByRole('status')).toHaveTextContent('大纲生成中');
    });

    await act(async () => {
      resolveGeneration?.({
        success: true,
        data: buildGenerationResult(),
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });

  it('remaps automatically and clears generated preview state when prompt changes', async () => {
    const { container } = renderWithProviders();

    await selectProject('核心投保项目');
    await confirmDefaultTemplateAndPrompt();
    const requirementFile = await uploadRequirementFile(container);

    await waitFor(() => {
      expect(mapFunctionalRequirementForCaseGeneration).toHaveBeenCalledWith(
        11,
        'requirement',
        requirementFile,
        '案例生成',
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成大纲' }));
    });
    await waitFor(() => {
      expect(generateFunctionalTestCases).toHaveBeenCalledWith(
        11,
        'requirement',
        requirementFile,
        expect.objectContaining({
          overview: expect.objectContaining({ total_requirements: 3, matched_requirements: 2 }),
        }),
        expect.any(String),
        undefined,
      );
    });
    expect(screen.getByRole('button', { name: /编辑大纲/ })).toBeEnabled();

    await selectPrompt('通用助手（general）');

    await waitFor(() => {
      expect(mapFunctionalRequirementForCaseGeneration).toHaveBeenCalledWith(
        11,
        'general',
        requirementFile,
        '案例生成',
      );
    });
    expect(screen.queryByText('资格校验失败时禁止提交')).not.toBeInTheDocument();
    expect(screen.queryByTestId('case-outline-canvas')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /保存案例/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /需求映射/ })).toBeEnabled();
  }, 15000);

  it('saves preview once and invalidates target list queries only after save', async () => {
    const { container, invalidateQueriesSpy } = renderWithProviders();

    await selectProject('核心投保项目');
    await confirmDefaultTemplateAndPrompt();
    const requirementFile = await uploadRequirementFile(container);

    await waitFor(() => {
      expect(mapFunctionalRequirementForCaseGeneration).toHaveBeenCalledWith(
        11,
        'requirement',
        requirementFile,
        '案例生成',
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成大纲' }));
    });
    await waitFor(() => {
      expect(generateFunctionalTestCases).toHaveBeenCalledWith(
        11,
        'requirement',
        requirementFile,
        expect.objectContaining({
          overview: expect.objectContaining({ total_requirements: 3, matched_requirements: 2 }),
        }),
        expect.any(String),
        undefined,
      );
    });

    expect(invalidateQueriesSpy).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /编辑大纲/ }));
    });

    expect(await screen.findByTestId('case-outline-canvas')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /保存大纲并返回/ }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成测试用例' }));
    });

    expect(await screen.findByText('资格校验失败时禁止提交')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /保存案例/ }));
    });

    expect(screen.getByDisplayValue('核心投保项目')).toHaveAttribute('readonly');
    expect(screen.getByDisplayValue('requirement.docx')).toHaveAttribute('readonly');

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('请输入测试案例名称'), { target: { value: '投保资格回归案例' } });
      fireEvent.change(screen.getByPlaceholderText('请输入迭代版本，例如 2026Q2-S1'), { target: { value: '2026Q2-S1' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '确认保存' }));
    });

    await waitFor(() => {
      expect(saveFunctionalCaseGenerationResult).toHaveBeenCalledWith(expect.objectContaining({
        project_id: 11,
        requirement_file: expect.any(File),
        prompt_template_key: 'requirement',
        requirement_file_name: 'requirement.docx',
        mapping_result_snapshot: expect.objectContaining({
          overview: expect.objectContaining({
            total_requirements: 3,
            matched_requirements: 2,
          }),
        }),
        generation_result_snapshot: expect.objectContaining({
          file_name: 'requirement.docx',
          total: 2,
          cases: expect.arrayContaining([
            expect.objectContaining({ case_id: 'TC-001' }),
          ]),
        }),
        case_name: '投保资格回归案例',
        iteration_version: '2026Q2-S1',
        source_page: '案例生成',
      }));
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['functional-test-case-records'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['config-requirement-documents'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['config-test-case-assets'] });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({ queryKey: ['requirement-analysis-records'] });
    expect(screen.queryByRole('button', { name: '导出用例' })).not.toBeInTheDocument();

    const savedButton = screen.getByRole('button', { name: /已保存/ });
    expect(savedButton).toBeDisabled();

    await act(async () => {
      fireEvent.click(savedButton);
    });
    expect(saveFunctionalCaseGenerationResult).toHaveBeenCalledTimes(1);
  }, 15000);

  it('passes the selected reasoning level to generation when changed from default', async () => {
    const { container } = renderWithProviders();

    await selectReasoning('深度');
    await selectProject('核心投保项目');
    await confirmDefaultTemplateAndPrompt();
    const requirementFile = await uploadRequirementFile(container);

    await waitFor(() => {
      expect(mapFunctionalRequirementForCaseGeneration).toHaveBeenCalledWith(
        11,
        'requirement',
        requirementFile,
        '案例生成',
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '生成大纲' }));
    });

    await waitFor(() => {
      expect(generateFunctionalTestCases).toHaveBeenCalledWith(
        11,
        'requirement',
        requirementFile,
        expect.objectContaining({
          overview: expect.objectContaining({
            total_requirements: 3,
            matched_requirements: 2,
          }),
        }),
        '案例生成',
        'high',
      );
    });
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import CaseQualityPage from './CaseQuality';

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  listPromptTemplates: vi.fn(),
  analyzeRequirement: vi.fn(),
  analyzeWithProject: vi.fn(),
  createCaseQualityRecord: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
}));

import {
  analyzeRequirement,
  analyzeWithProject,
  createCaseQualityRecord,
  listPromptTemplates,
  listProjects,
} from '../utils/api';

(globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CaseQualityPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function selectProject(name: string) {
  fireEvent.mouseDown(await screen.findByRole('combobox'));
  fireEvent.click(await screen.findByText(name));
}

const mappedProject = {
  id: 1,
  name: '项目A',
  description: '核心项目',
  mapping_data: [
    {
      package_name: 'com.example.order',
      class_name: 'OrderService',
      method_name: 'createOrder',
      description: '创建订单',
      test_point: '库存扣减、重复提交、订单落库',
    },
  ],
  created_at: '2026-03-01T00:00:00Z',
  updated_at: '2026-03-02T00:00:00Z',
};

const requirementResult = {
  overview: {
    total_requirements: 4,
    matched_requirements: 3,
    mapping_hit_count: 2,
    unmatched_requirements: 1,
    use_ai: true,
    duration_ms: 420,
  },
  score: {
    total_score: 86,
    grade: 'B',
    summary: '闇€姹傚垎鏋愯川閲忚緝濂',
    dimensions: [
      {
        dimension: '闇€姹傚畬鏁村害',
        score: 90,
        weight: 0.3,
        weighted_score: 27,
        details: '瑕嗙洊杈冨畬鏁',
      },
    ],
  },
  mapping_suggestions: [
    {
      requirement_point_id: 'RP-1',
      section_number: '2.1',
      section_title: '涓嬪崟娴佺▼',
      requirement_text: '鎻愪氦璁㈠崟',
      match_count: 1,
      suggestion: '补充库存不足、重复提交和回滚验证',
    },
  ],
  requirement_hits: [],
  unmatched_requirements: [],
  ai_analysis: null,
  ai_cost: null,
  source_files: {
    project_id: 1,
    project_name: '椤圭洰A',
    requirement_file_name: 'requirement.docx',
    requirement_mapping_available: true,
    requirement_mapping_source_type: 'upload',
    requirement_mapping_file_name: 'mapping.xlsx',
    requirement_mapping_group_count: 3,
    requirement_mapping_updated_at: '2026-03-22T10:00:00',
  },
  record_id: 1001,
};

const caseResult = {
  record_id: 2001,
  diff_analysis: {
    total_files: 1,
    total_added: 10,
    total_removed: 2,
    files: [{ package: 'src/pages/Upload.tsx', added: 10, removed: 2 }],
  },
  coverage: {
    total_changed_methods: 1,
    covered: ['com.example.order.OrderService.createOrder'],
    uncovered: [],
    coverage_rate: 1,
    details: [{
      method: 'com.example.order.OrderService.createOrder',
      description: '创建订单',
      is_covered: true,
      matched_tests: ['TC-001'],
    }],
  },
  score: {
    total_score: 92,
    grade: 'A',
    summary: '妗堜緥璐ㄩ噺浼樼',
    dimensions: [{
      dimension: '瑕嗙洊鐜',
      score: 92,
      weight: 1,
      weighted_score: 92,
      details: '瑕嗙洊鍏呭垎',
    }],
  },
  test_case_count: 12,
  ai_analysis: null,
  ai_cost: null,
  duration_ms: 530,
};

const aiTestAdvice = {
  provider: 'DeepSeek',
  enabled: true,
  summary: '建议优先补齐高风险需求点与关键变更方法的回归验证。',
  overall_assessment: '优先补齐高风险回归',
  must_test: [
    {
      title: '补测订单提交主链路',
      priority: 'P0' as const,
      reason: '需求命中下单核心场景，且属于主要交易路径。',
      evidence: 'RP-1 命中下单流程，createOrder 为当前变更方法。',
      requirement_ids: ['RP-1'],
      methods: ['com.example.order.OrderService.createOrder'],
      test_focus: '验证库存扣减、重复提交与订单落库。',
      expected_risk: '下单主链路可能出现幂等或库存处理回归。',
    },
  ],
  should_test: [
    {
      title: '补充异常流与边界输入',
      priority: 'P1' as const,
      reason: '规则建议已经提示需要扩展异常场景。',
      evidence: '需求映射建议明确要求补充库存不足、重复提交和回滚验证。',
      requirement_ids: ['RP-1'],
      methods: [],
      test_focus: '补充库存不足、重复提交与回滚边界。',
      expected_risk: '异常分支遗漏会导致交易失败场景漏测。',
    },
  ],
  regression_scope: ['下单流程', '库存校验'],
  missing_information: ['缺少最近一次线上缺陷数据'],
};

describe('CaseQualityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listPromptTemplates as Mock).mockResolvedValue([]);
  });

  it('shows test suggestions on the report step', async () => {
    (listProjects as Mock).mockResolvedValue([mappedProject]);
    (analyzeRequirement as Mock).mockResolvedValue({ success: true, data: requirementResult });
    (analyzeWithProject as Mock).mockResolvedValue({ success: true, data: caseResult });
    (createCaseQualityRecord as Mock).mockResolvedValue({
      id: 3001,
      project_id: 1,
      project_name: '项目A',
      requirement_analysis_record_id: 1001,
      analysis_record_id: 2001,
      requirement_file_name: 'requirement.docx',
      code_changes_file_name: 'changes.json',
      test_cases_file_name: 'cases.csv',
      requirement_score: 86,
      case_score: 92,
      total_token_usage: 0,
      total_cost: 0,
      total_duration_ms: 950,
      requirement_section_snapshot: null,
      requirement_result_snapshot: requirementResult,
      case_result_snapshot: caseResult,
      combined_result_snapshot: {
        overview: {
          project_id: 1,
          project_name: '项目A',
          requirement_analysis_record_id: 1001,
          analysis_record_id: 2001,
          requirement_score: 86,
          case_score: 92,
          total_token_usage: 0,
          total_cost: 0,
          total_duration_ms: 950,
        },
        ai_test_advice: aiTestAdvice,
      },
      created_at: '2026-03-22T10:00:00Z',
    });

    renderWithProviders();

    const flow = await screen.findByLabelText('案例质检流程');
    const operationArea = screen.getByLabelText('当前步骤操作区');

    await selectProject('项目A');

    const requirementInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(requirementInput, {
        target: {
          files: [new File(['docx'], 'requirement.docx', { type: 'application/msword' })],
        },
      });
    });

    fireEvent.click(within(operationArea).getByRole('button', { name: '开始需求分析' }));
    await waitFor(() => {
      expect(analyzeRequirement).toHaveBeenCalledWith(1, expect.any(File), true, undefined, '案例质检');
    });

    fireEvent.click(within(flow).getByRole('button', { name: '第2步 需求分析' }));
    expect(within(operationArea).queryByText('需求分析概览')).not.toBeInTheDocument();
    expect(within(operationArea).queryByRole('button', { name: '查看详情' })).not.toBeInTheDocument();
    expect(screen.queryByText('需求分析详情')).not.toBeInTheDocument();

    fireEvent.click(within(flow).getByRole('button', { name: '第3步 案例分析' }));
    const caseUploadInputs = Array.from(operationArea.querySelectorAll('input[type="file"]')) as HTMLInputElement[];

    await act(async () => {
      fireEvent.change(caseUploadInputs[0], {
        target: { files: [new File(['{}'], 'changes.json', { type: 'application/json' })] },
      });
      fireEvent.change(caseUploadInputs[1], {
        target: { files: [new File(['id,name'], 'cases.csv', { type: 'text/csv' })] },
      });
    });

    fireEvent.click(within(operationArea).getByRole('button', { name: '开始案例分析' }));

    await waitFor(() => {
      expect(analyzeWithProject).toHaveBeenCalledWith(
        1,
        expect.any(File),
        expect.any(File),
        undefined,
        true,
        undefined,
        '案例质检',
      );
      expect(createCaseQualityRecord).toHaveBeenCalledWith({
        project_id: 1,
        requirement_analysis_record_id: 1001,
        analysis_record_id: 2001,
        code_changes_file_name: 'changes.json',
        test_cases_file_name: 'cases.csv',
        use_ai: true,
      });
    });

    expect(listPromptTemplates).not.toHaveBeenCalled();

    expect(within(flow).getByRole('button', { name: '第4步 汇总报告' })).toHaveAttribute('aria-current', 'step');
    expect(screen.getAllByText('AI 测试意见')).toHaveLength(1);
    expect(screen.getByText('必测项与补测项')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader', { name: '类型' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('columnheader', { name: '依据说明' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('补测订单提交主链路').length).toBeGreaterThan(0);
    expect(screen.getAllByText('建议回归范围').length).toBeGreaterThan(0);
    expect(screen.getAllByText('下单流程').length).toBeGreaterThan(0);
    expect(screen.getByText('测试建议')).toBeInTheDocument();
    expect(screen.getAllByText('需求映射建议').length).toBeGreaterThan(0);
    expect(screen.getByText('代码映射建议')).toBeInTheDocument();
    expect(screen.getAllByText((content) => content.includes('补充库存不足、重复提交和回滚验证')).length).toBeGreaterThan(0);
    expect(screen.getAllByText((_, node) => node?.textContent === 'com.example.order.OrderService.createOrder').length).toBeGreaterThan(0);
    expect(screen.getByText('测试点：库存扣减、重复提交、订单落库')).toBeInTheDocument();
    expect(screen.getByText('需求分析部分')).toBeInTheDocument();
    expect(screen.getByText('案例分析部分')).toBeInTheDocument();

    fireEvent.click(within(flow).getByRole('button', { name: '第3步 案例分析' }));
    expect(within(operationArea).queryByText('案例分析结果')).not.toBeInTheDocument();
    expect(screen.queryByText('需求分析部分')).not.toBeInTheDocument();
    expect(screen.queryByText('案例分析部分')).not.toBeInTheDocument();
  }, 10000);

  it('stops calling AI when the page AI switch is turned off', async () => {
    (listProjects as Mock).mockResolvedValue([mappedProject]);
    (analyzeRequirement as Mock).mockResolvedValue({ success: true, data: requirementResult });
    (analyzeWithProject as Mock).mockResolvedValue({ success: true, data: caseResult });
    (createCaseQualityRecord as Mock).mockResolvedValue({
      id: 3002,
      project_id: 1,
      project_name: '项目A',
      requirement_analysis_record_id: 1001,
      analysis_record_id: 2001,
      requirement_file_name: 'requirement.docx',
      code_changes_file_name: 'changes.json',
      test_cases_file_name: 'cases.csv',
      requirement_score: 86,
      case_score: 92,
      total_token_usage: 0,
      total_cost: 0,
      total_duration_ms: 950,
      requirement_section_snapshot: null,
      requirement_result_snapshot: requirementResult,
      case_result_snapshot: caseResult,
      combined_result_snapshot: {
        overview: {
          project_id: 1,
          project_name: '项目A',
          requirement_analysis_record_id: 1001,
          analysis_record_id: 2001,
          requirement_score: 86,
          case_score: 92,
          total_token_usage: 0,
          total_cost: 0,
          total_duration_ms: 950,
        },
        ai_test_advice: {
          provider: 'DeepSeek',
          enabled: false,
          must_test: [],
          should_test: [],
          regression_scope: [],
          missing_information: [],
          error: '案例质检已关闭 AI，本次不会调用 AI 生成测试建议。',
        },
      },
      created_at: '2026-03-22T10:00:00Z',
    });

    renderWithProviders();

    const aiSwitch = await screen.findByRole('switch');
    fireEvent.click(aiSwitch);
    expect(aiSwitch).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('关闭后不调用 AI')).toBeInTheDocument();

    const operationArea = screen.getByLabelText('当前步骤操作区');

    await selectProject('项目A');

    const requirementInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(requirementInput, {
        target: {
          files: [new File(['docx'], 'requirement.docx', { type: 'application/msword' })],
        },
      });
    });

    fireEvent.click(within(operationArea).getByRole('button', { name: '开始需求分析' }));
    await waitFor(() => {
      expect(analyzeRequirement).toHaveBeenCalledWith(1, expect.any(File), false, undefined, '案例质检');
    });

    const caseUploadInputs = Array.from(operationArea.querySelectorAll('input[type="file"]')) as HTMLInputElement[];

    await act(async () => {
      fireEvent.change(caseUploadInputs[0], {
        target: { files: [new File(['{}'], 'changes.json', { type: 'application/json' })] },
      });
      fireEvent.change(caseUploadInputs[1], {
        target: { files: [new File(['id,name'], 'cases.csv', { type: 'text/csv' })] },
      });
    });

    fireEvent.click(within(operationArea).getByRole('button', { name: '开始案例分析' }));

    await waitFor(() => {
      expect(analyzeWithProject).toHaveBeenCalledWith(
        1,
        expect.any(File),
        expect.any(File),
        undefined,
        false,
        undefined,
        '案例质检',
      );
      expect(createCaseQualityRecord).toHaveBeenCalledWith({
        project_id: 1,
        requirement_analysis_record_id: 1001,
        analysis_record_id: 2001,
        code_changes_file_name: 'changes.json',
        test_cases_file_name: 'cases.csv',
        use_ai: false,
      });
    });
  }, 10000);

  it('still disables case analysis when project has no mapping', async () => {
    (listProjects as Mock).mockResolvedValue([
      {
        id: 2,
        name: '项目B',
        description: '无映射项目',
        mapping_data: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-02T00:00:00Z',
      },
    ]);
    (analyzeRequirement as Mock).mockResolvedValue({
      success: true,
      data: {
        ...requirementResult,
        record_id: 1002,
      },
    });

    renderWithProviders();

    const flow = await screen.findByLabelText('案例质检流程');
    await selectProject('项目B');
    const operationArea = screen.getByLabelText('当前步骤操作区');
    fireEvent.click(within(flow).getByRole('button', { name: '第2步 需求分析' }));
    const requirementInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(requirementInput, {
        target: {
          files: [new File(['docx'], 'requirement.docx', { type: 'application/msword' })],
        },
      });
    });

    fireEvent.click(within(operationArea).getByRole('button', { name: '开始需求分析' }));
    await waitFor(() => {
      expect(analyzeRequirement).toHaveBeenCalledWith(2, expect.any(File), true, undefined, '案例质检');
    });

    const caseUploadInputs = Array.from(operationArea.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
    await act(async () => {
      fireEvent.change(caseUploadInputs[0], {
        target: { files: [new File(['{}'], 'changes.json', { type: 'application/json' })] },
      });
      fireEvent.change(caseUploadInputs[1], {
        target: { files: [new File(['id,name'], 'cases.csv', { type: 'text/csv' })] },
      });
    });

    expect(within(operationArea).getByRole('button', { name: '开始案例分析' })).toBeDisabled();
    expect(listPromptTemplates).not.toHaveBeenCalled();
  }, 10000);
});

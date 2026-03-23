import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import CaseQualityPage from './CaseQuality';

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  analyzeRequirement: vi.fn(),
  analyzeWithProject: vi.fn(),
  createCaseQualityRecord: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
}));

import {
  analyzeRequirement,
  analyzeWithProject,
  createCaseQualityRecord,
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
      package_name: 'com.example.user',
      class_name: 'UserService',
      method_name: 'createUser',
      description: '创建用户',
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
    summary: '需求分析质量较好',
    dimensions: [
      {
        dimension: '需求完整度',
        score: 90,
        weight: 0.3,
        weighted_score: 27,
        details: '覆盖较完整',
      },
    ],
  },
  mapping_suggestions: [],
  requirement_hits: [],
  unmatched_requirements: [],
  ai_analysis: null,
  ai_cost: null,
  source_files: {
    project_id: 1,
    project_name: '项目A',
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
    covered: ['A.B.C'],
    uncovered: [],
    coverage_rate: 1,
    details: [{
      method: 'A.B.C',
      description: '流程主路径',
      is_covered: true,
      matched_tests: ['TC-001'],
    }],
  },
  score: {
    total_score: 92,
    grade: 'A',
    summary: '案例质量优秀',
    dimensions: [{
      dimension: '覆盖率',
      score: 92,
      weight: 1,
      weighted_score: 92,
      details: '覆盖充分',
    }],
  },
  test_case_count: 12,
  ai_analysis: null,
  ai_cost: null,
  duration_ms: 530,
};

describe('CaseQualityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the step rail, auto advances the workflow, and hides stats on the report step', async () => {
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
      combined_result_snapshot: null,
      created_at: '2026-03-22T10:00:00Z',
    });

    renderWithProviders();

    expect(await screen.findByText('案例质检工作台')).toBeInTheDocument();
    const flow = screen.getByLabelText('案例质检流程');
    const operationArea = screen.getByLabelText('当前步骤操作区');

    expect(within(flow).getByRole('button', { name: '第1步 项目选择' })).toHaveAttribute('aria-current', 'step');
    expect(within(operationArea).getByText('当前映射状态')).toBeInTheDocument();
    expect(screen.getByText('本月统计')).toBeInTheDocument();
    expect(screen.queryByText('开始需求分析')).not.toBeInTheDocument();

    await selectProject('项目A');

    expect(within(flow).getByRole('button', { name: '第2步 需求分析' })).toHaveAttribute('aria-current', 'step');
    expect(within(operationArea).getByRole('button', { name: '开始需求分析' })).toBeInTheDocument();
    expect(within(operationArea).queryByText('上传需求文档并生成需求概览，确认命中与风险后再进入案例分析。')).not.toBeInTheDocument();
    expect(within(operationArea).queryByText('执行条件')).not.toBeInTheDocument();

    const requirementInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(requirementInput, {
        target: {
          files: [new File(['docx'], 'requirement.docx', { type: 'application/msword' })],
        },
      });
    });

    fireEvent.click(within(operationArea).getByRole('button', { name: '开始需求分析' }));
    await waitFor(() => expect(analyzeRequirement).toHaveBeenCalled());

    expect(within(flow).getByRole('button', { name: '第3步 案例分析' })).toHaveAttribute('aria-current', 'step');
    expect(within(operationArea).getByText('代码改动 JSON')).toBeInTheDocument();
    fireEvent.mouseEnter(within(operationArea).getByRole('button', { name: '测试用例 CSV / Excel说明' }));
    expect(await screen.findByText('支持真实 Excel 模板（首行说明、第二行表头）和旧简化模板。')).toBeInTheDocument();
    expect(within(operationArea).queryByText('上传代码改动与测试用例，结合项目映射输出覆盖、评分和综合记录。')).not.toBeInTheDocument();
    expect(within(operationArea).queryByText('执行条件')).not.toBeInTheDocument();

    fireEvent.click(within(flow).getByRole('button', { name: '第2步 需求分析' }));
    expect(within(operationArea).getByText('需求分析概览')).toBeInTheDocument();

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
      expect(analyzeWithProject).toHaveBeenCalled();
      expect(createCaseQualityRecord).toHaveBeenCalledWith({
        project_id: 1,
        requirement_analysis_record_id: 1001,
        analysis_record_id: 2001,
        code_changes_file_name: 'changes.json',
        test_cases_file_name: 'cases.csv',
      });
    });

    expect(within(flow).getByRole('button', { name: '第4步 汇总报告' })).toHaveAttribute('aria-current', 'step');
    expect(screen.queryByText('本月统计')).not.toBeInTheDocument();
    expect(within(operationArea).queryByText('综合记录概览')).not.toBeInTheDocument();
    expect(within(operationArea).getByText('案例得分')).toBeInTheDocument();
    expect(within(operationArea).getByText('案例数')).toBeInTheDocument();
    expect(within(operationArea).getByText('映射命中数')).toBeInTheDocument();
    expect(within(operationArea).getByText('改动方法')).toBeInTheDocument();
    expect(screen.getAllByText('案例得分')).toHaveLength(1);
    expect(screen.getByText('需求分析部分')).toBeInTheDocument();
    expect(screen.getByText('案例分析部分')).toBeInTheDocument();
    expect(screen.queryByText('逐条命中明细')).not.toBeInTheDocument();
  }, 10000);

  it('supports single-card upload replacement and removal without leaving duplicate summaries', async () => {
    (listProjects as Mock).mockResolvedValue([mappedProject]);
    (analyzeRequirement as Mock).mockResolvedValue({ success: true, data: requirementResult });

    renderWithProviders();
    const flow = await screen.findByLabelText('案例质检流程');
    const operationArea = screen.getByLabelText('当前步骤操作区');
    const step1Button = within(flow).getByRole('button', { name: '第1步 项目选择' });
    const step2Button = within(flow).getByRole('button', { name: '第2步 需求分析' });
    const step3Button = within(flow).getByRole('button', { name: '第3步 案例分析' });
    const step4Button = within(flow).getByRole('button', { name: '第4步 汇总报告' });

    expect(step3Button).toBeDisabled();
    expect(step4Button).toBeDisabled();

    await selectProject('项目A');
    expect(step2Button).not.toBeDisabled();
    expect(step3Button).toBeDisabled();

    fireEvent.click(step1Button);
    expect(within(operationArea).getByText('当前映射状态')).toBeInTheDocument();

    fireEvent.click(step2Button);
    expect(within(operationArea).getByRole('button', { name: '开始需求分析' })).toBeInTheDocument();

    const requirementInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(requirementInput, {
        target: {
          files: [new File(['docx'], 'requirement.docx', { type: 'application/msword' })],
        },
      });
    });

    expect(within(operationArea).getByText('requirement.docx')).toBeInTheDocument();
    expect(within(operationArea).getAllByRole('button', { name: '重新上传' })).toHaveLength(1);
    expect(within(operationArea).getAllByRole('button', { name: /移\s*除/ })).toHaveLength(1);

    const requirementReplaceInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(requirementReplaceInput, {
        target: {
          files: [new File(['docx-v2'], 'requirement-v2.docx', { type: 'application/msword' })],
        },
      });
    });

    expect(within(operationArea).getByText('requirement-v2.docx')).toBeInTheDocument();
    expect(within(operationArea).queryByText('requirement.docx')).not.toBeInTheDocument();

    fireEvent.click(within(operationArea).getByRole('button', { name: /移\s*除/ }));
    expect(within(operationArea).queryByText('requirement-v2.docx')).not.toBeInTheDocument();
    expect(within(operationArea).getByText('点击或拖拽上传')).toBeInTheDocument();
    expect(within(operationArea).getByRole('button', { name: '开始需求分析' })).toBeDisabled();

    const requirementReAddInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(requirementReAddInput, {
        target: {
          files: [new File(['docx-v3'], 'requirement-v3.docx', { type: 'application/msword' })],
        },
      });
    });

    expect(within(operationArea).getByText('requirement-v3.docx')).toBeInTheDocument();

    fireEvent.click(within(operationArea).getByRole('button', { name: '开始需求分析' }));
    await waitFor(() => expect(analyzeRequirement).toHaveBeenCalled());

    expect(step3Button).not.toBeDisabled();
    expect(step4Button).toBeDisabled();

    const caseUploadInputs = Array.from(operationArea.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
    await act(async () => {
      fireEvent.change(caseUploadInputs[0], {
        target: { files: [new File(['{}'], 'changes.json', { type: 'application/json' })] },
      });
      fireEvent.change(caseUploadInputs[1], {
        target: { files: [new File(['id,name'], 'cases.csv', { type: 'text/csv' })] },
      });
    });

    expect(within(operationArea).getByText('changes.json')).toBeInTheDocument();
    expect(within(operationArea).getByText('cases.csv')).toBeInTheDocument();
    expect(within(operationArea).getAllByRole('button', { name: '重新上传' })).toHaveLength(2);
    expect(within(operationArea).getAllByRole('button', { name: /移\s*除/ })).toHaveLength(2);

    fireEvent.click(within(operationArea).getAllByRole('button', { name: /移\s*除/ })[0]);
    expect(within(operationArea).queryByText('changes.json')).not.toBeInTheDocument();
    expect(within(operationArea).getByText('cases.csv')).toBeInTheDocument();
    expect(within(operationArea).getByRole('button', { name: '开始案例分析' })).toBeDisabled();
  }, 10000);

  it('disables case analysis when selected project has no mapping', async () => {
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

    await selectProject('项目B');
    const operationArea = screen.getByLabelText('当前步骤操作区');

    const requirementInput = operationArea.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(requirementInput, {
        target: {
          files: [new File(['docx'], 'requirement.docx', { type: 'application/msword' })],
        },
      });
    });

    fireEvent.click(within(operationArea).getByRole('button', { name: '开始需求分析' }));
    await waitFor(() => expect(analyzeRequirement).toHaveBeenCalled());

    expect(await screen.findByText('当前项目未配置代码映射，无法执行案例分析')).toBeInTheDocument();

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
  }, 10000);
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RequirementAnalysisPage from './RequirementAnalysis';

vi.mock('../utils/api', () => ({
  analyzeRequirement: vi.fn(),
  extractApiErrorMessage: vi.fn(() => '需求分析失败'),
  listProductionIssueFiles: vi.fn(),
  listProjects: vi.fn(),
  listTestIssueFiles: vi.fn(),
}));

import {
  analyzeRequirement,
  listProductionIssueFiles,
  listProjects,
  listTestIssueFiles,
} from '../utils/api';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const scrollIntoViewMock = vi.fn();

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RequirementAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
      value: scrollIntoViewMock,
      configurable: true,
      writable: true,
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(0), 0);
    });
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
      window.clearTimeout(handle);
    });

    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '回家活动项目',
        description: '',
        mapping_data: null,
        created_at: '2026-03-08 10:00:00',
        updated_at: '2026-03-08 10:00:00',
      },
    ]);
    (listProductionIssueFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 11,
        file_name: 'prod.csv',
        file_type: 'csv',
        file_size: 1024,
        row_count: 1,
        created_at: '2026-03-08 10:00:00',
      },
    ]);
    (listTestIssueFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 22,
        project_id: 1,
        project_name: '回家活动项目',
        file_name: 'defect.csv',
        file_type: 'csv',
        file_size: 2048,
        row_count: 1,
        created_at: '2026-03-08 10:00:00',
      },
    ]);
    (analyzeRequirement as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        overview: {
          total_requirements: 2,
          matched_requirements: 1,
          production_hit_count: 1,
          test_hit_count: 1,
          unmatched_requirements: 1,
          use_ai: true,
          duration_ms: 500,
        },
        production_alerts: [
          {
            requirement_point_id: '4.1-1',
            section_number: '4.1',
            section_title: '功能描述',
            requirement_text: '需要补充资格校验',
            match_count: 1,
            alert: '重点关注资格校验遗漏和异常提示是否一致。',
          },
        ],
        test_suggestions: [
          {
            requirement_point_id: '4.1-1',
            section_number: '4.1',
            section_title: '功能描述',
            requirement_text: '需要补充资格校验',
            match_count: 1,
            suggestion: '补充资格校验正常流、失败流和边界条件测试。',
          },
        ],
        requirement_hits: [
          {
            point_id: '4.1-1',
            section_number: '4.1',
            section_title: '功能描述',
            text: '需要补充资格校验',
            production_alert: '重点关注资格校验遗漏和异常提示是否一致。',
            test_suggestion: '补充资格校验正常流、失败流和边界条件测试。',
            production_matches: [
              {
                row_id: 1,
                field: '发生原因总结',
                matched_keyword: '资格校验遗漏',
                requirement_excerpt: '需要补充资格校验',
                source_excerpt: '资格校验遗漏',
              },
            ],
            test_matches: [
              {
                row_id: 1,
                defect_id: 'BUG-001',
                defect_summary: '资格校验缺失',
                field: '测试项',
                matched_keyword: '资格校验',
                requirement_excerpt: '需要补充资格校验',
                source_excerpt: '资格校验',
              },
            ],
          },
        ],
        unmatched_requirements: [
          {
            point_id: '4.4-1',
            section_number: '4.4',
            section_title: '界面',
            text: '增加页面提示文案',
          },
        ],
        ai_analysis: {
          provider: 'DeepSeek',
          enabled: true,
          summary: '资格校验相关需求同时命中生产问题和测试问题，建议优先安排高风险回归。',
          overall_assessment: '资格校验场景为高风险',
          key_findings: [
            '历史问题集中在资格校验遗漏，说明该场景易反复出错。',
            '测试问题也命中了同类校验点，需补足失败提示和边界用例。',
          ],
          risk_table: [
            {
              requirement_point_id: '4.1-1',
              risk_level: '高',
              risk_reason: '同时命中生产问题与测试问题，历史信号重叠。',
              test_focus: '优先验证资格校验主流程、异常流和提示文案。',
            },
          ],
        },
        ai_cost: {
          input_cost: 0.0001,
          output_cost: 0.0001,
          total_cost: 0.0002,
          total_tokens: 120,
        },
        source_files: {
          project_id: 1,
          project_name: '回家活动项目',
          requirement_file_name: 'requirement.docx',
          production_issue_file_id: 11,
          production_issue_file_name: 'prod.csv',
          test_issue_file_id: 22,
          test_issue_file_name: 'defect.csv',
        },
        record_id: 9,
      },
    });
  });

  it('submits project and document, then scrolls to the optimized result area', async () => {
    const { container } = renderWithProviders(<RequirementAnalysisPage />);

    expect(await screen.findByText('需求分析')).toBeInTheDocument();
    expect(screen.getByText('分析时会自动取数')).toBeInTheDocument();
    expect(screen.queryByText('2. 全局生产问题文件')).not.toBeInTheDocument();
    expect(screen.queryByText('3. 项目测试问题文件')).not.toBeInTheDocument();

    const selectors = await screen.findAllByRole('combobox');
    fireEvent.mouseDown(selectors[0]);
    fireEvent.click(await screen.findByText('回家活动项目'));

    await waitFor(() => {
      expect(listTestIssueFiles).toHaveBeenCalledWith(1);
    });

    const input = (container.querySelector('input[type="file"]')
      || document.querySelector('input[type="file"]')) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    const file = new File(['docx'], 'requirement.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    fireEvent.click(screen.getByText('开始分析'));

    await waitFor(() => {
      expect(analyzeRequirement).toHaveBeenCalledWith(1, file, true);
    });

    expect(await screen.findByText('分析结果')).toBeInTheDocument();
    expect(screen.getByText('风险等级矩阵')).toBeInTheDocument();
    expect(screen.getByText('高风险')).toBeInTheDocument();
    expect(screen.getByText('资格校验场景为高风险')).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    });
  });
});

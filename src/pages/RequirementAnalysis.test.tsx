import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import RequirementAnalysisPage from './RequirementAnalysis';

vi.mock('../utils/api', () => ({
  analyzeRequirement: vi.fn(),
  extractApiErrorMessage: vi.fn(() => '需求分析失败'),
  getRequirementMapping: vi.fn(),
  listPromptTemplates: vi.fn(),
  listProjects: vi.fn(),
}));

import {
  analyzeRequirement,
  getRequirementMapping,
  listPromptTemplates,
  listProjects,
} from '../utils/api';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

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

    (getRequirementMapping as ReturnType<typeof vi.fn>).mockResolvedValue({
      project_id: 1,
      project_name: '回家活动项目',
      source_type: 'upload',
      last_file_name: 'mapping.xlsx',
      last_file_type: 'xlsx',
      sheet_name: 'Sheet1',
      group_count: 2,
      row_count: 4,
      groups: [],
      rows: [],
      created_at: '2026-03-08 10:00:00',
      updated_at: '2026-03-08 10:00:00',
    });
    (listPromptTemplates as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    (analyzeRequirement as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        overview: {
          total_requirements: 2,
          matched_requirements: 1,
          mapping_hit_count: 1,
          unmatched_requirements: 1,
          use_ai: true,
          duration_ms: 500,
        },
        mapping_suggestions: [
          {
            requirement_point_id: '4.1-1',
            section_number: '4.1',
            section_title: '功能描述',
            requirement_text: '需要补充新增页面验证',
            match_count: 1,
            suggestion: '覆盖页面新增关联场景',
          },
        ],
        requirement_hits: [
          {
            point_id: '4.1-1',
            section_number: '4.1',
            section_title: '功能描述',
            text: '需要补充新增页面验证',
            mapping_suggestion: '覆盖页面新增关联场景',
            mapping_matches: [
              {
                group_id: 'group-1',
                tag: '页面新增',
                requirement_keyword: '新增页面',
                matched_requirement_keyword: '新增页面',
                matched_scenarios: [],
                related_scenarios: ['兼容性测试', '跳转链路'],
                additional_scenarios: ['兼容性测试', '跳转链路'],
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
          summary: '新增页面需求命中需求映射关系，建议补齐同组关联场景回归。',
          overall_assessment: '映射扩展场景需要重点回归，优先校验页面兼容性与跳转链路。',
          key_findings: [
            '新增页面命中后，需要补齐同组关联场景。',
            '建议优先验证兼容性测试和跳转链路。',
          ],
          risk_table: [
            {
              requirement_point_id: '4.1-1',
              risk_level: '高',
              risk_reason: '命中需求映射后，需要扩展到整组关联场景。',
              test_focus: '优先验证兼容性测试和跳转链路。',
            },
          ],
        },
        ai_cost: {
          total_tokens: 120,
        },
        source_files: {
          project_id: 1,
          project_name: '回家活动项目',
          requirement_file_name: 'requirement.docx',
          requirement_mapping_available: true,
          requirement_mapping_source_type: 'upload',
          requirement_mapping_file_name: 'mapping.xlsx',
          requirement_mapping_group_count: 2,
          requirement_mapping_updated_at: '2026-03-08 10:00:00',
        },
        record_id: 9,
      },
    });
  });

  it('submits project and document, then renders the optimized report area', async () => {
    const { container } = renderWithProviders(<RequirementAnalysisPage />);

    expect(await screen.findByText('需求分析工作台')).toBeInTheDocument();
    expect(screen.getByText('项目选择')).toBeInTheDocument();
    expect(screen.getByText('文件上传')).toBeInTheDocument();
    expect(screen.queryByText('支持标准 Word 需求文档，建议优先使用 .docx')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.mouseEnter(screen.getByRole('button', { name: '需求文档上传说明' }));
    });
    expect(await screen.findByText('支持标准 Word 需求文档，建议优先使用 .docx')).toBeInTheDocument();

    const selectors = await screen.findAllByRole('combobox');
    fireEvent.mouseDown(selectors[0]);
    fireEvent.click(await screen.findByText('回家活动项目'));

    await waitFor(() => {
      expect(getRequirementMapping).toHaveBeenCalledWith(1);
    });

    const input = (container.querySelector('input[type="file"]')
      || document.querySelector('input[type="file"]')) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    const file = new File(['docx'], 'requirement.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: /开始智能解析/ }));

    await waitFor(() => {
      expect(analyzeRequirement).toHaveBeenCalledWith(1, file, true, undefined, '需求分析');
    });

    expect(await screen.findByText('需求分析报告详情')).toBeInTheDocument();
    expect(screen.getByText('风险等级矩阵')).toBeInTheDocument();
    expect(screen.getByText('需求映射建议')).toBeInTheDocument();
    expect(screen.getByText('查看详情')).toBeInTheDocument();
    expect(screen.queryByText('未命中需求点')).not.toBeInTheDocument();
    expect(screen.queryByText('生产问题注意点')).not.toBeInTheDocument();
    expect(screen.queryByText('测试建议')).not.toBeInTheDocument();
  }, 15000);
});

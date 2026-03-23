import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import IssueAnalysisPage from './IssueAnalysis';

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echart" />,
}));

vi.mock('../utils/api', () => ({
  listProductionIssueFiles: vi.fn(),
  getProductionIssueAnalysis: vi.fn(),
}));

import {
  getProductionIssueAnalysis,
  listProductionIssueFiles,
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

function buildAnalysisResponse() {
  return {
    success: true,
    data: {
      overview: {
        total_records: 2,
        stage_count: 2,
        tag_count: 2,
        human_related_count: 1,
        human_related_ratio: 0.5,
        top_stage: { name: '需求阶段', count: 1, ratio: 0.5 },
        top_tag: { name: '需求', count: 1, ratio: 0.5 },
      },
      summary: {
        headline: '问题主要集中在“需求阶段”，人为因素占比 50%。',
        key_findings: ['共导入 2 条问题记录，覆盖 2 个发生阶段。'],
        recommended_actions: ['优先推进“补充评审清单”专项治理。'],
      },
      charts: {
        stage_distribution: [{ name: '需求阶段', count: 1, ratio: 0.5 }],
        human_factor_distribution: [{ name: '人为原因', count: 1, ratio: 0.5 }],
        tag_distribution: [{ name: '需求', count: 1, ratio: 0.5 }],
        issue_reason_distribution: [{ name: '需求评审不足', count: 1, ratio: 0.5 }],
        reason_summary_distribution: [{ name: '需求澄清不足', count: 1, ratio: 0.5 }],
        action_distribution: [{ name: '补充评审清单', count: 1, ratio: 0.5 }],
        stage_human_matrix: [
          { stage: '需求阶段', human: 1, non_human: 0, unknown: 0, total: 1 },
        ],
      },
      preview_rows: [
        {
          row_id: 1,
          出现该问题的原因: '需求评审不足',
          改善举措: '补充评审清单',
          发生阶段: '需求阶段',
          是否人为原因: '人为原因',
          发生原因总结: '需求澄清不足',
          标签: '需求',
          责任部门: '研发一部',
        },
      ],
    },
  };
}

describe('IssueAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listProductionIssueFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        file_name: 'issue-old.xlsx',
        file_type: 'excel',
        file_size: 1024,
        row_count: 2,
        created_at: '2026-03-08 12:00:00',
      },
      {
        id: 2,
        file_name: 'issue-latest.xlsx',
        file_type: 'excel',
        file_size: 2048,
        row_count: 3,
        created_at: '2026-03-08 13:00:00',
      },
    ]);
    (getProductionIssueAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue(buildAnalysisResponse());
  });

  it('renders compact first screen and latest file summary', async () => {
    renderWithProviders(<IssueAnalysisPage />);

    expect(await screen.findByText('生产问题分析')).toBeInTheDocument();
    expect(await screen.findByText(/当前文件：issue-latest\.xlsx/)).toBeInTheDocument();
    expect(await screen.findByText('质量热区')).toBeInTheDocument();
    expect(await screen.findByText('问题结构分布')).toBeInTheDocument();
    expect((await screen.findAllByText('导入明细列表')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('高频阶段').length).toBe(1);
    expect(screen.getAllByText('高频标签').length).toBe(1);
    expect(screen.queryByText('数据来源文件')).not.toBeInTheDocument();
    expect(screen.queryByText('运行侧舱')).not.toBeInTheDocument();
    expect(screen.queryByText('本次结论')).not.toBeInTheDocument();
    expect(screen.queryByText('数据看板 / 生产问题分析')).not.toBeInTheDocument();
    expect(screen.queryByText('将已上传的生产问题文件自动编排成沉浸式玻璃看板，聚焦阶段分布、标签热点、原因结构与改善动作。')).not.toBeInTheDocument();
  });

  it('loads latest stored file analysis and renders summary sections', async () => {
    renderWithProviders(<IssueAnalysisPage />);

    await waitFor(() => {
      expect(getProductionIssueAnalysis).toHaveBeenCalledWith(2);
    });

    expect(await screen.findByText('关键归纳与治理动作')).toBeInTheDocument();
    expect(screen.getByText('共导入 2 条问题记录，覆盖 2 个发生阶段。')).toBeInTheDocument();
    expect(screen.getByText('优先推进“补充评审清单”专项治理。')).toBeInTheDocument();
    expect(screen.queryByText('问题主要集中在“需求阶段”，人为因素占比 50%。')).not.toBeInTheDocument();
    expect(screen.getAllByText('责任部门').length).toBeGreaterThan(0);
    expect(screen.getByText('研发一部')).toBeInTheDocument();
  });
});

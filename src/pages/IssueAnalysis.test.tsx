import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('IssueAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listProductionIssueFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        file_name: 'issue.xlsx',
        file_type: 'excel',
        file_size: 1024,
        row_count: 2,
        created_at: '2026-03-08 13:00:00',
      },
      {
        id: 2,
        file_name: 'issue-2.xlsx',
        file_type: 'excel',
        file_size: 2048,
        row_count: 3,
        created_at: '2026-03-08 12:00:00',
      },
    ]);
    (getProductionIssueAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue({
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
          headline: '问题主要集中在“需求阶段”，人为因素占比 50%',
          key_findings: ['共导入 2 条问题记录，覆盖 2 个发生阶段。'],
          recommended_actions: ['优先推进“补充评审清单”，该举措在 1 条记录中出现。'],
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
    });
  });

  it('renders title and stored file list', async () => {
    renderWithProviders(<IssueAnalysisPage />);

    expect(await screen.findByText('生产问题分析')).toBeInTheDocument();
    expect(await screen.findByText('issue.xlsx')).toBeInTheDocument();
    expect(screen.queryByText('Operations Board')).not.toBeInTheDocument();
    expect(screen.queryByText('将生产问题文件自动汇总成轻质感数据看板，聚焦阶段分布、原因结构和改善动作。')).not.toBeInTheDocument();
    expect(screen.getAllByText('查看看板').length).toBeGreaterThanOrEqual(1);
  });

  it('loads latest stored file analysis and supports switching files', async () => {
    renderWithProviders(<IssueAnalysisPage />);

    await waitFor(() => {
      expect(getProductionIssueAnalysis).toHaveBeenCalledWith(1);
    });

    expect(await screen.findByText('关键归纳')).toBeInTheDocument();
    expect(screen.getByText('问题主要集中在“需求阶段”，人为因素占比 50%')).toBeInTheDocument();
    expect(screen.queryByText('当前看板文件：issue.xlsx')).not.toBeInTheDocument();
    expect(screen.queryByText('系统已根据已上传文件自动完成统计归纳，下面的图表和表格会随所选文件自动切换。')).not.toBeInTheDocument();
    expect(screen.getAllByText('责任部门').length).toBeGreaterThan(0);
    expect(screen.getByText('研发一部')).toBeInTheDocument();

    const buttons = screen.getAllByText('查看看板');
    fireEvent.click(buttons[1]);

    await waitFor(() => {
      expect(getProductionIssueAnalysis).toHaveBeenCalledWith(2);
    });
  });
});

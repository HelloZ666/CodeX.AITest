import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import IssueAnalysisPage from './IssueAnalysis';

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echart" />,
}));

vi.mock('../utils/api', () => ({
  importIssueAnalysis: vi.fn(),
}));

import { importIssueAnalysis } from '../utils/api';

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
    </QueryClientProvider>
  );
}

describe('IssueAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and required fields', () => {
    renderWithProviders(<IssueAnalysisPage />);

    expect(screen.getByText('问题归纳')).toBeInTheDocument();
    expect(screen.getByText('出现该问题的原因')).toBeInTheDocument();
    expect(screen.getByText('改善举措')).toBeInTheDocument();
  });

  it('uploads file and renders summary result', async () => {
    (importIssueAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue({
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
            标签: ['需求'],
          },
        ],
      },
    });

    const { container } = renderWithProviders(<IssueAnalysisPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['excel'], 'issue.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText('开始归纳分析'));

    await waitFor(() => {
      expect(importIssueAnalysis).toHaveBeenCalled();
    });
    expect((importIssueAnalysis as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(file);

    expect(await screen.findByText('关键归纳')).toBeInTheDocument();
    expect(screen.getByText('问题主要集中在“需求阶段”，人为因素占比 50%')).toBeInTheDocument();
    expect(screen.getByText('导入明细预览')).toBeInTheDocument();
  });
});

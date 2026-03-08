import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DefectAnalysisPage from './DefectAnalysis';

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echart" />,
}));

vi.mock('../utils/api', () => ({
  importDefectAnalysis: vi.fn(),
}));

import { importDefectAnalysis } from '../utils/api';

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

describe('DefectAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and required fields', () => {
    renderWithProviders(<DefectAnalysisPage />);

    expect(screen.getByText('缺陷总结')).toBeInTheDocument();
    expect(screen.getByText('缺陷摘要')).toBeInTheDocument();
    expect(screen.getByText('缺陷严重度')).toBeInTheDocument();
  });

  it('uploads file and renders summary result', async () => {
    (importDefectAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: {
        overview: {
          total_records: 2,
          severity_count: 2,
          source_count: 2,
          reason_count: 2,
          top_severity: { name: '严重', count: 1, ratio: 0.5 },
          top_source: { name: '系统测试', count: 1, ratio: 0.5 },
        },
        summary: {
          headline: '缺陷主要集中在“严重”严重度，来源以“系统测试”为主，建议优先从高频原因入手做专项治理。',
          key_findings: ['共导入 2 条缺陷记录，覆盖 2 类严重度和 2 类缺陷来源。'],
          recommended_actions: ['优先围绕“接口校验缺失”类缺陷开展专项排查，当前共 1 条。'],
        },
        charts: {
          severity_distribution: [{ name: '严重', count: 1, ratio: 0.5 }],
          business_impact_distribution: [{ name: '影响核心交易', count: 1, ratio: 0.5 }],
          source_distribution: [{ name: '系统测试', count: 1, ratio: 0.5 }],
          reason_distribution: [{ name: '接口校验缺失', count: 1, ratio: 0.5 }],
          sub_reason_distribution: [{ name: '边界值遗漏', count: 1, ratio: 0.5 }],
          summary_distribution: [{ name: '登录接口返回空指针', count: 1, ratio: 0.5 }],
        },
        preview_rows: [
          {
            row_id: 1,
            缺陷ID: 'BUG-001',
            缺陷摘要: '登录接口返回空指针',
            缺陷严重度: '严重',
            业务影响: '影响核心交易',
            缺陷来源: '系统测试',
            缺陷原因: '接口校验缺失',
            缺陷子原因: '边界值遗漏',
          },
        ],
      },
    });

    const { container } = renderWithProviders(<DefectAnalysisPage />);
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['excel'], 'defect.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText('开始归纳分析'));

    await waitFor(() => {
      expect(importDefectAnalysis).toHaveBeenCalled();
    });
    expect((importDefectAnalysis as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(file);

    expect(await screen.findByText('关键归纳')).toBeInTheDocument();
    expect(screen.getByText('缺陷主要集中在“严重”严重度，来源以“系统测试”为主，建议优先从高频原因入手做专项治理。')).toBeInTheDocument();
    expect(screen.getByText('导入明细预览')).toBeInTheDocument();
  });
});

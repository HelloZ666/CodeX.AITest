import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import DefectAnalysisPage from './DefectAnalysis';

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="echart" />,
}));

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  listTestIssueFiles: vi.fn(),
  getTestIssueAnalysis: vi.fn(),
}));

import {
  getTestIssueAnalysis,
  listProjects,
  listTestIssueFiles,
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
    </QueryClientProvider>
  );
}

function buildAnalysisResponse(headline: string) {
  return {
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
        headline,
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
          功能模块: '登录模块',
          测试项: '登录接口',
        },
      ],
    },
  };
}

describe('DefectAnalysisPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders first screen selector and latest file summary', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: '核心项目', description: '核心交易链路', mapping_data: null, created_at: '', updated_at: '' },
    ]);
    (listTestIssueFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 11,
        project_id: 1,
        project_name: '核心项目',
        file_name: 'core-defect.xlsx',
        file_type: 'excel',
        file_size: 2048,
        row_count: 12,
        created_at: '2026-03-08 15:20:00',
      },
    ]);
    (getTestIssueAnalysis as ReturnType<typeof vi.fn>).mockResolvedValue(
      buildAnalysisResponse('核心项目问题主要集中在“严重”严重度。'),
    );

    renderWithProviders(<DefectAnalysisPage />);

    expect(await screen.findByText('测试问题分析')).toBeInTheDocument();
    expect(await screen.findByText('项目选择')).toBeInTheDocument();
    expect(await screen.findByText(/当前文件：core-defect\.xlsx/)).toBeInTheDocument();
    expect(screen.getAllByText('核心项目').length).toBeGreaterThan(0);
    expect(await screen.findByText('问题结构分布')).toBeInTheDocument();
    expect((await screen.findAllByText('导入明细列表')).length).toBeGreaterThan(0);
    expect(screen.queryByText('数据看板 / 测试问题分析')).not.toBeInTheDocument();
    expect(screen.queryByText('绑定文件数')).not.toBeInTheDocument();
    expect(screen.queryByText('切换项目后会自动联动加载最近上传文件，并刷新图表、归纳和导入明细。')).not.toBeInTheDocument();
    expect(screen.queryByText('来源分类')).not.toBeInTheDocument();
    expect(screen.queryByText('原因分类')).not.toBeInTheDocument();
    expect(screen.getAllByText('高频严重度').length).toBe(1);
    expect(screen.getAllByText('高频来源').length).toBe(1);
    expect(screen.queryByText('数据来源文件')).not.toBeInTheDocument();
    expect(screen.queryByText('本次结论')).not.toBeInTheDocument();
    expect(screen.queryByText('Defect Board')).not.toBeInTheDocument();
    expect(screen.queryByText('按项目查看测试问题看板，结合严重度、来源、原因和业务影响形成多视角总览。')).not.toBeInTheDocument();
  });

  it('loads selected project analysis and supports switching projects', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, name: '核心项目', description: '核心交易链路', mapping_data: null, created_at: '', updated_at: '' },
      { id: 2, name: '支付项目', description: '支付链路', mapping_data: null, created_at: '', updated_at: '' },
    ]);
    (listTestIssueFiles as ReturnType<typeof vi.fn>).mockImplementation(async (projectId?: number) => {
      if (projectId === 1) {
        return [
          {
            id: 11,
            project_id: 1,
            project_name: '核心项目',
            file_name: 'core-defect.xlsx',
            file_type: 'excel',
            file_size: 2048,
            row_count: 12,
            created_at: '2026-03-08 15:20:00',
          },
        ];
      }

      if (projectId === 2) {
        return [
          {
            id: 21,
            project_id: 2,
            project_name: '支付项目',
            file_name: 'payment-defect.xlsx',
            file_type: 'excel',
            file_size: 3072,
            row_count: 18,
            created_at: '2026-03-08 15:30:00',
          },
        ];
      }

      return [];
    });
    (getTestIssueAnalysis as ReturnType<typeof vi.fn>).mockImplementation(async (fileId: number) => {
      if (fileId === 11) {
        return buildAnalysisResponse('核心项目问题主要集中在“严重”严重度。');
      }
      return buildAnalysisResponse('支付项目问题主要集中在“系统测试”来源。');
    });

    renderWithProviders(<DefectAnalysisPage />);

    expect(await screen.findByText('关键归纳与治理动作')).toBeInTheDocument();
    expect(listTestIssueFiles).toHaveBeenCalledWith(1);
    expect(getTestIssueAnalysis).toHaveBeenCalledWith(11);
    expect(screen.queryByText('当前看板项目：核心项目，文件：core-defect.xlsx')).not.toBeInTheDocument();
    expect(screen.queryByText('系统已根据所选项目下已上传的测试问题文件自动完成统计归纳，下面的图表和表格会随项目或文件切换。')).not.toBeInTheDocument();
    expect(screen.queryByText('核心项目问题主要集中在“严重”严重度。')).not.toBeInTheDocument();
    expect(screen.getAllByText('功能模块').length).toBeGreaterThan(0);
    expect(screen.getAllByText('测试项').length).toBeGreaterThan(0);

    const selector = (await screen.findAllByRole('combobox'))[0];
    fireEvent.mouseDown(selector);

    const projectOptions = await screen.findAllByText('支付项目');
    fireEvent.click(projectOptions[projectOptions.length - 1]);

    await waitFor(() => {
      expect(listTestIssueFiles).toHaveBeenCalledWith(2);
      expect(getTestIssueAnalysis).toHaveBeenCalledWith(21);
    });

    expect(screen.getAllByText('支付项目').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/当前文件：payment-defect\.xlsx/).length).toBeGreaterThan(0);
  });
});

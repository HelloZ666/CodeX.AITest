import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';
import CaseQualityRecordDetailPage, { resolveCaseCount } from './CaseQualityRecordDetail';

const navigateMock = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../utils/api', () => ({
  getCaseQualityRecord: vi.fn(),
  getProject: vi.fn(),
}));

vi.mock('../components/RequirementAnalysis/RequirementAnalysisResult', () => ({
  default: ({
    hideAi,
    showScore,
    summaryMode,
  }: {
    hideAi?: boolean;
    showScore?: boolean;
    summaryMode?: boolean;
  }) => (
    <div>{`RequirementAnalysisResult:${String(hideAi)}:${String(showScore)}:${String(summaryMode)}`}</div>
  ),
}));

vi.mock('../components/AnalysisResult/AnalysisResult', () => ({
  default: () => <div>AnalysisResult</div>,
}));

vi.mock('../components/ScoreCard/ScoreCard', () => ({
  default: () => <div>ScoreCard</div>,
}));

vi.mock('../components/AISuggestions/AISuggestions', () => ({
  default: () => <div>AISuggestions</div>,
}));

import { getCaseQualityRecord, getProject } from '../utils/api';

function renderWithProviders(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/functional-testing/records/:id" element={<CaseQualityRecordDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('CaseQualityRecordDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to score dimensions when case count is missing', () => {
    expect(resolveCaseCount({
      diff_analysis: {
        total_files: 1,
        total_added: 2,
        total_removed: 0,
        files: [],
      },
      coverage: {
        total_changed_methods: 1,
        covered: ['method'],
        uncovered: [],
        coverage_rate: 1,
        details: [],
      },
      score: {
        total_score: 90,
        grade: 'A',
        summary: 'ok',
        dimensions: [
          {
            dimension: '步骤完整性',
            score: 80,
            weight: 0.3,
            weighted_score: 24,
            details: '平均步骤质量 80.0/100 (5个用例)',
          },
        ],
      },
      ai_analysis: null,
      ai_cost: null,
      duration_ms: 100,
    })).toBe(5);
  });

  it('shows invalid id error', () => {
    renderWithProviders('/functional-testing/records/invalid');

    expect(screen.getByText('无效记录 ID')).toBeInTheDocument();
  });

  it('renders record detail with test suggestions', async () => {
    (getCaseQualityRecord as Mock).mockResolvedValue({
      id: 11,
      project_id: 1,
      project_name: '项目A',
      requirement_analysis_record_id: 101,
      analysis_record_id: 201,
      requirement_file_name: 'requirement.docx',
      code_changes_file_name: 'changes.json',
      test_cases_file_name: 'cases.csv',
      requirement_score: 85,
      case_score: 90,
      total_token_usage: 1200,
      total_cost: 0.01,
      total_duration_ms: 920,
      created_at: '2026-03-22T10:00:00Z',
      requirement_section_snapshot: null,
      requirement_result_snapshot: {
        overview: {
          total_requirements: 1,
          matched_requirements: 1,
          mapping_hit_count: 1,
          unmatched_requirements: 0,
          use_ai: false,
          duration_ms: 300,
        },
        score: null,
        mapping_suggestions: [
          {
            requirement_point_id: 'RP-1',
            section_number: '2.1',
            section_title: '下单流程',
            requirement_text: '提交订单',
            match_count: 1,
            suggestion: '补充库存不足与重复提交验证',
          },
        ],
        requirement_hits: [],
        unmatched_requirements: [],
        ai_analysis: null,
        ai_cost: null,
        record_id: 101,
      },
      case_result_snapshot: {
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
          details: [
            {
              method: 'com.example.order.OrderService.createOrder',
              description: '创建订单',
              is_covered: true,
              matched_tests: ['TC-001'],
            },
          ],
        },
        score: {
          total_score: 90,
          grade: 'A',
          summary: '案例质量优秀',
          dimensions: [],
        },
        test_case_count: 8,
        ai_analysis: null,
        ai_cost: null,
        duration_ms: 620,
      },
      combined_result_snapshot: {
        overview: {
          project_id: 1,
          project_name: '项目A',
          requirement_analysis_record_id: 101,
          analysis_record_id: 201,
          requirement_score: 85,
          case_score: 90,
          total_token_usage: 1200,
          total_cost: 0.01,
          total_duration_ms: 920,
        },
      },
    });
    (getProject as Mock).mockResolvedValue({
      id: 1,
      name: '项目A',
      description: '核心项目',
      mapping_data: [
        {
          package_name: 'com.example.order',
          class_name: 'OrderService',
          method_name: 'createOrder',
          description: '创建订单',
          test_point: '关注库存扣减、重复提交和订单落库',
        },
      ],
      created_at: '2026-03-01T00:00:00Z',
      updated_at: '2026-03-02T00:00:00Z',
      stats: {
        analysis_count: 1,
        avg_score: 90,
        latest_analysis: null,
      },
    });

    renderWithProviders('/functional-testing/records/11');

    expect(await screen.findByText('案例质检记录 #11')).toBeInTheDocument();
    expect(screen.getByText('返回分析记录')).toBeInTheDocument();
    expect(screen.getByText('综合记录概览')).toBeInTheDocument();
    expect(screen.getByText('测试建议')).toBeInTheDocument();
    expect(screen.getByText('需求映射建议')).toBeInTheDocument();
    expect(screen.getByText('代码映射建议')).toBeInTheDocument();
    expect(screen.getByText('【2.1 下单流程】补充库存不足与重复提交验证')).toBeInTheDocument();
    expect(await screen.findByText((_, node) => node?.textContent === 'com.example.order.OrderService.createOrder')).toBeInTheDocument();
    expect(await screen.findByText('测试点：关注库存扣减、重复提交和订单落库')).toBeInTheDocument();
    expect(screen.getByText('RequirementAnalysisResult:true:undefined:true')).toBeInTheDocument();
    expect(screen.getByText('AnalysisResult')).toBeInTheDocument();
    expect(screen.getByText('ScoreCard')).toBeInTheDocument();
    expect(screen.getByText('AISuggestions')).toBeInTheDocument();
  });

  it('shows empty state when record is missing', async () => {
    (getCaseQualityRecord as Mock).mockResolvedValue(null);
    (getProject as Mock).mockResolvedValue(null);

    renderWithProviders('/functional-testing/records/12');

    expect(await screen.findByText('未找到记录详情')).toBeInTheDocument();
  });
});

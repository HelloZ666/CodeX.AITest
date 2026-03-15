import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScoreTrendChart from './ScoreTrendChart';
import type { AnalysisRecordSummary } from '../../types';

// Mock echarts-for-react to avoid canvas rendering issues in jsdom
vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: Record<string, unknown> }) => (
    <div data-testid="echarts-mock" data-option={JSON.stringify(option)}>
      ECharts Mock
    </div>
  ),
}));

const mockRecords: AnalysisRecordSummary[] = [
  { id: 1, project_id: 1, test_score: 75, token_usage: 1200, cost: 0.005, duration_ms: 3000, created_at: '2025-01-10T10:00:00Z' },
  { id: 2, project_id: 1, test_score: 82, token_usage: 1400, cost: 0.006, duration_ms: 3200, created_at: '2025-01-15T10:00:00Z' },
  { id: 3, project_id: 1, test_score: 88, token_usage: 1100, cost: 0.004, duration_ms: 2800, created_at: '2025-01-20T10:00:00Z' },
];

describe('ScoreTrendChart', () => {
  it('renders empty state when no records', () => {
    render(<ScoreTrendChart records={[]} />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('renders chart title', () => {
    render(<ScoreTrendChart records={mockRecords} />);
    expect(screen.getByText('评分趋势')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<ScoreTrendChart records={mockRecords} title="自定义标题" />);
    expect(screen.getByText('自定义标题')).toBeInTheDocument();
  });

  it('renders echarts component when data provided', () => {
    render(<ScoreTrendChart records={mockRecords} />);
    expect(screen.getByTestId('echarts-mock')).toBeInTheDocument();
  });

  it('passes correct data to echarts', () => {
    render(<ScoreTrendChart records={mockRecords} />);
    const chart = screen.getByTestId('echarts-mock');
    const option = JSON.parse(chart.getAttribute('data-option') || '{}');
    expect(option.series).toHaveLength(2);
    expect(option.series[0].name).toBe('评分');
    expect(option.series[1].name).toBe('Token 消耗');
  });

  it('sorts records by date ascending', () => {
    const unsorted: AnalysisRecordSummary[] = [
      { id: 3, project_id: 1, test_score: 88, token_usage: 1100, cost: 0.004, duration_ms: 2800, created_at: '2025-01-20T10:00:00Z' },
      { id: 1, project_id: 1, test_score: 75, token_usage: 1200, cost: 0.005, duration_ms: 3000, created_at: '2025-01-10T10:00:00Z' },
    ];
    render(<ScoreTrendChart records={unsorted} />);
    const chart = screen.getByTestId('echarts-mock');
    const option = JSON.parse(chart.getAttribute('data-option') || '{}');
    // First data point should be the earlier date's score (75)
    expect(option.series[0].data[0]).toBe(75);
    expect(option.series[0].data[1]).toBe(88);
  });
});

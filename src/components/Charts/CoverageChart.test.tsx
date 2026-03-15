import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CoverageChart from './CoverageChart';

// Mock echarts-for-react to avoid canvas rendering issues in jsdom
vi.mock('echarts-for-react', () => ({
  default: ({ option }: { option: Record<string, unknown> }) => (
    <div data-testid="echarts-mock" data-option={JSON.stringify(option)}>
      ECharts Mock
    </div>
  ),
}));

describe('CoverageChart', () => {
  it('renders empty state when total is 0', () => {
    render(<CoverageChart covered={0} uncovered={0} />);
    expect(screen.getByText('暂无数据')).toBeInTheDocument();
  });

  it('renders chart title', () => {
    render(<CoverageChart covered={5} uncovered={3} />);
    expect(screen.getByText('覆盖率分布')).toBeInTheDocument();
  });

  it('renders custom title', () => {
    render(<CoverageChart covered={5} uncovered={3} title="自定义覆盖率" />);
    expect(screen.getByText('自定义覆盖率')).toBeInTheDocument();
  });

  it('renders echarts component with data', () => {
    render(<CoverageChart covered={5} uncovered={3} />);
    expect(screen.getByTestId('echarts-mock')).toBeInTheDocument();
  });

  it('passes correct data to echarts', () => {
    render(<CoverageChart covered={7} uncovered={3} />);
    const chart = screen.getByTestId('echarts-mock');
    const option = JSON.parse(chart.getAttribute('data-option') || '{}');
    const pieData = option.series[0].data;
    expect(pieData).toHaveLength(2);
    expect(pieData[0].value).toBe(7);
    expect(pieData[0].name).toBe('已覆盖');
    expect(pieData[1].value).toBe(3);
    expect(pieData[1].name).toBe('未覆盖');
  });

  it('uses correct colors for pie segments', () => {
    render(<CoverageChart covered={5} uncovered={5} />);
    const chart = screen.getByTestId('echarts-mock');
    const option = JSON.parse(chart.getAttribute('data-option') || '{}');
    const pieData = option.series[0].data;
    expect(pieData[0].itemStyle.color).toBe('#2A6DF4');
    expect(pieData[1].itemStyle.color).toBe('#94A3B8');
  });
});

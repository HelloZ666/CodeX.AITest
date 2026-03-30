import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ScoreCard from './ScoreCard';
import type { ScoreResult } from '../../types';

const mockScore: ScoreResult = {
  total_score: 72.5,
  grade: 'C',
  summary: '测试用例基本合格，建议加强覆盖范围和步骤细节',
  dimensions: [
    { dimension: '覆盖范围', score: 80, weight: 0.4, weighted_score: 32, details: '覆盖率 4/5 = 80%' },
    { dimension: '步骤完整性', score: 65, weight: 0.3, weighted_score: 19.5, details: '平均步骤质量 65/100' },
    { dimension: '预期结果明确性', score: 70, weight: 0.2, weighted_score: 14, details: '平均预期结果质量 70/100' },
    { dimension: '边界用例', score: 70, weight: 0.1, weighted_score: 7, details: '边界用例 2/5' },
  ],
};

describe('ScoreCard', () => {
  it('renders grade', () => {
    render(<ScoreCard score={mockScore} />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('renders total score', () => {
    render(<ScoreCard score={mockScore} />);
    expect(screen.getByText('72.5')).toBeInTheDocument();
    expect(screen.getByText('/ 100')).toBeInTheDocument();
  });

  it('renders summary', () => {
    render(<ScoreCard score={mockScore} />);
    expect(screen.getByText(/基本合格/)).toBeInTheDocument();
  });

  it('renders all four dimensions', () => {
    render(<ScoreCard score={mockScore} />);
    expect(screen.getAllByText(/覆盖范围/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/步骤完整性/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/预期结果明确性/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/边界用例/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders dimension scores', () => {
    render(<ScoreCard score={mockScore} />);
    expect(screen.getByText('80.0 分')).toBeInTheDocument();
    expect(screen.getByText('65.0 分')).toBeInTheDocument();
  });

  it('renders high grade correctly', () => {
    const highScore: ScoreResult = {
      ...mockScore,
      total_score: 95,
      grade: 'A',
      summary: '测试用例质量优秀',
    };
    render(<ScoreCard score={highScore} />);
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('95.0')).toBeInTheDocument();
    expect(screen.getByText('/ 100')).toBeInTheDocument();
  });
});

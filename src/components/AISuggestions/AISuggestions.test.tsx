import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AISuggestions from './AISuggestions';
import type { AIAnalysis, AIUsage } from '../../types';

const mockAnalysis: AIAnalysis = {
  uncovered_methods: ['com.example.user.UserService.deleteUser'],
  coverage_gaps: 'deleteUser 方法是新增方法，缺少对应的测试用例覆盖',
  suggested_test_cases: [
    {
      test_id: 'TC005',
      test_function: '删除用户-正常删除',
      test_steps: '1. 创建测试用户 2. 调用删除接口',
      expected_result: '用户状态变为 deleted',
    },
  ],
  risk_assessment: 'medium',
  improvement_suggestions: ['新增 deleteUser 方法缺少测试覆盖'],
};

const mockUsage: AIUsage = {
  total_tokens: 2000,
};

describe('AISuggestions', () => {
  it('renders when no analysis provided', () => {
    render(<AISuggestions analysis={null} usage={null} />);
    expect(screen.getByText('当前未启用 AI 辅助分析。')).toBeInTheDocument();
  });

  it('renders error state', () => {
    render(<AISuggestions analysis={{ error: 'AI超时' }} usage={null} />);
    expect(screen.getByText('AI超时')).toBeInTheDocument();
  });

  it('renders risk assessment', () => {
    render(<AISuggestions analysis={mockAnalysis} usage={mockUsage} />);
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
  });

  it('renders coverage gaps', () => {
    render(<AISuggestions analysis={mockAnalysis} usage={mockUsage} />);
    expect(screen.getAllByText(/deleteUser/).length).toBeGreaterThanOrEqual(1);
  });

  it('renders suggested test cases', () => {
    render(<AISuggestions analysis={mockAnalysis} usage={mockUsage} />);
    expect(screen.getByText('TC005')).toBeInTheDocument();
    expect(screen.getByText('删除用户-正常删除')).toBeInTheDocument();
  });

  it('renders improvement suggestions', () => {
    render(<AISuggestions analysis={mockAnalysis} usage={mockUsage} />);
    expect(screen.getByText(/缺少测试覆盖/)).toBeInTheDocument();
  });

  it('renders token usage only', () => {
    render(<AISuggestions analysis={mockAnalysis} usage={mockUsage} />);
    expect(screen.getByText('2,000')).toBeInTheDocument();
    expect(screen.getByText('本次分析 Token 用量')).toBeInTheDocument();
    expect(screen.queryByText(/¥/)).not.toBeInTheDocument();
  });
});

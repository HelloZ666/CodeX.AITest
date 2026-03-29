import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AnalysisResult from './AnalysisResult';
import type { CodeMappingEntry, DiffAnalysis, CoverageResult } from '../../types';

const mockDiff: DiffAnalysis = {
  total_files: 2,
  total_added: 15,
  total_removed: 5,
  files: [
    { package: 'com.example.user', added: 10, removed: 3 },
    { package: 'com.example.order', added: 5, removed: 2 },
  ],
};

const mockCoverage: CoverageResult = {
  total_changed_methods: 3,
  covered: ['com.example.user.UserService.createUser'],
  uncovered: ['com.example.order.OrderService.deleteOrder'],
  coverage_rate: 0.67,
  details: [
    {
      method: 'com.example.user.UserService.createUser',
      description: '创建用户',
      is_covered: true,
      matched_tests: ['TC001'],
    },
    {
      method: 'com.example.order.OrderService.deleteOrder',
      description: '无映射描述',
      is_covered: false,
      matched_tests: [],
    },
  ],
};

const existingMappings: CodeMappingEntry[] = [
  {
    package_name: 'com.example.user',
    class_name: 'UserService',
    method_name: 'createUser',
    description: '创建用户',
    test_point: '用户创建主流程',
  },
  {
    package_name: 'com.example.order',
    class_name: 'OrderService',
    method_name: 'deleteOrder',
    description: '删除订单',
    test_point: '删除订单主流程',
  },
];

describe('AnalysisResult', () => {
  it('renders diff statistics', () => {
    render(<AnalysisResult diffAnalysis={mockDiff} coverage={mockCoverage} />);
    expect(screen.getByText('代码改动分析')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders coverage statistics', () => {
    render(<AnalysisResult diffAnalysis={mockDiff} coverage={mockCoverage} />);
    expect(screen.getByText('测试覆盖分析')).toBeInTheDocument();
    expect(screen.getByText('67%')).toBeInTheDocument();
  });

  it('renders coverage tags', () => {
    render(<AnalysisResult diffAnalysis={mockDiff} coverage={mockCoverage} />);
    expect(screen.getAllByText('已覆盖').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('未覆盖').length).toBeGreaterThanOrEqual(1);
  });

  it('renders package paths in diff table', () => {
    render(<AnalysisResult diffAnalysis={mockDiff} coverage={mockCoverage} />);
    expect(screen.getByText('com.example.user')).toBeInTheDocument();
    expect(screen.getByText('com.example.order')).toBeInTheDocument();
  });

  it('shows add button for uncovered method that is not saved yet', () => {
    const onAddMapping = vi.fn();

    render(
      <AnalysisResult
        diffAnalysis={mockDiff}
        coverage={mockCoverage}
        existingMappings={existingMappings.slice(0, 1)}
        onAddMapping={onAddMapping}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '新增' }));
    expect(onAddMapping).toHaveBeenCalledWith(mockCoverage.details[1]);
  });

  it('shows saved button for uncovered method that already exists in mapping', () => {
    render(
      <AnalysisResult
        diffAnalysis={mockDiff}
        coverage={mockCoverage}
        existingMappings={existingMappings}
        onAddMapping={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '已保存' })).toBeDisabled();
  });
});

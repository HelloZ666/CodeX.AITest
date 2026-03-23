import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RequirementAnalysisResultView from './RequirementAnalysisResult';
import type { RequirementAnalysisResult } from '../../types';

function buildResult(): RequirementAnalysisResult {
  return {
    overview: {
      total_requirements: 3,
      matched_requirements: 2,
      mapping_hit_count: 2,
      unmatched_requirements: 1,
      use_ai: true,
      duration_ms: 320,
    },
    score: {
      total_score: 88,
      grade: 'A',
      summary: '质量稳定',
      dimensions: [
        {
          dimension: '需求完整度',
          score: 90,
          weight: 0.3,
          weighted_score: 27,
          details: '需求要点覆盖完整',
        },
      ],
    },
    mapping_suggestions: [
      {
        requirement_point_id: '4.1-1',
        section_number: '4.1',
        section_title: '功能描述',
        requirement_text: '新增页面需要补充验证',
        match_count: 2,
        suggestion: '覆盖页面新增关联场景',
      },
      {
        requirement_point_id: '4.1-2',
        section_number: '4.1',
        section_title: '功能描述',
        requirement_text: '新增页面需要补齐跳转链路验证',
        match_count: 1,
        suggestion: '覆盖页面新增关联场景',
      },
    ],
    requirement_hits: [
      {
        point_id: '4.1-1',
        section_number: '4.1',
        section_title: '功能描述',
        text: '新增页面需要补充验证',
        mapping_suggestion: '覆盖页面新增关联场景',
        mapping_matches: [
          {
            group_id: 'group-1',
            tag: '页面新增',
            requirement_keyword: '新增页面',
            matched_requirement_keyword: '新增页面',
            matched_scenarios: [],
            related_scenarios: ['兼容性测试', '跳转链路'],
            additional_scenarios: ['兼容性测试'],
          },
        ],
      },
      {
        point_id: '4.1-2',
        section_number: '4.1',
        section_title: '功能描述',
        text: '新增页面需要补齐跳转链路验证',
        mapping_suggestion: '覆盖页面新增关联场景',
        mapping_matches: [
          {
            group_id: 'group-2',
            tag: '页面新增',
            requirement_keyword: '新增页面',
            matched_requirement_keyword: '新增页面',
            matched_scenarios: ['跳转链路'],
            related_scenarios: ['兼容性测试', '跳转链路'],
            additional_scenarios: ['兼容性测试'],
          },
        ],
      },
    ],
    unmatched_requirements: [
      {
        point_id: '4.4-1',
        section_number: '4.4',
        section_title: '界面',
        text: '增加页面提示文案',
      },
    ],
    ai_analysis: {
      provider: 'DeepSeek',
      enabled: true,
      summary: '命中映射关系，建议补齐同组场景。',
      overall_assessment: '重点关注跳转链路与兼容性场景。',
      key_findings: [
        '新增页面命中后，需要补齐同组关联场景。',
      ],
      risk_table: [
        {
          requirement_point_id: '4.1-1',
          risk_level: '高',
          risk_reason: '存在扩展场景',
          test_focus: '补齐同组场景',
        },
      ],
    },
    ai_cost: {
      input_cost: 0.0001,
      output_cost: 0.0001,
      total_cost: 0.0002,
      total_tokens: 120,
    },
    source_files: {
      project_id: 1,
      project_name: '活动项目',
      requirement_file_name: 'requirement.docx',
      requirement_mapping_available: true,
      requirement_mapping_source_type: 'upload',
      requirement_mapping_file_name: 'mapping.xlsx',
      requirement_mapping_group_count: 1,
      requirement_mapping_updated_at: '2026-03-08 10:00:00',
    },
    record_id: 10,
  } as unknown as RequirementAnalysisResult;
}

describe('RequirementAnalysisResultView', () => {
  it('shows ai module by default and keeps score hidden by default', () => {
    render(<RequirementAnalysisResultView result={buildResult()} />);

    expect(screen.getByText('AI 智能结论')).toBeInTheDocument();
    expect(screen.queryByText('质量评分')).not.toBeInTheDocument();
  });

  it('renders deduped hit details and mapping suggestion table', () => {
    render(<RequirementAnalysisResultView result={buildResult()} />);

    const mappingCard = screen.getByText('需求映射建议').closest('.ant-card');
    expect(mappingCard).not.toBeNull();
    expect(within(mappingCard as HTMLElement).getByText('共 1 项')).toBeInTheDocument();

    const hitDetailCard = screen.getByText('逐条命中明细').closest('.ant-card');
    expect(hitDetailCard).not.toBeNull();
    fireEvent.click(within(hitDetailCard as HTMLElement).getByRole('button'));
    expect(within(hitDetailCard as HTMLElement).getByText('命中需求点 2')).toBeInTheDocument();
  });

  it('hides ai module when hideAi is true', () => {
    render(<RequirementAnalysisResultView result={buildResult()} hideAi />);

    expect(screen.queryByText('AI 智能结论')).not.toBeInTheDocument();
    expect(screen.getByText('需求映射建议')).toBeInTheDocument();
  });

  it('shows score card when showScore is true', () => {
    render(<RequirementAnalysisResultView result={buildResult()} showScore />);

    expect(screen.getByText('质量评分')).toBeInTheDocument();
    expect(screen.getByText('88.0')).toBeInTheDocument();
  });

  it('supports hideAi and showScore together', () => {
    render(<RequirementAnalysisResultView result={buildResult()} hideAi showScore />);

    expect(screen.queryByText('AI 智能结论')).not.toBeInTheDocument();
    expect(screen.getByText('质量评分')).toBeInTheDocument();
  });

  it('renders compact mapping suggestions in summary mode', () => {
    render(<RequirementAnalysisResultView result={buildResult()} hideAi summaryMode />);

    expect(screen.getByText('需求映射建议')).toBeInTheDocument();
    expect(screen.queryByText('逐条命中明细')).not.toBeInTheDocument();
    expect(screen.getByText('命中关键词')).toBeInTheDocument();
    expect(screen.getAllByText('新增页面').length).toBeGreaterThan(0);
    expect(screen.getByText('建议补齐场景')).toBeInTheDocument();
    expect(screen.getAllByText('兼容性测试').length).toBeGreaterThan(0);
    expect(screen.queryByText('4.1-1')).not.toBeInTheDocument();
    expect(screen.queryByText('4.1 功能描述')).not.toBeInTheDocument();
    expect(screen.queryByText('命中 2 个需求点')).not.toBeInTheDocument();
    expect(screen.queryByText('测试范围建议')).not.toBeInTheDocument();
  });
});

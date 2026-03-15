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
    mapping_suggestions: [
      {
        requirement_point_id: '4.1-1',
        section_number: '4.1',
        section_title: '功能描述',
        requirement_text: '需要补充新增页面验证',
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
        text: '需要补充新增页面验证',
        mapping_suggestion: '覆盖页面新增关联场景',
        mapping_matches: [
          {
            group_id: 'group-1',
            tag: '页面新增',
            requirement_keyword: '新增页面',
            matched_requirement_keyword: '新增页面',
            matched_scenarios: [],
            related_scenarios: ['兼容性测试', '跳转链路', '兼容性测试'],
            additional_scenarios: ['兼容性测试', '跳转链路'],
          },
          {
            group_id: 'group-1-duplicate',
            tag: '页面新增',
            requirement_keyword: '新增页面',
            matched_requirement_keyword: '新增页面',
            matched_scenarios: [],
            related_scenarios: ['跳转链路'],
            additional_scenarios: ['跳转链路'],
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
            group_id: 'group-1-second-hit',
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
      summary: '新增页面需求命中需求映射关系，建议补齐同组关联场景回归。',
      overall_assessment: '需要优先补齐新增页面相关回归，重点关注跳转链路和兼容性。',
      key_findings: [
        '新增页面命中后，需要补齐同组关联场景。',
        '新增页面命中后，需要补齐同组关联场景。',
        '优先验证兼容性测试和跳转链路。',
      ],
      risk_table: [
        {
          requirement_point_id: '4.1-1',
          risk_level: '高',
          risk_reason: '命中需求映射后，需要扩展到整组关联场景。',
          test_focus: '优先验证兼容性测试和跳转链路。',
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
      project_name: '回家活动项目',
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
  it('hides the unmatched module and aggregates duplicated mapping keywords and hit details', () => {
    render(<RequirementAnalysisResultView result={buildResult()} />);

    expect(screen.queryByText('未命中需求点')).not.toBeInTheDocument();

    const mappingCard = screen.getByText('需求映射建议').closest('.ant-card');
    expect(mappingCard).not.toBeNull();
    expect(within(mappingCard as HTMLElement).getByText('共 1 项')).toBeInTheDocument();
    expect(within(mappingCard as HTMLElement).getAllByText('4.1-1')).toHaveLength(1);
    expect(within(mappingCard as HTMLElement).getAllByText('4.1-2')).toHaveLength(1);
    expect(within(mappingCard as HTMLElement).getAllByText('页面新增')).toHaveLength(1);
    expect(within(mappingCard as HTMLElement).getAllByText('新增页面')).toHaveLength(1);

    const hitDetailCard = screen.getByText('逐条命中明细').closest('.ant-card');
    expect(hitDetailCard).not.toBeNull();
    expect(within(hitDetailCard as HTMLElement).getAllByText('命中需求点 2')).toHaveLength(1);
    fireEvent.click(within(hitDetailCard as HTMLElement).getByRole('button'));
    expect(within(hitDetailCard as HTMLElement).getAllByText('页面新增')).toHaveLength(1);
    expect(within(hitDetailCard as HTMLElement).getAllByText('新增页面')).toHaveLength(1);
    expect(within(hitDetailCard as HTMLElement).getAllByText('4.1-1').length).toBeGreaterThan(0);
    expect(within(hitDetailCard as HTMLElement).getAllByText('4.1-2').length).toBeGreaterThan(0);
  });

  it('renders compact assessment and deduped findings', () => {
    render(<RequirementAnalysisResultView result={buildResult()} />);

    expect(screen.getByText('总体判断')).toBeInTheDocument();
    expect(screen.getByText(/需要优先补齐新增页面/)).toBeInTheDocument();
    const findingsCard = screen.getByText('关键关注点').closest('.ant-card');
    expect(findingsCard).not.toBeNull();
    expect(within(findingsCard as HTMLElement).getAllByText('新增页面命中后，需要补齐同组关联场景。')).toHaveLength(1);
    expect(within(findingsCard as HTMLElement).getAllByText('优先验证兼容性测试和跳转链路。')).toHaveLength(1);
  });
});

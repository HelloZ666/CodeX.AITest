import { describe, expect, it } from 'vitest';
import type { CodeMappingEntry, CoverageResult, RequirementAnalysisResult } from '../types';
import { buildCodeTestSuggestions, buildRequirementTestSuggestions } from './testSuggestions';

describe('testSuggestions', () => {
  it('builds requirement suggestions from explicit mapping suggestions first', () => {
    const result: RequirementAnalysisResult = {
      overview: {
        total_requirements: 2,
        matched_requirements: 1,
        mapping_hit_count: 1,
        unmatched_requirements: 1,
        use_ai: false,
        duration_ms: 100,
      },
      score: null,
      mapping_suggestions: [
        {
          requirement_point_id: 'RP-1',
          section_number: '3.2',
          section_title: '下单流程',
          requirement_text: '提交订单后需要校验库存',
          match_count: 1,
          suggestion: '将库存不足、重复提交和回滚校验纳入回归范围',
        },
      ],
      requirement_hits: [],
      unmatched_requirements: [],
      ai_analysis: null,
      ai_cost: null,
    };

    expect(buildRequirementTestSuggestions(result)).toEqual([
      '【3.2 下单流程】将库存不足、重复提交和回滚校验纳入回归范围',
    ]);
  });

  it('matches changed methods to mapped test points', () => {
    const coverage: CoverageResult = {
      total_changed_methods: 2,
      covered: ['com.example.order.OrderService.createOrder'],
      uncovered: ['com.example.order.OrderService.cancelOrder'],
      coverage_rate: 0.5,
      details: [
        {
          method: 'com.example.order.OrderService.createOrder',
          description: '创建订单',
          is_covered: true,
          matched_tests: ['TC-001'],
        },
        {
          method: 'com.example.order.OrderService.cancelOrder',
          description: '取消订单',
          is_covered: false,
          matched_tests: [],
        },
      ],
    };
    const entries: CodeMappingEntry[] = [
      {
        package_name: 'com.example.order',
        class_name: 'OrderService',
        method_name: 'createOrder',
        description: '创建订单',
        test_point: '关注库存扣减、重复提交和订单落库',
      },
      {
        package_name: 'com.example.order',
        class_name: 'OrderService',
        method_name: 'cancelOrder',
        description: '取消订单',
        test_point: '',
      },
    ];

    expect(buildCodeTestSuggestions(coverage, entries)).toEqual([
      {
        key: 'com.example.order.OrderService.createOrder',
        method: 'com.example.order.OrderService.createOrder',
        package_name: 'com.example.order',
        class_name: 'OrderService',
        method_name: 'createOrder',
        description: '创建订单',
        test_point: '关注库存扣减、重复提交和订单落库',
      },
    ]);
  });
});

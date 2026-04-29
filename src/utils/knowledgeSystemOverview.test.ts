import { describe, expect, it } from 'vitest';
import {
  applyKnowledgeOverviewExpectedResultValidationStyles,
  hasKnowledgeSystemOverviewCaseTagNormalizationDiff,
  normalizeKnowledgeSystemOverviewData,
  validateKnowledgeOverviewBranchTags,
} from './knowledgeSystemOverview';

describe('knowledgeSystemOverview mind map normalization', () => {
  it('adds the default positive tag to leaf nodes without tagging the root', () => {
    const normalized = normalizeKnowledgeSystemOverviewData(
      {
        root: {
          data: { text: '支付系统', expand: true },
          children: [
            { data: { text: '支付' }, children: [] },
          ],
        },
      },
      '支付系统',
    );

    expect(normalized.root.data.tag).toBeUndefined();
    expect(normalized.root.children?.[0]).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        tag: ['正向', '一般', 'P2'],
      }),
    }));
  });

  it('keeps positive and negative tags mutually exclusive and refreshes expected case descriptions', () => {
    const normalized = normalizeKnowledgeSystemOverviewData(
      {
        root: {
          data: { text: '支付系统', expand: true },
          children: [
            {
              data: {
                text: '退款',
                tag: ['正向', '反向', '预期结果', '用例描述：验证旧功能'],
              },
              children: [],
            },
          ],
        },
      },
      '支付系统',
    );

    expect(normalized.root.children?.[0]).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        tag: ['反向', '一般', 'P3', '预期结果', '用例描述：验证退款功能'],
      }),
    }));
  });

  it('calculates case priority from case level and case type', () => {
    const normalized = normalizeKnowledgeSystemOverviewData(
      {
        root: {
          data: { text: '支付系统', expand: true },
          children: [
            { data: { text: '支付成功', tag: ['核心', '正向'] }, children: [] },
            { data: { text: '支付失败', tag: ['核心', '反向'] }, children: [] },
            { data: { text: '余额校验', tag: ['重要', '正向'] }, children: [] },
            { data: { text: '风控拦截', tag: ['重要', '反向'] }, children: [] },
            { data: { text: '提示文案', tag: ['一般', '反向'] }, children: [] },
          ],
        },
      },
      '支付系统',
    );

    expect(normalized.root.children?.map((node) => (node.data as Record<string, unknown>).tag)).toEqual([
      ['正向', '核心', 'P0'],
      ['反向', '核心', 'P1'],
      ['正向', '重要', 'P1'],
      ['反向', '重要', 'P2'],
      ['反向', '一般', 'P3'],
    ]);
  });

  it('keeps expected result tags on sibling leaf nodes', () => {
    const normalized = normalizeKnowledgeSystemOverviewData(
      {
        root: {
          data: { text: '支付系统', expand: true },
          children: [
            { data: { text: '成功', tag: ['预期结果'] }, children: [] },
            { data: { text: '失败' }, children: [] },
          ],
        },
      },
      '支付系统',
    );

    expect(normalized.root.children?.[0]).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        tag: ['正向', '一般', 'P2', '预期结果', '用例描述：验证成功功能'],
      }),
    }));
    expect(normalized.root.children?.[1]).toEqual(expect.objectContaining({
      data: expect.objectContaining({
        tag: ['正向', '一般', 'P2'],
      }),
    }));
  });

  it('detects when case tag normalization needs to be pushed back to the canvas', () => {
    const raw = {
      root: {
        data: { text: '支付系统', expand: true },
        children: [
          { data: { text: '支付' }, children: [] },
        ],
      },
    };
    const normalized = normalizeKnowledgeSystemOverviewData(raw, '支付系统');

    expect(hasKnowledgeSystemOverviewCaseTagNormalizationDiff(raw, normalized)).toBe(true);
    expect(hasKnowledgeSystemOverviewCaseTagNormalizationDiff(normalized, normalized)).toBe(false);
  });

  it('validates negative branches and expected result tags on final branch nodes', () => {
    const normalized = normalizeKnowledgeSystemOverviewData(
      {
        root: {
          data: { text: '支付系统', expand: true },
          children: [
            {
              data: { text: '支付成功', tag: ['预期结果'] },
              children: [],
            },
            {
              data: { text: '支付失败', tag: ['反向'] },
              children: [],
            },
          ],
        },
      },
      '支付系统',
    );

    expect(validateKnowledgeOverviewBranchTags(normalized)).toEqual({
      hasNegativeBranch: true,
      missingExpectedResultLeafCount: 1,
      missingExpectedResultLeafTexts: ['支付失败'],
      isValid: false,
    });
  });

  it('marks leaf nodes without expected result tags and clears the mark after tags are added', () => {
    const normalized = normalizeKnowledgeSystemOverviewData(
      {
        root: {
          data: { text: '支付系统', expand: true },
          children: [
            {
              data: { text: '支付失败', tag: ['反向'], fillColor: '#ffffff' },
              children: [],
            },
          ],
        },
      },
      '支付系统',
    );

    const marked = applyKnowledgeOverviewExpectedResultValidationStyles(normalized);
    const markedLeaf = marked.root.children?.[0] as Record<string, unknown> & {
      data: Record<string, unknown>;
    };
    expect(marked.root.children?.[0].data).toEqual(expect.objectContaining({
      _knowledgeOverviewExpectedResultMissing: true,
      fillColor: '#fee2e2',
      borderColor: '#dc2626',
      borderWidth: 2,
      color: '#991b1b',
    }));

    const repaired = applyKnowledgeOverviewExpectedResultValidationStyles({
      ...marked,
      root: {
        ...marked.root,
        children: [
          {
            ...markedLeaf,
            data: {
              ...markedLeaf.data,
              tag: ['反向', '一般', 'P3', '预期结果', '用例描述：验证支付失败功能'],
            },
            children: [],
          },
        ],
      },
    });

    expect(repaired.root.children?.[0].data).toEqual(expect.not.objectContaining({
      _knowledgeOverviewExpectedResultMissing: true,
    }));
    expect(repaired.root.children?.[0].data).toEqual(expect.objectContaining({
      fillColor: '#ffffff',
    }));
  });
});

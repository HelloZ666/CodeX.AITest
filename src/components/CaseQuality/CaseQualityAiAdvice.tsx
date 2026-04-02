import React from 'react';
import { Alert, Card, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { CaseQualityAdviceItem, CaseQualityAiTestAdvice } from '../../types';

const { Paragraph, Text, Title } = Typography;

interface CaseQualityAiAdviceProps {
  advice?: CaseQualityAiTestAdvice | null;
  compact?: boolean;
}

type AdviceType = 'must' | 'should';

interface AdviceTableRow extends CaseQualityAdviceItem {
  key: string;
  adviceType: AdviceType;
}

const toneColorMap: Record<string, string> = {
  P0: 'error',
  P1: 'warning',
  P2: 'default',
};

const summaryCardStyle: React.CSSProperties = {
  borderRadius: 16,
  border: '1px solid rgba(47, 109, 237, 0.12)',
  background: 'linear-gradient(180deg, rgba(47, 109, 237, 0.06), rgba(255, 255, 255, 0.9))',
};

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  values.forEach((value) => {
    const normalizedValue = normalizeText(value);
    if (!normalizedValue || seen.has(normalizedValue)) {
      return;
    }

    seen.add(normalizedValue);
    result.push(normalizedValue);
  });

  return result;
}

function buildAdviceRows(advice?: CaseQualityAiTestAdvice | null): AdviceTableRow[] {
  const result: AdviceTableRow[] = [];
  const seen = new Set<string>();

  const appendItems = (items: CaseQualityAdviceItem[], adviceType: AdviceType) => {
    items.forEach((item) => {
      const normalizedTitle = normalizeText(item.title);
      const normalizedReason = normalizeText(item.reason);
      const normalizedEvidence = normalizeText(item.evidence);
      const requirementIds = uniqueStrings(item.requirement_ids ?? []);
      const methods = uniqueStrings(item.methods ?? []);
      const testFocus = normalizeText(item.test_focus);
      const expectedRisk = normalizeText(item.expected_risk);

      if (!normalizedTitle) {
        return;
      }

      const dedupeKey = [
        normalizedTitle,
        normalizeText(item.priority),
        normalizedReason,
        normalizedEvidence,
        requirementIds.join('|'),
        methods.join('|'),
        testFocus,
        expectedRisk,
      ].join('::');

      if (seen.has(dedupeKey)) {
        return;
      }

      seen.add(dedupeKey);
      result.push({
        ...item,
        key: `${adviceType}-${dedupeKey}`,
        adviceType,
        title: normalizedTitle,
        reason: normalizedReason,
        evidence: normalizedEvidence,
        requirement_ids: requirementIds,
        methods,
        test_focus: testFocus,
        expected_risk: expectedRisk,
      });
    });
  };

  appendItems(advice?.must_test ?? [], 'must');
  appendItems(advice?.should_test ?? [], 'should');

  return result;
}

function renderTagList(values: string[], emptyLabel = '--', color?: string) {
  const items = uniqueStrings(values);
  if (items.length === 0) {
    return <Text type="secondary">{emptyLabel}</Text>;
  }

  return (
    <Space wrap size={[6, 6]}>
      {items.map((item) => (
        <Tag key={item} color={color}>
          {item}
        </Tag>
      ))}
    </Space>
  );
}

const CaseQualityAiAdvice: React.FC<CaseQualityAiAdviceProps> = ({ advice, compact = false }) => {
  const provider = normalizeText(advice?.provider) || 'AI';
  const enabled = advice?.enabled ?? false;
  const summary = normalizeText(advice?.summary);
  const overallAssessment = normalizeText(advice?.overall_assessment);
  const error = normalizeText(advice?.error);
  const regressionScope = uniqueStrings(advice?.regression_scope ?? []);
  const missingInformation = uniqueStrings(advice?.missing_information ?? []);
  const adviceRows = buildAdviceRows(advice);
  const mustCount = adviceRows.filter((item) => item.adviceType === 'must').length;
  const shouldCount = adviceRows.filter((item) => item.adviceType === 'should').length;

  const hasContent = Boolean(
    summary
    || overallAssessment
    || adviceRows.length
    || regressionScope.length
    || missingInformation.length,
  );

  const columns: ColumnsType<AdviceTableRow> = [
    {
      title: '类型',
      dataIndex: 'adviceType',
      key: 'adviceType',
      width: 92,
      render: (value: AdviceType) => (
        <Tag color={value === 'must' ? 'red' : 'gold'}>
          {value === 'must' ? '必测项' : '补测项'}
        </Tag>
      ),
    },
    {
      title: '优先级',
      dataIndex: 'priority',
      key: 'priority',
      width: 90,
      render: (value: string) => (
        <Tag color={toneColorMap[value] ?? 'default'}>
          {value || '--'}
        </Tag>
      ),
    },
    {
      title: '测试项',
      dataIndex: 'title',
      key: 'title',
      width: 220,
      render: (value: string) => <Text strong>{value}</Text>,
    },
    {
      title: '关联需求点',
      dataIndex: 'requirement_ids',
      key: 'requirement_ids',
      width: 180,
      render: (values: string[]) => renderTagList(values, '无关联需求点', 'blue'),
    },
    {
      title: '关联方法',
      dataIndex: 'methods',
      key: 'methods',
      width: 260,
      render: (values: string[]) => renderTagList(values, '无关联方法', 'geekblue'),
    },
    {
      title: '测试重点',
      dataIndex: 'test_focus',
      key: 'test_focus',
      width: 240,
      render: (value: string) => value || <Text type="secondary">--</Text>,
    },
    {
      title: '预期风险',
      dataIndex: 'expected_risk',
      key: 'expected_risk',
      width: 220,
      render: (value: string) => value || <Text type="secondary">--</Text>,
    },
    {
      title: '依据说明',
      key: 'reasoning',
      width: 280,
      render: (_, record) => (
      <Space orientation="vertical" size={4}>
          <Text strong>原因</Text>
          <Text>{record.reason || '--'}</Text>
          <Text strong>证据</Text>
          <Text>{record.evidence || '--'}</Text>
        </Space>
      ),
    },
  ];

  return (
    <Card
      variant="borderless"
      title="AI 测试意见"
      extra={(
        <Space wrap size={[8, 8]}>
          <Tag color="processing">{provider}</Tag>
          <Tag color={enabled ? 'success' : 'default'}>
            {enabled ? '已生成 AI 意见' : 'AI 未启用'}
          </Tag>
          <Tag color="red">{`必测 ${mustCount}`}</Tag>
          <Tag color="gold">{`补测 ${shouldCount}`}</Tag>
        </Space>
      )}
    >
      <Space orientation="vertical" size={compact ? 'middle' : 'large'} style={{ width: '100%' }}>
        {error ? (
          <Alert
            type={enabled ? 'warning' : 'info'}
            showIcon
            message={enabled ? 'AI 测试意见未完整生成' : '当前未生成 AI 测试意见'}
            description={error}
          />
        ) : null}

        {hasContent ? (
          <>
            <Card size="small" style={summaryCardStyle}>
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <Text type="secondary">总体判断</Text>
                <Title level={5} style={{ margin: 0 }}>
                  {overallAssessment || '聚焦高风险回归'}
                </Title>
                {summary ? (
                  <Paragraph style={{ marginBottom: 0 }}>
                    {summary}
                  </Paragraph>
                ) : null}
              </Space>
            </Card>

            {adviceRows.length > 0 ? (
              <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>
                  必测项与补测项
                </Title>
                <Table
                  size={compact ? 'small' : 'middle'}
                  dataSource={adviceRows}
                  columns={columns}
                  pagination={false}
                  rowKey="key"
                  rowClassName="glass-table-row"
                  scroll={{ x: 1500 }}
                />
              </Space>
            ) : null}

            {regressionScope.length > 0 ? (
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>建议回归范围</Title>
                {renderTagList(regressionScope, '--', 'cyan')}
              </Space>
            ) : null}

            {missingInformation.length > 0 ? (
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>仍缺信息</Title>
                <Space orientation="vertical" size={6} style={{ width: '100%' }}>
                  {missingInformation.map((item) => (
                    <Text key={item}>{`- ${item}`}</Text>
                  ))}
                </Space>
              </Space>
            ) : null}
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={enabled ? 'AI 未返回可展示的测试意见' : '当前未生成 AI 测试意见'}
          />
        )}
      </Space>
    </Card>
  );
};

export default CaseQualityAiAdvice;

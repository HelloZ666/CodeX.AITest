import React from 'react';
import { Alert, Card, Empty, Space, Tag, Typography } from 'antd';
import type { CaseQualityAdviceItem, CaseQualityAiTestAdvice } from '../../types';

const { Paragraph, Text, Title } = Typography;

interface CaseQualityAiAdviceProps {
  advice?: CaseQualityAiTestAdvice | null;
  compact?: boolean;
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

const itemCardStyle: React.CSSProperties = {
  padding: '16px 18px',
  borderRadius: 16,
  border: '1px solid rgba(148, 163, 184, 0.18)',
  background: 'rgba(255, 255, 255, 0.88)',
  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.05)',
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

function renderTagGroup(title: string, values: string[], color?: string) {
  const items = uniqueStrings(values);
  if (items.length === 0) {
    return null;
  }

  return (
    <Space orientation="vertical" size={6} style={{ width: '100%' }}>
      <Text type="secondary">{title}</Text>
      <Space wrap size={[8, 8]}>
        {items.map((item) => (
          <Tag key={`${title}-${item}`} color={color}>
            {item}
          </Tag>
        ))}
      </Space>
    </Space>
  );
}

const AdviceItemCard: React.FC<{ item: CaseQualityAdviceItem }> = ({ item }) => (
  <div style={itemCardStyle}>
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Space wrap size={[10, 10]}>
        <Tag color={toneColorMap[item.priority] ?? 'default'}>{item.priority}</Tag>
        <Text strong>{item.title}</Text>
      </Space>

      <Space orientation="vertical" size={6} style={{ width: '100%' }}>
        <Text type="secondary">建议原因</Text>
        <Text>{item.reason || '--'}</Text>
      </Space>

      <Space orientation="vertical" size={6} style={{ width: '100%' }}>
        <Text type="secondary">证据链</Text>
        <Text>{item.evidence || '--'}</Text>
      </Space>

      {renderTagGroup('关联需求点', item.requirement_ids, 'blue')}
      {renderTagGroup('关联方法', item.methods, 'geekblue')}

      <Space orientation="vertical" size={6} style={{ width: '100%' }}>
        <Text type="secondary">测试重点</Text>
        <Text>{item.test_focus || '--'}</Text>
      </Space>

      <Space orientation="vertical" size={6} style={{ width: '100%' }}>
        <Text type="secondary">预期风险</Text>
        <Text>{item.expected_risk || '--'}</Text>
      </Space>
    </Space>
  </div>
);

const CaseQualityAiAdvice: React.FC<CaseQualityAiAdviceProps> = ({ advice, compact = false }) => {
  const provider = normalizeText(advice?.provider) || 'AI';
  const enabled = advice?.enabled ?? false;
  const summary = normalizeText(advice?.summary);
  const overallAssessment = normalizeText(advice?.overall_assessment);
  const error = normalizeText(advice?.error);
  const mustTest = advice?.must_test ?? [];
  const shouldTest = advice?.should_test ?? [];
  const regressionScope = uniqueStrings(advice?.regression_scope ?? []);
  const missingInformation = uniqueStrings(advice?.missing_information ?? []);

  const hasContent = Boolean(
    summary
    || overallAssessment
    || mustTest.length
    || shouldTest.length
    || regressionScope.length
    || missingInformation.length,
  );

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
          <Tag color="red">{`必测 ${mustTest.length}`}</Tag>
          <Tag color="gold">{`补测 ${shouldTest.length}`}</Tag>
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

            {mustTest.length > 0 ? (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>必测项</Title>
                {mustTest.map((item) => (
                  <AdviceItemCard
                    key={`${item.priority}-${item.title}-${item.methods.join('|')}-${item.requirement_ids.join('|')}`}
                    item={item}
                  />
                ))}
              </Space>
            ) : null}

            {shouldTest.length > 0 ? (
              <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>补测项</Title>
                {shouldTest.map((item) => (
                  <AdviceItemCard
                    key={`${item.priority}-${item.title}-${item.methods.join('|')}-${item.requirement_ids.join('|')}`}
                    item={item}
                  />
                ))}
              </Space>
            ) : null}

            {regressionScope.length > 0 ? (
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <Title level={5} style={{ margin: 0 }}>建议回归范围</Title>
                <Space wrap size={[8, 8]}>
                  {regressionScope.map((item) => (
                    <Tag key={item} color="cyan">{item}</Tag>
                  ))}
                </Space>
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

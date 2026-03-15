import React from 'react';
import { Card, Table, Tag, Typography, Alert } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { AIAnalysis, AICost } from '../../types';

const { Text } = Typography;

interface AISuggestionsProps {
  analysis: AIAnalysis | null;
  cost: AICost | null;
}

const AISuggestions: React.FC<AISuggestionsProps> = ({ analysis, cost }) => {
  if (!analysis) {
    return (
      <Card title="AI 分析建议" className="ai-suggestions-card" variant="borderless">
        <Text type="secondary">当前未启用 AI 辅助分析。</Text>
      </Card>
    );
  }

  if (analysis.error) {
    return (
      <Card title="AI 分析建议" className="ai-suggestions-card" variant="borderless">
        <Alert type="warning" title="AI 分析异常" description={analysis.error} showIcon />
      </Card>
    );
  }

  const riskColors: Record<string, string> = {
    high: 'error',
    medium: 'warning',
    low: 'success',
  };

  const suggestedColumns = [
    { title: '用例 ID', dataIndex: 'test_id', key: 'test_id', width: 88 },
    { title: '测试功能', dataIndex: 'test_function', key: 'test_function', width: 180 },
    { title: '测试步骤', dataIndex: 'test_steps', key: 'test_steps', ellipsis: true },
    { title: '预期结果', dataIndex: 'expected_result', key: 'expected_result', ellipsis: true },
  ];

  return (
    <Card title={<span className="ai-suggestions-card__title">AI 智能建议</span>} className="ai-suggestions-card" variant="borderless">
      {analysis.risk_assessment ? (
        <div className="suggestion-risk" style={{ marginBottom: 24 }}>
          <Text strong>风险评估等级</Text>
          <Tag color={riskColors[analysis.risk_assessment] || 'default'}>
            {analysis.risk_assessment.toUpperCase()}
          </Tag>
        </div>
      ) : null}

      {analysis.coverage_gaps ? (
        <Alert
          type="info"
          icon={<WarningOutlined />}
          title="覆盖缺口分析"
          description={analysis.coverage_gaps}
          showIcon
          style={{ marginBottom: 24 }}
        />
      ) : null}

      {analysis.suggested_test_cases && analysis.suggested_test_cases.length > 0 ? (
        <div className="suggestion-section" style={{ marginBottom: 24 }}>
          <div className="suggestion-section__head">
            <div className="suggestion-section__bar" />
            <Text strong>建议补充用例</Text>
          </div>
          <Table
            dataSource={analysis.suggested_test_cases}
            columns={suggestedColumns}
            rowKey="test_id"
            pagination={false}
            size="small"
            rowClassName="glass-table-row"
          />
        </div>
      ) : null}

      {analysis.improvement_suggestions && analysis.improvement_suggestions.length > 0 ? (
        <div className="suggestion-section" style={{ marginBottom: 24 }}>
          <div className="suggestion-section__head">
            <div className="suggestion-section__bar suggestion-section__bar--gold" />
            <Text strong>代码改进建议</Text>
          </div>
          <div className="suggestion-block">
            <ul className="suggestion-list">
              {analysis.improvement_suggestions.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {cost ? (
        <div className="suggestion-cost">
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>本次分析消耗</Text>
          <div className="suggestion-cost-grid">
            <div className="suggestion-cost-item">
              <span className="suggestion-cost-item__label">Token</span>
              <span className="suggestion-cost-item__value">{cost.total_tokens}</span>
            </div>
            <div className="suggestion-cost-item">
              <span className="suggestion-cost-item__label">输入</span>
              <span className="suggestion-cost-item__value">¥ {cost.input_cost.toFixed(4)}</span>
            </div>
            <div className="suggestion-cost-item">
              <span className="suggestion-cost-item__label">输出</span>
              <span className="suggestion-cost-item__value">¥ {cost.output_cost.toFixed(4)}</span>
            </div>
            <div className="suggestion-cost-item">
              <span className="suggestion-cost-item__label">总计</span>
              <span className="suggestion-cost-item__value suggestion-cost-item__value--accent">¥ {cost.total_cost.toFixed(4)}</span>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
};

export default AISuggestions;

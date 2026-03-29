import React from 'react';
import { Card, Empty, Typography } from 'antd';
import type { CodeTestSuggestionItem } from '../../utils/testSuggestions';

const { Text } = Typography;

interface TestSuggestionsProps {
  requirementSuggestions: string[];
  codeSuggestions: CodeTestSuggestionItem[];
}

const TestSuggestions: React.FC<TestSuggestionsProps> = ({
  requirementSuggestions,
  codeSuggestions,
}) => {
  const renderSuggestionList = (items: string[]) => (
    items.length > 0 ? (
      <div className="test-suggestions__list">
        {items.map((item) => (
          <div key={item} className="test-suggestions__item">
            {item}
          </div>
        ))}
      </div>
    ) : (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Text type="secondary">当前没有可展示的需求映射建议</Text>}
      />
    )
  );

  const renderCodeSuggestions = () => (
    codeSuggestions.length > 0 ? (
      <div className="test-suggestions__list">
        {codeSuggestions.map((item) => (
          <div key={item.key} className="test-suggestions__item">
            <div className="test-suggestions__method">
              {`${item.package_name}.${item.class_name}.${item.method_name}`}
            </div>
            {item.description ? (
              <div className="test-suggestions__meta">
                {`功能说明：${item.description}`}
              </div>
            ) : null}
            <div>{`测试点：${item.test_point}`}</div>
          </div>
        ))}
      </div>
    ) : (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={<Text type="secondary">当前没有命中已配置测试点的改动方法</Text>}
      />
    )
  );

  return (
    <Card variant="borderless" className="test-suggestions-card">
      <div className="test-suggestions">
        <div className="test-suggestions__title">测试建议</div>

        <div className="test-suggestions__row">
          <div className="test-suggestions__label">需求映射建议</div>
          <div className="test-suggestions__content">
            {renderSuggestionList(requirementSuggestions)}
          </div>
        </div>

        <div className="test-suggestions__row">
          <div className="test-suggestions__label">代码映射建议</div>
          <div className="test-suggestions__content">
            {renderCodeSuggestions()}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TestSuggestions;

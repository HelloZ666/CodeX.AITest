import React, { useMemo } from 'react';
import {
  Alert,
  Card,
  Col,
  Collapse,
  Descriptions,
  Empty,
  Row,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { CollapseProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type {
  MatchedProductionIssue,
  MatchedTestIssue,
  RequirementAIAnalysis,
  RequirementAIRiskItem,
  RequirementAlertItem,
  RequirementAnalysisResult,
  RequirementPoint,
  RequirementPointHit,
  RequirementRiskLevel,
  RequirementSuggestionItem,
} from '../../types';

const { Paragraph, Text, Title } = Typography;

interface RequirementAnalysisResultProps {
  result: RequirementAnalysisResult;
}

interface DisplayRiskRow extends RequirementAIRiskItem {
  section_label: string;
}

const riskLevelColorMap: Record<RequirementRiskLevel, string> = {
  高: 'error',
  中: 'warning',
  低: 'success',
};

const metricCardStyle: React.CSSProperties = {
  height: '100%',
  border: '1px solid rgba(79, 124, 255, 0.08)',
  boxShadow: '0 10px 24px rgba(15, 34, 60, 0.06)',
};

const StatisticLabel: React.FC<{ title: string; value: React.ReactNode; hint?: string }> = ({ title, value, hint }) => (
  <Space orientation="vertical" size={6}>
    <Text type="secondary">{title}</Text>
    <Title level={3} style={{ margin: 0 }}>{value}</Title>
    {hint && <Text type="secondary">{hint}</Text>}
  </Space>
);

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function renderPointTag(point: Pick<RequirementPoint, 'point_id' | 'section_number' | 'section_title'>) {
  return (
    <Space wrap size={[8, 8]}>
      <Tag color="blue">{point.point_id}</Tag>
      <Tag>{`${point.section_number} ${point.section_title}`}</Tag>
    </Space>
  );
}

function renderRiskLevelTag(level: RequirementRiskLevel) {
  return <Tag color={riskLevelColorMap[level]}>{level}风险</Tag>;
}

function buildRuleSummary(result: RequirementAnalysisResult): string {
  if (result.overview.matched_requirements === 0) {
    return '本次需求未与历史生产问题或项目测试问题形成直接命中，可先按常规功能、异常流和边界场景补充基础验证。';
  }

  return (
    `本次共识别 ${result.overview.matched_requirements} 个命中需求点，` +
    `其中生产问题命中 ${result.overview.production_hit_count} 条，测试问题命中 ${result.overview.test_hit_count} 条，` +
    '建议优先处理同时命中历史生产与测试问题的需求点。'
  );
}

function buildFallbackFindings(result: RequirementAnalysisResult): string[] {
  const findings: string[] = [];

  if (result.overview.matched_requirements > 0) {
    findings.push(`已命中 ${result.overview.matched_requirements} 个需求点，可优先安排重点回归。`);
  } else {
    findings.push('本次未命中历史问题库，建议补充基础功能与边界验证。');
  }

  if (result.overview.production_hit_count > 0) {
    findings.push(`存在 ${result.overview.production_hit_count} 条生产问题关联信号，需关注历史线上风险复发。`);
  }

  if (result.overview.test_hit_count > 0) {
    findings.push(`存在 ${result.overview.test_hit_count} 条测试问题关联信号，建议补足已暴露过的测试薄弱点。`);
  }

  if (result.overview.unmatched_requirements > 0) {
    findings.push(`仍有 ${result.overview.unmatched_requirements} 个需求点未命中问题库，可纳入常规回归清单。`);
  }

  return findings.slice(0, 4);
}

function buildFallbackRiskTable(result: RequirementAnalysisResult): RequirementAIRiskItem[] {
  return result.requirement_hits.map((hit) => {
    const productionCount = hit.production_matches.length;
    const testCount = hit.test_matches.length;

    let riskLevel: RequirementRiskLevel = '低';
    if (productionCount > 0 && testCount > 0) {
      riskLevel = '高';
    } else if (productionCount > 0 || testCount > 1) {
      riskLevel = '中';
    }

    let riskReason = '当前仅发现少量历史信号，建议按常规回归覆盖。';
    if (riskLevel === '高') {
      riskReason = '同时命中生产问题和测试问题，说明历史风险信号重叠且复发概率更高。';
    } else if (riskLevel === '中') {
      riskReason = productionCount > 0
        ? '已命中历史生产问题，建议优先验证相似线上风险场景。'
        : '已命中多条测试问题，说明该类场景曾是测试薄弱点。';
    }

    return {
      requirement_point_id: hit.point_id,
      risk_level: riskLevel,
      risk_reason: riskReason,
      test_focus: hit.test_suggestion || hit.production_alert || '围绕命中关键词补充主流程、异常流和边界验证。',
    };
  });
}

function renderProductionMatches(matches: MatchedProductionIssue[]) {
  if (matches.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未命中生产问题" />;
  }

  const columns: ColumnsType<MatchedProductionIssue> = [
    {
      title: '问题行',
      dataIndex: 'row_id',
      key: 'row_id',
      width: 88,
      render: (value?: number) => value ?? '—',
    },
    {
      title: '命中字段',
      dataIndex: 'field',
      key: 'field',
      width: 128,
    },
    {
      title: '命中词',
      dataIndex: 'matched_keyword',
      key: 'matched_keyword',
      width: 144,
    },
    {
      title: '问题片段',
      dataIndex: 'source_excerpt',
      key: 'source_excerpt',
      render: (value: string) => truncateText(value, 56),
    },
  ];

  return (
    <Table
      size="small"
      pagination={false}
      rowKey={(record, index) => `${record.row_id ?? 'row'}-${record.field}-${index}`}
      columns={columns}
      dataSource={matches}
      scroll={{ x: 640 }}
    />
  );
}

function renderTestMatches(matches: MatchedTestIssue[]) {
  if (matches.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未命中测试问题" />;
  }

  const columns: ColumnsType<MatchedTestIssue> = [
    {
      title: '缺陷ID',
      dataIndex: 'defect_id',
      key: 'defect_id',
      width: 120,
      render: (value?: string) => value ?? '—',
    },
    {
      title: '命中字段',
      dataIndex: 'field',
      key: 'field',
      width: 128,
    },
    {
      title: '命中词',
      dataIndex: 'matched_keyword',
      key: 'matched_keyword',
      width: 144,
    },
    {
      title: '缺陷摘要',
      dataIndex: 'defect_summary',
      key: 'defect_summary',
      render: (value?: string) => truncateText(value || '—', 36),
    },
    {
      title: '问题片段',
      dataIndex: 'source_excerpt',
      key: 'source_excerpt',
      render: (value: string) => truncateText(value, 56),
    },
  ];

  return (
    <Table
      size="small"
      pagination={false}
      rowKey={(record, index) => `${record.defect_id ?? 'defect'}-${record.field}-${index}`}
      columns={columns}
      dataSource={matches}
      scroll={{ x: 760 }}
    />
  );
}

function buildHitPanels(requirementHits: RequirementPointHit[]): CollapseProps['items'] {
  return requirementHits.map((hit) => ({
    key: hit.point_id,
    label: (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <Space wrap>
          {renderPointTag(hit)}
        </Space>
        <Space wrap>
          <Tag color="red">生产命中 {hit.production_matches.length}</Tag>
          <Tag color="green">测试命中 {hit.test_matches.length}</Tag>
        </Space>
      </div>
    ),
    children: (
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <Descriptions size="small" bordered column={1}>
          <Descriptions.Item label="命中概况">
            {`生产问题 ${hit.production_matches.length} 条，测试问题 ${hit.test_matches.length} 条`}
          </Descriptions.Item>
        </Descriptions>

        {hit.production_alert && (
          <Alert type="warning" showIcon title="生产问题注意点" description={hit.production_alert} />
        )}
        {hit.test_suggestion && (
          <Alert type="success" showIcon title="测试建议" description={hit.test_suggestion} />
        )}

        <Row gutter={[16, 16]}>
          <Col xs={24}>
            <Card size="small" title="生产问题命中证据">
              {renderProductionMatches(hit.production_matches)}
            </Card>
          </Col>
          <Col xs={24}>
            <Card size="small" title="测试问题命中证据">
              {renderTestMatches(hit.test_matches)}
            </Card>
          </Col>
        </Row>
      </Space>
    ),
  }));
}

const RequirementAnalysisResultView: React.FC<RequirementAnalysisResultProps> = ({ result }) => {
  const sourceFiles = result.source_files;
  const aiAnalysis: RequirementAIAnalysis | null = result.ai_analysis;
  const aiEnabled = aiAnalysis?.enabled ?? result.overview.use_ai;

  const pointLookup = useMemo(() => {
    const lookup = new Map<string, RequirementPoint>();
    result.requirement_hits.forEach((item) => {
      lookup.set(item.point_id, item);
    });
    result.unmatched_requirements.forEach((item) => {
      lookup.set(item.point_id, item);
    });
    return lookup;
  }, [result.requirement_hits, result.unmatched_requirements]);

  const fallbackRiskTable = useMemo(
    () => buildFallbackRiskTable(result),
    [result],
  );

  const displayedRiskTable = useMemo<DisplayRiskRow[]>(() => {
    const riskTable = aiAnalysis?.risk_table?.length ? aiAnalysis.risk_table : fallbackRiskTable;
    return riskTable.map((item) => {
      const point = pointLookup.get(item.requirement_point_id);
      return {
        ...item,
        section_label: point ? `${point.section_number} ${point.section_title}` : '—',
      };
    });
  }, [aiAnalysis?.risk_table, fallbackRiskTable, pointLookup]);

  const displayedSummary = aiAnalysis?.summary || buildRuleSummary(result);
  const displayedFindings = aiAnalysis?.key_findings?.length ? aiAnalysis.key_findings : buildFallbackFindings(result);
  const displayedAssessment = aiAnalysis?.overall_assessment || '以规则命中结果为主';
  const riskTableSource = aiAnalysis?.risk_table?.length ? 'AI 评估' : '规则估算';

  const productionAlertColumns: ColumnsType<RequirementAlertItem> = [
    {
      title: '需求点',
      dataIndex: 'requirement_point_id',
      key: 'requirement_point_id',
      width: 110,
    },
    {
      title: '章节',
      key: 'section',
      width: 160,
      render: (_value: unknown, record) => `${record.section_number} ${record.section_title}`,
    },
    {
      title: '命中数',
      dataIndex: 'match_count',
      key: 'match_count',
      width: 90,
    },
    {
      title: '注意点',
      dataIndex: 'alert',
      key: 'alert',
      render: (value: string) => truncateText(value, 64),
    },
  ];

  const testSuggestionColumns: ColumnsType<RequirementSuggestionItem> = [
    {
      title: '需求点',
      dataIndex: 'requirement_point_id',
      key: 'requirement_point_id',
      width: 110,
    },
    {
      title: '章节',
      key: 'section',
      width: 160,
      render: (_value: unknown, record) => `${record.section_number} ${record.section_title}`,
    },
    {
      title: '命中数',
      dataIndex: 'match_count',
      key: 'match_count',
      width: 90,
    },
    {
      title: '测试建议',
      dataIndex: 'suggestion',
      key: 'suggestion',
      render: (value: string) => truncateText(value, 64),
    },
  ];

  const riskTableColumns: ColumnsType<DisplayRiskRow> = [
    {
      title: '需求点',
      dataIndex: 'requirement_point_id',
      key: 'requirement_point_id',
      width: 110,
    },
    {
      title: '章节',
      dataIndex: 'section_label',
      key: 'section_label',
      width: 160,
    },
    {
      title: '风险等级',
      dataIndex: 'risk_level',
      key: 'risk_level',
      width: 110,
      render: (value: RequirementRiskLevel) => renderRiskLevelTag(value),
    },
    {
      title: '风险说明',
      dataIndex: 'risk_reason',
      key: 'risk_reason',
      render: (value: string) => truncateText(value, 54),
    },
    {
      title: '测试侧重点',
      dataIndex: 'test_focus',
      key: 'test_focus',
      render: (value: string) => truncateText(value, 64),
    },
  ];

  const unmatchedColumns: ColumnsType<RequirementPoint> = [
    {
      title: '需求点',
      dataIndex: 'point_id',
      key: 'point_id',
      width: 110,
    },
    {
      title: '章节',
      key: 'section',
      width: 160,
      render: (_value: unknown, record) => `${record.section_number} ${record.section_title}`,
    },
    {
      title: '未命中需求内容',
      dataIndex: 'text',
      key: 'text',
      render: (value: string) => (
        <Paragraph style={{ marginBottom: 0 }}>
          {value}
        </Paragraph>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size="large" style={{ width: '100%' }}>
      {sourceFiles && (
        <Descriptions
          title="分析上下文"
          bordered
          size="small"
          column={{ xs: 1, sm: 1, md: 2 }}
        >
          <Descriptions.Item label="项目">{sourceFiles.project_name}</Descriptions.Item>
          <Descriptions.Item label="需求文档">{sourceFiles.requirement_file_name}</Descriptions.Item>
          <Descriptions.Item label="生产问题文件">{sourceFiles.production_issue_file_name}</Descriptions.Item>
          <Descriptions.Item label="测试问题文件">{sourceFiles.test_issue_file_name}</Descriptions.Item>
        </Descriptions>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={12} md={8} xl={4}>
          <Card style={metricCardStyle}><StatisticLabel title="需求点" value={result.overview.total_requirements} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card style={metricCardStyle}><StatisticLabel title="命中需求点" value={result.overview.matched_requirements} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card style={metricCardStyle}><StatisticLabel title="生产命中" value={result.overview.production_hit_count} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card style={metricCardStyle}><StatisticLabel title="测试命中" value={result.overview.test_hit_count} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card style={metricCardStyle}><StatisticLabel title="未命中" value={result.overview.unmatched_requirements} /></Card>
        </Col>
        <Col xs={12} md={8} xl={4}>
          <Card style={metricCardStyle}><StatisticLabel title="耗时" value={`${result.overview.duration_ms}ms`} /></Card>
        </Col>
      </Row>

      <Card title="AI 智能结论">
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <Space wrap>
            <Tag color="processing">AI 分析来源：DeepSeek</Tag>
            <Tag color={aiEnabled ? 'success' : (result.overview.use_ai ? 'warning' : 'default')}>
              {aiEnabled ? '已启用 AI' : (result.overview.use_ai ? 'AI 未配置' : '未启用 AI')}
            </Tag>
            <Tag color="cyan">风险矩阵：{riskTableSource}</Tag>
            {result.ai_cost && <Tag color="gold">Token {result.ai_cost.total_tokens}</Tag>}
            {result.ai_cost && <Tag color="purple">成本 ¥{result.ai_cost.total_cost.toFixed(6)}</Tag>}
          </Space>

          {aiAnalysis?.error && (
            <Alert type="warning" showIcon title="AI 分析未完成" description={aiAnalysis.error} />
          )}

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={11}>
              <Card size="small" style={{ height: '100%', background: 'rgba(79, 124, 255, 0.04)' }}>
                <Space orientation="vertical" size="small">
                  <Text type="secondary">总体判断</Text>
                  <Title level={4} style={{ margin: 0 }}>{displayedAssessment}</Title>
                  <Paragraph style={{ marginBottom: 0 }}>
                    {displayedSummary}
                  </Paragraph>
                </Space>
              </Card>
            </Col>
            <Col xs={24} xl={13}>
              <Card size="small" style={{ height: '100%' }}>
                <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                  <Text type="secondary">关键关注点</Text>
                  {displayedFindings.length === 0 ? (
                    <Text type="secondary">暂无补充关注点。</Text>
                  ) : (
                    displayedFindings.map((item, index) => (
                      <div key={`${item}-${index}`} style={{ display: 'flex', gap: 8 }}>
                        <Text strong>{`${index + 1}.`}</Text>
                        <Text>{item}</Text>
                      </div>
                    ))
                  )}
                </Space>
              </Card>
            </Col>
          </Row>

          <Card
            size="small"
            title="风险等级矩阵"
            extra={<Tag color="blue">{riskTableSource}</Tag>}
          >
            {displayedRiskTable.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前没有可展示的风险等级数据" />
            ) : (
              <Table
                size="small"
                pagination={false}
                rowKey="requirement_point_id"
                columns={riskTableColumns}
                dataSource={displayedRiskTable}
                scroll={{ x: 860 }}
              />
            )}
          </Card>
        </Space>
      </Card>

      <Card title="生产问题注意点" extra={<Tag color="red">共 {result.production_alerts.length} 项</Tag>}>
        {result.production_alerts.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未命中历史生产问题" />
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="requirement_point_id"
            columns={productionAlertColumns}
            dataSource={result.production_alerts}
            scroll={{ x: 720 }}
          />
        )}
      </Card>

      <Card title="测试建议" extra={<Tag color="green">共 {result.test_suggestions.length} 项</Tag>}>
        {result.test_suggestions.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未命中历史测试问题" />
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="requirement_point_id"
            columns={testSuggestionColumns}
            dataSource={result.test_suggestions}
            scroll={{ x: 720 }}
          />
        )}
      </Card>

      <Card title="逐条命中明细" extra={<Tag color="processing">已隐藏需求正文</Tag>}>
        {result.requirement_hits.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无命中明细" />
        ) : (
          <Collapse items={buildHitPanels(result.requirement_hits)} />
        )}
      </Card>

      <Card title="未命中需求点" extra={<Tag>共 {result.unmatched_requirements.length} 项</Tag>}>
        {result.unmatched_requirements.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="所有需求点均已命中问题库" />
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="point_id"
            columns={unmatchedColumns}
            dataSource={result.unmatched_requirements}
            scroll={{ x: 720 }}
          />
        )}
      </Card>
    </Space>
  );
};

export default RequirementAnalysisResultView;

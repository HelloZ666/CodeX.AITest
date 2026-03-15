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
  RequirementAIAnalysis,
  RequirementAIRiskItem,
  RequirementAnalysisResult,
  RequirementMappingMatch,
  RequirementPoint,
  RequirementPointHit,
  RequirementRiskLevel,
} from '../../types';

const { Paragraph, Text, Title } = Typography;

interface RequirementAnalysisResultProps {
  result: RequirementAnalysisResult;
}

interface DisplayRiskRow extends RequirementAIRiskItem {
  section_label: string;
}

interface DisplayMappingSuggestionRow {
  row_id: string;
  requirement_point_ids: string[];
  section_labels: string[];
  requirement_point_count: number;
  suggestion: string;
  mapping_matches: RequirementMappingMatch[];
}

interface DisplayRequirementHitGroup {
  panel_key: string;
  requirement_point_ids: string[];
  section_labels: string[];
  requirement_point_count: number;
  mapping_suggestion: string;
  mapping_matches: RequirementMappingMatch[];
}

const riskLevelColorMap: Record<string, string> = {
  高: 'error',
  中: 'warning',
  低: 'success',
};

const metricCardStyle: React.CSSProperties = {
  height: '100%',
  border: '1px solid rgba(79, 124, 255, 0.08)',
  boxShadow: '0 10px 24px rgba(15, 34, 60, 0.06)',
};

const findingCardStyle: React.CSSProperties = {
  display: 'flex',
  gap: 12,
  alignItems: 'flex-start',
  padding: '12px 14px',
  borderRadius: 14,
  background: 'linear-gradient(135deg, rgba(79, 124, 255, 0.08), rgba(79, 124, 255, 0.02))',
  border: '1px solid rgba(79, 124, 255, 0.12)',
};

const findingIndexStyle: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: '#4f7cff',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0,
  marginTop: 2,
};

const StatisticLabel: React.FC<{ title: string; value: React.ReactNode; hint?: string }> = ({ title, value, hint }) => (
  <Space orientation="vertical" size={6}>
    <Text type="secondary">{title}</Text>
    <Title level={3} style={{ margin: 0 }}>{value}</Title>
    {hint && <Text type="secondary">{hint}</Text>}
  </Space>
);

function normalizeText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
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

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function compactAssessment(value?: string): string {
  const text = normalizeText(value);
  if (!text) {
    return '聚焦映射回归';
  }

  const segments = text
    .split(/[。；;，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const compacted = segments[0] || text;
  return compacted.length > 16 ? truncateText(compacted, 16) : compacted;
}

function dedupeFindings(values: string[]): string[] {
  return uniqueStrings(values).slice(0, 4);
}

function dedupeMappingMatches(matches: RequirementMappingMatch[]): RequirementMappingMatch[] {
  const grouped = new Map<string, RequirementMappingMatch>();

  matches.forEach((match) => {
    const key = `${normalizeText(match.tag)}::${normalizeText(match.requirement_keyword)}`;
    const existing = grouped.get(key);
    const normalizedMatch: RequirementMappingMatch = {
      ...match,
      group_id: normalizeText(match.group_id) || key,
      tag: normalizeText(match.tag),
      requirement_keyword: normalizeText(match.requirement_keyword),
      matched_requirement_keyword: normalizeText(match.matched_requirement_keyword ?? '') || null,
      matched_scenarios: uniqueStrings(match.matched_scenarios ?? []),
      related_scenarios: uniqueStrings(match.related_scenarios ?? []),
      additional_scenarios: uniqueStrings(match.additional_scenarios ?? []),
    };

    if (!existing) {
      grouped.set(key, normalizedMatch);
      return;
    }

    grouped.set(key, {
      ...existing,
      matched_requirement_keyword: existing.matched_requirement_keyword || normalizedMatch.matched_requirement_keyword,
      matched_scenarios: uniqueStrings([...existing.matched_scenarios, ...normalizedMatch.matched_scenarios]),
      related_scenarios: uniqueStrings([...existing.related_scenarios, ...normalizedMatch.related_scenarios]),
      additional_scenarios: uniqueStrings([...existing.additional_scenarios, ...normalizedMatch.additional_scenarios]),
    });
  });

  return Array.from(grouped.values());
}

function buildMappingMatchKey(match: Pick<RequirementMappingMatch, 'tag' | 'requirement_keyword'>): string {
  return `${normalizeText(match.tag)}::${normalizeText(match.requirement_keyword)}`;
}

function buildAggregatedMappingSuggestion(suggestions: string[], requirementPointCount: number): string {
  const uniqueSuggestions = uniqueStrings(suggestions);
  if (uniqueSuggestions.length <= 1) {
    return uniqueSuggestions[0] ?? '';
  }

  return `同一映射组命中 ${requirementPointCount} 个需求点，建议合并纳入统一回归范围。`;
}

function buildRequirementHitGroupKey(matches: RequirementMappingMatch[]): string {
  return dedupeMappingMatches(matches)
    .map((match) => buildMappingMatchKey(match))
    .sort()
    .join('||');
}

function dedupeRequirementHits(requirementHits: RequirementPointHit[]): RequirementPointHit[] {
  const grouped = new Map<string, RequirementPointHit>();

  requirementHits.forEach((hit) => {
    const pointId = normalizeText(hit.point_id);
    const normalizedHit: RequirementPointHit = {
      ...hit,
      point_id: pointId,
      section_number: normalizeText(hit.section_number),
      section_title: normalizeText(hit.section_title),
      text: normalizeText(hit.text),
      mapping_suggestion: normalizeText(hit.mapping_suggestion),
      mapping_matches: dedupeMappingMatches(hit.mapping_matches ?? []),
    };

    const existing = grouped.get(pointId);
    if (!existing) {
      grouped.set(pointId, normalizedHit);
      return;
    }

    grouped.set(pointId, {
      ...existing,
      mapping_suggestion: existing.mapping_suggestion || normalizedHit.mapping_suggestion,
      mapping_matches: dedupeMappingMatches([...existing.mapping_matches, ...normalizedHit.mapping_matches]),
    });
  });

  return Array.from(grouped.values());
}

function renderRiskLevelTag(level: RequirementRiskLevel) {
  return <Tag color={riskLevelColorMap[level] ?? 'default'}>{`${level}风险`}</Tag>;
}

function countRelatedScenarios(matches: RequirementMappingMatch[]): number {
  return uniqueStrings(matches.flatMap((item) => item.related_scenarios ?? [])).length;
}

function buildRuleSummary(result: RequirementAnalysisResult): string {
  if (result.overview.matched_requirements === 0) {
    return '本次未命中项目需求映射关系，建议先按主流程、异常流和边界场景补充基础验证。';
  }

  return `本次共识别 ${result.overview.matched_requirements} 个命中需求点，涉及 ${result.overview.mapping_hit_count} 组需求映射关系，建议把同组关联场景一并纳入测试范围。`;
}

function buildFallbackFindings(result: RequirementAnalysisResult): string[] {
  const findings: string[] = [];
  const expandedPointCount = result.requirement_hits.filter((item) => (
    item.mapping_matches.some((match) => match.additional_scenarios.length > 0)
  )).length;

  if (result.overview.matched_requirements > 0) {
    findings.push(`已命中 ${result.overview.matched_requirements} 个需求点，可优先安排映射扩展回归。`);
  } else {
    findings.push('本次未命中需求映射关系，建议补充基础功能与边界验证。');
  }

  if (result.overview.mapping_hit_count > 0) {
    findings.push(`存在 ${result.overview.mapping_hit_count} 组需求映射命中，建议将同组关联场景一并纳入测试范围。`);
  }

  if (expandedPointCount > 0) {
    findings.push(`有 ${expandedPointCount} 个需求点命中组内场景，需要同步覆盖同层级其他关联场景。`);
  }

  if (result.overview.unmatched_requirements > 0) {
    findings.push(`仍有 ${result.overview.unmatched_requirements} 个需求点未命中映射关系，可纳入常规回归清单。`);
  }

  return findings.slice(0, 4);
}

function buildFallbackRiskTable(result: RequirementAnalysisResult): RequirementAIRiskItem[] {
  return dedupeRequirementHits(result.requirement_hits).map((hit) => {
    const mappingMatches = hit.mapping_matches;
    const groupCount = mappingMatches.length;
    const relatedScenarioCount = countRelatedScenarios(mappingMatches);
    const additionalScenarioCount = mappingMatches.reduce(
      (count, item) => count + item.additional_scenarios.length,
      0,
    );

    let riskLevel: RequirementRiskLevel = '低' as RequirementRiskLevel;
    let riskReason = '命中单组需求映射，建议按映射范围补齐验证。';

    if (groupCount >= 2 || additionalScenarioCount >= 2) {
      riskLevel = '高' as RequirementRiskLevel;
      riskReason = '同一需求点命中多个映射组，或同组需要扩展多个关联场景，测试范围扩散明显。';
    } else if (additionalScenarioCount > 0 || relatedScenarioCount >= 2) {
      riskLevel = '中' as RequirementRiskLevel;
      riskReason = additionalScenarioCount > 0
        ? '需求正文直接命中了组内场景，同层级其他关联场景也需要一并覆盖。'
        : '需求关键字命中映射组，建议补齐该组全部关联场景。';
    }

    return {
      requirement_point_id: hit.point_id,
      risk_level: riskLevel,
      risk_reason: riskReason,
      test_focus: hit.mapping_suggestion || '围绕命中的需求关键字和关联场景补充主流程、异常流和边界验证。',
    };
  });
}

function renderScenarioTagGroup(title: string, scenarios: string[], color?: string) {
  if (scenarios.length === 0) {
    return null;
  }

  return (
    <Space orientation="vertical" size={6} style={{ width: '100%' }}>
      <Text type="secondary">{title}</Text>
      <Space wrap size={[8, 8]}>
        {scenarios.map((scenario) => (
          <Tag key={`${title}-${scenario}`} color={color}>
            {scenario}
          </Tag>
        ))}
      </Space>
    </Space>
  );
}

function renderMappingScope(matches: RequirementMappingMatch[], options?: { showHitSource?: boolean }) {
  if (matches.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前未命中需求映射关系" />;
  }

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      {matches.map((match) => (
        <div
          key={match.group_id}
          style={{
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(79, 124, 255, 0.12)',
            background: 'rgba(79, 124, 255, 0.03)',
          }}
        >
          <Space wrap size={[8, 8]} style={{ marginBottom: 10 }}>
            <Tag color="blue">{match.tag}</Tag>
            <Tag>{match.requirement_keyword}</Tag>
            {match.matched_requirement_keyword ? (
              <Tag color="success">关键字命中</Tag>
            ) : match.matched_scenarios.length > 0 ? (
              <Tag color="green">场景命中</Tag>
            ) : null}
          </Space>

          <Space orientation="vertical" size={10} style={{ width: '100%' }}>
            {options?.showHitSource && match.matched_requirement_keyword ? (
              <Text type="secondary">{`命中来源：关键字 ${match.matched_requirement_keyword}`}</Text>
            ) : null}
            {options?.showHitSource && !match.matched_requirement_keyword && match.matched_scenarios.length > 0 ? (
              <Text type="secondary">{`命中来源：场景 ${match.matched_scenarios.join('、')}`}</Text>
            ) : null}
            {renderScenarioTagGroup('关联场景', match.related_scenarios)}
            {renderScenarioTagGroup('直接命中场景', match.matched_scenarios, 'green')}
            {renderScenarioTagGroup('建议补齐场景', match.additional_scenarios, 'processing')}
          </Space>
        </div>
      ))}
    </Space>
  );
}

function buildHitPanels(requirementHitGroups: DisplayRequirementHitGroup[]): CollapseProps['items'] {
  return requirementHitGroups.map((group) => {
    const scenarioCount = countRelatedScenarios(group.mapping_matches);

    return {
      key: group.panel_key,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <Space wrap>
            {group.requirement_point_ids.map((pointId) => (
              <Tag key={pointId} color="blue">{pointId}</Tag>
            ))}
            {group.section_labels.map((label) => (
              <Tag key={label}>{label}</Tag>
            ))}
          </Space>
          <Space wrap>
            <Tag color="blue">命中需求点 {group.requirement_point_count}</Tag>
            <Tag color="geekblue">映射命中 {group.mapping_matches.length}</Tag>
            <Tag color="cyan">建议场景 {scenarioCount}</Tag>
          </Space>
        </div>
      ),
      children: (
        <Space orientation="vertical" size="large" style={{ width: '100%' }}>
          <Descriptions size="small" bordered column={1}>
            <Descriptions.Item label="命中需求点">
              <Space wrap size={[8, 8]}>
                {group.requirement_point_ids.map((pointId) => (
                  <Tag key={pointId} color="blue">{pointId}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="命中概况">
              {`共聚合 ${group.requirement_point_count} 个需求点，命中需求映射 ${group.mapping_matches.length} 组，建议纳入场景 ${scenarioCount} 个`}
            </Descriptions.Item>
          </Descriptions>

          <Alert type="info" showIcon message="测试范围建议" description={group.mapping_suggestion} />

          <Card size="small" title="需求映射命中证据">
            {renderMappingScope(group.mapping_matches, { showHitSource: true })}
          </Card>
        </Space>
      ),
    };
  });
}

const RequirementAnalysisResultView: React.FC<RequirementAnalysisResultProps> = ({ result }) => {
  const sourceFiles = result.source_files;
  const aiAnalysis: RequirementAIAnalysis | null = result.ai_analysis;
  const aiEnabled = aiAnalysis?.enabled ?? result.overview.use_ai;

  const displayedRequirementHits = useMemo(
    () => dedupeRequirementHits(result.requirement_hits),
    [result.requirement_hits],
  );

  const pointLookup = useMemo(() => {
    const lookup = new Map<string, RequirementPoint>();
    displayedRequirementHits.forEach((item) => {
      lookup.set(item.point_id, item);
    });
    result.unmatched_requirements.forEach((item) => {
      lookup.set(item.point_id, item);
    });
    return lookup;
  }, [displayedRequirementHits, result.unmatched_requirements]);

  const fallbackRiskTable = useMemo(
    () => buildFallbackRiskTable({ ...result, requirement_hits: displayedRequirementHits }),
    [displayedRequirementHits, result],
  );

  const displayedRiskTable = useMemo<DisplayRiskRow[]>(() => {
    const riskTable = aiAnalysis?.risk_table?.length ? aiAnalysis.risk_table : fallbackRiskTable;
    const dedupedRows = new Map<string, DisplayRiskRow>();

    riskTable.forEach((item) => {
      const point = pointLookup.get(item.requirement_point_id);
      if (!point || dedupedRows.has(item.requirement_point_id)) {
        return;
      }
      dedupedRows.set(item.requirement_point_id, {
        ...item,
        section_label: `${point.section_number} ${point.section_title}`,
      });
    });

    return Array.from(dedupedRows.values());
  }, [aiAnalysis?.risk_table, fallbackRiskTable, pointLookup]);

  const displayedSummary = normalizeText(aiAnalysis?.summary) || buildRuleSummary(result);
  const displayedFindings = dedupeFindings(
    aiAnalysis?.key_findings?.length ? aiAnalysis.key_findings : buildFallbackFindings(result),
  );
  const displayedAssessment = compactAssessment(aiAnalysis?.overall_assessment);
  const riskTableSource = aiAnalysis?.risk_table?.length ? 'AI 评估' : '规则估算';

  const displayedMappingSuggestions = useMemo<DisplayMappingSuggestionRow[]>(() => {
    const grouped = new Map<string, DisplayMappingSuggestionRow & { source_suggestions: string[] }>();

    displayedRequirementHits.forEach((hit) => {
      const pointId = normalizeText(hit.point_id);
      const sectionLabel = `${normalizeText(hit.section_number)} ${normalizeText(hit.section_title)}`.trim();
      const pointSuggestion = normalizeText(hit.mapping_suggestion);

      hit.mapping_matches.forEach((rawMatch) => {
        const normalizedMatch = dedupeMappingMatches([rawMatch])[0];
        if (!normalizedMatch) {
          return;
        }

        const rowKey = buildMappingMatchKey(normalizedMatch);
        const existing = grouped.get(rowKey);

        if (!existing) {
          grouped.set(rowKey, {
            row_id: rowKey,
            requirement_point_ids: pointId ? [pointId] : [],
            section_labels: sectionLabel ? [sectionLabel] : [],
            requirement_point_count: pointId ? 1 : 0,
            suggestion: '',
            mapping_matches: [normalizedMatch],
            source_suggestions: pointSuggestion ? [pointSuggestion] : [],
          });
          return;
        }

        const nextPointIds = pointId
          ? uniqueStrings([...existing.requirement_point_ids, pointId])
          : existing.requirement_point_ids;
        grouped.set(rowKey, {
          ...existing,
          requirement_point_ids: nextPointIds,
          section_labels: sectionLabel
            ? uniqueStrings([...existing.section_labels, sectionLabel])
            : existing.section_labels,
          requirement_point_count: nextPointIds.length,
          mapping_matches: dedupeMappingMatches([...existing.mapping_matches, normalizedMatch]),
          source_suggestions: pointSuggestion
            ? uniqueStrings([...existing.source_suggestions, pointSuggestion])
            : existing.source_suggestions,
        });
      });
    });

    return Array.from(grouped.values()).map(({ source_suggestions, ...row }) => ({
      ...row,
      requirement_point_count: row.requirement_point_ids.length,
      suggestion: buildAggregatedMappingSuggestion(source_suggestions, row.requirement_point_ids.length),
    }));
  }, [displayedRequirementHits]);

  const displayedRequirementHitGroups = useMemo<DisplayRequirementHitGroup[]>(() => {
    const grouped = new Map<string, DisplayRequirementHitGroup & { source_suggestions: string[] }>();

    displayedRequirementHits.forEach((hit) => {
      const normalizedMatches = dedupeMappingMatches(hit.mapping_matches);
      const groupKey = buildRequirementHitGroupKey(normalizedMatches);
      if (!groupKey) {
        return;
      }

      const pointId = normalizeText(hit.point_id);
      const sectionLabel = `${normalizeText(hit.section_number)} ${normalizeText(hit.section_title)}`.trim();
      const pointSuggestion = normalizeText(hit.mapping_suggestion);
      const existing = grouped.get(groupKey);

      if (!existing) {
        grouped.set(groupKey, {
          panel_key: groupKey,
          requirement_point_ids: pointId ? [pointId] : [],
          section_labels: sectionLabel ? [sectionLabel] : [],
          requirement_point_count: pointId ? 1 : 0,
          mapping_suggestion: '',
          mapping_matches: normalizedMatches,
          source_suggestions: pointSuggestion ? [pointSuggestion] : [],
        });
        return;
      }

      const nextPointIds = pointId
        ? uniqueStrings([...existing.requirement_point_ids, pointId])
        : existing.requirement_point_ids;
      grouped.set(groupKey, {
        ...existing,
        requirement_point_ids: nextPointIds,
        section_labels: sectionLabel
          ? uniqueStrings([...existing.section_labels, sectionLabel])
          : existing.section_labels,
        requirement_point_count: nextPointIds.length,
        mapping_matches: dedupeMappingMatches([...existing.mapping_matches, ...normalizedMatches]),
        source_suggestions: pointSuggestion
          ? uniqueStrings([...existing.source_suggestions, pointSuggestion])
          : existing.source_suggestions,
      });
    });

    return Array.from(grouped.values()).map(({ source_suggestions, ...group }) => ({
      ...group,
      requirement_point_count: group.requirement_point_ids.length,
      mapping_suggestion: buildAggregatedMappingSuggestion(source_suggestions, group.requirement_point_ids.length),
    }));
  }, [displayedRequirementHits]);

  const mappingSuggestionColumns: ColumnsType<DisplayMappingSuggestionRow> = [
    {
      title: '需求点',
      dataIndex: 'requirement_point_ids',
      key: 'requirement_point_ids',
      width: 160,
      render: (value: string[]) => (
        <Space wrap size={[8, 8]}>
          {value.map((pointId) => (
            <Tag key={pointId} color="blue">{pointId}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '章节',
      dataIndex: 'section_labels',
      key: 'section_labels',
      width: 200,
      render: (value: string[]) => (
        <Space wrap size={[8, 8]}>
          {value.map((label) => (
            <Tag key={label}>{label}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '命中需求点数',
      dataIndex: 'requirement_point_count',
      key: 'requirement_point_count',
      width: 110,
    },
    {
      title: '测试范围建议',
      dataIndex: 'mapping_matches',
      key: 'mapping_matches',
      render: (_value: RequirementMappingMatch[], record) => (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          {renderMappingScope(record.mapping_matches)}
          {record.suggestion ? (
            <Text type="secondary">{record.suggestion}</Text>
          ) : null}
        </Space>
      ),
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
      width: 180,
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
      render: (value: string) => truncateText(value, 56),
    },
    {
      title: '测试侧重点',
      dataIndex: 'test_focus',
      key: 'test_focus',
      render: (value: string) => truncateText(value, 68),
    },
  ];

  const mappingSourceLabel = sourceFiles?.requirement_mapping_available
    ? `${(
      sourceFiles.requirement_mapping_source_type === 'manual'
        ? '手工维护'
        : sourceFiles.requirement_mapping_source_type === 'mixed'
          ? '导入后已调整'
          : '文件导入'
    )} / ${sourceFiles.requirement_mapping_group_count ?? 0} 组${
      sourceFiles.requirement_mapping_file_name ? ` / ${sourceFiles.requirement_mapping_file_name}` : ''
    }`
    : '当前项目未配置';

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
          <Descriptions.Item label="需求映射关系">{mappingSourceLabel}</Descriptions.Item>
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
          <Card style={metricCardStyle}><StatisticLabel title="映射命中" value={result.overview.mapping_hit_count} /></Card>
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
            <Tag color="cyan">{`风险矩阵：${riskTableSource}`}</Tag>
            {result.ai_cost && <Tag color="gold">{`Token ${result.ai_cost.total_tokens}`}</Tag>}
            {result.ai_cost && <Tag color="purple">{`成本 ¥${result.ai_cost.total_cost.toFixed(6)}`}</Tag>}
          </Space>

          {aiAnalysis?.error && (
            <Alert type="warning" showIcon message="AI 分析未完成" description={aiAnalysis.error} />
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
                <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
                  <Text type="secondary">关键关注点</Text>
                  {displayedFindings.length === 0 ? (
                    <Text type="secondary">暂无补充关注点。</Text>
                  ) : (
                    displayedFindings.map((item, index) => (
                      <div key={`${item}-${index}`} style={findingCardStyle}>
                        <span style={findingIndexStyle}>{index + 1}</span>
                        <Text style={{ lineHeight: 1.7 }}>{item}</Text>
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

      <Card title="需求映射建议" extra={<Tag color="blue">{`共 ${displayedMappingSuggestions.length} 项`}</Tag>}>
        {displayedMappingSuggestions.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前需求未命中需求映射关系" />
        ) : (
          <Table
            size="small"
            pagination={false}
            rowKey="row_id"
            columns={mappingSuggestionColumns}
            dataSource={displayedMappingSuggestions}
            scroll={{ x: 960 }}
          />
        )}
      </Card>

      <Card title="逐条命中明细" extra={<Tag color="processing">已隐藏需求正文</Tag>}>
        {displayedRequirementHitGroups.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无命中明细" />
        ) : (
          <Collapse items={buildHitPanels(displayedRequirementHitGroups)} />
        )}
      </Card>
    </Space>
  );
};

export default RequirementAnalysisResultView;

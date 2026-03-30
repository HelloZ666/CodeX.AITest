import React from 'react';
import { Alert, Button, Card, Col, Descriptions, Empty, Row, Space, Spin } from 'antd';
import { ArrowLeftOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import AnalysisResult from '../components/AnalysisResult/AnalysisResult';
import AISuggestions from '../components/AISuggestions/AISuggestions';
import CaseQualityOverview from '../components/CaseQuality/CaseQualityOverview';
import DashboardHero from '../components/Layout/DashboardHero';
import RequirementAnalysisResultView from '../components/RequirementAnalysis/RequirementAnalysisResult';
import ScoreCard from '../components/ScoreCard/ScoreCard';
import TestSuggestions from '../components/TestSuggestions/TestSuggestions';
import type {
  AnalyzeData,
  CaseQualityCombinedReport,
  CaseQualityCombinedSummary,
  ProjectAnalyzeData,
  RequirementAnalysisResult,
} from '../types';
import { getCaseQualityRecord, getProject } from '../utils/api';
import { normalizeCodeMappingEntries } from '../utils/codeMapping';
import { buildCodeTestSuggestions, buildRequirementTestSuggestions } from '../utils/testSuggestions';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

function resolveCombinedSummary(combined: CaseQualityCombinedReport | null): CaseQualityCombinedSummary | null {
  if (!combined) {
    return null;
  }

  return (combined.overview ?? combined.summary ?? null) as CaseQualityCombinedSummary | null;
}

function resolveRequirementSnapshot(combined: CaseQualityCombinedReport | null): RequirementAnalysisResult | null {
  return (combined?.requirement_report ?? null) as RequirementAnalysisResult | null;
}

function resolveCaseSnapshot(combined: CaseQualityCombinedReport | null): ProjectAnalyzeData | AnalyzeData | null {
  return (combined?.case_report ?? null) as ProjectAnalyzeData | AnalyzeData | null;
}

export function resolveCaseCount(caseSnapshot: ProjectAnalyzeData | AnalyzeData | null): number | null {
  const directCount = caseSnapshot?.test_case_count;
  if (typeof directCount === 'number' && Number.isFinite(directCount)) {
    return directCount;
  }

  const dimensions = caseSnapshot?.score?.dimensions ?? [];
  const candidates = dimensions.flatMap((dimension) => {
    const details = dimension.details;
    if (!details) {
      return [];
    }

    const matches = [
      details.match(/\((\d+)个用例\)/),
      details.match(/\((\d+)[^)]*\)/),
      details.match(/用例\/方法比\s*(\d+)\//),
      details.match(/边界用例\s*\d+\/(\d+)/),
    ];

    return matches
      .map((match) => (match ? Number(match[1]) : null))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  });

  if (candidates.length === 0) {
    return null;
  }

  return Math.max(...candidates);
}

const CaseQualityRecordDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const params = useParams();
  const recordId = Number(params.id);

  const detailQuery = useQuery({
    queryKey: ['case-quality-record', recordId],
    queryFn: () => getCaseQualityRecord(recordId),
    enabled: Number.isFinite(recordId) && recordId > 0,
  });

  const projectQuery = useQuery({
    queryKey: ['project', detailQuery.data?.project_id],
    queryFn: () => getProject(detailQuery.data?.project_id as number),
    enabled: Boolean(detailQuery.data?.project_id),
  });

  if (!Number.isFinite(recordId) || recordId <= 0) {
    return <Alert type="error" showIcon message="无效记录 ID" />;
  }

  if (detailQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />;
  }

  if (!detailQuery.data) {
    return <Empty description="未找到记录详情" />;
  }

  const detail = detailQuery.data;
  const combinedSummary = resolveCombinedSummary(detail.combined_result_snapshot);
  const requirementSnapshot = detail.requirement_result_snapshot ?? resolveRequirementSnapshot(detail.combined_result_snapshot);
  const caseSnapshot = detail.case_result_snapshot ?? resolveCaseSnapshot(detail.combined_result_snapshot);
  const totalChangedMethods = caseSnapshot?.coverage.total_changed_methods ?? null;
  const caseCount = resolveCaseCount(caseSnapshot);
  const coveredCount = caseSnapshot?.coverage.covered.length ?? null;
  const uncoveredCount = caseSnapshot?.coverage.uncovered.length ?? null;
  const coverageRate = caseSnapshot?.coverage.coverage_rate ?? null;
  const mappingHitCount = requirementSnapshot?.overview.mapping_hit_count ?? null;
  const caseScore = caseSnapshot?.score.total_score ?? detail.case_score ?? combinedSummary?.case_score ?? null;
  const mappingEntries = normalizeCodeMappingEntries(projectQuery.data?.mapping_data);
  const requirementSuggestions = buildRequirementTestSuggestions(requirementSnapshot);
  const codeSuggestions = buildCodeTestSuggestions(caseSnapshot?.coverage, mappingEntries);

  return (
    <div>
      <DashboardHero
        title={`案例质检记录 #${detail.id}`}
        actions={(
          <Space wrap>
            <Button icon={<ArrowLeftOutlined />} size="large" onClick={() => navigate('/functional-testing/records')}>
              返回分析记录
            </Button>
            <Button
              type="primary"
              size="large"
              icon={<SafetyCertificateOutlined />}
              onClick={() => navigate('/functional-testing/case-quality')}
            >
              新建案例质检
            </Button>
          </Space>
        )}
      />

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card variant="borderless" title="综合记录概览">
          <CaseQualityOverview
            caseScore={caseScore}
            caseCount={caseCount}
            totalChangedMethods={totalChangedMethods}
            coveredCount={coveredCount}
            uncoveredCount={uncoveredCount}
            mappingHitCount={mappingHitCount}
            coverageRate={coverageRate}
          />
        </Card>

        <Card variant="borderless">
          <Descriptions column={{ xs: 1, md: 2, xl: 3 }} bordered size="small">
            <Descriptions.Item label="项目">{detail.project_name || `#${detail.project_id}`}</Descriptions.Item>
            <Descriptions.Item label="需求文档">{detail.requirement_file_name}</Descriptions.Item>
            <Descriptions.Item label="代码改动文件">{detail.code_changes_file_name}</Descriptions.Item>
            <Descriptions.Item label="测试用例文件">{detail.test_cases_file_name}</Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDateTime(detail.created_at)}</Descriptions.Item>
            <Descriptions.Item label="需求记录 ID">{detail.requirement_analysis_record_id}</Descriptions.Item>
            <Descriptions.Item label="案例记录 ID">{detail.analysis_record_id}</Descriptions.Item>
          </Descriptions>
        </Card>

        <TestSuggestions
          requirementSuggestions={requirementSuggestions}
          codeSuggestions={codeSuggestions}
        />

        <Card variant="borderless" title="需求分析部分">
          {requirementSnapshot ? (
            <RequirementAnalysisResultView result={requirementSnapshot} hideAi summaryMode />
          ) : (
            <Empty description="暂无需求分析快照" />
          )}
        </Card>

        <Card variant="borderless" title="案例分析部分">
          {caseSnapshot ? (
            <Row gutter={[24, 24]}>
              <Col xs={24} lg={16}>
                <AnalysisResult diffAnalysis={caseSnapshot.diff_analysis} coverage={caseSnapshot.coverage} />
              </Col>
              <Col xs={24} lg={8}>
                <ScoreCard score={caseSnapshot.score} />
              </Col>
              <Col span={24}>
                <AISuggestions analysis={caseSnapshot.ai_analysis} usage={caseSnapshot.ai_cost} />
              </Col>
            </Row>
          ) : (
            <Empty description="暂无案例分析快照" />
          )}
        </Card>
      </Space>
    </div>
  );
};

export default CaseQualityRecordDetailPage;

// 分析结果类型定义

/** 单个文件的diff信息 */
export interface DiffFile {
  package: string;
  added: number;
  removed: number;
}

/** diff分析结果 */
export interface DiffAnalysis {
  total_files: number;
  total_added: number;
  total_removed: number;
  files: DiffFile[];
}

/** 覆盖详情 */
export interface CoverageDetail {
  method: string;
  description: string;
  is_covered: boolean;
  matched_tests: string[];
}

/** 覆盖分析结果 */
export interface CoverageResult {
  total_changed_methods: number;
  covered: string[];
  uncovered: string[];
  coverage_rate: number;
  details: CoverageDetail[];
}

/** 评分维度 */
export interface ScoreDimension {
  dimension: string;
  score: number;
  weight: number;
  weighted_score: number;
  details: string;
}

/** 评分结果 */
export interface ScoreResult {
  total_score: number;
  grade: string;
  summary: string;
  dimensions: ScoreDimension[];
}

/** AI建议的测试用例 */
export interface SuggestedTestCase {
  test_id: string;
  test_function: string;
  test_steps: string;
  expected_result: string;
}

/** AI分析结果 */
export interface AIAnalysis {
  uncovered_methods?: string[];
  coverage_gaps?: string;
  suggested_test_cases?: SuggestedTestCase[];
  risk_assessment?: string;
  improvement_suggestions?: string[];
  error?: string;
}

/** 成本信息 */
export interface AICost {
  input_cost: number;
  output_cost: number;
  total_cost: number;
  total_tokens: number;
}

/** 完整分析结果 */
export interface AnalyzeData {
  diff_analysis: DiffAnalysis;
  coverage: CoverageResult;
  score: ScoreResult;
  ai_analysis: AIAnalysis | null;
  ai_cost: AICost | null;
  duration_ms: number;
}

/** API响应 */
export interface AnalyzeResponse {
  success: boolean;
  data?: AnalyzeData;
  error?: string;
  duration_ms?: number;
}

export interface IssueInsightChartItem {
  name: string;
  count: number;
  ratio: number;
}

export interface IssueStageHumanMatrixItem {
  stage: string;
  human: number;
  non_human: number;
  unknown: number;
  total: number;
}

export interface IssueInsightOverview {
  total_records: number;
  stage_count: number;
  tag_count: number;
  human_related_count: number;
  human_related_ratio: number;
  top_stage: IssueInsightChartItem | null;
  top_tag: IssueInsightChartItem | null;
}

export interface IssueInsightSummary {
  headline: string;
  key_findings: string[];
  recommended_actions: string[];
}

export interface IssueInsightCharts {
  stage_distribution: IssueInsightChartItem[];
  human_factor_distribution: IssueInsightChartItem[];
  tag_distribution: IssueInsightChartItem[];
  issue_reason_distribution: IssueInsightChartItem[];
  reason_summary_distribution: IssueInsightChartItem[];
  action_distribution: IssueInsightChartItem[];
  stage_human_matrix: IssueStageHumanMatrixItem[];
}

export interface IssueInsightPreviewRow {
  row_id: number;
  出现该问题的原因: string;
  改善举措: string;
  发生阶段: string;
  是否人为原因: string;
  发生原因总结: string;
  标签: string[];
}

export interface IssueInsightData {
  overview: IssueInsightOverview;
  summary: IssueInsightSummary;
  charts: IssueInsightCharts;
  preview_rows: IssueInsightPreviewRow[];
}

export interface IssueInsightResponse {
  success: boolean;
  data?: IssueInsightData;
  error?: string;
  duration_ms?: number;
}

export interface DefectInsightOverview {
  total_records: number;
  severity_count: number;
  source_count: number;
  reason_count: number;
  top_severity: IssueInsightChartItem | null;
  top_source: IssueInsightChartItem | null;
}

export interface DefectInsightSummary {
  headline: string;
  key_findings: string[];
  recommended_actions: string[];
}

export interface DefectInsightCharts {
  severity_distribution: IssueInsightChartItem[];
  business_impact_distribution: IssueInsightChartItem[];
  source_distribution: IssueInsightChartItem[];
  reason_distribution: IssueInsightChartItem[];
  sub_reason_distribution: IssueInsightChartItem[];
  summary_distribution: IssueInsightChartItem[];
}

export interface DefectInsightPreviewRow {
  row_id: number;
  缺陷ID: string;
  缺陷摘要: string;
  缺陷严重度: string;
  业务影响: string;
  缺陷来源: string;
  缺陷原因: string;
  缺陷子原因: string;
}

export interface DefectInsightData {
  overview: DefectInsightOverview;
  summary: DefectInsightSummary;
  charts: DefectInsightCharts;
  preview_rows: DefectInsightPreviewRow[];
}

export interface DefectInsightResponse {
  success: boolean;
  data?: DefectInsightData;
  error?: string;
  duration_ms?: number;
}

/** 项目信息 */
export interface Project {
  id: number;
  name: string;
  description: string;
  mapping_data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** 项目统计 */
export interface ProjectStats {
  analysis_count: number;
  avg_score: number | null;
  latest_analysis: string | null;
}

/** 项目详情（含统计） */
export interface ProjectDetail extends Project {
  stats: ProjectStats;
}

/** 分析记录 */
export interface AnalysisRecord {
  id: number;
  project_id: number;
  code_changes_summary: Record<string, unknown>;
  test_coverage_result: Record<string, unknown>;
  test_score: number;
  ai_suggestions: Record<string, unknown> | null;
  token_usage: number;
  cost: number;
  duration_ms: number;
  created_at: string;
}

/** 分析记录列表项（简要） */
export interface AnalysisRecordSummary {
  id: number;
  project_id: number;
  test_score: number;
  token_usage: number;
  cost: number;
  duration_ms: number;
  created_at: string;
}

/** 带记录ID的分析响应 */
export interface ProjectAnalyzeResponse extends AnalyzeResponse {
  record_id?: number;
}

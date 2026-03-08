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

export interface ProductionIssueFileRecord {
  id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  row_count: number;
  created_at: string;
}

export interface TestIssueFileRecord {
  id: number;
  project_id: number;
  project_name: string;
  file_name: string;
  file_type: string;
  file_size: number;
  row_count: number;
  created_at: string;
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

export type UserRole = 'admin' | 'user';

export type UserStatus = 'active' | 'disabled';

export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
}

export interface UserRecord extends AuthUser {
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserListResponse {
  success: boolean;
  data: UserRecord[];
}

export interface RequirementPoint {
  point_id: string;
  section_number: string;
  section_title: string;
  text: string;
}

export interface MatchedProductionIssue {
  row_id?: number;
  field: string;
  matched_keyword: string;
  requirement_excerpt: string;
  source_excerpt: string;
}

export interface MatchedTestIssue {
  row_id?: number;
  defect_id?: string;
  defect_summary?: string;
  field: string;
  matched_keyword: string;
  requirement_excerpt: string;
  source_excerpt: string;
}

export interface RequirementAlertItem {
  requirement_point_id: string;
  section_number: string;
  section_title: string;
  requirement_text: string;
  match_count: number;
  alert: string;
}

export interface RequirementSuggestionItem {
  requirement_point_id: string;
  section_number: string;
  section_title: string;
  requirement_text: string;
  match_count: number;
  suggestion: string;
}

export interface RequirementPointHit extends RequirementPoint {
  production_matches: MatchedProductionIssue[];
  test_matches: MatchedTestIssue[];
  production_alert?: string | null;
  test_suggestion?: string | null;
}

export interface RequirementAnalysisOverview {
  total_requirements: number;
  matched_requirements: number;
  production_hit_count: number;
  test_hit_count: number;
  unmatched_requirements: number;
  use_ai: boolean;
  duration_ms: number;
}

export interface RequirementAnalysisSectionSnapshot {
  selected_mode: 'preferred_sections' | 'full_document';
  selected_sections: Array<{ number: string; title: string; block_count: number }>;
  all_sections: Array<{ number: string; title: string; block_count: number }>;
  points: RequirementPoint[];
}

export type RequirementRiskLevel = '高' | '中' | '低';

export interface RequirementAIRiskItem {
  requirement_point_id: string;
  risk_level: RequirementRiskLevel;
  risk_reason: string;
  test_focus: string;
}

export interface RequirementAIAnalysis {
  provider: string;
  enabled?: boolean;
  summary?: string;
  overall_assessment?: string;
  key_findings?: string[];
  risk_table?: RequirementAIRiskItem[];
  error?: string;
  production_alerts?: Array<{ requirement_point_id: string; alert: string }>;
  test_suggestions?: Array<{ requirement_point_id: string; suggestion: string }>;
}

export interface RequirementAnalysisSourceFiles {
  project_id: number;
  project_name: string;
  requirement_file_name: string;
  production_issue_file_id: number;
  production_issue_file_name: string;
  test_issue_file_id: number;
  test_issue_file_name: string;
}

export interface RequirementAnalysisResult {
  overview: RequirementAnalysisOverview;
  production_alerts: RequirementAlertItem[];
  test_suggestions: RequirementSuggestionItem[];
  requirement_hits: RequirementPointHit[];
  unmatched_requirements: RequirementPoint[];
  ai_analysis: RequirementAIAnalysis | null;
  ai_cost: AICost | null;
  source_files?: RequirementAnalysisSourceFiles;
  record_id?: number;
}

export interface RequirementAnalysisResponse {
  success: boolean;
  data?: RequirementAnalysisResult;
  error?: string;
  duration_ms?: number;
}

export interface RequirementAnalysisRecordSummary {
  id: number;
  project_id: number;
  project_name: string | null;
  requirement_file_name: string;
  production_issue_file_id: number;
  production_issue_file_name: string | null;
  test_issue_file_id: number;
  test_issue_file_name: string | null;
  matched_requirements: number;
  production_hit_count: number;
  test_hit_count: number;
  use_ai: boolean;
  token_usage: number;
  cost: number;
  duration_ms: number;
  created_at: string;
}

export interface RequirementAnalysisRecord extends RequirementAnalysisRecordSummary {
  section_snapshot: RequirementAnalysisSectionSnapshot;
  result_snapshot: RequirementAnalysisResult;
  ai_analysis: RequirementAIAnalysis | null;
}

export type RequirementAnalysisRuleType = 'ignore' | 'allow';
export type RequirementAnalysisRuleSource = 'default' | 'custom';

export interface RequirementAnalysisRule {
  id: number;
  rule_type: RequirementAnalysisRuleType;
  rule_source: RequirementAnalysisRuleSource;
  keyword: string;
  created_at: string;
  updated_at: string;
}

export type RequirementAnalysisRuleList = RequirementAnalysisRule[];

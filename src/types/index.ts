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

export type RequirementScoreDimension = ScoreDimension;

export type RequirementScoreResult = ScoreResult;

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
  test_case_count?: number;
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

export type AnalysisPreviewCellValue = string | number | string[] | null;

export interface AnalysisPreviewRow {
  row_id: number;
  [key: string]: AnalysisPreviewCellValue;
}

export type IssueInsightPreviewRow = AnalysisPreviewRow;

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

export type RequirementMappingSourceType = 'upload' | 'manual' | 'mixed';

export interface RequirementMappingGroup {
  id: string;
  tag: string;
  requirement_keyword: string;
  related_scenarios: string[];
}

export interface RequirementMappingRow {
  group_id: string;
  row_key: string;
  tag: string;
  requirement_keyword: string;
  related_scenario: string;
  tag_row_span: number;
  requirement_keyword_row_span: number;
  operation_row_span: number;
}

export interface RequirementMappingDetail {
  project_id: number;
  project_name: string | null;
  source_type: RequirementMappingSourceType;
  last_file_name: string | null;
  last_file_type: string | null;
  sheet_name: string | null;
  group_count: number;
  row_count: number;
  groups: RequirementMappingGroup[];
  rows: RequirementMappingRow[];
  created_at: string;
  updated_at: string;
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

export type DefectInsightPreviewRow = AnalysisPreviewRow;

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

export interface CodeMappingEntry {
  package_name: string;
  class_name: string;
  method_name: string;
  description: string;
  test_point: string;
}

/** 项目信息 */
export interface Project {
  id: number;
  name: string;
  description: string;
  mapping_data: CodeMappingEntry[] | null;
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
  score_snapshot?: ScoreResult | null;
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
export interface ProjectAnalyzeData extends AnalyzeData {
  record_id?: number;
}

export interface ProjectAnalyzeResponse extends AnalyzeResponse {
  data?: ProjectAnalyzeData;
}

export type UserRole = 'admin' | 'user';

export type UserStatus = 'active' | 'disabled';

export type AuthSource = 'local' | 'external';

export interface AuthUser {
  id: number;
  username: string;
  display_name: string;
  email: string | null;
  dept_name?: string | null;
  auth_source: AuthSource;
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

export type AuditLogResult = 'success' | 'failure';

export interface AuditLogRecord {
  id: number;
  module: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_name: string | null;
  file_name: string | null;
  result: AuditLogResult;
  detail: string | null;
  operator_user_id: number | null;
  operator_username: string | null;
  operator_display_name: string | null;
  operator_role: UserRole | null;
  request_method: string | null;
  request_path: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogListResponse {
  success: boolean;
  data: AuditLogRecord[];
  total: number;
}

export interface RequirementPoint {
  point_id: string;
  section_number: string;
  section_title: string;
  text: string;
}

export interface RequirementMappingMatch {
  group_id: string;
  tag: string;
  requirement_keyword: string;
  matched_requirement_keyword?: string | null;
  matched_scenarios: string[];
  related_scenarios: string[];
  additional_scenarios: string[];
}

export interface RequirementMappingSuggestionItem {
  requirement_point_id: string;
  section_number: string;
  section_title: string;
  requirement_text: string;
  match_count: number;
  suggestion: string;
}

export interface RequirementPointHit extends RequirementPoint {
  mapping_matches: RequirementMappingMatch[];
  mapping_suggestion: string;
}

export interface RequirementAnalysisOverview {
  total_requirements: number;
  matched_requirements: number;
  mapping_hit_count: number;
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
}

export interface RequirementAnalysisSourceFiles {
  project_id: number;
  project_name: string;
  requirement_file_name: string;
  requirement_mapping_available?: boolean;
  requirement_mapping_source_type?: RequirementMappingSourceType | null;
  requirement_mapping_file_name?: string | null;
  requirement_mapping_group_count?: number;
  requirement_mapping_updated_at?: string | null;
}

export interface RequirementAnalysisResult {
  overview: RequirementAnalysisOverview;
  score?: RequirementScoreResult | null;
  mapping_suggestions: RequirementMappingSuggestionItem[];
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
  matched_requirements: number;
  mapping_hit_count: number;
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

export interface CaseQualityCombinedSummary {
  project_id: number;
  project_name: string | null;
  requirement_analysis_record_id: number;
  analysis_record_id: number;
  requirement_score: number;
  case_score: number;
  total_token_usage: number;
  total_cost: number;
  total_duration_ms: number;
}

export interface CaseQualityCombinedReport {
  overview?: CaseQualityCombinedSummary;
  summary?: CaseQualityCombinedSummary;
  requirement_report?: RequirementAnalysisResult | null;
  case_report?: ProjectAnalyzeData | AnalyzeData | null;
  [key: string]: unknown;
}

export interface CaseQualityRecordSummary {
  id: number;
  project_id: number;
  project_name: string | null;
  requirement_analysis_record_id: number;
  analysis_record_id: number;
  requirement_file_name: string;
  code_changes_file_name: string;
  test_cases_file_name: string;
  requirement_score: number | null;
  case_score: number | null;
  total_token_usage: number;
  total_cost: number;
  total_duration_ms: number;
  created_at: string;
}

export interface CaseQualityRecordDetail extends CaseQualityRecordSummary {
  requirement_section_snapshot: RequirementAnalysisSectionSnapshot | Record<string, unknown> | null;
  requirement_result_snapshot: RequirementAnalysisResult | null;
  case_result_snapshot: ProjectAnalyzeData | AnalyzeData | null;
  combined_result_snapshot: CaseQualityCombinedReport | null;
}

export type CaseQualityStepKey =
  | 'project-select'
  | 'requirement-analysis'
  | 'case-analysis'
  | 'summary';

export interface CaseQualityDraftState {
  project_id: number | null;
  requirement_file_name: string | null;
  code_changes_file_name: string | null;
  test_cases_file_name: string | null;
  requirement_analysis_record_id: number | null;
  analysis_record_id: number | null;
}

export interface ProjectMappingEntryKey {
  package_name: string;
  class_name: string;
  method_name: string;
}

export interface UpdateProjectMappingEntryPayload {
  original_key: ProjectMappingEntryKey;
  entry: CodeMappingEntry;
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

export type ApiAutomationAuthMode =
  | 'none'
  | 'bearer'
  | 'basic'
  | 'cookie'
  | 'custom_header'
  | 'login_extract';

export interface ApiEndpointParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example: unknown;
  location: string;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  min_length?: number;
  max_length?: number;
  min_items?: number;
  max_items?: number;
}

export interface ApiEndpointDocument {
  endpoint_id: string;
  group_name: string;
  name: string;
  method: string;
  path: string;
  summary: string;
  headers: ApiEndpointParameter[];
  path_params: ApiEndpointParameter[];
  query_params: ApiEndpointParameter[];
  body_schema: Record<string, unknown>;
  response_schema: Record<string, unknown>;
  error_codes: Array<{ code: string; description: string }>;
  dependency_hints: string[];
  missing_fields: string[];
  source_type: string;
}

export interface ApiAutomationEnvironment {
  project_id: number;
  base_url: string;
  timeout_ms: number;
  auth_mode: ApiAutomationAuthMode;
  common_headers: Record<string, string>;
  auth_config: Record<string, unknown>;
  signature_template: Record<string, unknown>;
  login_binding: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
}

export interface ApiDocumentRecord {
  id: number;
  project_id: number;
  file_name: string;
  file_type: string;
  source_type: string;
  raw_text_excerpt: string;
  raw_text: string;
  endpoint_count: number;
  missing_fields: string[];
  endpoints: ApiEndpointDocument[];
  created_at: string;
}

export interface ApiAssertionRule {
  type: string;
  operator: string;
  path: string;
  expected: unknown;
  actual?: unknown;
  passed?: boolean;
}

export interface ApiExtractRule {
  source: string;
  path: string;
  target_key: string;
}

export interface ApiTestCaseDraft {
  case_id: string;
  endpoint_id: string;
  enabled: boolean;
  test_scene: string;
  title: string;
  precondition: string;
  request_method: string;
  request_url: string;
  request_headers: Record<string, unknown>;
  request_params: Record<string, unknown>;
  request_body: unknown;
  expected_status_code: number;
  expected_response_keywords: string[];
  expected_db_check: string;
  test_level: string;
  assertions: ApiAssertionRule[];
  extract_rules: ApiExtractRule[];
  depends_on: string[];
  source: string;
  missing_fields: string[];
  request_options: Record<string, unknown>;
  sort_index: number;
}

export interface ApiTestSuite {
  id: number;
  project_id: number;
  document_record_id: number | null;
  name: string;
  endpoints: ApiEndpointDocument[];
  cases: ApiTestCaseDraft[];
  ai_analysis: Record<string, unknown> | null;
  token_usage: number;
  cost: number;
  duration_ms: number;
  created_at: string;
  updated_at: string;
}

export interface ApiRunItem {
  case_id: string;
  case_title: string;
  endpoint_id: string;
  status: 'passed' | 'failed' | 'blocked';
  duration_ms: number;
  request_snapshot: Record<string, unknown>;
  response_snapshot: Record<string, unknown>;
  assertion_results: ApiAssertionRule[];
  extracted_variables: Record<string, unknown>;
  error_message: string | null;
}

export interface ApiRunSummary {
  id: number;
  project_id: number;
  suite_id: number;
  status: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  blocked_cases: number;
  duration_ms: number;
  created_at: string;
}

export interface ApiRunReport {
  overview: {
    status: string;
    total_cases: number;
    passed_cases: number;
    failed_cases: number;
    blocked_cases: number;
    pass_rate: number;
    duration_ms: number;
  };
  environment_snapshot: Record<string, unknown>;
  suite_snapshot: Record<string, unknown>;
  endpoint_distribution: Array<Record<string, unknown>>;
  items: ApiRunItem[];
  runtime_variables: Record<string, unknown>;
  failure_reasons: Array<Record<string, unknown>>;
}

export interface ApiRunDetail extends ApiRunSummary {
  environment_snapshot: Record<string, unknown>;
  report_snapshot: ApiRunReport;
  items: ApiRunItem[];
}

import type {
  AnalyzeData,
  CaseQualityAiTestAdvice,
  CaseQualityCombinedReport,
  CaseQualityCombinedSummary,
  ProjectAnalyzeData,
  RequirementAnalysisResult,
} from '../types';

export function resolveCombinedSummary(
  combined: CaseQualityCombinedReport | null | undefined,
): CaseQualityCombinedSummary | null {
  if (!combined) {
    return null;
  }

  return (combined.overview ?? combined.summary ?? null) as CaseQualityCombinedSummary | null;
}

export function resolveRequirementSnapshot(
  combined: CaseQualityCombinedReport | null | undefined,
): RequirementAnalysisResult | null {
  return (combined?.requirement_report ?? null) as RequirementAnalysisResult | null;
}

export function resolveCaseSnapshot(
  combined: CaseQualityCombinedReport | null | undefined,
): ProjectAnalyzeData | AnalyzeData | null {
  return (combined?.case_report ?? null) as ProjectAnalyzeData | AnalyzeData | null;
}

export function resolveAiTestAdvice(
  combined: CaseQualityCombinedReport | null | undefined,
): CaseQualityAiTestAdvice | null {
  return (combined?.ai_test_advice ?? null) as CaseQualityAiTestAdvice | null;
}

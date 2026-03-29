import type { CodeMappingEntry, CoverageResult, RequirementAnalysisResult, RequirementPointHit } from '../types';
import { parseMethodIdentifier } from './codeMapping';

export interface CodeTestSuggestionItem {
  key: string;
  method: string;
  package_name: string;
  class_name: string;
  method_name: string;
  description: string;
  test_point: string;
}

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

function formatSectionLabel(sectionNumber?: string, sectionTitle?: string): string {
  const parts = [normalizeText(sectionNumber), normalizeText(sectionTitle)].filter(Boolean);
  return parts.join(' ');
}

function buildRequirementSuggestionFromHit(hit: RequirementPointHit): string {
  const sectionLabel = formatSectionLabel(hit.section_number, hit.section_title);
  const pointLabel = normalizeText(hit.point_id);
  const suggestion = normalizeText(hit.mapping_suggestion);

  if (sectionLabel && pointLabel && suggestion) {
    return `【${sectionLabel} / ${pointLabel}】${suggestion}`;
  }

  if (pointLabel && suggestion) {
    return `【${pointLabel}】${suggestion}`;
  }

  return suggestion;
}

export function buildRequirementTestSuggestions(
  result: RequirementAnalysisResult | null | undefined,
): string[] {
  if (!result) {
    return [];
  }

  const explicitSuggestions = uniqueStrings(
    (result.mapping_suggestions ?? []).map((item) => {
      const sectionLabel = formatSectionLabel(item.section_number, item.section_title);
      const suggestion = normalizeText(item.suggestion);

      if (sectionLabel && suggestion) {
        return `【${sectionLabel}】${suggestion}`;
      }

      return suggestion;
    }),
  );

  if (explicitSuggestions.length > 0) {
    return explicitSuggestions;
  }

  const hitSuggestions = uniqueStrings(
    (result.requirement_hits ?? []).map(buildRequirementSuggestionFromHit),
  );

  if (hitSuggestions.length > 0) {
    return hitSuggestions;
  }

  if (result.overview.mapping_hit_count > 0) {
    return [`本次命中 ${result.overview.mapping_hit_count} 组需求映射，建议将同组关联场景一并纳入回归验证。`];
  }

  return [];
}

export function buildCodeTestSuggestions(
  coverage: CoverageResult | null | undefined,
  entries: CodeMappingEntry[] | null | undefined,
): CodeTestSuggestionItem[] {
  if (!coverage || !entries?.length) {
    return [];
  }

  const normalizedEntries = entries
    .map((entry) => ({
      ...entry,
      package_name: normalizeText(entry.package_name),
      class_name: normalizeText(entry.class_name),
      method_name: normalizeText(entry.method_name),
      description: normalizeText(entry.description),
      test_point: normalizeText(entry.test_point),
    }))
    .filter((entry) => entry.package_name && entry.class_name && entry.method_name && entry.test_point);

  const matched = new Map<string, CodeTestSuggestionItem>();

  coverage.details.forEach((detail) => {
    const parsed = parseMethodIdentifier(detail.method);
    if (!parsed) {
      return;
    }

    const mappingEntry = normalizedEntries.find((entry) => (
      entry.package_name === parsed.package_name
      && entry.class_name === parsed.class_name
      && entry.method_name === parsed.method_name
    ));

    if (!mappingEntry) {
      return;
    }

    const key = `${mappingEntry.package_name}.${mappingEntry.class_name}.${mappingEntry.method_name}`;
    if (matched.has(key)) {
      return;
    }

    matched.set(key, {
      key,
      method: detail.method,
      package_name: mappingEntry.package_name,
      class_name: mappingEntry.class_name,
      method_name: mappingEntry.method_name,
      description: mappingEntry.description || normalizeText(detail.description),
      test_point: mappingEntry.test_point,
    });
  });

  return Array.from(matched.values());
}

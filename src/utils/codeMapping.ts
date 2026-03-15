import type { CodeMappingEntry } from '../types';

export interface ParsedMethodIdentifier {
  package_name: string;
  class_name: string;
  method_name: string;
}

export function normalizeCodeMappingEntries(value: unknown): CodeMappingEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is CodeMappingEntry => (
    typeof item === 'object'
    && item !== null
    && typeof (item as CodeMappingEntry).package_name === 'string'
    && typeof (item as CodeMappingEntry).class_name === 'string'
    && typeof (item as CodeMappingEntry).method_name === 'string'
    && typeof (item as CodeMappingEntry).description === 'string'
  ));
}

export function parseMethodIdentifier(method: string): ParsedMethodIdentifier | null {
  const parts = method.split('.').filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  return {
    package_name: parts.slice(0, -2).join('.'),
    class_name: parts.at(-2) ?? '',
    method_name: parts.at(-1) ?? '',
  };
}

export function isCodeMappingEntryMatched(
  entries: CodeMappingEntry[],
  method: string,
): boolean {
  const parsed = parseMethodIdentifier(method);
  if (!parsed) {
    return false;
  }

  return entries.some((entry) => (
    entry.package_name === parsed.package_name
    && entry.class_name === parsed.class_name
    && entry.method_name === parsed.method_name
  ));
}

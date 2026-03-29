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

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }

    const entry = item as Partial<CodeMappingEntry>;
    if (
      typeof entry.package_name !== 'string'
      || typeof entry.class_name !== 'string'
      || typeof entry.method_name !== 'string'
      || typeof entry.description !== 'string'
    ) {
      return [];
    }

    return [{
      package_name: entry.package_name,
      class_name: entry.class_name,
      method_name: entry.method_name,
      description: entry.description,
      test_point: typeof entry.test_point === 'string' ? entry.test_point : '',
    }];
  });
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

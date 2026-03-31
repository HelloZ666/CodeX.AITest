import { saveAs } from 'file-saver';
import type { FunctionalTestCase } from '../types';

function escapeCsvField(value: string): string {
  const normalized = value.replace(/\r\n/g, '\n');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

export function exportFunctionalTestCasesCsv(
  cases: FunctionalTestCase[],
  fileNameBase: string = '测试用例',
): void {
  const header = ['用例ID', '用例描述', '测试步骤', '预期结果'];
  const rows = cases.map((item) => [
    item.case_id,
    item.description,
    item.steps,
    item.expected_result,
  ]);
  const csvContent = `\uFEFF${[header, ...rows]
    .map((row) => row.map((cell) => escapeCsvField(String(cell ?? ''))).join(','))
    .join('\r\n')}`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, `${fileNameBase}.csv`);
}

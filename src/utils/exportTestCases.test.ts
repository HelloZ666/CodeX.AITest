import { describe, expect, it, vi } from 'vitest';
import { exportFunctionalTestCasesCsv } from './exportTestCases';

const saveAsMock = vi.fn();

vi.mock('file-saver', () => ({
  saveAs: (...args: unknown[]) => saveAsMock(...args),
}));

describe('exportFunctionalTestCasesCsv', () => {
  it('exports test cases as csv with a chinese filename', async () => {
    exportFunctionalTestCasesCsv([
      {
        case_id: 'TC-001',
        description: '资格校验失败时禁止提交',
        steps: '1. 打开页面\n2. 输入非法数据\n3. 点击提交',
        expected_result: '系统阻止提交并提示原因',
      },
    ], '案例生成结果');

    expect(saveAsMock).toHaveBeenCalledTimes(1);
    const [, fileName] = saveAsMock.mock.calls[0];
    expect(fileName).toBe('案例生成结果.csv');

    const blob = saveAsMock.mock.calls[0]?.[0] as Blob;
    const content = await blob.text();
    expect(content).toContain('用例ID');
    expect(content).toContain('TC-001');
  });
});

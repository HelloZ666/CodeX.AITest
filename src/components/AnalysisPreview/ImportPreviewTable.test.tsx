import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ImportPreviewTable from './ImportPreviewTable';

describe('ImportPreviewTable', () => {
  it('keeps identifier columns on a single line while preserving wrapping for long text', () => {
    render(
      <ImportPreviewTable
        rows={[
          {
            row_id: 1,
            任务编号: 'TASK-20260315-0000000001',
            问题摘要: '登录接口返回空指针，定位到边界值校验遗漏后仍需要保留多行展示能力。',
          },
        ]}
      />,
    );

    const taskNumberCell = screen.getByText('TASK-20260315-0000000001');
    const summaryCell = screen.getByText('登录接口返回空指针，定位到边界值校验遗漏后仍需要保留多行展示能力。');

    expect(taskNumberCell).toHaveStyle({
      whiteSpace: 'nowrap',
      wordBreak: 'normal',
    });
    expect(summaryCell).toHaveStyle({
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    });
  });
});

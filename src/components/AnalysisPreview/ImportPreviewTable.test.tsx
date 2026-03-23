import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ImportPreviewTable from './ImportPreviewTable';

describe('ImportPreviewTable', () => {
  it('keeps the built-in sequence column and filters duplicate sequence fields from source data', () => {
    render(
      <ImportPreviewTable
        rows={[
          {
            row_id: 1,
            序号: '1',
            缺陷ID: 'BUG-001',
            缺陷摘要: '登录接口返回空指针',
          },
        ]}
      />,
    );

    expect(screen.getAllByRole('columnheader', { name: '序号' })).toHaveLength(1);
    expect(screen.getByRole('columnheader', { name: '缺陷ID' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '缺陷摘要' })).toBeInTheDocument();
  });

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

    expect(taskNumberCell).toHaveClass('import-preview-table__cell--identifier');
    expect(summaryCell).toHaveClass('import-preview-table__cell--clamped');
  });
});

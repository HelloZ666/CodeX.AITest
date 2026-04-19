import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { saveAs } from 'file-saver';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigRequirementDocumentsPage from './ConfigRequirementDocuments';

vi.mock('../utils/api', () => ({
  downloadConfigRequirementDocument: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  listConfigRequirementDocuments: vi.fn(),
}));

vi.mock('file-saver', () => ({
  saveAs: vi.fn(),
}));

import {
  downloadConfigRequirementDocument,
  listConfigRequirementDocuments,
} from '../utils/api';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConfigRequirementDocumentsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ConfigRequirementDocumentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listConfigRequirementDocuments as Mock).mockResolvedValue([
      {
        id: 1,
        file_name: '需求说明.docx',
        file_type: 'docx',
        file_size: 2048,
        project_id: 1,
        project_name: '项目A',
        source_page: '案例质检',
        operator_name: '张三',
        operator_username: 'zhangsan',
        operated_at: '2026-04-06T10:20:00Z',
        created_at: '2026-04-06T10:20:00Z',
      },
    ]);
  });

  it('renders deduplicated requirement documents with operator info', async () => {
    renderWithProviders();

    expect(await screen.findByText('测试需求')).toBeInTheDocument();
    expect(await screen.findByText('需求说明.docx')).toBeInTheDocument();
    expect(screen.getByText('项目A')).toBeInTheDocument();
    expect(screen.getByText('案例质检')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('zhangsan')).toBeInTheDocument();

    const headers = await screen.findAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('项目');
    expect(headers[headers.length - 1]).toHaveTextContent('操作');
  });

  it('downloads requirement document from action column', async () => {
    (downloadConfigRequirementDocument as Mock).mockResolvedValue(new Blob(['requirement']));

    renderWithProviders();
    fireEvent.click(await screen.findByRole('button', { name: '下载需求文档' }));

    await waitFor(() => {
      expect(downloadConfigRequirementDocument).toHaveBeenCalledWith(1);
      expect(saveAs).toHaveBeenCalledWith(expect.any(Blob), '需求说明.docx');
    });
  });
});

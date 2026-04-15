import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ConfigRequirementDocumentsPage from './ConfigRequirementDocuments';

vi.mock('../utils/api', () => ({
  listConfigRequirementDocuments: vi.fn(),
}));

import { listConfigRequirementDocuments } from '../utils/api';

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

    expect(await screen.findByText('需求文档')).toBeInTheDocument();
    expect(await screen.findByText('需求说明.docx')).toBeInTheDocument();
    expect(screen.getByText('项目A')).toBeInTheDocument();
    expect(screen.getByText('案例质检')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('zhangsan')).toBeInTheDocument();
  });
});

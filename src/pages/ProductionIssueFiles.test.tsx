import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProductionIssueFilesPage from './ProductionIssueFiles';

vi.mock('../utils/api', () => ({
  listProductionIssueFiles: vi.fn(),
  uploadProductionIssueFile: vi.fn(),
}));

import {
  listProductionIssueFiles,
  uploadProductionIssueFile,
} from '../utils/api';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProductionIssueFilesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listProductionIssueFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        file_name: 'prod-issue.xlsx',
        file_type: 'excel',
        file_size: 2048,
        row_count: 12,
        created_at: '2026-03-08 10:00:00',
      },
    ]);
  });

  it('renders title and existing files', async () => {
    renderWithProviders(<ProductionIssueFilesPage />);

    expect(await screen.findByText('生产问题')).toBeInTheDocument();
    expect(await screen.findByText('prod-issue.xlsx')).toBeInTheDocument();
  });

  it('uploads selected file and refreshes list', async () => {
    (uploadProductionIssueFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 2,
      file_name: 'new-prod-issue.xlsx',
      file_type: 'excel',
      file_size: 4096,
      row_count: 20,
      created_at: '2026-03-08 11:00:00',
    });

    renderWithProviders(<ProductionIssueFilesPage />);
    fireEvent.click(await screen.findByText('上传文件'));
    expect(await screen.findByText('上传说明')).toBeInTheDocument();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['excel'], 'new-prod-issue.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText('上传并保存'));

    await waitFor(() => {
      expect(uploadProductionIssueFile).toHaveBeenCalled();
    });

    expect((uploadProductionIssueFile as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(file);
    expect(await screen.findByText('最近上传：new-prod-issue.xlsx')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import TestIssueFilesPage from './TestIssueFiles';

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  listTestIssueFiles: vi.fn(),
  uploadTestIssueFile: vi.fn(),
}));

import {
  listProjects,
  listTestIssueFiles,
  uploadTestIssueFile,
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

describe('TestIssueFilesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '核心项目',
        description: '描述',
        mapping_data: null,
        created_at: '2026-03-08T10:00:00Z',
        updated_at: '2026-03-08T10:00:00Z',
      },
    ]);
    (listTestIssueFiles as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        project_id: 1,
        project_name: '核心项目',
        file_name: 'defect.xlsx',
        file_type: 'excel',
        file_size: 2048,
        row_count: 12,
        created_at: '2026-03-08 10:10:00',
      },
    ]);
  });

  it('renders title, project list, and existing files', async () => {
    renderWithProviders(<TestIssueFilesPage />);

    expect(await screen.findByText('测试问题')).toBeInTheDocument();
    expect(await screen.findByText('核心项目')).toBeInTheDocument();
    expect(screen.getByText('defect.xlsx')).toBeInTheDocument();
    expect(screen.getByText('已绑定')).toBeInTheDocument();
  });

  it('uploads file after selecting project row action', async () => {
    (uploadTestIssueFile as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 2,
      project_id: 1,
      project_name: '核心项目',
      file_name: 'new-defect.xlsx',
      file_type: 'excel',
      file_size: 4096,
      row_count: 20,
      created_at: '2026-03-08 10:20:00',
    });

    renderWithProviders(<TestIssueFilesPage />);
    fireEvent.click(await screen.findByText('替换'));
    expect(await screen.findByText('当前项目：核心项目')).toBeInTheDocument();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['excel'], 'new-defect.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByText('上传并绑定'));

    await waitFor(() => {
      expect(uploadTestIssueFile).toHaveBeenCalled();
    });

    expect((uploadTestIssueFile as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(1);
    expect((uploadTestIssueFile as ReturnType<typeof vi.fn>).mock.calls[0][1]).toBe(file);
    expect(await screen.findByText('最近上传：new-defect.xlsx')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectManagementPage from './ProjectManagement';

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

import {
  createProject,
  listProjects,
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

describe('ProjectManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders title and project list', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '支付项目',
        description: '负责支付链路',
        mapping_data: null,
        created_at: '2026-03-08T10:00:00Z',
        updated_at: '2026-03-08T10:00:00Z',
      },
    ]);

    renderWithProviders(<ProjectManagementPage />);

    expect(await screen.findByText('项目管理')).toBeInTheDocument();
    expect(screen.getByText('支付项目')).toBeInTheDocument();
  });

  it('filters projects by keyword', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '支付项目',
        description: '负责支付链路',
        mapping_data: null,
        created_at: '2026-03-08T10:00:00Z',
        updated_at: '2026-03-08T10:00:00Z',
      },
      {
        id: 2,
        name: '用户项目',
        description: '负责用户中心',
        mapping_data: null,
        created_at: '2026-03-08T10:00:00Z',
        updated_at: '2026-03-08T10:00:00Z',
      },
    ]);

    renderWithProviders(<ProjectManagementPage />);
    const input = await screen.findByPlaceholderText('输入项目名称或描述进行查询');
    fireEvent.change(input, { target: { value: '支付' } });

    await waitFor(() => {
      expect(screen.getByText('支付项目')).toBeInTheDocument();
    });
    expect(screen.queryByText('用户项目')).not.toBeInTheDocument();
  });

  it('creates a project from modal', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 3,
      name: '核心项目',
      description: '关键链路',
    });

    renderWithProviders(<ProjectManagementPage />);
    fireEvent.click(await screen.findByText('新建项目'));

    fireEvent.change(screen.getByPlaceholderText('例如：用户管理模块'), { target: { value: '核心项目' } });
    fireEvent.change(screen.getByPlaceholderText('可选的项目描述'), { target: { value: '关键链路' } });
    const submitButtons = screen.getAllByRole('button');
    fireEvent.click(submitButtons[submitButtons.length - 1]);

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith('核心项目', '关键链路');
    });
  });
});

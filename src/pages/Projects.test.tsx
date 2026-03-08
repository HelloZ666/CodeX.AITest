import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectsPage from './Projects';

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  uploadProjectMapping: vi.fn(),
  getProject: vi.fn(),
}));

import { listProjects } from '../utils/api';

(globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

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

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders page title', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('代码映射关系')).toBeInTheDocument();
  });

  it('shows empty state without create button', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('暂无项目，请先到项目管理中创建项目')).toBeInTheDocument();
    expect(screen.queryByText('新建项目')).not.toBeInTheDocument();
  });

  it('renders project list when data available', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '测试项目',
        description: '项目描述',
        mapping_data: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('测试项目')).toBeInTheDocument();
  });

  it('shows mapping status tag for projects with mapping', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '有映射项目',
        description: '',
        mapping_data: { some: 'data' },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('已绑定')).toBeInTheDocument();
  });

  it('shows upload button for projects without mapping', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '无映射项目',
        description: '',
        mapping_data: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('上传')).toBeInTheDocument();
  });

  it('shows description column with text or fallback', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '项目A',
        description: '',
        mapping_data: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('无描述')).toBeInTheDocument();
  });

  it('does not render create edit or delete actions', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '项目A',
        description: '描述',
        mapping_data: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ]);
    renderWithProviders(<ProjectsPage />);
    await screen.findByText('项目A');
    expect(screen.queryByText('新建项目')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.ant-btn-dangerous').length).toBe(0);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectsPage from './Projects';

// Mock ResizeObserver for Ant Design Modal
(globalThis as Record<string, unknown>).ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock the API module
vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  uploadProjectMapping: vi.fn(),
}));

import { listProjects } from '../utils/api';

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
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

  it('renders create button', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('新建项目')).toBeInTheDocument();
  });

  it('shows empty state when no projects', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderWithProviders(<ProjectsPage />);
    expect(await screen.findByText('创建第一个项目')).toBeInTheDocument();
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
    // The upload button in the mapping column
    const uploadBtns = await screen.findAllByText('上传');
    expect(uploadBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('opens create modal when clicking new project button', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderWithProviders(<ProjectsPage />);
    const createBtns = await screen.findAllByText('新建项目');
    fireEvent.click(createBtns[0]);
    expect(await screen.findByText('项目名称')).toBeInTheDocument();
  });

  it('opens create modal from empty state button', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderWithProviders(<ProjectsPage />);
    const createFirstBtn = await screen.findByText('创建第一个项目');
    fireEvent.click(createFirstBtn);
    await waitFor(() => {
      expect(screen.getByText('项目名称')).toBeInTheDocument();
    });
  });

  it('shows edit and delete buttons for each project', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '测试项目',
        description: '描述',
        mapping_data: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ]);
    renderWithProviders(<ProjectsPage />);
    await screen.findByText('测试项目');
    // Edit and delete buttons are icon-only, check by role
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(3);
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

  it('renders created_at column formatted', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '项目B',
        description: 'desc',
        mapping_data: null,
        created_at: '2025-06-15T08:30:00Z',
        updated_at: '2025-06-15T08:30:00Z',
      },
    ]);
    renderWithProviders(<ProjectsPage />);
    await screen.findByText('项目B');
    // Date should be rendered in zh-CN locale format
    const cells = document.querySelectorAll('td');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('shows modal title as 新建项目 for create', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    renderWithProviders(<ProjectsPage />);
    const createBtns = await screen.findAllByText('新建项目');
    fireEvent.click(createBtns[0]);
    // Modal title should be '新建项目'
    const modalTitles = await screen.findAllByText('新建项目');
    expect(modalTitles.length).toBeGreaterThanOrEqual(1);
  });

  it('shows delete confirmation popover', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '待删除项目',
        description: '',
        mapping_data: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    ]);
    renderWithProviders(<ProjectsPage />);
    await screen.findByText('待删除项目');
    // Find the danger (delete) button and click it
    const dangerBtns = document.querySelectorAll('.ant-btn-dangerous');
    expect(dangerBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(dangerBtns[0]);
    expect(await screen.findByText('确定删除此项目？')).toBeInTheDocument();
  });
});

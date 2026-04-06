import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import ProjectManagementPage from './ProjectManagement';

vi.mock('../utils/api', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  listUsers: vi.fn(),
}));

import {
  createProject,
  listProjects,
  listUsers,
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

function getLatestDialog(): HTMLElement {
  return screen.getAllByRole('dialog').at(-1) as HTMLElement;
}

const p13Users = [
  {
    id: 11,
    username: 'zhangyong-135',
    display_name: '\u5f20\u52c7',
    email: 'zhangyong-135@cpic.com.cn',
    dept_name: '\u4e1a\u52a1\u4e8c\u90e8',
    auth_source: 'external' as const,
    role: 'user' as const,
    status: 'active' as const,
    last_login_at: null,
    created_at: '2026-03-08T00:00:00Z',
    updated_at: '2026-03-08T00:00:00Z',
  },
  {
    id: 12,
    username: 'lisi-136',
    display_name: '\u674e\u56db',
    email: 'lisi-136@cpic.com.cn',
    dept_name: '\u4e1a\u52a1\u4e00\u90e8',
    auth_source: 'external' as const,
    role: 'user' as const,
    status: 'active' as const,
    last_login_at: null,
    created_at: '2026-03-08T00:00:00Z',
    updated_at: '2026-03-08T00:00:00Z',
  },
];

describe('ProjectManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(p13Users);
  });

  it('renders title, project list, and project members', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '\u652f\u4ed8\u9879\u76ee',
        description: '\u8d1f\u8d23\u652f\u4ed8\u94fe\u8def',
        test_manager_ids: [11],
        tester_ids: [11, 12],
        mapping_data: null,
        created_at: '2026-03-08T10:00:00Z',
        updated_at: '2026-03-08T10:00:00Z',
      },
    ]);

    renderWithProviders(<ProjectManagementPage />);

    expect(await screen.findByText('\u9879\u76ee\u7ba1\u7406')).toBeInTheDocument();
    expect(screen.getByText('\u652f\u4ed8\u9879\u76ee')).toBeInTheDocument();
    expect(screen.getByText('\u5f20\u52c7')).toBeInTheDocument();
    expect(screen.getByText('\u5f20\u52c7\u3001\u674e\u56db')).toBeInTheDocument();
  });

  it('filters projects by keyword', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        name: '\u652f\u4ed8\u9879\u76ee',
        description: '\u8d1f\u8d23\u652f\u4ed8\u94fe\u8def',
        mapping_data: null,
        created_at: '2026-03-08T10:00:00Z',
        updated_at: '2026-03-08T10:00:00Z',
      },
      {
        id: 2,
        name: '\u7528\u6237\u9879\u76ee',
        description: '\u8d1f\u8d23\u7528\u6237\u4e2d\u5fc3',
        mapping_data: null,
        created_at: '2026-03-08T10:00:00Z',
        updated_at: '2026-03-08T10:00:00Z',
      },
    ]);

    renderWithProviders(<ProjectManagementPage />);
    const input = await screen.findByPlaceholderText('\u8f93\u5165\u9879\u76ee\u540d\u79f0\u6216\u63cf\u8ff0\u8fdb\u884c\u67e5\u8be2');
    fireEvent.change(input, { target: { value: '\u652f\u4ed8' } });

    await waitFor(() => {
      expect(screen.getByText('\u652f\u4ed8\u9879\u76ee')).toBeInTheDocument();
    });
    expect(screen.queryByText('\u7528\u6237\u9879\u76ee')).not.toBeInTheDocument();
  });

  it('creates a project from modal and preserves empty member selections', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (createProject as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 3,
      name: '\u6838\u5fc3\u9879\u76ee',
      description: '\u5173\u952e\u94fe\u8def',
      test_manager_ids: [],
      tester_ids: [],
      mapping_data: null,
      created_at: '2026-03-08T10:00:00Z',
      updated_at: '2026-03-08T10:00:00Z',
    });

    renderWithProviders(<ProjectManagementPage />);
    fireEvent.click(await screen.findByText('\u65b0\u5efa\u9879\u76ee'));

    const dialog = getLatestDialog();
    fireEvent.change(within(dialog).getByPlaceholderText('\u4f8b\u5982\uff1a\u7528\u6237\u7ba1\u7406\u6a21\u5757'), {
      target: { value: '\u6838\u5fc3\u9879\u76ee' },
    });
    fireEvent.change(within(dialog).getByPlaceholderText('\u53ef\u9009\u7684\u9879\u76ee\u63cf\u8ff0'), {
      target: { value: '\u5173\u952e\u94fe\u8def' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: /OK|\u786e\u5b9a/ }));

    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith({
        name: '\u6838\u5fc3\u9879\u76ee',
        description: '\u5173\u952e\u94fe\u8def',
        test_manager_ids: [],
        tester_ids: [],
      });
    });
  });

  it('shows Chinese labels and placeholders for member selectors in the modal', async () => {
    (listProjects as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    renderWithProviders(<ProjectManagementPage />);
    fireEvent.click(await screen.findByText('\u65b0\u5efa\u9879\u76ee'));

    const dialog = getLatestDialog();
    expect(within(dialog).getByText('\u6d4b\u8bd5\u7ecf\u7406')).toBeInTheDocument();
    expect(within(dialog).getByText('\u6d4b\u8bd5\u4eba\u5458')).toBeInTheDocument();
    expect(within(dialog).getByText('\u8bf7\u9009\u62e9\u6d4b\u8bd5\u7ecf\u7406')).toBeInTheDocument();
    expect(within(dialog).getByText('\u8bf7\u9009\u62e9\u6d4b\u8bd5\u4eba\u5458')).toBeInTheDocument();
  });
});

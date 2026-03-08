import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserRecord } from '../types';
import UserManagementPage from './UserManagement';

const listUsers = vi.fn();
const createUser = vi.fn();
const updateUser = vi.fn();
const updateUserStatus = vi.fn();
const resetUserPassword = vi.fn();

vi.mock('../utils/api', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  createUser: (...args: unknown[]) => createUser(...args),
  updateUser: (...args: unknown[]) => updateUser(...args),
  updateUserStatus: (...args: unknown[]) => updateUserStatus(...args),
  resetUserPassword: (...args: unknown[]) => resetUserPassword(...args),
  extractApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'admin',
      display_name: '管理员',
      email: null,
      role: 'admin',
      status: 'active',
    },
  }),
}));

const mockUsers: UserRecord[] = [
  {
    id: 1,
    username: 'admin',
    display_name: '管理员',
    email: 'admin@example.com',
    role: 'admin',
    status: 'active',
    last_login_at: '2026-03-08T10:00:00',
    created_at: '2026-03-08T09:00:00',
    updated_at: '2026-03-08T09:00:00',
  },
  {
    id: 2,
    username: 'reader',
    display_name: '普通用户',
    email: null,
    role: 'user',
    status: 'active',
    last_login_at: null,
    created_at: '2026-03-08T09:10:00',
    updated_at: '2026-03-08T09:10:00',
  },
];

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <UserManagementPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function getLatestDialog(): HTMLElement {
  const dialogs = screen.getAllByRole('dialog');
  return dialogs[dialogs.length - 1] as HTMLElement;
}

describe('UserManagementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listUsers.mockResolvedValue(mockUsers);
    createUser.mockResolvedValue(mockUsers[1]);
    updateUser.mockResolvedValue({ ...mockUsers[1], display_name: '更新后用户' });
    updateUserStatus.mockResolvedValue({ ...mockUsers[1], status: 'disabled' });
    resetUserPassword.mockResolvedValue(undefined);
  });

  it('renders user list', async () => {
    renderWithProviders();

    expect(await screen.findByText('用户管理')).toBeInTheDocument();
    expect(await screen.findByText('reader')).toBeInTheDocument();
    expect(screen.getAllByText('管理员').length).toBeGreaterThan(0);
  });

  it('creates a new user with autofill-safe fields', async () => {
    renderWithProviders();

    await screen.findByText('用户管理');
    fireEvent.click(screen.getByRole('button', { name: /新建用户/ }));
    await screen.findByRole('dialog');
    const createDialog = getLatestDialog();

    expect(within(createDialog).getByPlaceholderText('请输入用户名')).toHaveAttribute('autocomplete', 'off');
    expect(within(createDialog).getByPlaceholderText('请输入初始密码')).toHaveAttribute('autocomplete', 'new-password');

    fireEvent.change(within(createDialog).getByPlaceholderText('请输入用户名'), { target: { value: 'operator' } });
    fireEvent.change(within(createDialog).getByPlaceholderText('请输入初始密码'), { target: { value: 'Operator123!' } });
    fireEvent.change(within(createDialog).getByPlaceholderText('请输入显示名'), { target: { value: '运营同学' } });
    fireEvent.click(within(createDialog).getByRole('button', { name: /OK|确定/ }));

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith(
        {
          username: 'operator',
          password: 'Operator123!',
          display_name: '运营同学',
          email: undefined,
          role: 'user',
        },
        expect.anything(),
      );
    });
  });

  it('edits a user and resets password with new-password autofill protection', async () => {
    renderWithProviders();

    await screen.findByText('reader');
    const readerRow = screen.getByText('reader').closest('tr');
    expect(readerRow).not.toBeNull();

    fireEvent.click(within(readerRow as HTMLElement).getByRole('button', { name: /编辑/ }));
    await screen.findByRole('dialog');
    const editDialog = getLatestDialog();
    const displayNameInput = within(editDialog).getByDisplayValue('普通用户');
    fireEvent.change(displayNameInput, { target: { value: '更新后用户' } });
    fireEvent.click(within(editDialog).getByRole('button', { name: /OK|确定/ }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(2, {
        display_name: '更新后用户',
        email: undefined,
        role: 'user',
      });
    });

    fireEvent.click(within(readerRow as HTMLElement).getByRole('button', { name: /重置密码/ }));
    const passwordInput = await screen.findByPlaceholderText('请输入新密码');
    expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
    fireEvent.change(passwordInput, { target: { value: 'Reset12345!' } });

    const passwordDialog = passwordInput.closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(passwordDialog).getByRole('button', { name: /OK|确定/ }));

    await waitFor(() => {
      expect(resetUserPassword).toHaveBeenCalledWith(2, 'Reset12345!');
    });
  });
});

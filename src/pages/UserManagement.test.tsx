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
const deleteUser = vi.fn();

vi.mock('../utils/api', () => ({
  listUsers: (...args: unknown[]) => listUsers(...args),
  createUser: (...args: unknown[]) => createUser(...args),
  updateUser: (...args: unknown[]) => updateUser(...args),
  updateUserStatus: (...args: unknown[]) => updateUserStatus(...args),
  resetUserPassword: (...args: unknown[]) => resetUserPassword(...args),
  deleteUser: (...args: unknown[]) => deleteUser(...args),
  extractApiErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 1,
      username: 'admin',
      display_name: '系统管理员',
      email: null,
      dept_name: null,
      auth_source: 'local',
      role: 'admin',
      status: 'active',
    },
  }),
}));

const mockUsers: UserRecord[] = [
  {
    id: 1,
    username: 'admin',
    display_name: '系统管理员',
    email: 'admin@example.com',
    dept_name: null,
    auth_source: 'local',
    role: 'admin',
    status: 'active',
    last_login_at: '2026-03-08T10:00:00',
    created_at: '2026-03-08T09:00:00',
    updated_at: '2026-03-08T09:00:00',
  },
  {
    id: 2,
    username: 'operator',
    display_name: '运营同学',
    email: 'operator@example.com',
    dept_name: null,
    auth_source: 'local',
    role: 'user',
    status: 'active',
    last_login_at: null,
    created_at: '2026-03-08T09:10:00',
    updated_at: '2026-03-08T09:10:00',
  },
  {
    id: 3,
    username: 'zhangyong-135',
    display_name: '张勇',
    email: 'zhangyong-135@cpic.com.cn',
    dept_name: '业务二部',
    auth_source: 'external',
    role: 'user',
    status: 'active',
    last_login_at: '2026-03-09T10:00:00',
    created_at: '2026-03-09T09:00:00',
    updated_at: '2026-03-09T09:00:00',
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
    updateUser.mockResolvedValue({ ...mockUsers[1], display_name: '运营负责人' });
    updateUserStatus.mockResolvedValue({ ...mockUsers[1], status: 'disabled' });
    resetUserPassword.mockResolvedValue(undefined);
    deleteUser.mockResolvedValue(undefined);
  });

  it('renders account list with source and department', async () => {
    renderWithProviders();

    expect(await screen.findByText('用户管理')).toBeInTheDocument();
    expect(await screen.findByText('zhangyong-135')).toBeInTheDocument();
    expect(screen.getByText('业务二部')).toBeInTheDocument();
    expect(screen.getByText('P13')).toBeInTheDocument();
    expect(screen.getAllByText('本地创建').length).toBeGreaterThan(0);
  });

  it('creates a new local account with autofill-safe fields', async () => {
    renderWithProviders();

    await screen.findByText('用户管理');
    fireEvent.click(screen.getByRole('button', { name: /新建账号/ }));
    await screen.findByRole('dialog');
    const createDialog = getLatestDialog();

    expect(within(createDialog).getByPlaceholderText('请输入账号')).toHaveAttribute('autocomplete', 'off');
    expect(within(createDialog).getByPlaceholderText('请输入初始密码')).toHaveAttribute('autocomplete', 'new-password');

    fireEvent.change(within(createDialog).getByPlaceholderText('请输入账号'), { target: { value: 'reader' } });
    fireEvent.change(within(createDialog).getByPlaceholderText('请输入初始密码'), { target: { value: 'Reader123!' } });
    fireEvent.change(within(createDialog).getByPlaceholderText('请输入姓名'), { target: { value: '普通账号' } });
    fireEvent.click(within(createDialog).getByRole('button', { name: /OK|确定/ }));

    await waitFor(() => {
      expect(createUser).toHaveBeenCalledWith(
        {
          username: 'reader',
          password: 'Reader123!',
          display_name: '普通账号',
          email: undefined,
          role: 'user',
        },
        expect.anything(),
      );
    });
  });

  it('edits a local account and resets password', async () => {
    renderWithProviders();

    await screen.findByText('operator');
    const operatorRow = screen.getByText('operator').closest('tr');
    expect(operatorRow).not.toBeNull();

    fireEvent.click(within(operatorRow as HTMLElement).getByRole('button', { name: /编辑/ }));
    await screen.findByRole('dialog');
    const editDialog = getLatestDialog();
    const usernameInput = within(editDialog).getByDisplayValue('operator');
    expect(usernameInput).toBeDisabled();
    const displayNameInput = within(editDialog).getByDisplayValue('运营同学');
    expect(within(editDialog).getByDisplayValue('operator@example.com')).toBeInTheDocument();
    expect(within(editDialog).getByText('普通用户')).toBeInTheDocument();
    fireEvent.change(displayNameInput, { target: { value: '运营负责人' } });
    fireEvent.click(within(editDialog).getByRole('button', { name: /OK|确定/ }));

    await waitFor(() => {
      expect(updateUser).toHaveBeenCalledWith(2, {
        display_name: '运营负责人',
        email: 'operator@example.com',
        role: 'user',
      });
    });

    fireEvent.click(within(operatorRow as HTMLElement).getByRole('button', { name: /重置密码/ }));
    const passwordInput = await screen.findByPlaceholderText('请输入新密码');
    expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
    fireEvent.change(passwordInput, { target: { value: 'Reset12345!' } });

    const passwordDialog = passwordInput.closest('[role="dialog"]') as HTMLElement;
    fireEvent.click(within(passwordDialog).getByRole('button', { name: /OK|确定/ }));

    await waitFor(() => {
      expect(resetUserPassword).toHaveBeenCalledWith(2, 'Reset12345!');
    });
  });

  it('deletes a local account', async () => {
    renderWithProviders();

    await screen.findByText('operator');
    const operatorRow = screen.getByText('operator').closest('tr') as HTMLElement;
    fireEvent.click(within(operatorRow).getByRole('button', { name: /删除/ }));

    const confirmButtons = await screen.findAllByRole('button', { name: /确 定|确定|OK/ });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(deleteUser).toHaveBeenCalledWith(2, expect.anything());
    });
  });

  it('shows external accounts as read-only without management actions', async () => {
    renderWithProviders();

    await screen.findByText('zhangyong-135');
    const externalRow = screen.getByText('zhangyong-135').closest('tr') as HTMLElement;

    expect(within(externalRow).getByText('内部同步账号仅允许查看')).toBeInTheDocument();
    expect(within(externalRow).queryByRole('button', { name: /编辑/ })).toBeNull();
    expect(within(externalRow).queryByRole('button', { name: /删除/ })).toBeNull();
  });
});

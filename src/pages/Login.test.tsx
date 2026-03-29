import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from './Login';

const loginMock = vi.fn();

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock,
  }),
}));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses autofill-safe attributes and redirects on success', async () => {
    loginMock.mockResolvedValueOnce({
      id: 1,
      username: 'admin',
      display_name: '管理员',
      email: null,
      role: 'admin',
      status: 'active',
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>首页</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('欢迎回来')).toBeInTheDocument();
    expect(screen.queryByText('会话有效期 7 天')).not.toBeInTheDocument();
    expect(screen.queryByText('账号由管理员创建')).not.toBeInTheDocument();
    expect(screen.queryByText('没有开放自助注册、忘记密码与邀请注册，如需帮助请联系管理员。')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: '用户名' })).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('密码')).toHaveAttribute('autocomplete', 'new-password');

    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'Admin123!' } });
    fireEvent.click(screen.getByRole('button', { name: /登录/ }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('admin', 'Admin123!'));
    expect(await screen.findByText('首页')).toBeInTheDocument();
  });

  it('shows login error message', async () => {
    loginMock.mockRejectedValueOnce(new Error('用户名或密码错误'));

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByPlaceholderText('请输入用户名'), { target: { value: 'admin' } });
    fireEvent.change(screen.getByPlaceholderText('请输入密码'), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: /登录/ }));

    expect(await screen.findByText('用户名或密码错误')).toBeInTheDocument();
  });
});

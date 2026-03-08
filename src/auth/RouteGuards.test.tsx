import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RedirectAuthenticated, RequireAuth } from './RouteGuards';

const useAuthMock = vi.fn();

vi.mock('./AuthContext', () => ({
  FullScreenLoading: () => <div>loading</div>,
  useAuth: () => useAuthMock(),
}));

describe('RouteGuards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects unauthenticated users to login', () => {
    useAuthMock.mockReturnValue({
      loading: false,
      authenticated: false,
      user: null,
    });

    render(
      <MemoryRouter initialEntries={['/projects']}>
        <Routes>
          <Route path="/login" element={<div>登录页</div>} />
          <Route element={<RequireAuth />}>
            <Route path="/projects" element={<div>项目页</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('登录页')).toBeInTheDocument();
  });

  it('redirects authenticated users away from login page', () => {
    useAuthMock.mockReturnValue({
      loading: false,
      authenticated: true,
      user: {
        id: 1,
        username: 'admin',
        display_name: '管理员',
        email: null,
        role: 'admin',
        status: 'active',
      },
    });

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route
            path="/login"
            element={(
              <RedirectAuthenticated>
                <div>登录页</div>
              </RedirectAuthenticated>
            )}
          />
          <Route path="/" element={<div>首页</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('首页')).toBeInTheDocument();
  });
});

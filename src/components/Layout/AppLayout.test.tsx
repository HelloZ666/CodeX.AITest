import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { message } from 'antd';
import AppLayout from './AppLayout';

const useAuthMock = vi.fn();

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
};

function renderLayout(initialEntry: string = '/functional-testing/case-quality') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <AppLayout>
        <div>content</div>
      </AppLayout>
    </MemoryRouter>,
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to expanded and keeps the active group open', () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 1,
        username: 'admin',
        display_name: '管理员',
        email: null,
        role: 'admin',
        status: 'active',
      },
      logout: vi.fn(),
    });

    const { container } = renderLayout();

    expect(container.querySelector('.ant-layout-sider-collapsed')).not.toBeInTheDocument();

    expect(screen.getByText('质量看板')).toBeInTheDocument();
    expect(screen.getByText('功能测试')).toBeInTheDocument();
    expect(screen.getByText('自动化测试')).toBeInTheDocument();
    expect(screen.getByText('性能测试')).toBeInTheDocument();
    expect(screen.getByText('AI辅助工具')).toBeInTheDocument();
    expect(screen.getByText('项目管理')).toBeInTheDocument();
    expect(screen.getByText('配置管理')).toBeInTheDocument();
    expect(screen.getByText('系统管理')).toBeInTheDocument();
    expect(screen.queryByText('文件管理')).not.toBeInTheDocument();

    expect(screen.getByText('案例生成')).toBeInTheDocument();
    expect(screen.getByText('案例质检')).toBeInTheDocument();
    expect(screen.getByText('分析记录')).toBeInTheDocument();
  });

  it('hides system management menu for standard users', () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 2,
        username: 'user',
        display_name: '普通用户',
        email: null,
        role: 'user',
        status: 'active',
      },
      logout: vi.fn(),
    });

    renderLayout();
    expect(screen.queryByText('系统管理')).not.toBeInTheDocument();
  });

  it('marks submenu hover state while the sidebar is collapsed', () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 1,
        username: 'admin',
        display_name: '管理员',
        email: null,
        role: 'admin',
        status: 'active',
      },
      logout: vi.fn(),
    });

    const { container } = renderLayout();
    const trigger = container.querySelector('.ant-layout-sider-trigger');
    fireEvent.click(trigger as Element);
    const submenus = container.querySelectorAll('.ant-menu-submenu');
    const submenuTitles = container.querySelectorAll('.ant-menu-submenu-title');

    fireEvent.mouseEnter(submenuTitles[1]);

    expect(submenus[1]).toHaveClass('ant-menu-submenu-active');
  });

  it('changes route when clicking a functional testing submenu item', async () => {
    useAuthMock.mockReturnValue({
      user: {
        id: 1,
        username: 'admin',
        display_name: '管理员',
        email: null,
        role: 'admin',
        status: 'active',
      },
      logout: vi.fn(),
    });

    renderLayout();
    fireEvent.click(screen.getByText('案例生成'));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/functional-testing/case-generation');
  });

  it('shows placeholder message when clicking an unimplemented submenu item', async () => {
    const messageHandle = Object.assign(() => {}, {
      then: vi.fn(),
      promise: Promise.resolve(),
    });
    const openSpy = vi.spyOn(message, 'open').mockReturnValue(
      messageHandle as unknown as ReturnType<typeof message.open>,
    );

    useAuthMock.mockReturnValue({
      user: {
        id: 1,
        username: 'admin',
        display_name: '管理员',
        email: null,
        role: 'admin',
        status: 'active',
      },
      logout: vi.fn(),
    });

    renderLayout();

    fireEvent.click(screen.getByText('自动化测试'));
    fireEvent.click(await screen.findByText('UI自动化'));

    expect(openSpy).toHaveBeenCalledWith(expect.objectContaining({
      key: 'sidebar-placeholder-coming-soon',
      type: 'info',
      content: '敬请期待',
    }));
  });
});

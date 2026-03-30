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

function openAiToolsSubmenu() {
  fireEvent.click(screen.getByText('AI辅助工具'));
}

function openConfigManagementSubmenu() {
  fireEvent.click(screen.getByText('配置管理'));
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
    expect(screen.getByTestId('app-sider')).toHaveStyle({
      position: 'fixed',
      height: '100vh',
    });
    expect(screen.getByTestId('app-main-layout')).toHaveStyle({
      marginInlineStart: '248px',
    });

    expect(screen.getByText('质量看板')).toBeInTheDocument();
    expect(screen.getByText('功能测试')).toBeInTheDocument();
    expect(screen.getByText('自动化测试')).toBeInTheDocument();
    expect(screen.getByText('性能测试')).toBeInTheDocument();
    expect(screen.getByText('AI辅助工具')).toBeInTheDocument();
    expect(screen.getByText('项目管理')).toBeInTheDocument();
    expect(screen.getByText('配置管理')).toBeInTheDocument();
    expect(screen.getByText('系统管理')).toBeInTheDocument();

    expect(screen.getByText('案例生成')).toBeInTheDocument();
    expect(screen.getByText('案例质检')).toBeInTheDocument();
    expect(screen.getByText('分析记录')).toBeInTheDocument();
    openConfigManagementSubmenu();
    expect(screen.getByText('提示词管理')).toBeInTheDocument();
    openAiToolsSubmenu();
    expect(screen.getByText('AI助手')).toBeInTheDocument();
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
    expect(screen.getByTestId('app-main-layout')).toHaveStyle({
      marginInlineStart: '84px',
    });
  });

  it('changes route when clicking an implemented ai tools submenu item', async () => {
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
    openAiToolsSubmenu();
    fireEvent.click(screen.getByText('AI助手'));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/ai-tools/agents');
  });

  it('changes route when clicking prompt template menu item', async () => {
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
    openConfigManagementSubmenu();
    fireEvent.click(screen.getByText('提示词管理'));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/config-management/prompt-templates');
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

    fireEvent.click(screen.getByText('案例生成'));
    expect(screen.getByTestId('pathname')).toHaveTextContent('/functional-testing/case-quality');

    fireEvent.click(screen.getByText('自动化测试'));
    fireEvent.click(await screen.findByText('UI自动化'));

    expect(openSpy).toHaveBeenNthCalledWith(1, expect.objectContaining({
      key: 'sidebar-placeholder-coming-soon',
      type: 'info',
      content: '敬请期待',
    }));
    expect(openSpy).toHaveBeenNthCalledWith(2, expect.objectContaining({
      key: 'sidebar-placeholder-coming-soon',
      type: 'info',
      content: '敬请期待',
    }));
  });
});

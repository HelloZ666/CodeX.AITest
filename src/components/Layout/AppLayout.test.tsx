import { act, fireEvent, render, screen } from '@testing-library/react';
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

async function renderLayout(initialEntry: string = '/functional-testing/case-quality') {
  let view: ReturnType<typeof render> | undefined;

  await act(async () => {
    view = render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <LocationProbe />
        <AppLayout>
          <div>content</div>
        </AppLayout>
      </MemoryRouter>,
    );
  });

  return view as ReturnType<typeof render>;
}

function mockAdminUser() {
  useAuthMock.mockReturnValue({
    user: {
      id: 1,
      username: 'admin',
      display_name: 'admin',
      email: null,
      role: 'admin',
      status: 'active',
    },
    logout: vi.fn(),
  });
}

function mockStandardUser() {
  useAuthMock.mockReturnValue({
    user: {
      id: 2,
      username: 'user',
      display_name: 'user',
      email: null,
      role: 'user',
      status: 'active',
    },
    logout: vi.fn(),
  });
}

function openAiToolsSubmenu() {
  fireEvent.click(screen.getByText('AI辅助工具'));
}

function openConfigManagementSubmenu() {
  fireEvent.click(screen.getByText('配置管理'));
}

function openQualityBoardSubmenu() {
  fireEvent.click(screen.getByText('质量看板'));
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('defaults to expanded and keeps the active group open', async () => {
    mockAdminUser();

    const { container } = await renderLayout();

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
    openQualityBoardSubmenu();
    expect(screen.getByText('质量分析')).toBeInTheDocument();
    expect(screen.getByText('效能分析')).toBeInTheDocument();
    openConfigManagementSubmenu();
    expect(screen.getByText('提示词管理')).toBeInTheDocument();
    openAiToolsSubmenu();
    expect(screen.getByText('AI助手')).toBeInTheDocument();
  });

  it('keeps the nested quality analysis submenu open for quality analysis routes', async () => {
    mockAdminUser();

    await renderLayout('/issue-analysis');

    expect(screen.getByText('质量分析')).toBeInTheDocument();
    expect(screen.getByText('效能分析')).toBeInTheDocument();
    expect(screen.getByText('生产问题分析')).toBeInTheDocument();
    expect(screen.getByText('测试问题分析')).toBeInTheDocument();
  });

  it('shows performance analysis before quality analysis under quality board', async () => {
    mockAdminUser();

    await renderLayout();
    openQualityBoardSubmenu();

    const performanceAnalysis = screen.getByText('效能分析');
    const qualityAnalysis = screen.getByText('质量分析');

    expect(
      performanceAnalysis.compareDocumentPosition(qualityAnalysis) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it('hides admin-only menu items for standard users', async () => {
    mockStandardUser();

    await renderLayout();

    expect(screen.queryByText('系统管理')).not.toBeInTheDocument();
    openQualityBoardSubmenu();
    expect(screen.queryByText('效能分析')).not.toBeInTheDocument();
    expect(screen.getByText('质量分析')).toBeInTheDocument();
  });

  it('marks submenu hover state while the sidebar is collapsed', async () => {
    mockAdminUser();

    const { container } = await renderLayout();
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
    mockAdminUser();

    await renderLayout();
    openAiToolsSubmenu();
    fireEvent.click(screen.getByText('AI助手'));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/ai-tools/agents');
  });

  it('changes route when clicking performance analysis menu item', async () => {
    mockAdminUser();

    await renderLayout();
    openQualityBoardSubmenu();
    fireEvent.click(screen.getByText('效能分析'));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/performance-analysis');
  });

  it('changes route when clicking a third-level quality analysis menu item', async () => {
    mockAdminUser();

    await renderLayout('/issue-analysis');
    fireEvent.click(screen.getByText('测试问题分析'));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/defect-analysis');
  });

  it('changes route when clicking prompt template menu item', async () => {
    mockAdminUser();

    await renderLayout();
    openConfigManagementSubmenu();
    fireEvent.click(screen.getByText('提示词管理'));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/config-management/prompt-templates');
  });

  it('changes route when clicking case generation menu item', async () => {
    mockAdminUser();

    await renderLayout();
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

    mockAdminUser();

    await renderLayout();

    fireEvent.click(screen.getByText('自动化测试'));
    fireEvent.click(await screen.findByText('UI自动化'));

    openAiToolsSubmenu();
    fireEvent.click(screen.getByText('PDF核对'));

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

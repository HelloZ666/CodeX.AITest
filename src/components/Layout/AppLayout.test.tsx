import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { message } from 'antd';
import AppLayout from './AppLayout';

const useAuthMock = vi.fn();

vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

function renderLayout(initialEntry: string = '/') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
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

  it('renders the new 8-level menu structure for admin', () => {
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

    renderLayout('/');

    expect(screen.getByText('数据看板')).toBeInTheDocument();
    expect(screen.getByText('功能测试')).toBeInTheDocument();
    expect(screen.getByText('自动化测试')).toBeInTheDocument();
    expect(screen.getByText('性能测试')).toBeInTheDocument();
    expect(screen.getByText('AI辅助工具')).toBeInTheDocument();
    expect(screen.getByText('项目管理')).toBeInTheDocument();
    expect(screen.getByText('配置管理')).toBeInTheDocument();
    expect(screen.getByText('系统管理')).toBeInTheDocument();
    expect(screen.queryByText('文件管理')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('功能测试'));
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

    renderLayout('/');

    expect(screen.queryByText('系统管理')).not.toBeInTheDocument();
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

    renderLayout('/');

    fireEvent.click(screen.getByText('自动化测试'));
    fireEvent.click(await screen.findByText('UI自动化'));

    expect(openSpy).toHaveBeenCalledWith(expect.objectContaining({
      key: 'sidebar-placeholder-coming-soon',
      type: 'info',
      content: '敬请期待',
    }));
  });
});

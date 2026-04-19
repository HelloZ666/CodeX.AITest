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
      display_name: '管理员',
      email: null,
      role: 'admin',
      status: 'active',
    },
    logout: vi.fn(),
  });
}

function openKnowledgeBaseSubmenu() {
  fireEvent.click(screen.getByText('知识库管理'));
}

describe('AppLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the knowledge base section and keeps it open on the editor route', async () => {
    mockAdminUser();

    await renderLayout('/knowledge-base/system-overview/3');

    expect(screen.getByText('知识库管理')).toBeInTheDocument();
    expect(screen.getByText('系统功能全景图')).toBeInTheDocument();
    expect(screen.getByText('测试需求')).toBeInTheDocument();
    expect(screen.getByText('测试案例')).toBeInTheDocument();
  });

  it('navigates to the system overview list when clicking the menu item', async () => {
    mockAdminUser();

    await renderLayout();
    openKnowledgeBaseSubmenu();
    fireEvent.click(screen.getByText('系统功能全景图'));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/knowledge-base/system-overview');
  });

  it('still shows a placeholder message for business rules', async () => {
    const messageHandle = Object.assign(() => {}, {
      then: vi.fn(),
      promise: Promise.resolve(),
    });
    const openSpy = vi.spyOn(message, 'open').mockReturnValue(
      messageHandle as unknown as ReturnType<typeof message.open>,
    );

    mockAdminUser();

    await renderLayout();
    openKnowledgeBaseSubmenu();
    fireEvent.click(screen.getByText('业务规则'));

    expect(openSpy).toHaveBeenCalledWith(expect.objectContaining({
      key: 'sidebar-placeholder-coming-soon',
      type: 'info',
      content: '敬请期待',
    }));
    expect(screen.getByTestId('pathname')).toHaveTextContent('/functional-testing/case-quality');
  });
});

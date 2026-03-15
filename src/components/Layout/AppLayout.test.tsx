import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

  it('shows user management menu for admin and keeps requirement mapping under file management', async () => {
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

    renderLayout('/requirement-mappings');

    expect(screen.getByText('系统管理')).toBeInTheDocument();
    expect(await screen.findByText('需求映射关系')).toBeInTheDocument();
  });

  it('renders renamed menu groups in the expected order for admin', () => {
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

    const dataBoard = screen.getByText('数据看板');
    const requirementAnalysis = screen.getAllByText('需求分析')[0];
    const caseAnalysis = screen.getAllByText('案例分析')[0];
    const projectManagement = screen.getByText('项目管理');
    const fileManagement = screen.getByText('文件管理');
    const systemManagement = screen.getByText('系统管理');

    expect(screen.queryByText('问题看板')).not.toBeInTheDocument();
    expect(screen.queryByText('案例质检')).not.toBeInTheDocument();
    expect(dataBoard.compareDocumentPosition(requirementAnalysis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(requirementAnalysis.compareDocumentPosition(caseAnalysis) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(caseAnalysis.compareDocumentPosition(projectManagement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(projectManagement.compareDocumentPosition(fileManagement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fileManagement.compareDocumentPosition(systemManagement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('hides user management menu for standard users', () => {
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
  it('does not render a page watermark logo inside the page shell', () => {
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

    const { container } = renderLayout();

    expect(container.querySelector('.app-page-watermark')).not.toBeInTheDocument();
  });
});

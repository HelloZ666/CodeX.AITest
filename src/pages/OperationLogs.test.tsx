import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import OperationLogsPage from './OperationLogs';

const listAuditLogs = vi.fn();

vi.mock('../utils/api', () => ({
  listAuditLogs: (...args: unknown[]) => listAuditLogs(...args),
}));

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OperationLogsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('OperationLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listAuditLogs.mockResolvedValue({
      records: [
        {
          id: 1,
          module: 'functional-testing',
          action: 'generate-test-cases',
          target_type: 'functional-test-case-record',
          target_id: '2',
          target_name: 'requirement.docx',
          file_name: 'requirement.docx',
          result: 'success',
          detail: 'generated and saved 3 cases',
          operator_user_id: 1,
          operator_username: 'admin',
          operator_display_name: '系统管理员',
          operator_role: 'admin',
          request_method: 'POST',
          request_path: '/api/functional-testing/case-generation/generate',
          ip_address: '127.0.0.1',
          user_agent: 'vitest',
          metadata: {},
          created_at: '2026-03-29T09:00:00',
        },
      ],
      total: 1,
    });
  });

  it('renders audit logs from the api', async () => {
    renderWithProviders();

    expect(await screen.findByText('操作记录')).toBeInTheDocument();
    expect(await screen.findByText('功能测试')).toBeInTheDocument();
    expect(await screen.findByText('生成测试用例')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '账号' })).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('用例生成完成')).toBeInTheDocument();
    expect(screen.getByText('requirement.docx')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('搜索操作人、账号、文件名、说明或接口路径')).toBeInTheDocument();
    expect(screen.queryByText('generated and saved 3 cases')).not.toBeInTheDocument();
    expect(screen.queryByText('generate-test-cases')).not.toBeInTheDocument();
    expect(screen.queryByText('当前已记录的重点内容')).not.toBeInTheDocument();
    expect(screen.getAllByText('共 1 条').length).toBeGreaterThan(0);
  });
});

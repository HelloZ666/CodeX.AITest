import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import KnowledgeSystemOverviewPage from './KnowledgeSystemOverview';

vi.mock('../utils/api', () => ({
  createKnowledgeSystemOverview: vi.fn(),
  deleteKnowledgeSystemOverview: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  listKnowledgeSystemOverviews: vi.fn(),
  listProjects: vi.fn(),
  updateKnowledgeSystemOverview: vi.fn(),
}));

vi.mock('../utils/knowledgeSystemOverview', () => ({
  parseKnowledgeSystemOverviewImport: vi.fn(),
}));

import {
  createKnowledgeSystemOverview,
  listKnowledgeSystemOverviews,
  listProjects,
  updateKnowledgeSystemOverview,
} from '../utils/api';
import { parseKnowledgeSystemOverviewImport } from '../utils/knowledgeSystemOverview';

function renderWithProviders() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <KnowledgeSystemOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('KnowledgeSystemOverviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listKnowledgeSystemOverviews as Mock).mockResolvedValue([
      {
        id: 1,
        project_id: 11,
        project_name: '核心交易系统',
        title: '核心交易系统全景图',
        description: '覆盖交易主链路',
        creator_name: '管理员',
        creator_username: 'admin',
        creator_display_name: '管理员',
        source_format: 'manual',
        source_file_name: null,
        created_at: '2026-04-19T10:00:00Z',
        updated_at: '2026-04-19T10:00:00Z',
      },
    ]);
    (listProjects as Mock).mockResolvedValue([
      {
        id: 11,
        name: '核心交易系统',
        description: '',
        test_manager_ids: [],
        tester_ids: [],
        mapping_data: null,
        created_at: '2026-04-19T10:00:00Z',
        updated_at: '2026-04-19T10:00:00Z',
      },
      {
        id: 12,
        name: '会员中心',
        description: '',
        test_manager_ids: [],
        tester_ids: [],
        mapping_data: null,
        created_at: '2026-04-19T10:00:00Z',
        updated_at: '2026-04-19T10:00:00Z',
      },
    ]);
  });

  it('renders the overview list and creates a new overview for an unused project', async () => {
    (createKnowledgeSystemOverview as Mock).mockResolvedValue({
      id: 2,
      project_id: 12,
      project_name: '会员中心',
      title: '会员中心系统功能全景图',
      description: '会员业务域',
      creator_name: '管理员',
      creator_username: 'admin',
      creator_display_name: '管理员',
      source_format: 'manual',
      source_file_name: null,
      created_at: '2026-04-19T10:00:00Z',
      updated_at: '2026-04-19T10:00:00Z',
      mind_map_data: {
        layout: 'logicalStructure',
        root: { data: { text: '会员中心系统功能全景图', expand: true }, children: [] },
      },
    });

    renderWithProviders();

    expect(await screen.findByText('系统功能全景图')).toBeInTheDocument();
    expect(await screen.findByText('核心交易系统')).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument();
    expect(screen.queryByText('知识库管理')).not.toBeInTheDocument();
    expect(screen.queryByText('按项目维护系统功能全景图，支持进入思维导图画布编辑，并可直接导入 XMind 或 Markdown 文件覆盖现有大纲。')).not.toBeInTheDocument();
    expect(screen.queryByText('核心交易系统全景图')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('新建大纲'));
    fireEvent.mouseDown(screen.getByRole('combobox'));
    fireEvent.click(await screen.findByText('会员中心'));
    fireEvent.change(screen.getByPlaceholderText('可填写该全景图的业务范围、维护说明或使用约定'), {
      target: { value: '会员业务域' },
    });
    fireEvent.click(screen.getByRole('button', { name: /OK|确定/ }));

    await waitFor(() => {
      expect(createKnowledgeSystemOverview).toHaveBeenCalledWith({
        project_id: 12,
        title: '会员中心系统功能全景图',
        description: '会员业务域',
      });
    });
  });

  it('imports xmind or markdown content from the list action', async () => {
    (parseKnowledgeSystemOverviewImport as Mock).mockResolvedValue({
      data: {
        layout: 'logicalStructure',
        root: {
          data: { text: '导入后的全景图', expand: true },
          children: [{ data: { text: '订单中心', expand: true }, children: [] }],
        },
      },
      sourceFormat: 'markdown',
      sourceFileName: 'overview.md',
    });
    (updateKnowledgeSystemOverview as Mock).mockResolvedValue({});

    const { container } = renderWithProviders();

    await screen.findByText('核心交易系统');
    fireEvent.click(screen.getByRole('button', { name: /导入/ }));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['# 导图'], 'overview.md', { type: 'text/markdown' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(parseKnowledgeSystemOverviewImport).toHaveBeenCalled();
      expect(updateKnowledgeSystemOverview).toHaveBeenCalledWith(1, {
        mind_map_data: expect.objectContaining({
          root: expect.objectContaining({
            data: expect.objectContaining({ text: '导入后的全景图' }),
          }),
        }),
        source_format: 'markdown',
        source_file_name: 'overview.md',
      });
    });
  });
});

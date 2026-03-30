import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PromptTemplatesPage from './PromptTemplates';

vi.mock('../utils/api', () => ({
  createPromptTemplate: vi.fn(),
  deletePromptTemplate: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  listPromptTemplates: vi.fn(),
  updatePromptTemplate: vi.fn(),
}));

import {
  createPromptTemplate,
  deletePromptTemplate,
  listPromptTemplates,
  updatePromptTemplate,
} from '../utils/api';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PromptTemplatesPage />
    </QueryClientProvider>,
  );
}

describe('PromptTemplatesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPromptTemplates).mockResolvedValue([
      {
        id: 1,
        agent_key: 'general',
        name: '通用助手',
        prompt: '这是完整提示词内容',
        created_at: '2026-03-30 00:00:00',
        updated_at: '2026-03-30 00:00:00',
      },
    ]);
    vi.mocked(createPromptTemplate).mockResolvedValue({
      id: 2,
      agent_key: 'prompt_001',
      name: '新提示词',
      prompt: '新内容',
      created_at: '2026-03-30 00:00:00',
      updated_at: '2026-03-30 00:00:00',
    });
    vi.mocked(updatePromptTemplate).mockResolvedValue({
      id: 1,
      agent_key: 'general',
      name: '通用助手',
      prompt: '更新后的提示词',
      created_at: '2026-03-30 00:00:00',
      updated_at: '2026-03-30 00:00:00',
    });
    vi.mocked(deletePromptTemplate).mockResolvedValue(undefined);
  });

  it('does not render prompt content in the table and shows it in detail modal', async () => {
    renderPage();

    const templateName = await screen.findByRole('cell', { name: '通用助手' });
    const row = templateName.closest('tr');
    expect(row).not.toBeNull();
    expect(screen.queryByText('这是完整提示词内容')).not.toBeInTheDocument();

    fireEvent.click(within(row as HTMLElement).getByText('详情'));

    expect(await screen.findByText('这是完整提示词内容')).toBeInTheDocument();
  });

  it('creates a new prompt template', async () => {
    renderPage();

    await screen.findByText('通用助手');
    fireEvent.click(screen.getByRole('button', { name: /新增/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('例如：接口回归助手'), {
      target: { value: '新提示词' },
    });
    fireEvent.change(screen.getByPlaceholderText('请输入完整提示词内容'), {
      target: { value: '新内容' },
    });
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      expect(createPromptTemplate).toHaveBeenCalledWith({
        name: '新提示词',
        prompt: '新内容',
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveClass('ant-zoom-leave');
    });
  }, 15000);

  it('edits an existing prompt template', async () => {
    renderPage();

    const templateName = await screen.findByRole('cell', { name: '通用助手' });
    const row = templateName.closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByText('编辑'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('这是完整提示词内容'), {
      target: { value: '更新后的提示词' },
    });
    fireEvent.click(screen.getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      expect(updatePromptTemplate).toHaveBeenCalledWith(1, {
        name: '通用助手',
        prompt: '更新后的提示词',
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toHaveClass('ant-zoom-leave');
    });
  }, 15000);

  it('deletes a prompt template after confirmation', async () => {
    renderPage();

    const templateName = await screen.findByRole('cell', { name: '通用助手' });
    const row = templateName.closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByText('删除'));
    await screen.findByText('确认删除这条提示词吗？');
    const deleteButtons = await screen.findAllByRole('button', { name: /删\s*除/ });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]);

    await waitFor(() => {
      expect(deletePromptTemplate).toHaveBeenCalledWith(1);
    });
  });
});

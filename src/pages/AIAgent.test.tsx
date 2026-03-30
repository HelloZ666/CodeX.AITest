import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AIAgentPage from './AIAgent';

vi.mock('../utils/api', () => ({
  chatWithAIAgent: vi.fn(),
  extractApiErrorMessage: vi.fn((error: Error, fallback: string) => error.message || fallback),
  listPromptTemplates: vi.fn(),
}));

import { chatWithAIAgent, listPromptTemplates } from '../utils/api';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AIAgentPage />
    </QueryClientProvider>,
  );
}

describe('AIAgentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listPromptTemplates).mockResolvedValue([
      {
        id: 1,
        agent_key: 'general',
        name: '通用助手',
        prompt: '通用提示词',
        created_at: '2026-03-30 00:00:00',
        updated_at: '2026-03-30 00:00:00',
      },
      {
        id: 2,
        agent_key: 'api',
        name: '接口自动化助手',
        prompt: '接口提示词',
        created_at: '2026-03-30 00:00:00',
        updated_at: '2026-03-30 00:00:00',
      },
    ]);
    vi.mocked(chatWithAIAgent).mockResolvedValue({
      answer: '这是智能体返回的答案',
      provider: 'DeepSeek',
      provider_key: 'deepseek',
      agent_key: 'general',
      agent_name: '通用助手',
      prompt_used: 'prompt',
      attachments: [],
    });
  });

  it('loads prompt templates and submits the current question', async () => {
    renderPage();

    expect(await screen.findByPlaceholderText('给 通用助手 发送消息')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('给 通用助手 发送消息'), {
      target: { value: '帮我分析这份资料' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));

    await waitFor(() => {
      expect(chatWithAIAgent).toHaveBeenCalledWith({
        question: '帮我分析这份资料',
        agent_key: 'general',
        attachments: [],
      });
    });

    expect(await screen.findByText('这是智能体返回的答案')).toBeInTheDocument();
  });

  it('keeps uploaded attachments and submits them together', async () => {
    renderPage();

    await screen.findByPlaceholderText('给 通用助手 发送消息');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'context.json', { type: 'application/json' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.change(screen.getByPlaceholderText('给 通用助手 发送消息'), {
      target: { value: '结合附件回答' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));

    await waitFor(() => {
      expect(chatWithAIAgent).toHaveBeenCalledWith({
        question: '结合附件回答',
        agent_key: 'general',
        attachments: [file],
      });
    });

    expect(screen.getByText(/context\.json/)).toBeInTheDocument();
  });

  it('falls back to the default ai assistant when no prompt template is configured', async () => {
    vi.mocked(listPromptTemplates).mockResolvedValueOnce([]);
    renderPage();

    expect(await screen.findByText('当前未配置提示词')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('直接输入问题，默认不使用提示词');
    expect(input).toBeEnabled();

    fireEvent.change(input, {
      target: { value: '直接使用默认助手回答' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));

    await waitFor(() => {
      expect(chatWithAIAgent).toHaveBeenCalledWith({
        question: '直接使用默认助手回答',
        agent_key: 'default',
        attachments: [],
      });
    });
  });
});

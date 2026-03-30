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

function createChatResponse(overrides?: Partial<Awaited<ReturnType<typeof chatWithAIAgent>>>) {
  return {
    answer: '这是智能体返回的答案',
    provider: 'DeepSeek',
    provider_key: 'deepseek',
    agent_key: 'general',
    agent_name: '通用助手',
    prompt_used: 'prompt',
    conversation_id: 'conversation-1',
    conversation_title: '帮我分析这份资料',
    attachments: [],
    user_message: {
      id: 1,
      role: 'user' as const,
      content: '帮我分析这份资料',
      attachments: [],
      agent_key: 'general',
      agent_name: '通用助手',
      provider: null,
      provider_key: null,
      created_at: '2026-03-30T00:00:00Z',
    },
    assistant_message: {
      id: 2,
      role: 'assistant' as const,
      content: '这是智能体返回的答案',
      attachments: [],
      agent_key: 'general',
      agent_name: '通用助手',
      provider: 'DeepSeek',
      provider_key: 'deepseek',
      created_at: '2026-03-30T00:00:01Z',
    },
    ...overrides,
  };
}

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
    window.localStorage.clear();
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
    vi.mocked(chatWithAIAgent).mockResolvedValue(createChatResponse());
  });

  it('默认展示欢迎态，并以通用助手发送首条无附件消息', async () => {
    renderPage();

    expect(await screen.findByText('今天有什么可以帮到你?')).toBeInTheDocument();
    expect(screen.queryByText('深度思考')).not.toBeInTheDocument();
    expect(screen.queryByText('智能搜索')).not.toBeInTheDocument();

    const input = await screen.findByPlaceholderText('给 通用助手 发送消息');
    fireEvent.change(input, {
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
    expect(screen.getByRole('button', { name: /新建对话/ })).toBeInTheDocument();
    expect(screen.getByText(/已思考/)).toBeInTheDocument();
    expect(document.querySelector('.ai-agent-turn__actions--assistant .anticon-reload')).not.toBeInTheDocument();
    expect(document.querySelector('.ai-agent-turn__actions--assistant .anticon-like')).not.toBeInTheDocument();
    expect(document.querySelector('.ai-agent-turn__actions--assistant .anticon-dislike')).not.toBeInTheDocument();
    expect(document.querySelector('.ai-agent-turn__actions--assistant .anticon-share-alt')).not.toBeInTheDocument();
  });

  it('支持上传附件，并在追问时沿用同一会话', async () => {
    vi.mocked(chatWithAIAgent)
      .mockResolvedValueOnce(createChatResponse({
        answer: '我已结合附件内容给出第一轮回答',
        conversation_title: '结合附件回答',
        attachments: [
          {
            file_name: 'context.json',
            file_type: 'json',
            file_size: 2,
            excerpt: '{"case":"demo"}',
            truncated: false,
          },
        ],
        user_message: {
          id: 11,
          role: 'user',
          content: '结合附件回答',
          attachments: [
            {
              file_name: 'context.json',
              file_type: 'json',
              file_size: 2,
              excerpt: '{"case":"demo"}',
              truncated: false,
            },
          ],
          agent_key: 'general',
          agent_name: '通用助手',
          provider: null,
          provider_key: null,
          created_at: '2026-03-30T00:00:00Z',
        },
        assistant_message: {
          id: 12,
          role: 'assistant',
          content: '我已结合附件内容给出第一轮回答',
          attachments: [],
          agent_key: 'general',
          agent_name: '通用助手',
          provider: 'DeepSeek',
          provider_key: 'deepseek',
          created_at: '2026-03-30T00:00:01Z',
        },
      }))
      .mockResolvedValueOnce(createChatResponse({
        answer: '这是第二轮回答，会沿用上一轮上下文',
        conversation_title: '结合附件回答',
        user_message: {
          id: 13,
          role: 'user',
          content: '继续补充风险点',
          attachments: [],
          agent_key: 'general',
          agent_name: '通用助手',
          provider: null,
          provider_key: null,
          created_at: '2026-03-30T00:01:00Z',
        },
        assistant_message: {
          id: 14,
          role: 'assistant',
          content: '这是第二轮回答，会沿用上一轮上下文',
          attachments: [],
          agent_key: 'general',
          agent_name: '通用助手',
          provider: 'DeepSeek',
          provider_key: 'deepseek',
          created_at: '2026-03-30T00:01:01Z',
        },
      }));

    renderPage();

    const input = await screen.findByPlaceholderText('给 通用助手 发送消息');
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['{}'], 'context.json', { type: 'application/json' });

    fireEvent.change(fileInput, { target: { files: [file] } });
    fireEvent.change(input, {
      target: { value: '结合附件回答' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));

    await waitFor(() => {
      expect(chatWithAIAgent).toHaveBeenNthCalledWith(1, {
        question: '结合附件回答',
        agent_key: 'general',
        attachments: [file],
      });
    });

    expect(await screen.findByText('我已结合附件内容给出第一轮回答')).toBeInTheDocument();
    expect(screen.getByText(/context\.json/)).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('给 通用助手 发送消息'), {
      target: { value: '继续补充风险点' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));

    await waitFor(() => {
      expect(chatWithAIAgent).toHaveBeenNthCalledWith(2, {
        question: '继续补充风险点',
        agent_key: 'general',
        conversation_id: 'conversation-1',
        attachments: [],
      });
    });

    expect(await screen.findByText('这是第二轮回答，会沿用上一轮上下文')).toBeInTheDocument();
    expect(screen.getAllByText('结合附件回答').length).toBeGreaterThan(0);
  });

  it('在接口未返回 attachments 字段时，会继续规范化并持久化为空数组', async () => {
    const baseResponse = createChatResponse();
    vi.mocked(chatWithAIAgent).mockResolvedValueOnce({
      ...baseResponse,
      user_message: {
        ...baseResponse.user_message,
        attachments: undefined as never,
      },
      assistant_message: {
        ...baseResponse.assistant_message,
        attachments: undefined as never,
      },
    });

    renderPage();

    const input = await screen.findByPlaceholderText('给 通用助手 发送消息');
    fireEvent.change(input, {
      target: { value: '帮我分析这份资料' },
    });
    fireEvent.click(screen.getByRole('button', { name: '发送问题' }));

    expect(await screen.findByText('这是智能体返回的答案')).toBeInTheDocument();

    await waitFor(() => {
      const storedState = JSON.parse(
        window.localStorage.getItem('codetestguard:ai-agent:conversation:v1') ?? '{}',
      ) as { messages?: Array<{ attachments?: unknown[] }> };

      expect(storedState.messages?.[0]?.attachments).toEqual([]);
      expect(storedState.messages?.[1]?.attachments).toEqual([]);
    });
  });

  it('在没有提示词时回退到默认助手，并保持欢迎态输入框可用', async () => {
    vi.mocked(listPromptTemplates).mockResolvedValueOnce([]);
    vi.mocked(chatWithAIAgent).mockResolvedValueOnce(createChatResponse({
      agent_key: 'default',
      agent_name: '默认 AI 助手',
      prompt_used: '',
      conversation_title: '直接使用默认助手回答',
      user_message: {
        id: 21,
        role: 'user',
        content: '直接使用默认助手回答',
        attachments: [],
        agent_key: 'default',
        agent_name: '默认 AI 助手',
        provider: null,
        provider_key: null,
        created_at: '2026-03-30T00:00:00Z',
      },
      assistant_message: {
        id: 22,
        role: 'assistant',
        content: '这是智能体返回的答案',
        attachments: [],
        agent_key: 'default',
        agent_name: '默认 AI 助手',
        provider: 'DeepSeek',
        provider_key: 'deepseek',
        created_at: '2026-03-30T00:00:01Z',
      },
    }));

    renderPage();

    expect(await screen.findByText('当前未配置提示词')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('给 默认 AI 助手 发送消息');
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

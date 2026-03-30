import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Input,
  Select,
  Skeleton,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ArrowUpOutlined,
  BulbOutlined,
  CopyOutlined,
  EditOutlined,
  PaperClipOutlined,
  PlusOutlined,
  RobotOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { chatWithAIAgent, extractApiErrorMessage, listPromptTemplates } from '../utils/api';
import type {
  AIAgentAttachmentSummary,
  AIAgentConversationMessage,
  PromptTemplate,
} from '../types';

const { Paragraph, Text, Title } = Typography;
const ATTACHMENT_ACCEPT = '.csv,.xls,.xlsx,.json,.doc,.docx,.pdf,.yaml,.yml';
const AI_AGENT_STORAGE_KEY = 'codetestguard:ai-agent:conversation:v1';
const GENERAL_AI_ASSISTANT_KEY = 'general';
const DEFAULT_AI_ASSISTANT: PromptTemplate = {
  id: 0,
  agent_key: 'default',
  name: '默认 AI 助手',
  prompt: '',
  created_at: '',
  updated_at: '',
};

interface StoredConversationState {
  conversationId: string | null;
  conversationTitle: string | null;
  selectedAgentKey: string;
  messages: AIAgentConversationMessage[];
}

interface TimelineMessage extends AIAgentConversationMessage {
  pending?: boolean;
  error?: boolean;
}

interface ChatMutationInput {
  question: string;
  attachments: File[];
  conversationId: string | null;
  optimisticUserId: string;
  optimisticAssistantId: string;
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function inferAttachmentTypeFromName(fileName: string): string {
  const matched = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return matched?.[1] ?? 'file';
}

function createLocalMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeAttachmentSummaries(
  attachments: AIAgentAttachmentSummary[] | null | undefined,
): AIAgentAttachmentSummary[] {
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments
    .filter((item) => item && typeof item === 'object' && typeof item.file_name === 'string')
    .map((item) => ({
      file_name: item.file_name,
      file_type: typeof item.file_type === 'string' && item.file_type.trim()
        ? item.file_type
        : inferAttachmentTypeFromName(item.file_name),
      file_size: typeof item.file_size === 'number' && Number.isFinite(item.file_size)
        ? item.file_size
        : 0,
      excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
      truncated: Boolean(item.truncated),
    }));
}

function normalizeTimelineMessage(messageItem: Partial<TimelineMessage>): TimelineMessage {
  const normalizedMessage: TimelineMessage = {
    id: messageItem.id ?? createLocalMessageId(messageItem.role === 'assistant' ? 'assistant' : 'user'),
    role: messageItem.role === 'assistant' ? 'assistant' : 'user',
    content: typeof messageItem.content === 'string' ? messageItem.content : '',
    attachments: normalizeAttachmentSummaries(messageItem.attachments),
    agent_key: messageItem.agent_key ?? null,
    agent_name: messageItem.agent_name ?? null,
    provider: messageItem.provider ?? null,
    provider_key: messageItem.provider_key ?? null,
    created_at: messageItem.created_at ?? null,
  };

  if (messageItem.pending) {
    normalizedMessage.pending = true;
  }
  if (messageItem.error) {
    normalizedMessage.error = true;
  }

  return normalizedMessage;
}

function readStoredConversationState(): StoredConversationState | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(AI_AGENT_STORAGE_KEY);
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as Partial<StoredConversationState>;
    if (!Array.isArray(parsed.messages)) {
      return null;
    }

    const messages: AIAgentConversationMessage[] = parsed.messages
      .filter((item) => item && typeof item === 'object' && typeof item.content === 'string')
      .map((item) => normalizeTimelineMessage(item));

    return {
      conversationId: typeof parsed.conversationId === 'string' && parsed.conversationId.trim()
        ? parsed.conversationId
        : null,
      conversationTitle: typeof parsed.conversationTitle === 'string' && parsed.conversationTitle.trim()
        ? parsed.conversationTitle
        : null,
      selectedAgentKey: typeof parsed.selectedAgentKey === 'string' && parsed.selectedAgentKey.trim()
        ? parsed.selectedAgentKey
        : GENERAL_AI_ASSISTANT_KEY,
      messages,
    };
  } catch {
    return null;
  }
}

function buildLocalAttachmentSummary(file: File): AIAgentAttachmentSummary {
  return {
    file_name: file.name,
    file_type: inferAttachmentTypeFromName(file.name),
    file_size: file.size,
    excerpt: '',
    truncated: false,
  };
}

function buildOptimisticUserMessage(question: string, files: File[]): TimelineMessage {
  return {
    id: createLocalMessageId('user'),
    role: 'user',
    content: question,
    attachments: files.map(buildLocalAttachmentSummary),
    created_at: new Date().toISOString(),
  };
}

function buildPendingAssistantMessage(agentName: string): TimelineMessage {
  return {
    id: createLocalMessageId('assistant'),
    role: 'assistant',
    content: '',
    attachments: [],
    agent_name: agentName,
    pending: true,
    created_at: new Date().toISOString(),
  };
}

function formatThinkingDuration(
  assistantMessage: TimelineMessage,
  messages: TimelineMessage[],
): string {
  if (assistantMessage.pending) {
    return '思考中...';
  }

  const assistantTime = assistantMessage.created_at ? Date.parse(assistantMessage.created_at) : Number.NaN;
  if (!Number.isFinite(assistantTime)) {
    return '已思考';
  }

  const currentIndex = messages.findIndex((item) => item.id === assistantMessage.id);
  if (currentIndex <= 0) {
    return '已思考';
  }

  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const candidate = messages[index];
    if (candidate.role !== 'user' || !candidate.created_at) {
      continue;
    }

    const userTime = Date.parse(candidate.created_at);
    if (!Number.isFinite(userTime)) {
      break;
    }

    const diffSeconds = Math.max(1, Math.round((assistantTime - userTime) / 1000));
    return `已思考（用时 ${diffSeconds} 秒）`;
  }

  return '已思考';
}

async function copyMessageContent(content: string): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    message.warning('当前环境暂不支持自动复制');
    return;
  }

  try {
    await navigator.clipboard.writeText(content);
    message.success('已复制消息内容');
  } catch {
    message.warning('复制失败，请稍后重试');
  }
}

const AIAgentPage: React.FC = () => {
  const [storedState] = useState<StoredConversationState | null>(() => readStoredConversationState());
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedAgentKey, setSelectedAgentKey] = useState(
    storedState?.selectedAgentKey || GENERAL_AI_ASSISTANT_KEY,
  );
  const [question, setQuestion] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(storedState?.conversationId ?? null);
  const [conversationTitle, setConversationTitle] = useState<string | null>(storedState?.conversationTitle ?? null);
  const [messagesList, setMessagesList] = useState<TimelineMessage[]>(storedState?.messages ?? []);

  const promptTemplatesQuery = useQuery({
    queryKey: ['prompt-templates'],
    queryFn: listPromptTemplates,
    staleTime: 30_000,
  });

  const promptTemplates = promptTemplatesQuery.data ?? [];
  const agents = promptTemplates.length > 0 ? promptTemplates : [DEFAULT_AI_ASSISTANT];

  useEffect(() => {
    const exists = agents.some((item) => item.agent_key === selectedAgentKey);
    if (!exists) {
      const preferredAgent = agents.find((item) => item.agent_key === GENERAL_AI_ASSISTANT_KEY) ?? agents[0];
      setSelectedAgentKey(preferredAgent?.agent_key ?? DEFAULT_AI_ASSISTANT.agent_key);
    }
  }, [agents, selectedAgentKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const persistedMessages = messagesList.filter((item) => !item.pending);
    if (!conversationId && !conversationTitle && persistedMessages.length === 0) {
      window.localStorage.removeItem(AI_AGENT_STORAGE_KEY);
      return;
    }

    const stateToPersist: StoredConversationState = {
      conversationId,
      conversationTitle,
      selectedAgentKey,
      messages: persistedMessages.map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        attachments: item.attachments,
        agent_key: item.agent_key ?? null,
        agent_name: item.agent_name ?? null,
        provider: item.provider ?? null,
        provider_key: item.provider_key ?? null,
        created_at: item.created_at ?? null,
      })),
    };
    window.localStorage.setItem(AI_AGENT_STORAGE_KEY, JSON.stringify(stateToPersist));
  }, [conversationId, conversationTitle, messagesList, selectedAgentKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messagesList]);

  const selectedAgent = useMemo(
    () => agents.find((item) => item.agent_key === selectedAgentKey) ?? null,
    [agents, selectedAgentKey],
  );

  const nonPendingMessages = useMemo(
    () => messagesList.filter((item) => !item.pending),
    [messagesList],
  );

  const hasMessages = messagesList.length > 0;
  const selectedAgentName = selectedAgent?.name ?? DEFAULT_AI_ASSISTANT.name;

  const resetConversation = (clearDraft: boolean) => {
    setConversationId(null);
    setConversationTitle(null);
    setMessagesList([]);
    if (clearDraft) {
      setQuestion('');
      setAttachments([]);
    }
  };

  const chatMutation = useMutation({
    mutationFn: (payload: ChatMutationInput) => chatWithAIAgent({
      question: payload.question,
      agent_key: selectedAgentKey,
      ...(payload.conversationId ? { conversation_id: payload.conversationId } : {}),
      attachments: payload.attachments,
    }),
    onSuccess: (response, variables) => {
      const normalizedUserMessage = normalizeTimelineMessage(response.user_message);
      const normalizedAssistantMessage = normalizeTimelineMessage(response.assistant_message);
      setConversationId(response.conversation_id);
      setConversationTitle(response.conversation_title);
      setMessagesList((current) => {
        let hasResolvedUser = false;
        let hasResolvedAssistant = false;
        const nextMessages = current.map((item) => {
          if (item.id === variables.optimisticUserId) {
            hasResolvedUser = true;
            return normalizedUserMessage;
          }
          if (item.id === variables.optimisticAssistantId) {
            hasResolvedAssistant = true;
            return normalizedAssistantMessage;
          }
          return item;
        });

        if (!hasResolvedUser) {
          nextMessages.push(normalizedUserMessage);
        }
        if (!hasResolvedAssistant) {
          nextMessages.push(normalizedAssistantMessage);
        }
        return nextMessages;
      });
    },
    onError: (error, variables) => {
      const detail = extractApiErrorMessage(error, 'AI 助手问答失败');
      setMessagesList((current) => current.map((item) => {
        if (item.id !== variables.optimisticAssistantId) {
          return item;
        }
        return {
          ...item,
          pending: false,
          error: true,
          content: detail,
        };
      }));
      message.error(detail);
    },
  });

  const submitDisabled = !question.trim() || !selectedAgent || chatMutation.isPending;

  const handleSelectFiles = (fileList: FileList | null) => {
    if (!fileList?.length) {
      return;
    }

    const existingKeys = new Set(attachments.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
    const nextFiles = [...attachments];
    for (const file of Array.from(fileList)) {
      const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
      if (!existingKeys.has(fileKey)) {
        nextFiles.push(file);
      }
    }
    setAttachments(nextFiles);
  };

  const handleRemoveAttachment = (targetFile: File) => {
    setAttachments((current) => current.filter((file) => (
      `${file.name}-${file.size}-${file.lastModified}` !== `${targetFile.name}-${targetFile.size}-${targetFile.lastModified}`
    )));
  };

  const handleSubmit = () => {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !selectedAgent || chatMutation.isPending) {
      return;
    }

    const pendingFiles = [...attachments];
    const optimisticUserMessage = buildOptimisticUserMessage(trimmedQuestion, pendingFiles);
    const optimisticAssistantMessage = buildPendingAssistantMessage(selectedAgent.name);

    setMessagesList((current) => [...current, optimisticUserMessage, optimisticAssistantMessage]);
    setQuestion('');
    setAttachments([]);

    chatMutation.mutate({
      question: trimmedQuestion,
      attachments: pendingFiles,
      conversationId,
      optimisticUserId: String(optimisticUserMessage.id),
      optimisticAssistantId: String(optimisticAssistantMessage.id),
    });
  };

  const handleAgentChange = (value: string) => {
    if (value !== selectedAgentKey && nonPendingMessages.length > 0) {
      resetConversation(false);
    }
    setSelectedAgentKey(value);
  };

  const renderMessageAttachments = (item: TimelineMessage) => {
    if (!item.attachments?.length) {
      return null;
    }

    return (
      <div className={`ai-agent-turn__attachments ai-agent-turn__attachments--${item.role}`}>
        {item.attachments.map((attachment) => (
          <div
            key={`${String(item.id)}-${attachment.file_name}-${attachment.file_size}`}
            className="ai-agent-turn__attachment-card"
          >
            <Text strong>{attachment.file_name}</Text>
            <Text type="secondary">
              {attachment.file_type} · {formatFileSize(attachment.file_size)}
            </Text>
            {attachment.excerpt ? (
              <Paragraph ellipsis={{ rows: 3, expandable: false }}>
                {attachment.excerpt}
              </Paragraph>
            ) : (
              <Paragraph>附件已加入当前轮次上下文</Paragraph>
            )}
          </div>
        ))}
      </div>
    );
  };

  const inputPlaceholder = `给 ${selectedAgentName} 发送消息`;

  return (
    <div className={`ai-agent-page ${hasMessages ? 'ai-agent-page--conversation' : 'ai-agent-page--welcome'}`}>
      <div className="ai-agent-page__alerts">
        {promptTemplatesQuery.isError ? (
          <Alert
            type="warning"
            showIcon
            title="提示词加载失败，已切换为默认 AI 助手"
            description={extractApiErrorMessage(promptTemplatesQuery.error, '当前将默认不使用提示词，你可以直接提问。')}
            className="ai-agent-response ai-agent-response--alert"
          />
        ) : null}

        {!promptTemplatesQuery.isLoading && !promptTemplatesQuery.isError && promptTemplates.length === 0 ? (
          <Alert
            type="info"
            showIcon
            title="当前未配置提示词"
            description="已自动切换为默认 AI 助手，你可以直接提问；如需固定回答风格，可前往配置管理新增提示词。"
            className="ai-agent-response ai-agent-response--alert"
          />
        ) : null}
      </div>

      <div className="ai-agent-page__content">
        {!hasMessages ? (
          <section className="ai-agent-welcome-panel" aria-label="AI 助手欢迎语">
            <div className="ai-agent-welcome-panel__brand">
              <span className="ai-agent-welcome-panel__icon" aria-hidden="true">
                <RobotOutlined />
              </span>
              <Title level={2}>今天有什么可以帮到你?</Title>
            </div>
          </section>
        ) : (
          <header className="ai-agent-conversation-header">
            <Text className="ai-agent-conversation-header__title">
              {conversationTitle || '当前对话'}
            </Text>
            <Button
              type="text"
              icon={<PlusOutlined />}
              onClick={() => resetConversation(true)}
              className="ai-agent-conversation-header__action"
            >
              新建对话
            </Button>
          </header>
        )}

        {hasMessages ? (
          <section className="ai-agent-thread ai-agent-thread--minimal" aria-label="AI 助手会话区">
            {messagesList.map((item) => (
              <article
                key={String(item.id)}
                className={[
                  'ai-agent-turn',
                  `ai-agent-turn--${item.role}`,
                  item.error ? 'ai-agent-turn--error' : '',
                ].filter(Boolean).join(' ')}
              >
                {item.role === 'user' ? (
                  <div className="ai-agent-turn__user-stack">
                    <div className="ai-agent-turn__user-bubble">{item.content}</div>
                    {renderMessageAttachments(item)}
                    <div className="ai-agent-turn__actions ai-agent-turn__actions--user">
                      <Button
                        type="text"
                        size="small"
                        icon={<CopyOutlined />}
                        aria-label="复制用户消息"
                        onClick={() => {
                          void copyMessageContent(item.content);
                        }}
                      />
                      <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        aria-label="再次编辑这条消息"
                        onClick={() => setQuestion(item.content)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="ai-agent-turn__assistant-stack">
                    {!item.error ? (
                      <div className="ai-agent-turn__thinking">
                        {item.pending ? <LoadingOutlined /> : <BulbOutlined />}
                        <Text>{formatThinkingDuration(item, messagesList)}</Text>
                      </div>
                    ) : null}

                    {item.pending ? (
                      <Skeleton
                        active
                        paragraph={{ rows: 3 }}
                        title={false}
                        className="ai-agent-turn__skeleton"
                      />
                    ) : (
                      <Paragraph className="ai-agent-turn__assistant-content">{item.content}</Paragraph>
                    )}

                    {renderMessageAttachments(item)}

                    {!item.pending ? (
                      <div className="ai-agent-turn__actions ai-agent-turn__actions--assistant">
                        <Button
                          type="text"
                          size="small"
                          icon={<CopyOutlined />}
                          aria-label="复制助手消息"
                          onClick={() => {
                            void copyMessageContent(item.content);
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
              </article>
            ))}
            <div ref={messagesEndRef} />
          </section>
        ) : null}
      </div>

      <section className={`ai-agent-composer-shell ${hasMessages ? 'ai-agent-composer-shell--floating' : 'ai-agent-composer-shell--welcome'}`}>
        <section className="ai-agent-composer-card" aria-label="AI 助手输入区">
          <Input.TextArea
            value={question}
            autoSize={{ minRows: hasMessages ? 3 : 4, maxRows: 8 }}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={inputPlaceholder}
            className="ai-agent-composer-card__textarea"
            disabled={!selectedAgent}
            onPressEnter={(event) => {
              if (!event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
            }}
          />

          {attachments.length > 0 ? (
            <div className="ai-agent-composer-card__attachments">
              {attachments.map((file) => (
                <Tag
                  key={`${file.name}-${file.size}-${file.lastModified}`}
                  closable
                  onClose={() => handleRemoveAttachment(file)}
                  className="ai-agent-composer-card__attachment-tag"
                >
                  {file.name} · {formatFileSize(file.size)}
                </Tag>
              ))}
            </div>
          ) : null}

          <div className="ai-agent-composer-card__footer">
            {agents.length > 1 ? (
              <div className="ai-agent-composer-card__meta">
                <Select
                  value={selectedAgentKey || undefined}
                  onChange={handleAgentChange}
                  options={agents.map((agent) => ({ value: agent.agent_key, label: agent.name }))}
                  className="ai-agent-composer-card__agent-select"
                  popupMatchSelectWidth={false}
                  aria-label="选择 AI 助手"
                  placeholder={promptTemplatesQuery.isLoading ? '加载 AI 助手中' : '请选择 AI 助手'}
                  loading={promptTemplatesQuery.isLoading}
                  disabled={promptTemplatesQuery.isLoading}
                  size="small"
                />
              </div>
            ) : null}

            <div className="ai-agent-composer-card__actions">
              <input
                ref={attachmentInputRef}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                className="ai-agent-composer-card__file-input"
                onChange={(event) => {
                  handleSelectFiles(event.target.files);
                  event.target.value = '';
                }}
              />
              <Button
                type="text"
                className="ai-agent-composer-card__icon-button"
                icon={<PaperClipOutlined />}
                onClick={() => attachmentInputRef.current?.click()}
                aria-label="上传附件"
                disabled={!selectedAgent}
              />
              <Button
                type="primary"
                shape="circle"
                className="ai-agent-composer-card__send-button"
                icon={<ArrowUpOutlined />}
                onClick={handleSubmit}
                loading={chatMutation.isPending}
                disabled={submitDisabled}
                aria-label="发送问题"
              />
            </div>
          </div>
        </section>
      </section>
    </div>
  );
};

export default AIAgentPage;

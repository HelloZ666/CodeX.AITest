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
  PaperClipOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { chatWithAIAgent, extractApiErrorMessage, listPromptTemplates } from '../utils/api';
import type { AIAgentChatResult, PromptTemplate } from '../types';

const { Paragraph, Text, Title } = Typography;
const ATTACHMENT_ACCEPT = '.csv,.xls,.xlsx,.json,.doc,.docx,.pdf,.yaml,.yml';
const DEFAULT_AI_ASSISTANT: PromptTemplate = {
  id: 0,
  agent_key: 'default',
  name: '默认AI助手',
  prompt: '',
  created_at: '',
  updated_at: '',
};

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

const AIAgentPage: React.FC = () => {
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedAgentKey, setSelectedAgentKey] = useState(DEFAULT_AI_ASSISTANT.agent_key);
  const [question, setQuestion] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [result, setResult] = useState<AIAgentChatResult | null>(null);

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
      setSelectedAgentKey(agents[0]?.agent_key ?? '');
    }
  }, [agents, selectedAgentKey]);

  const selectedAgent = useMemo(
    () => agents.find((item) => item.agent_key === selectedAgentKey) ?? null,
    [agents, selectedAgentKey],
  );

  const submitDisabled = !question.trim() || !selectedAgent;

  const chatMutation = useMutation({
    mutationFn: () => chatWithAIAgent({
      question: question.trim(),
      agent_key: selectedAgentKey,
      attachments,
    }),
    onSuccess: (response) => {
      setResult(response);
      message.success('AI助手已返回回答');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, 'AI助手问答失败'));
    },
  });

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
    if (submitDisabled || chatMutation.isPending) {
      return;
    }
    chatMutation.mutate();
  };

  const usingDefaultAssistant = selectedAgent?.agent_key === DEFAULT_AI_ASSISTANT.agent_key;
  const inputPlaceholder = selectedAgent
    ? (usingDefaultAssistant ? '直接输入问题，默认不使用提示词' : `给 ${selectedAgent.name} 发送消息`)
    : '请输入你的问题';

  return (
    <div className="ai-agent-page">
      <section className="ai-agent-page__hero">
        <div className="ai-agent-page__headline">
          <span className="ai-agent-page__icon" aria-hidden="true">
            <RobotOutlined />
          </span>
          <Title level={2}>今天有什么可以帮到你？</Title>
        </div>
      </section>

      <section className="ai-agent-composer" aria-label="AI助手输入区">
        <Input.TextArea
          value={question}
          autoSize={{ minRows: 4, maxRows: 10 }}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={inputPlaceholder}
          className="ai-agent-composer__textarea"
          disabled={!selectedAgent}
          onPressEnter={(event) => {
            if (!event.shiftKey) {
              event.preventDefault();
              handleSubmit();
            }
          }}
        />

        {attachments.length > 0 ? (
          <div className="ai-agent-composer__attachments">
            {attachments.map((file) => (
              <Tag
                key={`${file.name}-${file.size}-${file.lastModified}`}
                closable
                onClose={() => handleRemoveAttachment(file)}
                className="ai-agent-composer__attachment-tag"
              >
                {file.name} · {formatFileSize(file.size)}
              </Tag>
            ))}
          </div>
        ) : null}

        <div className="ai-agent-composer__footer">
          <div className="ai-agent-composer__footer-left">
            <Select
              value={selectedAgentKey || undefined}
              onChange={(value) => setSelectedAgentKey(value)}
              options={agents.map((agent) => ({ value: agent.agent_key, label: agent.name }))}
              className="ai-agent-composer__agent-select"
              popupMatchSelectWidth={false}
              aria-label="选择AI助手"
              placeholder={promptTemplatesQuery.isLoading ? '加载AI助手中' : '请选择AI助手'}
              loading={promptTemplatesQuery.isLoading}
              disabled={promptTemplatesQuery.isLoading}
            />
          </div>

          <div className="ai-agent-composer__footer-right">
            <input
              ref={attachmentInputRef}
              type="file"
              multiple
              accept={ATTACHMENT_ACCEPT}
              className="ai-agent-composer__file-input"
              onChange={(event) => {
                handleSelectFiles(event.target.files);
                event.target.value = '';
              }}
            />
            <Button
              type="text"
              className="ai-agent-composer__icon-button"
              icon={<PaperClipOutlined />}
              onClick={() => attachmentInputRef.current?.click()}
              aria-label="上传附件"
              disabled={!selectedAgent}
            />
            <Button
              type="primary"
              shape="circle"
              className="ai-agent-composer__send-button"
              icon={<ArrowUpOutlined />}
              onClick={handleSubmit}
              loading={chatMutation.isPending}
              disabled={submitDisabled}
              aria-label="发送问题"
            />
          </div>
        </div>
      </section>

      {promptTemplatesQuery.isError ? (
        <Alert
          type="warning"
          showIcon
          title="提示词加载失败，已切换为默认AI助手"
          description={extractApiErrorMessage(promptTemplatesQuery.error, '当前将默认不使用提示词，你可以直接提问')}
          className="ai-agent-response ai-agent-response--alert"
        />
      ) : null}

      {!promptTemplatesQuery.isLoading && !promptTemplatesQuery.isError && promptTemplates.length === 0 ? (
        <Alert
          type="info"
          showIcon
          title="当前未配置提示词"
          description="已自动切换为默认AI助手，你可以直接提问；如需固定回答风格，可前往配置管理 > 提示词管理新增提示词。"
          className="ai-agent-response ai-agent-response--alert"
        />
      ) : null}

      {chatMutation.isError ? (
        <Alert
          type="error"
          showIcon
          title="AI助手问答失败"
          description={extractApiErrorMessage(chatMutation.error, '请稍后重试')}
          className="ai-agent-response ai-agent-response--alert"
        />
      ) : null}

      {(promptTemplatesQuery.isLoading || chatMutation.isPending) ? (
        <section className="ai-agent-response" aria-label="AI助手回答区">
          <Skeleton active paragraph={{ rows: 5 }} />
        </section>
      ) : null}

      {result ? (
        <section className="ai-agent-response" aria-label="AI助手回答区">
          <div className="ai-agent-response__meta">
            <Tag color="blue">{result.agent_name}</Tag>
            <Tag>{result.provider}</Tag>
          </div>
          <Paragraph className="ai-agent-response__answer">{result.answer}</Paragraph>
          {result.attachments.length > 0 ? (
            <div className="ai-agent-response__attachments">
              {result.attachments.map((attachment) => (
                <div key={`${attachment.file_name}-${attachment.file_size}`} className="ai-agent-response__attachment-card">
                  <Text strong>{attachment.file_name}</Text>
                  <Text type="secondary">{attachment.file_type} · {formatFileSize(attachment.file_size)}</Text>
                  <Paragraph ellipsis={{ rows: 3, expandable: false }}>
                    {attachment.excerpt || '附件内容已参与分析'}
                  </Paragraph>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

export default AIAgentPage;

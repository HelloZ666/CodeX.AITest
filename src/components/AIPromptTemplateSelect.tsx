import React, { useMemo } from 'react';
import { Select, Skeleton, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { listPromptTemplates } from '../utils/api';

const SYSTEM_DEFAULT_PROMPT_VALUE = '__system_default_prompt__';

interface AIPromptTemplateSelectProps {
  value?: string;
  useAI: boolean;
  onChange: (nextValue: string | undefined) => void;
  label?: string;
  disabled?: boolean;
  placeholder?: string;
}

const AIPromptTemplateSelect: React.FC<AIPromptTemplateSelectProps> = ({
  value,
  useAI,
  onChange,
  label = 'AI 提示词',
  disabled = false,
  placeholder = '请选择提示词',
}) => {
  const promptTemplatesQuery = useQuery({
    queryKey: ['prompt-templates'],
    queryFn: listPromptTemplates,
    enabled: useAI || Boolean(value),
    staleTime: 30_000,
  });

  const options = useMemo(
    () => [
      {
        label: '系统默认（与当前版本一致）',
        value: SYSTEM_DEFAULT_PROMPT_VALUE,
      },
      ...(promptTemplatesQuery.data ?? []).map((template) => ({
        label: template.name,
        value: template.agent_key,
      })),
    ],
    [promptTemplatesQuery.data],
  );

  const selectValue = value?.trim() || SYSTEM_DEFAULT_PROMPT_VALUE;
  const helperText = !useAI
    ? '关闭 AI 时不会使用提示词。'
    : promptTemplatesQuery.isError
      ? '提示词列表加载失败，当前仍可使用系统默认提示词。'
      : (promptTemplatesQuery.data?.length ?? 0) > 0
        ? '提示词来源于配置管理 > 提示词管理；不选择时使用系统默认提示词。'
        : '当前没有可选提示词，将使用系统默认提示词。';

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <Typography.Text strong>{label}</Typography.Text>
        <Typography.Text type="secondary">配置管理 &gt; 提示词管理</Typography.Text>
      </div>

      {useAI && promptTemplatesQuery.isLoading ? (
        <Skeleton.Input active block />
      ) : (
        <Select
          value={selectValue}
          disabled={!useAI || disabled}
          options={options}
          placeholder={placeholder}
          style={{ width: '100%' }}
          onChange={(nextValue) => {
            onChange(nextValue === SYSTEM_DEFAULT_PROMPT_VALUE ? undefined : String(nextValue));
          }}
        />
      )}

      <Typography.Text type="secondary">{helperText}</Typography.Text>
    </div>
  );
};

export default AIPromptTemplateSelect;

import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Empty,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CloudUploadOutlined,
  DownloadOutlined,
  FileWordOutlined,
  LinkOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { GlassStepCard, GlowActionButton } from '../components/Workbench/GlassWorkbench';
import FunctionalTestCasesPage from './FunctionalTestCases';
import type { FunctionalCaseGenerationResult, FunctionalTestCase, PromptTemplate } from '../types';
import { exportFunctionalTestCasesCsv } from '../utils/exportTestCases';
import {
  extractApiErrorMessage,
  generateFunctionalTestCases,
  listPromptTemplates,
} from '../utils/api';

const { Dragger } = Upload;
const { Title, Text } = Typography;

const REQUIREMENT_PROMPT_KEY = 'requirement';
const FILE_SUFFIXES = ['.doc', '.docx'];
const GENERATION_STAGES = [
  '解析需求章节结构',
  '提炼关键业务场景',
  '编排测试步骤与断言',
  '装配导出清单',
];

function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
}

interface UploadSummaryProps {
  file: File;
}

const UploadSummary: React.FC<UploadSummaryProps> = ({ file }) => (
  <div className="case-generation-upload-summary">
    <div className="case-generation-upload-summary__icon">
      <FileWordOutlined />
    </div>
    <div className="case-generation-upload-summary__content">
      <strong>{file.name}</strong>
      <span>{formatFileSize(file.size)}</span>
    </div>
    <Tag color="processing">文档已就绪</Tag>
  </div>
);

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedPromptTemplateKey, setSelectedPromptTemplateKey] = useState<string>();
  const [requirementFile, setRequirementFile] = useState<File | null>(null);
  const [result, setResult] = useState<FunctionalCaseGenerationResult | null>(null);
  const [stageIndex, setStageIndex] = useState(0);

  const promptTemplatesQuery = useQuery({
    queryKey: ['prompt-templates'],
    queryFn: listPromptTemplates,
    staleTime: 30_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => generateFunctionalTestCases(
      selectedPromptTemplateKey,
      requirementFile as File,
      '案例生成',
    ),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setResult(response.data);
        void queryClient.invalidateQueries({ queryKey: ['functional-test-case-records'] });
        message.success(`已生成 ${response.data.total} 条测试用例`);
        return;
      }

      message.error(response.error || '生成测试用例失败');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '生成测试用例失败'));
    },
  });

  const promptTemplates = promptTemplatesQuery.data ?? [];

  useEffect(() => {
    if (selectedPromptTemplateKey || promptTemplates.length === 0) {
      return;
    }

    const preferredTemplate = promptTemplates.find((item) => item.agent_key === REQUIREMENT_PROMPT_KEY)
      ?? promptTemplates[0];
    setSelectedPromptTemplateKey(preferredTemplate?.agent_key);
  }, [promptTemplates, selectedPromptTemplateKey]);

  useEffect(() => {
    if (!promptTemplates.length || !selectedPromptTemplateKey) {
      return;
    }

    const exists = promptTemplates.some((item) => item.agent_key === selectedPromptTemplateKey);
    if (!exists) {
      const preferredTemplate = promptTemplates.find((item) => item.agent_key === REQUIREMENT_PROMPT_KEY)
        ?? promptTemplates[0];
      setSelectedPromptTemplateKey(preferredTemplate?.agent_key);
    }
  }, [promptTemplates, selectedPromptTemplateKey]);

  useEffect(() => {
    if (!generateMutation.isPending) {
      setStageIndex(0);
      return undefined;
    }

    const timer = window.setInterval(() => {
      setStageIndex((current) => (current + 1) % GENERATION_STAGES.length);
    }, 1400);

    return () => {
      window.clearInterval(timer);
    };
  }, [generateMutation.isPending]);

  const selectedPromptTemplate = useMemo(
    () => promptTemplates.find((item) => item.agent_key === selectedPromptTemplateKey) ?? null,
    [promptTemplates, selectedPromptTemplateKey],
  );

  const promptOptions = useMemo(
    () => promptTemplates.map((item: PromptTemplate) => ({
      value: item.agent_key,
      label: `${item.name}（${item.agent_key}）`,
    })),
    [promptTemplates],
  );

  const columns: ColumnsType<FunctionalTestCase> = [
    {
      title: '用例ID',
      dataIndex: 'case_id',
      key: 'case_id',
      width: 140,
      render: (value: string) => <Text code>{value}</Text>,
    },
    {
      title: '用例描述',
      dataIndex: 'description',
      key: 'description',
      width: 240,
      render: (value: string) => <span className="case-generation-table__cell">{value}</span>,
    },
    {
      title: '测试步骤',
      dataIndex: 'steps',
      key: 'steps',
      render: (value: string) => (
        <span className="case-generation-table__cell case-generation-table__cell--multiline">{value}</span>
      ),
    },
    {
      title: '预期结果',
      dataIndex: 'expected_result',
      key: 'expected_result',
      render: (value: string) => (
        <span className="case-generation-table__cell case-generation-table__cell--multiline">{value}</span>
      ),
    },
  ];

  const isReadyToGenerate = Boolean(
    selectedPromptTemplateKey
    && requirementFile
    && promptTemplates.length > 0
    && !promptTemplatesQuery.isError,
  );

  const handleBeforeUpload = (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!FILE_SUFFIXES.some((suffix) => lowerName.endsWith(suffix))) {
      message.error('当前仅支持 .doc / .docx 需求文档');
      return Upload.LIST_IGNORE;
    }

    setRequirementFile(file);
    setResult(null);
    return false;
  };

  const handleExport = () => {
    if (!result?.cases?.length) {
      return;
    }

    const baseName = (result.file_name || '需求文档')
      .replace(/\.[^.]+$/, '')
      .trim();
    exportFunctionalTestCasesCsv(result.cases, `${baseName}-测试用例`);
    message.success('测试用例导出已开始');
  };

  return (
    <div className="glass-workbench-page case-generation-page">
      <section className="glass-workbench-hero case-generation-hero">
        <div className="glass-workbench-hero__content">
          <Space wrap size={[10, 10]}>
            <Tag color="processing">功能测试</Tag>
            <Tag color="blue">案例生成</Tag>
            <Tag color="purple">需求文档驱动</Tag>
          </Space>
          <h1 className="glass-workbench-hero__title">案例生成工作台</h1>
        </div>
      </section>

      <section className="glass-workbench-flow case-generation-flow" aria-label="案例生成流程">
        <GlassStepCard
          step={1}
          title="选择提示词"
          help="提示词来源于配置管理，页面会优先预选 requirement。"
          state={selectedPromptTemplate ? 'complete' : 'active'}
          statusNode={selectedPromptTemplate ? <Tag color="blue">已选：{selectedPromptTemplate.agent_key}</Tag> : null}
        >
          <div className="case-generation-step">
            <div className="case-generation-step__head">
              <MessageOutlined />
              <span>配置管理 &gt; 提示词管理</span>
            </div>

            {promptTemplatesQuery.isLoading ? (
              <Skeleton.Input active block className="glass-skeleton-input" />
            ) : (
              <Select
                size="large"
                value={selectedPromptTemplateKey}
                placeholder="请选择提示词"
                options={promptOptions}
                style={{ width: '100%' }}
                onChange={(nextValue) => {
                  setSelectedPromptTemplateKey(String(nextValue));
                  setResult(null);
                }}
              />
            )}

            {promptTemplatesQuery.isError ? (
              <Alert
                type="error"
                showIcon
                title="提示词加载失败"
                description={(
                  <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/config-management/prompt-templates')}>
                    前往配置管理检查提示词
                  </Button>
                )}
              />
            ) : null}

            {!promptTemplatesQuery.isError ? (
              <div className="case-generation-step__footnote">
                页面会优先预选 `需求分析师（requirement）`，你也可以切换成配置管理里的其他提示词。
              </div>
            ) : null}
          </div>
        </GlassStepCard>

        <div className="glass-workbench-connector" data-active={selectedPromptTemplate ? 'true' : 'false'} aria-hidden="true" />

        <GlassStepCard
          step={2}
          title="上传需求文档"
          help="上传后会自动替换上一次选择。"
          state={requirementFile ? 'complete' : selectedPromptTemplate ? 'active' : 'disabled'}
          statusNode={requirementFile ? <Tag color="blue">文档已上传</Tag> : null}
        >
          <div className="case-generation-step">
            <Dragger
              className="glass-upload-dropzone case-generation-dropzone"
              accept=".doc,.docx"
              maxCount={1}
              multiple={false}
              showUploadList={false}
              beforeUpload={handleBeforeUpload}
            >
              <div className="glass-upload-dropzone__content">
                <CloudUploadOutlined className="glass-upload-dropzone__icon" />
                <strong>点击或拖拽上传需求文档</strong>
                <span>仅支持 .doc / .docx</span>
              </div>
            </Dragger>

            {requirementFile ? <UploadSummary file={requirementFile} /> : null}
          </div>
        </GlassStepCard>

        <div className="glass-workbench-connector" data-active={isReadyToGenerate ? 'true' : 'false'} aria-hidden="true" />

        <GlassStepCard
          step={3}
          title="生成测试用例"
          help="点击后会启动测试用例生成引擎，生成结果会在下方表格中展示。"
          state={generateMutation.isPending ? 'loading' : isReadyToGenerate ? 'active' : 'disabled'}
          statusNode={<Tag color="processing">输出字段固定</Tag>}
        >
          <div className="case-generation-step">
            <div className="case-generation-scope">
              <span>输出字段</span>
              <strong>用例ID / 用例描述 / 测试步骤 / 预期结果</strong>
            </div>

            <GlowActionButton
              type="primary"
              size="large"
              block
              disabled={!isReadyToGenerate}
              loading={generateMutation.isPending}
              onClick={() => generateMutation.mutate()}
            >
              生成测试用例
            </GlowActionButton>

            <p className="glass-step-note">
              {!selectedPromptTemplateKey
                ? '请先选择提示词。'
                : !requirementFile
                  ? '请上传需求文档后再开始生成。'
                  : '系统将基于所选提示词和需求文档生成结构化测试用例。'}
            </p>
          </div>
        </GlassStepCard>
      </section>

      {generateMutation.isPending ? (
        <section className="case-generation-transition" aria-live="polite" role="status">
          <span className="case-generation-transition__sr-only">
            当前阶段：{GENERATION_STAGES[stageIndex]}
          </span>
          <div className="case-generation-transition__glow" aria-hidden="true" />
          <div className="case-generation-transition__mesh" aria-hidden="true" />

          <div className="case-generation-transition__core">
            <span
              className="case-generation-transition__halo case-generation-transition__halo--outer"
              aria-hidden="true"
            />
            <span
              className="case-generation-transition__halo case-generation-transition__halo--middle"
              aria-hidden="true"
            />
            <span
              className="case-generation-transition__halo case-generation-transition__halo--inner"
              aria-hidden="true"
            />
            <span className="case-generation-transition__scanner" aria-hidden="true" />
            <span className="case-generation-transition__energy" aria-hidden="true" />
            <span
              className="case-generation-transition__spark case-generation-transition__spark--one"
              aria-hidden="true"
            />
            <span
              className="case-generation-transition__spark case-generation-transition__spark--two"
              aria-hidden="true"
            />
            <span
              className="case-generation-transition__spark case-generation-transition__spark--three"
              aria-hidden="true"
            />

            <div className="case-generation-transition__nodes" aria-hidden="true">
              {GENERATION_STAGES.map((item, index) => (
                <span
                  key={item}
                  className={`case-generation-transition__node${index === stageIndex ? ' is-active' : ''}`}
                  style={{ '--node-angle': `${45 + index * 90}deg` } as React.CSSProperties}
                />
              ))}
            </div>

            <div className="case-generation-transition__copy">
              <Title level={3} style={{ margin: 0 }}>测试用例生成中</Title>
            </div>
          </div>
        </section>
      ) : null}

      <section className="glass-report-detail case-generation-result">
        <div className="case-generation-result__header">
          <div>
            <Title level={4} style={{ margin: 0 }}>测试用例表格</Title>
            <div className="case-generation-result__meta">
              {result ? (
                <>
                  <Tag color="blue">总数：{result.total}</Tag>
                  <Tag color={result.generation_mode === 'ai' ? 'processing' : 'default'}>
                    生成方式：{result.generation_mode === 'ai' ? 'AI' : '规则回退'}
                  </Tag>
                  {result.provider ? <Tag>{result.provider}</Tag> : null}
                </>
              ) : (
                <Text type="secondary">生成完成后会在这里展示测试用例表格。</Text>
              )}
            </div>
          </div>

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            disabled={!result?.cases?.length}
            onClick={handleExport}
          >
            导出用例
          </Button>
        </div>

        {result?.summary ? (
          <Alert
            type={result.generation_mode === 'ai' ? 'info' : 'warning'}
            showIcon
            title="生成摘要"
            description={result.summary}
            style={{ marginBottom: 18 }}
          />
        ) : null}

        {result?.error ? (
          <Alert
            type="warning"
            showIcon
            title="AI 生成异常，已自动回退"
            description={result.error}
            style={{ marginBottom: 18 }}
          />
        ) : null}

        {result?.cases?.length ? (
          <Table
            rowKey="case_id"
            columns={columns}
            dataSource={result.cases}
            pagination={{ pageSize: 6, showSizeChanger: false }}
            scroll={{ x: 980 }}
          />
        ) : (
          <div className="case-generation-result__empty">
            <Empty description="上传需求文档并点击生成后，这里会展示测试用例表格。" />
          </div>
        )}
      </section>

      <section className="case-generation-records">
        <FunctionalTestCasesPage embedded />
      </section>
    </div>
  );
};

export default UploadPage;

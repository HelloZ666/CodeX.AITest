import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Select,
  Skeleton,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CheckOutlined,
  CloudUploadOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  LinkOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AIPromptTemplateSelect from '../components/AIPromptTemplateSelect';
import RequirementAnalysisResultView from '../components/RequirementAnalysis/RequirementAnalysisResult';
import {
  GlassHintButton,
  GlassStatusCheck,
  GlassStepCard,
  GlowActionButton,
} from '../components/Workbench/GlassWorkbench';
import {
  analyzeRequirement,
  extractApiErrorMessage,
  getRequirementMapping,
  listProjects,
} from '../utils/api';
import type {
  Project,
  RequirementAnalysisResult,
} from '../types';

const { Dragger } = Upload;
const { Title } = Typography;
const { Option } = Select;

function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) {
    return `${fileSize} B`;
  }

  if (fileSize < 1024 * 1024) {
    return `${(fileSize / 1024).toFixed(1)} KB`;
  }

  return `${(fileSize / (1024 * 1024)).toFixed(2)} MB`;
}

function compactAssessment(value?: string | null): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '已完成规则解析，可查看命中证据、风险矩阵与测试范围建议。';
  }

  const segments = text
    .split(/[。；;，,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const compacted = segments[0] || text;
  return compacted.length > 24 ? `${compacted.slice(0, 24)}...` : compacted;
}

function getMappingSourceLabel(sourceType?: 'upload' | 'manual' | 'mixed' | null): string {
  if (sourceType === 'manual') {
    return '手工维护';
  }

  if (sourceType === 'mixed') {
    return '导入后已调整';
  }

  if (sourceType === 'upload') {
    return '文件导入';
  }

  return '未配置';
}

interface UploadSummaryProps {
  label: string;
  file: File;
}

const UploadSummary: React.FC<UploadSummaryProps> = ({ label, file }) => (
  <div key={`${file.name}-${file.size}-${file.lastModified}`} className="glass-upload-file glass-upload-file--spring">
    <div className="glass-upload-file__main">
      <div className="glass-upload-file__meta">
        <span className="glass-upload-file__label">{label}</span>
        <strong>{file.name}</strong>
        <span>{formatFileSize(file.size)}</span>
      </div>
      <span className="glass-upload-file__done">
        <span className="glass-upload-file__done-icon">
          <CheckOutlined />
        </span>
        上传完成
      </span>
    </div>
    <div className="glass-upload-file__progress">
      <span className="glass-upload-file__progress-bar" />
    </div>
  </div>
);

const RequirementAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [useAI, setUseAI] = useState(true);
  const [selectedPromptTemplateKey, setSelectedPromptTemplateKey] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [requirementFile, setRequirementFile] = useState<File | null>(null);
  const [result, setResult] = useState<RequirementAnalysisResult | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  const requirementMappingQuery = useQuery({
    queryKey: ['requirement-mapping', selectedProjectId],
    queryFn: () => getRequirementMapping(selectedProjectId as number),
    enabled: selectedProjectId !== null,
    staleTime: 30_000,
  });

  const selectedProject = useMemo(
    () => (projectsQuery.data ?? []).find((item) => item.id === selectedProjectId) ?? null,
    [projectsQuery.data, selectedProjectId],
  );

  const currentRequirementMapping = requirementMappingQuery.data ?? null;
  const hasRequirementMapping = Boolean(selectedProjectId && currentRequirementMapping);

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeRequirement(
      selectedProjectId as number,
      requirementFile as File,
      useAI,
      selectedPromptTemplateKey,
    ),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setResult(response.data);
        message.success(`需求分析完成，耗时 ${response.data.overview.duration_ms}ms`);
        return;
      }

      message.error(response.error || '需求分析失败');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '需求分析失败'));
    },
  });

  const isReadyToAnalyze = Boolean(selectedProjectId && requirementFile);

  const handleProjectChange = (projectId: number | null) => {
    setSelectedProjectId(projectId);
    setRequirementFile(null);
    setResult(null);
  };

  const handleBeforeUpload = (file: File) => {
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.doc') && !lowerName.endsWith('.docx')) {
      message.error('当前仅支持上传 .doc / .docx 需求文档');
      return Upload.LIST_IGNORE;
    }

    setRequirementFile(file);
    setResult(null);
    return false;
  };

  const handleViewDetail = () => {
    resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const reportMetrics = result
    ? [
      { label: '命中需求点', value: String(result.overview.matched_requirements) },
      { label: '映射命中', value: String(result.overview.mapping_hit_count) },
      { label: '未命中', value: String(result.overview.unmatched_requirements) },
      { label: '耗时', value: `${result.overview.duration_ms} ms` },
    ]
    : [];

  return (
    <div className="glass-workbench-page">
      <section className="glass-workbench-hero">
        <div className="glass-workbench-hero__content">
          <h1 className="glass-workbench-hero__title">需求分析工作台</h1>
        </div>

        <div className="glass-workbench-sidecard">
          <div className="glass-workbench-sidecard__toggle">
            <div className="glass-workbench-sidecard__toggle-copy">
              <RobotOutlined />
              <span>AI 补充分析</span>
            </div>
            <Switch checked={useAI} onChange={setUseAI} checkedChildren="开" unCheckedChildren="关" />
          </div>
        </div>
      </section>

      <section className="glass-workbench-flow" aria-label="需求分析步骤流">
        <GlassStepCard
          step={1}
          title="项目选择"
          help="需求分析会自动读取所选项目当前生效的需求映射关系。"
          state={selectedProjectId ? 'complete' : 'active'}
          className="glass-step-card--project"
          statusNode={selectedProjectId ? <GlassStatusCheck label="已选择" /> : <span className="glass-step-pill">必选</span>}
        >
          <div className="glass-step-stack">
            {projectsQuery.isLoading ? (
              <Skeleton.Input active block className="glass-skeleton-input" />
            ) : (
              <Select
                size="large"
                value={selectedProjectId ?? undefined}
                placeholder="请选择项目"
                className="glass-workbench-select glass-workbench-select--project"
                classNames={{ popup: { root: 'glass-workbench-select-dropdown glass-workbench-select-dropdown--project' } }}
                labelRender={({ label }) => (
                  <span className="glass-project-selected-label">{label}</span>
                )}
                optionLabelProp="data-label"
                showSearch
                allowClear
                optionFilterProp="data-label"
                onChange={(value) => handleProjectChange(value)}
                onClear={() => handleProjectChange(null)}
              >
                {(projectsQuery.data ?? []).map((project: Project) => (
                  <Option key={project.id} value={project.id} data-label={project.name}>
                    <div className="glass-select-option">
                      <span className={`glass-select-option__check${selectedProjectId === project.id ? ' is-active' : ''}`}>
                        <CheckOutlined />
                      </span>
                      <span className="glass-select-option__label">{project.name}</span>
                    </div>
                  </Option>
                ))}
              </Select>
            )}

            <div className="glass-inline-note">
              <span className="glass-inline-note__label">当前映射状态</span>
              <div className="glass-inline-note__value">
                {selectedProjectId ? (
                  requirementMappingQuery.isLoading ? (
                    <Skeleton.Button active size="small" shape="round" />
                  ) : hasRequirementMapping ? (
                    <>
                      <Tag color="blue">{getMappingSourceLabel(currentRequirementMapping?.source_type)}</Tag>
                      <span>{currentRequirementMapping?.group_count ?? 0} 组规则已就绪</span>
                    </>
                  ) : (
                    <>
                      <Tag>未配置</Tag>
                      <span>可直接分析，但不会自动扩展测试范围</span>
                    </>
                  )
                ) : (
                  <span>选择项目后显示</span>
                )}
              </div>
            </div>

            {selectedProjectId && !requirementMappingQuery.isLoading && !hasRequirementMapping ? (
              <Alert
                type="info"
                showIcon
                message="当前项目尚未配置需求映射关系"
                description={(
                  <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/requirement-mappings')}>
                    前往配置管理维护需求映射关系
                  </Button>
                )}
              />
            ) : null}
          </div>
        </GlassStepCard>

        <div className="glass-workbench-connector" data-active={selectedProjectId ? 'true' : 'false'} aria-hidden="true" />

        <GlassStepCard
          step={2}
          title="文件上传"
          help="支持 .doc / .docx。系统会优先解析 4.1 / 4.4 章节，命中正文内容。"
          state={requirementFile ? 'complete' : selectedProjectId ? 'active' : 'disabled'}
          statusNode={requirementFile ? <GlassStatusCheck label="已上传" /> : <span className="glass-step-pill">DOC / DOCX</span>}
        >
          <div className="glass-step-stack">
            <div className="glass-upload-inline-head">
              <strong>需求文档</strong>
              <GlassHintButton
                label="上传说明"
                content="支持标准 Word 需求文档，建议优先使用 .docx"
                ariaLabel="需求文档上传说明"
              />
            </div>
            <Dragger
              className="glass-upload-dropzone"
              accept=".doc,.docx"
              maxCount={1}
              multiple={false}
              showUploadList={false}
              disabled={!selectedProjectId}
              beforeUpload={handleBeforeUpload}
            >
              <div className="glass-upload-dropzone__content">
                <CloudUploadOutlined className="glass-upload-dropzone__icon" />
                <strong>点击或拖拽上传</strong>
                <span>DOC / DOCX</span>
              </div>
            </Dragger>
            {requirementFile ? <UploadSummary label="需求文档" file={requirementFile} /> : null}
          </div>
        </GlassStepCard>

        <div className="glass-workbench-connector" data-active={isReadyToAnalyze ? 'true' : 'false'} aria-hidden="true" />

        <GlassStepCard
          step={3}
          title="智能解析"
          help="未上传文件前按钮保持禁用，启用 AI 时会补充总结、风险矩阵与测试建议。"
          state={analyzeMutation.isPending ? 'loading' : isReadyToAnalyze ? 'active' : 'disabled'}
          statusNode={<span className="glass-step-pill">{useAI ? 'AI 已开启' : 'AI 已关闭'}</span>}
        >
          <div className="glass-step-stack">
            <AIPromptTemplateSelect
              value={selectedPromptTemplateKey}
              useAI={useAI}
              onChange={setSelectedPromptTemplateKey}
              label="需求分析提示词"
            />

            <GlowActionButton
              type="primary"
              size="large"
              block
              disabled={!isReadyToAnalyze}
              loading={analyzeMutation.isPending}
              onClick={() => analyzeMutation.mutate()}
            >
              开始智能解析
            </GlowActionButton>

            <p className="glass-step-note">
              {!selectedProjectId
                ? '请先选择项目。'
                : !requirementFile
                  ? '上传需求文档后即可开始解析。'
                  : '系统将自动结合需求映射关系生成风险与测试范围建议。'}
            </p>

            <div className="glass-step-actions">
              <Button type="link" icon={<HistoryOutlined />} onClick={() => navigate('/requirement-analysis/history')}>
                查看分析记录
              </Button>
            </div>
          </div>
        </GlassStepCard>

        <div
          className="glass-workbench-connector"
          data-active={analyzeMutation.isPending || result ? 'true' : 'false'}
          aria-hidden="true"
        />

        <GlassStepCard
          step={4}
          title="生成报告"
          help="报告生成前显示灰色占位态；生成后可通过“查看详情”平滑跳转到详细结果。"
          state={result ? 'complete' : analyzeMutation.isPending ? 'loading' : 'disabled'}
          statusNode={result ? <GlassStatusCheck label="已生成" /> : <span className="glass-step-pill glass-step-pill--muted">等待结果</span>}
          className={result ? 'glass-step-card--spotlight' : ''}
        >
          {analyzeMutation.isPending ? (
            <div className="glass-report-state glass-report-state--loading">
              <Skeleton active paragraph={{ rows: 4 }} title={{ width: '58%' }} />
            </div>
          ) : result ? (
            <div className="glass-report-preview glass-report-preview--enter">
              <div className="glass-report-preview__headline">
                <div>
                  <strong>需求分析报告</strong>
                  <span>记录 ID：{result.record_id ?? '未生成'}</span>
                </div>
                <Button type="link" onClick={handleViewDetail}>
                  查看详情
                </Button>
              </div>

              <div className="glass-report-preview__metrics">
                {reportMetrics.map((item) => (
                  <div key={item.label} className="glass-report-preview__metric">
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              <p className="glass-report-preview__summary">
                {compactAssessment(result.ai_analysis?.overall_assessment)}
              </p>
            </div>
          ) : (
            <div className="glass-report-state glass-report-state--placeholder">
              <FileSearchOutlined />
              <span>报告生成后显示在这里</span>
            </div>
          )}
        </GlassStepCard>
      </section>

      {result ? (
        <section ref={resultRef} className="glass-report-detail">
          <div className="glass-report-detail__header">
            <Title level={4} style={{ margin: 0 }}>需求分析报告详情</Title>
            <div className="glass-report-detail__tags">
              <Tag color="blue">项目：{result.source_files?.project_name ?? selectedProject?.name ?? '未选择'}</Tag>
              <Tag color="processing">需求文档：{result.source_files?.requirement_file_name ?? requirementFile?.name}</Tag>
            </div>
          </div>

          <RequirementAnalysisResultView result={result} />
        </section>
      ) : null}
    </div>
  );
};

export default RequirementAnalysisPage;

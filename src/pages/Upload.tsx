import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Col,
  Row,
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
  CodeOutlined,
  FileTextOutlined,
  HistoryOutlined,
  LinkOutlined,
  RobotOutlined,
  TableOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import AIPromptTemplateSelect from '../components/AIPromptTemplateSelect';
import AISuggestions from '../components/AISuggestions/AISuggestions';
import AnalysisResult from '../components/AnalysisResult/AnalysisResult';
import CodeMappingEntryModal from '../components/CodeMapping/CodeMappingEntryModal';
import ScoreCard from '../components/ScoreCard/ScoreCard';
import {
  GlassStatusCheck,
  GlassStepCard,
  GlowActionButton,
} from '../components/Workbench/GlassWorkbench';
import {
  analyzeWithProject,
  createProjectMappingEntry,
  extractApiErrorMessage,
  listProjects,
} from '../utils/api';
import type { AnalyzeData, CodeMappingEntry, CoverageDetail, Project } from '../types';
import { normalizeCodeMappingEntries, parseMethodIdentifier } from '../utils/codeMapping';

const { Dragger } = Upload;
const { Title } = Typography;
const { Option } = Select;

const CASE_UPLOAD_SLOTS = [
  {
    key: 'codeChanges' as const,
    title: '代码改动 JSON',
    accept: '.json',
    hint: '包含 current / history 字段；每个元素支持完整字符串或逐行数组',
    icon: <CodeOutlined />,
  },
  {
    key: 'testCases' as const,
    title: '测试用例 CSV / Excel',
    accept: '.csv,.xlsx,.xls',
    hint: '支持真实 Excel 模板（首行说明、第二行表头）和旧简化模板',
    icon: <TableOutlined />,
  },
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

const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reportRef = useRef<HTMLDivElement | null>(null);
  const [useAI, setUseAI] = useState(true);
  const [selectedPromptTemplateKey, setSelectedPromptTemplateKey] = useState<string | undefined>();
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [analysisRecordId, setAnalysisRecordId] = useState<number | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [mappingInitialValues, setMappingInitialValues] = useState<Partial<CodeMappingEntry> | null>(null);
  const [files, setFiles] = useState<{ codeChanges: File | null; testCases: File | null }>({
    codeChanges: null,
    testCases: null,
  });
  const [result, setResult] = useState<AnalyzeData | null>(null);

  const { data: projects = [], isLoading: projectsLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const selectedProject = useMemo(
    () => (projects as Project[]).find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const codeMappings = normalizeCodeMappingEntries(selectedProject?.mapping_data);
  const hasMapping = codeMappings.length > 0;
  const allFilesReady = Boolean(files.codeChanges && files.testCases);
  const isReadyToAnalyze = Boolean(selectedProjectId && hasMapping && allFilesReady);

  const mutation = useMutation({
    mutationFn: (nextFiles: { codeChanges: File; testCases: File }) => (
      analyzeWithProject(
        selectedProjectId as number,
        nextFiles.codeChanges,
        nextFiles.testCases,
        undefined,
        useAI,
        selectedPromptTemplateKey,
      )
    ),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setResult(response.data);
        setAnalysisRecordId(response.data.record_id ?? null);
        message.success(`分析完成，耗时 ${response.data.duration_ms}ms`);
        return;
      }

      message.error(response.error || '分析失败');
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      const msg = error.response?.data?.detail || error.message || '请求失败';
      message.error(msg);
    },
  });

  const syncProjectCaches = (updatedProject: Project) => {
    queryClient.setQueryData<Project[] | undefined>(
      ['projects'],
      (current) => current?.map((project) => (
        project.id === updatedProject.id ? { ...project, ...updatedProject } : project
      )) ?? current,
    );
    queryClient.setQueryData(['project', updatedProject.id], (current: Project | null | undefined) => (
      current ? { ...current, ...updatedProject } : updatedProject
    ));
  };

  const mappingMutation = useMutation({
    mutationFn: ({ projectId, entry }: { projectId: number; entry: CodeMappingEntry }) => (
      createProjectMappingEntry(projectId, entry)
    ),
    onSuccess: (updatedProject) => {
      syncProjectCaches(updatedProject);
      setMappingModalOpen(false);
      setMappingInitialValues(null);
      message.success('代码映射已保存');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '保存代码映射失败'));
    },
  });

  const handleProjectChange = (projectId: number | null) => {
    setSelectedProjectId(projectId);
    setResult(null);
    setAnalysisRecordId(null);
  };

  const handleFileChange = (key: 'codeChanges' | 'testCases', file: File | null) => {
    setFiles((previous) => ({ ...previous, [key]: file }));
    setResult(null);
    setAnalysisRecordId(null);
  };

  const handleStartAnalysis = () => {
    if (!isReadyToAnalyze) {
      return;
    }

    mutation.mutate({
      codeChanges: files.codeChanges as File,
      testCases: files.testCases as File,
    });
  };

  const handleViewDetail = () => {
    reportRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleOpenAddMapping = (detail: CoverageDetail) => {
    const parsed = parseMethodIdentifier(detail.method);
    if (!parsed) {
      message.warning('当前方法名无法自动拆分为包名、类名、方法名');
      return;
    }

    setMappingInitialValues({
      package_name: parsed.package_name,
      class_name: parsed.class_name,
      method_name: parsed.method_name,
      description: detail.description === '无映射描述' ? '' : detail.description,
    });
    setMappingModalOpen(true);
  };

  const handleCreateMapping = async (entry: CodeMappingEntry) => {
    if (!selectedProjectId) {
      message.warning('请先选择项目');
      return;
    }

    await mappingMutation.mutateAsync({ projectId: selectedProjectId, entry });
  };

  const reportMetrics = result
    ? [
      { label: '综合评分', value: `${result.score.total_score.toFixed(1)} 分` },
      { label: '覆盖率', value: `${Math.round(result.coverage.coverage_rate * 100)}%` },
      { label: '变更文件', value: String(result.diff_analysis.total_files) },
      { label: '耗时', value: `${result.duration_ms} ms` },
    ]
    : [];

  return (
    <div className="glass-workbench-page">
      <section className="glass-workbench-hero">
        <div className="glass-workbench-hero__content">
          <h1 className="glass-workbench-hero__title">案例分析工作台</h1>
        </div>

        <div className="glass-workbench-sidecard">
          <div className="glass-workbench-sidecard__toggle">
            <div className="glass-workbench-sidecard__toggle-copy">
              <RobotOutlined />
              <span>AI 深度分析</span>
            </div>
            <Switch checked={useAI} onChange={setUseAI} checkedChildren="开" unCheckedChildren="关" />
          </div>
        </div>
      </section>

      <section className="glass-workbench-flow" aria-label="案例分析步骤流">
        <GlassStepCard
          step={1}
          title="项目选择"
          help="案例分析依赖项目已绑定的代码映射关系；未绑定时第三步保持禁用。"
          state={selectedProjectId ? 'complete' : 'active'}
          className="glass-step-card--project"
          statusNode={selectedProjectId ? <GlassStatusCheck label="已选择" /> : <span className="glass-step-pill">必选</span>}
        >
          <div className="glass-step-stack">
            {projectsLoading ? (
              <Skeleton.Input active block className="glass-skeleton-input" />
            ) : (
              <Select
                size="large"
                value={selectedProjectId ?? undefined}
                placeholder="请选择要质检的项目"
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
                {(projects as Project[]).map((project) => (
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
              <span className="glass-inline-note__label">映射检查</span>
              <div className="glass-inline-note__value">
                {selectedProjectId ? (
                  hasMapping ? (
                    <>
                      <Tag color="blue">已绑定映射关系</Tag>
                      <span>上传文件后可直接开始分析</span>
                    </>
                  ) : (
                    <>
                      <Tag>未绑定映射关系</Tag>
                      <span>请先前往配置管理维护项目映射</span>
                    </>
                  )
                ) : (
                  <span>选择项目后显示</span>
                )}
              </div>
            </div>

            {selectedProjectId && !hasMapping ? (
              <Alert
                type="warning"
                showIcon
                title="项目未绑定映射文件"
                description={(
                  <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/projects')}>
                    前往代码映射关系页面补充上传
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
          help="代码改动文件仅支持 .json，且 current / history 中每个元素支持完整字符串或逐行数组；测试用例支持 .csv / .xlsx / .xls。"
          state={allFilesReady ? 'complete' : selectedProjectId ? 'active' : 'disabled'}
          statusNode={allFilesReady ? <GlassStatusCheck label="双文件已就绪" /> : <span className="glass-step-pill">2 个文件</span>}
        >
          <div className="glass-step-stack">
            <div className="glass-upload-grid glass-upload-grid--case-vertical">
              {CASE_UPLOAD_SLOTS.map((slot) => (
                <div key={slot.key} className="glass-upload-panel">
                  <div className="glass-upload-panel__head">
                    <div className="glass-upload-panel__icon">{slot.icon}</div>
                    <div className="glass-upload-panel__copy">
                      <strong>{slot.title}</strong>
                      <span>{slot.hint}</span>
                    </div>
                  </div>

                  <Dragger
                    className="glass-upload-dropzone glass-upload-dropzone--compact"
                    accept={slot.accept}
                    maxCount={1}
                    multiple={false}
                    showUploadList={false}
                    disabled={!selectedProjectId}
                    beforeUpload={(file) => {
                      handleFileChange(slot.key, file);
                      return false;
                    }}
                  >
                    <div className="glass-upload-dropzone__content">
                      <CloudUploadOutlined className="glass-upload-dropzone__icon" />
                      <strong>点击或拖拽上传</strong>
                      <span>{slot.accept.replaceAll(',', ' / ')}</span>
                    </div>
                  </Dragger>

                  {files[slot.key] ? <UploadSummary label={slot.title} file={files[slot.key] as File} /> : null}
                </div>
              ))}
            </div>
          </div>
        </GlassStepCard>

        <div className="glass-workbench-connector" data-active={allFilesReady ? 'true' : 'false'} aria-hidden="true" />

        <GlassStepCard
          step={3}
          title="智能解析"
          help="案例分析必须满足三项条件：已选项目、项目已绑定映射关系、两个上传文件均已就绪。"
          state={mutation.isPending ? 'loading' : isReadyToAnalyze ? 'active' : 'disabled'}
          statusNode={(
            <span className="glass-step-pill">
              {hasMapping ? '映射已接入' : '需先绑定映射'}
            </span>
          )}
        >
          <div className="glass-step-stack">
            <AIPromptTemplateSelect
              value={selectedPromptTemplateKey}
              useAI={useAI}
              onChange={setSelectedPromptTemplateKey}
              label="案例分析提示词"
            />

            <GlowActionButton
              type="primary"
              size="large"
              block
              disabled={!isReadyToAnalyze}
              loading={mutation.isPending}
              onClick={handleStartAnalysis}
            >
              开始智能解析
            </GlowActionButton>

            <p className="glass-step-note">
              {!selectedProjectId
                ? '请先选择项目。'
                : !hasMapping
                  ? '当前项目未绑定映射关系，暂不可执行案例分析。'
                  : !allFilesReady
                    ? '请完成代码改动与测试用例文件上传。'
                    : '将结合项目映射关系输出覆盖、评分与 AI 建议。'}
            </p>

            <div className="glass-step-actions">
              <Button type="link" icon={<HistoryOutlined />} onClick={() => navigate('/history')}>
                查看分析记录
              </Button>
            </div>
          </div>
        </GlassStepCard>

        <div
          className="glass-workbench-connector"
          data-active={mutation.isPending || result ? 'true' : 'false'}
          aria-hidden="true"
        />

        <GlassStepCard
          step={4}
          title="生成报告"
          help="报告卡片会在分析完成后淡入上浮，保留详情入口以便快速跳转到完整结果。"
          state={result ? 'complete' : mutation.isPending ? 'loading' : 'disabled'}
          statusNode={result ? <GlassStatusCheck label="已生成" /> : <span className="glass-step-pill glass-step-pill--muted">等待结果</span>}
          className={result ? 'glass-step-card--spotlight' : ''}
        >
          {mutation.isPending ? (
            <div className="glass-report-state glass-report-state--loading">
              <Skeleton active paragraph={{ rows: 4 }} title={{ width: '58%' }} />
            </div>
          ) : result ? (
            <div className="glass-report-preview glass-report-preview--enter">
              <div className="glass-report-preview__headline">
                <div>
                  <strong>案例分析报告</strong>
                  <span>记录 ID：{analysisRecordId ?? '未生成'}</span>
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
                {result.score.summary || result.ai_analysis?.coverage_gaps || '报告已生成，可继续查看覆盖、评分与 AI 建议详情。'}
              </p>
            </div>
          ) : (
            <div className="glass-report-state glass-report-state--placeholder">
              <FileTextOutlined />
              <span>报告生成后显示在这里</span>
            </div>
          )}
        </GlassStepCard>
      </section>

      {result ? (
        <section ref={reportRef} className="glass-report-detail">
          <div className="glass-report-detail__header">
            <Title level={4} style={{ margin: 0 }}>案例分析报告详情</Title>
            <div className="glass-report-detail__tags">
              <Tag color="blue">项目：{selectedProject?.name ?? '未选择'}</Tag>
              <Tag color="processing">AI：{useAI ? '已开启' : '已关闭'}</Tag>
            </div>
          </div>

          <Row gutter={[24, 24]}>
            <Col xs={24} lg={16}>
              <AnalysisResult
                diffAnalysis={result.diff_analysis}
                coverage={result.coverage}
                existingMappings={codeMappings}
                onAddMapping={handleOpenAddMapping}
              />
            </Col>
            <Col xs={24} lg={8}>
              <ScoreCard score={result.score} />
            </Col>
            <Col span={24}>
              <AISuggestions analysis={result.ai_analysis} usage={result.ai_cost} />
            </Col>
          </Row>
        </section>
      ) : null}

      <CodeMappingEntryModal
        open={mappingModalOpen}
        loading={mappingMutation.isPending}
        title={`新增代码映射${selectedProject ? ` · ${selectedProject.name}` : ''}`}
        initialValues={mappingInitialValues}
        onCancel={() => {
          setMappingModalOpen(false);
          setMappingInitialValues(null);
        }}
        onSubmit={handleCreateMapping}
      />
    </div>
  );
};

export default UploadPage;

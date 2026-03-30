import React, { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Row,
  Spin,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  PlayCircleOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  analyzeWithProject,
  createProjectMappingEntry,
  extractApiErrorMessage,
  getProject,
  listRecords,
  uploadProjectMapping,
} from '../utils/api';
import type { AnalyzeData, CodeMappingEntry, CoverageDetail, Project } from '../types';
import AIPromptTemplateSelect from '../components/AIPromptTemplateSelect';
import FileUploadComponent from '../components/FileUpload/FileUpload';
import AnalysisResult from '../components/AnalysisResult/AnalysisResult';
import CodeMappingEntryModal from '../components/CodeMapping/CodeMappingEntryModal';
import ScoreCard from '../components/ScoreCard/ScoreCard';
import AISuggestions from '../components/AISuggestions/AISuggestions';
import ScoreTrendChart from '../components/Charts/ScoreTrendChart';
import CoverageChart from '../components/Charts/CoverageChart';
import DashboardHero from '../components/Layout/DashboardHero';
import { normalizeCodeMappingEntries, parseMethodIdentifier } from '../utils/codeMapping';

const { Title } = Typography;

const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [useAI, setUseAI] = useState(true);
  const [selectedPromptTemplateKey, setSelectedPromptTemplateKey] = useState<string | undefined>();
  const [analysisResult, setAnalysisResult] = useState<AnalyzeData | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [mappingInitialValues, setMappingInitialValues] = useState<Partial<CodeMappingEntry> | null>(null);

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => getProject(projectId),
    enabled: !Number.isNaN(projectId),
  });

  const { data: records = [] } = useQuery({
    queryKey: ['records', projectId],
    queryFn: () => listRecords({ project_id: projectId, limit: 20 }),
    enabled: !Number.isNaN(projectId),
  });

  const codeMappings = normalizeCodeMappingEntries(project?.mapping_data);

  const syncProjectCaches = (updatedProject: Project) => {
    queryClient.setQueryData(['project', projectId], (current: Project | null | undefined) => (
      current ? { ...current, ...updatedProject } : updatedProject
    ));
    queryClient.setQueryData<Project[] | undefined>(
      ['projects'],
      (current) => current?.map((item) => (
        item.id === updatedProject.id ? { ...item, ...updatedProject } : item
      )) ?? current,
    );
  };

  const uploadMappingMutation = useMutation({
    mutationFn: (file: File) => uploadProjectMapping(projectId, file),
    onSuccess: (updatedProject) => {
      syncProjectCaches(updatedProject);
      message.success('代码映射文件上传成功');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '上传代码映射文件失败'));
    },
  });

  const createMappingMutation = useMutation({
    mutationFn: (entry: CodeMappingEntry) => createProjectMappingEntry(projectId, entry),
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

  const analyzeMutation = useMutation({
    mutationFn: (files: { codeChanges: File; testCases: File }) => (
      analyzeWithProject(
        projectId,
        files.codeChanges,
        files.testCases,
        undefined,
        useAI,
        selectedPromptTemplateKey,
      )
    ),
    onSuccess: (response) => {
      if (response.success && response.data) {
        setAnalysisResult(response.data);
        message.success(`分析完成，耗时 ${response.data.duration_ms}ms`);
        queryClient.invalidateQueries({ queryKey: ['records', projectId] });
      } else {
        message.error(response.error || '分析失败');
      }
    },
    onError: (error: Error & { response?: { data?: { detail?: string } } }) => {
      const msg = error.response?.data?.detail || error.message || '请求失败';
      message.error(msg);
    },
  });

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

  if (projectLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  if (!project) {
    return (
      <Card variant="borderless" className="dashboard-empty-card">
        <Empty description="项目不存在">
          <Button onClick={() => navigate('/projects')}>返回项目列表</Button>
        </Empty>
      </Card>
    );
  }

  const hasMappingData = codeMappings.length > 0;
  const latestCoverage = analysisResult?.coverage;
  const averageScore = project.stats?.avg_score;

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={() => navigate('/projects')}
        type="link"
        className="dashboard-back-button"
        style={{ marginBottom: 12 }}
      >
        返回项目列表
      </Button>

      <DashboardHero
        title={project.name}
        actions={(
          <div className="dashboard-kpi">
            <span className="dashboard-kpi__label">综合评分</span>
            <span className="dashboard-kpi__value">{averageScore == null ? '—' : averageScore.toFixed(1)}</span>
            <span className="dashboard-kpi__suffix">项目历史平均</span>
          </div>
        )}
      />

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          {records.length > 0 ? (
            <Card title="评分趋势" variant="borderless">
              <ScoreTrendChart records={records} title="" />
            </Card>
          ) : (
            <Card variant="borderless" className="dashboard-empty-card">
              <Empty description="暂无历史数据" />
            </Card>
          )}

          <Card
            title={(
              <span>
                <PlayCircleOutlined style={{ color: '#2A6DF4', marginRight: 8 }} />
                新建分析任务
              </span>
            )}
            extra={(
              <div className="dashboard-inline-panel" style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className="dashboard-inline-panel__value">AI 增强分析</span>
                  <Switch checked={useAI} onChange={setUseAI} />
                </div>
              </div>
            )}
            variant="borderless"
            style={{ marginTop: 24 }}
          >
            {hasMappingData ? (
              <Alert
                title="已绑定映射文件"
                description="项目已配置代码映射关系，可以直接上传代码改动与测试用例进行分析。"
                type="success"
                showIcon
                style={{ marginBottom: 24 }}
              />
            ) : (
              <Alert
                title="未绑定映射文件"
                description="请先上传代码映射文件，或前往代码映射关系页面补齐基础数据。"
                type="warning"
                showIcon
                style={{ marginBottom: 24 }}
              />
            )}

            <div style={{ marginBottom: 24 }}>
              <AIPromptTemplateSelect
                value={selectedPromptTemplateKey}
                useAI={useAI}
                onChange={setSelectedPromptTemplateKey}
                label="案例分析提示词"
              />
            </div>

            <FileUploadComponent
              onFilesReady={(files) => analyzeMutation.mutate(files)}
              loading={analyzeMutation.isPending}
            />
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="项目信息" variant="borderless">
            <Descriptions column={1} layout="vertical">
              <Descriptions.Item label="创建时间">
                {new Date(project.created_at).toLocaleString('zh-CN')}
              </Descriptions.Item>
              <Descriptions.Item label="总分析次数">
                <span style={{ fontSize: 24, fontWeight: 600 }}>{project.stats?.analysis_count ?? 0}</span> 次
              </Descriptions.Item>
              <Descriptions.Item label="映射文件状态">
                {hasMappingData ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <Tag color="success" style={{ margin: 0 }}>已绑定</Tag>
                    <Upload
                      accept=".csv,.xls,.xlsx"
                      maxCount={1}
                      showUploadList={false}
                      beforeUpload={(file) => {
                        uploadMappingMutation.mutate(file);
                        return false;
                      }}
                    >
                      <Button type="link" size="small" icon={<UploadOutlined />}>更新</Button>
                    </Upload>
                  </div>
                ) : (
                  <div className="dashboard-status-box">
                    <div style={{ marginBottom: 10, color: '#2A6DF4', fontWeight: 600 }}>暂无映射文件</div>
                    <Upload
                      accept=".csv,.xls,.xlsx"
                      maxCount={1}
                      showUploadList={false}
                      beforeUpload={(file) => {
                        uploadMappingMutation.mutate(file);
                        return false;
                      }}
                    >
                      <Button
                        type="primary"
                        ghost
                        size="small"
                        icon={<UploadOutlined />}
                        loading={uploadMappingMutation.isPending}
                      >
                        立即上传
                      </Button>
                    </Upload>
                  </div>
                )}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {latestCoverage ? (
            <Card title="覆盖率概览" variant="borderless" style={{ marginTop: 24 }}>
              <CoverageChart
                covered={latestCoverage.covered.length}
                uncovered={latestCoverage.uncovered.length}
                title=""
              />
            </Card>
          ) : null}
        </Col>
      </Row>

      {analysisResult ? (
        <div className="dashboard-result-enter" style={{ marginTop: 32 }}>
          <div style={{ marginBottom: 24, textAlign: 'center' }}>
            <Title level={3}>本次分析报告</Title>
          </div>
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={16}>
              <AnalysisResult
                diffAnalysis={analysisResult.diff_analysis}
                coverage={analysisResult.coverage}
                existingMappings={codeMappings}
                onAddMapping={handleOpenAddMapping}
              />
            </Col>
            <Col xs={24} lg={8}>
              <ScoreCard score={analysisResult.score} />
            </Col>
            <Col span={24}>
              <AISuggestions analysis={analysisResult.ai_analysis} usage={analysisResult.ai_cost} />
            </Col>
          </Row>
        </div>
      ) : null}

      <CodeMappingEntryModal
        open={mappingModalOpen}
        loading={createMappingMutation.isPending}
        title={`新增代码映射 · ${project.name}`}
        initialValues={mappingInitialValues}
        onCancel={() => {
          setMappingModalOpen(false);
          setMappingInitialValues(null);
        }}
        onSubmit={async (entry) => {
          await createMappingMutation.mutateAsync(entry);
        }}
      />
    </div>
  );
};

export default ProjectDetailPage;

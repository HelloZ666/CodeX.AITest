import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  Upload,
  message,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  CheckCircleOutlined,
  FileSearchOutlined,
  FilterOutlined,
  HistoryOutlined,
  InboxOutlined,
  LinkOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  analyzeRequirement,
  extractApiErrorMessage,
  listProductionIssueFiles,
  listProjects,
  listTestIssueFiles,
} from '../utils/api';
import RequirementAnalysisResultView from '../components/RequirementAnalysis/RequirementAnalysisResult';
import type {
  ProductionIssueFileRecord,
  Project,
  RequirementAnalysisResult,
  TestIssueFileRecord,
} from '../types';

const { Dragger } = Upload;
const { Text, Title } = Typography;

const heroStyle: React.CSSProperties = {
  marginBottom: 24,
  background: 'linear-gradient(135deg, rgba(255,255,255,0.82), rgba(255,255,255,0.55))',
  border: '1px solid rgba(255,255,255,0.35)',
  boxShadow: '0 18px 36px rgba(15, 34, 60, 0.08)',
};

const softPanelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.45)',
  border: '1px solid rgba(255,255,255,0.32)',
};

const sourceItemStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  padding: '12px 14px',
  borderRadius: 12,
  background: 'rgba(255,255,255,0.4)',
};

const RequirementAnalysisPage: React.FC = () => {
  const navigate = useNavigate();
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [useAI, setUseAI] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [requirementFile, setRequirementFile] = useState<File | null>(null);
  const [result, setResult] = useState<RequirementAnalysisResult | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
  });

  const productionFilesQuery = useQuery({
    queryKey: ['production-issue-files'],
    queryFn: listProductionIssueFiles,
    staleTime: 30_000,
  });

  const testIssueFilesQuery = useQuery({
    queryKey: ['test-issue-files', selectedProjectId],
    queryFn: () => listTestIssueFiles(selectedProjectId as number),
    enabled: selectedProjectId !== null,
    staleTime: 30_000,
  });

  const selectedProject = useMemo(
    () => (projectsQuery.data ?? []).find((item) => item.id === selectedProjectId) ?? null,
    [projectsQuery.data, selectedProjectId],
  );

  const latestProductionFile = useMemo<ProductionIssueFileRecord | null>(
    () => (productionFilesQuery.data ?? [])[0] ?? null,
    [productionFilesQuery.data],
  );

  const latestTestFile = useMemo<TestIssueFileRecord | null>(
    () => (testIssueFilesQuery.data ?? [])[0] ?? null,
    [testIssueFilesQuery.data],
  );

  useEffect(() => {
    if (!result || !resultRef.current) {
      return;
    }

    const scrollToResult = () => {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(scrollToResult);
      return;
    }

    scrollToResult();
  }, [result]);

  const analyzeMutation = useMutation({
    mutationFn: () => analyzeRequirement(
      selectedProjectId as number,
      requirementFile as File,
      useAI,
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

  const hasProductionFile = Boolean(latestProductionFile);
  const hasProjectTestFile = Boolean(selectedProjectId && latestTestFile);
  const isReadyToAnalyze = Boolean(selectedProjectId && requirementFile && hasProductionFile && hasProjectTestFile);

  const requirementUploadList: UploadFile[] = requirementFile
    ? [{ uid: requirementFile.name, name: requirementFile.name, status: 'done' }]
    : [];

  const handleProjectChange = (projectId: number | null) => {
    setSelectedProjectId(projectId);
    setResult(null);
  };

  const handleBeforeUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      message.error('当前仅支持上传 .docx 需求文档');
      return Upload.LIST_IGNORE;
    }
    setRequirementFile(file);
    setResult(null);
    return false;
  };

  const testIssueFiles = testIssueFilesQuery.data ?? [];

  return (
    <div>
      <Card variant="borderless" style={heroStyle}>
        <Row gutter={[24, 24]} align="middle">
          <Col xs={24} xl={16}>
            <Space orientation="vertical" size={8}>
              <Space wrap>
                <Tag color="processing">AI 分析来源：DeepSeek</Tag>
                <Tag color="blue">规则优先</Tag>
                <Tag color="cyan">自动关联问题库</Tag>
                <Tag color="purple">仅支持 .docx</Tag>
              </Space>
              <Title
                level={2}
                style={{
                  margin: 0,
                  background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                需求分析
              </Title>
            </Space>
          </Col>
          <Col xs={24} xl={8}>
            <Card size="small" style={softPanelStyle}>
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                <Space style={{ justifyContent: 'space-between', width: '100%' }} wrap>
                  <Space>
                    <RobotOutlined style={{ color: '#4f7cff' }} />
                    <Text strong>AI 补充分析</Text>
                  </Space>
                  <Switch checked={useAI} onChange={setUseAI} checkedChildren="开启" unCheckedChildren="关闭" />
                </Space>
              </Space>
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[24, 24]}>
        <Col xs={24} xl={15}>
          <Card
            title={(
              <Space>
                <FileSearchOutlined style={{ color: '#4f7cff' }} />
                <span>分析输入</span>
              </Space>
            )}
            variant="borderless"
          >
            <Space orientation="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <Text strong>1. 选择项目</Text>
                <Select
                  style={{ width: '100%', marginTop: 8 }}
                  size="large"
                  placeholder="请选择项目"
                  value={selectedProjectId ?? undefined}
                  onChange={(value) => handleProjectChange(value)}
                  allowClear
                  onClear={() => handleProjectChange(null)}
                  options={(projectsQuery.data ?? []).map((project: Project) => ({
                    value: project.id,
                    label: project.name,
                  }))}
                />
              </div>

              <div>
                <Text strong>2. 上传需求文档</Text>
                <div style={{ marginTop: 8 }}>
                  <Dragger
                    accept=".docx"
                    maxCount={1}
                    multiple={false}
                    beforeUpload={handleBeforeUpload}
                    onRemove={() => {
                      setRequirementFile(null);
                    }}
                    fileList={requirementUploadList}
                  >
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined />
                    </p>
                    <p className="ant-upload-text">点击或拖拽上传需求文档</p>
                    <p className="ant-upload-hint">优先解析 4.1 / 4.4 章节，仅命中文档正文内容</p>
                  </Dragger>
                </div>
              </div>

              <Alert
                type="info"
                showIcon
                title="分析时会自动取数"
                description="系统会自动使用最新的全局生产问题文件，以及所选项目下最新的测试问题文件，无需再手工选择。"
              />

              <Space wrap>
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckCircleOutlined />}
                  onClick={() => analyzeMutation.mutate()}
                  loading={analyzeMutation.isPending}
                  disabled={!isReadyToAnalyze}
                >
                  开始分析
                </Button>
                <Button size="large" icon={<HistoryOutlined />} onClick={() => navigate('/requirement-analysis/history')}>
                  查看分析记录
                </Button>
                <Button size="large" icon={<FilterOutlined />} onClick={() => navigate('/requirement-analysis/rules')}>
                  过滤规则
                </Button>
              </Space>
            </Space>
          </Card>
        </Col>

        <Col xs={24} xl={9}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            {!productionFilesQuery.isLoading && !hasProductionFile && (
              <Alert
                type="warning"
                showIcon
                title="当前还没有生产问题文件"
                description={(
                  <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/production-issues')}>
                    前往文件管理上传生产问题文件
                  </Button>
                )}
              />
            )}

            {selectedProjectId && !testIssueFilesQuery.isLoading && testIssueFiles.length === 0 && (
              <Alert
                type="warning"
                showIcon
                title="当前项目还没有测试问题文件"
                description={(
                  <Button type="link" icon={<LinkOutlined />} onClick={() => navigate('/test-issues')}>
                    前往文件管理上传测试问题文件
                  </Button>
                )}
              />
            )}

            <Card title="当前数据源" variant="borderless">
              <Space orientation="vertical" size="small" style={{ width: '100%' }}>
                <div style={sourceItemStyle}>
                  <Text type="secondary">项目</Text>
                  <Text strong>{selectedProject?.name || '未选择'}</Text>
                </div>
                <div style={sourceItemStyle}>
                  <Text type="secondary">生产问题文件</Text>
                  <Space orientation="vertical" size={2} style={{ alignItems: 'flex-end' }}>
                    <Tag color={hasProductionFile ? 'success' : 'default'}>
                      {hasProductionFile ? '已就绪' : '缺失'}
                    </Tag>
                    <Text>{latestProductionFile?.file_name || '暂无可用文件'}</Text>
                  </Space>
                </div>
                <div style={sourceItemStyle}>
                  <Text type="secondary">测试问题文件</Text>
                  <Space orientation="vertical" size={2} style={{ alignItems: 'flex-end' }}>
                    <Tag color={hasProjectTestFile ? 'success' : 'default'}>
                      {hasProjectTestFile ? '已就绪' : '待补充'}
                    </Tag>
                    <Text>
                      {selectedProjectId
                        ? (latestTestFile?.file_name || '当前项目暂无测试问题文件')
                        : '请先选择项目'}
                    </Text>
                  </Space>
                </div>
                <div style={sourceItemStyle}>
                  <Text type="secondary">需求文档</Text>
                  <Text strong>{requirementFile?.name || '未上传'}</Text>
                </div>
              </Space>
            </Card>

          </Space>
        </Col>
      </Row>

      {result && (
        <div ref={resultRef} style={{ marginTop: 32 }}>
          <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <Title level={4} style={{ margin: 0 }}>分析结果</Title>
              </div>
              <Tag color="processing">记录 ID：{result.record_id ?? '未生成'}</Tag>
            </div>
            <RequirementAnalysisResultView result={result} />
          </Space>
        </div>
      )}
    </div>
  );
};

export default RequirementAnalysisPage;

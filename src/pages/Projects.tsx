import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Select,
  Upload,
  message,
  Modal,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  DownloadOutlined,
  FolderOpenOutlined,
  InboxOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { saveAs } from 'file-saver';
import DashboardHero from '../components/Layout/DashboardHero';
import CodeMappingEntryModal from '../components/CodeMapping/CodeMappingEntryModal';
import type { CodeMappingEntry, Project } from '../types';
import {
  createProjectMappingEntry,
  downloadProjectMappingTemplate,
  extractApiErrorMessage,
  getProject,
  listProjects,
  uploadProjectMapping,
} from '../utils/api';
import { normalizeCodeMappingEntries } from '../utils/codeMapping';

const { Dragger } = Upload;
const { Text, Paragraph } = Typography;

const mappingColumns: ColumnsType<CodeMappingEntry> = [
  {
    title: '包名',
    dataIndex: 'package_name',
    key: 'package_name',
    width: 260,
  },
  {
    title: '类名',
    dataIndex: 'class_name',
    key: 'class_name',
    width: 220,
  },
  {
    title: '方法名',
    dataIndex: 'method_name',
    key: 'method_name',
    width: 220,
  },
  {
    title: '功能描述',
    dataIndex: 'description',
    key: 'description',
  },
];

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '暂无';
  }

  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', { hour12: false });
}

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const projectDetailQuery = useQuery({
    queryKey: ['project', selectedProjectId],
    queryFn: () => getProject(selectedProjectId as number),
    enabled: selectedProjectId !== undefined,
  });

  const projectDetail = projectDetailQuery.data ?? null;
  const selectedProject = projectDetail
    ?? (projectsQuery.data ?? []).find((project) => project.id === selectedProjectId)
    ?? null;
  const mappingRows = normalizeCodeMappingEntries(projectDetail?.mapping_data ?? selectedProject?.mapping_data);
  const hasSelectedProject = selectedProjectId !== undefined;
  const hasMapping = mappingRows.length > 0;
  const fileList: UploadFile[] = uploadFile
    ? [{ uid: uploadFile.name, name: uploadFile.name, status: 'done' }]
    : [];

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

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setUploadFile(null);
  };

  const uploadMutation = useMutation({
    mutationFn: ({ projectId, file }: { projectId: number; file: File }) => (
      uploadProjectMapping(projectId, file)
    ),
    onSuccess: (updatedProject) => {
      syncProjectCaches(updatedProject);
      message.success('代码映射文件上传成功');
      closeUploadModal();
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '上传代码映射文件失败'));
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: ({ projectId, entry }: { projectId: number; entry: CodeMappingEntry }) => (
      createProjectMappingEntry(projectId, entry)
    ),
    onSuccess: (updatedProject) => {
      syncProjectCaches(updatedProject);
      setCreateModalOpen(false);
      message.success('代码映射已保存');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '保存代码映射失败'));
    },
  });

  const templateMutation = useMutation({
    mutationFn: downloadProjectMappingTemplate,
    onSuccess: (blob) => {
      saveAs(blob, '代码映射关系模板.xlsx');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '下载代码映射模板失败'));
    },
  });

  const handleUploadConfirm = () => {
    if (!selectedProjectId) {
      message.warning('请先选择项目');
      return;
    }
    if (!uploadFile) {
      message.warning('请先选择要上传的代码映射文件');
      return;
    }
    uploadMutation.mutate({ projectId: selectedProjectId, file: uploadFile });
  };

  const handleCreateEntry = async (entry: CodeMappingEntry) => {
    if (!selectedProjectId) {
      message.warning('请先选择项目');
      return;
    }
    await createEntryMutation.mutateAsync({ projectId: selectedProjectId, entry });
  };

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project: Project) => ({
      label: project.name,
      value: project.id,
    })),
    [projectsQuery.data],
  );

  if (projectsQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <DashboardHero
        eyebrow="Code Mapping"
        title="代码映射关系"
        description="按项目维护代码方法与业务描述的对应关系，支持 Excel/CSV 导入、模板下载和手工新增，供案例分析与项目分析复用。"
        chips={[
          { label: `项目总数 ${projectsQuery.data?.length ?? 0}`, tone: 'gold' },
          { label: hasSelectedProject ? `当前项目 ${selectedProject?.name ?? '未选择'}` : '请先选择项目' },
        ]}
        actions={(
          <Space wrap>
            <Button
              icon={<DownloadOutlined />}
              size="large"
              onClick={() => templateMutation.mutate()}
              loading={templateMutation.isPending}
            >
              模板下载
            </Button>
            <Tooltip title={!hasSelectedProject ? '请先选择项目' : null}>
              <span>
                <Button
                  type="primary"
                  icon={<UploadOutlined />}
                  size="large"
                  onClick={() => setUploadModalOpen(true)}
                  disabled={!hasSelectedProject}
                >
                  {hasMapping ? '替换映射' : '上传映射'}
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={!hasSelectedProject ? '请先选择项目' : null}>
              <span>
                <Button
                  icon={<PlusOutlined />}
                  size="large"
                  onClick={() => setCreateModalOpen(true)}
                  disabled={!hasSelectedProject}
                >
                  新增
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={!hasSelectedProject ? '请先选择项目' : null}>
              <span>
                <Button
                  icon={<FolderOpenOutlined />}
                  size="large"
                  onClick={() => navigate(`/project/${selectedProjectId}`)}
                  disabled={!hasSelectedProject}
                >
                  项目详情
                </Button>
              </span>
            </Tooltip>
          </Space>
        )}
      />

      <Card variant="borderless" style={{ marginBottom: 24 }}>
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Text strong>项目筛选</Text>
          <Select
            allowClear
            showSearch
            placeholder="请选择项目后查看或维护代码映射关系"
            options={projectOptions}
            value={selectedProjectId}
            onChange={(value) => {
              setSelectedProjectId(value);
              setUploadFile(null);
            }}
            optionFilterProp="label"
            size="large"
            style={{ width: '100%' }}
          />
        </Space>
      </Card>

      {!hasSelectedProject ? (
        <Card variant="borderless" className="dashboard-empty-card">
          <Empty
            description={<span style={{ fontSize: 16, color: '#666' }}>请选择项目后查看代码映射关系</span>}
          />
        </Card>
      ) : projectDetailQuery.isLoading ? (
        <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
      ) : projectDetailQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="加载代码映射关系失败"
          description={extractApiErrorMessage(projectDetailQuery.error, '请稍后重试')}
        />
      ) : (
        <>
          <Card variant="borderless" style={{ marginBottom: 24 }}>
            <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
              <Space wrap>
                <Tag color={hasMapping ? 'success' : 'default'}>
                  {hasMapping ? '已绑定映射' : '未绑定映射'}
                </Tag>
                <Tag color="blue">映射条目 {mappingRows.length}</Tag>
                <Tag color="cyan">累计分析 {projectDetail?.stats?.analysis_count ?? 0}</Tag>
              </Space>
              <Text>项目名称：{selectedProject?.name ?? '暂无'}</Text>
              <Text>项目描述：{selectedProject?.description || '暂无描述'}</Text>
              <Text>创建时间：{formatDateTime(selectedProject?.created_at)}</Text>
              <Text>最近更新时间：{formatDateTime(selectedProject?.updated_at)}</Text>
              <Text>
                历史平均分：
                {projectDetail?.stats?.avg_score == null ? '暂无' : projectDetail.stats.avg_score.toFixed(1)}
              </Text>
            </Space>
          </Card>

          {hasMapping ? (
            <Card
              variant="borderless"
              title="代码映射明细"
              extra={<Text type="secondary">当前显示所选项目已绑定的代码映射内容</Text>}
              styles={{ body: { padding: 0 } }}
            >
              <Table<CodeMappingEntry>
                rowKey={(record) => `${record.package_name}.${record.class_name}.${record.method_name}`}
                dataSource={mappingRows}
                columns={mappingColumns}
                pagination={false}
                scroll={{ x: 980, y: 560 }}
                rowClassName="glass-table-row"
              />
            </Card>
          ) : (
            <Card variant="borderless" className="dashboard-empty-card">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span style={{ fontSize: 16, color: '#666' }}>当前项目暂无代码映射关系</span>}
              >
                <Space wrap style={{ marginTop: 16 }}>
                  <Button type="primary" onClick={() => setUploadModalOpen(true)} icon={<UploadOutlined />}>
                    上传映射文件
                  </Button>
                  <Button onClick={() => setCreateModalOpen(true)} icon={<PlusOutlined />}>
                    新增
                  </Button>
                  <Button icon={<FolderOpenOutlined />} onClick={() => navigate(`/project/${selectedProjectId}`)}>
                    查看项目详情
                  </Button>
                </Space>
              </Empty>
            </Card>
          )}
        </>
      )}

      <Modal
        title={`上传代码映射文件${selectedProject ? ` · ${selectedProject.name}` : ''}`}
        open={uploadModalOpen}
        onOk={handleUploadConfirm}
        onCancel={closeUploadModal}
        okText={hasMapping ? '上传并替换当前项目映射' : '上传并绑定当前项目'}
        confirmLoading={uploadMutation.isPending}
      >
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="上传说明"
            description={(
              <Space orientation="vertical" size={4}>
                <span>支持 `.csv / .xls / .xlsx`，上传后会直接替换当前项目已绑定的代码映射数据。</span>
                <span>表头支持中文或英文：`包名 / 类名 / 方法名 / 功能描述` 或 `package_name / class_name / method_name / description`。</span>
                <span>如需快速录入，可先下载页面模板并在 Excel 中补充后再上传。</span>
              </Space>
            )}
          />
          <Card
            variant="borderless"
            title={(
              <Space>
                <UploadOutlined style={{ color: '#4f7cff' }} />
                <span>导入代码映射文件</span>
              </Space>
            )}
          >
            <Dragger
              accept=".csv,.xls,.xlsx"
              maxCount={1}
              multiple={false}
              beforeUpload={(file) => {
                setUploadFile(file);
                return false;
              }}
              onRemove={() => {
                setUploadFile(null);
              }}
              fileList={fileList}
              style={{ background: 'rgba(255,255,255,0.45)' }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined style={{ color: '#667eea' }} />
              </p>
              <p className="ant-upload-text">拖拽文件到这里，或点击选择文件</p>
            </Dragger>
            <Paragraph style={{ margin: '16px 0 0', minHeight: 22 }}>
              {uploadFile ? `当前文件：${uploadFile.name}` : '未选择文件'}
            </Paragraph>
          </Card>
        </Space>
      </Modal>

      <CodeMappingEntryModal
        open={createModalOpen}
        loading={createEntryMutation.isPending}
        title={`新增代码映射${selectedProject ? ` · ${selectedProject.name}` : ''}`}
        onCancel={() => setCreateModalOpen(false)}
        onSubmit={handleCreateEntry}
      />
    </div>
  );
};

export default ProjectsPage;

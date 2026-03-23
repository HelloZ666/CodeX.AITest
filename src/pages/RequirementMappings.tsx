import React, { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { UploadFile } from 'antd/es/upload/interface';
import {
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  FileExcelOutlined,
  InboxOutlined,
  PlusOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { saveAs } from 'file-saver';
import DashboardHero from '../components/Layout/DashboardHero';
import type {
  Project,
  RequirementMappingDetail,
  RequirementMappingGroup,
  RequirementMappingRow,
} from '../types';
import {
  downloadRequirementMappingTemplate,
  extractApiErrorMessage,
  getRequirementMapping,
  listProjects,
  saveRequirementMapping,
  uploadRequirementMapping,
} from '../utils/api';

const { Dragger } = Upload;
const { Text, Paragraph } = Typography;

interface GroupFormValues {
  tag: string;
  requirement_keyword: string;
  related_scenarios: Array<{ value: string }>;
}

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

function getSourceLabel(sourceType?: RequirementMappingDetail['source_type']) {
  switch (sourceType) {
    case 'upload':
      return { label: '文件导入', color: 'blue' as const };
    case 'manual':
      return { label: '手工维护', color: 'green' as const };
    case 'mixed':
      return { label: '导入后已手工调整', color: 'gold' as const };
    default:
      return { label: '暂无数据', color: 'default' as const };
  }
}

function createGroupPayload(values: GroupFormValues, groupId?: string): RequirementMappingGroup {
  return {
    id: groupId ?? `manual-${Date.now()}`,
    tag: values.tag,
    requirement_keyword: values.requirement_keyword,
    related_scenarios: values.related_scenarios.map((item) => item.value),
  };
}

const RequirementMappingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedProjectId, setSelectedProjectId] = useState<number | undefined>(undefined);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<RequirementMappingGroup | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [groupForm] = Form.useForm<GroupFormValues>();

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const mappingQuery = useQuery({
    queryKey: ['requirement-mapping', selectedProjectId],
    queryFn: () => getRequirementMapping(selectedProjectId as number),
    enabled: selectedProjectId !== undefined,
  });

  const uploadMutation = useMutation({
    mutationFn: ({ projectId, file }: { projectId: number; file: File }) => uploadRequirementMapping(projectId, file),
    onSuccess: (detail) => {
      queryClient.setQueryData(['requirement-mapping', detail.project_id], detail);
      message.success('需求映射关系导入成功');
      setUploadModalOpen(false);
      setUploadFile(null);
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '导入需求映射关系失败'));
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ projectId, groups }: { projectId: number; groups: RequirementMappingGroup[] }) =>
      saveRequirementMapping(projectId, groups),
    onSuccess: (detail, variables) => {
      queryClient.setQueryData(['requirement-mapping', variables.projectId], detail);
      message.success(detail ? '需求映射关系已保存' : '需求映射关系已清空');
      setGroupModalOpen(false);
      setEditingGroup(null);
      groupForm.resetFields();
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '保存需求映射关系失败'));
    },
  });

  const templateMutation = useMutation({
    mutationFn: downloadRequirementMappingTemplate,
    onSuccess: (blob) => {
      saveAs(blob, '需求映射关系模板.xlsx');
    },
    onError: (error) => {
      message.error(extractApiErrorMessage(error, '下载模板失败'));
    },
  });

  const selectedProject = useMemo(
    () => (projectsQuery.data ?? []).find((project) => project.id === selectedProjectId) ?? null,
    [projectsQuery.data, selectedProjectId],
  );

  const mappingDetail = mappingQuery.data ?? null;
  const sourceInfo = getSourceLabel(mappingDetail?.source_type);
  const hasSelectedProject = selectedProjectId !== undefined;
  const fileList: UploadFile[] = uploadFile ? [{ uid: uploadFile.name, name: uploadFile.name, status: 'done' }] : [];

  const projectOptions = useMemo(
    () => (projectsQuery.data ?? []).map((project: Project) => ({ label: project.name, value: project.id })),
    [projectsQuery.data],
  );

  const openCreateGroupModal = () => {
    setEditingGroup(null);
    groupForm.setFieldsValue({
      tag: '',
      requirement_keyword: '',
      related_scenarios: [{ value: '' }],
    });
    setGroupModalOpen(true);
  };

  const openEditGroupModal = (group: RequirementMappingGroup) => {
    setEditingGroup(group);
    groupForm.setFieldsValue({
      tag: group.tag,
      requirement_keyword: group.requirement_keyword,
      related_scenarios: group.related_scenarios.map((item) => ({ value: item })),
    });
    setGroupModalOpen(true);
  };

  const closeGroupModal = () => {
    setGroupModalOpen(false);
    setEditingGroup(null);
    groupForm.resetFields();
  };

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setUploadFile(null);
  };

  const handleUploadConfirm = () => {
    if (!selectedProjectId) {
      message.warning('请先选择项目');
      return;
    }
    if (!uploadFile) {
      message.warning('请先选择要上传的需求映射文件');
      return;
    }
    uploadMutation.mutate({ projectId: selectedProjectId, file: uploadFile });
  };

  const handleSaveGroup = async () => {
    if (!selectedProjectId) {
      message.warning('请先选择项目');
      return;
    }

    try {
      const values = await groupForm.validateFields();
      const nextGroup = createGroupPayload(values, editingGroup?.id);
      const currentGroups = mappingDetail?.groups ?? [];
      const nextGroups = editingGroup
        ? currentGroups.map((item) => (item.id === editingGroup.id ? nextGroup : item))
        : [...currentGroups, nextGroup];

      saveMutation.mutate({ projectId: selectedProjectId, groups: nextGroups });
    } catch {
      // Ant Design will show field-level validation feedback.
    }
  };

  const handleDeleteGroup = (groupId: string) => {
    if (!selectedProjectId) {
      return;
    }
    const nextGroups = (mappingDetail?.groups ?? []).filter((group) => group.id !== groupId);
    saveMutation.mutate({ projectId: selectedProjectId, groups: nextGroups });
  };

  const columns = useMemo<ColumnsType<RequirementMappingRow>>(
    () => [
      {
        title: '标签',
        dataIndex: 'tag',
        key: 'tag',
        width: 180,
        onCell: (record) => ({ rowSpan: record.tag_row_span }),
      },
      {
        title: '需求关键字',
        dataIndex: 'requirement_keyword',
        key: 'requirement_keyword',
        width: 220,
        onCell: (record) => ({ rowSpan: record.requirement_keyword_row_span }),
      },
      {
        title: '关联场景',
        dataIndex: 'related_scenario',
        key: 'related_scenario',
      },
      {
        title: '操作',
        key: 'actions',
        width: 160,
        render: (_, record) => (
          <Space>
            <Button size="small" icon={<EditOutlined />} onClick={() => {
              const group = mappingDetail?.groups.find((item) => item.id === record.group_id);
              if (group) {
                openEditGroupModal(group);
              }
            }}
            />
            <Popconfirm
              title="确定删除该映射组吗？"
              description="删除后，该标签和需求关键字下的所有关联场景都会一起移除。"
              onConfirm={() => handleDeleteGroup(record.group_id)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
        onCell: (record) => ({ rowSpan: record.operation_row_span }),
      },
    ],
    [mappingDetail?.groups],
  );

  if (projectsQuery.isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <DashboardHero
        title="需求映射关系"
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
                  icon={<UploadOutlined />}
                  size="large"
                  onClick={() => setUploadModalOpen(true)}
                  disabled={!hasSelectedProject}
                >
                  导入
                </Button>
              </span>
            </Tooltip>
            <Tooltip title={!hasSelectedProject ? '请先选择项目' : null}>
              <span>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  size="large"
                  onClick={openCreateGroupModal}
                  disabled={!hasSelectedProject}
                >
                  新增
                </Button>
              </span>
            </Tooltip>
          </Space>
        )}
      />

      <Card variant="borderless" style={{ marginBottom: 24 }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text strong>项目筛选</Text>
          <Select
            allowClear
            showSearch
            placeholder="请选择项目后查看或维护需求映射关系"
            options={projectOptions}
            value={selectedProjectId}
            onChange={(value) => setSelectedProjectId(value)}
            optionFilterProp="label"
            size="large"
            style={{ width: '100%' }}
          />
        </Space>
      </Card>

      {!hasSelectedProject ? (
        <Card variant="borderless" className="dashboard-empty-card">
          <Empty
            description={<span style={{ fontSize: 16, color: '#666' }}>请选择项目后查看需求映射关系</span>}
          />
        </Card>
      ) : mappingQuery.isLoading ? (
        <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />
      ) : mappingQuery.isError ? (
        <Alert
          type="error"
          showIcon
          message="加载需求映射关系失败"
          description={extractApiErrorMessage(mappingQuery.error, '请稍后重试')}
        />
      ) : (
        <>
          <Card variant="borderless" style={{ marginBottom: 24 }}>
            <Space wrap size={[8, 12]} style={{ marginBottom: 16 }}>
              <Tag color={sourceInfo.color}>{sourceInfo.label}</Tag>
              <Tag color="blue">分组 {mappingDetail?.group_count ?? 0}</Tag>
              <Tag color="cyan">场景行 {mappingDetail?.row_count ?? 0}</Tag>
            </Space>
            <Descriptions column={{ xs: 1, md: 2 }} size="small">
              <Descriptions.Item label="项目名称">{selectedProject?.name ?? '暂无'}</Descriptions.Item>
              <Descriptions.Item label="最近导入文件">
                {mappingDetail?.last_file_name ?? '仅手工维护 / 暂无文件'}
              </Descriptions.Item>
              <Descriptions.Item label="工作表">{mappingDetail?.sheet_name ?? '暂无'}</Descriptions.Item>
              <Descriptions.Item label="最近更新时间">{formatDateTime(mappingDetail?.updated_at)}</Descriptions.Item>
            </Descriptions>
          </Card>

          {mappingDetail ? (
            <Card
              variant="borderless"
              title="需求映射明细"
              styles={{ body: { padding: 0 } }}
            >
              <Table<RequirementMappingRow>
                rowKey="row_key"
                dataSource={mappingDetail.rows}
                columns={columns}
                pagination={false}
                scroll={{ y: 560 }}
                rowClassName="glass-table-row"
              />
            </Card>
          ) : (
            <Card variant="borderless" className="dashboard-empty-card">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span style={{ fontSize: 16, color: '#666' }}>当前项目暂无需求映射关系</span>}
              >
                <Space wrap style={{ marginTop: 16 }}>
                  <Button onClick={() => setUploadModalOpen(true)} icon={<UploadOutlined />}>
                    导入
                  </Button>
                  <Button type="primary" onClick={openCreateGroupModal} icon={<PlusOutlined />}>
                    新增
                  </Button>
                </Space>
              </Empty>
            </Card>
          )}
        </>
      )}

      <Modal
        title={`导入需求映射文件${selectedProject ? ` · ${selectedProject.name}` : ''}`}
        open={uploadModalOpen}
        onOk={handleUploadConfirm}
        onCancel={closeUploadModal}
        okText="导入并覆盖当前项目数据"
        confirmLoading={uploadMutation.isPending}
      >
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            title="导入说明"
            description={(
              <Space direction="vertical" size={4}>
                <span>仅支持 `.xls / .xlsx`，导入后会全量覆盖当前项目的需求映射关系。</span>
                <span>若导入前已手工维护，新的文件内容会直接替换当前数据。</span>
                <span>模板表头固定为“标签 / 需求关键字 / 关联场景”，支持含合并单元格的 Excel。</span>
              </Space>
            )}
          />
          <Card
            variant="borderless"
            title={(
              <Space>
                <FileExcelOutlined style={{ color: '#4f7cff' }} />
                <span>导入需求映射 Excel</span>
              </Space>
            )}
          >
            <Dragger
              accept=".xls,.xlsx"
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

      <Modal
        title={editingGroup ? '编辑映射组' : '新增映射组'}
        open={groupModalOpen}
        onOk={() => void handleSaveGroup()}
        onCancel={closeGroupModal}
        confirmLoading={saveMutation.isPending}
        okText="保存"
        width={720}
      >
        <Form form={groupForm} layout="vertical">
          <Form.Item
            name="tag"
            label="标签"
            rules={[{ required: true, message: '请输入标签' }]}
          >
            <Input placeholder="例如：流程变更" />
          </Form.Item>
          <Form.Item
            name="requirement_keyword"
            label="需求关键字"
            rules={[{ required: true, message: '请输入需求关键字' }]}
          >
            <Input placeholder="例如：抄录" />
          </Form.Item>
          <Form.List name="related_scenarios">
            {(fields, { add, remove }) => (
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Space align="center" style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Text strong>关联场景</Text>
                  <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ value: '' })}>
                    新增一行
                  </Button>
                </Space>
                {fields.map((field, index) => (
                  <Space key={field.key} align="start" style={{ display: 'flex' }}>
                    <Form.Item
                      {...field}
                      name={[field.name, 'value']}
                      label={`场景${index + 1}`}
                      rules={[{ required: true, message: '请输入关联场景' }]}
                      style={{ flex: 1, marginBottom: 0, minWidth: 0 }}
                    >
                      <Input placeholder="例如：一键抄录" />
                    </Form.Item>
                    <Button
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => remove(field.name)}
                      disabled={fields.length === 1}
                    />
                  </Space>
                ))}
              </Space>
            )}
          </Form.List>
        </Form>
      </Modal>
    </div>
  );
};

export default RequirementMappingsPage;

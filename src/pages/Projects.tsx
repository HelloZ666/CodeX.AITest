import React, { useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Empty,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
  Upload,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  EyeOutlined,
  FolderOpenOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  getProject,
  listProjects,
  uploadProjectMapping,
} from '../utils/api';
import type { Project } from '../types';

const { Title, Text } = Typography;

const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mappingModalProject, setMappingModalProject] = useState<Project | null>(null);
  const [mappingData, setMappingData] = useState<Array<{ package_name: string; class_name: string; method_name: string; description: string }>>([]);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });

  const mappingMutation = useMutation({
    mutationFn: ({ projectId, file }: { projectId: number; file: File }) =>
      uploadProjectMapping(projectId, file),
    onSuccess: () => {
      message.success('映射文件上传成功');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError: () => message.error('上传失败'),
  });

  const viewMapping = async (project: Project) => {
    try {
      const detail = await getProject(project.id);
      const data = (detail as unknown as Record<string, unknown>)?.mapping_data;
      if (Array.isArray(data)) {
        setMappingData(data as Array<{ package_name: string; class_name: string; method_name: string; description: string }>);
      } else {
        setMappingData([]);
      }
      setMappingModalProject(project);
    } catch {
      message.error('获取映射详情失败');
    }
  };

  const columns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: Project) => (
        <Button type="link" onClick={() => navigate(`/project/${record.id}`)}>
          <FolderOpenOutlined /> {name}
        </Button>
      ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc: string) => desc || <Text type="secondary">无描述</Text>,
    },
    {
      title: '映射文件',
      dataIndex: 'mapping_data',
      key: 'mapping',
      width: 220,
      render: (data: unknown, record: Project) => (
        <Space>
          {data ? (
            <>
              <Tag icon={<CheckCircleOutlined />} color="success">已绑定</Tag>
              <Tooltip title="查看映射详情">
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => viewMapping(record)}
                />
              </Tooltip>
            </>
          ) : (
            <Tag color="default">未上传</Tag>
          )}

          <Upload
            accept=".csv"
            maxCount={1}
            showUploadList={false}
            beforeUpload={(file) => {
              mappingMutation.mutate({ projectId: record.id, file });
              return false;
            }}
          >
            <Button size="small" icon={<UploadOutlined />}>
              {data ? '替换' : '上传'}
            </Button>
          </Upload>
        </Space>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value: string) => new Date(value).toLocaleString('zh-CN'),
    },
  ];

  const mappingColumns = [
    { title: '包名', dataIndex: 'package_name', key: 'package_name' },
    { title: '类名', dataIndex: 'class_name', key: 'class_name' },
    { title: '方法名', dataIndex: 'method_name', key: 'method_name' },
    { title: '功能描述', dataIndex: 'description', key: 'description' },
  ];

  if (isLoading) {
    return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 32,
          background: 'rgba(255,255,255,0.4)',
          padding: '16px 24px',
          borderRadius: 16,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.3)',
        }}
      >
        <div>
          <Title
            level={2}
            style={{
              margin: '0 0 4px 0',
              background: 'linear-gradient(135deg, #1a1a2e, #0f3460)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            代码映射关系
          </Title>
        </div>
      </div>

      {projects.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 48 }}>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<span style={{ fontSize: 16, color: '#666' }}>暂无项目，请先到项目管理中创建项目</span>}
          />
        </Card>
      ) : (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 24 }}
            title="使用说明"
            description="请先在项目管理中维护项目，再在对应项目行上传或替换代码映射文件。"
          />
          <Card
            variant="borderless"
            styles={{ body: { padding: 0 } }}
            style={{ background: 'transparent', boxShadow: 'none' }}
          >
            <Table
              dataSource={projects}
              columns={columns}
              rowKey="id"
              pagination={{ pageSize: 10 }}
              rowClassName="glass-table-row"
            />
          </Card>
        </>
      )}

      <Modal
        title={`映射详情 — ${mappingModalProject?.name ?? ''}`}
        open={mappingModalProject !== null}
        onCancel={() => setMappingModalProject(null)}
        footer={null}
        width={800}
      >
        <Table
          dataSource={mappingData}
          columns={mappingColumns}
          rowKey={(_, idx) => String(idx)}
          size="small"
          pagination={false}
          locale={{ emptyText: '暂无映射数据' }}
        />
      </Modal>
    </div>
  );
};

export default ProjectsPage;

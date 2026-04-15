import React, { useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Empty,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  DownloadOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import DashboardHero from '../components/Layout/DashboardHero';
import type {
  ConfigTestCaseAssetSummary,
  FunctionalTestCase,
} from '../types';
import { exportFunctionalTestCasesCsv } from '../utils/exportTestCases';
import {
  extractApiErrorMessage,
  getConfigTestCaseAsset,
  listConfigTestCaseAssets,
} from '../utils/api';

const { Text, Title } = Typography;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN');
}

function buildExportFileName(record: Pick<ConfigTestCaseAssetSummary, 'name'>): string {
  const baseName = record.name.replace(/\.[^.]+$/, '').trim();
  return baseName || '测试用例';
}

function getAssetTypeLabel(assetType: ConfigTestCaseAssetSummary['asset_type']): string {
  return assetType === 'generated' ? '自动生成' : '上传文件';
}

function getAssetTypeColor(assetType: ConfigTestCaseAssetSummary['asset_type']): string {
  return assetType === 'generated' ? 'success' : 'processing';
}

const caseColumns: ColumnsType<FunctionalTestCase> = [
  {
    title: '用例 ID',
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
  },
  {
    title: '测试步骤',
    dataIndex: 'steps',
    key: 'steps',
    render: (value: string) => <div style={{ whiteSpace: 'pre-wrap' }}>{value}</div>,
  },
  {
    title: '预期结果',
    dataIndex: 'expected_result',
    key: 'expected_result',
    render: (value: string) => <div style={{ whiteSpace: 'pre-wrap' }}>{value}</div>,
  },
];

const ConfigTestCasesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [exportingAssetId, setExportingAssetId] = useState<number | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['config-test-case-assets'],
    queryFn: () => listConfigTestCaseAssets({ limit: 100 }),
  });

  const detailQuery = useQuery({
    queryKey: ['config-test-case-asset', selectedAssetId],
    queryFn: () => getConfigTestCaseAsset(selectedAssetId as number),
    enabled: selectedAssetId !== null,
  });

  const handlePreview = (assetId: number) => {
    setSelectedAssetId(assetId);
    setDrawerOpen(true);
  };

  const handleExport = async (record: ConfigTestCaseAssetSummary) => {
    setExportingAssetId(record.id);
    try {
      const detail = await queryClient.fetchQuery({
        queryKey: ['config-test-case-asset', record.id],
        queryFn: () => getConfigTestCaseAsset(record.id),
      });
      exportFunctionalTestCasesCsv(detail.cases, buildExportFileName(record));
      message.success('测试用例导出成功');
    } catch (error) {
      message.error(extractApiErrorMessage(error, '测试用例导出失败'));
    } finally {
      setExportingAssetId(null);
    }
  };

  const columns: ColumnsType<ConfigTestCaseAssetSummary> = [
    {
      title: '操作时间',
      dataIndex: 'operated_at',
      key: 'operated_at',
      width: 190,
      render: formatDateTime,
    },
    {
      title: '测试用例名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      width: 240,
    },
    {
      title: '类型',
      dataIndex: 'asset_type',
      key: 'asset_type',
      width: 110,
      render: (value: ConfigTestCaseAssetSummary['asset_type']) => (
        <Tag color={getAssetTypeColor(value)}>{getAssetTypeLabel(value)}</Tag>
      ),
    },
    {
      title: '关联需求文档',
      dataIndex: 'requirement_file_name',
      key: 'requirement_file_name',
      ellipsis: true,
      width: 220,
      render: (value: string | null) => value || '--',
    },
    {
      title: '来源页面',
      dataIndex: 'source_page',
      key: 'source_page',
      width: 140,
    },
    {
      title: '项目',
      dataIndex: 'project_name',
      key: 'project_name',
      width: 160,
      render: (value: string | null) => value || <Text type="secondary">通用</Text>,
    },
    {
      title: '操作人',
      dataIndex: 'operator_name',
      key: 'operator_name',
      width: 140,
      render: (value: string | null) => value || '--',
    },
    {
      title: '操作账号',
      dataIndex: 'operator_username',
      key: 'operator_username',
      width: 140,
      render: (value: string | null) => value || '--',
    },
    {
      title: '用例条数',
      dataIndex: 'case_count',
      key: 'case_count',
      width: 110,
      render: (value: number) => value.toLocaleString(),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_, record) => (
        <Space size={8}>
          <Button
            size="small"
            aria-label="预览"
            icon={<EyeOutlined />}
            className="glass-table-action-button"
            onClick={() => handlePreview(record.id)}
          >
            预览
          </Button>
          <Button
            size="small"
            aria-label="导出"
            icon={<DownloadOutlined />}
            className="glass-table-action-button"
            loading={exportingAssetId === record.id}
            onClick={() => void handleExport(record)}
          >
            导出
          </Button>
        </Space>
      ),
    },
  ];

  const selectedDetail = detailQuery.data;

  return (
    <div>
      <DashboardHero
        eyebrow="配置管理"
        title="测试用例"
        description="功能测试上传的测试用例与自动生成的测试用例都会在这里统一去重沉淀，支持预览与导出。"
        chips={[
          { label: `去重后 ${assetsQuery.data?.length ?? 0} 条记录`, tone: 'accent' },
        ]}
      />

      <Card variant="borderless" title="测试用例台账" styles={{ body: { padding: 0 } }}>
        {assetsQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : (assetsQuery.data ?? []).length === 0 ? (
          <div style={{ padding: 48 }}>
            <Empty description="暂无已沉淀的测试用例" />
          </div>
        ) : (
          <Table
            rowKey="id"
            columns={columns}
            dataSource={assetsQuery.data}
            pagination={{ pageSize: 10, showSizeChanger: false }}
            scroll={{ x: 1680 }}
            className="glass-records-table"
            rowClassName="glass-table-row"
          />
        )}
      </Card>

      <Drawer
        title="测试用例预览"
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedAssetId(null);
        }}
        size="large"
        extra={selectedDetail ? (
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            loading={exportingAssetId === selectedDetail.id}
            onClick={() => void handleExport(selectedDetail)}
          >
            导出当前测试用例
          </Button>
        ) : null}
      >
        {detailQuery.isLoading ? (
          <Spin size="large" style={{ display: 'block', margin: '120px auto' }} />
        ) : selectedDetail ? (
          <div>
            <Card size="small" style={{ marginBottom: 16 }}>
              <Space size={[12, 12]} wrap>
                <Tag color={getAssetTypeColor(selectedDetail.asset_type)}>
                  {getAssetTypeLabel(selectedDetail.asset_type)}
                </Tag>
                <Tag>{selectedDetail.source_page}</Tag>
                <Tag>{selectedDetail.operator_name || '未知操作人'}</Tag>
                <Tag>{selectedDetail.operator_username || '未知账号'}</Tag>
                <Tag color="blue">{selectedDetail.case_count} 条用例</Tag>
                {selectedDetail.generation_mode ? (
                  <Tag color={selectedDetail.generation_mode === 'ai' ? 'success' : 'default'}>
                    {selectedDetail.generation_mode === 'ai' ? 'AI 生成' : '规则回退'}
                  </Tag>
                ) : null}
                {selectedDetail.provider ? <Tag>{selectedDetail.provider}</Tag> : null}
              </Space>
              <div style={{ marginTop: 12 }}>
                <Text strong>测试用例名称：</Text>
                <Text>{selectedDetail.name}</Text>
              </div>
              {selectedDetail.requirement_file_name ? (
                <div style={{ marginTop: 8 }}>
                  <Text strong>关联需求文档：</Text>
                  <Text>{selectedDetail.requirement_file_name}</Text>
                </div>
              ) : null}
              <div style={{ marginTop: 8 }}>
                <Text strong>操作时间：</Text>
                <Text>{formatDateTime(selectedDetail.operated_at)}</Text>
              </div>
            </Card>

            <Title level={5} style={{ marginTop: 0 }}>用例明细</Title>
            <Table
              rowKey="case_id"
              columns={caseColumns}
              dataSource={selectedDetail.cases}
              pagination={{ pageSize: 8, showSizeChanger: false }}
              scroll={{ x: 980 }}
            />
          </div>
        ) : (
          <Empty description="未找到测试用例详情" />
        )}
      </Drawer>
    </div>
  );
};

export default ConfigTestCasesPage;

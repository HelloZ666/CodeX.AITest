import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { AuditOutlined, SearchOutlined } from '@ant-design/icons';
import type { AuditLogRecord } from '../types';
import { listAuditLogs } from '../utils/api';

const { Text, Title } = Typography;

const MODULE_OPTIONS = [
  { label: '认证', value: '认证' },
  { label: '系统管理', value: '系统管理' },
  { label: '项目管理', value: '项目管理' },
  { label: '配置管理', value: '配置管理' },
  { label: '功能测试', value: '功能测试' },
  { label: '接口自动化', value: '接口自动化' },
];

const RESULT_OPTIONS = [
  { label: '成功', value: 'success' },
  { label: '失败', value: 'failure' },
];

const DETAIL_SUMMARY_MAP: Record<string, string> = {
  登录: '登录成功',
  退出登录: '退出登录',
  创建用户: '新增用户',
  编辑用户: '更新用户',
  更新用户状态: '状态变更',
  重置用户密码: '重置密码',
  删除用户: '删除用户',
  创建项目: '新建项目',
  更新项目: '更新项目',
  案例分析: '分析完成',
  生成案例质检报告: '报告生成',
  上传生产问题文件: '文件上传',
  上传测试问题文件: '文件上传',
};

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '--';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function compactText(value?: string | null, maxLength: number = 12): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return '--';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function getAccountValue(record: AuditLogRecord): string {
  return record.operator_username || (record.target_type === '用户' ? record.target_name : null) || '--';
}

function getDetailSummary(record: AuditLogRecord): string {
  const mappedSummary = DETAIL_SUMMARY_MAP[record.action];
  if (mappedSummary) {
    return mappedSummary;
  }
  if (record.result === 'failure') {
    return '执行失败';
  }
  return compactText(record.detail);
}

const OperationLogsPage: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<'success' | 'failure' | ''>('');
  const [pagination, setPagination] = useState<{ current: number; pageSize: number }>({
    current: 1,
    pageSize: 10,
  });

  const queryParams = useMemo(
    () => ({
      keyword: keyword.trim(),
      module: moduleFilter,
      result: resultFilter,
      limit: pagination.pageSize,
      offset: (pagination.current - 1) * pagination.pageSize,
    }),
    [keyword, moduleFilter, resultFilter, pagination],
  );

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', queryParams],
    queryFn: () => listAuditLogs(queryParams),
  });

  const columns: ColumnsType<AuditLogRecord> = [
    {
      title: '操作时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '模块',
      dataIndex: 'module',
      key: 'module',
      width: 120,
    },
    {
      title: '操作',
      dataIndex: 'action',
      key: 'action',
      width: 140,
    },
    {
      title: '操作人',
      key: 'operator',
      width: 180,
      render: (_, record) => record.operator_display_name || record.operator_username || '--',
    },
    {
      title: '账号',
      key: 'account',
      width: 180,
      render: (_, record) => getAccountValue(record),
    },
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      width: 220,
      render: (value: string | null) => value || '--',
    },
    {
      title: '结果',
      dataIndex: 'result',
      key: 'result',
      width: 100,
      render: (value: AuditLogRecord['result']) => (
        <Tag color={value === 'success' ? 'success' : 'error'}>
          {value === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '说明',
      key: 'detail',
      width: 140,
      render: (_, record) => getDetailSummary(record),
    },
  ];

  const handleTableChange = (nextPagination: TablePaginationConfig) => {
    setPagination({
      current: nextPagination.current || 1,
      pageSize: nextPagination.pageSize || 10,
    });
  };

  return (
    <Space orientation="vertical" size={24} style={{ display: 'flex' }}>
      <Card variant="borderless">
        <Space orientation="vertical" size={8} style={{ width: '100%' }}>
          <Space size={12}>
            <AuditOutlined style={{ fontSize: 24, color: '#1677ff' }} />
            <Title level={2} style={{ margin: 0 }}>
              操作记录
            </Title>
          </Space>
        </Space>
      </Card>

      <Card variant="borderless" styles={{ body: { padding: 20 } }}>
        <Space size="middle" wrap style={{ width: '100%' }}>
          <Input
            allowClear
            size="large"
            prefix={<SearchOutlined />}
            placeholder="搜索操作人、账号、文件名、说明或接口路径"
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
            style={{ width: 360 }}
          />
          <Select
            allowClear
            size="large"
            placeholder="按模块筛选"
            value={moduleFilter || undefined}
            onChange={(value) => {
              setModuleFilter((value ?? '') as string);
              setPagination((current) => ({ ...current, current: 1 }));
            }}
            options={MODULE_OPTIONS}
            style={{ width: 180 }}
          />
          <Select
            allowClear
            size="large"
            placeholder="按结果筛选"
            value={resultFilter || undefined}
            onChange={(value) => {
              setResultFilter((value ?? '') as 'success' | 'failure' | '');
              setPagination((current) => ({ ...current, current: 1 }));
            }}
            options={RESULT_OPTIONS}
            style={{ width: 160 }}
          />
          <Text type="secondary">共 {data?.total ?? 0} 条</Text>
        </Space>
      </Card>

      <Card variant="borderless" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data?.records ?? []}
          columns={columns}
          scroll={{ x: 1280 }}
          onChange={handleTableChange}
          pagination={{
            current: pagination.current,
            pageSize: pagination.pageSize,
            total: data?.total ?? 0,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          locale={{ emptyText: '暂无操作记录' }}
        />
      </Card>
    </Space>
  );
};

export default OperationLogsPage;

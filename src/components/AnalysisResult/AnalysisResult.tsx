import React from 'react';
import { Button, Card, Col, Progress, Row, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type {
  CodeMappingEntry,
  CoverageDetail,
  CoverageResult,
  DiffAnalysis,
} from '../../types';
import { isCodeMappingEntryMatched } from '../../utils/codeMapping';

interface AnalysisResultProps {
  diffAnalysis: DiffAnalysis;
  coverage: CoverageResult;
  existingMappings?: CodeMappingEntry[];
  onAddMapping?: (detail: CoverageDetail) => void;
}

const AnalysisResult: React.FC<AnalysisResultProps> = ({
  diffAnalysis,
  coverage,
  existingMappings = [],
  onAddMapping,
}) => {
  const coveragePercent = Math.round(coverage.coverage_rate * 100);

  const diffColumns = [
    { title: '包路径', dataIndex: 'package', key: 'package', ellipsis: true },
    {
      title: '新增行',
      dataIndex: 'added',
      key: 'added',
      width: 100,
      render: (value: number) => <span style={{ color: '#2A6DF4' }}>+{value}</span>,
    },
    {
      title: '删除行',
      dataIndex: 'removed',
      key: 'removed',
      width: 100,
      render: (value: number) => <span style={{ color: '#64748B' }}>-{value}</span>,
    },
  ];

  const coverageColumns: ColumnsType<CoverageDetail> = [
    { title: '方法', dataIndex: 'method', key: 'method', ellipsis: true },
    { title: '功能描述', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '覆盖状态',
      dataIndex: 'is_covered',
      key: 'is_covered',
      width: 110,
      render: (value: boolean) => (value ? <Tag color="success">已覆盖</Tag> : <Tag color="error">未覆盖</Tag>),
    },
    {
      title: '匹配用例',
      dataIndex: 'matched_tests',
      key: 'matched_tests',
      width: 180,
      render: (tests: string[]) => (
        tests.length > 0
          ? tests.map((item) => <Tag key={item}>{item}</Tag>)
          : <span style={{ color: '#999' }}>暂无</span>
      ),
    },
  ];

  if (onAddMapping) {
    coverageColumns.push({
      title: '操作',
      key: 'actions',
      width: 110,
      render: (_, record) => {
        if (record.is_covered) {
          return null;
        }

        const isSaved = isCodeMappingEntryMatched(existingMappings, record.method);

        if (isSaved) {
          return (
            <Button type="link" size="small" disabled>
              已保存
            </Button>
          );
        }

        return (
          <Button type="link" size="small" onClick={() => onAddMapping(record)}>
            新增
          </Button>
        );
      },
    });
  }

  return (
    <div className="analysis-result-stack">
      <Card title="代码改动分析" variant="borderless">
        <div className="analysis-metric-grid">
          <div className="analysis-metric-card">
            <span className="analysis-metric-card__label">变更文件数</span>
            <span className="analysis-metric-card__value">{diffAnalysis.total_files}</span>
          </div>
          <div className="analysis-metric-card analysis-metric-card--positive">
            <span className="analysis-metric-card__label">新增行</span>
            <span className="analysis-metric-card__value analysis-metric-card__value--positive">
              +{diffAnalysis.total_added}
            </span>
          </div>
          <div className="analysis-metric-card analysis-metric-card--negative">
            <span className="analysis-metric-card__label">删除行</span>
            <span className="analysis-metric-card__value analysis-metric-card__value--negative">
              -{diffAnalysis.total_removed}
            </span>
          </div>
        </div>

        <Table
          dataSource={diffAnalysis.files}
          columns={diffColumns}
          rowKey="package"
          pagination={false}
          size="middle"
          rowClassName="glass-table-row"
          scroll={{ y: 300 }}
        />
      </Card>

      <Card title="测试覆盖分析" variant="borderless">
        <Row gutter={[20, 20]} align="middle" style={{ marginBottom: 24 }}>
          <Col xs={24} xl={16}>
            <div className="analysis-metric-grid analysis-metric-grid--compact">
              <div className="analysis-metric-card">
                <span className="analysis-metric-card__label">改动方法数</span>
                <span className="analysis-metric-card__value">{coverage.total_changed_methods}</span>
              </div>
              <div className="analysis-metric-card analysis-metric-card--positive">
                <span className="analysis-metric-card__label">已覆盖</span>
                <span className="analysis-metric-card__value analysis-metric-card__value--positive">
                  {coverage.covered.length}
                </span>
              </div>
              <div className="analysis-metric-card analysis-metric-card--negative">
                <span className="analysis-metric-card__label">未覆盖</span>
                <span className="analysis-metric-card__value analysis-metric-card__value--negative">
                  {coverage.uncovered.length}
                </span>
              </div>
            </div>
          </Col>
          <Col xs={24} xl={8}>
            <div className="analysis-progress-card">
              <Progress
                type="circle"
                percent={coveragePercent}
                size={118}
                strokeColor={{ '0%': '#2A6DF4', '100%': '#60A5FA' }}
                railColor="rgba(148, 163, 184, 0.14)"
                strokeWidth={10}
                format={(percent) => (
                  <div style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, color: '#1E293B' }}>{percent}%</span>
                    <span style={{ fontSize: 12, color: '#64748B' }}>覆盖率</span>
                  </div>
                )}
              />
            </div>
          </Col>
        </Row>

        <Table
          dataSource={coverage.details}
          columns={coverageColumns}
          rowKey="method"
          pagination={{ pageSize: 5 }}
          size="middle"
          rowClassName="glass-table-row"
        />
      </Card>
    </div>
  );
};

export default AnalysisResult;

import React, { useMemo } from 'react';
import { Card, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { TableColumnsType } from 'antd';
import type { AnalysisPreviewCellValue, AnalysisPreviewRow } from '../../types';

const { Text } = Typography;
const DUPLICATE_SEQUENCE_COLUMNS = new Set(['序号', '行号', '序列号']);

function isIdentifierColumn(columnKey: string): boolean {
  return columnKey.includes('ID') || columnKey.includes('编号');
}

function isDuplicateSequenceColumn(columnKey: string): boolean {
  const normalizedColumnKey = columnKey.replace(/\s+/g, '');
  return DUPLICATE_SEQUENCE_COLUMNS.has(normalizedColumnKey);
}

function isVerboseColumn(columnKey: string): boolean {
  return (
    columnKey.includes('摘要')
    || columnKey.includes('原因')
    || columnKey.includes('描述')
    || columnKey.includes('举措')
    || columnKey.includes('影响')
    || columnKey.includes('总结')
  );
}

function getColumnWidth(columnKey: string): number {
  if (columnKey === 'row_id') {
    return 80;
  }

  if (isIdentifierColumn(columnKey)) {
    return 220;
  }

  if (columnKey.includes('时间') || columnKey.includes('日期')) {
    return 180;
  }

  if (columnKey.includes('标签')) {
    return 220;
  }

  if (columnKey.includes('是否')) {
    return 140;
  }

  if (isVerboseColumn(columnKey)) {
    return 320;
  }

  return 180;
}

function getHumanFactorTagColor(value: string): 'error' | 'success' | 'warning' {
  if (value === '人为原因') {
    return 'error';
  }

  if (value === '非人为原因') {
    return 'success';
  }

  return 'warning';
}

function renderPreviewCell(columnKey: string, value: AnalysisPreviewCellValue) {
  if (Array.isArray(value)) {
    const items = value.filter((item) => String(item).trim());

    if (items.length === 0) {
      return '-';
    }

    return (
      <Space wrap size={[6, 6]}>
        {items.map((item, index) => (
          <Tag key={`${item}-${index}`} color="processing">
            {item}
          </Tag>
        ))}
      </Space>
    );
  }

  const text = value === null || value === undefined || value === '' ? '-' : String(value);

  if (columnKey === '是否人为原因') {
    return <Tag color={getHumanFactorTagColor(text)}>{text}</Tag>;
  }

  const cellClassName = [
    'import-preview-table__cell',
    isIdentifierColumn(columnKey) ? 'import-preview-table__cell--identifier' : '',
    isVerboseColumn(columnKey) ? 'import-preview-table__cell--clamped' : 'import-preview-table__cell--multiline',
  ].filter(Boolean).join(' ');

  return (
    <Tooltip title={text} placement="topLeft">
      <div className={cellClassName}>{text}</div>
    </Tooltip>
  );
}

function buildPreviewColumns(rows: AnalysisPreviewRow[]): TableColumnsType<AnalysisPreviewRow> {
  const firstRow = rows[0];
  if (!firstRow) {
    return [];
  }

  const fieldKeys = Object.keys(firstRow).filter((key) => key !== 'row_id' && !isDuplicateSequenceColumn(key));

  return [
    {
      title: '序号',
      dataIndex: 'row_id',
      key: 'row_id',
      width: getColumnWidth('row_id'),
    },
    ...fieldKeys.map((columnKey) => ({
      title: columnKey,
      dataIndex: columnKey,
      key: columnKey,
      width: getColumnWidth(columnKey),
      render: (value: AnalysisPreviewCellValue) => renderPreviewCell(columnKey, value),
    })),
  ];
}

interface ImportPreviewTableProps {
  rows: AnalysisPreviewRow[];
  title?: React.ReactNode;
  extra?: React.ReactNode;
  className?: string;
}

const ImportPreviewTable: React.FC<ImportPreviewTableProps> = ({
  rows,
  title = '导入明细预览',
  extra,
  className,
}) => {
  const columns = useMemo(() => buildPreviewColumns(rows), [rows]);

  return (
    <Card
      title={title}
      variant="borderless"
      extra={extra ?? <Text type="secondary">共 {rows.length} 条</Text>}
      className={['import-preview-table', className].filter(Boolean).join(' ')}
    >
      <Table<AnalysisPreviewRow>
        rowKey="row_id"
        dataSource={rows}
        columns={columns}
        size="middle"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          pageSizeOptions: [10, 20, 50],
        }}
        rowClassName="glass-table-row"
        sticky={{ offsetHeader: 12 }}
        scroll={{ x: 'max-content' }}
      />
    </Card>
  );
};

export default ImportPreviewTable;

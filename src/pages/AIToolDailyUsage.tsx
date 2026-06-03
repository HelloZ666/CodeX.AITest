import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChartOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FireOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { Card, DatePicker, Empty, Progress, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { EChartsOption } from 'echarts';
import dayjs, { Dayjs } from 'dayjs';
import ChartSurface from '../components/Charts/ChartSurface';
import type { AIToolDailyUsageRecord } from '../types';
import { listAIToolDailyUsage } from '../utils/api';

const { RangePicker } = DatePicker;
const { Text } = Typography;

type DateRangeValue = [Dayjs | null, Dayjs | null] | null;

interface ToolUsageSummary {
  toolName: string;
  callCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
}

function formatCount(value: number | undefined): string {
  return Number(value ?? 0).toLocaleString('zh-CN');
}

function formatRate(value: number): string {
  return `${value.toFixed(1)}%`;
}

function buildChartTooltip(): EChartsOption['tooltip'] {
  return {
    trigger: 'axis',
    backgroundColor: 'rgba(15, 23, 42, 0.92)',
    borderWidth: 0,
    textStyle: { color: '#fff' },
    padding: [10, 12],
    axisPointer: {
      type: 'shadow',
      shadowStyle: { color: 'rgba(42, 109, 244, 0.08)' },
      lineStyle: { color: 'rgba(42, 109, 244, 0.28)' },
    },
  };
}

function compactDateLabel(value: string): string {
  const date = dayjs(value);
  return date.isValid() ? date.format('MM/DD') : value;
}

const AIToolDailyUsagePage: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRangeValue>([
    dayjs().subtract(29, 'day'),
    dayjs(),
  ]);

  const queryParams = useMemo(() => ({
    start_date: dateRange?.[0]?.format('YYYY-MM-DD'),
    end_date: dateRange?.[1]?.format('YYYY-MM-DD'),
  }), [dateRange]);

  const { data = [], isLoading } = useQuery({
    queryKey: ['ai-tool-daily-usage', queryParams],
    queryFn: () => listAIToolDailyUsage(queryParams),
  });

  const {
    dateRows,
    toolRows,
    summary,
    peakDay,
    chartRefreshKey,
  } = useMemo(() => {
    const byDate = new Map<string, { callCount: number; successCount: number; failureCount: number }>();
    const byTool = new Map<string, ToolUsageSummary>();

    data.forEach((item) => {
      const dateItem = byDate.get(item.date) ?? { callCount: 0, successCount: 0, failureCount: 0 };
      dateItem.callCount += item.call_count;
      dateItem.successCount += item.success_count;
      dateItem.failureCount += item.failure_count;
      byDate.set(item.date, dateItem);

      const toolItem = byTool.get(item.tool_name) ?? {
        toolName: item.tool_name,
        callCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
      };
      toolItem.callCount += item.call_count;
      toolItem.successCount += item.success_count;
      toolItem.failureCount += item.failure_count;
      byTool.set(item.tool_name, toolItem);
    });

    const normalizedToolRows = Array.from(byTool.values())
      .map((item) => ({
        ...item,
        successRate: item.callCount > 0 ? (item.successCount / item.callCount) * 100 : 0,
      }))
      .sort((left, right) => right.callCount - left.callCount);

    const normalizedDateRows = Array.from(byDate.entries())
      .map(([date, item]) => ({
        date,
        ...item,
        successRate: item.callCount > 0 ? (item.successCount / item.callCount) * 100 : 0,
      }))
      .sort((left, right) => left.date.localeCompare(right.date));

    const totals = normalizedToolRows.reduce(
      (acc, item) => ({
        callCount: acc.callCount + item.callCount,
        successCount: acc.successCount + item.successCount,
        failureCount: acc.failureCount + item.failureCount,
      }),
      { callCount: 0, successCount: 0, failureCount: 0 },
    );

    const topDate = [...normalizedDateRows].sort((left, right) => right.callCount - left.callCount)[0];

    return {
      dateRows: normalizedDateRows,
      toolRows: normalizedToolRows,
      summary: {
        ...totals,
        successRate: totals.callCount > 0 ? (totals.successCount / totals.callCount) * 100 : 0,
        activeToolCount: normalizedToolRows.length,
        activeDayCount: normalizedDateRows.length,
      },
      peakDay: topDate,
      chartRefreshKey: data.map((item) => `${item.date}:${item.tool_name}:${item.call_count}:${item.failure_count}`).join('|'),
    };
  }, [data]);

  const trendOption = useMemo<EChartsOption>(() => ({
    animationDuration: 680,
    tooltip: buildChartTooltip(),
    legend: {
      top: 0,
      right: 8,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#64748b' },
      data: ['调用量', '失败量'],
    },
    grid: { top: 52, left: 12, right: 18, bottom: 26, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dateRows.map((item) => compactDateLabel(item.date)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.26)' } },
      axisLabel: { color: '#64748b' },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#64748b' },
      splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.14)', type: 'dashed' } },
    },
    series: [
      {
        name: '调用量',
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: dateRows.map((item) => item.callCount),
        lineStyle: { width: 4, color: '#2563eb' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(37, 99, 235, 0.26)' },
              { offset: 1, color: 'rgba(37, 99, 235, 0.02)' },
            ],
          },
        },
      },
      {
        name: '失败量',
        type: 'bar',
        data: dateRows.map((item) => item.failureCount),
        barMaxWidth: 16,
        itemStyle: { color: '#ef4444', borderRadius: [8, 8, 0, 0] },
      },
    ],
  }), [dateRows]);

  const rankingOption = useMemo<EChartsOption>(() => {
    const ranked = [...toolRows].sort((left, right) => left.callCount - right.callCount);
    return {
      animationDuration: 680,
      tooltip: { ...buildChartTooltip(), trigger: 'axis' },
      grid: { top: 18, left: 12, right: 28, bottom: 14, containLabel: true },
      xAxis: {
        type: 'value',
        axisLabel: { color: '#64748b' },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.14)', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: ranked.map((item) => item.toolName),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: '#334155', fontWeight: 600 },
      },
      series: [{
        name: '调用量',
        type: 'bar',
        data: ranked.map((item) => item.callCount),
        barMaxWidth: 18,
        label: { show: true, position: 'right', color: '#1e293b', fontWeight: 700 },
        itemStyle: {
          borderRadius: [0, 10, 10, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 1,
            y2: 0,
            colorStops: [
              { offset: 0, color: '#60a5fa' },
              { offset: 1, color: '#2563eb' },
            ],
          },
        },
      }],
    };
  }, [toolRows]);

  const failureOption = useMemo<EChartsOption>(() => ({
    animationDuration: 680,
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff' },
    },
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#64748b' },
    },
    series: [{
      name: '失败量',
      type: 'pie',
      radius: ['48%', '72%'],
      center: ['50%', '42%'],
      avoidLabelOverlap: true,
      itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 8 },
      label: { color: '#334155', formatter: '{b}\n{c}' },
      data: toolRows
        .filter((item) => item.failureCount > 0)
        .map((item, index) => ({
          name: item.toolName,
          value: item.failureCount,
          itemStyle: { color: ['#ef4444', '#f97316', '#f59e0b', '#64748b'][index % 4] },
        })),
    }],
  }), [toolRows]);

  const successRateOption = useMemo<EChartsOption>(() => {
    const ranked = [...toolRows].sort((left, right) => left.successRate - right.successRate);
    return {
      animationDuration: 680,
      tooltip: {
        ...buildChartTooltip(),
        valueFormatter: (value) => `${Number(value).toFixed(1)}%`,
      },
      grid: { top: 18, left: 12, right: 30, bottom: 18, containLabel: true },
      xAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: '#64748b', formatter: '{value}%' },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.14)', type: 'dashed' } },
      },
      yAxis: {
        type: 'category',
        data: ranked.map((item) => item.toolName),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: { color: '#334155', fontWeight: 600 },
      },
      series: [{
        name: '成功率',
        type: 'bar',
        data: ranked.map((item) => Number(item.successRate.toFixed(1))),
        barMaxWidth: 16,
        label: { show: true, position: 'right', formatter: '{c}%', color: '#1e293b', fontWeight: 700 },
        itemStyle: {
          borderRadius: [0, 10, 10, 0],
          color: '#0ea5e9',
        },
      }],
    };
  }, [toolRows]);

  const columns: ColumnsType<AIToolDailyUsageRecord> = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 140,
      sorter: (left, right) => left.date.localeCompare(right.date),
      defaultSortOrder: 'descend',
    },
    {
      title: '工具',
      dataIndex: 'tool_name',
      key: 'tool_name',
      width: 180,
      filters: toolRows.map((item) => ({ text: item.toolName, value: item.toolName })),
      onFilter: (value, record) => record.tool_name === value,
      render: (value: string) => <Tag className="ai-usage-tool-tag">{value}</Tag>,
    },
    {
      title: '调用量',
      dataIndex: 'call_count',
      key: 'call_count',
      width: 120,
      sorter: (left, right) => left.call_count - right.call_count,
      render: (value: number) => <Text strong>{formatCount(value)}</Text>,
    },
    {
      title: '成功',
      dataIndex: 'success_count',
      key: 'success_count',
      width: 120,
      sorter: (left, right) => left.success_count - right.success_count,
      render: (value: number) => <Text className="ai-usage-positive">{formatCount(value)}</Text>,
    },
    {
      title: '失败',
      dataIndex: 'failure_count',
      key: 'failure_count',
      width: 120,
      sorter: (left, right) => left.failure_count - right.failure_count,
      render: (value: number) => (
        <Text className={value > 0 ? 'ai-usage-negative' : ''}>{formatCount(value)}</Text>
      ),
    },
  ];

  const hasFailureData = toolRows.some((item) => item.failureCount > 0);

  return (
    <div className="ai-usage-page">
      <section className="ai-usage-hero">
        <div>
          <div className="ai-usage-eyebrow">
            <BarChartOutlined />
            <span>AI辅助工具</span>
          </div>
          <h1>工具日活看板</h1>
          <p>按日追踪每个 AI 工具的调用量、排行、成功率与失败风险。</p>
        </div>
        <div className="ai-usage-filter">
          <span>统计周期</span>
          <RangePicker
            value={dateRange}
            onChange={setDateRange}
            allowClear
            format="YYYY-MM-DD"
            presets={[
              { label: '最近7天', value: [dayjs().subtract(6, 'day'), dayjs()] },
              { label: '最近30天', value: [dayjs().subtract(29, 'day'), dayjs()] },
              { label: '最近90天', value: [dayjs().subtract(89, 'day'), dayjs()] },
            ]}
          />
        </div>
      </section>

      <section className="ai-usage-metrics">
        <div className="ai-usage-metric ai-usage-metric--primary">
          <FireOutlined />
          <span>总调用量</span>
          <strong>{formatCount(summary.callCount)}</strong>
        </div>
        <div className="ai-usage-metric">
          <CheckCircleOutlined />
          <span>成功率</span>
          <strong>{formatRate(summary.successRate)}</strong>
        </div>
        <div className="ai-usage-metric">
          <ExclamationCircleOutlined />
          <span>失败调用</span>
          <strong>{formatCount(summary.failureCount)}</strong>
        </div>
        <div className="ai-usage-metric">
          <ClockCircleOutlined />
          <span>活跃天数</span>
          <strong>{formatCount(summary.activeDayCount)}</strong>
        </div>
        <div className="ai-usage-metric">
          <TrophyOutlined />
          <span>峰值日</span>
          <strong>{peakDay ? `${compactDateLabel(peakDay.date)} · ${formatCount(peakDay.callCount)}` : '--'}</strong>
        </div>
      </section>

      <section className="ai-usage-chart-grid">
        <Card variant="borderless" className="ai-usage-panel ai-usage-panel--wide">
          <div className="ai-usage-panel__header">
            <div>
              <AreaChartOutlined />
              <span>调用趋势</span>
            </div>
            <Text type="secondary">每日总调用与失败量</Text>
          </div>
          {dateRows.length > 0 ? (
            <ChartSurface option={trendOption} height={330} refreshKey={chartRefreshKey} />
          ) : (
            <Empty className="ai-usage-empty" description="暂无趋势数据" />
          )}
        </Card>

        <Card variant="borderless" className="ai-usage-panel">
          <div className="ai-usage-panel__header">
            <div>
              <TrophyOutlined />
              <span>调用量排行</span>
            </div>
            <Text type="secondary">按工具汇总</Text>
          </div>
          {toolRows.length > 0 ? (
            <ChartSurface option={rankingOption} height={330} refreshKey={chartRefreshKey} />
          ) : (
            <Empty className="ai-usage-empty" description="暂无排行数据" />
          )}
        </Card>

        <Card variant="borderless" className="ai-usage-panel">
          <div className="ai-usage-panel__header">
            <div>
              <CheckCircleOutlined />
              <span>成功率排行</span>
            </div>
            <Text type="secondary">低成功率优先排查</Text>
          </div>
          {toolRows.length > 0 ? (
            <ChartSurface option={successRateOption} height={330} refreshKey={chartRefreshKey} />
          ) : (
            <Empty className="ai-usage-empty" description="暂无成功率数据" />
          )}
        </Card>

        <Card variant="borderless" className="ai-usage-panel">
          <div className="ai-usage-panel__header">
            <div>
              <ExclamationCircleOutlined />
              <span>失败分布</span>
            </div>
            <Text type="secondary">按工具拆分失败调用</Text>
          </div>
          {hasFailureData ? (
            <ChartSurface option={failureOption} height={330} refreshKey={chartRefreshKey} />
          ) : (
            <Empty className="ai-usage-empty" description="暂无失败调用" />
          )}
        </Card>

        <Card variant="borderless" className="ai-usage-panel ai-usage-tool-list">
          <div className="ai-usage-panel__header">
            <div>
              <BarChartOutlined />
              <span>工具概览</span>
            </div>
            <Text type="secondary">{summary.activeToolCount} 个活跃工具</Text>
          </div>
          <div className="ai-usage-tool-stack">
            {toolRows.length > 0 ? toolRows.map((item) => (
              <div className="ai-usage-tool-row" key={item.toolName}>
                <div className="ai-usage-tool-row__title">
                  <span>{item.toolName}</span>
                  <strong>{formatCount(item.callCount)}</strong>
                </div>
                <Progress
                  percent={Number(item.successRate.toFixed(1))}
                  size="small"
                  status={item.failureCount > 0 ? 'active' : 'success'}
                  strokeColor={item.failureCount > 0 ? '#2563eb' : '#0ea5e9'}
                />
                <div className="ai-usage-tool-row__meta">
                  <span>成功 {formatCount(item.successCount)}</span>
                  <span>失败 {formatCount(item.failureCount)}</span>
                </div>
              </div>
            )) : <Empty className="ai-usage-empty" description="暂无工具数据" />}
          </div>
        </Card>
      </section>

      <Card variant="borderless" className="ai-usage-panel ai-usage-table-panel">
        <div className="ai-usage-panel__header">
          <div>
            <ClockCircleOutlined />
            <span>每日明细</span>
          </div>
          <Text type="secondary">按日期和工具展开</Text>
        </div>
        <Table
          rowKey={(record) => `${record.date}-${record.tool_name}`}
          loading={isLoading}
          dataSource={data}
          columns={columns}
          scroll={{ x: 720 }}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          locale={{ emptyText: '暂无AI工具调用统计' }}
        />
      </Card>
    </div>
  );
};

export default AIToolDailyUsagePage;

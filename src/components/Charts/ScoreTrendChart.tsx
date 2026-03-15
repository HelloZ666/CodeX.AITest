import React from 'react';
import { Card, Empty } from 'antd';
import type { EChartsOption } from 'echarts';
import type { AnalysisRecordSummary } from '../../types';
import ChartSurface from './ChartSurface';

interface ScoreTrendChartProps {
  records: AnalysisRecordSummary[];
  title?: string;
}

const ScoreTrendChart: React.FC<ScoreTrendChartProps> = ({
  records,
  title = '评分趋势',
}) => {
  if (!records || records.length === 0) {
    const emptyNode = (
      <div className="dashboard-empty">
        <Empty description="暂无数据" />
      </div>
    );

    return title ? <Card title={title} variant="borderless">{emptyNode}</Card> : emptyNode;
  }

  const sorted = [...records].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const dates = sorted.map((record) => (
    new Date(record.created_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  ));
  const scores = sorted.map((record) => record.test_score);
  const tokens = sorted.map((record) => record.token_usage);
  const refreshKey = `${dates.join('|')}-${scores.join('|')}-${tokens.join('|')}`;

  const option: EChartsOption = {
    animationDuration: 760,
    animationDurationUpdate: 420,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicInOut',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(30, 41, 59, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff' },
      padding: [10, 12],
      axisPointer: {
        type: 'cross',
        lineStyle: { color: 'rgba(42, 109, 244, 0.24)' },
        label: { backgroundColor: '#2A6DF4' },
      },
    },
    legend: {
      top: 0,
      itemWidth: 12,
      itemHeight: 12,
      icon: 'roundRect',
      textStyle: { color: '#64748B' },
      data: ['评分', 'Token 消耗'],
    },
    grid: {
      top: 58,
      left: 22,
      right: 22,
      bottom: 40,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: dates,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.24)' } },
      axisLabel: { color: '#64748B' },
    },
    yAxis: [
      {
        type: 'value',
        name: '评分',
        min: 0,
        max: 100,
        nameTextStyle: { color: '#64748B' },
        axisLabel: { color: '#64748B' },
        splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.12)', type: 'dashed' } },
      },
      {
        type: 'value',
        name: 'Token',
        nameTextStyle: { color: '#64748B' },
        axisLabel: { color: '#64748B' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '评分',
        type: 'line',
        smooth: true,
        showSymbol: true,
        symbol: 'circle',
        symbolSize: 10,
        universalTransition: true,
        data: scores,
        lineStyle: { width: 4, color: '#2A6DF4' },
        itemStyle: { color: '#2A6DF4', borderColor: '#fff', borderWidth: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(42, 109, 244, 0.24)' },
              { offset: 1, color: 'rgba(42, 109, 244, 0.04)' },
            ],
          },
        },
        markLine: {
          silent: true,
          symbol: 'none',
          label: { color: '#64748B' },
          lineStyle: { type: 'dashed', color: 'rgba(42, 109, 244, 0.24)' },
          data: [{ type: 'average', name: '平均' }],
        },
      },
      {
        name: 'Token 消耗',
        type: 'bar',
        yAxisIndex: 1,
        universalTransition: true,
        data: tokens,
        barMaxWidth: 18,
        itemStyle: {
          color: '#94A3B8',
          opacity: 0.72,
          borderRadius: [10, 10, 0, 0],
        },
      },
    ],
  };

  const chartNode = <ChartSurface option={option} height={350} refreshKey={refreshKey} />;
  return title ? <Card title={title} variant="borderless">{chartNode}</Card> : chartNode;
};

export default ScoreTrendChart;

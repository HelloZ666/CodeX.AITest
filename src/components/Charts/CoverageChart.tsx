import React from 'react';
import { Card, Empty } from 'antd';
import type { EChartsOption } from 'echarts';
import ChartSurface from './ChartSurface';

interface CoverageChartProps {
  covered: number;
  uncovered: number;
  title?: string;
}

const CoverageChart: React.FC<CoverageChartProps> = ({
  covered,
  uncovered,
  title = '覆盖率分布',
}) => {
  const total = covered + uncovered;

  if (total === 0) {
    const emptyNode = (
      <div className="dashboard-empty">
        <Empty description="暂无数据" />
      </div>
    );

    return title ? <Card title={title} variant="borderless">{emptyNode}</Card> : emptyNode;
  }

  const coveredRate = Math.round((covered / total) * 100);
  const refreshKey = `${covered}-${uncovered}`;

  const option: EChartsOption = {
    animationDuration: 760,
    animationDurationUpdate: 420,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicInOut',
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
      backgroundColor: 'rgba(30, 41, 59, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff' },
      padding: [10, 12],
    },
    legend: {
      bottom: 0,
      icon: 'roundRect',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#64748B' },
      data: ['已覆盖', '未覆盖'],
    },
    graphic: [
      {
        type: 'text',
        left: 'center',
        top: '36%',
        style: {
          text: `${coveredRate}%`,
          fill: '#1E293B',
          fontSize: 28,
          fontWeight: 700,
        },
      },
      {
        type: 'text',
        left: 'center',
        top: '50%',
        style: {
          text: '覆盖率',
          fill: '#64748B',
          fontSize: 12,
          fontWeight: 600,
        },
      },
    ],
    series: [
      {
        type: 'pie',
        radius: ['54%', '76%'],
        center: ['50%', '40%'],
        startAngle: 208,
        avoidLabelOverlap: true,
        universalTransition: true,
        itemStyle: {
          borderRadius: 12,
          borderColor: '#fff',
          borderWidth: 3,
        },
        label: {
          show: true,
          color: '#334155',
          formatter: '{b}\n{d}%',
        },
        data: [
          { value: covered, name: '已覆盖', itemStyle: { color: '#2A6DF4' } },
          { value: uncovered, name: '未覆盖', itemStyle: { color: '#94A3B8' } },
        ],
      },
    ],
  };

  const chartNode = <ChartSurface option={option} height={300} refreshKey={refreshKey} />;
  return title ? <Card title={title} variant="borderless">{chartNode}</Card> : chartNode;
};

export default CoverageChart;

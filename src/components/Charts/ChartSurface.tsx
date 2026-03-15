import React, { useEffect, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface ChartSurfaceProps {
  option: EChartsOption;
  height?: number;
  refreshKey?: string | number;
  className?: string;
}

const ChartSurface: React.FC<ChartSurfaceProps> = ({
  option,
  height = 320,
  refreshKey,
  className,
}) => {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return undefined;
    }

    setIsRefreshing(true);
    const timer = window.setTimeout(() => {
      setIsRefreshing(false);
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [refreshKey]);

  return (
    <div
      className={[
        'chart-surface',
        isRefreshing ? 'chart-surface--refresh' : '',
        className ?? '',
      ].join(' ').trim()}
    >
      <ReactECharts option={option} style={{ height }} notMerge lazyUpdate />
    </div>
  );
};

export default ChartSurface;

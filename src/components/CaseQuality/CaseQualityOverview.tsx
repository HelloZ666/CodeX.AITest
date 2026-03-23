import React from 'react';

interface CaseQualityOverviewProps {
  caseScore?: number | null;
  caseCount?: number | null;
  totalChangedMethods?: number | null;
  coveredCount?: number | null;
  uncoveredCount?: number | null;
  mappingHitCount?: number | null;
  coverageRate?: number | null;
}

type MetricTone = 'score' | 'primary' | 'success' | 'muted' | 'info';

interface MetricItem {
  label: string;
  value: string;
  tone: MetricTone;
}

function isValidNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatInteger(value: number | null | undefined): string {
  return isValidNumber(value) ? `${Math.round(value)}` : '--';
}

function formatScore(value: number | null | undefined): string {
  return isValidNumber(value) ? value.toFixed(1) : '--';
}

function normalizeCoverageRate(value: number | null | undefined): number | null {
  if (!isValidNumber(value)) {
    return null;
  }

  if (value <= 1) {
    return Math.max(0, Math.min(value, 1));
  }

  return Math.max(0, Math.min(value / 100, 1));
}

function formatCoverageRate(value: number | null | undefined): string {
  const normalized = normalizeCoverageRate(value);
  if (normalized === null) {
    return '--';
  }

  const percentage = normalized * 100;
  const hasDecimal = Math.abs(percentage - Math.round(percentage)) >= 0.05;
  return `${hasDecimal ? percentage.toFixed(1) : percentage.toFixed(0)}%`;
}

const CaseQualityOverview: React.FC<CaseQualityOverviewProps> = ({
  caseScore,
  caseCount,
  totalChangedMethods,
  coveredCount,
  uncoveredCount,
  mappingHitCount,
  coverageRate,
}) => {
  const normalizedCoverageRate = normalizeCoverageRate(coverageRate);
  const coverageDegree = normalizedCoverageRate === null ? 0 : normalizedCoverageRate * 360;
  const coverageText = formatCoverageRate(coverageRate);

  const metrics: MetricItem[] = [
    { label: '案例得分', value: formatScore(caseScore), tone: 'score' },
    { label: '案例数', value: formatInteger(caseCount), tone: 'primary' },
    { label: '映射命中数', value: formatInteger(mappingHitCount), tone: 'info' },
    { label: '改动方法', value: formatInteger(totalChangedMethods), tone: 'primary' },
    { label: '已覆盖', value: formatInteger(coveredCount), tone: 'success' },
    { label: '未覆盖', value: formatInteger(uncoveredCount), tone: 'muted' },
  ];

  return (
    <section className="case-quality-overview" aria-label="汇总报告指标">
      <div className="case-quality-overview__metrics">
        {metrics.map((item) => (
          <article
            key={item.label}
            className="case-quality-overview__metric-card"
            data-tone={item.tone}
          >
            <span className="case-quality-overview__metric-label">{item.label}</span>
            <strong className="case-quality-overview__metric-value">{item.value}</strong>
          </article>
        ))}
      </div>

      <aside className="case-quality-overview__coverage-card">
        <div
          className="case-quality-overview__coverage-ring"
          style={{
            background: `conic-gradient(#2f6fed 0deg, #2f6fed ${coverageDegree}deg, rgba(148, 163, 184, 0.16) ${coverageDegree}deg, rgba(148, 163, 184, 0.16) 360deg)`,
          }}
          aria-hidden="true"
        >
          <div className="case-quality-overview__coverage-inner">
            <strong>{coverageText}</strong>
            <span>覆盖率</span>
          </div>
        </div>
      </aside>
    </section>
  );
};

export default CaseQualityOverview;

import React from 'react';

type InsightMetricTone = 'accent' | 'slate' | 'ice';

interface InsightMetricCardProps {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  suffix?: React.ReactNode;
  detail?: React.ReactNode;
  tone?: InsightMetricTone;
  className?: string;
}

const InsightMetricCard: React.FC<InsightMetricCardProps> = ({
  icon,
  label,
  value,
  suffix,
  detail,
  tone = 'accent',
  className,
}) => (
  <section className={`insight-metric-card insight-metric-card--${tone}${className ? ` ${className}` : ''}`}>
    <div className="insight-metric-card__icon" aria-hidden="true">
      {icon}
    </div>
    <div className="insight-metric-card__content">
      <span className="insight-metric-card__label">{label}</span>
      <div className="insight-metric-card__value-line">
        <strong className="insight-metric-card__value">{value}</strong>
        {suffix ? <span className="insight-metric-card__suffix">{suffix}</span> : null}
      </div>
      {detail ? <span className="insight-metric-card__detail">{detail}</span> : null}
    </div>
  </section>
);

export default InsightMetricCard;

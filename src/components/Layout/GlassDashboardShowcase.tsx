import React from 'react';

type DashboardShowcaseChipTone = 'neutral' | 'accent' | 'slate';

interface DashboardShowcaseChip {
  label: React.ReactNode;
  tone?: DashboardShowcaseChipTone;
}

interface DashboardShowcaseStat {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
}

interface DashboardShowcaseSpotlightStat {
  label: React.ReactNode;
  value: React.ReactNode;
  note?: React.ReactNode;
}

interface GlassDashboardShowcaseProps {
  className?: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  toolbar?: React.ReactNode;
  chips?: DashboardShowcaseChip[];
  heroStats?: DashboardShowcaseStat[];
  mainExtra?: React.ReactNode;
  spotlightEyebrow: React.ReactNode;
  spotlightValue: React.ReactNode;
  spotlightUnit?: React.ReactNode;
  spotlightCaption: React.ReactNode;
  spotlightProgress?: number;
  spotlightTitle?: React.ReactNode;
  spotlightStats?: DashboardShowcaseSpotlightStat[];
  footer?: React.ReactNode;
}

const GlassDashboardShowcase: React.FC<GlassDashboardShowcaseProps> = ({
  className,
  eyebrow,
  title,
  description,
  toolbar,
  chips = [],
  heroStats = [],
  mainExtra,
  spotlightEyebrow,
  spotlightValue,
  spotlightUnit,
  spotlightCaption,
  spotlightProgress = 0,
  spotlightTitle,
  spotlightStats = [],
  footer,
}) => {
  const progress = Math.max(0, Math.min(1, spotlightProgress));

  return (
    <section className={`glass-dashboard-showcase${className ? ` ${className}` : ''}`}>
      {toolbar ? <div className="glass-dashboard-showcase__toolbar">{toolbar}</div> : null}

      <div className="glass-dashboard-showcase__main">
        {eyebrow ? <span className="glass-dashboard-showcase__eyebrow">{eyebrow}</span> : null}
        <h1 className="glass-dashboard-showcase__title">{title}</h1>
        {description ? <p className="glass-dashboard-showcase__description">{description}</p> : null}

        {chips.length > 0 ? (
          <div className="glass-dashboard-showcase__chip-row">
            {chips.map((chip, index) => (
              <span
                key={`${index}-${String(chip.label)}`}
                className={`glass-dashboard-showcase__chip glass-dashboard-showcase__chip--${chip.tone ?? 'neutral'}`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}

        {heroStats.length > 0 ? (
          <div className="glass-dashboard-showcase__stats">
            {heroStats.map((stat, index) => (
              <div key={`${index}-${String(stat.label)}`} className="glass-dashboard-showcase__stat">
                <span className="glass-dashboard-showcase__stat-label">{stat.label}</span>
                <strong className="glass-dashboard-showcase__stat-value">{stat.value}</strong>
                {stat.note ? <span className="glass-dashboard-showcase__stat-note">{stat.note}</span> : null}
              </div>
            ))}
          </div>
        ) : null}

        {mainExtra ? <div className="glass-dashboard-showcase__main-extra">{mainExtra}</div> : null}
      </div>

      <aside className="glass-dashboard-showcase__spotlight">
        <div className="glass-dashboard-showcase__spotlight-top">
          <span className="glass-dashboard-showcase__spotlight-eyebrow">{spotlightEyebrow}</span>
          {spotlightTitle ? <span className="glass-dashboard-showcase__spotlight-time">{spotlightTitle}</span> : null}
        </div>

        <div
          className="glass-dashboard-showcase__ring"
          style={{ '--dashboard-progress': `${progress * 360}deg` } as React.CSSProperties}
        >
          <div className="glass-dashboard-showcase__ring-inner">
            <div className="glass-dashboard-showcase__ring-value-line">
              <span className="glass-dashboard-showcase__ring-value">{spotlightValue}</span>
              {spotlightUnit ? <span className="glass-dashboard-showcase__ring-unit">{spotlightUnit}</span> : null}
            </div>
            <span className="glass-dashboard-showcase__ring-caption">{spotlightCaption}</span>
          </div>
        </div>

        {spotlightStats.length > 0 ? (
          <div className="glass-dashboard-showcase__spotlight-grid">
            {spotlightStats.map((stat, index) => (
              <div key={`${index}-${String(stat.label)}`} className="glass-dashboard-showcase__spotlight-stat">
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
                {stat.note ? <small>{stat.note}</small> : null}
              </div>
            ))}
          </div>
        ) : null}

        {footer ? <div className="glass-dashboard-showcase__spotlight-footer">{footer}</div> : null}
      </aside>
    </section>
  );
};

export default GlassDashboardShowcase;

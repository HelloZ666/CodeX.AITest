import React from 'react';

type DashboardHeroTone = 'neutral' | 'accent' | 'gold' | 'danger';

interface DashboardHeroChip {
  label: React.ReactNode;
  tone?: DashboardHeroTone;
}

interface DashboardHeroProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  chips?: DashboardHeroChip[];
  actions?: React.ReactNode;
}

const DashboardHero: React.FC<DashboardHeroProps> = ({
  eyebrow,
  title,
  description,
  chips = [],
  actions,
}) => (
  <section className="dashboard-hero">
    <div className="dashboard-hero__content">
      {eyebrow ? <span className="dashboard-hero__eyebrow">{eyebrow}</span> : null}
      <div className="dashboard-hero__title">{title}</div>
      {description ? <div className="dashboard-hero__description">{description}</div> : null}
      {chips.length > 0 ? (
        <div className="dashboard-hero__meta">
          {chips.map((chip, index) => (
            <span
              key={`${String(chip.label)}-${index}`}
              className={`dashboard-chip dashboard-chip--${chip.tone ?? 'neutral'}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
    {actions ? <div className="dashboard-hero__actions">{actions}</div> : null}
  </section>
);

export default DashboardHero;

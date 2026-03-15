import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightOutlined, CheckOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { Button, Tooltip } from 'antd';

export type GlassStepState = 'idle' | 'active' | 'complete' | 'disabled' | 'loading';

interface GlassStatusCheckProps {
  label?: string;
}

interface GlassStepCardProps {
  step: number | string;
  title: string;
  description?: string;
  help?: string;
  state?: GlassStepState;
  statusNode?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

type GlowActionButtonProps = React.ComponentProps<typeof Button>;

export const GlassStatusCheck: React.FC<GlassStatusCheckProps> = ({ label = '已完成' }) => (
  <span className="glass-status-check">
    <span className="glass-status-check__icon">
      <CheckOutlined />
    </span>
    <span>{label}</span>
  </span>
);

export const GlassStepCard: React.FC<GlassStepCardProps> = ({
  step,
  title,
  description,
  help,
  state = 'idle',
  statusNode,
  className,
  children,
}) => (
  <section className={`glass-step-card glass-step-card--${state}${className ? ` ${className}` : ''}`}>
    <div className="glass-step-card__badge">{step}</div>
    <div className="glass-step-card__head">
      <div className="glass-step-card__titleblock">
        <div className="glass-step-card__titleline">
          <h3 className="glass-step-card__title">{title}</h3>
          <div className="glass-step-card__headside">
            {statusNode}
            {help ? (
              <Tooltip title={help}>
                <button type="button" className="glass-step-card__help" aria-label={`${title}帮助说明`}>
                  <InfoCircleOutlined />
                </button>
              </Tooltip>
            ) : null}
          </div>
        </div>
        {description ? <p className="glass-step-card__description">{description}</p> : null}
      </div>
    </div>
    <div className="glass-step-card__body">{children}</div>
  </section>
);

export const GlowActionButton: React.FC<GlowActionButtonProps> = ({
  children,
  className,
  disabled,
  loading,
  onClick,
  ...restProps
}) => {
  const [rippling, setRippling] = useState(false);
  const rippleTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (rippleTimerRef.current !== null) {
      window.clearTimeout(rippleTimerRef.current);
    }
  }, []);

  const handleClick: GlowActionButtonProps['onClick'] = (event) => {
    if (disabled || loading) {
      return;
    }

    if (rippleTimerRef.current !== null) {
      window.clearTimeout(rippleTimerRef.current);
    }

    setRippling(false);

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => {
        setRippling(true);
      });
    } else {
      setRippling(true);
    }

    rippleTimerRef.current = window.setTimeout(() => {
      setRippling(false);
    }, 560);

    onClick?.(event);
  };

  return (
    <Button
      {...restProps}
      disabled={disabled}
      loading={loading}
      onClick={handleClick}
      className={`glass-action-button${className ? ` ${className}` : ''}`}
      data-ripple={rippling ? 'true' : 'false'}
    >
      <span className="glass-action-button__label">{children}</span>
      {!loading && <ArrowRightOutlined className="glass-action-button__arrow" />}
    </Button>
  );
};

import React from 'react';

interface AutofillGuardProps {
  idPrefix: string;
}

const hiddenInputStyle: React.CSSProperties = {
  position: 'absolute',
  left: '-9999px',
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: 'none',
};

const AutofillGuard: React.FC<AutofillGuardProps> = ({ idPrefix }) => (
  <div aria-hidden="true" style={hiddenInputStyle}>
    <input
      tabIndex={-1}
      type="text"
      id={`${idPrefix}-fake-username`}
      name={`${idPrefix}-fake-username`}
      autoComplete="username"
    />
    <input
      tabIndex={-1}
      type="password"
      id={`${idPrefix}-fake-password`}
      name={`${idPrefix}-fake-password`}
      autoComplete="current-password"
    />
  </div>
);

export default AutofillGuard;

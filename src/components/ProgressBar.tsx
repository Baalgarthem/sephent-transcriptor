import React from 'react';
import { THEME_TOKENS } from '../config/themeTokens';

export interface ProgressBarProps {
  progress: number; // 0-100
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const safeProgress = Math.min(100, Math.max(0, progress));
  return (
    <div
      style={{
        width: '100%',
        backgroundColor: THEME_TOKENS.colors.borderSubtle,
        borderRadius: THEME_TOKENS.radii.xs,
        overflow: 'hidden',
        height: '6px',
      }}
    >
      <div
        style={{
          width: `${safeProgress}%`,
          backgroundColor: THEME_TOKENS.colors.surfaceDark,
          height: '100%',
          transition: `width ${THEME_TOKENS.transitions.normal}`,
        }}
      />
    </div>
  );
};

export default ProgressBar;

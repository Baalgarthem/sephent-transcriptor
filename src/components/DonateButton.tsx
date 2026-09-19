import React, { useState } from 'react';
import { THEME_TOKENS } from '../config/themeTokens';

export const DonateButton: React.FC = () => {
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href="https://www.paypal.me/helltrader"
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.6rem 1.25rem',
        backgroundColor: hovered ? THEME_TOKENS.colors.accentTaupeBg : THEME_TOKENS.colors.surfaceBase,
        color: THEME_TOKENS.colors.textPrimary,
        border: `1px solid ${hovered ? THEME_TOKENS.colors.borderFocus : THEME_TOKENS.colors.borderStrong}`,
        borderRadius: THEME_TOKENS.radii.sm,
        textDecoration: 'none',
        fontWeight: 600,
        fontSize: '0.825rem',
        letterSpacing: '0.01em',
        boxShadow: THEME_TOKENS.shadows.sm,
        transition: `all ${THEME_TOKENS.transitions.fast}`,
      }}
    >
      <span style={{ color: THEME_TOKENS.colors.accentTaupe }}>◈</span>
      <span>Apoyar el desarrollo independiente (@helltrader)</span>
    </a>
  );
};

export default DonateButton;

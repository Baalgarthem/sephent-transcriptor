import React, { useState } from 'react';
import { THEME_TOKENS } from '../../config/themeTokens';

interface HoverTooltipProps {
  content?: string | React.ReactNode;
  text?: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  maxWidth?: string;
  delayMs?: number;
}

export const HoverTooltip: React.FC<HoverTooltipProps> = ({
  content,
  text,
  children,
  position = 'top',
  maxWidth = '260px',
  delayMs = 150,
}) => {
  const displayContent = content || text;
  const [visible, setVisible] = useState(false);
  const [timer, setTimer] = useState<any>(null);

  const handleMouseEnter = () => {
    const t = setTimeout(() => setVisible(true), delayMs);
    setTimer(t);
  };

  const handleMouseLeave = () => {
    if (timer) clearTimeout(timer);
    setVisible(false);
  };

  let positionStyle: React.CSSProperties = {};
  switch (position) {
    case 'bottom':
      positionStyle = {
        top: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
      };
      break;
    case 'left':
      positionStyle = {
        top: '50%',
        right: 'calc(100% + 6px)',
        transform: 'translateY(-50%)',
      };
      break;
    case 'right':
      positionStyle = {
        top: '50%',
        left: 'calc(100% + 6px)',
        transform: 'translateY(-50%)',
      };
      break;
    case 'top':
    default:
      positionStyle = {
        bottom: 'calc(100% + 6px)',
        left: '50%',
        transform: 'translateX(-50%)',
      };
      break;
  }

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          style={{
            position: 'absolute',
            zIndex: 9999,
            backgroundColor: '#1E1B18',
            color: '#F4EFEA',
            border: `1px solid ${THEME_TOKENS.colors.accentTaupe}`,
            borderRadius: THEME_TOKENS.radii.xs,
            padding: '0.45rem 0.65rem',
            fontSize: '0.75rem',
            fontFamily: THEME_TOKENS.fonts.sans,
            lineHeight: 1.35,
            textAlign: 'left',
            boxShadow: THEME_TOKENS.shadows.md,
            maxWidth,
            minWidth: '160px',
            pointerEvents: 'none',
            whiteSpace: 'normal',
            animation: 'fadeInTooltip 0.15s ease-out',
            ...positionStyle,
          }}
        >
          {displayContent}
        </div>
      )}
    </div>
  );
};

interface InfoHelpButtonProps {
  title?: string;
  tooltip?: string | React.ReactNode;
  content?: string | React.ReactNode;
  onClick?: () => void;
  size?: 'sm' | 'md';
  variant?: 'onDark' | 'onLight' | 'default';
  symbolColor?: string;
}

export const InfoHelpButton: React.FC<InfoHelpButtonProps> = ({
  title = 'Ayuda / Información',
  tooltip,
  content,
  onClick,
  size = 'sm',
  variant = 'default',
  symbolColor,
}) => {
  const dim = size === 'sm' ? '18px' : '22px';
  const fontSize = size === 'sm' ? '0.725rem' : '0.825rem';
  const resolvedContent = tooltip || content || '';

  const isOnDark = variant === 'onDark';
  const initialBg = isOnDark ? 'rgba(255, 255, 255, 0.12)' : THEME_TOKENS.colors.surfaceBase;
  const initialColor = symbolColor || (isOnDark ? '#FFFFFF' : THEME_TOKENS.colors.textPrimary);
  const initialBorder = isOnDark ? '1px solid rgba(255, 255, 255, 0.45)' : `1px solid ${THEME_TOKENS.colors.borderStrong}`;

  const hoverBg = isOnDark ? '#FFFFFF' : THEME_TOKENS.colors.accentPrimary;
  const hoverColor = isOnDark ? '#121212' : '#FFFFFF';

  return (
    <HoverTooltip content={resolvedContent} position="top">
      <button
        type="button"
        onClick={(e) => {
          if (onClick) {
            e.stopPropagation();
            onClick();
          }
        }}
        title={title}
        aria-label={title}
        style={{
          width: dim,
          height: dim,
          minWidth: dim,
          borderRadius: '50%',
          backgroundColor: initialBg,
          color: initialColor,
          border: initialBorder,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          fontWeight: 800,
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
          transition: `all ${THEME_TOKENS.transitions.fast}`,
          boxShadow: THEME_TOKENS.shadows.xs,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = hoverBg;
          e.currentTarget.style.color = hoverColor;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = initialBg;
          e.currentTarget.style.color = initialColor;
        }}
      >
        ?
      </button>
    </HoverTooltip>
  );
};

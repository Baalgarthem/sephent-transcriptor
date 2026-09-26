/**
 * Constantes y Tokens Centrales del Sistema de Diseño (Lexis & Archive)
 * Permite cambiar la identidad visual desde un único punto en el código.
 */

export const THEME_TOKENS = {
  colors: {
    bgCanvas: '#FBFBF9',
    bgSecondary: '#F3F3EF',
    surfaceBase: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceDark: '#121212',
    surfaceDarkSubtle: '#1C1C1A',
    surfaceCard: '#FAF9F5',

    textPrimary: '#141412',
    textSecondary: '#595852',
    textMuted: '#8C8B82',
    textOnDark: '#F5F5F0',
    textOnDarkMuted: '#A8A79E',

    borderSubtle: '#E8E7E1',
    borderStrong: '#D1D0C7',
    borderDark: '#2D2D2A',
    borderFocus: '#B5A795',

    accentPrimary: '#242320',
    accentHover: '#383733',
    accentDark: '#1C1C1A',
    accentGold: '#92400e',
    accentNavy: '#1E3A8A',
    accentTaupe: '#B5A795',
    accentTaupeBg: '#F7F5F0',

    stateSuccess: '#2D5A3D',
    stateSuccessBg: '#F1F6F2',
    stateSuccessBorder: '#C8DDCF',

    stateWarning: '#8C5A2B',
    stateWarningBg: '#FAF4ED',
    stateWarningBorder: '#E8D3BF',

    stateError: '#8B2C2C',
    stateErrorBg: '#FBF1F1',
    stateErrorBorder: '#E5C3C3',

    stateInfo: '#3A4B59',
    stateInfoBg: '#F2F5F8',
    stateInfoBorder: '#C9D5E0',
  },
  fonts: {
    serif: '"Newsreader", Georgia, "Times New Roman", "Baskerville", serif',
    sans: 'system-ui, -apple-system, "Segoe UI", Roboto, "Inter", sans-serif',
    mono: '"Cascadia Code", "Consolas", "Courier New", monospace',
  },
  radii: {
    xs: '2px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    pill: '9999px',
  },
  shadows: {
    xs: '0 1px 1px rgba(20, 20, 18, 0.03)',
    sm: '0 1px 2px rgba(20, 20, 18, 0.04)',
    md: '0 4px 12px rgba(20, 20, 18, 0.06)',
    lg: '0 16px 32px -8px rgba(20, 20, 18, 0.12)',
    modal: '0 25px 50px -12px rgba(0, 0, 0, 0.35)',
  },
  transitions: {
    fast: '0.15s cubic-bezier(0.4, 0, 0.2, 1)',
    normal: '0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  },
} as const;

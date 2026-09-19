import React from 'react';
import { THEME_TOKENS } from '../config/themeTokens';

export interface DownloadMetricsProps {
  porcentaje: number;
  descargadoMB: number;
  totalMB: number;
  velocidadMBs: number;
  tiempoRestanteSegundos: number;
  nombreModelo?: string;
  estadoMensaje?: string;
}

export const DownloadProgressBar: React.FC<DownloadMetricsProps> = ({
  porcentaje,
  descargadoMB,
  totalMB,
  velocidadMBs,
  tiempoRestanteSegundos,
  nombreModelo,
  estadoMensaje,
}) => {
  const faltaMB = Math.max(0, totalMB - descargadoMB);
  const porcentajeSeguro = Math.min(100, Math.max(0, porcentaje));

  const formatearTiempo = (segundos: number): string => {
    if (segundos <= 0 || !isFinite(segundos)) return 'Calculando...';
    if (segundos < 60) return `${Math.ceil(segundos)}s`;
    const minutos = Math.floor(segundos / 60);
    const segs = Math.ceil(segundos % 60);
    return `${minutos}m ${segs}s`;
  };

  return (
    <div
      style={{
        backgroundColor: THEME_TOKENS.colors.surfaceBase,
        border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
        borderRadius: THEME_TOKENS.radii.md,
        padding: '1.25rem 1.5rem',
        boxShadow: THEME_TOKENS.shadows.sm,
        marginBottom: '1.5rem',
      }}
    >
      {/* Cabecera del progreso */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.9rem', color: THEME_TOKENS.colors.textSecondary }}>◼</span>
          <strong style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: '0.925rem', fontFamily: THEME_TOKENS.fonts.serif }}>
            Descarga de {nombreModelo || 'Modelo Whisper'}
          </strong>
        </div>
        <span
          style={{
            fontWeight: 600,
            fontSize: '1rem',
            color: THEME_TOKENS.colors.textPrimary,
            fontFamily: THEME_TOKENS.fonts.mono,
          }}
        >
          {porcentajeSeguro.toFixed(1)}%
        </span>
      </div>

      {estadoMensaje && (
        <p style={{ margin: '0 0 0.85rem 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
          {estadoMensaje}
        </p>
      )}

      {/* Barra de progreso sobria en carbón sobre riel arena */}
      <div
        style={{
          width: '100%',
          backgroundColor: THEME_TOKENS.colors.borderSubtle,
          borderRadius: THEME_TOKENS.radii.xs,
          height: '6px',
          overflow: 'hidden',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            width: `${porcentajeSeguro}%`,
            height: '100%',
            backgroundColor: THEME_TOKENS.colors.surfaceDarkSubtle,
            transition: `width ${THEME_TOKENS.transitions.fast}`,
          }}
        />
      </div>

      {/* Tarjetas de métricas responsivas (Mobile First) */}
      <div className="download-metrics-grid">
        {/* Velocidad */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.sm,
            padding: '0.6rem 0.75rem',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Velocidad
          </span>
          <strong style={{ fontSize: '0.9rem', color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.fonts.mono }}>
            {velocidadMBs.toFixed(1)} MB/s
          </strong>
        </div>

        {/* Descargado */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.sm,
            padding: '0.6rem 0.75rem',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Progreso
          </span>
          <strong style={{ fontSize: '0.9rem', color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.fonts.mono }}>
            {descargadoMB.toFixed(1)} / {totalMB.toFixed(0)} MB
          </strong>
        </div>

        {/* Falta */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.sm,
            padding: '0.6rem 0.75rem',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Restante
          </span>
          <strong style={{ fontSize: '0.9rem', color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.fonts.mono }}>
            {faltaMB.toFixed(1)} MB
          </strong>
        </div>

        {/* Tiempo estimado */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.sm,
            padding: '0.6rem 0.75rem',
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
            Tiempo Est.
          </span>
          <strong style={{ fontSize: '0.9rem', color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.fonts.mono }}>
            ~{formatearTiempo(tiempoRestanteSegundos)}
          </strong>
        </div>
      </div>
    </div>
  );
};

export default DownloadProgressBar;

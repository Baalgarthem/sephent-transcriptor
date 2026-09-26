/**
 * Barra de Progreso Mejorada para Transcripciones con Porcentaje y Tiempo Estimado (ETA)
 * 
 * Cumple con el requerimiento de seguridad y visibilidad para el usuario:
 * - Porcentaje numérico exacto y barra animada.
 * - Contador de tiempo transcurrido y cálculo de tiempo restante estimado (ETA).
 * - Indicador de etapas (1 a 4).
 * - Botón de cancelación seguro.
 */

import React, { useEffect, useState } from 'react';
import { THEME_TOKENS } from '../config/themeTokens';

export interface TranscriptionProgressBarProps {
  porcentaje: number;
  etapaActual?: number;
  totalEtapas?: number;
  mensaje?: string;
  tiempoEstimadoSegundos?: number;
  velocidadFactor?: number;
  nombreArchivo?: string;
  enCancelar?: () => void;
  cancelando?: boolean;
}

export const TranscriptionProgressBar: React.FC<TranscriptionProgressBarProps> = ({
  porcentaje,
  etapaActual = 1,
  totalEtapas = 4,
  mensaje = 'Procesando...',
  tiempoEstimadoSegundos = 0,
  velocidadFactor = 1.0,
  nombreArchivo,
  enCancelar,
  cancelando = false,
}) => {
  const [segundosTranscurridos, setSegundosTranscurridos] = useState<number>(0);
  const [inicioTiempo] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setSegundosTranscurridos(Math.floor((Date.now() - inicioTiempo) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [inicioTiempo]);

  const pctClamped = Math.min(100, Math.max(0, porcentaje));

  const formatearTiempo = (segundos: number): string => {
    if (segundos <= 0 || !isFinite(segundos)) return 'Calculando...';
    const mins = Math.floor(segundos / 60);
    const segs = Math.floor(segundos % 60);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(mins)}:${pad(segs)}`;
  };

  // Nombres canónicos de las etapas
  const obtenerNombreEtapa = (etapa: number, total: number): string => {
    if (total === 3) {
      switch (etapa) {
        case 1: return 'Carga de modelo en memoria';
        case 2: return 'Transcripción continua con Whisper';
        case 3: return 'Estructuración y actas';
        default: return 'Procesando';
      }
    } else {
      switch (etapa) {
        case 1: return 'Carga de modelo en memoria';
        case 2: return 'Transcripción fonética Whisper';
        case 3: return 'Diarización y separación de voces';
        case 4: return 'Estructuración y actas';
        default: return 'Procesando';
      }
    }
  };

  return (
    <div
      style={{
        backgroundColor: THEME_TOKENS.colors.surfaceBase,
        border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
        borderRadius: THEME_TOKENS.radii.md,
        padding: '1.25rem 1.5rem',
        boxShadow: THEME_TOKENS.shadows.md,
        margin: '1.25rem 0',
      }}
    >
      {/* Cabecera: Nombre de archivo y Porcentaje numérico grande */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: THEME_TOKENS.colors.accentGold || '#D4AF37' }}>⚡</span>
            <strong style={{ fontSize: '0.925rem', color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.fonts.serif }}>
              {nombreArchivo ? `Transcribiendo: ${nombreArchivo}` : 'Transcribiendo audio...'}
            </strong>
          </div>
          <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted, marginTop: '0.2rem', display: 'block' }}>
            Etapa {etapaActual} de {totalEtapas}: {obtenerNombreEtapa(etapaActual, totalEtapas)}
          </span>
        </div>

        <div style={{ textAlign: 'right' }}>
          <span
            style={{
              fontFamily: THEME_TOKENS.fonts.mono,
              fontSize: '1.5rem',
              fontWeight: 700,
              color: THEME_TOKENS.colors.textPrimary,
              lineHeight: 1,
            }}
          >
            {pctClamped.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Barra de Progreso Visual */}
      <div
        style={{
          width: '100%',
          height: '10px',
          backgroundColor: THEME_TOKENS.colors.bgSecondary,
          borderRadius: THEME_TOKENS.radii.sm,
          overflow: 'hidden',
          marginBottom: '1rem',
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: `${pctClamped}%`,
            height: '100%',
            backgroundColor: THEME_TOKENS.colors.accentPrimary,
            backgroundImage: 'linear-gradient(45deg, rgba(255,255,255,0.15) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.15) 75%, transparent 75%, transparent)',
            backgroundSize: '1rem 1rem',
            borderRadius: THEME_TOKENS.radii.sm,
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>

      {/* Mensaje de estado actual */}
      {mensaje && (
        <p
          style={{
            margin: '0 0 1rem 0',
            fontSize: '0.8125rem',
            color: THEME_TOKENS.colors.textSecondary,
            fontStyle: 'italic',
          }}
        >
          {mensaje}
        </p>
      )}

      {/* Métricas de tiempo y velocidad en cuadrícula */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: '0.5rem',
          marginBottom: '1rem',
        }}
      >
        {/* Tiempo transcurrido */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            padding: '0.55rem 0.65rem',
            borderRadius: THEME_TOKENS.radii.xs,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Transcurrido
          </span>
          <strong style={{ fontSize: '0.875rem', fontFamily: THEME_TOKENS.fonts.mono, color: THEME_TOKENS.colors.textPrimary }}>
            {formatearTiempo(segundosTranscurridos)}
          </strong>
        </div>

        {/* Tiempo restante estimado (ETA) */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            padding: '0.55rem 0.65rem',
            borderRadius: THEME_TOKENS.radii.xs,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Restante (ETA)
          </span>
          <strong style={{ fontSize: '0.875rem', fontFamily: THEME_TOKENS.fonts.mono, color: THEME_TOKENS.colors.textPrimary }}>
            ~{formatearTiempo(tiempoEstimadoSegundos)}
          </strong>
        </div>

        {/* Factor de velocidad */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            padding: '0.55rem 0.65rem',
            borderRadius: THEME_TOKENS.radii.xs,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Velocidad
          </span>
          <strong style={{ fontSize: '0.875rem', fontFamily: THEME_TOKENS.fonts.mono, color: THEME_TOKENS.colors.textPrimary }}>
            {velocidadFactor > 0 ? `${velocidadFactor.toFixed(1)}x` : '1.0x'}
          </strong>
        </div>

        {/* Etapa actual */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            padding: '0.55rem 0.65rem',
            borderRadius: THEME_TOKENS.radii.xs,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            textAlign: 'center',
          }}
        >
          <span style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, display: 'block', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Etapa
          </span>
          <strong style={{ fontSize: '0.875rem', fontFamily: THEME_TOKENS.fonts.mono, color: THEME_TOKENS.colors.textPrimary }}>
            {etapaActual} / {totalEtapas}
          </strong>
        </div>
      </div>

      {/* Botón de Cancelación */}
      {enCancelar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={enCancelar}
            disabled={cancelando}
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              color: '#DC2626',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: THEME_TOKENS.radii.sm,
              padding: '0.4rem 0.85rem',
              fontSize: '0.785rem',
              fontWeight: 500,
              cursor: cancelando ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span>⏹</span> {cancelando ? 'Cancelando proceso...' : 'Cancelar transcripción'}
          </button>
        </div>
      )}
    </div>
  );
};

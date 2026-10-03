/**
 * TranscriptionProgressBar — Barra de Progreso con Telemetría en Tiempo Real (Estilo Arturo)
 *
 * Mejoras v2:
 * - Ticker de tiempo transcurrido independiente (1 Hz) que siempre avanza, sin depender de eventos del engine.
 * - ETA suavizada con exponential moving average para evitar saltos bruscos.
 * - Indicador visual de velocidad de decodificación (x factor relativo al tiempo real).
 * - Indicador de etapas con nombres descriptivos de cada fase.
 * - Animación shimmer activa solo durante ejecución; estado estático al 100%.
 * - Soporte para modo "completado" (porcentaje = 100) con visual diferenciado.
 * - Botón de cancelación seguro que preserva el expediente parcial.
 */

import React, { useEffect, useRef, useState } from 'react';
import { THEME_TOKENS } from '../config/themeTokens';

export interface TranscriptionProgressBarProps {
  porcentaje: number;
  etapaActual?: number;
  totalEtapas?: number;
  mensaje?: string;
  /** ETA en segundos (estimado por el engine o el adapter) */
  tiempoEstimadoSegundos?: number;
  velocidadFactor?: number;
  segundosProcesadosAudio?: number;
  totalSegundosAudio?: number;
  nombreArchivo?: string;
  enCancelar?: () => void;
  cancelando?: boolean;
}

/** Formatea segundos como MM:SS o HH:MM:SS */
function formatearTiempo(segundos?: number): string {
  if (segundos === undefined || segundos === null || segundos < 0 || !isFinite(segundos)) {
    return '--:--';
  }
  const total = Math.floor(segundos);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const segs = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (hrs > 0) {
    return `${pad(hrs)}:${pad(mins)}:${pad(segs)}`;
  }
  return `${pad(mins)}:${pad(segs)}`;
}

/** Nombres canónicos de cada etapa del pipeline de transcripción */
function obtenerNombreEtapa(etapa: number, total: number): string {
  if (total <= 3) {
    switch (etapa) {
      case 1: return 'Carga del modelo en memoria';
      case 2: return 'Transcripción fonética con Whisper';
      case 3: return 'Estructuración y actas';
      default: return 'Procesando';
    }
  }
  switch (etapa) {
    case 1: return 'Carga del modelo en memoria';
    case 2: return 'Transcripción fonética con Whisper';
    case 3: return 'Diarización y separación de voces';
    case 4: return 'Estructuración y actas';
    default: return 'Procesando';
  }
}

/** Color de la barra de progreso según etapa */
function colorPorEtapa(etapa: number, esCompletado: boolean): string {
  if (esCompletado) return '#10b981'; // Verde esmeralda
  switch (etapa) {
    case 1: return '#6366f1'; // Índigo — carga del modelo
    case 2: return '#3b82f6'; // Azul — transcripción Whisper
    case 3: return '#f59e0b'; // Ámbar — diarización
    case 4: return '#10b981'; // Verde — estructuración final
    default: return THEME_TOKENS.colors.accentPrimary;
  }
}

export const TranscriptionProgressBar: React.FC<TranscriptionProgressBarProps> = ({
  porcentaje,
  etapaActual = 1,
  totalEtapas = 4,
  mensaje = 'Procesando...',
  tiempoEstimadoSegundos = 0,
  velocidadFactor = 1.0,
  segundosProcesadosAudio,
  totalSegundosAudio,
  nombreArchivo,
  enCancelar,
  cancelando = false,
}) => {
  // Ticker de tiempo transcurrido: independiente del engine, actualizado cada segundo.
  const inicioRef = useRef<number>(Date.now());
  const [segundosTranscurridos, setSegundosTranscurridos] = useState<number>(0);

  // ETA suavizada con EMA para evitar saltos bruscos cada vez que llega un nuevo valor.
  const etaSuavizadaRef = useRef<number>(0);
  const [etaMostrada, setEtaMostrada] = useState<number>(0);

  useEffect(() => {
    inicioRef.current = Date.now();
    setSegundosTranscurridos(0);
    etaSuavizadaRef.current = 0;

    const timer = setInterval(() => {
      const transcurrido = Math.floor((Date.now() - inicioRef.current) / 1000);
      setSegundosTranscurridos(transcurrido);
    }, 1000);

    return () => clearInterval(timer);
    // Sólo se recrea si el componente es destruido y reconstruido (key change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suavizar el ETA con EMA cada vez que llega un nuevo valor del engine
  useEffect(() => {
    if (tiempoEstimadoSegundos > 0 && isFinite(tiempoEstimadoSegundos)) {
      if (etaSuavizadaRef.current === 0) {
        etaSuavizadaRef.current = tiempoEstimadoSegundos;
      } else {
        etaSuavizadaRef.current =
          0.7 * etaSuavizadaRef.current + 0.3 * tiempoEstimadoSegundos;
      }
      setEtaMostrada(Math.round(etaSuavizadaRef.current));
    } else if (tiempoEstimadoSegundos <= 0) {
      setEtaMostrada(0);
    }
  }, [tiempoEstimadoSegundos]);

  const pctClamped = Math.min(100, Math.max(0, porcentaje));
  const esCompletado = pctClamped >= 100;
  const colorBarra = colorPorEtapa(etapaActual, esCompletado);

  const porcentajeTexto = esCompletado
    ? '100%'
    : pctClamped <= 0
    ? '0%'
    : `${pctClamped.toFixed(1)}%`;

  const hayAudioData =
    totalSegundosAudio !== undefined &&
    totalSegundosAudio > 0 &&
    segundosProcesadosAudio !== undefined;

  const velocidadValida =
    velocidadFactor > 0 && isFinite(velocidadFactor) && velocidadFactor !== 1.0;

  return (
    <div
      style={{
        backgroundColor: THEME_TOKENS.colors.surfaceBase,
        border: `1px solid ${esCompletado ? 'rgba(16,185,129,0.4)' : THEME_TOKENS.colors.borderDark}`,
        borderRadius: THEME_TOKENS.radii.md,
        padding: '1.25rem 1.5rem',
        boxShadow: esCompletado
          ? '0 0 0 3px rgba(16,185,129,0.12)'
          : THEME_TOKENS.shadows.md,
        margin: '1.25rem 0',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      <style>{`
        @keyframes sephent-pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.25); }
        }
        @keyframes sephent-bar-shimmer {
          0% { background-position: 0 0; }
          100% { background-position: 2.5rem 0; }
        }
        @keyframes sephent-completado-glow {
          0%, 100% { box-shadow: 0 0 0 2px rgba(16,185,129,0.12); }
          50% { box-shadow: 0 0 0 6px rgba(16,185,129,0.25); }
        }
      `}</style>

      {/* ── Encabezado: Archivo + Porcentaje numérico ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '0.75rem',
          gap: '1rem',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.875rem', color: esCompletado ? '#10b981' : '#F59E0B' }}>
              {esCompletado ? '✅' : '⚡'}
            </span>
            <strong
              style={{
                fontSize: '0.925rem',
                color: THEME_TOKENS.colors.textPrimary,
                fontFamily: THEME_TOKENS.fonts.serif,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: '480px',
              }}
              title={nombreArchivo || 'Transcribiendo audio...'}
            >
              {nombreArchivo ? `Transcribiendo: ${nombreArchivo}` : 'Transcribiendo audio...'}
            </strong>
          </div>
          <span
            style={{
              fontSize: '0.75rem',
              color: THEME_TOKENS.colors.textMuted,
              marginTop: '0.2rem',
              display: 'block',
            }}
          >
            Etapa {etapaActual} de {totalEtapas}:&nbsp;
            <span style={{ color: colorBarra, fontWeight: 600 }}>
              {obtenerNombreEtapa(etapaActual, totalEtapas)}
            </span>
          </span>
        </div>

        {/* Indicador de estado + porcentaje numérico grande */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.4rem',
              marginBottom: '0.25rem',
            }}
          >
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: esCompletado ? '#10b981' : '#22c55e',
                boxShadow: esCompletado ? '0 0 6px #10b981' : '0 0 8px #22c55e',
                animation: esCompletado ? 'none' : 'sephent-pulse-dot 1.8s infinite ease-in-out',
              }}
            />
            <span
              style={{
                fontSize: '0.675rem',
                fontWeight: 700,
                color: esCompletado ? '#059669' : '#16a34a',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                fontFamily: THEME_TOKENS.fonts.sans,
              }}
            >
              {esCompletado ? 'Completado' : 'En vivo'}
            </span>
          </div>
          <span
            style={{
              fontFamily: THEME_TOKENS.fonts.mono,
              fontSize: '1.75rem',
              fontWeight: 700,
              color: esCompletado ? '#10b981' : THEME_TOKENS.colors.textPrimary,
              lineHeight: 1,
              transition: 'color 0.3s ease',
            }}
          >
            {porcentajeTexto}
          </span>
        </div>
      </div>

      {/* ── Barra de Progreso Visual ── */}
      <div
        style={{
          width: '100%',
          height: '12px',
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
            backgroundColor: colorBarra,
            backgroundImage: esCompletado
              ? 'none'
              : 'linear-gradient(45deg, rgba(255,255,255,0.18) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0.18) 75%, transparent 75%, transparent)',
            backgroundSize: '1.5rem 1.5rem',
            animation: esCompletado ? 'none' : 'sephent-bar-shimmer 1.0s linear infinite',
            borderRadius: THEME_TOKENS.radii.sm,
            transition: 'width 0.35s ease-out, background-color 0.3s ease',
          }}
        />
      </div>

      {/* ── Mensaje de estado ── */}
      {mensaje && (
        <p
          style={{
            margin: '0 0 1rem 0',
            fontSize: '0.8125rem',
            color: esCompletado
              ? '#059669'
              : mensaje.startsWith('❌')
              ? '#DC2626'
              : THEME_TOKENS.colors.textSecondary,
            fontStyle: 'italic',
            fontWeight: esCompletado ? 500 : 400,
          }}
        >
          {mensaje}
        </p>
      )}

      {/* ── Métricas en cuadrícula ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(105px, 1fr))`,
          gap: '0.5rem',
          marginBottom: enCancelar ? '1rem' : '0',
        }}
      >
        {/* Tiempo transcurrido (ticker independiente) */}
        <MetricCard
          label="Transcurrido"
          value={formatearTiempo(segundosTranscurridos)}
          highlight={false}
        />

        {/* ETA suavizada */}
        <MetricCard
          label="Restante (ETA)"
          value={esCompletado ? '00:00' : etaMostrada > 0 ? `~${formatearTiempo(etaMostrada)}` : '--:--'}
          highlight={!esCompletado && etaMostrada > 0}
        />

        {/* Factor de velocidad */}
        <MetricCard
          label="Velocidad"
          value={
            velocidadValida
              ? `${velocidadFactor.toFixed(1)}x`
              : '1.0x'
          }
          highlight={velocidadFactor > 2}
        />

        {/* Audio decodificado (solo si el engine lo reporta) */}
        {hayAudioData && (
          <MetricCard
            label="Audio procesado"
            value={`${formatearTiempo(segundosProcesadosAudio || 0)} / ${formatearTiempo(totalSegundosAudio)}`}
            highlight={false}
            mono={true}
          />
        )}

        {/* Etapa actual */}
        <MetricCard
          label="Etapa"
          value={`${etapaActual} / ${totalEtapas}`}
          highlight={false}
        />
      </div>

      {/* ── Botón de Cancelación ── */}
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
              padding: '0.45rem 0.95rem',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: cancelando ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              opacity: cancelando ? 0.6 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <span>⏹</span>
            {cancelando ? 'Guardando avance parcial...' : 'Cancelar transcripción'}
          </button>
        </div>
      )}
    </div>
  );
};

/** Tarjeta métrica reutilizable */
const MetricCard: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
  mono?: boolean;
}> = ({ label, value, highlight = false, mono = false }) => (
  <div
    style={{
      backgroundColor: THEME_TOKENS.colors.bgSecondary,
      padding: '0.55rem 0.65rem',
      borderRadius: THEME_TOKENS.radii.xs,
      border: `1px solid ${highlight ? 'rgba(59,130,246,0.35)' : THEME_TOKENS.colors.borderSubtle}`,
      textAlign: 'center',
    }}
  >
    <span
      style={{
        fontSize: '0.6875rem',
        color: THEME_TOKENS.colors.textMuted,
        display: 'block',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: '0.15rem',
      }}
    >
      {label}
    </span>
    <strong
      style={{
        fontSize: '0.875rem',
        fontFamily: mono || value.includes(':') ? THEME_TOKENS.fonts.mono : THEME_TOKENS.fonts.sans,
        color: highlight ? '#3b82f6' : THEME_TOKENS.colors.textPrimary,
      }}
    >
      {value}
    </strong>
  </div>
);

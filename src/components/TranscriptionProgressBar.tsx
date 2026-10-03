/**
 * TranscriptionProgressBar — Barra de Progreso con Telemetría en Vivo y Anti-Truncamiento (Estilo Arturo)
 *
 * Mejoras de Alto Rendimiento y Calidad:
 * 1. Cero Truncamientos Visuales:
 *    - Nombres de archivo, etapas y acciones nunca se cortan con ellipsis rígido.
 *    - Cuadrícula responsiva que se adapta sin recortar métricas ni etiquetas.
 *    - Detección e insignia explícita de "Blindaje Anti-Truncamiento Activo".
 * 2. Visualización Explícita de Etapas y Acciones:
 *    - Stepper visual superior que marca cada etapa (Completada ✓, Activa ●, Pendiente ○).
 *    - Panel destacado con la acción específica que el motor está ejecutando en ese milisegundo.
 * 3. Lógica "En Vivo" Literal y Fluida:
 *    - Indicador "🔴 EN VIVO" con animación acústica (soundwave bars en CSS).
 *    - Micro-interpolador en tiempo real con requestAnimationFrame para movimiento continuo de la barra.
 *    - Ticker de tiempo transcurrido independiente a 1 Hz.
 *    - ETA suavizado mediante Media Móvil Exponencial (EMA).
 *    - Medidor en vivo de velocidad relativa de decodificación (factor x) y cobertura de audio.
 * 4. Optimización Extrema:
 *    - Aceleración por hardware GPU (transform: translate3d).
 *    - Limpieza rigurosa de timers y loops al desmontar el componente (cero memory leaks).
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { THEME_TOKENS } from '../config/themeTokens';

export interface TranscriptionProgressBarProps {
  porcentaje: number;
  etapaActual?: number;
  totalEtapas?: number;
  mensaje?: string;
  tiempoEstimadoSegundos?: number;
  velocidadFactor?: number;
  segundosProcesadosAudio?: number;
  totalSegundosAudio?: number;
  nombreArchivo?: string;
  accionActual?: string;
  nombreEtapa?: string;
  evitarTruncamiento?: boolean;
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

interface InfoEtapaPipeline {
  numero: number;
  nombreCorto: string;
  nombreCompleto: string;
  descripcion: string;
  accionPorDefecto: string;
}

/**
 * Catálogo canónico de etapas según el pipeline acústico.
 */
function obtenerCatalogoEtapas(total: number): InfoEtapaPipeline[] {
  if (total <= 3) {
    return [
      {
        numero: 1,
        nombreCorto: '1. Carga y Normalización',
        nombreCompleto: 'Carga de Tensores y Preparación del Entorno',
        descripcion: 'Verificación de GPU/CPU y normalización de audio a 16 kHz PCM mono sin pérdida.',
        accionPorDefecto: 'Cargando tensores del modelo en memoria RAM/VRAM y normalizando señal de audio...',
      },
      {
        numero: 2,
        nombreCorto: '2. Whisper Fonético',
        nombreCompleto: 'Decodificación Acústica Fonética con OpenAI Whisper',
        descripcion: 'Inferencia de red neuronal sobre espectrogramas Mel y ensamblado de marcas de tiempo con blindaje anti-truncamiento.',
        accionPorDefecto: 'Decodificando ventanas de audio con red neuronal Whisper e infiriendo fonemas...',
      },
      {
        numero: 3,
        nombreCorto: '3. Sellado y Actas',
        nombreCompleto: 'Estructuración Pericial y Generación de Expediente',
        descripcion: 'Reconciliación temporal, pulido de ortografía y compilación de documentos .txt y .srt.',
        accionPorDefecto: 'Ensamblando actas periciales estructuradas, sincronizando subtítulos y sellando expediente...',
      },
    ];
  }

  return [
    {
      numero: 1,
      nombreCorto: '1. Carga y Normalización',
      nombreCompleto: 'Carga de Tensores y Preparación del Entorno',
      descripcion: 'Verificación de GPU/CPU y normalización de audio a 16 kHz PCM mono sin pérdida.',
      accionPorDefecto: 'Cargando tensores del modelo en memoria RAM/VRAM y normalizando señal de audio...',
    },
    {
      numero: 2,
      nombreCorto: '2. Whisper Fonético',
      nombreCompleto: 'Decodificación Acústica Fonética con OpenAI Whisper',
      descripcion: 'Inferencia de red neuronal sobre espectrogramas Mel y ensamblado de marcas de tiempo con blindaje anti-truncamiento.',
      accionPorDefecto: 'Decodificando ventanas de audio con red neuronal Whisper e infiriendo fonemas...',
    },
    {
      numero: 3,
      nombreCorto: '3. Diarización de Voces',
      nombreCompleto: 'Diarización y Segregación de Locutores',
      descripcion: 'Extracción de perfiles vocales (x-vectors) y discriminación de interlocutores.',
      accionPorDefecto: 'Extrayendo embeddings vocales y discriminando las intervenciones de cada interlocutor...',
    },
    {
      numero: 4,
      nombreCorto: '4. Sellado y Actas',
      nombreCompleto: 'Estructuración Pericial y Ensamblado de Actas',
      descripcion: 'Reconciliación de hablantes con texto, pulido de ortografía y sellado pericial de documentos.',
      accionPorDefecto: 'Reconciliando intervenciones con hablantes identificados y emitiendo documentos .txt y .srt...',
    },
  ];
}

/** Color representativo por etapa */
function colorPorEtapa(etapa: number, esCompletado: boolean): string {
  if (esCompletado) return '#10b981'; // Verde esmeralda
  switch (etapa) {
    case 1: return '#6366f1'; // Índigo — inicialización
    case 2: return '#2563eb'; // Azul real — decodificación acústica
    case 3: return '#d97706'; // Ámbar / oro — diarización
    case 4: return '#059669'; // Verde pericial — estructuración
    default: return '#2563eb';
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
  accionActual,
  nombreEtapa,
  evitarTruncamiento = true,
  enCancelar,
  cancelando = false,
}) => {
  // ── 1. Referencias y Estados para el Modelo de Ticker a 1 Hz y Normalizador de ETA ──
  const inicioRef = useRef<number>(Date.now());
  const [segundosTranscurridos, setSegundosTranscurridos] = useState<number>(0);

  // Monotonicidad estricta e irreversible para porcentaje y audio analizado
  const maxPorcentajeRef = useRef<number>(0);
  const maxAudioProcesadoRef = useRef<number>(0);
  const ultimoNombreArchivoRef = useRef<string | undefined>(nombreArchivo);

  // Al cambiar de archivo, reiniciar acumuladores de máximos de forma sincronizada
  if (ultimoNombreArchivoRef.current !== nombreArchivo) {
    ultimoNombreArchivoRef.current = nombreArchivo;
    maxPorcentajeRef.current = 0;
    maxAudioProcesadoRef.current = 0;
  }

  // El porcentaje bajo ninguna circunstancia puede regresar hacia atrás dentro de un archivo
  const porcentajeMonotono = Math.max(
    maxPorcentajeRef.current,
    Math.min(100, Math.max(0, porcentaje))
  );
  maxPorcentajeRef.current = porcentajeMonotono;

  const porcentajeObjetivo = porcentajeMonotono;
  const esCompletado = porcentajeObjetivo >= 100;

  // El audio procesado acumulado bajo ninguna circunstancia puede decrecer
  if (segundosProcesadosAudio !== undefined && segundosProcesadosAudio >= 0 && isFinite(segundosProcesadosAudio)) {
    maxAudioProcesadoRef.current = Math.max(maxAudioProcesadoRef.current, segundosProcesadosAudio);
  }
  const audioProcesadoMostrado = (esCompletado && totalSegundosAudio && totalSegundosAudio > 0)
    ? totalSegundosAudio
    : maxAudioProcesadoRef.current;

  // Referencias para el modelo dinámico de estimación de tiempo (ETA continuo y adaptativo)
  const etaCalibradaRef = useRef<number>(0);
  const [etaMostrada, setEtaMostrada] = useState<number>(0);
  const ultimoPuntoVelocidadRef = useRef<{ tiempo: number; pct: number }>({ tiempo: Date.now(), pct: porcentajeMonotono });
  const velocidadEmaRef = useRef<number>(1.0); // % de avance por segundo observado
  const ultimaEtaBackendRef = useRef<number>(tiempoEstimadoSegundos);
  ultimaEtaBackendRef.current = tiempoEstimadoSegundos;

  // Reiniciar temporizadores y estimaciones iniciales (priors bayesianos) al cambiar de archivo
  useEffect(() => {
    inicioRef.current = Date.now();
    setSegundosTranscurridos(0);
    maxPorcentajeRef.current = 0;
    maxAudioProcesadoRef.current = 0;
    ultimoPuntoVelocidadRef.current = { tiempo: Date.now(), pct: 0 };
    velocidadEmaRef.current = 1.0;
    setPorcentajeVisual(0);
    pctVisualRef.current = 0;

    let priorInicial = 25;
    if (totalSegundosAudio && totalSegundosAudio > 0) {
      priorInicial = Math.max(6, Math.round(totalSegundosAudio * (totalEtapas === 4 ? 0.38 : 0.25) + 3));
    } else if (tiempoEstimadoSegundos > 0) {
      priorInicial = tiempoEstimadoSegundos;
    }
    etaCalibradaRef.current = priorInicial;
    setEtaMostrada(priorInicial);
  }, [nombreArchivo]);

  // Recalibración adaptativa inmediata al recibir nuevas muestras de ETA del backend
  useEffect(() => {
    if (tiempoEstimadoSegundos > 0 && isFinite(tiempoEstimadoSegundos)) {
      if (etaCalibradaRef.current <= 0) {
        etaCalibradaRef.current = tiempoEstimadoSegundos;
      } else {
        // Amortiguación adaptativa: suavizar discrepancias sin saltos visuales bruscos (filtro pasa-bajas)
        const diff = tiempoEstimadoSegundos - etaCalibradaRef.current;
        if (Math.abs(diff) <= 3) {
          etaCalibradaRef.current += diff * 0.45;
        } else if (diff > 3) {
          // El proceso tomó más tiempo: incrementar suavemente (máximo 2.5s por actualización)
          etaCalibradaRef.current += Math.min(2.5, diff * 0.25);
        } else {
          // El proceso aceleró: reducir de forma fluida (máximo 3.0s por actualización)
          etaCalibradaRef.current += Math.max(-3.0, diff * 0.35);
        }
      }
      setEtaMostrada(Math.max(1, Math.round(etaCalibradaRef.current)));
    }
  }, [tiempoEstimadoSegundos]);

  // Seguimiento de la velocidad física de avance (% / segundo) para normalización continua
  useEffect(() => {
    const ahora = Date.now();
    const dt = (ahora - ultimoPuntoVelocidadRef.current.tiempo) / 1000;
    const dp = porcentajeMonotono - ultimoPuntoVelocidadRef.current.pct;

    if (dt >= 0.4 && dp > 0) {
      const velInst = dp / dt;
      velocidadEmaRef.current = 0.70 * velocidadEmaRef.current + 0.30 * velInst;
      ultimoPuntoVelocidadRef.current = { tiempo: ahora, pct: porcentajeMonotono };
    }
  }, [porcentajeMonotono]);

  // ── 2. Ticker de Reloj Real a 1 Hz y Normalización Dinámica de ETA en Vivo ──
  // Decrementa el tiempo restante segundo a segundo en vivo y mantiene la sincronía sin congelamientos
  useEffect(() => {
    if (esCompletado) {
      setEtaMostrada(0);
      return;
    }

    const intervalId = setInterval(() => {
      // 1. Tiempo transcurrido con precisión del reloj del sistema (segundo a segundo)
      const transcurrido = Math.max(0, Math.floor((Date.now() - inicioRef.current) / 1000));
      setSegundosTranscurridos(transcurrido);

      // 2. Normalización de ETA en tiempo real (decremento continuo y convergencia suave)
      if (etaCalibradaRef.current > 1) {
        etaCalibradaRef.current -= 1.0;
      }

      setEtaMostrada(() => {
        if (porcentajeObjetivo >= 100) return 0;

        let etaTarget = etaCalibradaRef.current;
        if ((etaTarget <= 0 || !isFinite(etaTarget)) && velocidadEmaRef.current > 0.05) {
          const pctRestante = Math.max(0, 100 - porcentajeObjetivo);
          etaTarget = Math.max(1, Math.round(pctRestante / velocidadEmaRef.current));
          etaCalibradaRef.current = etaTarget;
        }

        const nuevoEta = Math.max(1, Math.round(etaCalibradaRef.current));

        // Clamping contextual según la fase del pipeline
        if (porcentajeObjetivo >= 98) {
          // Fase final de ensamblado pericial / sellado: acotar a <= 2s
          return Math.min(2, Math.max(1, nuevoEta));
        } else if (porcentajeObjetivo >= 95) {
          return Math.max(1, nuevoEta);
        } else {
          // En etapas activas anteriores, nunca caer a 0 prematuramente
          return Math.max(2, nuevoEta);
        }
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [esCompletado, porcentajeObjetivo]);

  // ── 3. Micro-interpolador en tiempo real para barra "en vivo" ──
  // Permite que la barra avance de forma matemáticamente continua sin saltos bruscos ni retrocesos
  const [porcentajeVisual, setPorcentajeVisual] = useState<number>(porcentajeObjetivo);
  const pctVisualRef = useRef<number>(porcentajeVisual);
  pctVisualRef.current = porcentajeVisual;

  useEffect(() => {
    let animId: number;
    const actualizarFluido = () => {
      const target = porcentajeObjetivo;
      const actual = pctVisualRef.current;
      const diferencia = target - actual;

      // Monotonicidad estricta: solo avanza hacia adelante si la diferencia es positiva
      // Bajo ninguna circunstancia reduce el porcentaje visual ni permite regresiones
      if (diferencia > 0.04) {
        // Factor de amortiguación Lerp (0.12 para fluidez de alta fidelidad)
        const nuevo = Math.min(target, actual + diferencia * 0.12);
        setPorcentajeVisual(nuevo);
        animId = requestAnimationFrame(actualizarFluido);
      } else if (actual < target) {
        setPorcentajeVisual(target);
      }
    };

    animId = requestAnimationFrame(actualizarFluido);
    return () => cancelAnimationFrame(animId);
  }, [porcentajeObjetivo]);

  // Micro-avance continuo durante la decodificación activa si el backend no emite evento
  // IMPORTANTE: Nunca sobrepasa porcentajeObjetivo para garantizar monotonicidad absoluta
  useEffect(() => {
    if (porcentajeObjetivo >= 100 || porcentajeObjetivo <= 0 || etapaActual !== 2) {
      return;
    }

    const microTicker = setInterval(() => {
      setPorcentajeVisual((actual) => {
        // Solo avanza si el valor visual aún no ha alcanzado porcentajeObjetivo (suavizado sin overshoot)
        if (actual < porcentajeObjetivo && actual < 99) {
          return Math.min(porcentajeObjetivo, actual + 0.03);
        }
        return actual;
      });
    }, 150);

    return () => clearInterval(microTicker);
  }, [porcentajeObjetivo, etapaActual]);

  const colorBarra = colorPorEtapa(etapaActual, esCompletado);

  const porcentajeTexto = esCompletado
    ? '100%'
    : porcentajeVisual <= 0
    ? '0%'
    : `${porcentajeVisual.toFixed(1)}%`;

  // Catálogo de etapas activas (3 o 4)
  const catalogoEtapas = useMemo(() => obtenerCatalogoEtapas(totalEtapas), [totalEtapas]);
  const infoEtapaActual = useMemo(() => {
    const encontrada = catalogoEtapas.find((e) => e.numero === etapaActual);
    return encontrada || catalogoEtapas[0];
  }, [catalogoEtapas, etapaActual]);

  // Acción específica en curso
  const accionMostrada = useMemo(() => {
    if (esCompletado) {
      return 'Transcripción acústica y expedientes periciales finalizados satisfactoriamente.';
    }
    if (accionActual && accionActual.trim()) {
      return accionActual.trim();
    }
    if (mensaje && mensaje.trim() && !mensaje.toLowerCase().startsWith('etapa')) {
      return mensaje.trim();
    }
    return infoEtapaActual.accionPorDefecto;
  }, [esCompletado, accionActual, mensaje, infoEtapaActual]);

  // Cálculo de cobertura de audio analizado (monótono irreversible)
  const hayAudioData =
    totalSegundosAudio !== undefined &&
    totalSegundosAudio > 0 &&
    (segundosProcesadosAudio !== undefined || maxAudioProcesadoRef.current > 0);

  const pctAudioCobertura = hayAudioData
    ? Math.min(100, Math.max(0, (audioProcesadoMostrado / totalSegundosAudio!) * 100)).toFixed(1)
    : null;

  const velocidadValida =
    velocidadFactor > 0 && isFinite(velocidadFactor) && velocidadFactor !== 1.0;

  // Detección de alerta de rescate de cola
  const esRescateEnProgreso = accionMostrada.toLowerCase().includes('rescatando') ||
    mensaje.toLowerCase().includes('rescatando') ||
    mensaje.toLowerCase().includes('rescate');

  return (
    <div
      style={{
        backgroundColor: THEME_TOKENS.colors.surfaceBase,
        border: `1px solid ${esCompletado ? 'rgba(16,185,129,0.45)' : THEME_TOKENS.colors.borderSubtle}`,
        borderRadius: THEME_TOKENS.radii.md,
        padding: '1.25rem 1.5rem',
        boxShadow: esCompletado
          ? '0 0 0 3px rgba(16,185,129,0.15)'
          : THEME_TOKENS.shadows.md,
        margin: '1.25rem 0',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      {/* ── Estilos y Animaciones CSS Optimizadas por GPU ── */}
      <style>{`
        @keyframes sephent-live-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.35; transform: scale(1.3); }
        }
        @keyframes sephent-bar-shimmer {
          0% { background-position: 0 0; }
          100% { background-position: 2.5rem 0; }
        }
        @keyframes sephent-wave-1 {
          0%, 100% { height: 4px; }
          50% { height: 14px; }
        }
        @keyframes sephent-wave-2 {
          0%, 100% { height: 12px; }
          50% { height: 5px; }
        }
        @keyframes sephent-wave-3 {
          0%, 100% { height: 6px; }
          50% { height: 15px; }
        }
      `}</style>

      {/* ── 1. STEPPER VISUAL DE ETAPAS DEL PIPELINE (EXPLÍCITO Y SIN TRUNCAR) ── */}
      <div style={{ marginBottom: '1.15rem' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.45rem',
            flexWrap: 'wrap',
          }}
        >
          {catalogoEtapas.map((etapa) => {
            const completada = etapa.numero < etapaActual || esCompletado;
            const activa = etapa.numero === etapaActual && !esCompletado;

            let bgPill: string = THEME_TOKENS.colors.bgSecondary;
            let borderPill: string = THEME_TOKENS.colors.borderSubtle;
            let textPill: string = THEME_TOKENS.colors.textSecondary;
            let icono: string = '○';

            if (completada) {
              bgPill = '#ECFDF5';
              borderPill = '#A7F3D0';
              textPill = '#065F46';
              icono = '✓';
            } else if (activa) {
              bgPill = '#EFF6FF';
              borderPill = '#BFDBFE';
              textPill = '#1D4ED8';
              icono = '●';
            }

            return (
              <div
                key={etapa.numero}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.25rem 0.65rem',
                  borderRadius: THEME_TOKENS.radii.pill,
                  backgroundColor: bgPill,
                  border: `1px solid ${borderPill}`,
                  fontSize: '0.75rem',
                  fontWeight: activa ? 700 : 500,
                  color: textPill,
                  transition: 'all 0.25s ease',
                  flex: '1 1 auto',
                  minWidth: '130px',
                  justifyContent: 'center',
                }}
                title={etapa.descripcion}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 800 }}>{icono}</span>
                <span>{etapa.nombreCorto}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. ENCABEZADO DEL ARCHIVO + INDICADOR EN VIVO + PORCENTAJE NUMÉRICO ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '0.85rem',
          gap: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        {/* Lado Izquierdo: Nombre de Archivo Completo (Sin truncar) */}
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '1rem', color: esCompletado ? '#10b981' : '#F59E0B' }}>
              {esCompletado ? '✅' : '🎙️'}
            </span>
            <strong
              style={{
                fontSize: '0.975rem',
                color: THEME_TOKENS.colors.textPrimary,
                fontFamily: THEME_TOKENS.fonts.serif,
                wordBreak: 'break-word',
                lineHeight: 1.3,
              }}
              title={nombreArchivo || 'Archivo de audio en proceso'}
            >
              {nombreArchivo ? `Expediente: ${nombreArchivo}` : 'Procesando transcripción de audio...'}
            </strong>
          </div>

          <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.785rem',
                color: THEME_TOKENS.colors.textSecondary,
                fontWeight: 600,
              }}
            >
              Etapa {etapaActual} de {totalEtapas}:{' '}
              <span style={{ color: colorBarra, fontWeight: 700 }}>
                {nombreEtapa || infoEtapaActual.nombreCompleto}
              </span>
            </span>

            {/* Insignia de blindaje anti-truncamiento activo */}
            {evitarTruncamiento && (
              <span
                style={{
                  fontSize: '0.685rem',
                  fontWeight: 700,
                  backgroundColor: 'rgba(37, 99, 235, 0.08)',
                  color: '#1D4ED8',
                  border: '1px solid rgba(37, 99, 235, 0.25)',
                  padding: '0.1rem 0.45rem',
                  borderRadius: THEME_TOKENS.radii.pill,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
                title="El motor verifica la cobertura total de la pista de audio y rescata silencios o colas para evitar cualquier pérdida."
              >
                <span>🛡️</span> Blindaje Anti-Truncamiento Activo
              </span>
            )}
          </div>
        </div>

        {/* Lado Derecho: Estado "En Vivo" + Porcentaje Numérico */}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: '110px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.45rem',
              marginBottom: '0.3rem',
            }}
          >
            {esCompletado ? (
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: '#059669',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontFamily: THEME_TOKENS.fonts.sans,
                }}
              >
                ✓ Completado
              </span>
            ) : (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                {/* Ondas acústicas en vivo animadas con CSS puro */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', height: '14px' }}>
                  <span
                    style={{
                      width: '2px',
                      backgroundColor: '#22c55e',
                      borderRadius: '1px',
                      animation: 'sephent-wave-1 0.8s ease-in-out infinite',
                    }}
                  />
                  <span
                    style={{
                      width: '2px',
                      backgroundColor: '#22c55e',
                      borderRadius: '1px',
                      animation: 'sephent-wave-2 0.8s ease-in-out infinite',
                    }}
                  />
                  <span
                    style={{
                      width: '2px',
                      backgroundColor: '#22c55e',
                      borderRadius: '1px',
                      animation: 'sephent-wave-3 0.8s ease-in-out infinite',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    color: '#16a34a',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontFamily: THEME_TOKENS.fonts.sans,
                  }}
                >
                  EN VIVO
                </span>
              </div>
            )}
          </div>

          <span
            style={{
              fontFamily: THEME_TOKENS.fonts.mono,
              fontSize: '1.9rem',
              fontWeight: 800,
              color: esCompletado ? '#10b981' : THEME_TOKENS.colors.textPrimary,
              lineHeight: 1,
              transition: 'color 0.3s ease',
            }}
          >
            {porcentajeTexto}
          </span>
        </div>
      </div>

      {/* ── 3. BARRA DE PROGRESO CON SHIMMER EN VIVO ── */}
      <div
        style={{
          width: '100%',
          height: '14px',
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
            width: `${Math.min(100, Math.max(0, porcentajeVisual))}%`,
            height: '100%',
            backgroundColor: colorBarra,
            backgroundImage: esCompletado
              ? 'none'
              : 'linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)',
            backgroundSize: '1.75rem 1.75rem',
            animation: esCompletado ? 'none' : 'sephent-bar-shimmer 0.9s linear infinite',
            borderRadius: THEME_TOKENS.radii.sm,
            transition: 'background-color 0.3s ease',
            transform: 'translate3d(0, 0, 0)',
            willChange: 'width',
          }}
        />
      </div>

      {/* ── 4. PANEL DESTACADO: ACCIÓN Y PROCESO ESPECÍFICO EN CURSO ── */}
      <div
        style={{
          backgroundColor: esRescateEnProgreso
            ? 'rgba(245, 158, 11, 0.08)'
            : THEME_TOKENS.colors.bgSecondary,
          border: `1px solid ${esRescateEnProgreso ? 'rgba(245, 158, 11, 0.35)' : THEME_TOKENS.colors.borderSubtle}`,
          borderRadius: THEME_TOKENS.radii.sm,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <span style={{ fontSize: '0.85rem' }}>
              {esRescateEnProgreso ? '⚠️' : '⚙️'}
            </span>
            <strong
              style={{
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: esRescateEnProgreso ? '#B45309' : THEME_TOKENS.colors.textSecondary,
              }}
            >
              {esRescateEnProgreso
                ? 'Operación de Rescate Anti-Truncamiento'
                : `Acción Específica (Etapa ${etapaActual} de ${totalEtapas})`}
            </strong>
          </div>

          {hayAudioData && (
            <span
              style={{
                fontSize: '0.75rem',
                color: THEME_TOKENS.colors.textMuted,
                fontFamily: THEME_TOKENS.fonts.mono,
              }}
            >
              Audio: {formatearTiempo(audioProcesadoMostrado)} / {formatearTiempo(totalSegundosAudio)} ({pctAudioCobertura}%)
            </span>
          )}
        </div>

        <p
          style={{
            margin: 0,
            fontSize: '0.85rem',
            color: esCompletado
              ? '#047857'
              : esRescateEnProgreso
              ? '#92400E'
              : THEME_TOKENS.colors.textPrimary,
            fontWeight: esCompletado || esRescateEnProgreso ? 600 : 500,
            lineHeight: 1.45,
            wordBreak: 'break-word',
          }}
        >
          {accionMostrada}
        </p>
      </div>

      {/* ── 5. CUADRÍCULA DE MÉTRICAS EN VIVO SIN TRUNCAMIENTO ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(115px, 1fr))',
          gap: '0.55rem',
          marginBottom: enCancelar ? '1rem' : '0',
        }}
      >
        {/* 5.1 Tiempo Transcurrido (1 Hz continuo) */}
        <MetricCard
          label="Transcurrido"
          value={formatearTiempo(segundosTranscurridos)}
          sublabel="segundo a segundo"
          highlight={false}
          mono={true}
        />

        {/* 5.2 Tiempo Restante Estimado (ETA EMA) */}
        <MetricCard
          label="Restante (ETA)"
          value={esCompletado ? '00:00' : etaMostrada > 0 ? `~${formatearTiempo(etaMostrada)}` : '--:--'}
          sublabel={esCompletado ? 'concluido' : 'en vivo normalizado'}
          highlight={!esCompletado && etaMostrada > 0}
          mono={true}
        />

        {/* 5.3 Factor de Velocidad */}
        <MetricCard
          label="Velocidad"
          value={velocidadValida ? `${velocidadFactor.toFixed(1)}x` : '1.0x'}
          sublabel="relativa a tiempo real"
          highlight={velocidadFactor >= 2.0}
        />

        {/* 5.4 Audio Analizado (si está disponible) */}
        {hayAudioData && (
          <MetricCard
            label="Audio Analizado"
            value={`${formatearTiempo(audioProcesadoMostrado)}`}
            sublabel={`de ${formatearTiempo(totalSegundosAudio)}`}
            highlight={false}
            mono={true}
          />
        )}

        {/* 5.5 Etapa Actual del Pipeline */}
        <MetricCard
          label="Etapa Actual"
          value={`${etapaActual} / ${totalEtapas}`}
          sublabel={infoEtapaActual.nombreCorto.replace(/^\d+\.\s*/, '')}
          highlight={false}
        />
      </div>

      {/* ── 6. BOTÓN DE CANCELACIÓN SEGURO (PRESERVA EXPEDIENTE PARCIAL) ── */}
      {enCancelar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem' }}>
          <button
            type="button"
            onClick={enCancelar}
            disabled={cancelando}
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              color: '#DC2626',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: THEME_TOKENS.radii.sm,
              padding: '0.45rem 1rem',
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: cancelando ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              opacity: cancelando ? 0.65 : 1,
              transition: 'all 0.15s ease',
            }}
          >
            <span>⏹</span>
            {cancelando ? 'Guardando expediente parcial rescatado...' : 'Detener transcripción (conservar avance)'}
          </button>
        </div>
      )}
    </div>
  );
};

/** Tarjeta métrica reutilizable con subtítulo descriptivo */
const MetricCard: React.FC<{
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
  mono?: boolean;
}> = ({ label, value, sublabel, highlight = false, mono = false }) => (
  <div
    style={{
      backgroundColor: THEME_TOKENS.colors.bgSecondary,
      padding: '0.6rem 0.75rem',
      borderRadius: THEME_TOKENS.radii.xs,
      border: `1px solid ${highlight ? 'rgba(59,130,246,0.4)' : THEME_TOKENS.colors.borderSubtle}`,
      textAlign: 'center',
      minWidth: 0,
    }}
  >
    <span
      style={{
        fontSize: '0.6875rem',
        color: THEME_TOKENS.colors.textSecondary,
        display: 'block',
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        marginBottom: '0.15rem',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
    <strong
      style={{
        fontSize: '0.925rem',
        fontFamily: mono ? THEME_TOKENS.fonts.mono : THEME_TOKENS.fonts.sans,
        color: highlight ? '#1D4ED8' : THEME_TOKENS.colors.textPrimary,
        display: 'block',
        lineHeight: 1.2,
      }}
    >
      {value}
    </strong>
    {sublabel && (
      <span
        style={{
          fontSize: '0.625rem',
          color: THEME_TOKENS.colors.textMuted,
          display: 'block',
          marginTop: '0.15rem',
          lineHeight: 1.1,
          wordBreak: 'break-word',
        }}
      >
        {sublabel}
      </span>
    )}
  </div>
);

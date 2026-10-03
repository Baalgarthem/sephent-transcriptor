/**
 * StreamlinedTranscriptionView — Interfaz Gráfica Moderna y Rápida (Estilo Arturo)
 * 
 * Implementación alternativa de IGUIView que demuestra la capacidad de alternar
 * entre múltiples tecnologías y paradigmas gráficos sin alterar el motor ni los servicios.
 * 
 * Enfoque: Minimalista, centrado en productividad ágil, diarización activa por defecto,
 * telemetría interactiva de alta resolución con ETA y exportación inmediata.
 */

import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { useService } from '../../../core/di/DIContext';
import { DI_TOKENS } from '../../../core/di/tokens';
import { ITranscriptionEngine, TelemetriaTranscripcion } from '../../../core/contracts/ITranscriptionEngine';
import { ITelemetryService } from '../../../core/contracts/ITelemetryService';
import { IPericialService } from '../../../core/contracts/IPericialService';
import { WHISPER_MODELS } from '../../../config/whisperConfig';
import { ModelManager } from '../../../services/modelManager';
import { UserSettingsService } from '../../../services/userSettingsService';
import { TranscriptionDatabase, StoredTranscription } from '../../../services/database/transcriptionDatabase';
import { TranscriptionService } from '../../../services/transcription/transcriptionService';
import { OutputPathService } from '../../../services/transcription/outputPathService';
import { THEME_TOKENS } from '../../../config/themeTokens';
import { TranscriptionProgressBar } from '../../../components/TranscriptionProgressBar';

type ModelKey = keyof typeof WHISPER_MODELS;

export default function StreamlinedTranscriptionView(): React.ReactElement {
  // Inyección de dependencias
  const transcriptionEngine = useService<ITranscriptionEngine>(DI_TOKENS.TRANSCRIPTION_ENGINE);
  const telemetryService = useService<ITelemetryService>(DI_TOKENS.TELEMETRY_SERVICE);
  const pericialService = useService<IPericialService>(DI_TOKENS.PERICIAL_SERVICE);

  const configInicial = UserSettingsService.obtenerConfiguracion();

  // Estados de la sesión
  const [archivos, setArchivos] = useState<File[]>([]);
  const [modelo, setModelo] = useState<ModelKey>(() => {
    try {
      const def = ModelManager.resolverModeloPorDefecto();
      if (def) return def as ModelKey;
    } catch {}
    return (configInicial.modelo as ModelKey) || 'small';
  });
  const [idioma, setIdioma] = useState<string>(configInicial.idioma || 'auto');
  const [diarizar, setDiarizar] = useState<boolean>(configInicial.diarizarHablantes ?? true);
  const [evitarTruncamiento, setEvitarTruncamiento] = useState<boolean>(configInicial.evitarTruncamiento ?? true);
  const [formatoTxt, setFormatoTxt] = useState<boolean>(configInicial.outputTxt);
  const [formatoSrt, setFormatoSrt] = useState<boolean>(configInicial.outputSrt);
  const [formatoVideo, setFormatoVideo] = useState<boolean>(configInicial.outputVideo);

  // Estados de ejecución
  const [enEjecucion, setEnEjecucion] = useState(false);
  const [transcripcionCompletada, setTranscripcionCompletada] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorMensaje, setErrorMensaje] = useState<string | null>(null);
  const cancelacionSolicitada = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [telemetria, setTelemetria] = useState<{
    porcentaje: number;
    etapaActual: number;
    totalEtapas: number;
    mensaje: string;
    tiempoEstimadoSegundos: number;
    velocidadFactor: number;
    segundosProcesadosAudio?: number;
    totalSegundosAudio?: number;
    nombreArchivo?: string;
    accionActual?: string;
    nombreEtapa?: string;
    evitarTruncamiento?: boolean;
  }>({
    porcentaje: 0,
    etapaActual: 1,
    totalEtapas: configInicial.diarizarHablantes ?? true ? 4 : 3,
    mensaje: '',
    tiempoEstimadoSegundos: 0,
    velocidadFactor: 1.0,
    evitarTruncamiento: configInicial.evitarTruncamiento ?? true,
  });

  const [ultimasTranscripciones, setUltimasTranscripciones] = useState<StoredTranscription[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Cargar historial reciente
  useEffect(() => {
    setUltimasTranscripciones(TranscriptionDatabase.obtenerTodas().slice(0, 5));
  }, [enEjecucion]);

  // Listener para arrastrar y soltar archivos en la ventana nativa de Tauri
  useEffect(() => {
    const tauri = typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
    if (tauri?.event?.listen) {
      let desuscribir: (() => void) | undefined = undefined;
      tauri.event
        .listen('tauri://file-drop', (event: any) => {
          if (Array.isArray(event.payload) && event.payload.length > 0) {
            agregarArchivosPorRuta(event.payload);
          }
        })
        .then((fn: () => void) => {
          desuscribir = fn;
        })
        .catch(() => {});

      return () => {
        if (desuscribir) desuscribir();
      };
    }
  }, []);

  /**
   * Agrega archivos conservando su ruta absoluta física en disco para Whisper nativo
   */
  const agregarArchivosPorRuta = (rutas: string[]) => {
    const nuevosObjetos = rutas.map((ruta) => {
      const normalizada = ruta.replace(/\\/g, '/');
      const nombre = normalizada.split('/').pop() || 'audio_archivo';
      const f = new File([''], nombre, { type: 'audio/mpeg' });
      (f as any).__tauriPath = ruta;
      (f as any).path = ruta;
      return f;
    });

    setArchivos((prev) => {
      const existentes = new Set(prev.map((f) => (f as any).__tauriPath || (f as any).path || f.name));
      const noDuplicados = nuevosObjetos.filter((f) => !existentes.has((f as any).__tauriPath || (f as any).path || f.name));
      return [...prev, ...noDuplicados];
    });
    setErrorMensaje(null);
  };

  /**
   * Abre el diálogo nativo de Tauri con selector de archivos de audio y video
   */
  const handleExaminarArchivos = async () => {
    const tauri = typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
    if (tauri?.dialog?.open) {
      try {
        const seleccion = await tauri.dialog.open({
          multiple: true,
          filters: [
            {
              name: 'Archivos de Audio y Video',
              extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'wma', 'aac', 'mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv'],
            },
          ],
        });
        if (seleccion) {
          const rutas = Array.isArray(seleccion) ? seleccion : [seleccion];
          agregarArchivosPorRuta(rutas);
          return;
        }
      } catch (err) {
        console.warn('Diálogo Tauri falló o cancelado:', err);
      }
    }

    // Fallback: input de archivo HTML para pruebas o modo web
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleSeleccionarArchivos = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const nuevos = Array.from(e.target.files);
      const rutas: string[] = [];
      const otrosArchivos: File[] = [];
      nuevos.forEach((f) => {
        const p = (f as any).path || (f as any).__tauriPath;
        if (p && typeof p === 'string' && (p.includes(':\\') || p.includes(':/') || p.startsWith('/'))) {
          rutas.push(p);
        } else {
          otrosArchivos.push(f);
        }
      });
      if (rutas.length > 0) {
        agregarArchivosPorRuta(rutas);
      }
      if (otrosArchivos.length > 0) {
        setArchivos((prev) => [...prev, ...otrosArchivos]);
      }
      e.target.value = '';
      setErrorMensaje(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const nuevos = Array.from(e.dataTransfer.files);
      const rutas: string[] = [];
      const otrosArchivos: File[] = [];
      nuevos.forEach((f) => {
        const p = (f as any).path || (f as any).__tauriPath;
        if (p && typeof p === 'string' && (p.includes(':\\') || p.includes(':/') || p.startsWith('/'))) {
          rutas.push(p);
        } else {
          otrosArchivos.push(f);
        }
      });
      if (rutas.length > 0) {
        agregarArchivosPorRuta(rutas);
      }
      if (otrosArchivos.length > 0) {
        setArchivos((prev) => [...prev, ...otrosArchivos]);
      }
      setErrorMensaje(null);
    }
  };

  const handleIniciar = async () => {
    if (archivos.length === 0) {
      alert('Por favor agrega al menos un archivo de audio o video.');
      return;
    }

    if (!formatoTxt && !formatoSrt && !formatoVideo) {
      alert('Selecciona al menos un formato de salida documental (.txt o .srt).');
      return;
    }

    cancelacionSolicitada.current = false;
    setCancelando(false);
    setEnEjecucion(true);
    const totalEtapas = diarizar ? 4 : 3;
    telemetryService.iniciarSesion(totalEtapas, 0);

    setTelemetria({
      porcentaje: 5,
      etapaActual: 1,
      totalEtapas,
      mensaje: `Iniciando modelo ${modelo} en modo ágil...`,
      tiempoEstimadoSegundos: 0,
      velocidadFactor: 1.0,
      nombreArchivo: archivos[0].name,
    });

    try {
      for (let i = 0; i < archivos.length; i++) {
        const file = archivos[i];

        const resultadoAudio = await transcriptionEngine.transcribirArchivo(file, {
          modelo,
          idioma,
          diarizar,
          evitarTruncamiento,
          onProgreso: (t: TelemetriaTranscripcion) => {
            if (!cancelacionSolicitada.current) {
              setTelemetria({
                porcentaje: t.porcentaje,
                etapaActual: t.etapaActual,
                totalEtapas: t.totalEtapas,
                mensaje: t.mensaje,
                tiempoEstimadoSegundos: t.tiempoEstimadoSegundos || 0,
                velocidadFactor: t.velocidadFactor || 1.0,
                segundosProcesadosAudio: t.segundosProcesadosAudio,
                totalSegundosAudio: t.totalSegundosAudio,
                nombreArchivo: file.name,
                accionActual: t.accionActual,
                nombreEtapa: t.nombreEtapa,
                evitarTruncamiento: t.evitarTruncamiento ?? evitarTruncamiento,
              });
            }
          },
        });

        const tieneSegmentos = resultadoAudio.rawSegments && resultadoAudio.rawSegments.length > 0;
        if (cancelacionSolicitada.current && !tieneSegmentos) {
          break;
        }

        const esParcial = !!resultadoAudio.isPartial;
        const statusFinal: 'completado' | 'parcial' | 'error' = esParcial ? 'parcial' : 'completado';

        const record = TranscriptionService.generateTranscriptionRecord(
          file,
          { txt: formatoTxt, srt: formatoSrt, video: formatoVideo },
          { txt: resultadoAudio.txtContent, srt: resultadoAudio.srtContent }
        );

        const rutaOrigenDirectorio = ((file as any).__tauriPath || (file as any).path)
          ? String((file as any).__tauriPath || (file as any).path).replace(/\\/g, '/').split('/').slice(0, -1).join('/')
          : '';

        const carpetaDestino = rutaOrigenDirectorio
          ? rutaOrigenDirectorio.replace(/\//g, '\\')
          : OutputPathService.resolverCarpetaDestino(file.name, 'default');

        const salidasBD = record.outputs.map((out: any) => ({
          format: out.formatId,
          fileName: out.fileName,
          fullPath: rutaOrigenDirectorio
            ? `${rutaOrigenDirectorio}/${out.fileName}`.replace(/\//g, '\\')
            : `${OutputPathService.obtenerRutaPorDefecto()}\\${out.fileName}`,
        }));

        if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
          const tauri = (window as any).__TAURI__;
          for (const out of salidasBD) {
            if (out.format === 'txt' && resultadoAudio.txtContent && out.fullPath) {
              try {
                await tauri.invoke('guardar_archivo_texto', {
                  ruta: out.fullPath,
                  contenido: resultadoAudio.txtContent,
                });
              } catch (writeErr) {
                console.warn('Aviso guardado texto:', writeErr);
              }
            } else if (out.format === 'srt' && resultadoAudio.srtContent && out.fullPath) {
              try {
                await tauri.invoke('guardar_archivo_texto', {
                  ruta: out.fullPath,
                  contenido: resultadoAudio.srtContent,
                });
              } catch (writeErr) {
                console.warn('Aviso guardado srt:', writeErr);
              }
            }
          }
        }

        TranscriptionDatabase.guardar({
          fileName: file.name,
          fileType: 'audio',
          fileSizeFormatted: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
          modelUsed: WHISPER_MODELS[modelo]?.nombreVisible || modelo,
          language: idioma === 'auto' ? 'Detección automática' : idioma.toUpperCase(),
          destinationType: rutaOrigenDirectorio ? 'original' : 'default',
          destinationFolder: carpetaDestino,
          outputs: salidasBD,
          status: statusFinal,
          isPartial: esParcial,
          wasCancelled: resultadoAudio.wasCancelled,
          errorMotivo: resultadoAudio.errorMotivo,
          logPath: resultadoAudio.logPath,
          rawSegments: resultadoAudio.rawSegments,
          textContent: resultadoAudio.txtContent,
          srtContent: resultadoAudio.srtContent,
          speakerNames: resultadoAudio.speakerNames,
        });

        if (cancelacionSolicitada.current) {
          break;
        }
      }
    } catch (err: any) {
      console.error('Error durante la transcripción en vista ágil:', err);
      const msg = err?.message || String(err);
      setErrorMensaje(msg);
      if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
        try {
          (window as any).__TAURI__.invoke('registrar_error_log', {
            componente: 'StreamlinedTranscriptionView',
            mensaje: msg,
            contexto: navigator.userAgent,
            rutaAudio: archivos.length > 0 ? (archivos[0] as any).path || (archivos[0] as any).__tauriPath || archivos[0].name : null,
          });
        } catch {}
      }
      setTelemetria((prev) => ({
        ...prev,
        porcentaje: 0,
        mensaje: `❌ Error en transcripción: ${msg}`,
      }));
    } finally {
      setEnEjecucion(false);
      setCancelando(false);

      if (!cancelacionSolicitada.current) {
        setTelemetria((prev) => {
          if (prev.mensaje.startsWith('❌')) return prev;
          return {
            ...prev,
            porcentaje: 100,
            mensaje: '✅ Transcripción completada con éxito.',
          };
        });
        setTranscripcionCompletada(true);
        setTimeout(() => {
          setTranscripcionCompletada(false);
          setUltimasTranscripciones(TranscriptionDatabase.obtenerTodas().slice(0, 5));
        }, 3500);
      } else {
        setTelemetria((prev) => ({
          ...prev,
          mensaje: '⏹ Transcripción cancelada — expediente parcial rescatado y guardado.',
        }));
        setTranscripcionCompletada(true);
        setTimeout(() => {
          setTranscripcionCompletada(false);
          setUltimasTranscripciones(TranscriptionDatabase.obtenerTodas().slice(0, 5));
        }, 3500);
      }
    }
  };

  const handleCancelar = async () => {
    if (!enEjecucion || cancelando) return;
    setCancelando(true);
    cancelacionSolicitada.current = true;
    try {
      await transcriptionEngine.cancelar();
    } catch {}
  };

  const handleAbrirCarpetaLogs = async () => {
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
      try {
        await (window as any).__TAURI__.invoke('abrir_carpeta_logs');
      } catch {
        alert('No se pudo abrir automáticamente la carpeta de registros.');
      }
    } else {
      alert('La apertura de la carpeta de registros está disponible en la versión de escritorio.');
    }
  };

  const descargarArchivo = (contenido: string, nombre: string, mime: string) => {
    try {
      const blob = new Blob([contenido], { type: `${mime};charset=utf-8` });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('No se pudo descargar el archivo.');
    }
  };

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1rem', fontFamily: THEME_TOKENS.fonts.sans }}>
      {/* Banner de Modo Streamlined */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#1E293B',
          color: '#F8FAFC',
          padding: '0.85rem 1.25rem',
          borderRadius: THEME_TOKENS.radii.md,
          marginBottom: '1.5rem',
          boxShadow: THEME_TOKENS.shadows.md,
        }}
      >
        <div>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94A3B8' }}>
            ⚡ Interfaz Gráfica Alternativa (Pluggable DI)
          </span>
          <h2 style={{ margin: '0.2rem 0 0 0', fontSize: '1.25rem', fontWeight: 600, color: '#F8FAFC' }}>
            Modo Rápido & Diarización Directa
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button
            onClick={handleAbrirCarpetaLogs}
            title="Abrir carpeta de registros de errores"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#CBD5E1',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: THEME_TOKENS.radii.sm,
              padding: '0.25rem 0.65rem',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            📋 Logs
          </button>
          <span
            style={{
              fontSize: '0.75rem',
              backgroundColor: 'rgba(56, 189, 248, 0.15)',
              color: '#38BDF8',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              padding: '0.25rem 0.65rem',
              borderRadius: THEME_TOKENS.radii.pill,
              fontWeight: 500,
            }}
          >
            React Streamlined
          </span>
        </div>
      </div>

      {/* Panel de Configuración Rápida en 1 Fila */}
      <div
        style={{
          backgroundColor: THEME_TOKENS.colors.surfaceBase,
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          borderRadius: THEME_TOKENS.radii.md,
          padding: '1.25rem',
          marginBottom: '1.5rem',
          boxShadow: THEME_TOKENS.shadows.sm,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          alignItems: 'center',
        }}
      >
        {/* Selector de Modelo */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.35rem' }}>
            🧠 Modelo Whisper:
          </label>
          <select
            value={modelo}
            onChange={(e) => {
              const m = e.target.value as ModelKey;
              setModelo(m);
              UserSettingsService.guardarConfiguracion({ modelo: m });
            }}
            disabled={enEjecucion}
            style={{
              width: '100%',
              padding: '0.55rem',
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
              backgroundColor: THEME_TOKENS.colors.surfaceBase,
              fontSize: '0.85rem',
            }}
          >
            {Object.keys(WHISPER_MODELS).map((k) => (
              <option key={k} value={k}>
                {WHISPER_MODELS[k as ModelKey].nombreVisible} ({WHISPER_MODELS[k as ModelKey].tamanoAproximadoMB} MB)
              </option>
            ))}
          </select>
        </div>

        {/* Selector de Idioma */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.35rem' }}>
            🌐 Idioma del Audio:
          </label>
          <select
            value={idioma}
            onChange={(e) => {
              setIdioma(e.target.value);
              UserSettingsService.guardarConfiguracion({ idioma: e.target.value as any });
            }}
            disabled={enEjecucion}
            style={{
              width: '100%',
              padding: '0.55rem',
              borderRadius: THEME_TOKENS.radii.sm,
              border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
              backgroundColor: THEME_TOKENS.colors.surfaceBase,
              fontSize: '0.85rem',
            }}
          >
            <option value="auto">🌐 Detectar Automáticamente</option>
            <option value="es">🇪🇸 Español</option>
            <option value="en">🇺🇸 Inglés</option>
            <option value="fr">🇫🇷 Francés</option>
            <option value="de">🇩🇪 Alemán</option>
            <option value="pt">🇵🇹 Portugués</option>
            <option value="it">🇮🇹 Italiano</option>
          </select>
        </div>

        {/* Diarización Toggle (Por defecto TRUE) */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.35rem' }}>
            👥 Diarización (Hablantes):
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: enEjecucion ? 'not-allowed' : 'pointer',
              padding: '0.45rem 0.75rem',
              backgroundColor: diarizar ? 'rgba(34, 197, 94, 0.1)' : 'rgba(100, 116, 139, 0.1)',
              border: `1px solid ${diarizar ? 'rgba(34, 197, 94, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
              borderRadius: THEME_TOKENS.radii.sm,
            }}
          >
            <input
              type="checkbox"
              checked={diarizar}
              onChange={(e) => {
                setDiarizar(e.target.checked);
                UserSettingsService.guardarConfiguracion({ diarizarHablantes: e.target.checked });
              }}
              disabled={enEjecucion}
              style={{ cursor: 'pointer', accentColor: '#16a34a' }}
            />
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: diarizar ? '#15803d' : '#64748b' }}>
              {diarizar ? '✓ Activada (Quién habla cuándo)' : '✕ Desactivada (Solo texto plano)'}
            </span>
          </label>
        </div>

        {/* Anti-truncamiento Toggle (Archivos Largos) */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.35rem' }}>
            🛡️ Archivos Largos (Anti-truncamiento):
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: enEjecucion ? 'not-allowed' : 'pointer',
              padding: '0.45rem 0.75rem',
              backgroundColor: evitarTruncamiento ? 'rgba(59, 130, 246, 0.1)' : 'rgba(100, 116, 139, 0.1)',
              border: `1px solid ${evitarTruncamiento ? 'rgba(59, 130, 246, 0.4)' : 'rgba(100, 116, 139, 0.3)'}`,
              borderRadius: THEME_TOKENS.radii.sm,
            }}
          >
            <input
              type="checkbox"
              checked={evitarTruncamiento}
              onChange={(e) => {
                setEvitarTruncamiento(e.target.checked);
                UserSettingsService.guardarConfiguracion({ evitarTruncamiento: e.target.checked });
              }}
              disabled={enEjecucion}
              style={{ cursor: 'pointer', accentColor: '#2563eb' }}
            />
            <span style={{ fontSize: '0.825rem', fontWeight: 600, color: evitarTruncamiento ? '#2563eb' : '#64748b' }}>
              {evitarTruncamiento ? '✓ Blindaje Activo (>10 min y multi-hora)' : '✕ Estándar (Sin rescate de cola)'}
            </span>
          </label>
        </div>

        {/* Formatos Salida */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary, marginBottom: '0.35rem' }}>
            📄 Formatos de Salida:
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formatoTxt}
                onChange={(e) => {
                  setFormatoTxt(e.target.checked);
                  UserSettingsService.guardarConfiguracion({ outputTxt: e.target.checked });
                }}
                disabled={enEjecucion}
              />
              .TXT
            </label>
            <label style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={formatoSrt}
                onChange={(e) => {
                  setFormatoSrt(e.target.checked);
                  UserSettingsService.guardarConfiguracion({ outputSrt: e.target.checked });
                }}
                disabled={enEjecucion}
              />
              .SRT
            </label>
          </div>
        </div>
      </div>

      {/* Zona de Carga Rápida (Dropzone) */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${isDragOver ? '#38BDF8' : THEME_TOKENS.colors.borderStrong}`,
          backgroundColor: isDragOver ? 'rgba(56, 189, 248, 0.05)' : THEME_TOKENS.colors.surfaceCard,
          borderRadius: THEME_TOKENS.radii.lg,
          padding: '2rem 1.5rem',
          textAlign: 'center',
          marginBottom: '1.5rem',
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>🎙️</div>
        <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.1rem', color: THEME_TOKENS.colors.textPrimary }}>
          Arrastra audios o videos aquí para procesar
        </h3>
        <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: THEME_TOKENS.colors.textSecondary }}>
          Formatos compatibles: MP3, WAV, M4A, OGG, FLAC, MP4, MKV, AVI, WEBM
        </p>

        <button
          type="button"
          onClick={handleExaminarArchivos}
          disabled={enEjecucion}
          style={{
            display: 'inline-block',
            backgroundColor: enEjecucion ? '#94A3B8' : THEME_TOKENS.colors.accentPrimary,
            color: '#FFFFFF',
            padding: '0.65rem 1.5rem',
            borderRadius: THEME_TOKENS.radii.sm,
            fontSize: '0.875rem',
            fontWeight: 600,
            border: 'none',
            cursor: enEjecucion ? 'not-allowed' : 'pointer',
            boxShadow: THEME_TOKENS.shadows.sm,
            transition: 'background-color 0.2s ease',
          }}
        >
          📂 Seleccionar Archivos
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="audio/*,video/*"
          onChange={handleSeleccionarArchivos}
          style={{ display: 'none' }}
        />

        {archivos.length > 0 && (
          <div style={{ marginTop: '1.25rem', textAlign: 'left', backgroundColor: THEME_TOKENS.colors.surfaceBase, padding: '0.75rem 1rem', borderRadius: THEME_TOKENS.radii.sm, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <strong style={{ fontSize: '0.825rem' }}>Archivos listos para procesar ({archivos.length}):</strong>
              <button
                onClick={() => setArchivos([])}
                disabled={enEjecucion}
                style={{ background: 'none', border: 'none', color: '#EF4444', fontSize: '0.75rem', cursor: 'pointer' }}
              >
                Limpiar cola
              </button>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
              {archivos.map((f, idx) => (
                <li key={idx} style={{ marginBottom: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span title={(f as any).__tauriPath || (f as any).path || f.name} style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '650px' }}>
                    🎵 {f.name} {f.size > 0 ? `(${(f.size / (1024 * 1024)).toFixed(2)} MB)` : ''}
                  </span>
                  <button
                    type="button"
                    onClick={() => setArchivos((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={enEjecucion}
                    title="Quitar este archivo de la cola"
                    style={{ background: 'none', border: 'none', color: THEME_TOKENS.colors.textSecondary, cursor: 'pointer', fontSize: '0.8rem', padding: '0 0.35rem', transition: 'color 0.15s ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#EF4444'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary; }}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Alerta de Error Visible y Persistente */}
      {errorMensaje && (
        <div
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.35)',
            borderRadius: THEME_TOKENS.radii.md,
            padding: '1rem 1.25rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: THEME_TOKENS.shadows.sm,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span style={{ fontSize: '1rem' }}>⚠️</span>
              <strong style={{ fontSize: '0.875rem', color: '#DC2626' }}>
                Atención: Fallo en el proceso de transcripción
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '0.8125rem', color: THEME_TOKENS.colors.textPrimary, wordBreak: 'break-word' }}>
              {errorMensaje}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button
              type="button"
              onClick={handleAbrirCarpetaLogs}
              title="Abrir carpeta de registros técnicos"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                color: '#DC2626',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: THEME_TOKENS.radii.sm,
                padding: '0.35rem 0.75rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📋 Ver Logs
            </button>
            <button
              type="button"
              onClick={() => setErrorMensaje(null)}
              title="Cerrar este aviso"
              style={{
                backgroundColor: 'transparent',
                color: THEME_TOKENS.colors.textMuted,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                borderRadius: THEME_TOKENS.radii.sm,
                padding: '0.35rem 0.65rem',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              ✕ Cerrar
            </button>
          </div>
        </div>
      )}

      {/* Barra de Progreso y Telemetría en Vivo */}
      {(enEjecucion || transcripcionCompletada) && (
        <div style={{ marginBottom: '1.5rem' }}>
          <TranscriptionProgressBar
            key={enEjecucion ? 'activa' : 'completada'}
            porcentaje={telemetria.porcentaje}
            etapaActual={telemetria.etapaActual}
            totalEtapas={telemetria.totalEtapas}
            mensaje={telemetria.mensaje}
            tiempoEstimadoSegundos={telemetria.tiempoEstimadoSegundos}
            velocidadFactor={telemetria.velocidadFactor}
            segundosProcesadosAudio={telemetria.segundosProcesadosAudio}
            totalSegundosAudio={telemetria.totalSegundosAudio}
            nombreArchivo={telemetria.nombreArchivo}
            accionActual={telemetria.accionActual}
            nombreEtapa={telemetria.nombreEtapa}
            evitarTruncamiento={telemetria.evitarTruncamiento ?? evitarTruncamiento}
            enCancelar={enEjecucion ? handleCancelar : undefined}
            cancelando={cancelando}
          />
        </div>
      )}

      {/* Botones de Acción Primaria */}
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '2rem' }}>
        <button
          onClick={handleIniciar}
          disabled={enEjecucion || archivos.length === 0}
          style={{
            backgroundColor: enEjecucion || archivos.length === 0 ? THEME_TOKENS.colors.bgSecondary : '#0F172A',
            color: enEjecucion || archivos.length === 0 ? THEME_TOKENS.colors.textMuted : '#FFFFFF',
            border: `1px solid ${enEjecucion || archivos.length === 0 ? THEME_TOKENS.colors.borderStrong : '#0F172A'}`,
            padding: '0.75rem 2.5rem',
            borderRadius: THEME_TOKENS.radii.sm,
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: enEjecucion || archivos.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: enEjecucion || archivos.length === 0 ? 'none' : THEME_TOKENS.shadows.md,
            transition: 'all 0.15s ease',
          }}
        >
          {enEjecucion ? 'Procesando Transcripción...' : '🚀 Iniciar Transcripción'}
        </button>

        {enEjecucion && (
          <button
            onClick={handleCancelar}
            disabled={cancelando}
            style={{
              backgroundColor: '#EF4444',
              color: '#FFFFFF',
              padding: '0.75rem 1.5rem',
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.9rem',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {cancelando ? 'Cancelando...' : '⏹ Cancelar'}
          </button>
        )}
      </div>

      {/* Historial Reciente Rápido */}
      {ultimasTranscripciones.length > 0 && (
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.surfaceBase,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.md,
            padding: '1.25rem',
          }}
        >
          <h4 style={{ margin: '0 0 0.85rem 0', fontSize: '0.95rem', color: THEME_TOKENS.colors.textPrimary }}>
            📂 Transcripciones Recientes en Base de Datos
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {ultimasTranscripciones.map((t) => (
              <div
                key={t.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.65rem 0.85rem',
                  backgroundColor: THEME_TOKENS.colors.surfaceCard,
                  borderRadius: THEME_TOKENS.radii.sm,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.85rem', color: THEME_TOKENS.colors.textPrimary }}>
                    {t.fileName}
                  </strong>
                  <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted, marginLeft: '0.65rem' }}>
                    {t.date} · Modelo: {t.modelUsed} · {t.rawSegments?.length || 0} fragmentos
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '0.45rem' }}>
                  {t.textContent && (
                    <button
                      onClick={() => descargarArchivo(t.textContent || '', `${t.fileName}.txt`, 'text/plain')}
                      style={{
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.75rem',
                        borderRadius: THEME_TOKENS.radii.xs,
                        border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                        backgroundColor: THEME_TOKENS.colors.surfaceBase,
                        color: THEME_TOKENS.colors.textPrimary,
                        cursor: 'pointer',
                      }}
                    >
                      ↓ TXT
                    </button>
                  )}
                  {t.srtContent && (
                    <button
                      onClick={() => descargarArchivo(t.srtContent || '', `${t.fileName}.srt`, 'text/plain')}
                      style={{
                        padding: '0.3rem 0.65rem',
                        fontSize: '0.75rem',
                        borderRadius: THEME_TOKENS.radii.xs,
                        border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                        backgroundColor: THEME_TOKENS.colors.surfaceBase,
                        color: THEME_TOKENS.colors.textPrimary,
                        cursor: 'pointer',
                      }}
                    >
                      ↓ SRT
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

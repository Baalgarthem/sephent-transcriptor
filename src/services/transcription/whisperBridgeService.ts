/**
 * WhisperBridgeService — Puente entre el frontend y el script Python whisper_runner.py
 *
 * Responsabilidad unica (SRP):
 *   Invocar el runner Python via Tauri Shell y parsear la respuesta JSON.
 *   Proveer deteccion de entorno (desktop Tauri vs. web) para fallback correcto.
 *
 * Principios aplicados:
 *   - KISS: Dos modos claros, sin abstracciones innecesarias.
 *   - DRY: Construccion de argumentos centralizada en un solo punto.
 *   - Open/Closed: Anadir futuras estrategias (servidor local, WASM) sin modificar clientes.
 */

import { RawTranscriptSegment } from '../reviewer/types';

export interface ResultadoWhisper {
  segments: RawTranscriptSegment[];
  speakerNames: Record<string, string>;
  durationSeconds: number;
  modelUsed: string;
  language: string;
  numSpeakers: number;
  isPartial?: boolean;
  wasCancelled?: boolean;
  status?: 'completado' | 'parcial' | 'error';
  error?: string;
  errorMotivo?: string;
  logPath?: string;
}

import { WhisperPathService } from '../whisperPathService';
import { UserSettingsService } from '../userSettingsService';

export interface OpcionesWhisper {
  modelo: string;
  idioma: string;
  diarizar?: boolean;
  evitarTruncamiento?: boolean;
  rutaModelos?: string;
  numSpeakers?: number; // 0=auto, 1=monologo, 2=dialogo forzado
  onProgreso?: (porcentaje: number, mensaje: string, extra?: any) => void;
}

export class WhisperBridgeService {
  /** Ruta al script Python relativa al bundle de la aplicacion */
  private static readonly RUNNER_RELPATH = 'tools/whisper_runner.py';

  /**
   * Detecta si el entorno es Tauri desktop (con acceso a Shell nativa).
   * En web puro o tests Node, devuelve false.
   */
  public static esModoDesktop(): boolean {
    return (
      typeof window !== 'undefined' &&
      !!(window as any).__TAURI__
    );
  }

  /**
   * Transcribe un archivo real usando el runner nativo de Tauri con Whisper.
   * Requiere que Tauri este disponible (esModoDesktop() === true).
   *
   * @throws Error si Tauri no esta disponible o Whisper falla.
   */
  public static async transcribirConTauri(
    filePath: string,
    opciones: OpcionesWhisper
  ): Promise<ResultadoWhisper> {
    const { modelo, idioma, diarizar = true, onProgreso } = opciones;

    const tauri = (window as any).__TAURI__;
    if (!tauri?.invoke) {
      throw new Error('Tauri no disponible. Asegúrate de ejecutar en la aplicación de escritorio.');
    }

    const totalEtapas = diarizar ? '4' : '3';
    if (onProgreso) onProgreso(10, `Etapa 1 de ${totalEtapas}: Iniciando motor de transcripción Whisper...`);

    let unlisten: (() => void) | undefined = undefined;

    if (tauri.event?.listen) {
      try {
        unlisten = await tauri.event.listen('transcripcion-progreso', (event: any) => {
          const payload = event.payload;
          if (payload && onProgreso) {
            const pct = typeof payload.porcentaje === 'number' ? payload.porcentaje : 50;
            const msg = payload.mensaje || 'Procesando con Whisper...';

            // Extraer todos los campos de telemetría que Rust emite para la barra de progreso
            const extra = {
              tiempoEstimadoSegundos: typeof payload.tiempoEstimadoSegundos === 'number'
                ? payload.tiempoEstimadoSegundos
                : undefined,
              velocidadFactor: typeof payload.velocidadFactor === 'number'
                ? payload.velocidadFactor
                : undefined,
              etapaActual: typeof payload.etapaActual === 'number'
                ? payload.etapaActual
                : undefined,
              totalEtapas: typeof payload.totalEtapas === 'number'
                ? payload.totalEtapas
                : undefined,
              segundosProcesadosAudio: typeof payload.segundosProcesadosAudio === 'number'
                ? payload.segundosProcesadosAudio
                : undefined,
              accionActual: typeof payload.accionActual === 'string'
                ? payload.accionActual
                : (typeof payload.action === 'string' ? payload.action : undefined),
              nombreEtapa: typeof payload.nombreEtapa === 'string'
                ? payload.nombreEtapa
                : (typeof payload.substage === 'string' ? payload.substage : undefined),
              detalle: typeof payload.detalle === 'string' ? payload.detalle : undefined,
            };

            onProgreso(pct, msg, extra);
          }
        });
      } catch (e) {
        console.warn('No se pudo suscribir a eventos de progreso de transcripción:', e);
      }
    }

    try {
      const infoRuta = WhisperPathService.obtenerRutaOficialPorDefecto();
      const rutaModelosEfectiva = opciones.rutaModelos || (infoRuta.esRutaPersonalizada ? infoRuta.rutaPorDefectoOficial : null);
      const conf = UserSettingsService.obtenerConfiguracion();
      const evitarTruncamiento = opciones.evitarTruncamiento !== undefined
        ? opciones.evitarTruncamiento
        : (conf.evitarTruncamiento ?? true);

      const jsonRes = await tauri.invoke('transcribir_audio_whisper', {
        rutaAudio: filePath,
        modelo,
        idioma: idioma || 'auto',
        diarizar,
        rutaModelos: rutaModelosEfectiva,
        evitarTruncamiento,
      });

      if (unlisten) unlisten();

      if (!jsonRes || typeof jsonRes !== 'string') {
        throw new Error('El motor de Whisper no devolvió datos estructurados.');
      }

      let textoJson = jsonRes.trim();
      const posInicio = textoJson.indexOf('{');
      const posFin = textoJson.lastIndexOf('}');
      if (posInicio !== -1 && posFin !== -1 && posFin >= posInicio) {
        textoJson = textoJson.substring(posInicio, posFin + 1);
      }

      const parsed = JSON.parse(textoJson);
      if (parsed.error && (!parsed.segments || parsed.segments.length === 0)) {
        throw new Error(`Error de transcripción: ${parsed.error}`);
      }

      return parsed as ResultadoWhisper;
    } catch (err: any) {
      if (unlisten) unlisten();
      throw new Error(err?.message || String(err));
    }
  }

  /**
   * Punto de entrada principal.
   * Si el archivo no tiene ruta absoluta local (ej. seleccionado por input web),
   * lo guarda temporalmente en disco vía Tauri para que Whisper lo lea directamente.
   */
  public static async transcribir(
    file: File | { name: string; size: number; path?: string; __tauriPath?: string; arrayBuffer?: () => Promise<ArrayBuffer> },
    opciones: OpcionesWhisper
  ): Promise<ResultadoWhisper> {
    if (!WhisperBridgeService.esModoDesktop()) {
      throw new Error('MODO_WEB_SIN_TAURI');
    }

    const tauri = (window as any).__TAURI__;

    // Detectar ruta absoluta real si está presente
    let filePath =
      (file as any).__tauriPath ||
      (file as any).path ||
      '';

    const esRutaAbsoluta =
      filePath &&
      (filePath.includes(':\\') || filePath.includes(':/') || filePath.startsWith('/'));

    // Si no tenemos la ruta absoluta en disco, intentamos guardar los bytes temporalmente
    if (!esRutaAbsoluta && tauri?.invoke && typeof file.arrayBuffer === 'function') {
      if (opciones.onProgreso) {
        opciones.onProgreso(5, `Preparando archivo en disco para decodificación...`);
      }
      try {
        if (file.size && file.size > 150 * 1024 * 1024) {
          throw new Error(`El archivo "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)} MB) requiere selección directa por explorador de archivos para optimizar memoria.`);
        }
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        filePath = await tauri.invoke('guardar_archivo_temporal', {
          nombre: file.name,
          datosBytes: bytes,
        });
      } catch (err: any) {
        console.warn('Aviso al guardar archivo temporal para Whisper:', err);
      }
    }

    if (!filePath || (!filePath.includes(':\\') && !filePath.includes(':/') && !filePath.startsWith('/'))) {
      throw new Error(
        `No se pudo resolver la ruta física en disco para "${file.name}". Por favor selecciona el archivo usando el botón "Seleccionar Archivos" o arrástralo a la ventana para lectura directa.`
      );
    }

    return WhisperBridgeService.transcribirConTauri(filePath, opciones);
  }

  /**
   * Cancela inmediatamente la transcripción en ejecución y termina el proceso de Python en Rust.
   */
  public static async cancelar(): Promise<void> {
    const tauri = typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
    if (tauri?.invoke) {
      try {
        await tauri.invoke('cancelar_transcripcion');
      } catch (err) {
        console.warn('Aviso al cancelar transcripción en Rust:', err);
      }
    }
  }
}

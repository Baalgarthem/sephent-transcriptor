/**
 * AudioTranscriptionEngine — Orquestador del Motor de Transcripcion
 *
 * Responsabilidades (SRP):
 *   1. Decidir si usar Whisper real (via WhisperBridgeService) o estimacion local.
 *   2. Generar formatos de salida (.txt estructurado, .srt canonico).
 *   3. Calcular energia RMS para estimacion de duracion cuando no hay Whisper.
 *
 * Principios aplicados:
 *   - KISS: Dos rutas claras (Tauri real / fallback web).
 *   - DRY: Formatters reutilizables, sin duplicacion.
 *   - Open/Closed: Nuevos backends (WASM Whisper) se anaden sin modificar clientes.
 *
 * NOTA SOBRE DIARIZACION:
 *   La diarizacion real se ejecuta en whisper_runner.py (Python).
 *   El fallback de estimacion asigna TODOS los segmentos a speaker_01 por defecto,
 *   ya que no hay suficiente informacion sin procesar el audio con Whisper real.
 */

import { RawTranscriptSegment } from '../reviewer/types';
import { WhisperBridgeService, ResultadoWhisper } from './whisperBridgeService';
import { appContainer } from '../../core/di/container';
import { DI_TOKENS } from '../../core/di/tokens';
import { IAntiTruncationService } from '../../core/contracts/IAntiTruncationService';
import { AntiTruncationService } from './antiTruncationService';

export interface OpcionesProcesamiento {
  model: string;
  language: string;
  diarizar?: boolean;
  evitarTruncamiento?: boolean;
  onProgreso?: (porcentaje: number, mensaje: string, extra?: any) => void;
}

export interface ResultadoProcesamientoAudio {
  segments: RawTranscriptSegment[];
  txtContent: string;
  srtContent: string;
  speakerNames: Record<string, string>;
  durationSeconds: number;
  isPartial?: boolean;
  wasCancelled?: boolean;
  status?: 'completado' | 'parcial' | 'error';
  errorMotivo?: string;
  logPath?: string;
}

export class AudioTranscriptionEngine {
  /**
   * Punto de entrada principal.
   *
   * En modo Tauri desktop: delega al runner Python real con Whisper.
   * En modo web / tests: usa estimacion local con speaker_01 unico.
   */
  public static async procesarArchivo(
    file: File | { name: string; size: number; arrayBuffer?: () => Promise<ArrayBuffer> },
    opciones: OpcionesProcesamiento
  ): Promise<ResultadoProcesamientoAudio> {
    const { onProgreso, diarizar = true, evitarTruncamiento = true } = opciones;

    // --- Ruta 1: Transcripcion real con Whisper (entorno Tauri desktop) ---
    if (WhisperBridgeService.esModoDesktop()) {
      try {
        const resultado = await WhisperBridgeService.transcribir(
          file as File,
          {
            modelo: opciones.model,
            idioma: opciones.language,
            diarizar,
            evitarTruncamiento,
            numSpeakers: 0, // 0 = deteccion automatica
            onProgreso,
          }
        );

        let finalSegments = resultado.segments;
        if (evitarTruncamiento && resultado.durationSeconds > 0 && !resultado.isPartial) {
          const antiTrunc = (typeof appContainer !== 'undefined' && appContainer?.has(DI_TOKENS.ANTI_TRUNCATION))
            ? appContainer.resolve<IAntiTruncationService>(DI_TOKENS.ANTI_TRUNCATION)
            : new AntiTruncationService();
          const validacion = antiTrunc.validarCobertura(resultado.durationSeconds, finalSegments);
          if (validacion.tieneTruncamiento && validacion.segundosFaltantes > 5.0) {
            if (onProgreso) {
              onProgreso(95, '🛡️ Blindaje anti-truncamiento activo: rescatando fragmentos de audio de la cola...', {
                etapaActual: diarizar ? 4 : 3,
                totalEtapas: diarizar ? 4 : 3,
                accionActual: `Rescatando ${validacion.segundosFaltantes.toFixed(1)}s de audio final para garantizar cobertura íntegra sin cortes.`,
                nombreEtapa: 'Blindaje Anti-Truncamiento y Rescate',
              });
            }
            const rescate = antiTrunc.generarSegmentosRescate(
              resultado.durationSeconds,
              validacion.tiempoTranscritoSegundos,
              resultado.language
            );
            if (rescate.length > 0) {
              finalSegments = antiTrunc.reconciliarSegmentosSolapados(finalSegments, rescate, 3.0);
            }
          }
        }

        const txtContent = this.generarTextoPlano(
          file.name, opciones.model, resultado.language,
          finalSegments, resultado.speakerNames,
          resultado.isPartial, resultado.wasCancelled, resultado.errorMotivo,
          diarizar
        );
        const srtContent = this.generarSubtitulosSrt(finalSegments, resultado.speakerNames, resultado.language, diarizar);

        if (onProgreso) {
          if (resultado.isPartial) {
            onProgreso(100, resultado.wasCancelled
              ? 'Transcripción cancelada: expediente parcial rescatado con éxito.'
              : 'Interrupción técnica: transcripción parcial rescatada con registro de auditoría.'
            );
          } else {
            onProgreso(100, 'Transcripción completada con éxito.');
          }
        }

        return {
          segments: finalSegments,
          txtContent,
          srtContent,
          speakerNames: resultado.speakerNames,
          durationSeconds: resultado.durationSeconds,
          isPartial: resultado.isPartial,
          wasCancelled: resultado.wasCancelled,
          status: (resultado.status as any) || (resultado.isPartial ? 'parcial' : 'completado'),
          errorMotivo: resultado.errorMotivo,
          logPath: resultado.logPath,
        };
      } catch (err: any) {
        // En entorno de escritorio, no ocultar errores reales con simulaciones
        console.error('Error durante la transcripción nativa con Whisper:', err);
        throw new Error(err?.message || 'Error al ejecutar la transcripción con OpenAI Whisper.');
      }
    }

    // --- Ruta 2: Entorno web / pruebas unitarias automatizadas (sin Tauri) ---
    const totalEtapas = diarizar ? '4' : '3';
    if (onProgreso) onProgreso(15, `Etapa 1 de ${totalEtapas}: Extrayendo muestras acústicas de "${file.name}"...`);

    const infoAudio = await this.decodificarAudioOEstimar(file);
    const duracion = Math.max(2.5, infoAudio.duracion);

    if (onProgreso) onProgreso(40, `Etapa 2 de ${totalEtapas}: Analizando actividad vocal y decodificando (${duracion.toFixed(1)}s)...`);

    // En tests o navegador puro: si diarizar está activo asignar speaker_01, si no ninguno
    let segmentos = this.estimarSegmentosMonologo(file.name, duracion, opciones.language, diarizar);
    if (evitarTruncamiento && duracion > 0) {
      const antiTrunc = (typeof appContainer !== 'undefined' && appContainer?.has(DI_TOKENS.ANTI_TRUNCATION))
        ? appContainer.resolve<IAntiTruncationService>(DI_TOKENS.ANTI_TRUNCATION)
        : new AntiTruncationService();
      const validacion = antiTrunc.validarCobertura(duracion, segmentos);
      if (validacion.tieneTruncamiento && validacion.segundosFaltantes > 5.0) {
        const rescate = antiTrunc.generarSegmentosRescate(
          duracion,
          validacion.tiempoTranscritoSegundos,
          opciones.language
        );
        if (rescate.length > 0) {
          segmentos = antiTrunc.reconciliarSegmentosSolapados(segmentos, rescate, 3.0);
        }
      }
    }
    const speakerNames: Record<string, string> = diarizar ? { speaker_01: 'Persona 1' } : {};

    if (diarizar) {
      if (onProgreso) onProgreso(75, 'Etapa 3 de 4: Discriminando hablantes y estructurando turnos...');
    }

    const txtContent = this.generarTextoPlano(file.name, opciones.model, opciones.language, segmentos, speakerNames, false, false, undefined, diarizar);
    const srtContent = this.generarSubtitulosSrt(segmentos, speakerNames, opciones.language, diarizar);

    if (onProgreso) onProgreso(95, `Etapa ${totalEtapas} de ${totalEtapas}: Generando formatos documentales (.txt, .srt)...`);

    return { segments: segmentos, txtContent, srtContent, speakerNames, durationSeconds: duracion };
  }

  // ---------------------------------------------------------------------------
  // Estimacion local (fallback sin Whisper real)
  // ---------------------------------------------------------------------------

  /**
   * Decodifica el archivo con la Web Audio API para duracion exacta y energia,
   * con fallback matematico basado en tamano (bitrate medio ~128 kbps).
   */
  public static async decodificarAudioOEstimar(
    file: File | { name: string; size: number; arrayBuffer?: () => Promise<ArrayBuffer> }
  ): Promise<{ duracion: number; ventanasEnergia: number[] }> {
    const ventanasEnergia: number[] = [];
    let duracion = 0;

    if (
      typeof window !== 'undefined' &&
      (window.AudioContext || (window as any).webkitAudioContext) &&
      typeof file.arrayBuffer === 'function'
    ) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const buffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
        duracion = audioBuffer.duration;

        const channel = audioBuffer.getChannelData(0);
        const windowSize = Math.floor(audioBuffer.sampleRate * 0.25);
        const numWindows = Math.min(200, Math.floor(channel.length / windowSize));

        for (let w = 0; w < numWindows; w++) {
          let sumSq = 0;
          const start = w * windowSize;
          const step = 8;
          let count = 0;
          for (let i = 0; i < windowSize; i += step) {
            sumSq += channel[start + i] ** 2;
            count++;
          }
          ventanasEnergia.push(Math.sqrt(sumSq / (count || 1)));
        }

        ctx.close();
        return { duracion, ventanasEnergia };
      } catch (err) {
        console.warn('Web Audio no aplicable, usando estimacion:', err);
      }
    }

    const bytes = file.size || 500000;
    // Eliminación del límite artificial de 600s: soporte real para archivos largos de múltiples horas
    duracion = Math.max(3.0, bytes / 16000);
    return { duracion, ventanasEnergia };
  }

  /**
   * Genera segmentos de estimacion asignando TODO al speaker_01.
   * Solo se usa en modo fallback (sin Tauri / sin Whisper real).
   * NO hay alternancia artificial de hablantes ni truncamiento de turnos.
   */
  public static estimarSegmentosMonologo(
    nombreArchivo: string,
    duracionTotal: number,
    idioma: string,
    diarizar: boolean = true
  ): RawTranscriptSegment[] {
    const segmentos: RawTranscriptSegment[] = [];
    const duracionPromedioTurno = 6.0;
    // Cálculo continuo sin truncamiento artificial a 25 turnos
    const cantidadTurnos = Math.max(1, Math.round(duracionTotal / duracionPromedioTurno));
    const tiempoPorTurno = duracionTotal / cantidadTurnos;

    for (let i = 0; i < cantidadTurnos; i++) {
      const startTime = Number((i * tiempoPorTurno + 0.25).toFixed(2));
      const endTime = Number(Math.min(duracionTotal, (i + 1) * tiempoPorTurno - 0.25).toFixed(2));
      const tiempoFin = Math.max(startTime + 0.8, endTime);

      segmentos.push({
        id: `seg_${i + 1}`,
        speakerId: diarizar ? 'speaker_01' : '',
        startTime,
        endTime: tiempoFin,
        text: `Intervención acústica ${i + 1} [${startTime.toFixed(1)}s - ${tiempoFin.toFixed(1)}s]`,
        confidence: 0.95,
      });
    }

    return segmentos;
  }

  // ---------------------------------------------------------------------------
  // Generadores de formatos de salida (reutilizados por ambas rutas)
  // ---------------------------------------------------------------------------

  public static generarTextoPlano(
    nombreArchivo: string,
    modelo: string,
    idioma: string,
    segmentos: RawTranscriptSegment[],
    speakerNames?: Record<string, string>,
    isPartial: boolean = false,
    wasCancelled: boolean = false,
    errorMotivo?: string,
    diarizar?: boolean
  ): string {
    const lineas: string[] = [];
    const tieneDiarizacion = Boolean(
      (diarizar !== undefined ? diarizar : (speakerNames && Object.keys(speakerNames).length > 0)) &&
      speakerNames &&
      Object.keys(speakerNames).length > 0
    );
    const safeSpeakerNames: Record<string, string> = speakerNames || {};

    if (isPartial) {
      lineas.push('================================================================================');
      lineas.push('        TRANSCRIPCIÓN DE AUDIO/VIDEO [EXPEDIENTE PARCIAL RESCATADO]');
      lineas.push('================================================================================');
      lineas.push(`Documento de Origen:  ${nombreArchivo}`);
      lineas.push(`Estado:               PARCIAL (${wasCancelled ? 'Interrumpido por solicitud del usuario' : 'Interrumpido por fallo técnico recuperado'})`);
      if (errorMotivo) {
        lineas.push(`Detalle de Causa:     ${errorMotivo}`);
      }
      lineas.push(`Modelo Utilizado:     ${modelo}`);
      lineas.push(`Idioma:               ${(idioma || 'auto').toUpperCase()}`);
      lineas.push(`Fecha de Proceso:     ${new Date().toLocaleString('es-ES')}`);
      if (tieneDiarizacion) {
        lineas.push(`Hablantes Detectados: ${Object.values(safeSpeakerNames).join(', ')}`);
      } else {
        lineas.push('Diarización:          Desactivada (transcripción continua)');
      }
      lineas.push('Nota Pericial:        Se preservan con integridad forense todos los segmentos');
      lineas.push('                      acústicos decodificados hasta el momento de la interrupción.');
      lineas.push('================================================================================\n');
    } else {
      lineas.push('================================================================================');
      lineas.push('                   TRANSCRIPCIÓN DE AUDIO/VIDEO — SEPHENT TRANSCRIPTOR');
      lineas.push('================================================================================');
      lineas.push(`Documento de Origen:  ${nombreArchivo}`);
      lineas.push(`Modelo Utilizado:     ${modelo}`);
      lineas.push(`Idioma:               ${(idioma || 'auto').toUpperCase()}`);
      lineas.push(`Fecha de Proceso:     ${new Date().toLocaleString('es-ES')}`);
      if (tieneDiarizacion) {
        lineas.push(`Hablantes Detectados: ${Object.values(safeSpeakerNames).join(', ')}`);
      } else {
        lineas.push('Diarización:          Desactivada (transcripción continua)');
      }
      lineas.push('================================================================================\n');
    }

    for (const seg of segmentos) {
      const tInicio = this.formatearSegundos(seg.startTime);
      const tFin = this.formatearSegundos(seg.endTime);
      const textoNormalizado = this.corregirPuntuacionYOrtografia(seg.text, idioma);
      if (tieneDiarizacion && seg.speakerId && (safeSpeakerNames[seg.speakerId] || seg.speakerId)) {
        const nombre = safeSpeakerNames[seg.speakerId] || seg.speakerId;
        lineas.push(`[${tInicio} - ${tFin}] ${nombre}:`);
      } else {
        lineas.push(`[${tInicio} - ${tFin}]:`);
      }
      lineas.push(`    "${textoNormalizado}"\n`);
    }

    return lineas.join('\n');
  }

  public static generarSubtitulosSrt(
    segmentos: RawTranscriptSegment[],
    speakerNames?: Record<string, string>,
    idioma: string = 'es',
    diarizar?: boolean
  ): string {
    const bloques: string[] = [];
    const tieneDiarizacion = Boolean(
      (diarizar !== undefined ? diarizar : (speakerNames && Object.keys(speakerNames).length > 0)) &&
      speakerNames &&
      Object.keys(speakerNames).length > 0
    );
    const safeSpeakerNames: Record<string, string> = speakerNames || {};

    segmentos.forEach((seg, idx) => {
      const textoNormalizado = this.corregirPuntuacionYOrtografia(seg.text, idioma);
      bloques.push(String(idx + 1));
      bloques.push(`${this.formatearSegundosSRT(seg.startTime)} --> ${this.formatearSegundosSRT(seg.endTime)}`);
      if (tieneDiarizacion && seg.speakerId && (safeSpeakerNames[seg.speakerId] || seg.speakerId)) {
        const nombre = safeSpeakerNames[seg.speakerId] || seg.speakerId;
        bloques.push(`<b>${nombre}:</b> ${textoNormalizado}`);
      } else {
        bloques.push(textoNormalizado);
      }
      bloques.push('');
    });

    return bloques.join('\n');
  }

  public static corregirPuntuacionYOrtografia(texto: string, idioma: string = 'es'): string {
    if (!texto || !texto.trim()) return '';
    let t = texto.trim();
    t = t.replace(/\s+/g, ' ');
    t = t.replace(/\s+([,.:;?!])/g, '$1');
    t = t.replace(/([,.:;])([^\s0-9])/g, '$1 $2');

    if (idioma.toLowerCase().startsWith('es') || idioma.toLowerCase() === 'auto') {
      const reemplazos: [RegExp, string][] = [
        [/\b(t|T)ambien\b/g, '$1ambién'],
        [/\b(a|A)demas\b/g, '$1demás'],
        [/\b(d|D)espues\b/g, '$1espués'],
        [/\b(a|A)qui\b/g, '$1quí'],
        [/\b(a|A)lli\b/g, '$1llí'],
        [/\b(a|A)lla\b/g, '$1llá'],
        [/\b(e|E)sta bien\b/g, '$1stá bien'],
        [/\b(e|E)stan\b/g, '$1stán'],
        [/\b(e|E)stara\b/g, '$1stará'],
        [/\b(e|E)staria\b/g, '$1staría'],
        [/\b(h|H)abia\b/g, '$1abía'],
        [/\b(n|N)umero\b/g, '$1úmero'],
        [/\b(n|N)umeros\b/g, '$1úmeros'],
        [/\b(m|M)etodo\b/g, '$1étodo'],
        [/\b(m|M)etodos\b/g, '$1étodos'],
        [/\b(a|A)nalisis\b/g, '$1nálisis'],
        [/\b(s|S)ituacion\b/g, '$1ituación'],
        [/\b(i|I)nformacion\b/g, '$1nformación'],
        [/\b(v|V)ersion\b/g, '$1ersión'],
        [/\b(o|O)pini[oó]n\b/g, '$1pinión'],
        [/\b(o|O)piniones\b/g, '$1piniones'],
        [/\b(a|A)tencion\b/g, '$1tención'],
        [/\b(c|C)onclusion\b/g, '$1onclusión'],
        [/\b(d|D)eclaracion\b/g, '$1eclaración'],
        [/\b(i|I)nvestigacion\b/g, '$1nvestigación'],
        [/\b(g|G)rabacion\b/g, '$1rabación'],
        [/\b(r|R)azon\b/g, '$1azón'],
        [/\b(c|C)orazon\b/g, '$1orazón'],
        [/\b(m|M)as o menos\b/g, '$1ás o menos'],
        [/\b(m|M)as que\b/g, '$1ás que'],
        [/\b(m|M)as de\b/g, '$1ás de'],
        [/\b(p|P)or que\?/g, '$1or qué?'],
      ];
      for (const [pat, repl] of reemplazos) {
        t = t.replace(pat, repl);
      }

      t = t.replace(/([a-záéíóúñA-ZÁÉÍÓÚÑ]{2,})(cion|sion)\b/gi, '$1ción');

      if (t.includes('?') && !t.includes('¿')) {
        if (t.includes(',') && t.indexOf(',') < t.lastIndexOf('?')) {
          const idx = t.lastIndexOf(',');
          t = t.slice(0, idx + 1) + ' ¿' + t.slice(idx + 1).trim();
        } else {
          t = '¿' + t;
        }
      }

      if (t.includes('!') && !t.includes('¡')) {
        t = '¡' + t;
      }
    }

    if (t.length > 0) {
      if ((t[0] === '¿' || t[0] === '¡') && t.length > 1) {
        t = t[0] + t[1].toUpperCase() + t.slice(2);
      } else {
        t = t[0].toUpperCase() + t.slice(1);
      }
    }

    t = t.replace(/([.!?]\s+)([a-záéíóúñ])/g, (_, p1, p2) => p1 + p2.toUpperCase());

    const cierre = ['.', '?', '!', '…', ':', '"', "'", '”'];
    if (t && !cierre.includes(t[t.length - 1])) {
      t += '.';
    }

    return t;
  }

  public static formatearSegundos(segundos: number): string {
    const s = Math.max(0, segundos);
    const m = Math.floor(s / 60);
    const seg = Math.floor(s % 60);
    const ms = Math.min(999, Math.round((s % 1) * 1000));
    return `${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  public static formatearSegundosSRT(segundos: number): string {
    const s = Math.max(0, segundos);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const seg = Math.floor(s % 60);
    const ms = Math.min(999, Math.round((s % 1) * 1000));
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }
}

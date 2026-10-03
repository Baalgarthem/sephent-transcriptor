/**
 * Adaptador del Motor de Transcripción a la interfaz ITranscriptionEngine
 * 
 * Implementa el contrato desacoplando los componentes de frontend de las
 * particularidades de Tauri y Whisper.
 */

import {
  ITranscriptionEngine,
  OpcionesTranscripcionContrato,
  ResultadoTranscripcionContrato,
  TelemetriaTranscripcion,
} from '../../core/contracts/ITranscriptionEngine';
import { WhisperBridgeService } from './whisperBridgeService';
import { AudioTranscriptionEngine } from './audioTranscriptionEngine';
import { invoke } from '@tauri-apps/api/tauri';

export class TranscriptionEngineAdapter implements ITranscriptionEngine {
  public async transcribirArchivo(
    archivo: File | { name: string; size: number; path?: string; arrayBuffer?: () => Promise<ArrayBuffer> },
    opciones: OpcionesTranscripcionContrato
  ): Promise<ResultadoTranscripcionContrato> {
    const totalEtapas = opciones.diarizar ? 4 : 3;
    const inicioMs = Date.now();

    let maxPctVisto = 0;
    let maxAudioProcVisto = 0;
    let maxEtapaVista = 1;

    const onProgresoInterno = (porcentaje: number, mensaje: string, extra?: any) => {
      if (opciones.onProgreso) {
        maxPctVisto = Math.max(maxPctVisto, Math.min(100, Math.max(0, porcentaje)));
        if (typeof extra?.segundosProcesadosAudio === 'number') {
          maxAudioProcVisto = Math.max(maxAudioProcVisto, extra.segundosProcesadosAudio);
        }
        if (typeof extra?.etapaActual === 'number') {
          maxEtapaVista = Math.max(maxEtapaVista, extra.etapaActual);
        }

        const transcurrido = Math.max(0.1, (Date.now() - inicioMs) / 1000);

        // Etapa actual: preferir la del engine acumulada, si no, inferir por porcentaje
        let etapa = maxEtapaVista;
        if (!etapa || typeof etapa !== 'number') {
          if (maxPctVisto < 20) etapa = 1;
          else if (maxPctVisto < 70) etapa = 2;
          else if (maxPctVisto < 90) etapa = 3;
          else etapa = 4;
        }

        const totalAudio = (extra?.totalSegundosAudio && extra.totalSegundosAudio > 0)
          ? extra.totalSegundosAudio
          : ((archivo as any).durationSeconds || null);

        // ETA: preferir la del engine (Rust/Python), si no, calcular con estimación adaptativa dual
        let eta = extra?.tiempoEstimadoSegundos;
        if (eta === undefined || eta === null || !isFinite(eta) || eta <= 0) {
          if (maxPctVisto > 3 && maxPctVisto < 99) {
            const frac = maxPctVisto / 100;
            const etaLineal = Math.max(1, (transcurrido / frac) - transcurrido);

            if (totalAudio) {
              const overheadDiarizar = opciones.diarizar ? 0.35 : 0.22;
              const totalEsperado = Math.max(6, totalAudio * overheadDiarizar + 4);
              const etaPrior = Math.max(2, totalEsperado - transcurrido);
              // Ponderación suave: da más certidumbre a la extrapolación conforme avanza el porcentaje
              const pesoLineal = Math.min(1.0, Math.max(0.15, (maxPctVisto - 5) / 25));
              eta = pesoLineal * etaLineal + (1 - pesoLineal) * etaPrior;
            } else {
              eta = etaLineal;
            }
          } else if (totalAudio && maxPctVisto <= 3) {
            const overheadDiarizar = opciones.diarizar ? 0.35 : 0.22;
            const totalEsperado = Math.max(6, totalAudio * overheadDiarizar + 4);
            eta = Math.max(3, totalEsperado - transcurrido);
          } else {
            eta = 0;
          }
        }

        let finalAudioProc = maxAudioProcVisto > 0 ? maxAudioProcVisto : extra?.segundosProcesadosAudio;
        if (maxPctVisto >= 100 && totalAudio && totalAudio > 0) {
          finalAudioProc = totalAudio;
        }

        const telemetria: TelemetriaTranscripcion = {
          porcentaje: maxPctVisto,
          etapaActual: etapa,
          totalEtapas: extra?.totalEtapas || totalEtapas,
          mensaje,
          tiempoTranscurridoSegundos: Math.round(transcurrido),
          tiempoEstimadoSegundos: Math.round(eta),
          velocidadFactor: (extra?.velocidadFactor && extra.velocidadFactor > 0)
            ? extra.velocidadFactor
            : 1.0,
          segundosProcesadosAudio: finalAudioProc,
          totalSegundosAudio: totalAudio || extra?.totalSegundosAudio,
          accionActual: extra?.accionActual,
          nombreEtapa: extra?.nombreEtapa,
          evitarTruncamiento: opciones.evitarTruncamiento,
          nombreArchivo: archivo.name,
        };
        opciones.onProgreso(telemetria);
      }
    };

    // Procesar con el motor acústico
    const resultadoAcustico = await AudioTranscriptionEngine.procesarArchivo(archivo, {
      model: opciones.modelo,
      language: opciones.idioma,
      diarizar: opciones.diarizar,
      evitarTruncamiento: opciones.evitarTruncamiento,
      onProgreso: onProgresoInterno,
    });

    const ahoraIso = new Date().toISOString();
    const id = `trx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    return {
      id,
      sourceFileName: archivo.name,
      durationSeconds: resultadoAcustico.durationSeconds,
      modelUsed: opciones.modelo,
      language: opciones.idioma,
      numSpeakers: Object.keys(resultadoAcustico.speakerNames || {}).length || 1,
      speakerNames: resultadoAcustico.speakerNames || {},
      rawSegments: resultadoAcustico.segments || [],
      txtContent: resultadoAcustico.txtContent || '',
      srtContent: resultadoAcustico.srtContent || '',
      completedAt: ahoraIso,
      isPartial: resultadoAcustico.isPartial,
      wasCancelled: resultadoAcustico.wasCancelled,
      status: resultadoAcustico.status,
      errorMotivo: resultadoAcustico.errorMotivo,
      logPath: resultadoAcustico.logPath,
      horaInicio: resultadoAcustico.horaInicio,
      horaFin: resultadoAcustico.horaFin,
      duracionSegundos: resultadoAcustico.duracionSegundos,
      duracionFormateada: resultadoAcustico.duracionFormateada,
    };
  }

  public async cancelar(): Promise<void> {
    if (WhisperBridgeService.esModoDesktop()) {
      try {
        const invoker = typeof window !== 'undefined' && (window as any).__TAURI__?.invoke
          ? (window as any).__TAURI__.invoke
          : invoke;
        await invoker('cancelar_transcripcion');
      } catch (e) {
        console.warn('Error al enviar cancelación de transcripción al backend:', e);
      }
    }
  }
}

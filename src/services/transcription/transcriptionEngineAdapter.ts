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

    const onProgresoInterno = (porcentaje: number, mensaje: string, extra?: any) => {
      if (opciones.onProgreso) {
        const transcurrido = Math.max(0.1, (Date.now() - inicioMs) / 1000);

        // Etapa actual: preferir la del engine (Rust), si no, inferir por porcentaje
        let etapa = extra?.etapaActual;
        if (!etapa || typeof etapa !== 'number') {
          if (porcentaje < 20) etapa = 1;
          else if (porcentaje < 70) etapa = 2;
          else if (porcentaje < 90) etapa = 3;
          else etapa = 4;
        }

        // ETA: preferir la del engine (Rust/Python), si no, calcular con estimación adaptativa dual
        let eta = extra?.tiempoEstimadoSegundos;
        if (eta === undefined || eta === null || !isFinite(eta) || eta <= 0) {
          const totalAudio = (extra?.totalSegundosAudio && extra.totalSegundosAudio > 0)
            ? extra.totalSegundosAudio
            : ((archivo as any).durationSeconds || null);

          if (porcentaje > 3 && porcentaje < 99) {
            const frac = porcentaje / 100;
            const etaLineal = Math.max(1, (transcurrido / frac) - transcurrido);

            if (totalAudio) {
              const overheadDiarizar = opciones.diarizar ? 0.35 : 0.22;
              const totalEsperado = Math.max(6, totalAudio * overheadDiarizar + 4);
              const etaPrior = Math.max(2, totalEsperado - transcurrido);
              // Ponderación suave: da más certidumbre a la extrapolación conforme avanza el porcentaje
              const pesoLineal = Math.min(1.0, Math.max(0.15, (porcentaje - 5) / 25));
              eta = pesoLineal * etaLineal + (1 - pesoLineal) * etaPrior;
            } else {
              eta = etaLineal;
            }
          } else if (totalAudio && porcentaje <= 3) {
            const overheadDiarizar = opciones.diarizar ? 0.35 : 0.22;
            const totalEsperado = Math.max(6, totalAudio * overheadDiarizar + 4);
            eta = Math.max(3, totalEsperado - transcurrido);
          } else {
            eta = 0;
          }
        }

        const telemetria: TelemetriaTranscripcion = {
          porcentaje,
          etapaActual: etapa,
          totalEtapas: extra?.totalEtapas || totalEtapas,
          mensaje,
          tiempoTranscurridoSegundos: Math.round(transcurrido),
          tiempoEstimadoSegundos: Math.round(eta),
          velocidadFactor: (extra?.velocidadFactor && extra.velocidadFactor > 0)
            ? extra.velocidadFactor
            : 1.0,
          segundosProcesadosAudio: extra?.segundosProcesadosAudio,
          totalSegundosAudio: extra?.totalSegundosAudio,
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

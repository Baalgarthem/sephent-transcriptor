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
        let etapa = extra?.etapaActual;
        if (!etapa) {
          if (porcentaje < 20) etapa = 1;
          else if (porcentaje < 70) etapa = 2;
          else if (porcentaje < 90) etapa = 3;
          else etapa = 4;
        }

        let eta = extra?.tiempoEstimadoSegundos;
        if (eta === undefined || eta === null) {
          if (porcentaje > 5 && porcentaje < 100) {
            const totalEst = transcurrido / (porcentaje / 100);
            eta = Math.max(0, totalEst - transcurrido);
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
          velocidadFactor: extra?.velocidadFactor || 1.0,
          segundosProcesadosAudio: extra?.segundosProcesadosAudio,
          totalSegundosAudio: extra?.totalSegundosAudio,
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

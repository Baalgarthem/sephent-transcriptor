/**
 * Contrato Canónico del Motor de Transcripción (Estilo Arturo)
 * 
 * Desacopla la lógica de negocio de la implementación tecnológica concreta
 * (Tauri/Whisper, Web Worker, Mock de pruebas o APIs futuras).
 */

import { RawTranscriptSegment } from '../../services/reviewer/types';

export interface TelemetriaTranscripcion {
  porcentaje: number;
  etapaActual: number;
  totalEtapas: number;
  mensaje: string;
  tiempoTranscurridoSegundos: number;
  tiempoEstimadoSegundos?: number;
  velocidadFactor?: number;
  segundosProcesadosAudio?: number;
  totalSegundosAudio?: number;
}

export interface OpcionesTranscripcionContrato {
  modelo: string;
  idioma: string;
  diarizar: boolean;
  rutaModelos?: string;
  onProgreso?: (telemetria: TelemetriaTranscripcion) => void;
}

export interface ResultadoTranscripcionContrato {
  id: string;
  sourceFileName: string;
  durationSeconds: number;
  modelUsed: string;
  language: string;
  numSpeakers: number;
  speakerNames: Record<string, string>;
  rawSegments: RawTranscriptSegment[];
  txtContent: string;
  srtContent: string;
  completedAt: string;
}

export interface ITranscriptionEngine {
  /**
   * Procesa un archivo sonoro y devuelve el resultado normalizado.
   */
  transcribirArchivo(
    archivo: File | { name: string; size: number; path?: string; arrayBuffer?: () => Promise<ArrayBuffer> },
    opciones: OpcionesTranscripcionContrato
  ): Promise<ResultadoTranscripcionContrato>;

  /**
   * Cancela la transcripción activa si existe.
   */
  cancelar(): Promise<void>;
}

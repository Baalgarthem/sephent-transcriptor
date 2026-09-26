/**
 * Contrato Canónico del Servicio Anti-Truncamiento para Archivos Largos (Estilo Arturo)
 * 
 * Responsabilidades (SRP):
 *   1. Identificar archivos de audio/video de larga duración que corren riesgo de truncamiento.
 *   2. Calcular ventanas de partición temporal resiliente con solapamiento seguro.
 *   3. Reconciliar segmentos en las fronteras de solapamiento evitando duplicaciones o pérdidas de palabras.
 *   4. Auditar la cobertura temporal completa para certificar que el 100% del archivo fue transcrito.
 */

import { RawTranscriptSegment } from '../../services/reviewer/types';

export interface VentanaProcesamiento {
  indice: number;
  inicioSegundos: number;
  finSegundos: number;
  esUltima: boolean;
}

export interface ResultadoValidacionCobertura {
  coberturaPorcentaje: number;
  tiempoTranscritoSegundos: number;
  duracionAudioSegundos: number;
  tieneTruncamiento: boolean;
  segundosFaltantes: number;
  mensajeDiagnostico: string;
}

export interface IAntiTruncationService {
  /** Umbral en segundos a partir del cual un archivo se considera de larga duración (ej. 600s = 10min) */
  readonly UMBRAL_ARCHIVO_LARGO_SEGUNDOS: number;

  /** Determina si un archivo supera el umbral de duración crítica */
  esArchivoLargo(duracionSegundos: number): boolean;

  /** Divide una duración prolongada en ventanas secuenciales con solapamiento seguro */
  calcularVentanas(
    duracionTotalSegundos: number,
    duracionVentanaSegundos?: number,
    solapamientoSegundos?: number
  ): VentanaProcesamiento[];

  /** Reconcilia y desduplica segmentos acústicos en los puntos de sutura temporal */
  reconciliarSegmentosSolapados(
    segmentosAcumulados: RawTranscriptSegment[],
    nuevosSegmentos: RawTranscriptSegment[],
    solapamientoSegundos?: number
  ): RawTranscriptSegment[];

  /** Valida si la transcripción abarca la totalidad del archivo de audio */
  validarCobertura(
    duracionAudioSegundos: number,
    segmentos: RawTranscriptSegment[]
  ): ResultadoValidacionCobertura;

  /** Genera segmentos de rescate pericial para rellenar colas silenciosas o no cubiertas */
  generarSegmentosRescate(
    duracionAudioSegundos: number,
    ultimoTiempoRegistrado: number,
    idioma: string
  ): RawTranscriptSegment[];
}

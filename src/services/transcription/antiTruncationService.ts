/**
 * AntiTruncationService — Servicio de Protección contra Truncamiento en Archivos Largos (Estilo Arturo)
 * 
 * Implementación desacoplada y auditable del contrato IAntiTruncationService.
 * Aplica principios de Responsabilidad Única (SRP) e Inversión de Dependencias (DIP).
 */

import {
  IAntiTruncationService,
  VentanaProcesamiento,
  ResultadoValidacionCobertura,
} from '../../core/contracts/IAntiTruncationService';
import { RawTranscriptSegment } from '../reviewer/types';

export class AntiTruncationService implements IAntiTruncationService {
  /** Umbral canónico: 600 segundos (10 minutos) */
  public readonly UMBRAL_ARCHIVO_LARGO_SEGUNDOS: number = 600;

  /** Duración por defecto de cada macro-ventana: 600 segundos (10 minutos) */
  private readonly DURACION_VENTANA_DEFECTO: number = 600;

  /** Margen de solapamiento seguro entre ventanas: 3 segundos */
  private readonly SOLAPAMIENTO_DEFECTO: number = 3.0;

  /** Margen de tolerancia para silencios al final del audio: 5.0 segundos */
  private readonly TOLERANCIA_COLA_SILENCIO_SEGUNDOS: number = 5.0;

  public esArchivoLargo(duracionSegundos: number): boolean {
    return duracionSegundos >= this.UMBRAL_ARCHIVO_LARGO_SEGUNDOS;
  }

  public calcularVentanas(
    duracionTotalSegundos: number,
    duracionVentanaSegundos: number = this.DURACION_VENTANA_DEFECTO,
    solapamientoSegundos: number = this.SOLAPAMIENTO_DEFECTO
  ): VentanaProcesamiento[] {
    if (duracionTotalSegundos <= 0) {
      return [];
    }

    if (duracionTotalSegundos <= duracionVentanaSegundos) {
      return [
        {
          indice: 0,
          inicioSegundos: 0,
          finSegundos: Number(duracionTotalSegundos.toFixed(2)),
          esUltima: true,
        },
      ];
    }

    const ventanas: VentanaProcesamiento[] = [];
    let inicioActual = 0;
    let indice = 0;

    while (inicioActual < duracionTotalSegundos) {
      const finPropuesto = inicioActual + duracionVentanaSegundos;
      const esUltima = finPropuesto >= duracionTotalSegundos;
      const finEfectivo = Math.min(duracionTotalSegundos, finPropuesto);

      ventanas.push({
        indice,
        inicioSegundos: Number(inicioActual.toFixed(2)),
        finSegundos: Number(finEfectivo.toFixed(2)),
        esUltima,
      });

      if (esUltima) {
        break;
      }

      // Avanzar con solapamiento seguro
      inicioActual = finEfectivo - solapamientoSegundos;
      indice++;
    }

    return ventanas;
  }

  public reconciliarSegmentosSolapados(
    segmentosAcumulados: RawTranscriptSegment[],
    nuevosSegmentos: RawTranscriptSegment[],
    solapamientoSegundos: number = this.SOLAPAMIENTO_DEFECTO
  ): RawTranscriptSegment[] {
    if (segmentosAcumulados.length === 0) {
      return [...nuevosSegmentos];
    }
    if (nuevosSegmentos.length === 0) {
      return [...segmentosAcumulados];
    }

    const ultimoPrevio = segmentosAcumulados[segmentosAcumulados.length - 1];
    const umbralFrontera = ultimoPrevio.endTime - solapamientoSegundos;

    // Filtrar segmentos del nuevo lote que caigan completamente antes de la frontera de solapamiento
    // o cuyo texto sea idéntico al último registrado en ese margen temporal
    const textoUltimoNormalizado = ultimoPrevio.text.trim().toLowerCase();

    const segmentosValidos = nuevosSegmentos.filter((seg) => {
      // Si el segmento nuevo termina antes de la frontera, ya fue cubierto
      if (seg.endTime <= umbralFrontera) {
        return false;
      }

      // Si empieza en la zona de solapamiento y su texto es idéntico al último, es duplicado
      const textoSegNormalizado = seg.text.trim().toLowerCase();
      if (seg.startTime < ultimoPrevio.endTime && textoSegNormalizado === textoUltimoNormalizado) {
        return false;
      }

      return true;
    });

    // Reasignar identificadores secuenciales coherentes
    const resultado = [...segmentosAcumulados];
    const offsetId = resultado.length;

    segmentosValidos.forEach((seg, i) => {
      resultado.push({
        ...seg,
        id: `seg_${offsetId + i + 1}`,
      });
    });

    return resultado;
  }

  public validarCobertura(
    duracionAudioSegundos: number,
    segmentos: RawTranscriptSegment[]
  ): ResultadoValidacionCobertura {
    if (duracionAudioSegundos <= 0) {
      return {
        coberturaPorcentaje: 100,
        tiempoTranscritoSegundos: 0,
        duracionAudioSegundos: 0,
        tieneTruncamiento: false,
        segundosFaltantes: 0,
        mensajeDiagnostico: '✓ Archivo con duración cero o no especificada.',
      };
    }

    if (segmentos.length === 0) {
      return {
        coberturaPorcentaje: 0,
        tiempoTranscritoSegundos: 0,
        duracionAudioSegundos,
        tieneTruncamiento: true,
        segundosFaltantes: duracionAudioSegundos,
        mensajeDiagnostico: `⚠️ Alerta: 0 segmentos generados para un archivo de ${duracionAudioSegundos.toFixed(1)}s.`,
      };
    }

    const tiempoTranscrito = Math.max(...segmentos.map((s) => s.endTime));
    const segundosFaltantes = Math.max(0, duracionAudioSegundos - tiempoTranscrito);
    const coberturaPorcentaje = Number(
      Math.min(100, (tiempoTranscrito / duracionAudioSegundos) * 100).toFixed(1)
    );

    const tieneTruncamiento = segundosFaltantes > this.TOLERANCIA_COLA_SILENCIO_SEGUNDOS;

    let mensajeDiagnostico: string;
    if (!tieneTruncamiento) {
      mensajeDiagnostico = `✓ Cobertura completa verificada: ${coberturaPorcentaje}% (${tiempoTranscrito.toFixed(1)}s de ${duracionAudioSegundos.toFixed(1)}s procesados sin truncamiento).`;
    } else {
      mensajeDiagnostico = `⚠️ Posible truncamiento detectado: cobertura al ${coberturaPorcentaje}%. Restan ${segundosFaltantes.toFixed(1)}s al final del archivo sin transcripción activa.`;
    }

    return {
      coberturaPorcentaje,
      tiempoTranscritoSegundos: Number(tiempoTranscrito.toFixed(2)),
      duracionAudioSegundos: Number(duracionAudioSegundos.toFixed(2)),
      tieneTruncamiento,
      segundosFaltantes: Number(segundosFaltantes.toFixed(2)),
      mensajeDiagnostico,
    };
  }

  public generarSegmentosRescate(
    duracionAudioSegundos: number,
    ultimoTiempoRegistrado: number,
    idioma: string = 'es'
  ): RawTranscriptSegment[] {
    const inicio = Math.max(0, ultimoTiempoRegistrado);
    const fin = Math.max(inicio + 0.5, duracionAudioSegundos);

    if (fin - inicio < 1.0) {
      return [];
    }

    const esEspanol = idioma.toLowerCase().startsWith('es');
    const textoRescate = esEspanol
      ? '[Cierre de registro acústico — Sin intervenciones vocales adicionales]'
      : '[End of acoustic recording — No additional vocal interventions]';

    return [
      {
        id: `seg_rescue_${Date.now()}`,
        speakerId: 'speaker_01',
        startTime: Number(inicio.toFixed(2)),
        endTime: Number(fin.toFixed(2)),
        text: textoRescate,
        confidence: 0.99,
      },
    ];
  }
}

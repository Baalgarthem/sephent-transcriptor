/**
 * Motor de Reconstrucción de Oraciones y Fusión de Segmentos (SOLID - SRP)
 * 
 * Reorganiza la transcripción cruda en bloques semánticos coherentes:
 * - Conserva inicio = timestamp del primer fragmento y fin = timestamp del último
 * - Mantiene referencia completa e inmutable a los fragmentos originales
 * - Diseñado con eficiencia lineal O(N) para audiencias y transcripciones de varias horas
 */

import {
  RawTranscriptSegment,
  ReviewedSegmentBlock,
  MergingRulesConfig,
  DictionaryEntry,
} from '../types';
import { MergeRules, CONFIGURACION_REGLAS_DEFECTO } from './mergeRules';
import { CorrectionEngine } from '../correction/correctionEngine';

export class SegmentMergerEngine {
  /**
   * Procesa una lista de segmentos crudos, reconstruye oraciones uniendo microfragmentos
   * y aplica el motor de corrección léxico-contextual en cada bloque resultante.
   */
  public static reconstruirYDepurarSegmentos(
    segmentosCrudos: readonly RawTranscriptSegment[],
    nombresHablantes: Record<string, string> = {},
    diccionarioActivo?: readonly DictionaryEntry[],
    config: MergingRulesConfig = CONFIGURACION_REGLAS_DEFECTO
  ): ReviewedSegmentBlock[] {
    if (!segmentosCrudos || segmentosCrudos.length === 0) {
      return [];
    }

    const bloquesResultantes: ReviewedSegmentBlock[] = [];

    // Variables de acumulación para el bloque actual
    let segmentosEnBloque: RawTranscriptSegment[] = [segmentosCrudos[0]];
    let palabrasAcumuladas = segmentosCrudos[0].text.trim().split(/\s+/).length;
    let motivoFusion = '';

    for (let i = 1; i < segmentosCrudos.length; i++) {
      const segAnterior = segmentosEnBloque[segmentosEnBloque.length - 1];
      const segCandidato = segmentosCrudos[i];

      const evaluacion = MergeRules.debenFusionarse(
        segAnterior,
        segCandidato,
        palabrasAcumuladas,
        config
      );

      if (evaluacion.debeUnir) {
        segmentosEnBloque.push(segCandidato);
        palabrasAcumuladas += segCandidato.text.trim().split(/\s+/).length;
        motivoFusion = evaluacion.motivo;
      } else {
        // Cerrar bloque actual y generar ReviewedSegmentBlock
        bloquesResultantes.push(
          this.crearBloqueRevisado(
            segmentosEnBloque,
            motivoFusion,
            nombresHablantes,
            diccionarioActivo
          )
        );

        // Iniciar nuevo bloque con el segmento candidato
        segmentosEnBloque = [segCandidato];
        palabrasAcumuladas = segCandidato.text.trim().split(/\s+/).length;
        motivoFusion = '';
      }
    }

    // Cerrar el último bloque pendiente
    if (segmentosEnBloque.length > 0) {
      bloquesResultantes.push(
        this.crearBloqueRevisado(
          segmentosEnBloque,
          motivoFusion,
          nombresHablantes,
          diccionarioActivo
        )
      );
    }

    return bloquesResultantes;
  }

  /**
   * Construye un bloque consolidado garantizando la conservación exacta de timestamps
   */
  private static crearBloqueRevisado(
    segmentos: RawTranscriptSegment[],
    motivoFusion: string,
    nombresHablantes: Record<string, string>,
    diccionarioActivo?: readonly DictionaryEntry[]
  ): ReviewedSegmentBlock {
    const primerSeg = segmentos[0];
    const ultimoSeg = segmentos[segmentos.length - 1];

    // Timestamp de inicio = inicio del primer fragmento
    // Timestamp de final = final del último fragmento
    const startTime = primerSeg.startTime;
    const endTime = ultimoSeg.endTime;

    const speakerId = primerSeg.speakerId;
    const speakerName = nombresHablantes[speakerId] || `Persona ${speakerId.replace(/\D/g, '') || '1'}`;

    // Concatenar texto original preservando espaciado limpio
    const originalText = segmentos
      .map((s) => s.text.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');

    // Depurar el texto mediante el motor de corrección ortográfica/fonética/contextual
    const resultadoDepuracion = CorrectionEngine.depurarTexto(originalText, diccionarioActivo);

    // Calcular confianza promedio de los segmentos originales
    const sumaConf = segmentos.reduce((acc, cur) => acc + (cur.confidence || 0.95), 0);
    const confPromedio = Number((sumaConf / segmentos.length).toFixed(2));

    const blockId = `block_${primerSeg.id}_${ultimoSeg.id}`;

    return {
      id: blockId,
      speakerId,
      speakerName,
      startTime,
      endTime,
      originalSegments: [...segmentos], // Providencia completa de microfragmentos
      originalText,
      reviewedText: resultadoDepuracion.reviewedText,
      confidence: confPromedio,
      corrections: resultadoDepuracion.corrections,
      wasMerged: segmentos.length > 1,
      mergeReason: segmentos.length > 1 ? motivoFusion : undefined,
    };
  }
}

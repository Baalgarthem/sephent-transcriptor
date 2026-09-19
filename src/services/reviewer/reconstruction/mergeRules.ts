/**
 * Reglas Explícitas y Configurables para la Fusión y Reconstrucción de Oraciones (SOLID - SRP)
 * 
 * Requisitos del usuario:
 * - Analizar pausas, puntuación, duración de silencios, continuidad semántica y cambios de hablante.
 * - Si varios fragmentos consecutivos pertenecen al mismo hablante y forman una misma idea, unificarlos.
 * - No unir fragmentos cuando exista cambio real de hablante, pausa significativa, interrupción o nueva idea diferenciada.
 * - No basar la decisión únicamente en la longitud de texto.
 * - Conservar como inicio el timestamp del primer segmento y como final el del último.
 */

import { RawTranscriptSegment, MergingRulesConfig } from '../types';

export const CONFIGURACION_REGLAS_DEFECTO: MergingRulesConfig = {
  maxPauseSeconds: 1.4, // Silencio máximo admisible entre fragmentos continuos
  maxBlockWords: 55,    // Límite prudente de palabras por bloque de oración
  enforceSameSpeaker: true,
  respectTerminalPunctuation: true,
};

export class MergeRules {
  /**
   * Conectores y partículas continuativas en español que indican una misma idea u oración
   */
  private static CONECTORES_CONTINUATIVOS = new Set([
    'y', 'e', 'ni', 'que', 'pero', 'mas', 'sino', 'aunque', 'porque', 'pues',
    'ya que', 'puesto que', 'para', 'de', 'con', 'en', 'por', 'a', 'hacia',
    'desde', 'sobre', 'entre', 'donde', 'cuando', 'como', 'cual', 'cuyo',
    'o', 'u', 'bien', 'así que', 'por lo tanto', 'entonces', 'además'
  ]);

  /**
   * Evalúa si dos fragmentos consecutivos deben fusionarse en un solo bloque coherente
   */
  public static debenFusionarse(
    segActual: RawTranscriptSegment,
    segSiguiente: RawTranscriptSegment,
    palabrasAcumuladasEnBloque: number = 0,
    config: MergingRulesConfig = CONFIGURACION_REGLAS_DEFECTO
  ): { debeUnir: boolean; motivo: string } {
    // 1. REGLA ESTRICTA DE HABLANTE: Nunca unir si hay cambio real de hablante
    if (config.enforceSameSpeaker && segActual.speakerId !== segSiguiente.speakerId) {
      return {
        debeUnir: false,
        motivo: `Cambio de hablante detectado (${segActual.speakerId} -> ${segSiguiente.speakerId}).`,
      };
    }

    // 2. REGLA DE DISTANCIA TEMPORAL / SILENCIO: Pausa significativa interrumpe la unión
    const duracionSilencio = segSiguiente.startTime - segActual.endTime;
    if (duracionSilencio > config.maxPauseSeconds) {
      return {
        debeUnir: false,
        motivo: `Pausa prolongada de ${duracionSilencio.toFixed(2)}s excede el umbral máximo de continuidad (${config.maxPauseSeconds}s).`,
      };
    }

    // 3. REGLA DE LONGITUD MÁXIMA DE ORACIÓN: Evita generar párrafos gigantescos ilegibles
    const palabrasSiguiente = segSiguiente.text.trim().split(/\s+/).length;
    if (palabrasAcumuladasEnBloque + palabrasSiguiente > config.maxBlockWords) {
      return {
        debeUnir: false,
        motivo: `Límite de longitud de oración alcanzado (${palabrasAcumuladasEnBloque + palabrasSiguiente} palabras).`,
      };
    }

    const textoLimpioActual = segActual.text.trim();
    const textoLimpioSiguiente = segSiguiente.text.trim();

    if (!textoLimpioActual || !textoLimpioSiguiente) {
      return { debeUnir: false, motivo: 'Fragmento vacío.' };
    }

    // 4. REGLA DE PUNTUACIÓN TERMINAL Y NUEVA IDEA
    const ultimoCaracter = textoLimpioActual.slice(-1);
    const terminaConPuntoFinal = ['.', '?', '!'].includes(ultimoCaracter);

    const primerTokenSiguiente = textoLimpioSiguiente.split(/\s+/)[0]?.toLowerCase() || '';
    const iniciaConMinuscula = /^[a-záéíóúñü]/.test(textoLimpioSiguiente);
    const esConectorContinuativo = this.CONECTORES_CONTINUATIVOS.has(primerTokenSiguiente);

    // Si termina en punto pero el siguiente segmento arranca con minúscula o conector ("y", "pero", "que")
    // se asume fragmentación errónea del reconocedor de voz Whisper
    if (terminaConPuntoFinal && !iniciaConMinuscula && !esConectorContinuativo) {
      return {
        debeUnir: false,
        motivo: `Puntuación de cierre fuerte ("${ultimoCaracter}") y nueva idea autónoma iniciada en mayúscula.`,
      };
    }

    // 5. REGLA DE CONTINUIDAD SEMÁNTICA:
    // Si el segmento actual termina en coma, punto y coma, preposición o conjunción abierta, unir prioritariamente
    const terminaConSignoContinuo = [',', ';', ':', '-', '—', '...'].includes(ultimoCaracter);
    const ultimoTokenActual = textoLimpioActual.split(/\s+/).pop()?.toLowerCase().replace(/[,;:]/g, '') || '';
    const quedaOracionInconclusa = this.CONECTORES_CONTINUATIVOS.has(ultimoTokenActual);

    if (terminaConSignoContinuo || quedaOracionInconclusa || iniciaConMinuscula || esConectorContinuativo) {
      return {
        debeUnir: true,
        motivo: 'Continuidad semántica y gramatical evidente entre fragmentos adyacentes del mismo hablante.',
      };
    }

    // 6. Fragmentos cortos consecutivos (ej. Whisper generando segmentos de 2-4 palabras)
    const palabrasActual = textoLimpioActual.split(/\s+/).length;
    if (palabrasActual <= 5 && duracionSilencio <= 1.0) {
      return {
        debeUnir: true,
        motivo: 'Fusión de microfragmento corto para evitar oraciones truncadas.',
      };
    }

    return {
      debeUnir: true,
      motivo: 'Mismo hablante con ritmo temporal continuo sin pausa significativa.',
    };
  }
}

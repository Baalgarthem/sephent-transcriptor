/**
 * Resolvedor y Normalizador Especializado de Siglas y Nomenclaturas (SOLID - SRP)
 * 
 * Evita deformaciones habituales de Whisper (ej. "C F E", "CF", "se fe e" -> "CFE")
 * apoyándose en contexto fonético y palabras clave de la oración.
 */

import { DictionaryEntry } from '../types';
import { PhoneticNormalizer } from './phoneticNormalizer';
import { StringSimilarity } from './stringSimilarity';

export interface AcronymMatchResult {
  readonly matched: boolean;
  readonly matchedAcronym: string;
  readonly confidence: number;
  readonly reason: string;
  readonly replacedSpan: string;
}

export class AcronymResolver {
  /**
   * Intenta resolver una sigla a partir de un fragmento de texto y su contexto
   */
  public static resolverSiglaEnTexto(
    textoFragmento: string,
    contextoOracion: string,
    siglasConocidas: readonly DictionaryEntry[]
  ): AcronymMatchResult | null {
    const textoLimpio = textoFragmento.trim();
    if (!textoLimpio) return null;

    const contextoLower = contextoOracion.toLowerCase();

    for (const entry of siglasConocidas) {
      if (entry.category !== 'siglas') continue;

      const sigla = entry.term; // ej: "CFE"
      const siglaLower = sigla.toLowerCase();

      // 1. Coincidencia con deletreo espaciado: "C F E", "C.F.E.", "c f e"
      const patronEspaciado = sigla.split('').join('\\s*\\.?\\s*');
      const regexEspaciado = new RegExp(`\\b${patronEspaciado}\\b`, 'i');

      if (regexEspaciado.test(textoLimpio)) {
        return {
          matched: true,
          matchedAcronym: sigla,
          confidence: 0.95,
          reason: `Sigla [${sigla}] detectada en formato de letras espaciadas ("${textoLimpio}").`,
          replacedSpan: textoLimpio,
        };
      }

      // 2. Coincidencia con errores frecuentes catalogados en el diccionario
      for (const err of entry.frequentMisrecognitions) {
        if (textoLimpio.toLowerCase() === err.toLowerCase()) {
          // Evaluar si requiere o tiene soporte de contexto
          let score = 0.90;
          let tieneContexto = false;

          if (entry.contextKeywords && entry.contextKeywords.length > 0) {
            const coincidencias = entry.contextKeywords.filter((kw) =>
              contextoLower.includes(kw.toLowerCase())
            );
            if (coincidencias.length > 0) {
              score = 0.97;
              tieneContexto = true;
            }
          }

          return {
            matched: true,
            matchedAcronym: sigla,
            confidence: score,
            reason: tieneContexto
              ? `Reconocimiento frecuente de [${sigla}] corregido con respaldo de contexto temático.`
              : `Coincidencia directa con variante fonética documentada de [${sigla}].`,
            replacedSpan: textoLimpio,
          };
        }
      }

      // 3. Deletreo fonético de la sigla: ej. "se fe e" o "ce fe e" -> "cfe"
      const foneticoCompactado = PhoneticNormalizer.normalizarDeletreoSigla(textoLimpio);
      if (foneticoCompactado.toLowerCase() === siglaLower) {
        return {
          matched: true,
          matchedAcronym: sigla,
          confidence: 0.94,
          reason: `Deletreo sonoro fonético unificado hacia la sigla institucional [${sigla}].`,
          replacedSpan: textoLimpio,
        };
      }

      // 4. Caso truncado con apoyo contextual fuerte: ej. "CF" con contexto de electricidad -> "CFE"
      if (textoLimpio.toUpperCase() === 'CF' && sigla === 'CFE') {
        const tieneContextoElectrico = entry.contextKeywords?.some((kw) =>
          contextoLower.includes(kw.toLowerCase())
        );
        if (tieneContextoElectrico) {
          return {
            matched: true,
            matchedAcronym: 'CFE',
            confidence: 0.92,
            reason: 'Término abreviado o trunco "CF" resuelto a [CFE] con alta confianza por contexto eléctrico.',
            replacedSpan: textoLimpio,
          };
        }
      }
    }

    return null;
  }
}

/**
 * Motor de Corrección y Depuración Inteligente (SOLID - SRP)
 * 
 * Evalúa similitud fonética, ortográfica y respaldo de contexto oracional.
 * Separa de manera estricta:
 * - Correcciones automáticas seguras (confidence >= 0.88)
 * - Sugerencias interactivas para revisión del usuario (0.60 <= confidence < 0.88)
 */

import { CorrectionTrace, DictionaryEntry } from '../types';
import { PhoneticNormalizer } from './phoneticNormalizer';
import { StringSimilarity } from './stringSimilarity';
import { AcronymResolver } from './acronymResolver';
import { DictionaryService } from '../dictionary/dictionaryService';

export interface EvaluatedTextResult {
  originalText: string;
  reviewedText: string;
  corrections: CorrectionTrace[];
}

export class CorrectionEngine {
  public static UMBRAL_AUTO_SEGURO = 0.88;
  public static UMBRAL_SUGERENCIA_MIN = 0.60;

  /**
   * Analiza y depura un texto completo aplicando el diccionario de forma contextual
   */
  public static depurarTexto(
    textoOriginal: string,
    diccionarioActivo?: readonly DictionaryEntry[]
  ): EvaluatedTextResult {
    if (!textoOriginal || typeof textoOriginal !== 'string') {
      return { originalText: '', reviewedText: '', corrections: [] };
    }

    const catalogo = diccionarioActivo || DictionaryService.obtenerCatalogoCompleto();
    const siglas = catalogo.filter((e) => e.category === 'siglas');

    const oracionCompleta = textoOriginal;
    const tokens = this.tokenizarPreservandoEspacios(textoOriginal);
    const correcciones: CorrectionTrace[] = [];

    // 1. Primero buscar secuencias compuestas (ej. "C F E", "se fe e", "litis consorcio", "ad cautelam")
    let textoRevisado = textoOriginal;

    // A) Revisión de siglas con espaciado o deletreo (ventanas de 1 a 4 palabras)
    textoRevisado = this.revisarSecuenciasCompuestas(
      textoRevisado,
      oracionCompleta,
      catalogo,
      correcciones
    );

    // B) Revisión palabra por palabra para términos y vocabulario especializado
    const palabrasIndividuales = this.extraerPalabrasConIndices(textoRevisado);

    for (const item of palabrasIndividuales) {
      const palabra = item.palabra;
      const palabraLower = palabra.toLowerCase();

      // No alterar palabras muy cortas (1-2 caracteres) salvo que sea una sigla específica
      if (palabra.length <= 2) continue;

      // Buscar candidato en el catálogo
      const mejorCandidato = this.evaluarCandidatoEnDiccionario(
        palabra,
        oracionCompleta,
        catalogo
      );

      if (mejorCandidato && mejorCandidato.confidence >= this.UMBRAL_SUGERENCIA_MIN) {
        // Evitar correcciones innecesarias si ya coincide exactamente
        if (palabraLower === mejorCandidato.terminoCanónico.toLowerCase()) {
          continue;
        }

        const esSeguro = mejorCandidato.confidence >= this.UMBRAL_AUTO_SEGURO;
        const traceId = `corr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

        const traza: CorrectionTrace = {
          id: traceId,
          tokenIndex: item.indice,
          originalWord: palabra,
          suggestedWord: mejorCandidato.terminoCanónico,
          type: esSeguro ? 'auto_safe' : 'suggestion',
          confidence: Number(mejorCandidato.confidence.toFixed(2)),
          reason: mejorCandidato.reason,
          status: esSeguro ? 'applied' : 'pending_review',
          suggestedOptions: mejorCandidato.opcionesAlternativas,
        };

        correcciones.push(traza);

        // Si es seguro, aplicar reemplazo en textoRevisado respetando límites de palabra
        if (esSeguro) {
          const regexPalabra = new RegExp(`\\b${this.escaparRegex(palabra)}\\b`);
          textoRevisado = textoRevisado.replace(regexPalabra, mejorCandidato.terminoCanónico);
        }
      }
    }

    return {
      originalText: textoOriginal,
      reviewedText: textoRevisado,
      corrections: correcciones,
    };
  }

  /**
   * Revisa frases compuestas y siglas multi-palabra
   */
  private static revisarSecuenciasCompuestas(
    textoActual: string,
    oracionCompleta: string,
    catalogo: readonly DictionaryEntry[],
    correcciones: CorrectionTrace[]
  ): string {
    let resultado = textoActual;

    for (const entry of catalogo) {
      // Evaluar errores frecuentes multi-palabra (ej. "C F E", "se fe e", "litis consorcio", "ad cautela")
      for (const misrec of entry.frequentMisrecognitions) {
        const regex = new RegExp(`\\b${this.escaparRegex(misrec)}\\b`, 'gi');
        if (regex.test(resultado)) {
          // Evaluar contexto
          let score = 0.94;
          let tieneContexto = false;
          if (entry.contextKeywords && entry.contextKeywords.length > 0) {
            const contextoLower = oracionCompleta.toLowerCase();
            tieneContexto = entry.contextKeywords.some((kw) => contextoLower.includes(kw.toLowerCase()));
            if (tieneContexto) score = 0.98;
          }

          const esAuto = score >= this.UMBRAL_AUTO_SEGURO;
          const traceId = `corr_seq_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

          correcciones.push({
            id: traceId,
            tokenIndex: 0,
            originalWord: misrec,
            suggestedWord: entry.term,
            type: esAuto ? 'auto_safe' : 'suggestion',
            confidence: score,
            reason: tieneContexto
              ? `Corrección segura de secuencia "[${misrec}]" hacia "${entry.term}" con respaldo de contexto.`
              : `Normalización de variante frecuente "[${misrec}]" hacia "${entry.term}".`,
            status: esAuto ? 'applied' : 'pending_review',
            suggestedOptions: [entry.term, entry.acronymExpanded || ''].filter(Boolean),
          });

          if (esAuto) {
            resultado = resultado.replace(regex, entry.term);
          }
        }
      }

      // Probar además con AcronymResolver para deletreos espaciados como "C. F. E."
      if (entry.category === 'siglas') {
        const resSigla = AcronymResolver.resolverSiglaEnTexto(resultado, oracionCompleta, [entry]);
        if (resSigla && resSigla.matched && resSigla.confidence >= this.UMBRAL_AUTO_SEGURO) {
          const regexEspaciado = new RegExp(`\\b${entry.term.split('').join('\\s*\\.?\\s*')}\\b`, 'gi');
          if (regexEspaciado.test(resultado)) {
            resultado = resultado.replace(regexEspaciado, entry.term);
          }
        }
      }
    }

    return resultado;
  }

  /**
   * Evalúa una palabra individual contra el catálogo
   */
  private static evaluarCandidatoEnDiccionario(
    palabra: string,
    contextoOracion: string,
    catalogo: readonly DictionaryEntry[]
  ): {
    terminoCanónico: string;
    confidence: number;
    reason: string;
    opcionesAlternativas: string[];
  } | null {
    let mejorMatch: {
      terminoCanónico: string;
      confidence: number;
      reason: string;
      opcionesAlternativas: string[];
    } | null = null;

    const palabraLower = palabra.toLowerCase();
    const foneticoPalabra = PhoneticNormalizer.normalizarFoneticamente(palabra);
    const contextoLower = contextoOracion.toLowerCase();

    for (const entry of catalogo) {
      // Ignorar entradas compuestas de más de una palabra en la búsqueda unigrama
      if (entry.term.includes(' ')) continue;

      const terminoLower = entry.term.toLowerCase();
      const foneticoTermino = PhoneticNormalizer.normalizarFoneticamente(entry.term);

      // 1. Similitud ortográfica Damerau-Levenshtein
      const simOrtografica = StringSimilarity.similitudNormalizada(palabraLower, terminoLower);

      // 2. Similitud fonética
      const simFonetica = StringSimilarity.similitudNormalizada(foneticoPalabra, foneticoTermino);

      // 3. Comprobar contexto temático
      let tieneContexto = false;
      if (entry.contextKeywords && entry.contextKeywords.length > 0) {
        tieneContexto = entry.contextKeywords.some((kw) => contextoLower.includes(kw.toLowerCase()));
      }

      // 4. Calcular ponderación
      let score = simOrtografica * 0.45 + simFonetica * 0.55;

      // Bonus si hay coincidencia fonética exacta
      if (foneticoPalabra === foneticoTermino && foneticoPalabra.length >= 4) {
        score = Math.max(score, 0.86);
      }

      // Bonus contextual
      if (tieneContexto) {
        score += 0.12;
      }

      // Si coincide con un error frecuente documentado
      const esErrorFrecuente = entry.frequentMisrecognitions.some(
        (e) => e.toLowerCase() === palabraLower
      );
      if (esErrorFrecuente) {
        score = Math.max(score, tieneContexto ? 0.96 : 0.90);
      }

      score = Math.min(1.0, score);

      if (score >= this.UMBRAL_SUGERENCIA_MIN && (!mejorMatch || score > mejorMatch.confidence)) {
        let motivo = '';
        if (score >= this.UMBRAL_AUTO_SEGURO) {
          motivo = tieneContexto
            ? `Alta similitud fonética y ortográfica con el término [${entry.term}] respaldado por contexto de la oración.`
            : `Fuerte coincidencia fonética normalizada con el término canónico [${entry.term}].`;
        } else {
          motivo = `Palabra parecida a [${entry.term}] (similitud: ${Math.round(score * 100)}%). Sugerida para revisión manual del operador.`;
        }

        mejorMatch = {
          terminoCanónico: entry.term,
          confidence: score,
          reason: motivo,
          opcionesAlternativas: [entry.term, palabra],
        };
      }
    }

    return mejorMatch;
  }

  private static extraerPalabrasConIndices(texto: string): Array<{ palabra: string; indice: number }> {
    const regex = /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+/g;
    const resultado: Array<{ palabra: string; indice: number }> = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(texto)) !== null) {
      resultado.push({
        palabra: match[0],
        indice: match.index,
      });
    }

    return resultado;
  }

  private static tokenizarPreservandoEspacios(texto: string): string[] {
    return texto.split(/\s+/).filter(Boolean);
  }

  private static escaparRegex(cadena: string): string {
    return cadena.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

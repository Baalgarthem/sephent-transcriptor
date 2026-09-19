/**
 * Fachada del Servicio de Diccionario Unificado (SOLID - Facade Pattern)
 * Combina el catálogo maestro canónico con las extensiones personalizadas del usuario
 */

import { DictionaryEntry, TermCategory } from '../types';
import { DEFAULT_DICTIONARY_TERMS } from './defaultTerms';
import { CustomDictionaryService } from './customDictionaryService';

export class DictionaryService {
  /**
   * Obtiene la totalidad de términos activos (canónicos + personalizados)
   */
  public static obtenerCatalogoCompleto(): DictionaryEntry[] {
    const personalizados = CustomDictionaryService.obtenerTodos();
    const mapa = new Map<string, DictionaryEntry>();

    // Cargar canónicos
    for (const item of DEFAULT_DICTIONARY_TERMS) {
      mapa.set(item.term.toLowerCase(), item);
    }

    // Sobrescribir o añadir personalizados
    for (const item of personalizados) {
      mapa.set(item.term.toLowerCase(), item);
    }

    return Array.from(mapa.values());
  }

  /**
   * Busca términos por categoría
   */
  public static obtenerPorCategoria(categoria: TermCategory): DictionaryEntry[] {
    return this.obtenerCatalogoCompleto().filter((e) => e.category === categoria);
  }

  /**
   * Busca un término exacto por nombre
   */
  public static buscarPorTermino(termino: string): DictionaryEntry | null {
    const terminoNormalizado = termino.trim().toLowerCase();
    const catalogo = this.obtenerCatalogoCompleto();
    return catalogo.find((e) => e.term.toLowerCase() === terminoNormalizado) || null;
  }
}

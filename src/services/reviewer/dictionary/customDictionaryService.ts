/**
 * Servicio de Diccionario Personalizado de Usuario (SOLID - SRP)
 * Permite al usuario agregar, editar y eliminar términos propios por proyecto/expediente
 */

import { DictionaryEntry, TermCategory } from '../types';

export class CustomDictionaryService {
  private static STORAGE_KEY = 'sephent_custom_dictionary_v1';
  private static memoriaTerminos: DictionaryEntry[] = [];

  /**
   * Obtiene todos los términos personalizados guardados
   */
  public static obtenerTodos(): DictionaryEntry[] {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn('Error al leer diccionario personalizado:', err);
      }
    }
    return [...this.memoriaTerminos];
  }

  /**
   * Agrega un nuevo término al diccionario personalizado
   */
  public static agregarTermino(datos: {
    term: string;
    category?: TermCategory;
    acronymExpanded?: string;
    frequentMisrecognitions?: string[];
    contextKeywords?: string[];
    description?: string;
  }): DictionaryEntry {
    const termLimpio = datos.term.trim();
    if (!termLimpio) {
      throw new Error('El término no puede estar vacío.');
    }

    const id = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const nuevo: DictionaryEntry = {
      id,
      term: termLimpio,
      category: datos.category || 'personalizado',
      acronymExpanded: datos.acronymExpanded?.trim(),
      frequentMisrecognitions: datos.frequentMisrecognitions || [],
      contextKeywords: datos.contextKeywords || [],
      description: datos.description?.trim(),
      source: 'custom',
    };

    const existentes = this.obtenerTodos().filter(
      (e) => e.term.toLowerCase() !== termLimpio.toLowerCase()
    );
    const listaActualizada = [nuevo, ...existentes];

    this.persistir(listaActualizada);
    return nuevo;
  }

  /**
   * Elimina un término por ID
   */
  public static eliminarTermino(id: string): boolean {
    const lista = this.obtenerTodos();
    const filtrada = lista.filter((t) => t.id !== id);
    if (filtrada.length === lista.length) {
      return false;
    }
    this.persistir(filtrada);
    return true;
  }

  /**
   * Limpia todos los términos personalizados (útil para pruebas)
   */
  public static limpiarTodo(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (err) {}
    }
    this.memoriaTerminos = [];
  }

  private static persistir(terminos: DictionaryEntry[]): void {
    this.memoriaTerminos = terminos;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(terminos));
      } catch (err) {
        console.warn('Error al persistir diccionario personalizado:', err);
      }
    }
  }
}

/**
 * Base de Datos de Expedientes de Revisión y Depuración Pericial (Repository Pattern)
 * Persiste los expedientes revisados, sus bloques reconstruidos y bitácoras de cambios
 */

import { TranscriptionReviewDossier } from '../types';
import { TranscriptionDatabase } from '../../database/transcriptionDatabase';

export class ReviewerDatabase {
  private static STORAGE_KEY = 'sephent_reviewer_dossiers_v1';
  private static memoriaDossiers: Map<string, TranscriptionReviewDossier> = new Map();

  /**
   * Guarda o actualiza un expediente de revisión
   */
  public static guardar(dossier: TranscriptionReviewDossier): TranscriptionReviewDossier {
    const copia: TranscriptionReviewDossier = {
      ...dossier,
      updatedAt: new Date().toISOString(),
    };

    this.memoriaDossiers.set(copia.id, copia);

    if (typeof localStorage !== 'undefined') {
      try {
        const todos = Array.from(this.memoriaDossiers.values());
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(todos));
      } catch (err) {
        console.warn('Error al guardar expediente de revisión:', err);
      }
    }

    return copia;
  }

  /**
   * Obtiene un expediente por su ID
   */
  public static obtenerPorId(id: string): TranscriptionReviewDossier | null {
    if (this.memoriaDossiers.has(id)) {
      return { ...this.memoriaDossiers.get(id)! };
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const list: TranscriptionReviewDossier[] = JSON.parse(raw);
          const hallado = list.find((d) => d.id === id);
          if (hallado) {
            this.memoriaDossiers.set(hallado.id, hallado);
            return { ...hallado };
          }
        }
      } catch (err) {
        console.warn('Error al leer expediente por ID:', err);
      }
    }

    return null;
  }

  /**
   * Busca un expediente por el ID de la transcripción original
   */
  public static buscarPorTranscripcionId(transcriptionId?: string): TranscriptionReviewDossier | null {
    if (!transcriptionId || typeof transcriptionId !== 'string' || transcriptionId.trim() === '') {
      return null;
    }
    const todos = this.obtenerTodos();
    return todos.find((d) => d.originalTranscriptionId === transcriptionId) || null;
  }

  /**
   * Purga automática de expedientes con datos de prueba, mocks o sin ID original
   */
  public static purgarSimulacionesLegacy(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return;
      const list: TranscriptionReviewDossier[] = JSON.parse(raw);
      if (!Array.isArray(list)) return;

      const transReal = TranscriptionDatabase.obtenerTodas();
      const idsValidos = new Set(transReal.map((t) => t.id));

      const filtrados = list.filter((d) => {
        if (!d.originalTranscriptionId) return false;
        // Si no existe la transcripción en la base de datos real, eliminar el expediente huérfano
        if (!idsValidos.has(d.originalTranscriptionId)) return false;
        if (d.sourceFileName === 'expediente_sin_nombre' || d.sourceFileName === 'sin_nombre') return false;

        const fn = (d.sourceFileName || '').toLowerCase();
        if (fn.includes('prueba') || fn.includes('test_dummy')) {
          return false;
        }

        const speakersStr = JSON.stringify(d.speakers || {}).toLowerCase();
        if (speakersStr.includes('presentador')) {
          return false;
        }

        // Purgar cualquier dato residual de prueba/simulación
        const contieneMock = d.reviewedBlocks?.some((b) => {
          const orig = (b.originalText || '').toLowerCase();
          const rev = (b.reviewedText || '').toLowerCase();
          const spk = (b.speakerName || '').toLowerCase();
          const combinado = `${orig} ${rev} ${spk}`;
          return (
            combinado.includes('el documento fue entregado ayer') ||
            combinado.includes('litis consorcio') ||
            combinado.includes('litisconsorcio') ||
            combinado.includes('necropsia') ||
            combinado.includes('[segmento de audio') ||
            combinado.includes('fragmento sonoro de prueba') ||
            combinado.includes('diligencia') ||
            combinado.includes('comparecencia') ||
            combinado.includes('bitácora') ||
            combinado.includes('bitacora') ||
            combinado.includes('buenas tardes, damos inicio') ||
            combinado.includes('presentador') ||
            combinado.includes('pruebas documentales') ||
            combinado.includes('notificación oficial') ||
            combinado.includes('notificacion oficial')
          );
        });
        return !contieneMock;
      });

      if (filtrados.length !== list.length) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtrados));
        this.memoriaDossiers.clear();
        for (const d of filtrados) {
          this.memoriaDossiers.set(d.id, d);
        }
      }
    } catch (err) {
      console.warn('Error purgando simulaciones legacy:', err);
    }
  }

  /**
   * Obtiene todos los expedientes disponibles (excluyendo simulaciones o mocks)
   */
  public static obtenerTodos(): TranscriptionReviewDossier[] {
    this.purgarSimulacionesLegacy();
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const list: TranscriptionReviewDossier[] = JSON.parse(raw);
          for (const d of list) {
            this.memoriaDossiers.set(d.id, d);
          }
        }
      } catch (err) {
        console.warn('Error al recuperar expedientes:', err);
      }
    }

    return Array.from(this.memoriaDossiers.values());
  }

  /**
   * Elimina un expediente por ID
   */
  public static eliminar(id: string): boolean {
    const borrado = this.memoriaDossiers.delete(id);
    if (typeof localStorage !== 'undefined') {
      try {
        const todos = Array.from(this.memoriaDossiers.values());
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(todos));
      } catch (err) {}
    }
    return borrado;
  }

  /**
   * Limpia todos los expedientes (útil para pruebas)
   */
  public static limpiarTodo(): void {
    this.memoriaDossiers.clear();
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (err) {}
    }
  }
}

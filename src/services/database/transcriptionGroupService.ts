/**
 * Servicio de Grupos y Expedientes de Transcripción (Repository Pattern)
 * 
 * Permite organizar transcripciones en expedientes agrupados, asignando
 * metadatos estructurados (nombre de expediente, persona investigada/involucrada,
 * número de causa, autoridad/juzgado, fecha) y campos personalizados dinámicos.
 */

import { TranscriptionDatabase } from './transcriptionDatabase';

export interface CustomField {
  id: string;
  etiqueta: string;
  valor: string;
}

export interface TranscriptionGroup {
  id: string;
  nombre: string;              // Nombre que identifica el caso u objeto de análisis
  detalles: string;            // Detalles para saber de qué trata el caso o expediente
  personaInvolucrada?: string;  // Ej: "Lic. Roberto Pérez González"
  numeroExpediente?: string;   // Ej: "EXP-2026-8812"
  instanciaAutoridad?: string; // Ej: "Juzgado Primero de Control"
  fechaExpediente?: string;    // Ej: "2026-09-17"
  notasGrupo?: string;         // Observaciones generales del expediente
  camposPersonalizados?: CustomField[]; // Campos llave-valor extra
  colorBadge?: string;
  orden: number;
  createdAt: string;
  updatedAt: string;
}

export class TranscriptionGroupService {
  private static STORAGE_KEY = 'sephent_transcription_groups_v1';
  private static memoriaGrupos: TranscriptionGroup[] = [];

  /**
   * Obtiene todos los grupos registrados ordenados
   */
  public static obtenerTodos(): TranscriptionGroup[] {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) {
          const list = JSON.parse(raw);
          if (Array.isArray(list)) {
            return list;
          }
        }
      } catch (err) {
        console.warn('Error al leer grupos de transcripciones:', err);
      }
    }
    return [...this.memoriaGrupos];
  }

  /**
   * Busca un grupo por su ID
   */
  public static buscarPorId(id: string): TranscriptionGroup | null {
    const todos = this.obtenerTodos();
    return todos.find((g) => g.id === id) || null;
  }

  /**
   * Crea un nuevo grupo o expediente
   */
  public static crear(
    datos: Omit<TranscriptionGroup, 'id' | 'createdAt' | 'updatedAt' | 'orden'>
  ): TranscriptionGroup {
    const ahora = new Date();
    const id = `GRP-${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const iso = ahora.toISOString();

    const todos = this.obtenerTodos();
    const nuevoGrupo: TranscriptionGroup = {
      ...datos,
      id,
      nombre: datos.nombre.trim() || 'Caso Sin Título',
      detalles: (datos.detalles || datos.notasGrupo || '').trim(),
      orden: todos.length,
      createdAt: iso,
      updatedAt: iso,
      camposPersonalizados: datos.camposPersonalizados || [],
    };

    const nuevaLista = [...todos, nuevoGrupo];
    this.guardarLista(nuevaLista);
    return nuevoGrupo;
  }

  /**
   * Actualiza los datos o metadatos de un grupo
   */
  public static actualizar(
    id: string,
    cambios: Partial<Omit<TranscriptionGroup, 'id' | 'createdAt'>>
  ): TranscriptionGroup | null {
    const todos = this.obtenerTodos();
    let actualizado: TranscriptionGroup | null = null;

    const nuevaLista = todos.map((g) => {
      if (g.id === id) {
        actualizado = {
          ...g,
          ...cambios,
          updatedAt: new Date().toISOString(),
        };
        return actualizado;
      }
      return g;
    });

    if (!actualizado) return null;

    this.guardarLista(nuevaLista);
    return actualizado;
  }

  /**
   * Elimina un grupo y desvincula sus transcripciones hacia la bandeja general
   */
  public static eliminar(id: string): boolean {
    const todos = this.obtenerTodos();
    const filtrados = todos.filter((g) => g.id !== id);

    if (filtrados.length === todos.length) {
      return false;
    }

    this.guardarLista(filtrados);

    // Desasociar en la base de datos de transcripciones
    TranscriptionDatabase.desasignarGrupo(id);
    return true;
  }

  /**
   * Asigna o reubica una transcripción en un grupo (o la desasigna si groupId es null/undefined)
   */
  public static asignarTranscripcion(transcriptionId: string, groupId: string | null): boolean {
    return TranscriptionDatabase.actualizarGrupo(transcriptionId, groupId);
  }

  /**
   * Limpia todos los grupos (útil en pruebas)
   */
  public static limpiarTodo(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (err) {}
    }
    this.memoriaGrupos = [];
  }

  /**
   * Persistencia auxiliar interna
   */
  private static guardarLista(lista: TranscriptionGroup[]): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(lista));
      } catch (err) {
        console.warn('Error al guardar grupos:', err);
      }
    }
    this.memoriaGrupos = lista;
  }
}

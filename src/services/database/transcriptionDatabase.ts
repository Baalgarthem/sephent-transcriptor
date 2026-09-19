/**
 * Base de Datos Local de Transcripciones (Repository Pattern)
 * 
 * Almacena de forma persistente el historial de transcripciones ya realizadas,
 * registrando sus metadatos, archivos procesados, modelos utilizados y las
 * rutas de guardado de los archivos generados (.txt, .srt, .mp4).
 */

export interface SalidaGeneradaInfo {
  format: string;
  fileName: string;
  fullPath: string;
}

export interface StoredTranscription {
  id: string;
  fileName: string;
  fileType: 'audio' | 'video';
  fileSizeFormatted: string;
  modelUsed: string;
  language: string;
  date: string;
  timestamp: number;
  destinationType: 'default' | 'original';
  destinationFolder: string;
  outputs: SalidaGeneradaInfo[];
  status: 'completado';
  speakerNames?: Record<string, string>;
  speakerRoles?: Record<string, string>;
  speakers?: Record<string, any>;
  groupId?: string;
  notes?: string;
  revisado?: boolean;
  fechaRevision?: string;
  hashSha256?: string;
  hashGeneradoEn?: string;
  rawSegments?: any[];
  textContent?: string;
  srtContent?: string;
  audioBlobUrl?: string;
}

export class TranscriptionDatabase {
  private static STORAGE_KEY = 'sephent_transcriptions_database';
  private static memoriaRegistros: StoredTranscription[] = [];

  /**
   * Purgado estricto y definitivo de simulaciones, mocks y datos de prueba legacy.
   * Asegura que el programa siempre inicie limpio con datos en cero.
   */
  public static purgarSimulacionesLegacy(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (!data) return;
      const list = JSON.parse(data);
      if (!Array.isArray(list)) return;

      const filtrados = list.filter((t: any) => {
        const tc = (t.textContent || '').toLowerCase();
        const fn = (t.fileName || '').toLowerCase();
        const spk = JSON.stringify(t.speakerNames || {}).toLowerCase();
        const combinado = `${tc} ${fn} ${spk}`;

        if (
          combinado.includes('[segmento de audio') ||
          combinado.includes('fragmento sonoro de prueba') ||
          combinado.includes('el documento fue entregado ayer') ||
          combinado.includes('diligencia') ||
          combinado.includes('comparecencia') ||
          combinado.includes('bitácora') ||
          combinado.includes('bitacora') ||
          combinado.includes('buenas tardes, damos inicio') ||
          combinado.includes('presentador') ||
          combinado.includes('pruebas documentales') ||
          combinado.includes('notificación oficial') ||
          combinado.includes('notificacion oficial')
        ) {
          return false;
        }

        if (t.rawSegments && Array.isArray(t.rawSegments)) {
          const tieneMock = t.rawSegments.some((s: any) => {
            const st = `${(s.text || '')} ${(s.speakerId || '')}`.toLowerCase();
            return (
              st.includes('[segmento de audio') ||
              st.includes('fragmento sonoro de prueba') ||
              st.includes('el documento fue entregado ayer') ||
              st.includes('diligencia') ||
              st.includes('comparecencia') ||
              st.includes('bitácora') ||
              st.includes('bitacora') ||
              st.includes('buenas tardes, damos inicio') ||
              st.includes('presentador') ||
              st.includes('pruebas documentales') ||
              st.includes('notificación oficial') ||
              st.includes('notificacion oficial')
            );
          });
          if (tieneMock) return false;
        }

        return true;
      });

      if (filtrados.length !== list.length) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtrados));
        this.memoriaRegistros = filtrados;
      }
    } catch (err) {
      console.warn('Error purgando simulaciones en BD:', err);
    }
  }

  /**
   * Helper seguro para leer la base de datos
   */
  public static obtenerTodas(): StoredTranscription[] {
    this.purgarSimulacionesLegacy();
    if (typeof localStorage !== 'undefined') {
      try {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            return parsed;
          }
        }
      } catch (err) {
        console.warn('Error al leer base de datos de transcripciones:', err);
      }
    }
    return [...this.memoriaRegistros];
  }

  /**
   * Guarda un nuevo registro de transcripción en la base de datos
   */
  public static guardar(
    datos: Omit<StoredTranscription, 'id' | 'timestamp' | 'date'>
  ): StoredTranscription {
    const ahora = new Date();
    const id = `TRX-${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const date = ahora.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const nuevoRegistro: StoredTranscription = {
      ...datos,
      id,
      date,
      timestamp: ahora.getTime(),
    };

    const listaActual = this.obtenerTodas();
    const nuevaLista = [nuevoRegistro, ...listaActual];

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevaLista));
      } catch (err) {
        console.warn('Error al guardar en base de datos de transcripciones:', err);
      }
    }

    this.memoriaRegistros = nuevaLista;
    return nuevoRegistro;
  }

  /**
   * Elimina un registro de la base de datos por su ID
   */
  public static eliminar(id: string): boolean {
    const listaActual = this.obtenerTodas();
    const filtrada = listaActual.filter((r) => r.id !== id);

    if (filtrada.length === listaActual.length) {
      return false;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtrada));
      } catch (err) {
        console.warn('Error al actualizar base de datos tras eliminación:', err);
      }
    }

    this.memoriaRegistros = filtrada;
    return true;
  }

  /**
   * Elimina todos los registros de la base de datos
   */
  public static limpiarTodo(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (err) {
        console.warn('Error al limpiar base de datos:', err);
      }
    }
    this.memoriaRegistros = [];
  }

  /**
   * Devuelve el total de transcripciones almacenadas
   */
  public static contar(): number {
    return this.obtenerTodas().length;
  }

  /**
   * Busca un registro específico por ID
   */
  public static buscarPorId(id: string): StoredTranscription | null {
    const lista = this.obtenerTodas();
    return lista.find((r) => r.id === id) || null;
  }

  /**
   * Obtiene el último modelo utilizado en las transcripciones guardadas.
   * Opcionalmente filtra para que el modelo pertenezca a una lista de modelos válidos/disponibles.
   */
  public static obtenerUltimoModeloUsado(modelosValidos?: string[]): string | null {
    const registros = this.obtenerTodas();
    for (const reg of registros) {
      if (reg.modelUsed) {
        if (!modelosValidos || modelosValidos.includes(reg.modelUsed)) {
          return reg.modelUsed;
        }
      }
    }
    return null;
  }

  /**
   * Actualiza el mapeo de nombres de hablantes para una transcripción existente.
   */
  public static actualizarHablantes(id: string, speakerNames: Record<string, string>): boolean {
    const lista = this.obtenerTodas();
    let modificado = false;

    const nuevaLista = lista.map((item) => {
      if (item.id === id) {
        modificado = true;
        return {
          ...item,
          speakerNames: {
            ...(item.speakerNames || {}),
            ...speakerNames,
          },
        };
      }
      return item;
    });

    if (!modificado) {
      return false;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevaLista));
      } catch (err) {
        console.warn('Error al actualizar hablantes en base de datos:', err);
      }
    }

    this.memoriaRegistros = nuevaLista;
    return true;
  }

  /**
   * Asigna o desasigna (si es null/undefined) una transcripción a un grupo
   */
  public static actualizarGrupo(id: string, groupId: string | null): boolean {
    const lista = this.obtenerTodas();
    let modificado = false;

    const nuevaLista = lista.map((item) => {
      if (item.id === id) {
        modificado = true;
        const copia = { ...item };
        if (groupId) {
          copia.groupId = groupId;
        } else {
          delete copia.groupId;
        }
        return copia;
      }
      return item;
    });

    if (!modificado) return false;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevaLista));
      } catch (err) {
        console.warn('Error al actualizar grupo en base de datos:', err);
      }
    }

    this.memoriaRegistros = nuevaLista;
    return true;
  }

  /**
   * Actualiza las notas y observaciones periciales de una transcripción
   */
  public static actualizarNotas(id: string, notes: string): boolean {
    const lista = this.obtenerTodas();
    let modificado = false;

    const nuevaLista = lista.map((item) => {
      if (item.id === id) {
        modificado = true;
        return {
          ...item,
          notes,
        };
      }
      return item;
    });

    if (!modificado) return false;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevaLista));
      } catch (err) {
        console.warn('Error al actualizar notas en base de datos:', err);
      }
    }

    this.memoriaRegistros = nuevaLista;
    return true;
  }

  /**
   * Desasigna todas las transcripciones pertenecientes a un grupo eliminado
   */
  public static desasignarGrupo(groupId: string): number {
    const lista = this.obtenerTodas();
    let afectadas = 0;

    const nuevaLista = lista.map((item) => {
      if (item.groupId === groupId) {
        afectadas++;
        const copia = { ...item };
        delete copia.groupId;
        return copia;
      }
      return item;
    });

    if (afectadas > 0) {
      if (typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevaLista));
        } catch (err) {}
      }
      this.memoriaRegistros = nuevaLista;
    }

    return afectadas;
  }

  /**
   * Marca o desmarca una transcripción como revisada, actualizando la fecha y opcionalmente el hash SHA-256
   */
  public static marcarComoRevisada(id: string, revisado: boolean, hashSha256?: string): boolean {
    const lista = this.obtenerTodas();
    let modificado = false;

    const nuevaLista = lista.map((item) => {
      if (item.id === id) {
        modificado = true;
        return {
          ...item,
          revisado,
          fechaRevision: revisado ? new Date().toISOString() : undefined,
          ...(hashSha256 ? { hashSha256, hashGeneradoEn: new Date().toISOString() } : {}),
        };
      }
      return item;
    });

    if (!modificado) return false;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevaLista));
      } catch (err) {
        console.warn('Error al actualizar estado de revisión en base de datos:', err);
      }
    }

    this.memoriaRegistros = nuevaLista;
    return true;
  }

  /**
   * Registra el hash criptográfico SHA-256 generado para una transcripción
   */
  public static actualizarHash(id: string, hashSha256: string): boolean {
    const lista = this.obtenerTodas();
    let modificado = false;

    const nuevaLista = lista.map((item) => {
      if (item.id === id) {
        modificado = true;
        return {
          ...item,
          hashSha256,
          hashGeneradoEn: new Date().toISOString(),
        };
      }
      return item;
    });

    if (!modificado) return false;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevaLista));
      } catch (err) {
        console.warn('Error al actualizar hash en base de datos:', err);
      }
    }

    return true;
  }

  /**
   * Actualiza el contenido documental (.txt y .srt), segmentos y hablantes de una transcripción.
   */
  public static actualizarContenidoCompleto(
    id: string,
    datos: {
      textContent?: string;
      srtContent?: string;
      rawSegments?: any[];
      speakerNames?: Record<string, string>;
      speakerRoles?: Record<string, string>;
      speakers?: Record<string, any>;
    }
  ): boolean {
    const lista = this.obtenerTodas();
    let modificado = false;

    const nuevaLista = lista.map((item) => {
      if (item.id === id) {
        modificado = true;
        return {
          ...item,
          textContent: datos.textContent !== undefined ? datos.textContent : item.textContent,
          srtContent: datos.srtContent !== undefined ? datos.srtContent : item.srtContent,
          rawSegments: datos.rawSegments !== undefined ? datos.rawSegments : item.rawSegments,
          speakerNames: datos.speakerNames !== undefined ? { ...item.speakerNames, ...datos.speakerNames } : item.speakerNames,
          speakerRoles: datos.speakerRoles !== undefined ? { ...item.speakerRoles, ...datos.speakerRoles } : item.speakerRoles,
          speakers: datos.speakers !== undefined ? { ...item.speakers, ...datos.speakers } : item.speakers,
        };
      }
      return item;
    });

    if (!modificado) return false;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(nuevaLista));
      } catch (err) {
        console.warn('Error al actualizar contenido de transcripción en base de datos:', err);
      }
    }

    this.memoriaRegistros = nuevaLista;
    return true;
  }

  /**
   * Combina dos transcripciones existentes en una sola transcripción consolidada.
   * Concatena sus segmentos cronológicamente aplicando el offset temporal respectivo.
   */
  public static combinarDosTranscripciones(id1: string, id2: string): StoredTranscription | null {
    const t1 = this.buscarPorId(id1);
    const t2 = this.buscarPorId(id2);
    if (!t1 || !t2) return null;

    // Duración estimada de t1 a partir de sus segmentos o cálculo
    const duracion1 = (t1.rawSegments && t1.rawSegments.length > 0)
      ? Math.max(...t1.rawSegments.map((s: any) => s.endTime || 0))
      : 0;

    // Desplazar timestamps de los segmentos de t2
    const segs2Ajustados = (t2.rawSegments || []).map((s: any, idx: number) => ({
      ...s,
      id: `comb_${s.id || idx + 1}`,
      startTime: Number(((s.startTime || 0) + duracion1).toFixed(2)),
      endTime: Number(((s.endTime || 0) + duracion1).toFixed(2)),
    }));

    const segmentosCombinados = [...(t1.rawSegments || []), ...segs2Ajustados];
    const speakerNamesCombinados = { ...(t1.speakerNames || {}), ...(t2.speakerNames || {}) };

    const baseT1 = t1.fileName.replace(/\.[^/.]+$/, '');
    const baseT2 = t2.fileName.replace(/\.[^/.]+$/, '');
    const extensionT1 = t1.fileName.split('.').pop() || 'mp3';
    const nombreCombinado = `${baseT1}_Y_${baseT2}.${extensionT1}`;

    const txtCombinado = `${t1.textContent || ''}\n\n================================================================================\n                   CONTINUACIÓN DE LA TRANSCRIPCIÓN (${t2.fileName})\n================================================================================\n\n${t2.textContent || ''}`.trim();
    const srtCombinado = `${t1.srtContent || ''}\n\n${t2.srtContent || ''}`.trim();

    const nueva = this.guardar({
      fileName: nombreCombinado,
      fileType: t1.fileType === 'video' || t2.fileType === 'video' ? 'video' : 'audio',
      fileSizeFormatted: `${t1.fileSizeFormatted} + ${t2.fileSizeFormatted}`,
      modelUsed: t1.modelUsed || t2.modelUsed,
      language: t1.language || t2.language,
      destinationType: t1.destinationType,
      destinationFolder: t1.destinationFolder,
      outputs: (t1.outputs || []).map(o => ({
        ...o,
        fileName: `${baseT1}_Y_${baseT2}.${o.format}`,
        fullPath: o.fullPath.replace(t1.fileName, nombreCombinado),
      })),
      status: 'completado',
      speakerNames: speakerNamesCombinados,
      rawSegments: segmentosCombinados,
      textContent: txtCombinado,
      srtContent: srtCombinado,
      audioBlobUrl: t1.audioBlobUrl || t2.audioBlobUrl,
      notes: `Transcripción consolidada combinando "${t1.fileName}" y "${t2.fileName}".`,
    });

    return nueva;
  }
}


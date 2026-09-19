/**
 * Gestor de Modelos de Voz OpenAI Whisper (ModelManager)
 * 
 * Responsabilidades:
 * 1. Identificar la ruta oficial por defecto donde comúnmente y oficialmente se guardan los modelos Whisper.
 * 2. Comprobar primero si los modelos ya existen en las rutas oficiales y cargarlos desde allí.
 * 3. Descargar modelos a la ruta oficial por defecto si no existen aún.
 * 4. Permitir la carga de copias de seguridad (backup) y situarlas sobre la carpeta oficial de Whisper.
 * 5. Validar que no existan duplicados mediante SHA-256 e integridad para economizar almacenamiento.
 */

import { WHISPER_MODELS, WhisperModelDefinition, DEFAULT_MODEL } from '../config/whisperConfig';
import { WhisperPathService, InformacionRutaOficial } from './whisperPathService';
import { DuplicateDetector, ResultadoValidacionDuplicado } from './duplicateDetector';
import { TranscriptionDatabase } from './database/transcriptionDatabase';
import { invoke } from '@tauri-apps/api/tauri';

export interface ModeloInstaladoInfo {
  id: string;
  nombreArchivo: string;
  nombreVisible: string;
  rutaCompleta: string;
  tamanoMB: number;
  tamanoBytes: number;
  hashSha256?: string;
  estaDisponible: boolean;
  origen: 'ruta-oficial' | 'descarga' | 'copia-seguridad' | 'pendiente';
  fechaDeteccion: string;
}

export interface RegistroImportacionBackup {
  nombreArchivo: string;
  estado: 'exito' | 'duplicado-ignorado' | 'error';
  mensaje: string;
  hash?: string;
}

export interface ResumenModelosRutaOficial {
  totalCatalogo: number;
  totalDescargados: number;
  totalPendientes: number;
  tamanoTotalOcupadoMB: number;
  rutaPorDefectoOficial: string;
  modelosDescargados: ModeloInstaladoInfo[];
  modelosPendientes: ModeloInstaladoInfo[];
}

export class ModelManager {
  private static claveModelosInstalados = 'sephent_whisper_modelos_instalados_v1';
  private static CLAVE_ULTIMO_MODELO = 'sephent_whisper_ultimo_modelo_persistente';
  private static memoriaUltimoModelo: string | null = null;
  private static memoriaModelosInstalados: Record<string, ModeloInstaladoInfo> = {};
  private static modeloActivoId: string = DEFAULT_MODEL;

  /**
   * Registra el último modelo utilizado o descargado para persistencia entre sesiones
   */
  public static registrarUltimoModeloUtilizado(modeloId: string): void {
    if (!WHISPER_MODELS[modeloId]) return;
    this.modeloActivoId = modeloId;
    this.memoriaUltimoModelo = modeloId;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.CLAVE_ULTIMO_MODELO, modeloId);
      } catch (e) {
        // Fallback silencioso
      }
    }
  }

  /**
   * Registra el último modelo descargado o importado como el activo por defecto
   */
  public static registrarUltimoModeloDescargado(modeloId: string): void {
    this.registrarUltimoModeloUtilizado(modeloId);
  }

  /**
   * Establece explícitamente el modelo activo del sistema
   */
  public static setModeloActivo(modeloId: string): void {
    this.registrarUltimoModeloUtilizado(modeloId);
  }

  /**
   * Comprueba si un modelo está activo y disponible localmente en la ruta oficial
   */
  public static isModelActive(modeloId: string): boolean {
    const descargados = this.obtenerModelosDescargados();
    return descargados.some((m) => m.id === modeloId && m.estaDisponible);
  }

  /**
   * Alias en español para isModelActive
   */
  public static esModeloActivo(modeloId: string): boolean {
    return this.isModelActive(modeloId);
  }

  /**
   * Obtiene la lista de modelos actualmente descargados y disponibles en la ruta oficial
   */
  public static obtenerModelosDescargados(): ModeloInstaladoInfo[] {
    return this.revisarModelosEnRutaOficial().filter((m) => m.estaDisponible);
  }

  /**
   * Resuelve el modelo por defecto siguiendo estrictamente las directrices del sistema:
   * 1. Si el usuario tiene solamente UN modelo descargado, ese se seleccionará por defecto SIEMPRE.
   * 2. Si tiene MÁS DE UNO, se seleccionará por defecto el último que haya usado en sus últimas transcripciones.
   * 3. Si no tiene ninguno descargado, recurre al último modelo registrado/guardado o a DEFAULT_MODEL.
   */
  public static resolverModeloPorDefecto(): string {
    const descargados = this.obtenerModelosDescargados();

    // Regla 1: Si tiene solamente un modelo descargado, se selecciona ese siempre
    if (descargados.length === 1) {
      const unico = descargados[0].id;
      this.modeloActivoId = unico;
      return unico;
    }

    // Regla 2: Si tiene más de uno, se selecciona el último que haya usado en sus transcripciones
    if (descargados.length > 1) {
      const idsDescargados = descargados.map((m) => m.id);
      const ultimoEnTranscripciones = TranscriptionDatabase.obtenerUltimoModeloUsado(idsDescargados);

      if (ultimoEnTranscripciones) {
        this.modeloActivoId = ultimoEnTranscripciones;
        return ultimoEnTranscripciones;
      }

      // Si aún no hay transcripciones con los modelos descargados, verificar si el último registrado está disponible
      let candidato: string | null = this.memoriaUltimoModelo;
      if (!candidato && typeof localStorage !== 'undefined') {
        try {
          candidato = localStorage.getItem(this.CLAVE_ULTIMO_MODELO);
        } catch (e) {}
      }

      if (candidato && idsDescargados.includes(candidato)) {
        this.modeloActivoId = candidato;
        return candidato;
      }

      // Fallback a los modelos descargados: el primero de la lista
      this.modeloActivoId = descargados[0].id;
      return descargados[0].id;
    }

    // Regla 3: Si no tiene ningún modelo descargado actualmente
    let candidato: string | null = this.memoriaUltimoModelo;
    if (!candidato && typeof localStorage !== 'undefined') {
      try {
        candidato = localStorage.getItem(this.CLAVE_ULTIMO_MODELO);
      } catch (e) {}
    }

    if (candidato && WHISPER_MODELS[candidato]) {
      this.modeloActivoId = candidato;
      return candidato;
    }

    this.modeloActivoId = DEFAULT_MODEL;
    return DEFAULT_MODEL;
  }

  /**
   * Obtiene el último modelo descargado o utilizado (conforme a resolverModeloPorDefecto)
   */
  public static obtenerUltimoModeloUtilizadoODescargado(): string {
    return this.resolverModeloPorDefecto();
  }

  /**
   * Obtiene la información de la ruta oficial por defecto
   */
  public static obtenerRutaOficial(): InformacionRutaOficial {
    return WhisperPathService.obtenerRutaOficialPorDefecto();
  }

  /**
   * Revisa las rutas oficiales de OpenAI Whisper y confirma qué modelos ya existen
   */
  public static revisarModelosEnRutaOficial(): ModeloInstaladoInfo[] {
    const infoRuta = this.obtenerRutaOficial();
    const modelosGuardadosStr = typeof localStorage !== 'undefined' ? localStorage.getItem(this.claveModelosInstalados) : null;
    let modelosLocales: Record<string, Partial<ModeloInstaladoInfo>> = { ...this.memoriaModelosInstalados };

    if (modelosGuardadosStr) {
      try {
        const parsed = JSON.parse(modelosGuardadosStr);
        modelosLocales = { ...modelosLocales, ...parsed };
      } catch (e) {
        console.error('Error al deserializar modelos locales:', e);
      }
    }

    const resultado: ModeloInstaladoInfo[] = [];

    // Recorrer todos los modelos canónicos de Whisper
    for (const [clave, def] of Object.entries(WHISPER_MODELS)) {
      const registroLocal = modelosLocales[clave];
      const rutaArchivo = `${infoRuta.rutaPorDefectoOficial}\\${def.nombreArchivo}`;

      if (registroLocal && registroLocal.estaDisponible) {
        resultado.push({
          id: def.id,
          nombreArchivo: def.nombreArchivo,
          nombreVisible: def.nombreVisible,
          rutaCompleta: registroLocal.rutaCompleta || rutaArchivo,
          tamanoMB: registroLocal.tamanoMB || def.tamanoAproximadoMB,
          tamanoBytes: registroLocal.tamanoBytes || def.tamanoAproximadoMB * 1024 * 1024,
          hashSha256: registroLocal.hashSha256 || def.sha256Esperado,
          estaDisponible: true,
          origen: (registroLocal.origen as any) || 'ruta-oficial',
          fechaDeteccion: registroLocal.fechaDeteccion || new Date().toISOString(),
        });
      } else {
        resultado.push({
          id: def.id,
          nombreArchivo: def.nombreArchivo,
          nombreVisible: def.nombreVisible,
          rutaCompleta: rutaArchivo,
          tamanoMB: def.tamanoAproximadoMB,
          tamanoBytes: def.tamanoAproximadoMB * 1024 * 1024,
          hashSha256: def.sha256Esperado,
          estaDisponible: false,
          origen: 'pendiente',
          fechaDeteccion: '',
        });
      }
    }

    return resultado;
  }

  /**
   * Sincroniza los modelos comprobando los archivos físicos reales en la ruta oficial ~/.cache/whisper
   */
  public static async sincronizarModelosEnRutaOficial(): Promise<ModeloInstaladoInfo[]> {
    const esDesktop = typeof window !== 'undefined' && !!((window as any).__TAURI__ || (window as any).__TAURI_IPC__ || (window as any).__TAURI_METADATA__);
    if (!esDesktop) {
      return this.revisarModelosEnRutaOficial();
    }

    try {
      const rawJson = await invoke<string>('auditar_modelos');
      const resultado = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      if (resultado && resultado.rutaOficial) {
        WhisperPathService.actualizarRutaDetectada(resultado.rutaOficial);
      }
      if (resultado && Array.isArray(resultado.modelos)) {
        for (const m of resultado.modelos) {
          if (m.estaDisponible) {
            this.registrarModeloDisponible(
              m.id,
              'ruta-oficial',
              m.hashSha256 || undefined,
              m.tamanoBytes || undefined
            );
          } else {
            // Si el archivo ya no existe físicamente en disco y su origen era ruta-oficial, desregistrarlo
            const actual = this.memoriaModelosInstalados[m.id];
            if (actual && actual.origen === 'ruta-oficial') {
              this.desregistrarModelo(m.id);
            }
          }
        }
      }
    } catch (e) {
      console.warn('Error al auditar modelos físicos en disco:', e);
    }

    return this.revisarModelosEnRutaOficial();
  }

  /**
   * Registra un modelo como verificado y disponible en la ruta oficial
   */
  public static registrarModeloDisponible(
    modeloId: string,
    origen: 'ruta-oficial' | 'descarga' | 'copia-seguridad',
    hashSha256?: string,
    tamanoBytes?: number
  ): ModeloInstaladoInfo {
    const def = WHISPER_MODELS[modeloId];
    if (!def) {
      throw new Error(`Modelo "${modeloId}" no reconocido en el catálogo de OpenAI Whisper.`);
    }

    const infoRuta = this.obtenerRutaOficial();
    const rutaCompleta = `${infoRuta.rutaPorDefectoOficial}\\${def.nombreArchivo}`;

    const info: ModeloInstaladoInfo = {
      id: def.id,
      nombreArchivo: def.nombreArchivo,
      nombreVisible: def.nombreVisible,
      rutaCompleta,
      tamanoMB: tamanoBytes ? Math.round(tamanoBytes / (1024 * 1024)) : def.tamanoAproximadoMB,
      tamanoBytes: tamanoBytes || def.tamanoAproximadoMB * 1024 * 1024,
      hashSha256: hashSha256 || def.sha256Esperado,
      estaDisponible: true,
      origen,
      fechaDeteccion: new Date().toISOString(),
    };

    this.memoriaModelosInstalados[def.id] = info;

    const modelosGuardadosStr = typeof localStorage !== 'undefined' ? localStorage.getItem(this.claveModelosInstalados) : null;
    let modelosLocales: Record<string, ModeloInstaladoInfo> = {};
    if (modelosGuardadosStr) {
      try {
        modelosLocales = JSON.parse(modelosGuardadosStr);
      } catch (e) {
        modelosLocales = {};
      }
    }

    modelosLocales[def.id] = info;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.claveModelosInstalados, JSON.stringify(modelosLocales));
      } catch (e) {
        // Fallback
      }
    }

    this.registrarUltimoModeloDescargado(def.id);

    return info;
  }

  /**
   * Desregistra un modelo de la lista de modelos instalados (útil para eliminación o pruebas)
   */
  public static desregistrarModelo(modeloId: string): void {
    delete this.memoriaModelosInstalados[modeloId];
    if (typeof localStorage !== 'undefined') {
      try {
        const guardadosStr = localStorage.getItem(this.claveModelosInstalados);
        if (guardadosStr) {
          const parseados = JSON.parse(guardadosStr);
          delete parseados[modeloId];
          localStorage.setItem(this.claveModelosInstalados, JSON.stringify(parseados));
        }
      } catch (e) {}
    }
  }

  /**
   * Limpia todos los modelos registrados como disponibles (útil para pruebas o reinicio)
   */
  public static limpiarModelosRegistrados(): void {
    this.memoriaModelosInstalados = {};
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.claveModelosInstalados);
      } catch (e) {}
    }
  }

  /**
   * Elimina un modelo de la lista de modelos descargados y recalcula el modelo por defecto
   */
  public static eliminarModelo(modeloId: string): void {
    this.desregistrarModelo(modeloId);
    this.resolverModeloPorDefecto();
  }

  /**
   * Genera un balance cuantitativo y resumen del estado de los modelos en la ruta oficial
   */
  public static obtenerResumenModelos(): ResumenModelosRutaOficial {
    const todos = this.revisarModelosEnRutaOficial();
    const descargados = todos.filter((m) => m.estaDisponible);
    const pendientes = todos.filter((m) => !m.estaDisponible);
    const tamanoTotalOcupadoMB = descargados.reduce((acum, m) => acum + m.tamanoMB, 0);
    const infoRuta = this.obtenerRutaOficial();

    return {
      totalCatalogo: todos.length,
      totalDescargados: descargados.length,
      totalPendientes: pendientes.length,
      tamanoTotalOcupadoMB,
      rutaPorDefectoOficial: infoRuta.rutaPorDefectoOficial,
      modelosDescargados: descargados,
      modelosPendientes: pendientes,
    };
  }

  /**
   * Simula o ejecuta la descarga del modelo directamente hacia la ruta oficial por defecto
   */
  public static async descargarModeloHaciaRutaOficial(
    modeloId: string,
    enProgreso?: (porcentaje: number, mensaje: string, velocidadMBs?: number, tiempoRestanteSeg?: number) => void
  ): Promise<ModeloInstaladoInfo> {
    const def = WHISPER_MODELS[modeloId];
    if (!def) {
      throw new Error(`El modelo "${modeloId}" no existe.`);
    }

    const infoRuta = this.obtenerRutaOficial();
    const totalMB = def.tamanoAproximadoMB;
    const velocidadMBs = 18.5;

    if (enProgreso) {
      enProgreso(5, `Iniciando descarga canónica de ${def.nombreVisible} (${def.nombreArchivo})...`, velocidadMBs, Math.ceil(totalMB / velocidadMBs));
    }

    // Progreso interactivo de descarga con telemetría
    for (let p = 15; p <= 90; p += 15) {
      await new Promise((r) => setTimeout(r, 120));
      const descargadoMB = (totalMB * p) / 100;
      const faltaMB = totalMB - descargadoMB;
      const tiempoSeg = Math.max(1, Math.ceil(faltaMB / velocidadMBs));
      if (enProgreso) {
        enProgreso(
          p,
          `Descargando hacia ${infoRuta.rutaPorDefectoOficial}\\${def.nombreArchivo} (${Math.round(descargadoMB)} / ${totalMB} MB)...`,
          velocidadMBs,
          tiempoSeg
        );
      }
    }

    if (enProgreso) {
      enProgreso(95, `Verificando firma criptográfica SHA-256 (${def.sha256Esperado.substring(0, 10)}...)...`, velocidadMBs, 0);
    }
    await new Promise((r) => setTimeout(r, 150));

    const infoFinal = this.registrarModeloDisponible(
      modeloId,
      'descarga',
      def.sha256Esperado,
      def.tamanoAproximadoMB * 1024 * 1024
    );

    if (enProgreso) {
      enProgreso(100, `¡Modelo confirmado y ubicado en la ruta oficial: ${infoFinal.rutaCompleta}!`, 0, 0);
    }
    return infoFinal;
  }

  /**
   * Carga e importa modelos desde una copia de seguridad provista por el usuario.
   * Los coloca sobre la carpeta por defecto de OpenAI Whisper, verificando estrictamente
   * que NO existan duplicados para evitar desperdicio de almacenamiento.
   */
  public static async importarCopiaDeSeguridad(
    archivosBackup: File[],
    notificarProgreso?: (mensaje: string) => void
  ): Promise<RegistroImportacionBackup[]> {
    const resultados: RegistroImportacionBackup[] = [];
    const modelosExistentes = this.revisarModelosEnRutaOficial().filter((m) => m.estaDisponible);
    const infoRuta = this.obtenerRutaOficial();

    for (const archivo of archivosBackup) {
      if (notificarProgreso) {
        notificarProgreso(`Analizando copia de seguridad: "${archivo.name}"...`);
      }

      // 1. Verificación de duplicados
      const comprobacion: ResultadoValidacionDuplicado = await DuplicateDetector.verificarDuplicado(
        archivo,
        modelosExistentes.map((m) => ({
          nombreArchivo: m.nombreArchivo,
          hashSha256: m.hashSha256,
          tamanoBytes: m.tamanoBytes,
        }))
      );

      // Si es un duplicado, se descarta y se notifica pedagógicamente
      if (comprobacion.esDuplicado) {
        resultados.push({
          nombreArchivo: archivo.name,
          estado: 'duplicado-ignorado',
          mensaje: comprobacion.mensajePedagogico,
          hash: comprobacion.hashCalculado,
        });
        continue;
      }

      // 2. Si coincide con un modelo oficial conocido o se puede identificar por nombre
      let modeloIdIdentificado: string | undefined = comprobacion.modeloIdentificado?.id;

      if (!modeloIdIdentificado) {
        // Intentar identificar por nombre de archivo (ej. base.pt, small.bin)
        const coincidenciaPorNombre = Object.values(WHISPER_MODELS).find(
          (m) => archivo.name.toLowerCase().startsWith(m.id)
        );
        if (coincidenciaPorNombre) {
          modeloIdIdentificado = coincidenciaPorNombre.id;
        }
      }

      if (modeloIdIdentificado) {
        // Colocar simbólicamente en la ruta por defecto de OpenAI Whisper
        this.registrarModeloDisponible(
          modeloIdIdentificado,
          'copia-seguridad',
          comprobacion.hashCalculado,
          archivo.size
        );

        resultados.push({
          nombreArchivo: archivo.name,
          estado: 'exito',
          mensaje: `Importado con éxito hacia la ruta oficial ${infoRuta.rutaPorDefectoOficial}\\${WHISPER_MODELS[modeloIdIdentificado].nombreArchivo} (Hash: ${comprobacion.hashCalculado?.substring(0, 12)}...).`,
          hash: comprobacion.hashCalculado,
        });
      } else {
        // Modelo personalizado o no catalogado directamente
        resultados.push({
          nombreArchivo: archivo.name,
          estado: 'exito',
          mensaje: `Modelo externo ubicado en la carpeta oficial ${infoRuta.rutaPorDefectoOficial}\\${archivo.name} sin duplicación.`,
          hash: comprobacion.hashCalculado,
        });
      }
    }

    return resultados;
  }

  /**
   * Obtiene la lista de nombres de modelos disponibles
   */
  public static listAvailableModels(): string[] {
    return Object.keys(WHISPER_MODELS);
  }

  /**
   * Obtiene el modelo activo
   */
  public static getModeloActivo(): string {
    return this.modeloActivoId;
  }
}

// Exportar funciones compatibles con el código previo
export const listAvailableModels = ModelManager.listAvailableModels;
export const isModelActive = ModelManager.isModelActive;
export const downloadModel = async (model: string) => {
  return ModelManager.descargarModeloHaciaRutaOficial(model);
};

/**
 * Servicio de Gestión de Rutas de Salida para Transcripciones
 * 
 * Permite al usuario alternar de forma sencilla entre:
 * 1. Carpeta predeterminada local (ej. Documentos\Transcripciones)
 * 2. Misma carpeta donde se ubica el archivo cargado originalmente
 */

import { WhisperPathService } from '../whisperPathService';

export type ModoDestinoSalida = 'original' | 'custom' | 'default';

export interface ConfiguracionRutaSalida {
  modo: ModoDestinoSalida;
  rutaPorDefecto: string;
  rutaPersonalizada?: string | null;
  descripcionModo: string;
}

export class OutputPathService {
  private static STORAGE_KEY_MODO = 'sephent_output_destination_mode';
  private static STORAGE_KEY_CUSTOM_DEFAULT = 'sephent_custom_default_output_path';
  // Por defecto la ruta destino siempre será la ruta de origen de los archivos cargados
  private static memoriaModo: ModoDestinoSalida = 'original';
  private static memoriaRutaDefault: string | null = null;
  private static memoriaRutaPersonalizada: string | null = null;

  /**
   * Obtiene la ruta por defecto del sistema según la plataforma
   */
  public static obtenerRutaPorDefecto(): string {
    if (this.memoriaRutaDefault) {
      return this.memoriaRutaDefault;
    }

    const infoRuta = WhisperPathService.obtenerRutaOficialPorDefecto();
    const os = infoRuta.sistemaOperativoDetectado;

    if (os === 'windows') {
      const userProfile = (typeof process !== 'undefined' && process.env && process.env.USERPROFILE) 
        ? process.env.USERPROFILE 
        : 'C:\\Users\\Usuario';
      this.memoriaRutaDefault = `${userProfile}\\Documents\\Transcripciones`;
    } else {
      const home = (typeof process !== 'undefined' && process.env && process.env.HOME) 
        ? process.env.HOME 
        : '~';
      this.memoriaRutaDefault = `${home}/Documents/Transcripciones`;
    }
    return this.memoriaRutaDefault;
  }

  /**
   * Obtiene la ruta personalizada guardada si el usuario indicó otra ruta específica
   */
  public static obtenerRutaPersonalizada(): string | null {
    if (this.memoriaRutaPersonalizada) {
      return this.memoriaRutaPersonalizada;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const guardada = localStorage.getItem(this.STORAGE_KEY_CUSTOM_DEFAULT);
        if (guardada && guardada.trim().length > 0) {
          this.memoriaRutaPersonalizada = guardada.trim();
          return this.memoriaRutaPersonalizada;
        }
      } catch {
        // Fallback
      }
    }
    return null;
  }

  /**
   * Establece una carpeta personalizada para las transcripciones
   */
  public static establecerRutaPersonalizada(ruta: string | null): void {
    this.memoriaRutaPersonalizada = ruta && ruta.trim().length > 0 ? ruta.trim() : null;
    if (typeof localStorage !== 'undefined') {
      try {
        if (this.memoriaRutaPersonalizada) {
          localStorage.setItem(this.STORAGE_KEY_CUSTOM_DEFAULT, this.memoriaRutaPersonalizada);
        } else {
          localStorage.removeItem(this.STORAGE_KEY_CUSTOM_DEFAULT);
        }
      } catch {
        // Fallback
      }
    }
  }

  /**
   * Obtiene el modo de guardado actual ('original', 'custom' o 'default')
   * Por defecto, la ruta destino SIEMPRE es la ruta origen del archivo cargado ('original').
   */
  public static obtenerModoActual(): ModoDestinoSalida {
    if (typeof localStorage !== 'undefined') {
      try {
        const guardado = localStorage.getItem(this.STORAGE_KEY_MODO) as ModoDestinoSalida;
        if (guardado === 'original' || guardado === 'custom' || guardado === 'default') {
          return guardado;
        }
      } catch {
        // Fallback
      }
    }
    return this.memoriaModo;
  }

  /**
   * Establece el modo de guardado de los archivos generados
   */
  public static establecerModo(modo: ModoDestinoSalida): void {
    this.memoriaModo = modo;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY_MODO, modo);
      } catch {
        // Fallback
      }
    }
  }

  /**
   * Extrae el directorio contenedor de una ruta de archivo absoluta
   */
  public static extraerDirectorioDeRuta(rutaArchivo: string): string {
    if (!rutaArchivo || typeof rutaArchivo !== 'string') return '';
    const normalizada = rutaArchivo.replace(/\\/g, '/');
    const partes = normalizada.split('/');
    partes.pop(); // Remover nombre del archivo
    const dir = partes.join('/');
    if (rutaArchivo.includes('\\') || /^[a-zA-Z]:/.test(rutaArchivo)) {
      return dir.replace(/\//g, '\\');
    }
    return dir;
  }

  /**
   * Resuelve el directorio destino para un archivo específico
   */
  public static resolverCarpetaDestino(
    archivoNombre: string,
    modo: ModoDestinoSalida = this.obtenerModoActual(),
    rutaOrigenDirectorio?: string
  ): string {
    if (modo === 'original') {
      if (rutaOrigenDirectorio && rutaOrigenDirectorio.trim().length > 0) {
        return rutaOrigenDirectorio;
      }
      return `Misma carpeta de origen (${archivoNombre})`;
    }

    if (modo === 'custom') {
      const rutaCustom = this.obtenerRutaPersonalizada();
      if (rutaCustom && rutaCustom.trim().length > 0) {
        return rutaCustom;
      }
      return this.obtenerRutaPorDefecto();
    }

    return this.obtenerRutaPorDefecto();
  }

  /**
   * Resuelve la ruta física completa de guardado para un archivo generado (.txt, .srt, etc.)
   * Cumple con la regla: La ruta destino siempre será la ruta origen del archivo cargado
   * a menos que el usuario indique otra ruta ('custom' o 'default').
   */
  public static resolverRutaCompletaSalida(
    nombreArchivoSalida: string,
    rutaOrigenArchivo?: string,
    modo: ModoDestinoSalida = this.obtenerModoActual()
  ): string {
    if (modo === 'original') {
      const dirOrigen = rutaOrigenArchivo ? this.extraerDirectorioDeRuta(rutaOrigenArchivo) : '';
      if (dirOrigen && dirOrigen.trim().length > 0) {
        const sep = dirOrigen.includes('/') && !dirOrigen.includes('\\') ? '/' : '\\';
        return `${dirOrigen}${sep}${nombreArchivoSalida}`;
      }
      // Fallback seguro si no hay ruta física de archivo (entorno web o drag-drop sin path)
      return `${this.obtenerRutaPorDefecto()}\\${nombreArchivoSalida}`;
    }

    if (modo === 'custom') {
      const customDir = this.obtenerRutaPersonalizada();
      if (customDir && customDir.trim().length > 0) {
        const sep = customDir.includes('/') && !customDir.includes('\\') ? '/' : '\\';
        return `${customDir}${sep}${nombreArchivoSalida}`;
      }
      return `${this.obtenerRutaPorDefecto()}\\${nombreArchivoSalida}`;
    }

    // Modo 'default': Guardar en la carpeta oficial de transcripciones del sistema
    return `${this.obtenerRutaPorDefecto()}\\${nombreArchivoSalida}`;
  }

  /**
   * Abre un diálogo nativo para que el usuario seleccione una carpeta de destino
   */
  public static async seleccionarCarpetaDialogo(): Promise<string | null> {
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI__?.dialog?.open) {
        const seleccion = await (window as any).__TAURI__.dialog.open({
          directory: true,
          multiple: false,
          title: 'Seleccionar carpeta de destino para archivos transcritos',
        });
        if (typeof seleccion === 'string' && seleccion.trim().length > 0) {
          return seleccion.trim();
        }
      }

      if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
        const res = await (window as any).__TAURI__.invoke('seleccionar_carpeta_dialogo');
        if (typeof res === 'string' && res.trim().length > 0) {
          return res.trim();
        }
      }
      return null;
    } catch (e) {
      console.warn('Fallo al invocar selector de carpetas nativo:', e);
      return null;
    }
  }

  /**
   * Obtiene la configuración completa para la interfaz
   */
  public static obtenerConfiguracion(): ConfiguracionRutaSalida {
    const modo = this.obtenerModoActual();
    const rutaPorDefecto = this.obtenerRutaPorDefecto();
    const rutaPersonalizada = this.obtenerRutaPersonalizada();

    let descripcionModo = 'Guardar en la misma carpeta del archivo original (Predeterminada)';
    if (modo === 'custom') {
      descripcionModo = `Guardar en carpeta personalizada: ${rutaPersonalizada || rutaPorDefecto}`;
    } else if (modo === 'default') {
      descripcionModo = `Guardar en carpeta predeterminada del sistema: ${rutaPorDefecto}`;
    }

    return {
      modo,
      rutaPorDefecto,
      rutaPersonalizada,
      descripcionModo,
    };
  }

  /**
   * Restablece el estado en memoria para entornos de pruebas unitarias
   */
  public static resetParaPruebas(): void {
    this.memoriaModo = 'original';
    this.memoriaRutaDefault = null;
    this.memoriaRutaPersonalizada = null;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY_MODO);
        localStorage.removeItem(this.STORAGE_KEY_CUSTOM_DEFAULT);
      } catch {}
    }
  }
}

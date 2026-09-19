/**
 * Servicio de Gestión de Rutas de Salida para Transcripciones
 * 
 * Permite al usuario alternar de forma sencilla entre:
 * 1. Carpeta predeterminada local (ej. Documentos\Transcripciones)
 * 2. Misma carpeta donde se ubica el archivo cargado originalmente
 */

import { WhisperPathService } from '../whisperPathService';

export type ModoDestinoSalida = 'default' | 'original';

export interface ConfiguracionRutaSalida {
  modo: ModoDestinoSalida;
  rutaPorDefecto: string;
  descripcionModo: string;
}

export class OutputPathService {
  private static STORAGE_KEY_MODO = 'sephent_output_destination_mode';
  private static STORAGE_KEY_CUSTOM_DEFAULT = 'sephent_custom_default_output_path';
  private static memoriaModo: ModoDestinoSalida = 'default';
  private static memoriaRutaDefault: string | null = null;

  /**
   * Obtiene la ruta por defecto del sistema según la plataforma
   */
  public static obtenerRutaPorDefecto(): string {
    if (this.memoriaRutaDefault) {
      return this.memoriaRutaDefault;
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const guardada = localStorage.getItem(this.STORAGE_KEY_CUSTOM_DEFAULT);
        if (guardada) {
          this.memoriaRutaDefault = guardada;
          return guardada;
        }
      } catch {
        // Fallback
      }
    }

    const infoRuta = WhisperPathService.obtenerRutaOficialPorDefecto();
    const os = infoRuta.sistemaOperativoDetectado;

    if (os === 'windows') {
      const userProfile = (typeof process !== 'undefined' && process.env && process.env.USERPROFILE) 
        ? process.env.USERPROFILE 
        : 'C:\\Users\\Usuario';
      return `${userProfile}\\Documents\\Transcripciones`;
    } else {
      const home = (typeof process !== 'undefined' && process.env && process.env.HOME) 
        ? process.env.HOME 
        : '~';
      return `${home}/Documents/Transcripciones`;
    }
  }

  /**
   * Obtiene el modo de guardado actual ('default' o 'original')
   */
  public static obtenerModoActual(): ModoDestinoSalida {
    if (typeof localStorage !== 'undefined') {
      try {
        const guardado = localStorage.getItem(this.STORAGE_KEY_MODO) as ModoDestinoSalida;
        if (guardado === 'default' || guardado === 'original') {
          return guardado;
        }
      } catch {
        // Fallback
      }
    }
    return this.memoriaModo;
  }

  /**
   * Establece el modo de guardado
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
   * Resuelve el directorio destino para un archivo específico
   */
  public static resolverCarpetaDestino(archivoNombre: string, modo: ModoDestinoSalida = this.obtenerModoActual()): string {
    if (modo === 'original') {
      return `Misma carpeta de origen (${archivoNombre})`;
    }
    return this.obtenerRutaPorDefecto();
  }

  /**
   * Obtiene la configuración completa para la interfaz
   */
  public static obtenerConfiguracion(): ConfiguracionRutaSalida {
    const modo = this.obtenerModoActual();
    const rutaPorDefecto = this.obtenerRutaPorDefecto();

    return {
      modo,
      rutaPorDefecto,
      descripcionModo: modo === 'default' 
        ? 'Guardar en la carpeta predeterminada de transcripciones' 
        : 'Guardar en la misma carpeta del archivo original',
    };
  }
}

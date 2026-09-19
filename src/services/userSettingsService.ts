/**
 * Servicio Centralizado de Configuración y Preferencias de Usuario (SOLID - SRP)
 * 
 * Garantiza que el programa recuerde SIEMPRE todas las opciones del usuario:
 * - Último modelo seleccionado / descargado
 * - Idioma preferido de transcripción
 * - Formatos de salida documental seleccionados (.txt, .srt, .mp4)
 * - Modo de carpeta de destino ('default' vs 'original')
 */

import { DEFAULT_MODEL } from '../config/whisperConfig';
import { ModelManager } from './modelManager';
import { OutputPathService, ModoDestinoSalida } from './transcription/outputPathService';

export type IdiomaPreferido = 'auto' | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'zh';

export interface ConfiguracionUsuario {
  modelo: string;
  idioma: IdiomaPreferido;
  outputTxt: boolean;
  outputSrt: boolean;
  outputVideo: boolean;
  modoDestino: ModoDestinoSalida;
}

export class UserSettingsService {
  private static STORAGE_KEY = 'sephent_user_settings_v1';

  private static configuracionPorDefecto: ConfiguracionUsuario = {
    modelo: DEFAULT_MODEL,
    idioma: 'auto',
    outputTxt: true,
    outputSrt: false,
    outputVideo: false,
    modoDestino: 'default',
  };

  private static memoriaConfiguracion: ConfiguracionUsuario | null = null;

  /**
   * Obtiene la configuración guardada del usuario con fallback a valores por defecto
   */
  public static obtenerConfiguracion(): ConfiguracionUsuario {
    const modeloResuelto = ModelManager.resolverModeloPorDefecto();

    if (this.memoriaConfiguracion) {
      this.memoriaConfiguracion.modelo = modeloResuelto;
      return { ...this.memoriaConfiguracion };
    }

    let configRecuperada: Partial<ConfiguracionUsuario> = {};

    if (typeof localStorage !== 'undefined') {
      try {
        const data = localStorage.getItem(this.STORAGE_KEY);
        if (data) {
          configRecuperada = JSON.parse(data);
        }
      } catch (e) {
        console.warn('Error al leer preferencias de usuario:', e);
      }
    }

    // Sincronizar modo destino de OutputPathService
    const modoDestinoPersistido = OutputPathService.obtenerModoActual();

    const configFinal: ConfiguracionUsuario = {
      modelo: modeloResuelto,
      idioma: (configRecuperada.idioma as IdiomaPreferido) || this.configuracionPorDefecto.idioma,
      outputTxt: typeof configRecuperada.outputTxt === 'boolean' ? configRecuperada.outputTxt : this.configuracionPorDefecto.outputTxt,
      outputSrt: typeof configRecuperada.outputSrt === 'boolean' ? configRecuperada.outputSrt : this.configuracionPorDefecto.outputSrt,
      outputVideo: typeof configRecuperada.outputVideo === 'boolean' ? configRecuperada.outputVideo : this.configuracionPorDefecto.outputVideo,
      modoDestino: configRecuperada.modoDestino || modoDestinoPersistido || this.configuracionPorDefecto.modoDestino,
    };

    this.memoriaConfiguracion = configFinal;
    return { ...configFinal };
  }

  /**
   * Guarda o actualiza campos de configuración de forma persistente
   */
  public static guardarConfiguracion(parcial: Partial<ConfiguracionUsuario>): ConfiguracionUsuario {
    const actual = this.obtenerConfiguracion();
    const actualizada: ConfiguracionUsuario = {
      ...actual,
      ...parcial,
    };

    if (parcial.modelo) {
      ModelManager.registrarUltimoModeloUtilizado(parcial.modelo);
    }
    if (parcial.modoDestino) {
      OutputPathService.establecerModo(parcial.modoDestino);
    }

    this.memoriaConfiguracion = actualizada;

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(actualizada));
      } catch (e) {
        console.warn('Error al guardar preferencias de usuario:', e);
      }
    }

    return { ...actualizada };
  }

  /**
   * Restablece la configuración a los valores por defecto
   */
  public static restablecer(): ConfiguracionUsuario {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (e) {
        // Fallback
      }
    }
    const def = { ...this.configuracionPorDefecto };
    def.modelo = ModelManager.resolverModeloPorDefecto();
    this.memoriaConfiguracion = { ...def };
    return { ...def };
  }
}

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
import { WhisperPathService } from './whisperPathService';
import { OutputPathService, ModoDestinoSalida } from './transcription/outputPathService';

export type IdiomaPreferido = 'auto' | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'zh';

export const ROLES_PREDEFINIDOS_CANONICOS: readonly string[] = [
  'Juez / Autoridad',
  'Fiscal / Ministerio Público',
  'Defensor / Abogado',
  'Perito / Especialista',
  'Testigo',
  'Víctima / Querellante',
  'Imputado / Declarante',
  'Secretario de Acuerdos',
  'Interlocutor / Participante',
];

export interface ConfiguracionUsuario {
  modelo: string;
  idioma: IdiomaPreferido;
  diarizarHablantes: boolean;
  outputTxt: boolean;
  outputSrt: boolean;
  outputVideo: boolean;
  modoDestino: ModoDestinoSalida;
  rutaModelosPersonalizada?: string | null;
  rolesPersonalizados?: string[];
  mostrarRolEnNombre?: boolean;
  interfazGraficaId?: string;
  evitarTruncamiento?: boolean;
}

export class UserSettingsService {
  private static STORAGE_KEY = 'sephent_user_settings_v1';
  private static ROLES_STORAGE_KEY = 'sephent_custom_roles_v1';

  private static configuracionPorDefecto: ConfiguracionUsuario = {
    modelo: DEFAULT_MODEL,
    idioma: 'auto',
    diarizarHablantes: true,
    outputTxt: true,
    outputSrt: false,
    outputVideo: false,
    modoDestino: 'default',
    rolesPersonalizados: [],
    mostrarRolEnNombre: false,
    interfazGraficaId: 'classic',
    evitarTruncamiento: true,
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

    const rolesPersistidos = this.obtenerRolesPersonalizadosPrivado();

    const configFinal: ConfiguracionUsuario = {
      modelo: modeloResuelto,
      idioma: (configRecuperada.idioma as IdiomaPreferido) || this.configuracionPorDefecto.idioma,
      diarizarHablantes: typeof configRecuperada.diarizarHablantes === 'boolean' ? configRecuperada.diarizarHablantes : this.configuracionPorDefecto.diarizarHablantes,
      outputTxt: typeof configRecuperada.outputTxt === 'boolean' ? configRecuperada.outputTxt : this.configuracionPorDefecto.outputTxt,
      outputSrt: typeof configRecuperada.outputSrt === 'boolean' ? configRecuperada.outputSrt : this.configuracionPorDefecto.outputSrt,
      outputVideo: typeof configRecuperada.outputVideo === 'boolean' ? configRecuperada.outputVideo : this.configuracionPorDefecto.outputVideo,
      modoDestino: configRecuperada.modoDestino || modoDestinoPersistido || this.configuracionPorDefecto.modoDestino,
      rutaModelosPersonalizada: configRecuperada.rutaModelosPersonalizada !== undefined
        ? configRecuperada.rutaModelosPersonalizada
        : (WhisperPathService.obtenerRutaOficialPorDefecto().esRutaPersonalizada ? WhisperPathService.obtenerRutaOficialPorDefecto().rutaPorDefectoOficial : null),
      rolesPersonalizados: rolesPersistidos,
      mostrarRolEnNombre: typeof configRecuperada.mostrarRolEnNombre === 'boolean' ? configRecuperada.mostrarRolEnNombre : this.configuracionPorDefecto.mostrarRolEnNombre,
      interfazGraficaId: configRecuperada.interfazGraficaId || this.configuracionPorDefecto.interfazGraficaId,
      evitarTruncamiento: typeof configRecuperada.evitarTruncamiento === 'boolean' ? configRecuperada.evitarTruncamiento : this.configuracionPorDefecto.evitarTruncamiento,
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
    if (parcial.rutaModelosPersonalizada !== undefined) {
      WhisperPathService.guardarRutaPersonalizada(parcial.rutaModelosPersonalizada || '');
    }
    if (parcial.rolesPersonalizados) {
      this.guardarRolesPersonalizadosPrivado(parcial.rolesPersonalizados);
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
   * Obtiene todos los roles disponibles (canónicos predefinidos + personalizados globales del usuario)
   */
  public static obtenerRolesGlobales(): string[] {
    const customs = this.obtenerRolesPersonalizadosPrivado();
    const setRoles = new Set<string>([...ROLES_PREDEFINIDOS_CANONICOS, ...customs]);
    return Array.from(setRoles);
  }

  /**
   * Agrega un nuevo rol personalizado global y lo persiste en memoria y disco/localStorage
   */
  public static agregarRolPersonalizado(nuevoRol: string): string[] {
    const rolLimpio = nuevoRol.trim();
    if (!rolLimpio) return this.obtenerRolesGlobales();

    const actuales = this.obtenerRolesPersonalizadosPrivado();
    const yaExiste = actuales.some((r) => r.toLowerCase() === rolLimpio.toLowerCase()) ||
                     ROLES_PREDEFINIDOS_CANONICOS.some((r) => r.toLowerCase() === rolLimpio.toLowerCase());

    if (!yaExiste) {
      const actualizados = [...actuales, rolLimpio];
      this.guardarRolesPersonalizadosPrivado(actualizados);
      if (this.memoriaConfiguracion) {
        this.memoriaConfiguracion.rolesPersonalizados = actualizados;
      }
    }

    return this.obtenerRolesGlobales();
  }

  /**
   * Elimina un rol personalizado si fue añadido por el usuario
   */
  public static eliminarRolPersonalizado(rolAEliminar: string): string[] {
    const actuales = this.obtenerRolesPersonalizadosPrivado();
    const filtrados = actuales.filter((r) => r.toLowerCase() !== rolAEliminar.trim().toLowerCase());
    this.guardarRolesPersonalizadosPrivado(filtrados);
    if (this.memoriaConfiguracion) {
      this.memoriaConfiguracion.rolesPersonalizados = filtrados;
    }
    return this.obtenerRolesGlobales();
  }

  private static obtenerRolesPersonalizadosPrivado(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(this.ROLES_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error al leer roles personalizados:', e);
    }
    return [];
  }

  private static guardarRolesPersonalizadosPrivado(roles: string[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.ROLES_STORAGE_KEY, JSON.stringify(roles));
    } catch (e) {
      console.warn('Error al guardar roles personalizados:', e);
    }
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

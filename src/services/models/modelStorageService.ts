/**
 * Implementación del Servicio de Almacenamiento y Relocalización de Modelos Whisper
 * 
 * Principios de Arquitectura (Estilo Arturo):
 * - Cumplimiento del contrato IModelStorageService.
 * - Composition Root y resolución mediante Factory Pattern.
 * - Manejo robusto de errores de permisos, volúmenes de disco y fallos de E/S.
 * - Actualización transparente de WhisperPathService y persistencia atómica.
 */

import {
  IModelStorageService,
  ValidacionPermisosCarpeta,
  ProgresoRelocalizacion,
  ResultadoRelocalizacion,
} from './modelStorageTypes';
import { WhisperPathService, InformacionRutaOficial } from '../whisperPathService';
import { invoke } from '@tauri-apps/api/tauri';

/**
 * Implementación Desktop con integración nativa a través del backend Tauri (Rust).
 */
export class TauriModelStorageService implements IModelStorageService {
  private getInvoker(): (cmd: string, args?: Record<string, any>) => Promise<any> {
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
      return (window as any).__TAURI__.invoke;
    }
    return invoke;
  }

  public obtenerRutaActual(): InformacionRutaOficial {
    return WhisperPathService.obtenerRutaOficialPorDefecto();
  }

  public async validarPermisosCarpeta(ruta: string): Promise<ValidacionPermisosCarpeta> {
    if (!ruta || ruta.trim().length === 0) {
      return {
        esValida: false,
        puedeEscribir: false,
        rutaNormalizada: '',
        esMismaRutaActual: false,
        esDirectorioSistema: false,
        error: 'Ruta no especificada',
        mensajePedagogico: 'Debes indicar una ruta de carpeta válida.',
      };
    }

    const rutaLimpia = ruta.trim();
    const rutaActual = this.obtenerRutaActual().rutaPorDefectoOficial;

    // Normalizar para comparación exacta insensible a mayúsculas en Windows
    const normActual = rutaActual.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');
    const normDestino = rutaLimpia.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');

    if (normActual === normDestino) {
      return {
        esValida: false,
        puedeEscribir: true,
        rutaNormalizada: rutaLimpia,
        esMismaRutaActual: true,
        esDirectorioSistema: false,
        error: 'Misma carpeta actual',
        mensajePedagogico: 'La carpeta seleccionada ya es la ubicación activa de los modelos.',
      };
    }

    try {
      const invoker = this.getInvoker();
      const rawRes = await invoker('verificar_permisos_directorio', { ruta: rutaLimpia });
      const parsed: ValidacionPermisosCarpeta = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;
      return parsed;
    } catch (err: any) {
      const msg = err?.message || String(err);
      return {
        esValida: false,
        puedeEscribir: false,
        rutaNormalizada: rutaLimpia,
        esMismaRutaActual: false,
        esDirectorioSistema: false,
        error: msg,
        mensajePedagogico: `No se pudo validar la carpeta: ${msg}`,
      };
    }
  }

  public async seleccionarCarpetaDialogo(): Promise<string | null> {
    try {
      // 1. Intentar diálogo nativo de Tauri API dialog
      if (typeof window !== 'undefined' && (window as any).__TAURI__?.dialog?.open) {
        const seleccion = await (window as any).__TAURI__.dialog.open({
          directory: true,
          multiple: false,
          title: 'Seleccionar carpeta personalizada para modelos OpenAI Whisper',
        });
        if (typeof seleccion === 'string' && seleccion.trim().length > 0) {
          return seleccion.trim();
        }
      }

      // 2. Intentar comando backend en Rust
      const invoker = this.getInvoker();
      const res = await invoker('seleccionar_carpeta_dialogo');
      if (typeof res === 'string' && res.trim().length > 0) {
        return res.trim();
      }
      return null;
    } catch (e) {
      console.warn('Fallo al invocar selector de carpetas nativo:', e);
      return null;
    }
  }

  public async moverModelosACarpeta(
    nuevaRuta: string,
    onProgreso?: (progreso: ProgresoRelocalizacion) => void
  ): Promise<ResultadoRelocalizacion> {
    const validacion = await this.validarPermisosCarpeta(nuevaRuta);
    if (!validacion.esValida || !validacion.puedeEscribir) {
      return {
        exito: false,
        archivosMovidos: [],
        archivosOmitidos: [],
        bytesTransferidos: 0,
        rutaAnterior: this.obtenerRutaActual().rutaPorDefectoOficial,
        rutaNueva: nuevaRuta,
        error: validacion.error || 'Permisos denegados',
        mensaje: validacion.mensajePedagogico,
      };
    }

    const tauri = (typeof window !== 'undefined' && (window as any).__TAURI__) ? (window as any).__TAURI__ : null;
    let unlisten: (() => void) | undefined = undefined;

    if (tauri?.event?.listen && onProgreso) {
      try {
        unlisten = await tauri.event.listen('relocalizacion-progreso', (evento: any) => {
          if (evento?.payload) {
            onProgreso(evento.payload as ProgresoRelocalizacion);
          }
        });
      } catch (e) {
        console.warn('No se pudo escuchar eventos de progreso de relocalización:', e);
      }
    }

    try {
      const invoker = this.getInvoker();
      const rutaAnterior = this.obtenerRutaActual().rutaPorDefectoOficial;
      const rawRes = await invoker('mover_modelos_whisper', {
        rutaOrigen: rutaAnterior,
        rutaDestino: validacion.rutaNormalizada,
      });

      const parsed: ResultadoRelocalizacion = typeof rawRes === 'string' ? JSON.parse(rawRes) : rawRes;

      if (parsed.exito) {
        // Persistir la nueva ruta como la predeterminada oficial de la aplicación
        WhisperPathService.guardarRutaPersonalizada(parsed.rutaNueva);
      }

      return parsed;
    } catch (err: any) {
      const msg = err?.message || String(err);
      return {
        exito: false,
        archivosMovidos: [],
        archivosOmitidos: [],
        bytesTransferidos: 0,
        rutaAnterior: this.obtenerRutaActual().rutaPorDefectoOficial,
        rutaNueva: nuevaRuta,
        error: msg,
        mensaje: `Error durante la relocalización de modelos: ${msg}`,
      };
    } finally {
      if (unlisten) {
        try {
          unlisten();
        } catch {}
      }
    }
  }

  public async restablecerRutaOficial(
    moverArchivosExistentes: boolean = true,
    onProgreso?: (progreso: ProgresoRelocalizacion) => void
  ): Promise<ResultadoRelocalizacion> {
    const rutaPersonalizadaActual = WhisperPathService.obtenerRutaOficialPorDefecto();
    if (!rutaPersonalizadaActual.esRutaPersonalizada) {
      return {
        exito: true,
        archivosMovidos: [],
        archivosOmitidos: [],
        bytesTransferidos: 0,
        rutaAnterior: rutaPersonalizadaActual.rutaPorDefectoOficial,
        rutaNueva: rutaPersonalizadaActual.rutaPorDefectoOficial,
        mensaje: 'El sistema ya se encuentra en la ruta oficial por defecto.',
      };
    }

    // Ruta canónica oficial de destino
    WhisperPathService.guardarRutaPersonalizada(''); // Limpia la personalizada temporalmente para resolver la canónica
    const rutaCanonica = WhisperPathService.obtenerRutaOficialPorDefecto().rutaPorDefectoOficial;
    // Restaurar temporalmente para realizar la migración si corresponde
    WhisperPathService.guardarRutaPersonalizada(rutaPersonalizadaActual.rutaPorDefectoOficial);

    if (moverArchivosExistentes) {
      const resultado = await this.moverModelosACarpeta(rutaCanonica, onProgreso);
      if (resultado.exito) {
        WhisperPathService.restablecerRutaOficial();
        return {
          ...resultado,
          rutaNueva: rutaCanonica,
          mensaje: 'Modelos trasladados exitosamente a la carpeta canónica oficial por defecto.',
        };
      }
      return resultado;
    } else {
      WhisperPathService.restablecerRutaOficial();
      return {
        exito: true,
        archivosMovidos: [],
        archivosOmitidos: [],
        bytesTransferidos: 0,
        rutaAnterior: rutaPersonalizadaActual.rutaPorDefectoOficial,
        rutaNueva: rutaCanonica,
        mensaje: 'Ubicación restablecida a la carpeta oficial por defecto.',
      };
    }
  }
}

/**
 * Implementación web/mock para pruebas unitarias sin dependencias de Tauri nativo.
 */
export class WebModelStorageService implements IModelStorageService {
  public obtenerRutaActual(): InformacionRutaOficial {
    return WhisperPathService.obtenerRutaOficialPorDefecto();
  }

  public async validarPermisosCarpeta(ruta: string): Promise<ValidacionPermisosCarpeta> {
    if (!ruta || ruta.trim().length === 0) {
      return {
        esValida: false,
        puedeEscribir: false,
        rutaNormalizada: '',
        esMismaRutaActual: false,
        esDirectorioSistema: false,
        error: 'Ruta vacía',
        mensajePedagogico: 'La ruta no puede estar vacía.',
      };
    }

    const norm = ruta.trim().replace(/\//g, '\\');
    const actual = this.obtenerRutaActual().rutaPorDefectoOficial.replace(/\//g, '\\');

    if (norm.toLowerCase() === actual.toLowerCase()) {
      return {
        esValida: false,
        puedeEscribir: true,
        rutaNormalizada: norm,
        esMismaRutaActual: true,
        esDirectorioSistema: false,
        error: 'Misma carpeta',
        mensajePedagogico: 'La carpeta seleccionada ya es la carpeta actual de modelos.',
      };
    }

    return {
      esValida: true,
      puedeEscribir: true,
      rutaNormalizada: norm,
      espacioLibreMB: 50000,
      esMismaRutaActual: false,
      esDirectorioSistema: false,
      mensajePedagogico: 'Carpeta con permisos de lectura y escritura validados correctamente.',
    };
  }

  public async seleccionarCarpetaDialogo(): Promise<string | null> {
    return 'D:\\ModelosWhisperPersonalizados';
  }

  public async moverModelosACarpeta(
    nuevaRuta: string,
    onProgreso?: (progreso: ProgresoRelocalizacion) => void
  ): Promise<ResultadoRelocalizacion> {
    const val = await this.validarPermisosCarpeta(nuevaRuta);
    if (!val.esValida) {
      return {
        exito: false,
        archivosMovidos: [],
        archivosOmitidos: [],
        bytesTransferidos: 0,
        rutaAnterior: this.obtenerRutaActual().rutaPorDefectoOficial,
        rutaNueva: nuevaRuta,
        error: val.error,
        mensaje: val.mensajePedagogico,
      };
    }

    if (onProgreso) {
      onProgreso({
        archivoActual: 'base.pt',
        indice: 1,
        totalArchivos: 1,
        porcentaje: 100,
        bytesTransferidos: 142 * 1024 * 1024,
        totalBytes: 142 * 1024 * 1024,
        mensaje: 'Migración simulada completada exitosamente.',
      });
    }

    const anterior = this.obtenerRutaActual().rutaPorDefectoOficial;
    WhisperPathService.guardarRutaPersonalizada(val.rutaNormalizada);

    return {
      exito: true,
      archivosMovidos: ['base.pt'],
      archivosOmitidos: [],
      bytesTransferidos: 142 * 1024 * 1024,
      rutaAnterior: anterior,
      rutaNueva: val.rutaNormalizada,
      mensaje: 'Modelos trasladados con éxito a la nueva ubicación.',
    };
  }

  public async restablecerRutaOficial(): Promise<ResultadoRelocalizacion> {
    const anterior = this.obtenerRutaActual().rutaPorDefectoOficial;
    const can = WhisperPathService.restablecerRutaOficial();
    return {
      exito: true,
      archivosMovidos: [],
      archivosOmitidos: [],
      bytesTransferidos: 0,
      rutaAnterior: anterior,
      rutaNueva: can.rutaPorDefectoOficial,
      mensaje: 'Ubicación restablecida a la carpeta canónica oficial.',
    };
  }
}

/**
 * Factory y Composition Root para el servicio de almacenamiento de modelos.
 */
export class ModelStorageServiceFactory {
  private static instancia: IModelStorageService | null = null;

  public static obtenerServicio(): IModelStorageService {
    if (!this.instancia) {
      const esDesktop = typeof window !== 'undefined' && !!((window as any).__TAURI__ || (window as any).__TAURI_IPC__);
      if (esDesktop) {
        this.instancia = new TauriModelStorageService();
      } else {
        this.instancia = new WebModelStorageService();
      }
    }
    return this.instancia;
  }

  public static establecerInstancia(servicio: IModelStorageService): void {
    this.instancia = servicio;
  }
}

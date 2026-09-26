/**
 * Contratos Explícitos del Subsistema de Almacenamiento y Relocalización de Modelos
 * 
 * Basado en los principios de arquitectura adaptable (Estilo Arturo):
 * - Contratos estrictos mediante interfaces puras y tipos desacoplados.
 * - Inmutabilidad en los resultados de validación.
 * - Prevención estricta de errores de permisos y rutas malformadas.
 */

import { InformacionRutaOficial } from '../whisperPathService';
import { ModeloInstaladoInfo } from '../modelManager';

/**
 * Resultado inmutable de la validación previa de una carpeta destino.
 */
export interface ValidacionPermisosCarpeta {
  esValida: boolean;
  puedeEscribir: boolean;
  rutaNormalizada: string;
  espacioLibreMB?: number;
  esMismaRutaActual: boolean;
  esDirectorioSistema: boolean;
  error?: string;
  mensajePedagogico: string;
}

/**
 * Evento emitido durante la migración progresiva de archivos.
 */
export interface ProgresoRelocalizacion {
  archivoActual: string;
  indice: number;
  totalArchivos: number;
  porcentaje: number;
  bytesTransferidos: number;
  totalBytes: number;
  mensaje: string;
}

/**
 * Resumen consolidado del resultado de una relocalización.
 */
export interface ResultadoRelocalizacion {
  exito: boolean;
  archivosMovidos: string[];
  archivosOmitidos: string[];
  bytesTransferidos: number;
  rutaAnterior: string;
  rutaNueva: string;
  error?: string;
  mensaje: string;
}

/**
 * Contrato canónico para el servicio de gestión de almacenamiento y relocalización de modelos.
 */
export interface IModelStorageService {
  /**
   * Obtiene la ruta actualmente activa (oficial o personalizada).
   */
  obtenerRutaActual(): InformacionRutaOficial;

  /**
   * Valida exhaustivamente si una ruta es apta para almacenar modelos:
   * verifica existencia, formato, caracteres prohibidos, permisos reales de escritura
   * y espacio libre suficiente.
   */
  validarPermisosCarpeta(ruta: string): Promise<ValidacionPermisosCarpeta>;

  /**
   * Invoca el diálogo nativo del sistema para que el usuario seleccione una carpeta.
   */
  seleccionarCarpetaDialogo(): Promise<string | null>;

  /**
   * Mueve de forma segura y atómica todos los modelos existentes hacia la nueva ruta destino,
   * aplicando verificación de integridad y prevención de fallos entre unidades de disco (EXDEV).
   */
  moverModelosACarpeta(
    nuevaRuta: string,
    onProgreso?: (progreso: ProgresoRelocalizacion) => void
  ): Promise<ResultadoRelocalizacion>;

  /**
   * Restablece la configuración a la carpeta canónica oficial por defecto de OpenAI Whisper.
   */
  restablecerRutaOficial(
    moverArchivosExistentes?: boolean,
    onProgreso?: (progreso: ProgresoRelocalizacion) => void
  ): Promise<ResultadoRelocalizacion>;
}

/**
 * Contrato del Administrador de Interfaces Gráficas Pluggables (Estilo Arturo)
 * 
 * Permite registrar, enumerar y alternar en tiempo de ejecución entre diferentes
 * interfaces de usuario implementadas con tecnologías o paradigmas diversos.
 */

import { IGUIView, IGUIViewDescriptor } from './IGUIView';

export interface IGUIManager {
  /**
   * Registra una nueva implementación de interfaz gráfica
   */
  registrarInterfaz(gui: IGUIView): void;

  /**
   * Lista los descriptores de todas las interfaces registradas
   */
  obtenerInterfaces(): IGUIViewDescriptor[];

  /**
   * Obtiene la instancia completa de la interfaz gráfica activa
   */
  obtenerInterfazActiva(): IGUIView;

  /**
   * Obtiene el identificador de la interfaz activa
   */
  obtenerIdActivo(): string;

  /**
   * Cambia la interfaz activa por su identificador
   * @returns true si el cambio fue exitoso, false si no se encontró
   */
  establecerInterfazActiva(id: string): boolean;

  /**
   * Suscribe un callback a cambios de interfaz gráfica activa
   * @returns función para desuscribir
   */
  suscribirCambio(callback: (gui: IGUIView) => void): () => void;
}

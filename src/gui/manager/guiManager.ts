/**
 * GUIManager — Gestor Centralizado de Interfaces Gráficas Pluggables (Estilo Arturo)
 * 
 * Implementa el contrato IGUIManager bajo el principio Abierto/Cerrado (OCP).
 * Permite alternar dinámicamente entre múltiples tecnologías o diseños de interfaz
 * sin acoplar la aplicación a un framework o paradigma visual específico.
 */

import { IGUIManager } from '../../core/contracts/IGUIManager';
import { IGUIView, IGUIViewDescriptor } from '../../core/contracts/IGUIView';
import { UserSettingsService } from '../../services/userSettingsService';

export class GUIManager implements IGUIManager {
  private interfaces = new Map<string, IGUIView>();
  private idActivo: string = 'streamlined';
  private oyentes: Set<(gui: IGUIView) => void> = new Set();

  constructor() {
    try {
      const config = UserSettingsService.obtenerConfiguracion();
      if (config.interfazGraficaId) {
        this.idActivo = config.interfazGraficaId;
      }
    } catch {
      this.idActivo = 'streamlined';
    }
  }

  public registrarInterfaz(gui: IGUIView): void {
    this.interfaces.set(gui.id, gui);
  }

  public obtenerInterfaces(): IGUIViewDescriptor[] {
    return Array.from(this.interfaces.values()).map((v) => ({
      id: v.id,
      name: v.name,
      description: v.description,
      technology: v.technology,
      badge: v.badge,
      icon: v.icon,
      isExperimental: v.isExperimental,
    }));
  }

  public obtenerInterfazActiva(): IGUIView {
    const activa = this.interfaces.get(this.idActivo);
    if (activa) {
      return activa;
    }

    // Fallback: primera interfaz registrada
    const primera = this.interfaces.values().next().value;
    if (primera) {
      return primera;
    }

    throw new Error('[GUIManager] No hay ninguna interfaz gráfica registrada en el sistema.');
  }

  public obtenerIdActivo(): string {
    return this.idActivo;
  }

  public establecerInterfazActiva(id: string): boolean {
    if (!this.interfaces.has(id)) {
      console.warn(`[GUIManager] Intento de activar interfaz desconocida: "${id}"`);
      return false;
    }

    if (this.idActivo === id) {
      return true; // Ya está activa
    }

    this.idActivo = id;

    // Persistir preferencia del usuario
    try {
      UserSettingsService.guardarConfiguracion({ interfazGraficaId: id });
    } catch (err) {
      console.warn('[GUIManager] Error al persistir interfaz gráfica activa:', err);
    }

    // Notificar a componentes reactivos
    const nuevaActiva = this.obtenerInterfazActiva();
    this.notificarOyentes(nuevaActiva);
    return true;
  }

  public suscribirCambio(callback: (gui: IGUIView) => void): () => void {
    this.oyentes.add(callback);
    return () => {
      this.oyentes.delete(callback);
    };
  }

  private notificarOyentes(gui: IGUIView): void {
    this.oyentes.forEach((callback) => {
      try {
        callback(gui);
      } catch (err) {
        console.error('[GUIManager] Error en callback de suscriptor de GUI:', err);
      }
    });
  }
}

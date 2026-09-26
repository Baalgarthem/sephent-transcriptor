/**
 * Contrato de Telemetría Acústica y Estimación de Tiempo (ETA)
 * 
 * Centraliza el cálculo de métricas en tiempo real, estimación de completado
 * y amortiguamiento de fluctuaciones temporales.
 */

export interface MetricasProgresoTemporal {
  porcentaje: number;
  etapaActual: number;
  totalEtapas: number;
  mensaje: string;
  tiempoTranscurridoSegundos: number;
  tiempoRestanteSegundos: number;
  velocidadFactor: number;
  segundosProcesadosAudio: number;
  totalSegundosAudio: number;
  estaActivo: boolean;
}

export interface ITelemetryService {
  iniciarSesion(totalEtapas?: number, duracionAudioSegundos?: number): void;
  actualizar(porcentaje: number, mensaje: string, datosExtra?: Partial<MetricasProgresoTemporal>): MetricasProgresoTemporal;
  finalizar(): MetricasProgresoTemporal;
  obtenerMetricasActuales(): MetricasProgresoTemporal;
  formatearTiempo(segundos: number): string;
}

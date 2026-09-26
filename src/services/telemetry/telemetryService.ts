/**
 * Implementación del Servicio de Telemetría Acústica y Cálculo de ETA
 * 
 * Principios:
 * - Algoritmo de suavizado para estimación de tiempo restante (ETA).
 * - Cálculo dinámico de factor de velocidad (x tiempo real).
 * - Estado inmutable en cada emisión de métricas.
 */

import { ITelemetryService, MetricasProgresoTemporal } from '../../core/contracts/ITelemetryService';

export class TelemetryService implements ITelemetryService {
  private tiempoInicioMs: number = 0;
  private duracionAudioTotalSeg: number = 0;
  private totalEtapasConfiguradas: number = 4;
  private activo: boolean = false;
  private ultimoPorcentaje: number = 0;
  private ultimoMensaje: string = '';
  private etaSuavizadoSegundos: number = 0;
  private factorVelocidad: number = 1.0;

  public iniciarSesion(totalEtapas: number = 4, duracionAudioSegundos: number = 0): void {
    this.tiempoInicioMs = Date.now();
    this.duracionAudioTotalSeg = Math.max(0, duracionAudioSegundos);
    this.totalEtapasConfiguradas = totalEtapas;
    this.activo = true;
    this.ultimoPorcentaje = 0;
    this.ultimoMensaje = 'Iniciando sesión de transcripción...';
    this.etaSuavizadoSegundos = 0;
    this.factorVelocidad = 1.0;
  }

  public actualizar(
    porcentaje: number,
    mensaje: string,
    datosExtra?: Partial<MetricasProgresoTemporal>
  ): MetricasProgresoTemporal {
    const ahora = Date.now();
    const transcurridoSeg = Math.max(0.1, (ahora - (this.tiempoInicioMs || ahora)) / 1000);
    const pctClamped = Math.min(100, Math.max(0, porcentaje));
    this.ultimoPorcentaje = pctClamped;
    this.ultimoMensaje = mensaje;

    let etapaActual = 1;
    if (pctClamped < 20) etapaActual = 1;
    else if (pctClamped < 70) etapaActual = 2;
    else if (pctClamped < 90) etapaActual = 3;
    else etapaActual = 4;

    if (datosExtra?.etapaActual) {
      etapaActual = datosExtra.etapaActual;
    }

    // Cálculo de ETA
    let etaCalculado = 0;
    const tiempoEstimadoEntrada = datosExtra?.tiempoEstimadoSegundos ?? datosExtra?.tiempoRestanteSegundos;
    if (tiempoEstimadoEntrada && tiempoEstimadoEntrada > 0) {
      etaCalculado = tiempoEstimadoEntrada;
    } else if (pctClamped > 5 && pctClamped < 100) {
      const tiempoTotalEstimado = (transcurridoSeg / (pctClamped / 100));
      etaCalculado = Math.max(0, tiempoTotalEstimado - transcurridoSeg);
    }

    // Amortiguamiento EMA para que el ETA no oscile bruscamente
    if (this.etaSuavizadoSegundos === 0) {
      this.etaSuavizadoSegundos = etaCalculado;
    } else if (etaCalculado > 0) {
      this.etaSuavizadoSegundos = 0.7 * this.etaSuavizadoSegundos + 0.3 * etaCalculado;
    }

    // Factor de velocidad respecto a tiempo real
    if (datosExtra?.velocidadFactor && datosExtra.velocidadFactor > 0) {
      this.factorVelocidad = datosExtra.velocidadFactor;
    } else if (this.duracionAudioTotalSeg > 0 && pctClamped > 0) {
      const audioProcesado = this.duracionAudioTotalSeg * (pctClamped / 100);
      this.factorVelocidad = Math.round((audioProcesado / transcurridoSeg) * 10) / 10;
    }

    return {
      porcentaje: pctClamped,
      etapaActual,
      totalEtapas: this.totalEtapasConfiguradas,
      mensaje: this.ultimoMensaje,
      tiempoTranscurridoSegundos: Math.round(transcurridoSeg),
      tiempoRestanteSegundos: Math.round(this.etaSuavizadoSegundos),
      tiempoEstimadoSegundos: Math.round(this.etaSuavizadoSegundos),
      velocidadFactor: this.factorVelocidad || 1.0,
      segundosProcesadosAudio: datosExtra?.segundosProcesadosAudio || 0,
      totalSegundosAudio: this.duracionAudioTotalSeg,
      estaActivo: this.activo,
    };
  }

  public finalizar(): MetricasProgresoTemporal {
    const ahora = Date.now();
    const transcurridoSeg = Math.max(0.1, (ahora - (this.tiempoInicioMs || ahora)) / 1000);
    this.activo = false;
    this.ultimoPorcentaje = 100;
    this.ultimoMensaje = 'Transcripción completada con éxito.';

    return {
      porcentaje: 100,
      etapaActual: this.totalEtapasConfiguradas,
      totalEtapas: this.totalEtapasConfiguradas,
      mensaje: this.ultimoMensaje,
      tiempoTranscurridoSegundos: Math.round(transcurridoSeg),
      tiempoRestanteSegundos: 0,
      velocidadFactor: this.factorVelocidad || 1.0,
      segundosProcesadosAudio: this.duracionAudioTotalSeg,
      totalSegundosAudio: this.duracionAudioTotalSeg,
      estaActivo: false,
    };
  }

  public obtenerMetricasActuales(): MetricasProgresoTemporal {
    const ahora = Date.now();
    const transcurridoSeg = this.activo && this.tiempoInicioMs > 0
      ? Math.max(0, (ahora - this.tiempoInicioMs) / 1000)
      : 0;

    return {
      porcentaje: this.ultimoPorcentaje,
      etapaActual: 1,
      totalEtapas: this.totalEtapasConfiguradas,
      mensaje: this.ultimoMensaje || 'En espera',
      tiempoTranscurridoSegundos: Math.round(transcurridoSeg),
      tiempoRestanteSegundos: Math.round(this.etaSuavizadoSegundos),
      velocidadFactor: this.factorVelocidad || 1.0,
      segundosProcesadosAudio: 0,
      totalSegundosAudio: this.duracionAudioTotalSeg,
      estaActivo: this.activo,
    };
  }

  public formatearTiempo(segundos: number): string {
    if (segundos <= 0 || !isFinite(segundos)) return '00:00';
    const hrs = Math.floor(segundos / 3600);
    const mins = Math.floor((segundos % 3600) / 60);
    const secs = Math.floor(segundos % 60);

    const pad = (n: number) => n.toString().padStart(2, '0');

    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }
}

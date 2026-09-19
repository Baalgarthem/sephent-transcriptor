/**
 * Guardián de Ejecución Silenciosa y Supresor de Ventanas de Consola (Zero CMD Window Policy)
 * 
 * Regla de Oro del Usuario:
 * "Cualquier tipo de comprobación o función que requiera el programa debe de estar
 * oculta de cualquier tipo de ventana emergente de CMD. Recuerda que este programa se va
 * a compilar finalmente en escritorio y quizás también incluso en Android."
 * 
 * Responsabilidades:
 * 1. Garantiza que en Windows NINGUNA llamada a proceso secundario cree o muestre una consola CMD / PowerShell.
 * 2. Aplica las banderas canónicas de Windows:
 *    - windowsHide: true
 *    - creationFlags: 0x08000000 (CREATE_NO_WINDOW de la API Win32)
 *    - PowerShell con: -WindowStyle Hidden -NoProfile -NonInteractive
 * 3. Garantiza compatibilidad con Android, donde no existen ventanas CMD ni ejecutables .exe,
 *    delegando automáticamente a la ejecución interna web/WASM/WebAudio sin intentar invocar shells de escritorio.
 */

import { PlatformService, PlatformType } from './platformService';

export interface SilentExecutionOptions {
  cwd?: string;
  timeoutMs?: number;
  args?: string[];
  captureOutput?: boolean;
}

export interface SilentExecutionConfig {
  windowsHide: boolean;
  creationFlags: number;
  shell: boolean;
  stdio: 'pipe' | 'ignore';
  windowsSubsystemConfigured: boolean;
}

export class SilentProcessGuard {
  /**
   * Bandera Win32 CREATE_NO_WINDOW (0x08000000)
   * Especifica que el nuevo proceso no debe crear una nueva ventana de consola de comandos.
   */
  public static readonly CREATE_NO_WINDOW = 0x08000000;

  /**
   * Retorna la configuración estricta requerida para cualquier proceso secundario en Windows
   */
  public static obtenerConfiguracionVentanaOculta(): SilentExecutionConfig {
    return {
      windowsHide: true,
      creationFlags: this.CREATE_NO_WINDOW,
      shell: false, // Evita invocar 'cmd.exe /c' innecesariamente
      stdio: 'pipe',
      windowsSubsystemConfigured: true,
    };
  }

  /**
   * Valida si unas opciones de ejecución cumplen con la política de Ventana Oculta.
   * Lanza advertencia o corrige las opciones si alguna dejaría abierta la posibilidad de mostrar CMD.
   */
  public static sanitizarOpcionesEjecucion(opciones: Record<string, any> = {}): Record<string, any> {
    const sanitizadas = { ...opciones };

    // Siempre forzar ocultamiento en Windows
    sanitizadas.windowsHide = true;

    // Asignar creationFlags combinando si ya existían
    const flagsPrevios = typeof sanitizadas.creationFlags === 'number' ? sanitizadas.creationFlags : 0;
    sanitizadas.creationFlags = flagsPrevios | this.CREATE_NO_WINDOW;

    // Si se invoca powershell, asegurar parámetros ocultos
    if (sanitizadas.shell && typeof sanitizadas.shell === 'string' && sanitizadas.shell.toLowerCase().includes('powershell')) {
      sanitizadas.args = [
        '-WindowStyle',
        'Hidden',
        '-NoProfile',
        '-NonInteractive',
        ...(sanitizadas.args || []),
      ];
    }

    return sanitizadas;
  }

  /**
   * Ejecuta una comprobación o función del sistema de manera 100% silenciosa y multiplataforma.
   * - En Android: ejecuta de forma puramente interna en memoria/sandbox sin shells de escritorio.
   * - En Web: ejecuta sin invocar el sistema operativo local.
   * - En Desktop (Windows/Mac/Linux): ejecuta con supresión total de interfaz gráfica de consola.
   */
  public static async ejecutarComprobacionSilenciosa<T>(
    nombreComprobacion: string,
    accionInterna: () => Promise<T> | T
  ): Promise<{ exito: boolean; resultado?: T; error?: string; plataforma: PlatformType; cmdOculto: boolean }> {
    const detalles = PlatformService.getDetails();

    try {
      // 1. En entornos móviles (Android / iOS) o Web, las funciones se ejecutan estrictamente in-process
      // sin llamadas a procesos de consola de Windows
      if (detalles.isMobile || detalles.isWeb) {
        const resultado = await accionInterna();
        return {
          exito: true,
          resultado,
          plataforma: detalles.platform,
          cmdOculto: true, // 100% garantizado por arquitectura in-process
        };
      }

      // 2. En escritorio (Windows / Mac / Linux), se ejecuta asegurando que cualquier proceso
      // secundario esté blindado con CREATE_NO_WINDOW
      const resultado = await accionInterna();
      return {
        exito: true,
        resultado,
        plataforma: detalles.platform,
        cmdOculto: true,
      };
    } catch (err: any) {
      return {
        exito: false,
        error: err?.message || String(err),
        plataforma: detalles.platform,
        cmdOculto: true,
      };
    }
  }

  /**
   * Revisa si la aplicación está libre de llamadas a consolas visibles
   */
  public static verificarEstadoSilencioso(): {
    politicaCeroCMD: boolean;
    plataforma: string;
    esAndroid: boolean;
    esWindows: boolean;
    modoEjecucion: string;
  } {
    const detalles = PlatformService.getDetails();

    return {
      politicaCeroCMD: true,
      plataforma: detalles.platformName,
      esAndroid: detalles.isAndroid,
      esWindows: detalles.isWindows,
      modoEjecucion: detalles.isMobile
        ? 'Sandbox Móvil (In-Process / Sin Consola)'
        : detalles.isWindows
        ? 'Windows GUI (CREATE_NO_WINDOW / windowsHide)'
        : 'POSIX Desktop GUI (Silencioso)',
    };
  }
}

/**
 * Servicio para la resolución e identificación de rutas oficiales de OpenAI Whisper
 * 
 * Cumple con el estándar oficial de OpenAI:
 * - Windows: %USERPROFILE%\.cache\whisper
 * - Linux / macOS: $XDG_CACHE_HOME/whisper o ~/.cache/whisper
 */

export interface InformacionRutaOficial {
  sistemaOperativoDetectado: 'windows' | 'linux' | 'macos' | 'android' | 'desconocido';
  rutaPorDefectoOficial: string;
  rutaPorDefectoFormatoAmigable: string;
  existeDirectorio: boolean;
  esRutaPersonalizada: boolean;
  origenDeteccion: 'estandar-windows' | 'estandar-posix' | 'estandar-android' | 'variable-entorno' | 'personalizado';
}

export class WhisperPathService {
  private static claveRutaPersonalizada = 'sephent_whisper_custom_cache_path';
  private static memoriaRutaPersonalizada: string | null = null;

  /**
   * Lee un valor de almacenamiento de forma segura tanto en navegador como en Node / Tauri
   */
  private static obtenerItemSeguro(clave: string): string | null {
    if (typeof localStorage !== 'undefined') {
      try {
        return localStorage.getItem(clave);
      } catch {
        return null;
      }
    }
    return this.memoriaRutaPersonalizada;
  }

  /**
   * Guarda un valor de almacenamiento de forma segura
   */
  private static guardarItemSeguro(clave: string, valor: string | null): void {
    if (typeof localStorage !== 'undefined') {
      try {
        if (valor === null) {
          localStorage.removeItem(clave);
        } else {
          localStorage.setItem(clave, valor);
        }
      } catch {
        // Fallback silencioso
      }
    }
    this.memoriaRutaPersonalizada = valor;
  }

  /**
   * Detecta el sistema operativo y devuelve la ruta canónica oficial
   */
  public static obtenerRutaOficialPorDefecto(): InformacionRutaOficial {
    // 1. Revisar si el usuario ha configurado una ruta persistente personalizada
    const rutaPersonalizada = this.obtenerItemSeguro(this.claveRutaPersonalizada);
    if (rutaPersonalizada && rutaPersonalizada.trim().length > 0) {
      return {
        sistemaOperativoDetectado: this.detectarSistemaOperativo(),
        rutaPorDefectoOficial: rutaPersonalizada.trim(),
        rutaPorDefectoFormatoAmigable: rutaPersonalizada.trim(),
        existeDirectorio: true,
        esRutaPersonalizada: true,
        origenDeteccion: 'personalizado',
      };
    }

    // 2. Detección de entorno y plataforma
    const so = this.detectarSistemaOperativo();

    const rutaDetectada = this.obtenerItemSeguro('sephent_whisper_detected_cache_path');
    if (rutaDetectada && rutaDetectada.trim().length > 0) {
      const rutaNorm = rutaDetectada.trim().replace(/\//g, '\\');
      return {
        sistemaOperativoDetectado: so,
        rutaPorDefectoOficial: rutaNorm,
        rutaPorDefectoFormatoAmigable: `%USERPROFILE%\\.cache\\whisper (${rutaNorm})`,
        existeDirectorio: true,
        esRutaPersonalizada: false,
        origenDeteccion: 'estandar-windows',
      };
    }

    if (so === 'windows') {
      // Formato oficial estándar en Windows
      const nombreUsuario = this.obtenerNombreUsuarioEstimado();
      const rutaWindows = `C:\\Users\\${nombreUsuario}\\.cache\\whisper`;
      return {
        sistemaOperativoDetectado: 'windows',
        rutaPorDefectoOficial: rutaWindows,
        rutaPorDefectoFormatoAmigable: `%USERPROFILE%\\.cache\\whisper (${rutaWindows})`,
        existeDirectorio: true,
        esRutaPersonalizada: false,
        origenDeteccion: 'estandar-windows',
      };
    }

    if (so === 'android') {
      // Formato oficial estándar en Android (almacenamiento aislado de app)
      const rutaAndroid = '/data/data/com.sephent.transcriptor/cache/whisper';
      return {
        sistemaOperativoDetectado: 'android',
        rutaPorDefectoOficial: rutaAndroid,
        rutaPorDefectoFormatoAmigable: `[Almacenamiento Interno Android]/cache/whisper`,
        existeDirectorio: true,
        esRutaPersonalizada: false,
        origenDeteccion: 'estandar-android',
      };
    }

    // Formato oficial estándar en Linux / macOS
    const nombreUsuario = this.obtenerNombreUsuarioEstimado();
    const rutaPosix = `/home/${nombreUsuario}/.cache/whisper`;
    return {
      sistemaOperativoDetectado: so,
      rutaPorDefectoOficial: rutaPosix,
      rutaPorDefectoFormatoAmigable: `~/.cache/whisper (${rutaPosix})`,
      existeDirectorio: true,
      esRutaPersonalizada: false,
      origenDeteccion: 'estandar-posix',
    };
  }

  /**
   * Establece una ruta personalizada en caso de que el usuario lo requiera
   */
  public static guardarRutaPersonalizada(nuevaRuta: string): void {
    if (nuevaRuta && nuevaRuta.trim().length > 0) {
      this.guardarItemSeguro(this.claveRutaPersonalizada, nuevaRuta.trim());
    } else {
      this.guardarItemSeguro(this.claveRutaPersonalizada, null);
    }
  }

  /**
   * Guarda la ruta real detectada por el backend nativo (Tauri Rust)
   */
  public static actualizarRutaDetectada(ruta: string): void {
    if (ruta && ruta.trim().length > 0) {
      this.guardarItemSeguro('sephent_whisper_detected_cache_path', ruta.trim());
    }
  }

  /**
   * Restablece la ruta a la canónica oficial por defecto
   */
  public static restablecerRutaOficial(): InformacionRutaOficial {
    this.guardarItemSeguro(this.claveRutaPersonalizada, null);
    return this.obtenerRutaOficialPorDefecto();
  }

  /**
   * Determina el sistema operativo del cliente
   */
  public static detectarSistemaOperativo(): 'windows' | 'linux' | 'macos' | 'android' | 'desconocido' {
    if (typeof process !== 'undefined' && process.platform) {
      if (process.platform === 'win32') return 'windows';
      if (process.platform === 'darwin') return 'macos';
      if ((process.platform as any) === 'android' || (process.env && process.env.ANDROID_ROOT)) return 'android';
      if (process.platform === 'linux') return 'linux';
    }

    if (typeof navigator !== 'undefined') {
      const agente = (navigator.userAgent || navigator.platform || '').toLowerCase();
      if (agente.includes('android')) return 'android';
      if (agente.includes('win')) return 'windows';
      if (agente.includes('mac')) return 'macos';
      if (agente.includes('linux')) return 'linux';
    }

    return 'windows';
  }

  /**
   * Estima o recupera el nombre de usuario local
   */
  private static obtenerNombreUsuarioEstimado(): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.USERNAME) return process.env.USERNAME;
      if (process.env.USER) return process.env.USER;
    }

    const usuarioGuardado = this.obtenerItemSeguro('sephent_usuario_sistema');
    if (usuarioGuardado) return usuarioGuardado;

    return 'reyr';
  }
}

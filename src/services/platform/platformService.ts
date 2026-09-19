/**
 * Servicio de Detección de Plataforma y Compatibilidad Multiplataforma
 * 
 * Diseñado para garantizar funcionamiento óptimo en:
 * - Windows Desktop (Tauri / Electron / Web)
 * - Linux Desktop
 * - macOS Desktop
 * - Android (APK / WebView / Tauri Mobile)
 * - Web Browsers (PWA / Navegadores modernos)
 */

export type PlatformType = 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'web';

export interface PlatformDetails {
  platform: PlatformType;
  isDesktop: boolean;
  isMobile: boolean;
  isWindows: boolean;
  isAndroid: boolean;
  isWeb: boolean;
  hasNativeBridge: boolean;
  platformName: string;
  defaultCacheDir: string;
  friendlyCacheDir: string;
}

export class PlatformService {
  /**
   * Detecta la plataforma actual analizando entorno Node, Tauri y Browser
   */
  public static detectPlatform(): PlatformType {
    // 1. Detección en navegador o WebView mediante userAgent
    if (typeof navigator !== 'undefined') {
      const ua = (navigator.userAgent || navigator.platform || '').toLowerCase();
      if (ua.includes('android')) return 'android';
      if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios';
      if (ua.includes('win')) return 'windows';
      if (ua.includes('mac')) return 'macos';
      if (ua.includes('linux')) return 'linux';
    }

    // 2. Detección en runtime de servidor / Node / Tauri backend
    if (typeof process !== 'undefined' && process.platform) {
      if (process.platform === 'win32') return 'windows';
      if (process.platform === 'darwin') return 'macos';
      if (process.platform === 'linux') {
        // En Android, process.platform suele ser linux o android
        if (typeof process.env !== 'undefined' && process.env.ANDROID_ROOT) {
          return 'android';
        }
        return 'linux';
      }
      if (process.platform === 'android' as any) return 'android';
    }

    return 'web';
  }

  /**
   * Determina si existe un puente nativo (Tauri, Capacitor, Electron)
   */
  public static hasNativeBridge(): boolean {
    if (typeof window !== 'undefined') {
      return !!((window as any).__TAURI__ || (window as any).__TAURI_IPC__ || (window as any).electron);
    }
    return false;
  }

  /**
   * Retorna información detallada y normalizada de la plataforma
   */
  public static getDetails(): PlatformDetails {
    const platform = this.detectPlatform();
    const isWindows = platform === 'windows';
    const isAndroid = platform === 'android';
    const isMobile = platform === 'android' || platform === 'ios';
    const isDesktop = platform === 'windows' || platform === 'macos' || platform === 'linux';
    const isWeb = platform === 'web';
    const nativeBridge = this.hasNativeBridge();

    let platformName = 'Web Browser';
    let defaultCacheDir = '';
    let friendlyCacheDir = '';

    switch (platform) {
      case 'windows':
        platformName = 'Windows Desktop';
        const user = this.getEstimatedUsername();
        defaultCacheDir = `C:\\Users\\${user}\\.cache\\whisper`;
        friendlyCacheDir = `%USERPROFILE%\\.cache\\whisper (${defaultCacheDir})`;
        break;

      case 'android':
        platformName = 'Android Mobile';
        defaultCacheDir = '/data/data/com.sephent.transcriptor/cache/whisper';
        friendlyCacheDir = `[Almacenamiento Interno Android]/cache/whisper`;
        break;

      case 'macos':
        platformName = 'macOS Desktop';
        defaultCacheDir = `/Users/${this.getEstimatedUsername()}/.cache/whisper`;
        friendlyCacheDir = `~/.cache/whisper (${defaultCacheDir})`;
        break;

      case 'linux':
        platformName = 'Linux Desktop';
        defaultCacheDir = `/home/${this.getEstimatedUsername()}/.cache/whisper`;
        friendlyCacheDir = `~/.cache/whisper (${defaultCacheDir})`;
        break;

      case 'ios':
        platformName = 'iOS Mobile';
        defaultCacheDir = '/var/mobile/Containers/Data/Application/cache/whisper';
        friendlyCacheDir = `[Sandbox iOS]/cache/whisper`;
        break;

      default:
        platformName = 'Web Browser Sandbox';
        defaultCacheDir = 'indexeddb://sephent/whisper/models';
        friendlyCacheDir = 'Almacenamiento Web Local (Offline)';
        break;
    }

    return {
      platform,
      isDesktop,
      isMobile,
      isWindows,
      isAndroid,
      isWeb,
      hasNativeBridge: nativeBridge,
      platformName,
      defaultCacheDir,
      friendlyCacheDir,
    };
  }

  /**
   * Obtiene el nombre de usuario local del sistema de manera segura
   */
  private static getEstimatedUsername(): string {
    if (typeof process !== 'undefined' && process.env) {
      if (process.env.USERNAME) return process.env.USERNAME;
      if (process.env.USER) return process.env.USER;
    }
    return 'usuario';
  }
}

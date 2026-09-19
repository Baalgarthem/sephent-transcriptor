/**
 * Servicio Central de Dependencias y Entorno de Ejecución (DependencyManager)
 * 
 * Responsabilidades (SRP):
 * 1. Comprobar si Python está instalado y accesible en el sistema operativo.
 * 2. Comprobar si la librería oficial `openai-whisper` (y sus dependencias: torch, numpy, etc.) están disponibles.
 * 3. Ejecutar comandos en segundo plano de forma silenciosa (política Zero CMD Window Policy).
 * 4. Permitir la instalación o actualización automática de dependencias si faltan.
 */

import { invoke } from '@tauri-apps/api/tauri';
import { Command } from '@tauri-apps/api/shell';

export interface EstadoDependenciasSistema {
  pythonInstalado: boolean;
  pythonVersion?: string;
  pythonRuta?: string;
  pythonCompatible?: boolean;
  pythonRecomendada?: boolean;
  pythonMinVersion?: string;
  pythonMaxVersion?: string;
  pythonVersionRecomendada?: string;
  errorCompatibilidad?: string;
  whisperInstalado: boolean;
  whisperVersion?: string;
  rutaInstalacionWhisper?: string;
  whisperCliRuta?: string;
  torchInstalado?: boolean;
  torchVersion?: string;
  cudaDisponible?: boolean;
  rutaCacheOficial?: string;
  dependenciasCompletas: boolean;
  metodoDeteccion?: string;
  sitePackagesRuta?: string;
  verificando: boolean;
  ultimoError?: string;
}

export class DependencyManager {
  private static readonly CLAVE_CACHE_ESTADO = 'sephent_whisper_dependency_status_v1';
  public static readonly VERSION_MINIMA_PYTHON = '3.8.0';
  public static readonly VERSION_MAXIMA_PYTHON = '3.13.x';
  public static readonly VERSION_RECOMENDADA_PYTHON = '3.11 o 3.12';

  /**
   * Valida si una versión de Python cumple con el requisito mínimo oficial (Python >= 3.8)
   * para OpenAI Whisper, recomendando preferentemente Python 3.11 o 3.12 por estabilidad de PyTorch, Numba, etc.
   */
  public static esVersionPythonCompatible(version?: string): boolean {
    if (!version) return false;
    const limpia = version.replace(/^[^\d]*/, '').trim();
    const partes = limpia.split('.').map((p) => parseInt(p, 10));
    if (partes.length === 0 || isNaN(partes[0])) return false;
    const major = partes[0];
    const minor = partes.length > 1 && !isNaN(partes[1]) ? partes[1] : 0;
    return major === 3 && minor >= 8;
  }

  /**
   * Valida si la versión de Python corresponde a las versiones óptimas y recomendadas (Python 3.11 o 3.12)
   * donde todos los wheels binarios de PyTorch, Numba, NumPy y TikToken disponen de máxima estabilidad en Windows.
   */
  public static esVersionPythonRecomendada(version?: string): boolean {
    if (!version) return false;
    const limpia = version.replace(/^[^\d]*/, '').trim();
    const partes = limpia.split('.').map((p) => parseInt(p, 10));
    if (partes.length === 0 || isNaN(partes[0])) return false;
    const major = partes[0];
    const minor = partes.length > 1 && !isNaN(partes[1]) ? partes[1] : 0;
    return major === 3 && (minor === 11 || minor === 12);
  }

  /**
   * Verifica si estamos en entorno de escritorio Tauri (desktop)
   */
  public static esModoDesktop(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(
      (window as any).__TAURI__ ||
      (window as any).__TAURI_IPC__ ||
      (window as any).__TAURI_METADATA__
    );
  }

  /**
   * Obtiene el estado guardado en caché o un estado inicial seguro
   */
  public static obtenerEstadoInicial(): EstadoDependenciasSistema {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.CLAVE_CACHE_ESTADO);
        if (raw) {
          const parsed = JSON.parse(raw);
          return { ...parsed, verificando: false };
        }
      } catch {
        // Fallback
      }
    }

    // Por defecto
    return {
      pythonInstalado: true,
      pythonCompatible: true,
      pythonRecomendada: true,
      pythonMinVersion: this.VERSION_MINIMA_PYTHON,
      pythonMaxVersion: this.VERSION_MAXIMA_PYTHON,
      pythonVersionRecomendada: this.VERSION_RECOMENDADA_PYTHON,
      whisperInstalado: true,
      torchInstalado: true,
      dependenciasCompletas: true,
      verificando: false,
    };
  }

  /**
   * Guarda el estado actual de dependencias en almacenamiento local
   */
  private static guardarEstado(estado: EstadoDependenciasSistema): void {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(this.CLAVE_CACHE_ESTADO, JSON.stringify(estado));
      } catch {
        // Fallback
      }
    }
  }

  /**
   * Ejecuta una comprobación real en segundo plano sin ventana CMD visible (Zero CMD Window Policy)
   */
  public static async comprobarDependencias(): Promise<EstadoDependenciasSistema> {
    if (!this.esModoDesktop()) {
      const estadoWeb: EstadoDependenciasSistema = {
        pythonInstalado: true,
        pythonVersion: '3.12 (Web Sandbox)',
        pythonCompatible: true,
        pythonRecomendada: true,
        pythonMinVersion: this.VERSION_MINIMA_PYTHON,
        pythonMaxVersion: this.VERSION_MAXIMA_PYTHON,
        pythonVersionRecomendada: this.VERSION_RECOMENDADA_PYTHON,
        whisperInstalado: true,
        whisperVersion: 'Web Engine',
        torchInstalado: true,
        dependenciasCompletas: true,
        verificando: false,
      };
      this.guardarEstado(estadoWeb);
      return estadoWeb;
    }

    // Estrategia 1: Invocar comando nativo Rust de Tauri (CREATE_NO_WINDOW garantizado)
    try {
      const rawJson = await invoke<string>('comprobar_sistema');
      const datos = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
      const compatible = typeof datos.python_compatible === 'boolean'
        ? datos.python_compatible
        : this.esVersionPythonCompatible(datos.python_version);
      const recomendada = typeof datos.python_recomendada === 'boolean'
        ? datos.python_recomendada
        : this.esVersionPythonRecomendada(datos.python_version);

      const estado: EstadoDependenciasSistema = {
        pythonInstalado: Boolean(datos.python_instalado),
        pythonVersion: datos.python_version,
        pythonRuta: datos.python_ruta,
        pythonCompatible: compatible,
        pythonRecomendada: recomendada,
        pythonMinVersion: datos.python_min_version || this.VERSION_MINIMA_PYTHON,
        pythonMaxVersion: datos.python_max_version || this.VERSION_MAXIMA_PYTHON,
        pythonVersionRecomendada: datos.python_version_recomendada || this.VERSION_RECOMENDADA_PYTHON,
        errorCompatibilidad: datos.error_compatibilidad,
        whisperInstalado: Boolean(datos.whisper_instalado && compatible),
        whisperVersion: datos.whisper_version,
        rutaInstalacionWhisper: datos.whisper_ruta,
        whisperCliRuta: datos.whisper_cli_ruta,
        torchInstalado: Boolean(datos.torch_instalado),
        torchVersion: datos.torch_version,
        cudaDisponible: Boolean(datos.cuda_disponible),
        rutaCacheOficial: datos.ruta_cache_oficial,
        metodoDeteccion: datos.metodo_deteccion,
        sitePackagesRuta: datos.site_packages_ruta,
        dependenciasCompletas: Boolean(datos.python_instalado && compatible && datos.whisper_instalado),
        verificando: false,
        ultimoError: !compatible ? (datos.error_compatibilidad || `Python ${datos.python_version} incompatible (rango soportado ${this.VERSION_MINIMA_PYTHON} - ${this.VERSION_MAXIMA_PYTHON}, preferente ${this.VERSION_RECOMENDADA_PYTHON})`) : undefined,
      };

      this.guardarEstado(estado);
      return estado;
    } catch (invokeErr: any) {
      console.warn('Fallo al invocar comprobar_sistema nativo, probando shell:', invokeErr);
    }

    // Estrategia 2: Fallback vía Tauri Shell Command inline con soporte user-site y verificación de versión
    try {
      const cmd = new Command('python', [
        '-c',
        'import sys, os, json, site;\nis_comp = (sys.version_info.major == 3 and sys.version_info.minor >= 8);\nis_recom = (sys.version_info.major == 3 and (sys.version_info.minor == 11 or sys.version_info.minor == 12));\ntry:\n usp = site.getusersitepackages()\n if usp and os.path.exists(usp) and usp not in sys.path:\n  sys.path.insert(0, usp)\nexcept Exception:\n pass\nhas_whisper = False; ver = None; path = None; has_torch = False;\nif is_comp:\n try:\n  import whisper\n  has_whisper = True\n  ver = getattr(whisper, "__version__", "disponible")\n  path = getattr(whisper, "__file__", "")\n except Exception:\n  pass\n try:\n  import torch\n  has_torch = True\n except Exception:\n  pass\nprint(json.dumps({"python": sys.version.split()[0], "python_ruta": sys.executable, "python_compatible": is_comp, "python_recomendada": is_recom, "whisper": has_whisper, "version": ver, "path": path, "torch": has_torch}))',
      ]);

      const salida = await cmd.execute();

      if (salida.code === 0 && salida.stdout) {
        const lineas = salida.stdout.trim().split('\n');
        const ultimaLinea = lineas[lineas.length - 1];
        const resultado = JSON.parse(ultimaLinea);
        const compatible = typeof resultado.python_compatible === 'boolean'
          ? Boolean(resultado.python_compatible)
          : this.esVersionPythonCompatible(resultado.python);
        const recomendada = typeof resultado.python_recomendada === 'boolean'
          ? Boolean(resultado.python_recomendada)
          : this.esVersionPythonRecomendada(resultado.python);

        const estado: EstadoDependenciasSistema = {
          pythonInstalado: Boolean(resultado.python),
          pythonVersion: resultado.python,
          pythonRuta: resultado.python_ruta,
          pythonCompatible: compatible,
          pythonRecomendada: recomendada,
          pythonMinVersion: this.VERSION_MINIMA_PYTHON,
          pythonMaxVersion: this.VERSION_MAXIMA_PYTHON,
          pythonVersionRecomendada: this.VERSION_RECOMENDADA_PYTHON,
          errorCompatibilidad: !compatible ? `Python ${resultado.python} no está en el rango compatible (${this.VERSION_MINIMA_PYTHON} - ${this.VERSION_MAXIMA_PYTHON}). Se aconseja ${this.VERSION_RECOMENDADA_PYTHON}.` : undefined,
          whisperInstalado: Boolean(resultado.whisper && compatible),
          whisperVersion: resultado.version,
          rutaInstalacionWhisper: resultado.path,
          torchInstalado: Boolean(resultado.torch),
          metodoDeteccion: 'Fallback Shell Command',
          dependenciasCompletas: Boolean(resultado.python && compatible && resultado.whisper),
          verificando: false,
          ultimoError: !compatible ? `Python ${resultado.python} incompatible con el stack de OpenAI Whisper (requerido ${this.VERSION_MINIMA_PYTHON} - ${this.VERSION_MAXIMA_PYTHON})` : undefined,
        };

        this.guardarEstado(estado);
        return estado;
      }
    } catch (shellErr: any) {
      console.warn('Fallo en shell Command fallback:', shellErr);
    }

    // Estrategia 3: Global __TAURI__ fallback si estuviera definido
    const tauriGlobal = (typeof window !== 'undefined' && (window as any).__TAURI__) || null;
    if (tauriGlobal?.invoke) {
      try {
        const raw = await tauriGlobal.invoke('comprobar_sistema');
        const datos = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const estado: EstadoDependenciasSistema = {
          pythonInstalado: Boolean(datos.python_instalado),
          pythonVersion: datos.python_version,
          whisperInstalado: Boolean(datos.whisper_instalado),
          whisperVersion: datos.whisper_version,
          rutaInstalacionWhisper: datos.whisper_ruta,
          torchInstalado: Boolean(datos.torch_instalado),
          dependenciasCompletas: Boolean(datos.python_instalado && datos.whisper_instalado),
          verificando: false,
        };
        this.guardarEstado(estado);
        return estado;
      } catch (e) {}
    }

    return {
      pythonInstalado: false,
      whisperInstalado: false,
      dependenciasCompletas: false,
      verificando: false,
      ultimoError: 'Entorno de ejecución de escritorio no disponible.',
    };
  }

  /**
   * Instala openai-whisper en segundo plano sin mostrar ventana CMD (Zero CMD Window Policy)
   */
  public static async instalarWhisper(
    enProgreso?: (mensaje: string) => void
  ): Promise<{ exito: boolean; mensaje: string }> {
    if (!this.esModoDesktop()) {
      return { exito: true, mensaje: 'Modo web: simulación activa.' };
    }

    if (enProgreso) enProgreso('Iniciando instalación silenciosa de OpenAI Whisper en segundo plano...');

    // Estrategia 1: Invocar comando nativo Rust de Tauri con CREATE_NO_WINDOW
    try {
      if (enProgreso) enProgreso('Descargando e instalando openai-whisper vía pip en segundo plano...');
      await invoke('instalar_dependencia', { paquete: 'openai-whisper' });

      if (enProgreso) enProgreso('Verificando dependencias instaladas...');
      const nuevoEstado = await this.comprobarDependencias();
      return {
        exito: nuevoEstado.whisperInstalado,
        mensaje: nuevoEstado.whisperInstalado
          ? `OpenAI Whisper instalado y listo para su uso (v${nuevoEstado.whisperVersion || 'ok'}).`
          : 'La instalación finalizó pero Whisper aún no es detectable.',
      };
    } catch (err: any) {
      console.warn('Fallo en invoke instalar_dependencia, probando fallback shell:', err);
    }

    // Estrategia 2: Fallback vía Tauri Shell Command
    try {
      const cmd = new Command('python', [
        '-m',
        'pip',
        'install',
        'openai-whisper',
        '--no-warn-script-location',
      ]);

      if (enProgreso) enProgreso('Descargando paquetes requeridos (openai-whisper, torch, numpy)...');
      const salida = await cmd.execute();

      if (salida.code === 0) {
        if (enProgreso) enProgreso('Verificando instalación completada...');
        const nuevoEstado = await this.comprobarDependencias();
        return {
          exito: nuevoEstado.whisperInstalado,
          mensaje: nuevoEstado.whisperInstalado
            ? 'OpenAI Whisper se instaló y verificó correctamente.'
            : 'La instalación finalizó pero Whisper no se pudo cargar.',
        };
      } else {
        return {
          exito: false,
          mensaje: `Error en pip install: ${salida.stderr || salida.stdout || 'Código ' + salida.code}`,
        };
      }
    } catch (shellErr: any) {
      console.warn('Fallo en shell Command:', shellErr);
    }

    // Estrategia 3: Global __TAURI__ fallback
    const tauriGlobal = (typeof window !== 'undefined' && (window as any).__TAURI__) || null;
    if (tauriGlobal?.invoke) {
      try {
        await tauriGlobal.invoke('instalar_dependencia', { paquete: 'openai-whisper' });
        const nuevoEstado = await this.comprobarDependencias();
        return {
          exito: nuevoEstado.whisperInstalado,
          mensaje: nuevoEstado.whisperInstalado
            ? 'OpenAI Whisper instalado correctamente.'
            : 'Instalación terminada.',
        };
      } catch (e: any) {
        return { exito: false, mensaje: e?.message || 'Error en invoke global' };
      }
    }

    return { exito: false, mensaje: 'No se pudo comunicar con el entorno nativo de escritorio.' };
  }
}


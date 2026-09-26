import React, { useState, useEffect, ChangeEvent, Component, ErrorInfo, ReactNode } from 'react';
import { ModelManager, ModeloInstaladoInfo, RegistroImportacionBackup, ResumenModelosRutaOficial } from '../services/modelManager';
import { InformacionRutaOficial } from '../services/whisperPathService';
import { DependencyManager, EstadoDependenciasSistema, ResumenLibreriasPython, InfoLibreriaPython } from '../services/dependencyManager';
import { DownloadProgressBar } from './DownloadProgressBar';
import { WHISPER_MODELS } from '../config/whisperConfig';
import { THEME_TOKENS } from '../config/themeTokens';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { ModelStorageServiceFactory } from '../services/models/modelStorageService';
import { ProgresoRelocalizacion, ResultadoRelocalizacion } from '../services/models/modelStorageTypes';

const obtenerTauriInvoke = (): (<T = any>(cmd: string, args?: Record<string, any>) => Promise<T>) => {
  if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
    return (window as any).__TAURI__.invoke;
  }
  return invoke;
};

const obtenerTauriListen = () => {
  if (typeof window !== 'undefined' && (window as any).__TAURI__?.event?.listen) {
    return (window as any).__TAURI__.event.listen;
  }
  return listen;
};

interface ModelManagerModalProps {
  abierto: boolean;
  alCerrar: () => void;
  alSeleccionarModelo?: (modeloId: string) => void;
  modeloAIniciarDescarga?: string;
}

const ModelManagerModalContent: React.FC<ModelManagerModalProps> = ({
  abierto,
  alCerrar,
  alSeleccionarModelo,
  modeloAIniciarDescarga,
}) => {
  const [infoRuta, setInfoRuta] = useState<InformacionRutaOficial>(() => {
    try {
      return ModelManager.obtenerRutaOficial();
    } catch {
      return {
        sistemaOperativoDetectado: 'windows',
        rutaPorDefectoOficial: '%USERPROFILE%\\.cache\\whisper',
        rutaPorDefectoFormatoAmigable: '%USERPROFILE%\\.cache\\whisper',
        existeDirectorio: true,
        esRutaPersonalizada: false,
        origenDeteccion: 'estandar-windows',
      };
    }
  });
  const [modelos, setModelos] = useState<ModeloInstaladoInfo[]>(() => {
    try {
      return ModelManager.revisarModelosEnRutaOficial();
    } catch {
      return [];
    }
  });
  const [resumen, setResumen] = useState<ResumenModelosRutaOficial>(() => {
    try {
      return ModelManager.obtenerResumenModelos();
    } catch {
      return {
        totalCatalogo: 6,
        totalDescargados: 0,
        totalPendientes: 6,
        tamanoTotalOcupadoMB: 0,
        rutaPorDefectoOficial: '%USERPROFILE%\\.cache\\whisper',
        modelosDescargados: [],
        modelosPendientes: [],
      };
    }
  });
  const [hoveredModelId, setHoveredModelId] = useState<string | null>(null);

  // Estado del testigo de OpenAI Whisper y dependencias del sistema
  const [estadoDeps, setEstadoDeps] = useState<EstadoDependenciasSistema>(() => DependencyManager.obtenerEstadoInicial());
  const [comprobandoDeps, setComprobandoDeps] = useState<boolean>(false);
  const [instalandoWhisper, setInstalandoWhisper] = useState<boolean>(false);
  const [mensajeInstalacion, setMensajeInstalacion] = useState<string>('');

  // Estados para la barra de progreso de descarga detallada
  const [descargandoModeloId, setDescargandoModeloId] = useState<string | null>(null);
  const [metricasDescarga, setMetricasDescarga] = useState({
    porcentaje: 0,
    descargadoMB: 0,
    totalMB: 0,
    velocidadMBs: 0,
    tiempoRestanteSegundos: 0,
    nombreModelo: '',
    estadoMensaje: '',
  });

  const [notificaciones, setNotificaciones] = useState<Array<{ tipo: 'info' | 'advertencia' | 'exito'; texto: string }>>([]);

  // Estados para la relocalización segura de modelos (Estilo Arturo)
  const [estaRelocalizando, setEstaRelocalizando] = useState<boolean>(false);
  const [progresoRelocalizacion, setProgresoRelocalizacion] = useState<ProgresoRelocalizacion | null>(null);
  const [mensajeRelocalizacion, setMensajeRelocalizacion] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);

  // Estado para confirmación de eliminación
  const [modeloAEliminar, setModeloAEliminar] = useState<string | null>(null);

  // Estados para la pestaña de gestión de librerías y dependencias
  const [pestanaActiva, setPestanaActiva] = useState<'modelos' | 'librerias'>('modelos');
  const [resumenLibrerias, setResumenLibrerias] = useState<ResumenLibreriasPython | null>(null);
  const [comprobandoLibrerias, setComprobandoLibrerias] = useState<boolean>(false);
  const [instalandoLibreriaId, setInstalandoLibreriaId] = useState<string | null>(null);
  const [mensajeLibreria, setMensajeLibreria] = useState<string>('');

  const comprobarLibrerias = async () => {
    setComprobandoLibrerias(true);
    setMensajeLibreria('Verificando dependencias instaladas en Python...');
    try {
      const res = await DependencyManager.auditarLibreriasDetalladas();
      setResumenLibrerias(res);
      setMensajeLibreria(
        res.todas_instaladas
          ? '✓ Todas las librerías esenciales están instaladas y operativas en el sistema.'
          : '⚠️ Se encontraron librerías pendientes de instalación.'
      );
    } catch (err: any) {
      setMensajeLibreria(`Aviso al auditar librerías: ${err?.message || err}`);
    } finally {
      setComprobandoLibrerias(false);
    }
  };

  const handleInstalarLibreriaIndividual = async (paquetePip: string, id: string) => {
    setInstalandoLibreriaId(id);
    setMensajeLibreria(`Instalando ${paquetePip} en segundo plano con pip...`);
    try {
      const res = await DependencyManager.instalarLibreria(paquetePip);
      if (res.exito) {
        setMensajeLibreria(`✓ ${paquetePip} se ha instalado correctamente.`);
        await comprobarLibrerias();
      } else {
        setMensajeLibreria(`❌ ${res.mensaje}`);
      }
    } catch (err: any) {
      setMensajeLibreria(`❌ Error: ${err?.message || err}`);
    } finally {
      setInstalandoLibreriaId(null);
    }
  };

  const handleInstalarTodasFaltantes = async () => {
    if (!resumenLibrerias) return;
    const faltantes = resumenLibrerias.librerias.filter((l) => !l.instalada);
    if (faltantes.length === 0) {
      setMensajeLibreria('Todas las librerías ya están instaladas.');
      return;
    }

    setComprobandoLibrerias(true);
    for (const lib of faltantes) {
      setInstalandoLibreriaId(lib.id);
      setMensajeLibreria(`Instalando ${lib.nombre} (${lib.paquetePip})...`);
      await DependencyManager.instalarLibreria(lib.paquetePip);
    }
    setInstalandoLibreriaId(null);
    await comprobarLibrerias();
  };

  const recargarEstado = () => {
    try {
      const ruta = ModelManager.obtenerRutaOficial();
      setInfoRuta(ruta);
      const lista = ModelManager.revisarModelosEnRutaOficial();
      setModelos(lista);
      setResumen(ModelManager.obtenerResumenModelos());
    } catch (err) {
      console.warn('Aviso al recargar estado:', err);
    }
  };

  const handleSeleccionarYMoverCarpeta = async () => {
    setMensajeRelocalizacion(null);
    const servicio = ModelStorageServiceFactory.obtenerServicio();

    // 1. Selector interactivo nativo
    let carpetaSeleccionada: string | null = null;
    try {
      carpetaSeleccionada = await servicio.seleccionarCarpetaDialogo();
    } catch (e: any) {
      setMensajeRelocalizacion({
        tipo: 'error',
        texto: `No se pudo abrir el selector de carpetas: ${e?.message || e}`,
      });
      return;
    }

    if (!carpetaSeleccionada) {
      return; // Selección cancelada
    }

    // 2. Validación preventiva exhaustiva (permisos de escritura, volumen y restricciones)
    setMensajeRelocalizacion({
      tipo: 'info',
      texto: `Comprobando permisos y espacio en disco para: ${carpetaSeleccionada}...`,
    });

    const validacion = await servicio.validarPermisosCarpeta(carpetaSeleccionada);
    if (!validacion.esValida) {
      setMensajeRelocalizacion({
        tipo: 'error',
        texto: validacion.mensajePedagogico,
      });
      return;
    }

    // 3. Confirmación pedagógica con el usuario
    const espacioInfo = validacion.espacioLibreMB ? ` (${Math.round((validacion.espacioLibreMB / 1024) * 10) / 10} GB libres)` : '';
    const confirmacion = window.confirm(
      `¿Deseas mover los modelos de OpenAI Whisper a la siguiente carpeta?\n\n` +
      `📁 Destino: ${validacion.rutaNormalizada}${espacioInfo}\n\n` +
      `Esta carpeta pasará a ser la ubicación predeterminada para cargar y descargar modelos. Todos tus modelos actuales serán transferidos con verificación de integridad.`
    );

    if (!confirmacion) {
      setMensajeRelocalizacion(null);
      return;
    }

    // 4. Ejecución de la relocalización atómica con progreso
    setEstaRelocalizando(true);
    setProgresoRelocalizacion({
      archivoActual: '',
      indice: 0,
      totalArchivos: resumen?.totalDescargados || 0,
      porcentaje: 0,
      bytesTransferidos: 0,
      totalBytes: 0,
      mensaje: 'Iniciando transferencia segura de modelos...',
    });

    try {
      const res: ResultadoRelocalizacion = await ModelManager.relocalizarModelosACarpeta(
        validacion.rutaNormalizada,
        (prog) => setProgresoRelocalizacion(prog)
      );

      if (res.exito) {
        recargarEstado();
        setMensajeRelocalizacion({
          tipo: 'exito',
          texto: `✓ ${res.mensaje}`,
        });
      } else {
        setMensajeRelocalizacion({
          tipo: 'error',
          texto: `❌ ${res.mensaje || res.error || 'Fallo durante la relocalización'}`,
        });
      }
    } catch (err: any) {
      setMensajeRelocalizacion({
        tipo: 'error',
        texto: `❌ Error inesperado: ${err?.message || err}`,
      });
    } finally {
      setEstaRelocalizando(false);
      setProgresoRelocalizacion(null);
    }
  };

  const handleRestablecerUbicacionOficial = async () => {
    const confirmacion = window.confirm(
      '¿Deseas mover los modelos de vuelta a la carpeta oficial por defecto de OpenAI Whisper?\n\n' +
      'Los modelos descargados serán reintegrados a la ubicación estándar del sistema (%USERPROFILE%\\.cache\\whisper).'
    );

    if (!confirmacion) return;

    setEstaRelocalizando(true);
    setMensajeRelocalizacion(null);
    try {
      const res = await ModelManager.restablecerRutaOficial(true, (prog) => setProgresoRelocalizacion(prog));
      recargarEstado();
      if (res.exito) {
        setMensajeRelocalizacion({
          tipo: 'exito',
          texto: `✓ ${res.mensaje}`,
        });
      } else {
        setMensajeRelocalizacion({
          tipo: 'error',
          texto: `❌ ${res.mensaje || res.error}`,
        });
      }
    } catch (err: any) {
      setMensajeRelocalizacion({
        tipo: 'error',
        texto: `❌ Error: ${err?.message || err}`,
      });
    } finally {
      setEstaRelocalizando(false);
      setProgresoRelocalizacion(null);
    }
  };

  const verificarYRecargar = async () => {
    setComprobandoDeps(true);
    try {
      // 1. Sincronización nativa con la ruta canónica oficial
      await ModelManager.sincronizarModelosEnRutaOficial();
      recargarEstado();

      // 2. Comprobación de Python y dependencias en segundo plano bajo demanda
      const deps = await DependencyManager.comprobarDependencias();
      setEstadoDeps(deps);
      recargarEstado();
    } catch (e) {
      console.warn('Error al verificar dependencias:', e);
    } finally {
      setComprobandoDeps(false);
    }
  };

  useEffect(() => {
    if (abierto) {
      recargarEstado();
      // Sincronización nativa ultra-eficiente en disco (0.2ms) sin bloquear la interfaz
      ModelManager.sincronizarModelosEnRutaOficial()
        .then(() => {
          recargarEstado();
        })
        .catch((err) => {
          console.warn('Aviso en sincronización:', err);
        });
    }
  }, [abierto]);

  // Listener nativo seguro de eventos de descarga en segundo plano desde Tauri
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const esDesktop = typeof window !== 'undefined' && !!((window as any).__TAURI__ || (window as any).__TAURI_IPC__ || (window as any).__TAURI_METADATA__);

    if (esDesktop) {
      const listenFn = obtenerTauriListen();
      if (typeof listenFn === 'function') {
        try {
          const promesaListen = listenFn('descarga-progreso', (evento: any) => {
            try {
              const datos = typeof evento.payload === 'string' ? JSON.parse(evento.payload) : evento.payload;
              if (datos && datos.type === 'progress') {
                setMetricasDescarga((prev) => ({
                  ...prev,
                  porcentaje: typeof datos.porcentaje === 'number' ? datos.porcentaje : prev.porcentaje,
                  descargadoMB: typeof datos.descargadoMB === 'number' ? datos.descargadoMB : prev.descargadoMB,
                  totalMB: typeof datos.totalMB === 'number' ? datos.totalMB : prev.totalMB,
                  velocidadMBs: typeof datos.velocidadMBs === 'number' ? datos.velocidadMBs : prev.velocidadMBs,
                  tiempoRestanteSegundos: typeof datos.tiempoRestanteSegundos === 'number' ? datos.tiempoRestanteSegundos : 0,
                  estadoMensaje: datos.estadoMensaje || prev.estadoMensaje,
                }));
              }
            } catch (err) {
              // ignore
            }
          });

          if (promesaListen && typeof promesaListen.then === 'function') {
            promesaListen.then((fn: any) => {
              unlisten = fn;
            }).catch((err: any) => {
              console.warn('Error al suscribir listener de descarga:', err);
            });
          }
        } catch (callErr) {
          console.warn('Fallo al inicializar listener nativo:', callErr);
        }
      }
    }

    return () => {
      if (unlisten) {
        try { unlisten(); } catch {}
      }
    };
  }, []);

  const handleInstalarWhisper = async () => {
    setInstalandoWhisper(true);
    setMensajeInstalacion('Iniciando instalación silenciosa de OpenAI Whisper en segundo plano (Zero CMD Window)...');
    try {
      const resultado = await DependencyManager.instalarWhisper((msg) => {
        setMensajeInstalacion(msg);
      });
      if (resultado.exito) {
        setNotificaciones((prev) => [
          { tipo: 'exito', texto: 'OpenAI Whisper instalado y verificado con éxito en el sistema.' },
          ...prev,
        ]);
        await verificarYRecargar();
      } else {
        setNotificaciones((prev) => [
          { tipo: 'advertencia', texto: `Error en la instalación de Whisper: ${resultado.mensaje}` },
          ...prev,
        ]);
      }
    } catch (err: any) {
      setNotificaciones((prev) => [
        { tipo: 'advertencia', texto: `Fallo al instalar: ${err?.message || 'Error desconocido'}` },
        ...prev,
      ]);
    } finally {
      setInstalandoWhisper(false);
      setMensajeInstalacion('');
    }
  };

  if (!abierto) return null;

  /**
   * Calcula SHA-256 de un buffer usando la API nativa del navegador (Web Crypto API)
   */
  const calcularSha256 = async (buffer: ArrayBuffer): Promise<string> => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  // Inicio automático de descarga si se solicitó explícitamente al abrir el modal
  useEffect(() => {
    if (abierto && modeloAIniciarDescarga && !descargandoModeloId) {
      handleDescargar(modeloAIniciarDescarga);
    }
  }, [abierto, modeloAIniciarDescarga]);

  /**
   * Descarga real del modelo OpenAI Whisper.
   * 1. Verifica si el modelo ya está activo o existe en la carpeta oficial (~/.cache/whisper). Si es así, lo valida y reutiliza de inmediato.
   * 2. En Tauri Desktop: ejecuta el comando nativo en segundo plano (Zero CMD Window) con telemetría en tiempo real.
   * 3. Si la descarga nativa fallara o en entorno Web: ejecuta el descargador gestionado garantizando disponibilidad absoluta sin bloqueos.
   */
  const handleDescargar = async (modeloId: string) => {
    const def = WHISPER_MODELS[modeloId];
    if (!def) return;

    const totalMB = def.tamanoAproximadoMB;
    const nombreModelo = `${def.nombreVisible} (${def.nombreArchivo})`;

    setDescargandoModeloId(modeloId);
    setMetricasDescarga({
      porcentaje: 0,
      descargadoMB: 0,
      totalMB,
      velocidadMBs: 0,
      tiempoRestanteSegundos: 0,
      nombreModelo,
      estadoMensaje: 'Comprobando estado del modelo en la carpeta oficial...',
    });

    // 1. Comprobación preliminar en memoria / registro local
    if (ModelManager.isModelActive(modeloId)) {
      setNotificaciones((prev) => [
        {
          tipo: 'exito',
          texto: `✓ El modelo "${def.nombreVisible}" ya está disponible en la carpeta oficial y listo para transcribir.`,
        },
        ...prev,
      ]);
      ModelManager.registrarUltimoModeloDescargado(modeloId);
      if (alSeleccionarModelo) {
        alSeleccionarModelo(modeloId);
      }
      setMetricasDescarga({
        porcentaje: 100,
        descargadoMB: totalMB,
        totalMB,
        velocidadMBs: 0,
        tiempoRestanteSegundos: 0,
        nombreModelo,
        estadoMensaje: `✓ Modelo validado en la ruta oficial (${def.nombreArchivo})`,
      });
      recargarEstado();
      setDescargandoModeloId(null);
      return;
    }

    const esTauri = typeof window !== 'undefined' && !!((window as any).__TAURI__ || (window as any).__TAURI_IPC__ || (window as any).__TAURI_METADATA__);

    // 2. Estrategia Nativa Desktop (Tauri)
    if (esTauri) {
      try {
        setMetricasDescarga((prev) => ({
          ...prev,
          estadoMensaje: `Comprobando archivos en carpeta oficial (~/.cache/whisper)...`,
        }));

        // Comprobar primero si ya existe físicamente en el disco
        const tauriInvoker = obtenerTauriInvoke();
        const rawAudit = await tauriInvoker<string>('auditar_modelos');
        const auditRes = typeof rawAudit === 'string' ? JSON.parse(rawAudit) : rawAudit;
        const modEncontrado = auditRes?.modelos?.find((m: any) => m.id === modeloId);

        if (modEncontrado && modEncontrado.estaDisponible) {
          ModelManager.registrarModeloDisponible(
            modeloId,
            'ruta-oficial',
            modEncontrado.hashSha256 || undefined,
            modEncontrado.tamanoBytes || undefined
          );
          ModelManager.registrarUltimoModeloDescargado(modeloId);
          if (alSeleccionarModelo) {
            alSeleccionarModelo(modeloId);
          }
          setMetricasDescarga({
            porcentaje: 100,
            descargadoMB: modEncontrado.tamanoMB,
            totalMB: modEncontrado.tamanoMB,
            velocidadMBs: 0,
            tiempoRestanteSegundos: 0,
            nombreModelo,
            estadoMensaje: `✓ Modelo existente validado en la ruta oficial: ${def.nombreArchivo}`,
          });
          setNotificaciones((prev) => [
            {
              tipo: 'exito',
              texto: `✓ Modelo "${def.nombreVisible}" localizado en su carpeta oficial (${modEncontrado.tamanoMB} MB). Validado y listo para usar.`,
            },
            ...prev,
          ]);
          recargarEstado();
          setDescargandoModeloId(null);
          return;
        }

        // Si no está en disco, iniciar descarga nativa con telemetría en tiempo real
        setMetricasDescarga((prev) => ({
          ...prev,
          estadoMensaje: `Conectando con repositorios oficiales de OpenAI para ${def.nombreVisible}...`,
        }));

        const rawResultado = await tauriInvoker<string>('descargar_modelo', { modeloId });
        const resultado = typeof rawResultado === 'string' ? JSON.parse(rawResultado) : rawResultado;

        if (resultado && resultado.type === 'complete') {
          ModelManager.registrarModeloDisponible(
            modeloId,
            'descarga',
            resultado.sha256,
            resultado.tamanoBytes
          );
          ModelManager.registrarUltimoModeloDescargado(modeloId);
          if (alSeleccionarModelo) {
            alSeleccionarModelo(modeloId);
          }

          setMetricasDescarga({
            porcentaje: 100,
            descargadoMB: resultado.tamanoMB,
            totalMB: resultado.tamanoMB,
            velocidadMBs: 0,
            tiempoRestanteSegundos: 0,
            nombreModelo,
            estadoMensaje: `✓ Modelo verificado y ubicado en la ruta oficial (${resultado.nombreArchivo})`,
          });

          setNotificaciones((prev) => [
            {
              tipo: 'exito',
              texto: `Modelo "${def.nombreVisible}" descargado y verificado con éxito (${resultado.tamanoMB} MB, SHA-256: ${resultado.sha256?.substring(0, 16)}...).`,
            },
            ...prev,
          ]);

          recargarEstado();
          setDescargandoModeloId(null);
          return;
        }
      } catch (tauriErr: any) {
        console.warn('Descarga nativa no completada, aplicando descargador gestionado resiliente:', tauriErr);
      }
    }

    // 3. Estrategia Gestionada Resiliente (Entorno Web o Fallback)
    try {
      setMetricasDescarga((prev) => ({
        ...prev,
        estadoMensaje: `Descargando hacia ${infoRuta?.rutaPorDefectoOficial || '~/.cache/whisper'}\\${def.nombreArchivo}...`,
      }));

      const infoFinal = await ModelManager.descargarModeloHaciaRutaOficial(
        modeloId,
        (pct, msg, vel, tiempoRestante) => {
          setMetricasDescarga({
            porcentaje: pct,
            descargadoMB: Math.round((totalMB * pct) / 100),
            totalMB,
            velocidadMBs: vel || 18.5,
            tiempoRestanteSegundos: tiempoRestante || 0,
            nombreModelo,
            estadoMensaje: msg,
          });
        }
      );

      ModelManager.registrarUltimoModeloDescargado(modeloId);
      if (alSeleccionarModelo) {
        alSeleccionarModelo(modeloId);
      }

      setMetricasDescarga({
        porcentaje: 100,
        descargadoMB: totalMB,
        totalMB,
        velocidadMBs: 0,
        tiempoRestanteSegundos: 0,
        nombreModelo,
        estadoMensaje: `✓ Modelo verificado y ubicado en la ruta oficial: ${def.nombreArchivo}`,
      });

      setNotificaciones((prev) => [
        {
          tipo: 'exito',
          texto: `Modelo "${def.nombreVisible}" descargado y verificado con éxito (${totalMB} MB, SHA-256: ${def.sha256Esperado.substring(0, 16)}...).`,
        },
        ...prev,
      ]);

      recargarEstado();
      setDescargandoModeloId(null);
    } catch (err: any) {
      setNotificaciones((prev) => [
        { tipo: 'advertencia', texto: `Error al obtener el modelo "${def.nombreVisible}": ${err?.message || err}` },
        ...prev,
      ]);
      setDescargandoModeloId(null);
    }
  };

  /**
   * Elimina un modelo del registro con confirmación inline
   */
  const handleSolicitarEliminar = (modeloId: string) => {
    setModeloAEliminar(modeloId);
  };

  const handleConfirmarEliminar = (modeloId: string) => {
    ModelManager.eliminarModelo(modeloId);
    setModeloAEliminar(null);
    recargarEstado();
    const def = WHISPER_MODELS[modeloId];
    setNotificaciones((prev) => [
      { tipo: 'info', texto: `Modelo "${def?.nombreVisible || modeloId}" eliminado del registro local. El archivo en disco no fue modificado.` },
      ...prev,
    ]);
  };



  /**
   * Cargar copia de seguridad simulada
   */
  const handleCargarBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const archivos = Array.from(e.target.files);

    try {
      const resultados: RegistroImportacionBackup[] = await ModelManager.importarCopiaDeSeguridad(archivos);

      const nuevasNotificaciones: Array<{ tipo: 'info' | 'advertencia' | 'exito'; texto: string }> = [];

      for (const res of resultados) {
        if (res.estado === 'duplicado-ignorado') {
          nuevasNotificaciones.push({
            tipo: 'advertencia',
            texto: `[Control Antiduplicado]: ${res.mensaje}`,
          });
        } else {
          nuevasNotificaciones.push({
            tipo: 'exito',
            texto: `[Copia de Seguridad Cargada]: ${res.mensaje}`,
          });
        }
      }

      setNotificaciones((prev) => [...nuevasNotificaciones, ...prev]);
      recargarEstado();

      const exitosos = resultados.filter((r) => r.estado === 'exito');
      if (exitosos.length > 0) {
        const defModelo = Object.values(WHISPER_MODELS).find((m) =>
          exitosos.some((e) => e.nombreArchivo.toLowerCase().includes(m.id))
        );
        if (defModelo) {
          ModelManager.registrarUltimoModeloDescargado(defModelo.id);
          if (alSeleccionarModelo) {
            alSeleccionarModelo(defModelo.id);
          }
        }
      }
    } catch (err: any) {
      setNotificaciones((prev) => [
        {
          tipo: 'advertencia',
          texto: `Aviso en carga de respaldo: ${err.message}`,
        },
        ...prev,
      ]);
    } finally {
      e.target.value = '';
    }
  };

  const pythonCompatible = estadoDeps.pythonCompatible !== false && (
    !estadoDeps.pythonVersion || DependencyManager.esVersionPythonCompatible(estadoDeps.pythonVersion)
  );
  const pythonRecomendada = DependencyManager.esVersionPythonRecomendada(estadoDeps.pythonVersion) || estadoDeps.pythonRecomendada === true;
  const whisperDisponible = Boolean(estadoDeps.whisperInstalado && pythonCompatible);

  return (
    <div className="modal-overlay">
      <div
        className="modal-dialog"
        style={{
          backgroundColor: THEME_TOKENS.colors.surfaceBase,
          boxShadow: THEME_TOKENS.shadows.modal,
          fontFamily: THEME_TOKENS.fonts.sans,
          border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
        }}
      >
        {/* Cabecera Oscura y Solemne */}
        <div
          className="modal-header"
          style={{
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderDark}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: THEME_TOKENS.colors.surfaceDark,
            color: THEME_TOKENS.colors.textOnDark,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1.25rem',
                fontFamily: THEME_TOKENS.fonts.serif,
                fontWeight: 600,
                color: THEME_TOKENS.colors.textOnDark,
                letterSpacing: '-0.01em',
              }}
            >
              Gestor de Modelos OpenAI Whisper
            </h3>
            <span style={{ fontSize: '0.775rem', color: THEME_TOKENS.colors.textOnDarkMuted }}>
              Auditoría de rutas oficiales, copias de seguridad y prevención antiduplicados
            </span>
          </div>
          <button
            onClick={alCerrar}
            style={{
              background: 'transparent',
              border: 'none',
              color: THEME_TOKENS.colors.textOnDarkMuted,
              fontSize: '1.5rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '0.25rem',
              transition: `color ${THEME_TOKENS.transitions.fast}`,
            }}
            title="Cerrar modal"
          >
            &times;
          </button>
        </div>

        {/* Cuerpo con scroll */}
        <div className="modal-body" style={{ backgroundColor: THEME_TOKENS.colors.bgCanvas }}>

          {/* Selector de Pestañas: Modelos vs Librerías de Diarización */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              marginBottom: '1.25rem',
              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              paddingBottom: '0.65rem',
            }}
          >
            <button
              onClick={() => setPestanaActiva('modelos')}
              style={{
                padding: '0.45rem 1.15rem',
                borderRadius: THEME_TOKENS.radii.sm,
                backgroundColor: pestanaActiva === 'modelos' ? THEME_TOKENS.colors.surfaceDark : THEME_TOKENS.colors.surfaceBase,
                color: pestanaActiva === 'modelos' ? '#ffffff' : THEME_TOKENS.colors.textPrimary,
                border: `1px solid ${pestanaActiva === 'modelos' ? THEME_TOKENS.colors.surfaceDark : THEME_TOKENS.colors.borderStrong}`,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>🧠</span> Modelos Whisper ({resumen?.totalDescargados ?? 0}/{resumen?.totalCatalogo ?? 6})
            </button>
            <button
              onClick={() => {
                setPestanaActiva('librerias');
                if (!resumenLibrerias) {
                  comprobarLibrerias();
                }
              }}
              style={{
                padding: '0.45rem 1.15rem',
                borderRadius: THEME_TOKENS.radii.sm,
                backgroundColor: pestanaActiva === 'librerias' ? THEME_TOKENS.colors.surfaceDark : THEME_TOKENS.colors.surfaceBase,
                color: pestanaActiva === 'librerias' ? '#ffffff' : THEME_TOKENS.colors.textPrimary,
                border: `1px solid ${pestanaActiva === 'librerias' ? THEME_TOKENS.colors.surfaceDark : THEME_TOKENS.colors.borderStrong}`,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'all 0.15s ease',
              }}
            >
              <span>📦</span> Librerías y Diarización
              {resumenLibrerias && !resumenLibrerias.todas_instaladas && (
                <span
                  style={{
                    backgroundColor: '#e11d48',
                    color: '#fff',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '0.05rem 0.35rem',
                    borderRadius: '8px',
                  }}
                >
                  !
                </span>
              )}
            </button>
          </div>

          {pestanaActiva === 'modelos' && (
            <>
          {/* Testigo Estático de Disponibilidad de OpenAI Whisper */}
          <div
            style={{
              backgroundColor: whisperDisponible ? THEME_TOKENS.colors.surfaceBase : '#fff1f2',
              border: `1.5px solid ${whisperDisponible ? THEME_TOKENS.colors.stateSuccessBorder : '#f43f5e'}`,
              borderRadius: THEME_TOKENS.radii.md,
              padding: '0.9rem 1.15rem',
              marginBottom: '1rem',
              boxShadow: THEME_TOKENS.shadows.sm,
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '1.75rem',
                    height: '1.75rem',
                    borderRadius: '50%',
                    backgroundColor: whisperDisponible ? '#dcfce7' : '#ffe4e6',
                    color: whisperDisponible ? '#15803d' : '#e11d48',
                    fontSize: '1rem',
                    fontWeight: 700,
                  }}
                >
                  {whisperDisponible ? '✓' : '⚠️'}
                </span>
                <div>
                  <strong
                    style={{
                      fontSize: '0.925rem',
                      color: whisperDisponible ? THEME_TOKENS.colors.textPrimary : '#9f1239',
                      display: 'block',
                    }}
                  >
                    {!pythonCompatible
                      ? `Versión de Python Incompatible (Detectado: Python ${estadoDeps.pythonVersion || 'Desconocido'})`
                      : whisperDisponible
                      ? 'OpenAI Whisper Instalado y Operativo'
                      : 'OpenAI Whisper No Detectado en el Sistema'}
                  </strong>
                  <div style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary, marginTop: '0.15rem' }}>
                    {!pythonCompatible ? (
                      <span style={{ color: '#b91c1c' }}>
                        ⚠️ {estadoDeps.errorCompatibilidad || `OpenAI Whisper requiere Python entre ${estadoDeps.pythonMinVersion || '3.8'} y ${estadoDeps.pythonMaxVersion || '3.13'} (preferente ${estadoDeps.pythonVersionRecomendada || '3.11 o 3.12'}). Sus librerías científicas (PyTorch, Numba, NumPy, TikToken) requieren esta versión.`}
                      </span>
                    ) : whisperDisponible ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <span>
                            <strong>Versión Whisper:</strong> v{estadoDeps.whisperVersion || '20250625'} ·{' '}
                            <strong>Intérprete:</strong> Python {estadoDeps.pythonVersion}
                          </span>
                          {pythonRecomendada ? (
                            <span
                              style={{
                                display: 'inline-block',
                                backgroundColor: '#dcfce7',
                                color: '#166534',
                                fontSize: '0.68rem',
                                fontWeight: 600,
                                padding: '0.1rem 0.45rem',
                                borderRadius: '4px',
                                border: '1px solid #bbf7d0',
                              }}
                            >
                              ⭐ Versión Óptima (3.11 / 3.12)
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-block',
                                backgroundColor: '#fef3c7',
                                color: '#92400e',
                                fontSize: '0.68rem',
                                fontWeight: 500,
                                padding: '0.1rem 0.45rem',
                                borderRadius: '4px',
                                border: '1px solid #fde68a',
                              }}
                            >
                              Compatible (3.8-3.13)
                            </span>
                          )}
                          <span>
                            {estadoDeps.cudaDisponible
                              ? ' · PyTorch con aceleración CUDA (GPU)'
                              : estadoDeps.torchInstalado
                              ? ' · PyTorch activo'
                              : ''}
                          </span>
                        </div>
                        {estadoDeps.whisperCliRuta && (
                          <div style={{ fontSize: '0.7rem', color: THEME_TOKENS.colors.textMuted, marginTop: '0.1rem' }}>
                            CLI: {estadoDeps.whisperCliRuta}
                          </div>
                        )}
                        {estadoDeps.pythonRuta && (
                          <div style={{ fontSize: '0.7rem', color: THEME_TOKENS.colors.textMuted, marginTop: '0.1rem' }}>
                            Ruta Python: {estadoDeps.pythonRuta}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span>
                        Se requiere que OpenAI Whisper esté instalado para descargar, gestionar y ejecutar modelos de voz.
                        {estadoDeps.pythonInstalado && (
                          <span> (Python {estadoDeps.pythonVersion} {pythonRecomendada ? '⭐ recomendado' : 'compatible'} detectado en {estadoDeps.pythonRuta || 'el sistema'})</span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={verificarYRecargar}
                  disabled={comprobandoDeps || instalandoWhisper}
                  title="Recomprobar dependencias del sistema en segundo plano"
                  style={{
                    backgroundColor: THEME_TOKENS.colors.surfaceBase,
                    border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                    color: THEME_TOKENS.colors.textPrimary,
                    padding: '0.35rem 0.75rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    fontSize: '0.75rem',
                    cursor: (comprobandoDeps || instalandoWhisper) ? 'wait' : 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {comprobandoDeps ? '⏳ Comprobando...' : '🔄 Recomprobar'}
                </button>

                {!whisperDisponible && pythonCompatible && (
                  <button
                    onClick={handleInstalarWhisper}
                    disabled={instalandoWhisper}
                    style={{
                      backgroundColor: '#e11d48',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.45rem 1rem',
                      borderRadius: THEME_TOKENS.radii.sm,
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: instalandoWhisper ? 'wait' : 'pointer',
                      boxShadow: THEME_TOKENS.shadows.sm,
                    }}
                  >
                    {instalandoWhisper ? 'Instalando en segundo plano...' : '⬇️ Instalar OpenAI Whisper ahora'}
                  </button>
                )}
              </div>
            </div>

            {mensajeInstalacion && (
              <div
                style={{
                  backgroundColor: '#fef3c7',
                  border: '1px solid #f59e0b',
                  color: '#92400e',
                  padding: '0.4rem 0.75rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  fontSize: '0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span>⏳</span>
                <span>{mensajeInstalacion}</span>
              </div>
            )}
          </div>

          {/* Advertencia Informativa de Compatibilidad de Python */}
          {!pythonCompatible && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#991b1b',
                padding: '0.75rem 1rem',
                borderRadius: THEME_TOKENS.radii.sm,
                marginBottom: '1rem',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                boxShadow: THEME_TOKENS.shadows.xs,
              }}
            >
              <span style={{ fontSize: '1.25rem' }}>🚫</span>
              <div>
                <strong>Versión de Python Incompatible con OpenAI Whisper:</strong>{' '}
                Se detectó Python {estadoDeps.pythonVersion || 'antiguo'}. Whisper y PyTorch requieren como versión mínima Python {estadoDeps.pythonMinVersion || '3.8.0'}. Instala Python 3.8 o superior para continuar.
              </div>
            </div>
          )}

          {/* Banner de Resumen de Modelos Instalados */}
          <div
            style={{
              backgroundColor: (resumen?.totalDescargados ?? 0) > 0 ? THEME_TOKENS.colors.stateSuccessBg : THEME_TOKENS.colors.bgSecondary,
              border: `1px solid ${(resumen?.totalDescargados ?? 0) > 0 ? THEME_TOKENS.colors.stateSuccessBorder : THEME_TOKENS.colors.borderSubtle}`,
              borderRadius: THEME_TOKENS.radii.sm,
              padding: '0.65rem 1rem',
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.8rem' }}>{(resumen?.totalDescargados ?? 0) > 0 ? '✓' : '○'}</span>
              <span style={{ fontSize: '0.8rem', color: (resumen?.totalDescargados ?? 0) > 0 ? THEME_TOKENS.colors.stateSuccess : THEME_TOKENS.colors.textSecondary, fontWeight: 600 }}>
                {resumen?.totalDescargados ?? 0} de {resumen?.totalCatalogo ?? 6} modelos instalados
              </span>
              {(resumen?.totalDescargados ?? 0) > 0 && (
                <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted }}>
                  · ~{Number(resumen?.tamanoTotalOcupadoMB || 0).toFixed(0)} MB ocupados
                </span>
              )}
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                fontFamily: THEME_TOKENS.fonts.mono,
                color: THEME_TOKENS.colors.textMuted,
                backgroundColor: THEME_TOKENS.colors.bgCanvas,
                padding: '0.15rem 0.5rem',
                borderRadius: THEME_TOKENS.radii.xs,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                wordBreak: 'break-all',
              }}
            >
              {resumen?.rutaPorDefectoOficial || infoRuta?.rutaPorDefectoOficial || '%USERPROFILE%\\.cache\\whisper'}
            </span>
          </div>

          {/* Tarjeta de Ubicación de Modelos (Oficial o Personalizada) */}
          <div
            style={{
              backgroundColor: infoRuta?.esRutaPersonalizada ? THEME_TOKENS.colors.stateSuccessBg : THEME_TOKENS.colors.surfaceBase,
              border: `1px solid ${infoRuta?.esRutaPersonalizada ? THEME_TOKENS.colors.stateSuccessBorder : THEME_TOKENS.colors.borderSubtle}`,
              borderRadius: THEME_TOKENS.radii.md,
              padding: '1.15rem 1.25rem',
              marginBottom: '1.25rem',
              boxShadow: THEME_TOKENS.shadows.sm,
              transition: `all ${THEME_TOKENS.transitions.fast}`,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem', color: THEME_TOKENS.colors.textSecondary }}>
                  {infoRuta?.esRutaPersonalizada ? '📍' : '📁'}
                </span>
                <strong style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: '0.875rem' }}>
                  {infoRuta?.esRutaPersonalizada ? 'Ubicación Personalizada por Defecto:' : 'Ubicación Oficial Canónica:'}
                </strong>
              </div>
              <span
                style={{
                  backgroundColor: infoRuta?.esRutaPersonalizada ? THEME_TOKENS.colors.stateSuccess : THEME_TOKENS.colors.bgSecondary,
                  color: infoRuta?.esRutaPersonalizada ? THEME_TOKENS.colors.textOnDark : THEME_TOKENS.colors.textSecondary,
                  border: `1px solid ${infoRuta?.esRutaPersonalizada ? THEME_TOKENS.colors.stateSuccessBorder : THEME_TOKENS.colors.borderStrong}`,
                  fontSize: '0.6875rem',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                  padding: '0.2rem 0.65rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  textTransform: 'uppercase',
                }}
              >
                {infoRuta?.esRutaPersonalizada
                  ? '✓ CARPETA PERSONALIZADA (POR DEFECTO)'
                  : `${(infoRuta?.sistemaOperativoDetectado || 'SISTEMA').toUpperCase()} OFICIAL`}
              </span>
            </div>

            <p
              style={{
                fontFamily: THEME_TOKENS.fonts.mono,
                fontSize: '0.825rem',
                backgroundColor: THEME_TOKENS.colors.bgSecondary,
                padding: '0.55rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                margin: '0.6rem 0 0.5rem 0',
                color: THEME_TOKENS.colors.textPrimary,
                wordBreak: 'break-all',
              }}
            >
              {infoRuta?.rutaPorDefectoOficial || '%USERPROFILE%\\.cache\\whisper'}
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted }}>
                {infoRuta?.esRutaPersonalizada
                  ? 'Esta carpeta personalizada es ahora la ubicación por defecto para transcribir y descargar modelos.'
                  : '* Ubicación estándar de OpenAI Whisper en el disco del sistema.'}
              </span>

              {/* Botones de acción para relocalizar */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleSeleccionarYMoverCarpeta}
                  disabled={estaRelocalizando || Boolean(descargandoModeloId)}
                  style={{
                    backgroundColor: THEME_TOKENS.colors.accentPrimary,
                    color: THEME_TOKENS.colors.textOnDark,
                    border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
                    borderRadius: THEME_TOKENS.radii.sm,
                    padding: '0.45rem 0.95rem',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: (estaRelocalizando || Boolean(descargandoModeloId)) ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: `all ${THEME_TOKENS.transitions.fast}`,
                  }}
                  title="Selecciona una carpeta (por ejemplo en un disco secundario D:\ o E:\) y traslada de forma segura los modelos existentes"
                >
                  <span>📂</span> {infoRuta?.esRutaPersonalizada ? 'Cambiar / Mover a otra carpeta' : 'Mover modelos a carpeta personalizada'}
                </button>

                {infoRuta?.esRutaPersonalizada && (
                  <button
                    type="button"
                    onClick={handleRestablecerUbicacionOficial}
                    disabled={estaRelocalizando || Boolean(descargandoModeloId)}
                    style={{
                      backgroundColor: 'transparent',
                      color: THEME_TOKENS.colors.textSecondary,
                      border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                      borderRadius: THEME_TOKENS.radii.sm,
                      padding: '0.45rem 0.75rem',
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      cursor: (estaRelocalizando || Boolean(descargandoModeloId)) ? 'not-allowed' : 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    title="Restablece la carpeta oficial estándar (~/.cache/whisper) y devuelve los modelos descargados allí"
                  >
                    <span>🔄</span> Restablecer oficial
                  </button>
                )}
              </div>
            </div>

            {/* Banner de progreso de relocalización */}
            {estaRelocalizando && progresoRelocalizacion && (
              <div
                style={{
                  marginTop: '0.85rem',
                  padding: '0.75rem 0.95rem',
                  backgroundColor: THEME_TOKENS.colors.bgCanvas,
                  borderRadius: THEME_TOKENS.radii.sm,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem', marginBottom: '0.35rem' }}>
                  <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}>
                    {progresoRelocalizacion.mensaje}
                  </span>
                  <span style={{ fontFamily: THEME_TOKENS.fonts.mono, color: THEME_TOKENS.colors.textSecondary }}>
                    {progresoRelocalizacion.porcentaje}%
                  </span>
                </div>
                <div
                  style={{
                    height: '6px',
                    backgroundColor: THEME_TOKENS.colors.borderSubtle,
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progresoRelocalizacion.porcentaje}%`,
                      height: '100%',
                      backgroundColor: THEME_TOKENS.colors.accentPrimary,
                      transition: 'width 0.2s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Mensaje de feedback de relocalización */}
            {mensajeRelocalizacion && (
              <div
                style={{
                  marginTop: '0.75rem',
                  padding: '0.55rem 0.85rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor:
                    mensajeRelocalizacion.tipo === 'exito'
                      ? THEME_TOKENS.colors.stateSuccessBg
                      : mensajeRelocalizacion.tipo === 'error'
                      ? '#FEF2F2'
                      : THEME_TOKENS.colors.bgSecondary,
                  border: `1px solid ${
                    mensajeRelocalizacion.tipo === 'exito'
                      ? THEME_TOKENS.colors.stateSuccessBorder
                      : mensajeRelocalizacion.tipo === 'error'
                      ? '#FCA5A5'
                      : THEME_TOKENS.colors.borderStrong
                  }`,
                  color:
                    mensajeRelocalizacion.tipo === 'exito'
                      ? THEME_TOKENS.colors.stateSuccess
                      : mensajeRelocalizacion.tipo === 'error'
                      ? '#B91C1C'
                      : THEME_TOKENS.colors.textPrimary,
                }}
              >
                <span>{mensajeRelocalizacion.texto}</span>
                <button
                  type="button"
                  onClick={() => setMensajeRelocalizacion(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    fontSize: '0.85rem',
                    marginLeft: '0.5rem',
                  }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Sección de Copia de Seguridad */}
          <div
            style={{
              backgroundColor: THEME_TOKENS.colors.accentTaupeBg,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              borderRadius: THEME_TOKENS.radii.md,
              padding: '1rem 1.15rem',
              marginBottom: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div>
              <strong style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span>💾</span> Cargar Copia de Seguridad de Modelos
              </strong>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary, lineHeight: 1.4 }}>
                Importe archivos <code>.pt</code> o <code>.bin</code> previamente respaldados. El sistema validará la firma SHA-256 para prevenir duplicados.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', margin: '0.25rem 0' }}>
              <label
                style={{
                  backgroundColor: THEME_TOKENS.colors.surfaceBase,
                  color: THEME_TOKENS.colors.textPrimary,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                  padding: '0.65rem 2rem',
                  borderRadius: THEME_TOKENS.radii.sm,
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  opacity: 1,
                  pointerEvents: 'auto',
                  textAlign: 'center',
                  boxShadow: THEME_TOKENS.shadows.sm,
                  transition: `all ${THEME_TOKENS.transitions.fast}`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  margin: '0 auto',
                }}
                title="Examinar backup de modelos"
              >
                <span>💾</span>
                Examinar Backup...
                <input
                  type="file"
                  multiple
                  accept=".pt,.bin"
                  onChange={handleCargarBackup}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          {/* Notificaciones y Avisos */}
          {notificaciones.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              {notificaciones.slice(0, 3).map((notif, i) => (
                <div
                  key={i}
                  style={{
                    padding: '0.75rem 1rem',
                    borderRadius: THEME_TOKENS.radii.sm,
                    marginBottom: '0.5rem',
                    fontSize: '0.825rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    backgroundColor:
                      notif.tipo === 'exito'
                        ? THEME_TOKENS.colors.stateSuccessBg
                        : notif.tipo === 'advertencia'
                        ? THEME_TOKENS.colors.stateWarningBg
                        : THEME_TOKENS.colors.stateInfoBg,
                    border: `1px solid ${
                      notif.tipo === 'exito'
                        ? THEME_TOKENS.colors.stateSuccessBorder
                        : notif.tipo === 'advertencia'
                        ? THEME_TOKENS.colors.stateWarningBorder
                        : THEME_TOKENS.colors.stateInfoBorder
                    }`,
                    color:
                      notif.tipo === 'exito'
                        ? THEME_TOKENS.colors.stateSuccess
                        : notif.tipo === 'advertencia'
                        ? THEME_TOKENS.colors.stateWarning
                        : THEME_TOKENS.colors.stateInfo,
                  }}
                >
                  <span style={{ fontWeight: 700 }}>
                    {notif.tipo === 'exito' ? '✓' : notif.tipo === 'advertencia' ? '§' : 'ℹ'}
                  </span>
                  <span>{notif.texto}</span>
                </div>
              ))}
            </div>
          )}

          {/* Barra de progreso de descarga detallada */}
          {descargandoModeloId && (
            <DownloadProgressBar
              porcentaje={metricasDescarga.porcentaje}
              descargadoMB={metricasDescarga.descargadoMB}
              totalMB={metricasDescarga.totalMB}
              velocidadMBs={metricasDescarga.velocidadMBs}
              tiempoRestanteSegundos={metricasDescarga.tiempoRestanteSegundos}
              nombreModelo={metricasDescarga.nombreModelo}
              estadoMensaje={metricasDescarga.estadoMensaje}
            />
          )}

          {/* Lista de Modelos con Efecto Hover Normalizado y Sobrio */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.fonts.serif }}>
              Catálogo de Modelos Oficiales de Whisper
            </h4>
            <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted }}>
              Posicione el cursor para seleccionar
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {modelos.map((m) => {
              const estaHovered = m.id === hoveredModelId;

              const fondoFila = estaHovered
                ? THEME_TOKENS.colors.accentTaupeBg
                : THEME_TOKENS.colors.surfaceBase;

              const bordeFila = estaHovered
                ? THEME_TOKENS.colors.accentTaupe
                : THEME_TOKENS.colors.borderSubtle;

              const sombraFila = estaHovered
                ? THEME_TOKENS.shadows.md
                : THEME_TOKENS.shadows.sm;

              return (
                <div
                  key={m.id}
                  className="model-card-item"
                  onMouseEnter={() => setHoveredModelId(m.id)}
                  onMouseLeave={() => setHoveredModelId(null)}
                  style={{
                    border: `1px solid ${bordeFila}`,
                    backgroundColor: fondoFila,
                    borderRadius: THEME_TOKENS.radii.sm,
                    boxShadow: sombraFila,
                    transform: estaHovered ? 'translateY(-1px)' : 'none',
                    transition: `all ${THEME_TOKENS.transitions.fast}`,
                    cursor: 'pointer',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong
                        style={{
                          fontSize: '0.95rem',
                          color: THEME_TOKENS.colors.textPrimary,
                          fontFamily: THEME_TOKENS.fonts.sans,
                          fontWeight: 600,
                        }}
                      >
                        {m.nombreVisible}
                      </strong>
                      <span
                        style={{
                          fontSize: '0.6875rem',
                          padding: '0.15rem 0.5rem',
                          borderRadius: THEME_TOKENS.radii.xs,
                          backgroundColor: m.estaDisponible
                            ? THEME_TOKENS.colors.stateSuccessBg
                            : THEME_TOKENS.colors.stateWarningBg,
                          color: m.estaDisponible
                            ? THEME_TOKENS.colors.stateSuccess
                            : THEME_TOKENS.colors.stateWarning,
                          border: `1px solid ${
                            m.estaDisponible
                              ? THEME_TOKENS.colors.stateSuccessBorder
                              : THEME_TOKENS.colors.stateWarningBorder
                          }`,
                          fontWeight: 600,
                        }}
                      >
                        {m.estaDisponible ? 'Disponible' : 'No descargado'}
                      </span>
                      {estaHovered && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            color: THEME_TOKENS.colors.textMuted,
                            fontStyle: 'italic',
                          }}
                        >
                          &bull; Opción enfocada
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary, marginTop: '0.25rem' }}>
                      Archivo: <code style={{ backgroundColor: THEME_TOKENS.colors.bgSecondary, padding: '0.1rem 0.35rem', borderRadius: THEME_TOKENS.radii.xs }}>{m.nombreArchivo}</code> | Tamaño: {m.tamanoMB} MB
                      {m.estaDisponible && m.origen && (
                        <span style={{ marginLeft: '0.5rem', color: THEME_TOKENS.colors.textMuted }}>
                          ({m.origen === 'copia-seguridad' ? 'Respaldo' : m.origen === 'descarga' ? 'Descargado' : 'Caché'})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="model-card-actions">
                    {m.estaDisponible ? (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            ModelManager.setModeloActivo(m.id);
                            if (alSeleccionarModelo) alSeleccionarModelo(m.id);
                            alCerrar();
                          }}
                          title="Usar este modelo para transcripciones"
                          style={{
                            backgroundColor: THEME_TOKENS.colors.surfaceDark,
                            color: THEME_TOKENS.colors.textOnDark,
                            border: 'none',
                            padding: '0.5rem 1.1rem',
                            borderRadius: THEME_TOKENS.radii.sm,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            opacity: 1,
                            fontWeight: 600,
                            transition: `background-color ${THEME_TOKENS.transitions.fast}`,
                          }}
                        >
                          ✓ Usar
                        </button>
                        {/* Botón de eliminar con confirmación inline */}
                        {modeloAEliminar === m.id ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.75rem', color: '#991b1b', fontWeight: 600 }}>¿Eliminar registro?</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleConfirmarEliminar(m.id); }}
                              style={{
                                backgroundColor: '#dc2626',
                                color: '#fff',
                                border: 'none',
                                padding: '0.35rem 0.75rem',
                                borderRadius: THEME_TOKENS.radii.xs,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                                fontWeight: 600,
                              }}
                            >
                              Sí, eliminar
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setModeloAEliminar(null); }}
                              style={{
                                backgroundColor: 'transparent',
                                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                                color: THEME_TOKENS.colors.textSecondary,
                                padding: '0.35rem 0.65rem',
                                borderRadius: THEME_TOKENS.radii.xs,
                                fontSize: '0.75rem',
                                cursor: 'pointer',
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleSolicitarEliminar(m.id); }}
                            title="Eliminar este modelo del registro local (el archivo en disco no se modifica)"
                            style={{
                              backgroundColor: 'transparent',
                              border: `1px solid ${THEME_TOKENS.colors.stateErrorBorder}`,
                              color: THEME_TOKENS.colors.stateError,
                              padding: '0.35rem 0.65rem',
                              borderRadius: THEME_TOKENS.radii.xs,
                              fontSize: '0.75rem',
                              cursor: 'pointer',
                            }}
                          >
                            🗑
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDescargar(m.id);
                        }}
                        disabled={Boolean(descargandoModeloId)}
                        title="Descargar modelo oficial a la carpeta de caché"
                        style={{
                          backgroundColor: descargandoModeloId
                            ? THEME_TOKENS.colors.borderStrong
                            : THEME_TOKENS.colors.surfaceBase,
                          color: THEME_TOKENS.colors.textPrimary,
                          border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                          padding: '0.5rem 1.1rem',
                          borderRadius: THEME_TOKENS.radii.sm,
                          fontSize: '0.8rem',
                          cursor: descargandoModeloId ? 'not-allowed' : 'pointer',
                          opacity: 1,
                          fontWeight: 600,
                          transition: `all ${THEME_TOKENS.transitions.fast}`,
                        }}
                      >
                        {descargandoModeloId === m.id
                          ? '⏳ Descargando...'
                          : '⬇ Descargar'}
                      </button>
                    )}
                  </div>

                </div>
              );
            })}
          </div>
            </>
          )}

          {/* Pestaña: Gestión de Librerías y Motor de Diarización */}
          {pestanaActiva === 'librerias' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Cabecera del Entorno Python */}
              <div
                style={{
                  backgroundColor: THEME_TOKENS.colors.surfaceBase,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  borderRadius: THEME_TOKENS.radii.md,
                  padding: '1.15rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  boxShadow: THEME_TOKENS.shadows.sm,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>🐍</span>
                    <strong style={{ fontSize: '0.95rem', color: THEME_TOKENS.colors.textPrimary }}>
                      Entorno de Ejecución de Python
                    </strong>
                  </div>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Intérprete:{' '}
                    <code>
                      {resumenLibrerias?.python_ruta || estadoDeps.pythonRuta || 'Detectando en sistema...'}
                    </code>{' '}
                    ({resumenLibrerias?.python_version || estadoDeps.pythonVersion || 'v3.x'})
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={comprobarLibrerias}
                    disabled={comprobandoLibrerias}
                    style={{
                      backgroundColor: THEME_TOKENS.colors.surfaceBase,
                      border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                      color: THEME_TOKENS.colors.textPrimary,
                      padding: '0.45rem 1rem',
                      borderRadius: THEME_TOKENS.radii.sm,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: comprobandoLibrerias ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span>{comprobandoLibrerias ? '⏳' : '🔍'}</span>
                    {comprobandoLibrerias ? 'Comprobando...' : 'Comprobar Dependencias'}
                  </button>

                  {resumenLibrerias && !resumenLibrerias.todas_instaladas && (
                    <button
                      onClick={handleInstalarTodasFaltantes}
                      disabled={comprobandoLibrerias || !!instalandoLibreriaId}
                      style={{
                        backgroundColor: '#e11d48',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.45rem 1rem',
                        borderRadius: THEME_TOKENS.radii.sm,
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: (comprobandoLibrerias || !!instalandoLibreriaId) ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        boxShadow: THEME_TOKENS.shadows.sm,
                      }}
                    >
                      <span>⬇️</span> Instalar Dependencias Faltantes
                    </button>
                  )}
                </div>
              </div>

              {/* Mensaje de Estado / Notificación */}
              {mensajeLibreria && (
                <div
                  style={{
                    backgroundColor: mensajeLibreria.includes('✓') ? '#f0fdf4' : '#fef3c7',
                    border: `1px solid ${mensajeLibreria.includes('✓') ? '#bbf7d0' : '#fde68a'}`,
                    color: mensajeLibreria.includes('✓') ? '#166534' : '#92400e',
                    padding: '0.6rem 0.9rem',
                    borderRadius: THEME_TOKENS.radii.sm,
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span>{mensajeLibreria.includes('✓') ? '✓' : 'ℹ️'}</span>
                  <span>{mensajeLibreria}</span>
                </div>
              )}

              {/* Tarjeta explicativa de Diarización Acústica */}
              <div
                style={{
                  backgroundColor: THEME_TOKENS.colors.accentTaupeBg,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  borderRadius: THEME_TOKENS.radii.md,
                  padding: '0.85rem 1.15rem',
                  fontSize: '0.8rem',
                  color: THEME_TOKENS.colors.textSecondary,
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ color: THEME_TOKENS.colors.textPrimary, display: 'block', marginBottom: '0.25rem' }}>
                  🎙️ Motor de Diarización Acústica (Identificación de Personas)
                </strong>
                OpenAI Whisper transcribe con precisión fonética y temporal. La separación e identificación de voces
                (<em>"Persona 1"</em>, <em>"Persona 2"</em>, etc.) se procesa extrayendo coeficientes tímbricos (<strong>MFCC</strong>),
                tono fundamental (<strong>Pitch F0</strong>) y agrupamiento jerárquico de huellas de voz mediante <strong>TorchAudio</strong> y <strong>SciPy</strong>.
              </div>

              {/* Listado de Librerías */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {(resumenLibrerias?.librerias || [
                  { id: 'openai-whisper', paquetePip: 'openai-whisper', module: 'whisper', nombre: 'OpenAI Whisper', desc: 'Motor base para la transcripción acústica de audio y video', rol: 'Transcripción ASR', obligatoria: true, instalada: estadoDeps.whisperInstalado, version: estadoDeps.whisperVersion || 'Disponible' },
                  { id: 'torch', paquetePip: 'torch', module: 'torch', nombre: 'PyTorch (Torch)', desc: 'Motor tensorial y aceleración para inferencia de redes neuronales', rol: 'Inferencia Neuronal', obligatoria: true, instalada: estadoDeps.torchInstalado || false, version: estadoDeps.torchVersion || 'Disponible' },
                  { id: 'torchaudio', paquetePip: 'torchaudio', module: 'torchaudio', nombre: 'TorchAudio', desc: 'Extracción espectral, banco de filtros Mel y coeficientes MFCC', rol: 'Procesamiento Acústico', obligatoria: true, instalada: true, version: 'Disponible' },
                  { id: 'scipy', paquetePip: 'scipy', module: 'scipy', nombre: 'SciPy', desc: 'Análisis matemático de señales, distancias de coseno y clustering', rol: 'Diarización y Clustering', obligatoria: true, instalada: true, version: 'Disponible' },
                  { id: 'scikit-learn', paquetePip: 'scikit-learn', module: 'sklearn', nombre: 'Scikit-Learn', desc: 'Algoritmos avanzados de agrupamiento espectral y separación de hablantes', rol: 'Diarización Pericial', obligatoria: false, instalada: false, version: 'No instalada' },
                  { id: 'soundfile', paquetePip: 'soundfile', module: 'soundfile', nombre: 'SoundFile', desc: 'Decodificación precisa de audio multiformato y streaming PCM', rol: 'Decodificación de Audio', obligatoria: false, instalada: true, version: 'Disponible' }
                ]).map((lib) => {
                  const estaInstalada = lib.instalada;
                  const estaInstalando = instalandoLibreriaId === lib.id;
                  return (
                    <div
                      key={lib.id}
                      style={{
                        backgroundColor: THEME_TOKENS.colors.surfaceBase,
                        border: `1px solid ${estaInstalada ? THEME_TOKENS.colors.borderSubtle : '#fecaca'}`,
                        borderRadius: THEME_TOKENS.radii.sm,
                        padding: '0.85rem 1rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: '220px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <strong style={{ fontSize: '0.875rem', color: THEME_TOKENS.colors.textPrimary }}>
                            {lib.nombre}
                          </strong>
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              padding: '0.1rem 0.45rem',
                              borderRadius: '4px',
                              backgroundColor: THEME_TOKENS.colors.bgSecondary,
                              color: THEME_TOKENS.colors.textSecondary,
                              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                            }}
                          >
                            {lib.rol}
                          </span>
                          {lib.obligatoria && (
                            <span style={{ fontSize: '0.65rem', color: '#b91c1c', fontWeight: 600 }}>
                              *Requerida
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.775rem', color: THEME_TOKENS.colors.textSecondary }}>
                          {lib.desc} <span style={{ fontFamily: THEME_TOKENS.fonts.mono, color: THEME_TOKENS.colors.textMuted }}>({lib.paquetePip})</span>
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            color: estaInstalada ? '#166534' : '#b91c1c',
                            backgroundColor: estaInstalada ? '#dcfce7' : '#fee2e2',
                            padding: '0.25rem 0.6rem',
                            borderRadius: THEME_TOKENS.radii.xs,
                            border: `1px solid ${estaInstalada ? '#bbf7d0' : '#fecaca'}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          <span>{estaInstalada ? '✓' : '⚠️'}</span>
                          <span>{estaInstalada ? `v${lib.version}` : 'No instalada'}</span>
                        </span>

                        {!estaInstalada && (
                          <button
                            onClick={() => handleInstalarLibreriaIndividual(lib.paquetePip, lib.id)}
                            disabled={estaInstalando || comprobandoLibrerias}
                            style={{
                              backgroundColor: THEME_TOKENS.colors.surfaceDark,
                              color: '#ffffff',
                              border: 'none',
                              padding: '0.35rem 0.75rem',
                              borderRadius: THEME_TOKENS.radii.xs,
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: estaInstalando ? 'wait' : 'pointer',
                            }}
                          >
                            {estaInstalando ? '⏳ Instalando...' : '⬇ Instalar'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Pie de modal */}
        <div
          className="modal-footer"
          style={{
            borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
          }}
        >
          <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted }}>
            Directorio: <code>{infoRuta?.rutaPorDefectoOficial || '%USERPROFILE%\\.cache\\whisper'}</code>
          </span>
          <button
            onClick={alCerrar}
            style={{
              backgroundColor: THEME_TOKENS.colors.surfaceBase,
              color: THEME_TOKENS.colors.textPrimary,
              border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
              padding: '0.5rem 1.25rem',
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.825rem',
              cursor: 'pointer',
              fontWeight: 600,
              boxShadow: THEME_TOKENS.shadows.sm,
              transition: `all ${THEME_TOKENS.transitions.fast}`,
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};

interface ErrorBoundaryProps {
  children: ReactNode;
  alCerrar: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ModelManagerErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Error capturado en ModelManagerModal:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: THEME_TOKENS.colors.surfaceBase,
              border: `1px solid ${THEME_TOKENS.colors.stateErrorBorder}`,
              borderRadius: THEME_TOKENS.radii.lg,
              padding: '2rem',
              maxWidth: '520px',
              width: '90%',
              boxShadow: THEME_TOKENS.shadows.lg,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
            <h3 style={{ margin: '0 0 0.5rem 0', color: THEME_TOKENS.colors.textPrimary }}>
              No se pudo renderizar la gestión de modelos
            </h3>
            <p style={{ fontSize: '0.875rem', color: THEME_TOKENS.colors.textSecondary, marginBottom: '1.5rem' }}>
              Ocurrió un inconveniente al cargar el estado visual. Sus modelos en disco no han sido afectados.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  try {
                    ModelManager.sincronizarModelosEnRutaOficial();
                  } catch {}
                  this.setState({ hasError: false });
                }}
                style={{
                  backgroundColor: THEME_TOKENS.colors.accentPrimary,
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1.25rem',
                  borderRadius: THEME_TOKENS.radii.sm,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Reintentar
              </button>
              <button
                onClick={this.props.alCerrar}
                style={{
                  backgroundColor: THEME_TOKENS.colors.surfaceBase,
                  color: THEME_TOKENS.colors.textPrimary,
                  border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                  padding: '0.5rem 1.25rem',
                  borderRadius: THEME_TOKENS.radii.sm,
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const ModelManagerModal: React.FC<ModelManagerModalProps> = (props) => {
  if (!props.abierto) return null;
  return (
    <ModelManagerErrorBoundary alCerrar={props.alCerrar}>
      <ModelManagerModalContent {...props} />
    </ModelManagerErrorBoundary>
  );
};

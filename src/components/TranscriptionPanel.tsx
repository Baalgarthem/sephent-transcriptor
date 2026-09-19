import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import ProgressBar from './ProgressBar';
import DonateButton from './DonateButton';
import { ModelManagerModal } from './ModelManagerModal';
import { ModelNotDownloadedModal } from './ModelNotDownloadedModal';
import { WHISPER_MODELS, DEFAULT_MODEL } from '../config/whisperConfig';
import { ModelManager } from '../services/modelManager';
import { TranscriptionService } from '../services/transcription/transcriptionService';
import { TranscriptionRecord } from '../services/transcription/types';
import { OutputPathService, ModoDestinoSalida } from '../services/transcription/outputPathService';
import { TranscriptionDatabase, StoredTranscription } from '../services/database/transcriptionDatabase';
import { TranscriptionGroupService } from '../services/database/transcriptionGroupService';
import { UserSettingsService, ConfiguracionUsuario } from '../services/userSettingsService';
import { THEME_TOKENS } from '../config/themeTokens';
import { ReviewerWorkspaceModal } from './reviewer/ReviewerWorkspaceModal';
import { TranscriptionReviewerService } from '../services/reviewer/transcriptionReviewerService';
import { ReviewerDatabase } from '../services/reviewer/storage/reviewerDatabase';
import { AudioTranscriptionEngine } from '../services/transcription/audioTranscriptionEngine';
import { WhisperBridgeService } from '../services/transcription/whisperBridgeService';
import { InfoHelpButton, HoverTooltip } from './common/Tooltip';
import { HelpModal } from './HelpModal';

type ModelKey = keyof typeof WHISPER_MODELS;
type LanguageOption = 'auto' | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'zh';

export default function TranscriptionPanel(): React.ReactElement {
  // Cargar configuración guardada persistente del usuario (recuerda siempre todas las opciones)
  const configInicial = UserSettingsService.obtenerConfiguracion();

  const [files, setFiles] = useState<File[]>([]);
  const [model, setModel] = useState<ModelKey>(() => {
    try {
      const def = ModelManager.resolverModeloPorDefecto();
      if (def) return def as ModelKey;
    } catch {}
    return (configInicial.modelo as ModelKey) || 'base';
  });
  const [language, setLanguage] = useState<LanguageOption>(configInicial.idioma as LanguageOption);
  const [outputTxt, setOutputTxt] = useState(configInicial.outputTxt);
  const [outputSrt, setOutputSrt] = useState(configInicial.outputSrt);
  const [outputVideo, setOutputVideo] = useState(configInicial.outputVideo);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [transcriptionRecords, setTranscriptionRecords] = useState<TranscriptionRecord[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const cancelacionSolicitada = useRef(false);

  // Modo de destino de las transcripciones y base de datos persistente
  const [modoDestino, setModoDestino] = useState<ModoDestinoSalida>(configInicial.modoDestino);
  const [historialBD, setHistorialBD] = useState<StoredTranscription[]>(() => TranscriptionDatabase.obtenerTodas());
  const [mostrarHistorialBD, setMostrarHistorialBD] = useState(false);
  const [transcripcionesSeleccionadas, setTranscripcionesSeleccionadas] = useState<Set<string>>(new Set());

  // Estados de modales y flujo pericial
  const [modalModelosAbierto, setModalModelosAbierto] = useState(false);
  const [modalNoDescargadoAbierto, setModalNoDescargadoAbierto] = useState(false);
  const [modalRevisorAbierto, setModalRevisorAbierto] = useState(false);
  const [modalAyudaAbierto, setModalAyudaAbierto] = useState(false);
  const [seccionAyudaInicial, setSeccionAyudaInicial] = useState<'general' | 'modelos' | 'formatos' | 'forense' | 'plataforma'>('general');
  const [archivoParaRevisar, setArchivoParaRevisar] = useState<string>('');
  const [idTranscripcionParaRevisar, setIdTranscripcionParaRevisar] = useState<string | undefined>(undefined);
  const [audioUrlParaRevisar, setAudioUrlParaRevisar] = useState<string | undefined>(undefined);
  const [segmentosParaRevisar, setSegmentosParaRevisar] = useState<any[] | undefined>(undefined);
  const [rutaOficialTexto, setRutaOficialTexto] = useState('');
  const [modeloDisponibleLocalmente, setModeloDisponibleLocalmente] = useState<boolean>(() => {
    try {
      const def = ModelManager.resolverModeloPorDefecto();
      return ModelManager.isModelActive(def);
    } catch {
      return false;
    }
  });
  const [modeloParaDescargaDirecta, setModeloParaDescargaDirecta] = useState<string | undefined>(undefined);

  const handleToggleSeleccionTrx = (id: string) => {
    setTranscripcionesSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCombinarTranscripcionesSeleccionadas = () => {
    const ids = Array.from(transcripcionesSeleccionadas);
    if (ids.length !== 2) {
      alert('Por favor selecciona exactamente dos transcripciones para combinarlas en una sola.');
      return;
    }

    const combinada = TranscriptionDatabase.combinarDosTranscripciones(ids[0], ids[1]);
    if (combinada) {
      setHistorialBD(TranscriptionDatabase.obtenerTodas());
      setTranscripcionesSeleccionadas(new Set());
      alert(`¡Transcripciones combinadas exitosamente!\n\nSe ha consolidado una nueva transcripción:\n"${combinada.fileName}"\n(Folio: ${combinada.id})`);
    } else {
      alert('No se pudieron combinar las transcripciones seleccionadas.');
    }
  };

  const handleAbrirRevisor = (
    nombreArchivo?: string,
    idTranscripcion?: string,
    audioUrl?: string,
    segmentos?: any[]
  ) => {
    const historialActual = TranscriptionDatabase.obtenerTodas();
    let archivoFinal = nombreArchivo || '';
    let idFinal = idTranscripcion;
    let urlFinal = audioUrl;
    let segsFinales = segmentos;

    if (!idFinal && !archivoFinal && historialActual.length > 0) {
      const masReciente = historialActual[0];
      archivoFinal = masReciente.fileName;
      idFinal = masReciente.id;
      urlFinal = masReciente.audioBlobUrl;
      segsFinales = masReciente.rawSegments;
    }

    if (idFinal) {
      const reg = TranscriptionDatabase.buscarPorId(idFinal);
      if (reg) {
        if (!archivoFinal) archivoFinal = reg.fileName;
        if (!urlFinal && reg.audioBlobUrl) urlFinal = reg.audioBlobUrl;
        if (!segsFinales && reg.rawSegments) segsFinales = reg.rawSegments;
      }
    }

    setArchivoParaRevisar(archivoFinal);
    setIdTranscripcionParaRevisar(idFinal);
    setAudioUrlParaRevisar(urlFinal);
    setSegmentosParaRevisar(segsFinales);
    setModalRevisorAbierto(true);
  };

  /**
   * Genera y descarga el Informe Oficial de Transcripción.
   * REGLA ESTRICTA: Bloqueado si la transcripción no ha sido marcada como revisada.
   */
  const handleDescargarInformeDesdePanel = (trxId: string, nombreArchivo: string) => {
    const itemBD = TranscriptionDatabase.buscarPorId(trxId);
    if (!itemBD || !itemBD.revisado) {
      alert(
        `🔒 Bloqueo de seguridad: No se puede generar el informe de transcripción sin antes haber marcado la transcripción como revisada.\n\nPor favor, abre la sección "Revisar y Validar Hablantes" para identificar a las personas, generar el hash SHA-256 de integridad y marcarla como revisada.`
      );
      handleAbrirRevisor(nombreArchivo, trxId);
      return;
    }

    // Si está revisada, obtener o construir el expediente real para el informe
    let dossier = ReviewerDatabase.buscarPorTranscripcionId(trxId);
    if (!dossier) {
      const segmentos = itemBD.rawSegments || [];
      dossier = TranscriptionReviewerService.crearExpediente({
        sourceFileName: nombreArchivo,
        originalTranscriptionId: trxId,
        rawSegments: segmentos,
        nombresInicialesHablantes: itemBD.speakerNames,
      });
      dossier.revisado = itemBD.revisado;
      dossier.fechaRevision = itemBD.fechaRevision;
      dossier.hashSha256 = itemBD.hashSha256;
      dossier.hashGeneradoEn = itemBD.hashGeneradoEn;
    }

    try {
      const informe = TranscriptionReviewerService.generarInformeOficialTranscripcion(dossier, {
        notasPericiales: itemBD.notes,
      });
      const blob = new Blob([informe], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nombreArchivo.replace(/\.[^/.]+$/, '')}_informe_oficial_transcripcion.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || 'Error al emitir el informe oficial.');
    }
  };

  const [botonHovered, setBotonHovered] = useState(false);

  // Actualizar estado de la ruta oficial y disponibilidad del modelo seleccionado
  const actualizarEstadoModelo = (modeloAExaminar: ModelKey = model) => {
    const infoRuta = ModelManager.obtenerRutaOficial();
    setRutaOficialTexto(infoRuta.rutaPorDefectoOficial || '%USERPROFILE%\\.cache\\whisper');
    const estaDisp = ModelManager.isModelActive(modeloAExaminar);
    setModeloDisponibleLocalmente(estaDisp);
    return estaDisp;
  };

  // Purgar rigurosamente cualquier dato simulado residual al inicio y auditar modelos físicos en disco
  useEffect(() => {
    TranscriptionDatabase.purgarSimulacionesLegacy();
    ReviewerDatabase.purgarSimulacionesLegacy();
    setHistorialBD(TranscriptionDatabase.obtenerTodas());

    // Sincronizar y validar automáticamente la existencia de modelos físicos en la carpeta oficial
    ModelManager.sincronizarModelosEnRutaOficial().then(() => {
      const activo = ModelManager.resolverModeloPorDefecto() as ModelKey;
      setModel(activo);
      actualizarEstadoModelo(activo);
    });
  }, []);

  useEffect(() => {
    actualizarEstadoModelo(model);
  }, [model]);

  // Listener del evento global "ver tutorial" disparado desde App.tsx
  useEffect(() => {
    const handler = () => {
      setSeccionAyudaInicial('general');
      setModalAyudaAbierto(true);
    };
    window.addEventListener('sephent:abrirTutorial', handler);
    return () => window.removeEventListener('sephent:abrirTutorial', handler);
  }, []);

  const handleCambiarModoDestino = (nuevoModo: ModoDestinoSalida) => {
    setModoDestino(nuevoModo);
    UserSettingsService.guardarConfiguracion({ modoDestino: nuevoModo });
  };

  /**
   * Agrega archivos a la cola a partir de rutas absolutas de disco (Tauri Dialog o Drag & Drop)
   */
  const agregarArchivosPorRuta = (rutas: string[]) => {
    const nuevosObjetos = rutas.map((ruta) => {
      const normalizada = ruta.replace(/\\/g, '/');
      const nombre = normalizada.split('/').pop() || 'audio_archivo';
      const f = new File([''], nombre, { type: 'audio/mpeg' });
      (f as any).__tauriPath = ruta;
      (f as any).path = ruta;
      return f;
    });

    setFiles((prev) => {
      const existentes = new Set(prev.map((f) => (f as any).__tauriPath || f.name));
      const noDuplicados = nuevosObjetos.filter((f) => !existentes.has((f as any).__tauriPath || f.name));
      return [...prev, ...noDuplicados];
    });
  };

  /**
   * Abre el selector nativo de archivos de Windows en Tauri, o fallback a input web
   */
  const handleExaminarArchivos = async () => {
    const tauri = typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
    if (tauri?.dialog?.open) {
      try {
        const seleccion = await tauri.dialog.open({
          multiple: true,
          filters: [
            {
              name: 'Archivos de Audio y Video',
              extensions: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'wma', 'aac', 'mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv'],
            },
          ],
        });
        if (seleccion) {
          const rutas = Array.isArray(seleccion) ? seleccion : [seleccion];
          agregarArchivosPorRuta(rutas);
          return;
        }
      } catch (err) {
        console.warn('Diálogo Tauri falló o cancelado:', err);
      }
    }

    // Fallback: input de archivo HTML
    const inputHtml = document.getElementById('sephent-input-archivos') as HTMLInputElement | null;
    if (inputHtml) {
      inputHtml.click();
    }
  };

  // Listener para arrastrar y soltar archivos en la ventana de Tauri
  useEffect(() => {
    const tauri = typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
    if (tauri?.event?.listen) {
      let desuscribir: (() => void) | undefined = undefined;
      tauri.event
        .listen('tauri://file-drop', (event: any) => {
          if (Array.isArray(event.payload) && event.payload.length > 0) {
            agregarArchivosPorRuta(event.payload);
          }
        })
        .then((fn: () => void) => {
          desuscribir = fn;
        })
        .catch(() => {});

      return () => {
        if (desuscribir) desuscribir();
      };
    }
  }, []);

  /**
   * Manejo acumulativo de archivos examinados (permite examinar múltiples veces)
   */
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const nuevos = Array.from(e.target.files);
      setFiles((prev) => {
        const existentes = new Set(prev.map((f) => `${f.name}_${f.size}`));
        const noDuplicados = nuevos.filter((f) => !existentes.has(`${f.name}_${f.size}`));
        return [...prev, ...noDuplicados];
      });
      // Permite volver a seleccionar el mismo archivo si se requiere en el futuro
      e.target.value = '';
    }
  };

  const handleRetirarArchivo = (indice: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== indice));
  };

  const handleLimpiarCola = () => {
    setFiles([]);
  };

  const esArchivoVideo = (archivo: File): boolean => {
    if (archivo.type.startsWith('video/')) return true;
    const ext = archivo.name.split('.').pop()?.toLowerCase();
    return ['mp4', 'mkv', 'mov', 'avi', 'webm', 'wmv', 'flv', 'm4v'].includes(ext || '');
  };

  const formatearTamano = (bytes: number): string => {
    if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleEliminarRegistroBD = (id: string) => {
    TranscriptionDatabase.eliminar(id);
    setHistorialBD(TranscriptionDatabase.obtenerTodas());
  };


  // Estado para la zona de peligro configurable
  const [zonaPeligroAbierta, setZonaPeligroAbierta] = useState(false);
  const [zonaPeligroFase, setZonaPeligroFase] = useState<0 | 1>(0); // 0=configuración, 1=confirmación por texto
  const [textoConfirmacionPeligro, setTextoConfirmacionPeligro] = useState('');
  const [opcionesPeligro, setOpcionesPeligro] = useState({
    transcripciones: true,
    expedientes: true,
    grupos: true,
    modelos: false, // Por defecto FALSE para conservar y no perder los modelos Whisper
    configuracion: false,
  });

  const handleIniciarBorradoTotal = () => {
    if (
      !opcionesPeligro.transcripciones &&
      !opcionesPeligro.expedientes &&
      !opcionesPeligro.grupos &&
      !opcionesPeligro.modelos &&
      !opcionesPeligro.configuracion
    ) {
      alert('Por favor selecciona al menos un elemento que deseas depurar.');
      return;
    }
    setTextoConfirmacionPeligro('');
    setZonaPeligroFase(1);
  };

  const handleConfirmarBorradoFinal = async () => {
    const palabra = textoConfirmacionPeligro.trim().toUpperCase();
    if (palabra !== 'ELIMINAR' && palabra !== 'ELIMINAR TODO') return;

    const eliminados: string[] = [];
    const conservados: string[] = [];

    if (opcionesPeligro.transcripciones) {
      TranscriptionDatabase.limpiarTodo();
      setHistorialBD([]);
      setTranscriptionRecords([]);
      eliminados.push('Historial de transcripciones');
    } else {
      conservados.push('Historial de transcripciones');
    }

    if (opcionesPeligro.expedientes) {
      ReviewerDatabase.limpiarTodo();
      eliminados.push('Expedientes periciales y notas');
    } else {
      conservados.push('Expedientes periciales');
    }

    if (opcionesPeligro.grupos) {
      TranscriptionGroupService.limpiarTodo();
      eliminados.push('Grupos de expedientes');
    } else {
      conservados.push('Grupos de expedientes');
    }

    if (opcionesPeligro.modelos) {
      ModelManager.limpiarModelosRegistrados();
      eliminados.push('Modelos OpenAI Whisper (registro restablecido)');
    } else {
      conservados.push('Modelos OpenAI Whisper (conservados intactos)');
    }

    if (opcionesPeligro.configuracion) {
      UserSettingsService.guardarConfiguracion({
        modelo: 'medium',
        idioma: 'es',
        outputTxt: true,
        outputSrt: true,
        outputVideo: false,
        modoDestino: 'default',
      });
      eliminados.push('Preferencias de usuario');
    }

    setZonaPeligroFase(0);
    setZonaPeligroAbierta(false);
    setTextoConfirmacionPeligro('');
    setStatusMessage('');
    setProgress(0);

    // Re-sincronizar inmediatamente con la carpeta oficial para validar modelos que persistan en disco
    await ModelManager.sincronizarModelosEnRutaOficial();
    const activo = ModelManager.resolverModeloPorDefecto() as ModelKey;
    setModel(activo);
    actualizarEstadoModelo(activo);

    alert(
      `✓ Limpieza completada con éxito.\n\n` +
      `Elementos eliminados:\n• ${eliminados.join('\n• ') || 'Ninguno'}\n\n` +
      `Elementos conservados:\n• ${conservados.join('\n• ')}`
    );
  };

  const handleCancelarPeligro = () => {
    setZonaPeligroFase(0);
    setTextoConfirmacionPeligro('');
  };

  const handleLimpiarHistorialBD = async () => {
    if (confirm('¿Desea vaciar el historial de transcripciones y expedientes?\n\nTus modelos de OpenAI Whisper se mantendrán intactos.')) {
      TranscriptionDatabase.limpiarTodo();
      ReviewerDatabase.limpiarTodo();
      TranscriptionGroupService.limpiarTodo();
      setHistorialBD([]);
      await ModelManager.sincronizarModelosEnRutaOficial();
      const activo = ModelManager.resolverModeloPorDefecto() as ModelKey;
      setModel(activo);
      actualizarEstadoModelo(activo);
    }
  };

  const handleRestablecerTodoACero = async () => {
    if (confirm('¿Deseas restablecer la aplicación a datos cero (vaciando transcripciones y expedientes)?\n\nTus modelos descargados de OpenAI Whisper se conservarán intactos para que no tengas que descargarlos nuevamente.')) {
      TranscriptionDatabase.limpiarTodo();
      ReviewerDatabase.limpiarTodo();
      TranscriptionGroupService.limpiarTodo();
      setHistorialBD([]);
      setTranscriptionRecords([]);
      setStatusMessage('');
      setProgress(0);
      await ModelManager.sincronizarModelosEnRutaOficial();
      const activo = ModelManager.resolverModeloPorDefecto() as ModelKey;
      setModel(activo);
      actualizarEstadoModelo(activo);
      alert('✓ Base de datos restablecida a datos cero.\n\nTus modelos de OpenAI Whisper se han conservado intactos.');
    }
  };



  /**
   * Al seleccionar un modelo: si no está disponible, valida en disco antes de alertar
   */
  const handleCambioModelo = async (e: ChangeEvent<HTMLSelectElement>) => {
    const nuevoModelo = e.target.value as ModelKey;
    setModel(nuevoModelo);
    ModelManager.registrarUltimoModeloUtilizado(nuevoModelo);
    UserSettingsService.guardarConfiguracion({ modelo: nuevoModelo });
    let estaDisp = actualizarEstadoModelo(nuevoModelo);

    if (!estaDisp) {
      // Re-verificar si el modelo existe en la carpeta oficial física
      await ModelManager.sincronizarModelosEnRutaOficial();
      estaDisp = actualizarEstadoModelo(nuevoModelo);
      if (!estaDisp) {
        setModalNoDescargadoAbierto(true);
      }
    }
  };

  /**
   * Cancela de forma inmediata la transcripción en curso matando el proceso en segundo plano.
   */
  const handleCancelarTranscripcion = async () => {
    if (!isRunning || isCanceling) return;
    setIsCanceling(true);
    cancelacionSolicitada.current = true;
    setStatusMessage('⏹ Cancelando transcripción en segundo plano...');
    try {
      await WhisperBridgeService.cancelar();
    } catch (err) {
      console.warn('Error al solicitar cancelación de Whisper:', err);
    }
  };

  /**
   * Proceso de Transcripción
   * Aplica principios SOLID y patrones Strategy/Factory mediante TranscriptionService
   */
  const startTranscription = async () => {
    if (files.length === 0) {
      alert('Por favor seleccione al menos un documento de audio o video para transcribir.');
      return;
    }

    if (!outputTxt && !outputSrt && !outputVideo) {
      alert('Por favor seleccione al menos un formato de salida documental (.txt, .srt o video).');
      return;
    }

    let existeEnRutaOficial = ModelManager.isModelActive(model);
    if (!existeEnRutaOficial) {
      // Sincronizar con el disco para validar si el archivo físico está presente en ~/.cache/whisper
      await ModelManager.sincronizarModelosEnRutaOficial();
      existeEnRutaOficial = actualizarEstadoModelo(model);
    }

    if (!existeEnRutaOficial) {
      setModalNoDescargadoAbierto(true);
      return;
    }

    cancelacionSolicitada.current = false;
    setIsCanceling(false);
    setIsRunning(true);
    ModelManager.registrarUltimoModeloUtilizado(model);
    setProgress(0);
    setStatusMessage(`Cargando modelo ${WHISPER_MODELS[model]?.nombreArchivo} desde la memoria local...`);

    await new Promise((r) => setTimeout(r, 400));

    try {
      const records: TranscriptionRecord[] = [];
      for (let i = 0; i < files.length; i++) {
        if (cancelacionSolicitada.current) {
          break;
        }

        const file = files[i];
        setStatusMessage(`Procesando archivo ${i + 1} de ${files.length}: "${file.name}" [Whisper: ${model}]...`);

        let audioBlobUrl: string | undefined = undefined;
        try {
          if (typeof URL !== 'undefined' && URL.createObjectURL && file instanceof Blob) {
            audioBlobUrl = URL.createObjectURL(file);
          }
        } catch {
          // Ignorar si no está disponible URL.createObjectURL en el entorno
        }

        // Procesamiento acústico real con VAD y diarización
        const resultadoAudio = await AudioTranscriptionEngine.procesarArchivo(file, {
          model,
          language,
          onProgreso: (porcentaje, mensaje) => {
            if (!cancelacionSolicitada.current) {
              setProgress(porcentaje);
              setStatusMessage(`[${i + 1}/${files.length}] ${mensaje}`);
            }
          },
        });

        if (cancelacionSolicitada.current) {
          break;
        }

        // Generar registro respetando el nombre exacto del archivo cargado (KISS, DRY, Strategy)
        const record = TranscriptionService.generateTranscriptionRecord(
          file,
          {
            txt: outputTxt,
            srt: outputSrt,
            video: outputVideo,
          },
          {
            txt: resultadoAudio.txtContent,
            srt: resultadoAudio.srtContent,
          }
        );

        const carpetaDestino = OutputPathService.resolverCarpetaDestino(file.name, modoDestino);
        const rutaOrigenDirectorio = ((file as any).__tauriPath || (file as any).path)
          ? String((file as any).__tauriPath || (file as any).path).replace(/\\/g, '/').split('/').slice(0, -1).join('/')
          : '';

        const salidasBD = record.outputs.map((out) => {
          let fullPath = '';
          if (modoDestino === 'original' && rutaOrigenDirectorio) {
            fullPath = `${rutaOrigenDirectorio}/${out.fileName}`.replace(/\//g, '\\');
          } else {
            fullPath = `${OutputPathService.obtenerRutaPorDefecto()}\\${out.fileName}`;
          }
          return {
            format: out.formatId,
            fileName: out.fileName,
            fullPath,
          };
        });

        // Guardar físicamente los archivos .txt y .srt generados en el disco duro en entorno de escritorio
        if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
          const tauri = (window as any).__TAURI__;
          for (const out of salidasBD) {
            if (out.format === 'txt' && resultadoAudio.txtContent && out.fullPath) {
              try {
                await tauri.invoke('guardar_archivo_texto', {
                  ruta: out.fullPath,
                  contenido: resultadoAudio.txtContent,
                });
              } catch (writeErr) {
                console.warn('Aviso al guardar archivo TXT en disco:', writeErr);
              }
            } else if (out.format === 'srt' && resultadoAudio.srtContent && out.fullPath) {
              try {
                await tauri.invoke('guardar_archivo_texto', {
                  ruta: out.fullPath,
                  contenido: resultadoAudio.srtContent,
                });
              } catch (writeErr) {
                console.warn('Aviso al guardar archivo SRT en disco:', writeErr);
              }
            }
          }
        }

        const registroBD = TranscriptionDatabase.guardar({
          fileName: file.name,
          fileType: esArchivoVideo(file) ? 'video' : 'audio',
          fileSizeFormatted: formatearTamano(file.size),
          modelUsed: WHISPER_MODELS[model]?.nombreVisible || model,
          language: language === 'auto' ? 'Detección automática' : language.toUpperCase(),
          destinationType: modoDestino,
          destinationFolder: carpetaDestino,
          outputs: salidasBD,
          status: 'completado',
          rawSegments: resultadoAudio.segments,
          textContent: resultadoAudio.txtContent,
          srtContent: resultadoAudio.srtContent,
          audioBlobUrl: audioBlobUrl,
          speakerNames: resultadoAudio.speakerNames,
        });

        records.push({
          ...record,
          transcriptionId: registroBD.id,
          rawSegments: resultadoAudio.segments,
          textContent: resultadoAudio.txtContent,
          srtContent: resultadoAudio.srtContent,
          audioUrl: audioBlobUrl,
        });
      }

      if (cancelacionSolicitada.current) {
        setStatusMessage('⏹ Transcripción cancelada por el usuario.');
        setProgress(0);
      } else {
        setTranscriptionRecords(records);
        setHistorialBD(TranscriptionDatabase.obtenerTodas());
        setProgress(100);
        setStatusMessage(
          records.length === 1
            ? `Transcripción completada con éxito con OpenAI Whisper. Puedes revisar y validar los hablantes desde el historial.`
            : `${records.length} transcripciones completadas con éxito con OpenAI Whisper. Puedes revisar y validar los hablantes desde el historial.`
        );
      }
    } catch (err: any) {
      if (cancelacionSolicitada.current) {
        setStatusMessage('⏹ Transcripción cancelada por el usuario.');
        setProgress(0);
      } else {
        console.error('Error durante la transcripción:', err);
        const msg = err?.message || String(err);
        setStatusMessage(`❌ Error en la transcripción: ${msg}`);
        alert(`No se pudo completar la transcripción con OpenAI Whisper:\n\n${msg}`);
      }
    } finally {
      setIsRunning(false);
      setIsCanceling(false);
      cancelacionSolicitada.current = false;
    }
  };

  return (
    <div style={{ fontFamily: THEME_TOKENS.fonts.sans, width: '100%' }}>
      {/* Barra de Control Superior Oscura / Ejecutiva (Mobile First) */}
      <div className="top-control-bar" style={{ backgroundColor: THEME_TOKENS.colors.surfaceDark, border: `1px solid ${THEME_TOKENS.colors.borderDark}` }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#DCDAD1' }}>◈</span>
            <strong style={{ fontSize: '0.8125rem', color: '#FFFFFF', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
              Ruta Oficial de Modelos (OpenAI Whisper)
            </strong>
            <InfoHelpButton
              variant="onDark"
              symbolColor="#FFFFFF"
              tooltip="Ruta oficial de OpenAI Whisper. Si un modelo ya existe en tu equipo, Sephent lo detecta automáticamente por SHA-256 para no descargarlo de nuevo."
              onClick={() => {
                setSeccionAyudaInicial('modelos');
                setModalAyudaAbierto(true);
              }}
            />
          </div>
          <p
            style={{
              fontFamily: THEME_TOKENS.fonts.mono,
              fontSize: '0.8rem',
              color: '#DCDAD1',
              margin: '0.2rem 0 0 1.25rem',
              wordBreak: 'break-all',
            }}
          >
            {rutaOficialTexto || 'Detectando ruta oficial...'}
          </p>
        </div>

        <button
          onClick={() => setModalModelosAbierto(true)}
          className="top-control-btn"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            color: '#FFFFFF',
            border: '1px solid rgba(255, 255, 255, 0.35)',
            borderRadius: THEME_TOKENS.radii.sm,
            fontSize: '0.8125rem',
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            padding: '0.5rem 1rem',
            transition: `all ${THEME_TOKENS.transitions.fast}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.borderColor = '#FFFFFF';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
          }}
        >
          ⚙️ Gestionar modelos
        </button>
      </div>

      {/* Contenedor de Ruta para Guardar Transcripciones (Mismo estilo que la ruta oficial) */}
      <div
        className="top-control-bar"
        style={{
          backgroundColor: THEME_TOKENS.colors.surfaceDark,
          border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
          marginTop: '-0.75rem',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#DCDAD1' }}>📁</span>
            <strong
              style={{
                fontSize: '0.8125rem',
                color: '#FFFFFF',
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
              }}
            >
              Ruta para guardar transcripciones
            </strong>
          </div>
          <p
            style={{
              fontFamily: THEME_TOKENS.fonts.mono,
              fontSize: '0.8rem',
              color: '#DCDAD1',
              margin: '0.2rem 0 0 1.25rem',
              wordBreak: 'break-all',
            }}
          >
            {modoDestino === 'default'
              ? OutputPathService.obtenerRutaPorDefecto()
              : 'Misma carpeta donde está el archivo original'}
          </p>

          <div
            style={{
              margin: '0.45rem 0 0 1.25rem',
              display: 'flex',
              gap: '1.25rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <HoverTooltip content="Guarda las transcripciones en la carpeta central TranscriptorOutputs de tu usuario">
              <label
                style={{
                  fontSize: '0.785rem',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <input
                  type="radio"
                  name="modoDestinoSalida"
                  value="default"
                  checked={modoDestino === 'default'}
                  onChange={() => handleCambiarModoDestino('default')}
                />
                Usar ruta por defecto
              </label>
            </HoverTooltip>

            <HoverTooltip content="Guarda las transcripciones en la misma carpeta donde reside tu audio de origen">
              <label
                style={{
                  fontSize: '0.785rem',
                  color: '#FFFFFF',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                }}
              >
                <input
                  type="radio"
                  name="modoDestinoSalida"
                  value="original"
                  checked={modoDestino === 'original'}
                  onChange={() => handleCambiarModoDestino('original')}
                />
                Misma carpeta del archivo cargado
              </label>
            </HoverTooltip>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            onClick={() => {
              if (historialBD.length > 0) {
                handleAbrirRevisor(historialBD[0].fileName, historialBD[0].id, historialBD[0].audioBlobUrl, historialBD[0].rawSegments);
              } else {
                alert(
                  'No hay transcripciones disponibles para revisar.\n\nEl sistema inicia con datos en cero. Para comenzar, carga y transcribe un archivo de audio o video en la pantalla principal.\n\nPuedes consultar el Tutorial interactivo para ver ejemplos guiados de uso.'
                );
              }
            }}
            className="top-control-btn"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              padding: '0.5rem 1rem',
              transition: `all ${THEME_TOKENS.transitions.fast}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
              e.currentTarget.style.borderColor = '#FFFFFF';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
            }}
            title="Identificar personas hablantes, generar hash de integridad y validar para emitir el informe oficial"
          >
            👥 Revisar y Validar Hablantes
          </button>

          <button
            onClick={() => setMostrarHistorialBD(!mostrarHistorialBD)}
            className="top-control-btn"
            style={{
              backgroundColor: mostrarHistorialBD ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              color: '#FFFFFF',
              border: `1px solid ${mostrarHistorialBD ? '#FFFFFF' : 'rgba(255, 255, 255, 0.35)'}`,
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              padding: '0.5rem 1rem',
              transition: `all ${THEME_TOKENS.transitions.fast}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.22)';
              e.currentTarget.style.borderColor = '#FFFFFF';
            }}
            onMouseLeave={(e) => {
              if (!mostrarHistorialBD) {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
              }
            }}
          >
            🗄️ Ver base de datos ({historialBD.length})
          </button>

          <button
            onClick={handleRestablecerTodoACero}
            className="top-control-btn"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: '#fca5a5',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              padding: '0.5rem 1rem',
              transition: `all ${THEME_TOKENS.transitions.fast}`,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.25)';
              e.currentTarget.style.borderColor = '#ef4444';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.35)';
            }}
            title="Vaciar completamente la base de datos y restablecer la aplicación a cero datos"
          >
            🧹 Limpiar todo a cero
          </button>
        </div>
      </div>

      {/* Superficie de Trabajo Editorial (Mobile First) */}
      <div
        className="work-surface"
        style={{
          backgroundColor: THEME_TOKENS.colors.surfaceBase,
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          boxShadow: THEME_TOKENS.shadows.sm,
        }}
      >
        <div className="work-surface-header">
          <h2 style={{ margin: 0, color: THEME_TOKENS.colors.textPrimary, fontSize: '1.25rem', fontFamily: THEME_TOKENS.fonts.serif, fontWeight: 600 }}>
            Configuración de Expediente y Transcripción
          </h2>
          <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Sesión Segura &middot; Procesamiento Local
          </span>
        </div>

        {/* 1. Selección de Archivos con Botón Centrado y Cola Dinámica */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <label style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary, fontSize: '0.875rem' }}>
              1. Documentos de audio o video a procesar
            </label>
            <InfoHelpButton
              tooltip="Arrastra o examina archivos de audio o video (.mp3, .wav, .m4a, .mp4, etc.). El nombre de tus archivos de origen se preservará idéntico en todas las salidas generadas."
              onClick={() => {
                setSeccionAyudaInicial('general');
                setModalAyudaAbierto(true);
              }}
            />
          </div>
          <div
            style={{
              border: `1px dashed ${THEME_TOKENS.colors.borderStrong}`,
              borderRadius: THEME_TOKENS.radii.sm,
              backgroundColor: THEME_TOKENS.colors.bgCanvas,
              padding: '1.75rem 1.25rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <div
              className="examine-btn-container"
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                margin: '0.5rem auto',
                width: '100%',
              }}
            >
              <HoverTooltip content="Abre el selector de archivos para agregar audios o videos a la cola">
                <button
                  type="button"
                  onClick={handleExaminarArchivos}
                  disabled={isRunning}
                  className="examine-btn"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto',
                    textAlign: 'center',
                    gap: '0.6rem',
                    padding: '0.75rem 2rem',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    backgroundColor: THEME_TOKENS.colors.surfaceBase,
                    border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                    borderRadius: THEME_TOKENS.radii.sm,
                    color: THEME_TOKENS.colors.textPrimary,
                    fontSize: '0.875rem',
                    fontWeight: 600,
                  }}
                >
                  <span>📁</span> Examinar archivos de audio o video
                </button>
              </HoverTooltip>
              <input
                id="sephent-input-archivos"
                type="file"
                multiple
                accept="audio/*,video/*"
                onChange={handleFileChange}
                disabled={isRunning}
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted, marginTop: '0.55rem', textAlign: 'center', display: 'block' }}>
                Formatos compatibles: WAV, MP3, M4A, FLAC, MP4, MKV, MOV (puedes arrastrar archivos o examinar varias veces)
              </span>
            </div>

            {/* Listado de Archivos Cargados en Cola */}
            {files.length > 0 && (
              <div className="file-queue-container">
                <div className="file-queue-header">
                  <span>Archivos en cola para transcripción ({files.length})</span>
                  <button
                    type="button"
                    onClick={handleLimpiarCola}
                    disabled={isRunning}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: THEME_TOKENS.colors.textMuted,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Vaciar cola
                  </button>
                </div>

                {files.map((file, idx) => {
                  const esVideo = esArchivoVideo(file);
                  return (
                    <div key={`${file.name}_${idx}`} className="file-queue-item">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                        <span className={esVideo ? 'file-badge-video' : 'file-badge-audio'}>
                          {esVideo ? '🎬 Video' : '🎵 Audio'}
                        </span>
                        <span
                          className="file-name-truncate"
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textMuted, flexShrink: 0 }}>
                          ({formatearTamano(file.size)})
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRetirarArchivo(idx)}
                        disabled={isRunning}
                        className="file-remove-btn"
                        title={`Retirar "${file.name}" de la cola`}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 2. Selector de Modelo Whisper y Estado */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary, fontSize: '0.875rem' }}>
                2. Modelo OpenAI Whisper
              </label>
              <InfoHelpButton
                tooltip="Modelos de IA: Tiny y Base son muy rápidos para pruebas; Small y Medium otorgan un gran equilibrio profesional pericial; Large otorga la máxima fidelidad forense."
                onClick={() => {
                  setSeccionAyudaInicial('modelos');
                  setModalAyudaAbierto(true);
                }}
              />
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.03em',
                color: modeloDisponibleLocalmente ? THEME_TOKENS.colors.stateSuccess : THEME_TOKENS.colors.stateWarning,
                backgroundColor: modeloDisponibleLocalmente ? THEME_TOKENS.colors.stateSuccessBg : THEME_TOKENS.colors.stateWarningBg,
                border: `1px solid ${modeloDisponibleLocalmente ? THEME_TOKENS.colors.stateSuccessBorder : THEME_TOKENS.colors.stateWarningBorder}`,
                padding: '0.15rem 0.55rem',
                borderRadius: THEME_TOKENS.radii.xs,
              }}
            >
              {modeloDisponibleLocalmente ? '✓ Disponible' : '⚠️ No descargado'}
            </span>
          </div>

          <HoverTooltip content={`Modelo activo: ${WHISPER_MODELS[model]?.nombreVisible}. ${WHISPER_MODELS[model]?.descripcion}`} maxWidth="340px">
            <select
              value={model}
              onChange={handleCambioModelo}
              disabled={isRunning}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: THEME_TOKENS.radii.sm,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                fontSize: '0.875rem',
                backgroundColor: THEME_TOKENS.colors.surfaceBase,
                color: THEME_TOKENS.colors.textPrimary,
                fontFamily: THEME_TOKENS.fonts.sans,
                outline: 'none',
                transition: `border-color ${THEME_TOKENS.transitions.fast}`,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderFocus)}
              onBlur={(e) => (e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderStrong)}
            >
              {Object.entries(WHISPER_MODELS).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.nombreVisible} — Archivo: {cfg.nombreArchivo} ({cfg.tamanoAproximadoMB} MB)
                </option>
              ))}
            </select>
          </HoverTooltip>
          <span style={{ fontSize: '0.775rem', color: THEME_TOKENS.colors.textSecondary, marginTop: '0.35rem', display: 'block' }}>
            {WHISPER_MODELS[model]?.descripcion}
          </span>
        </div>

        {/* 3. Selector de Idioma */}
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <label style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary, fontSize: '0.875rem' }}>
              3. Idioma del registro sonoro
            </label>
            <InfoHelpButton
              tooltip="Permite que el modelo detecte automáticamente el idioma o fija Español/Inglés para máxima precisión y evitar traducciones involuntarias."
            />
          </div>
          <HoverTooltip content="Configura el idioma de transcripción: detección automática o forzado en un idioma específico" maxWidth="320px">
            <select
              value={language}
              onChange={(e) => {
                const nuevoIdioma = e.target.value as LanguageOption;
                setLanguage(nuevoIdioma);
                UserSettingsService.guardarConfiguracion({ idioma: nuevoIdioma });
              }}
              disabled={isRunning}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                borderRadius: THEME_TOKENS.radii.sm,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                fontSize: '0.875rem',
                backgroundColor: THEME_TOKENS.colors.surfaceBase,
                color: THEME_TOKENS.colors.textPrimary,
                fontFamily: THEME_TOKENS.fonts.sans,
                outline: 'none',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderFocus)}
              onBlur={(e) => (e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderStrong)}
            >
              <option value="auto">🌐 Detección automática de idioma</option>
              <option value="es">Español (Castellano)</option>
              <option value="en">Inglés (English)</option>
              <option value="fr">Francés (Français)</option>
              <option value="de">Alemán (Deutsch)</option>
              <option value="it">Italiano (Italiano)</option>
              <option value="pt">Portugués (Português)</option>
              <option value="zh">Chino (Mandarin)</option>
            </select>
          </HoverTooltip>
        </div>

        {/* 4. Opciones de Salida Documental */}
        <div style={{ marginBottom: '2rem', paddingTop: '0.5rem', borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.85rem 0 0.6rem 0' }}>
            <strong style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: '0.875rem' }}>
              4. Formatos y actas de salida requeridas:
            </strong>
            <InfoHelpButton
              tooltip="Selecciona qué actas deseas emitir. Cada archivo generado preservará exactamente el nombre de tu archivo de origen cambiando solo la extensión."
              onClick={() => {
                setSeccionAyudaInicial('formatos');
                setModalAyudaAbierto(true);
              }}
            />
          </div>
          <div className="output-formats-group">
            <HoverTooltip content="Genera acta de transcripción literal (.txt) estructurada con encabezados, metadatos y turnos por interlocutor">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: THEME_TOKENS.colors.textPrimary }}>
                <input
                  type="checkbox"
                  checked={outputTxt}
                  onChange={(e) => {
                    setOutputTxt(e.target.checked);
                    UserSettingsService.guardarConfiguracion({ outputTxt: e.target.checked });
                  }}
                  disabled={isRunning}
                  style={{ accentColor: THEME_TOKENS.colors.surfaceDark }}
                />
                <span>Transcripción literal (<code>.txt</code>)</span>
              </label>
            </HoverTooltip>

            <HoverTooltip content="Genera subtítulos periciales (.srt) con marcas de tiempo canónicas compatibles con reproductores de video">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: THEME_TOKENS.colors.textPrimary }}>
                <input
                  type="checkbox"
                  checked={outputSrt}
                  onChange={(e) => {
                    setOutputSrt(e.target.checked);
                    UserSettingsService.guardarConfiguracion({ outputSrt: e.target.checked });
                  }}
                  disabled={isRunning}
                  style={{ accentColor: THEME_TOKENS.colors.surfaceDark }}
                />
                <span>Subtítulos temporizados periciales (<code>.srt</code>)</span>
              </label>
            </HoverTooltip>

            <HoverTooltip content="Conserva o genera el archivo de video procesado (.mp4) con su meta-imagen">
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: THEME_TOKENS.colors.textPrimary }}>
                <input
                  type="checkbox"
                  checked={outputVideo}
                  onChange={(e) => {
                    setOutputVideo(e.target.checked);
                    UserSettingsService.guardarConfiguracion({ outputVideo: e.target.checked });
                  }}
                  disabled={isRunning}
                  style={{ accentColor: THEME_TOKENS.colors.surfaceDark }}
                />
                <span>Video generado con meta‑imagen (<code>.mp4</code>)</span>
              </label>
            </HoverTooltip>
          </div>
        </div>

        {/* Botón de Acción Principal Centrado (Mobile First) */}
        <div className="btn-primary-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <HoverTooltip content={isRunning ? 'Procesando archivos...' : 'Inicia la decodificación acústica, VAD, identificación de hablantes y generación de archivos'}>
            <button
              onClick={startTranscription}
              disabled={isRunning}
              onMouseEnter={() => setBotonHovered(true)}
              onMouseLeave={() => setBotonHovered(false)}
              className="btn-primary-action"
              style={{
                padding: '0.85rem 2.5rem',
                backgroundColor: isRunning
                  ? THEME_TOKENS.colors.borderStrong
                  : botonHovered
                  ? THEME_TOKENS.colors.accentHover
                  : THEME_TOKENS.colors.accentPrimary,
                color: THEME_TOKENS.colors.textOnDark,
                border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
                borderRadius: THEME_TOKENS.radii.sm,
                fontSize: '0.95rem',
                fontFamily: THEME_TOKENS.fonts.sans,
                fontWeight: 600,
                letterSpacing: '0.02em',
                cursor: isRunning ? 'not-allowed' : 'pointer',
                boxShadow: botonHovered ? THEME_TOKENS.shadows.md : THEME_TOKENS.shadows.sm,
                transform: botonHovered && !isRunning ? 'translateY(-1px)' : 'none',
                transition: `all ${THEME_TOKENS.transitions.fast}`,
              }}
            >
              {isRunning ? '⏳ Procesando transcripción...' : '▶ Iniciar Transcripción'}
            </button>
          </HoverTooltip>

          {isRunning && (
            <HoverTooltip content="Detiene inmediatamente el proceso en segundo plano y cancela la transcripción de forma limpia">
              <button
                onClick={handleCancelarTranscripcion}
                disabled={isCanceling}
                style={{
                  padding: '0.85rem 1.75rem',
                  backgroundColor: isCanceling ? '#991b1b' : '#dc2626',
                  color: '#ffffff',
                  border: '1px solid #b91c1c',
                  borderRadius: THEME_TOKENS.radii.sm,
                  fontSize: '0.95rem',
                  fontFamily: THEME_TOKENS.fonts.sans,
                  fontWeight: 600,
                  letterSpacing: '0.02em',
                  cursor: isCanceling ? 'not-allowed' : 'pointer',
                  boxShadow: THEME_TOKENS.shadows.sm,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: `all ${THEME_TOKENS.transitions.fast}`,
                }}
              >
                🛑 {isCanceling ? 'Cancelando...' : 'Cancelar Transcripción'}
              </button>
            </HoverTooltip>
          )}
        </div>

        {/* Mensaje de estado y barra de progreso */}
        {(isRunning || statusMessage) && (
          <div style={{ marginTop: '1.5rem', backgroundColor: THEME_TOKENS.colors.bgSecondary, padding: '1.25rem', borderRadius: THEME_TOKENS.radii.sm, border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <p style={{ margin: 0, fontSize: '0.825rem', color: THEME_TOKENS.colors.textPrimary, fontWeight: 500 }}>
                {statusMessage}
              </p>
              {isRunning && (
                <button
                  onClick={handleCancelarTranscripcion}
                  disabled={isCanceling}
                  style={{
                    background: '#fef2f2',
                    border: '1px solid #dc2626',
                    color: '#dc2626',
                    borderRadius: THEME_TOKENS.radii.sm,
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: isCanceling ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                  }}
                  title="Detener transcripción de inmediato"
                >
                  🛑 {isCanceling ? 'Cancelando...' : 'Cancelar'}
                </button>
              )}
            </div>
            <ProgressBar progress={progress} />
          </div>
        )}

        {/* Resultados Estilizados como Folios Documentales con Nombres Idénticos al Archivo Fuente */}
        {transcriptionRecords.length > 0 && (
          <div style={{ marginTop: '2.5rem', borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`, paddingTop: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ margin: 0, color: THEME_TOKENS.colors.textPrimary, fontSize: '1.15rem', fontFamily: THEME_TOKENS.fonts.serif, fontWeight: 600 }}>
                Expedientes Generados
              </h3>
              <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted }}>
                Nomenclatura idéntica preservada por archivo cargado
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {transcriptionRecords.map((record, idx) => (
                <div
                  key={idx}
                  className="folio-record-item"
                  style={{
                    backgroundColor: THEME_TOKENS.colors.bgCanvas,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    borderLeft: `3px solid ${THEME_TOKENS.colors.surfaceDark}`,
                    borderRadius: THEME_TOKENS.radii.xs,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <strong style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: '0.9rem', wordBreak: 'break-all' }}>
                      📄 Archivo de origen: {record.sourceFileName}
                    </strong>
                    <span style={{ fontFamily: THEME_TOKENS.fonts.mono, fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted }}>
                      ID Base: [{record.baseName}]
                    </span>
                  </div>

                  {/* Acciones documentales con nombres de salida idénticos */}
                  <div className="folio-actions-container">
                    {record.outputs.map((salida, sIdx) => (
                      <a
                        key={sIdx}
                        href={salida.downloadUrl}
                        download={salida.fileName}
                        title={`Descargar ${salida.fileName}`}
                        style={{
                          color: THEME_TOKENS.colors.textPrimary,
                          textDecoration: 'none',
                          fontSize: '0.825rem',
                          fontWeight: 600,
                          borderBottom: `1px solid ${THEME_TOKENS.colors.accentTaupe}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          wordBreak: 'break-all',
                        }}
                      >
                        <span>↓</span>
                        <span>Descargar <code>{salida.fileName}</code></span>
                        <span style={{ color: THEME_TOKENS.colors.textMuted, fontSize: '0.75rem', fontWeight: 400 }}>
                          ({salida.formatId.toUpperCase()})
                        </span>
                      </a>
                    ))}

                    <button
                      onClick={() => handleAbrirRevisor(record.sourceFileName, record.transcriptionId, record.audioUrl, record.rawSegments)}
                      style={{
                        backgroundColor: THEME_TOKENS.colors.surfaceDark,
                        color: THEME_TOKENS.colors.textOnDark,
                        border: 'none',
                        padding: '0.45rem 0.95rem',
                        borderRadius: THEME_TOKENS.radii.xs,
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        marginTop: '0.25rem',
                      }}
                      title="Identificar personas hablantes, generar hash de integridad y validar para emitir el informe oficial"
                    >
                      <span>👥</span>
                      <span>Revisar y Validar Hablantes</span>
                    </button>

                    {/* Botón de Informe Oficial condicionado a revisión pericial */}
                    {(() => {
                      const itemBD = record.transcriptionId
                        ? TranscriptionDatabase.buscarPorId(record.transcriptionId)
                        : undefined;
                      const estaRevisado = !!itemBD?.revisado;

                      return (
                        <button
                          onClick={() => {
                            if (record.transcriptionId) {
                              handleDescargarInformeDesdePanel(record.transcriptionId, record.sourceFileName);
                            }
                          }}
                          style={{
                            backgroundColor: estaRevisado ? '#1E4620' : 'transparent',
                            color: estaRevisado ? '#ffffff' : THEME_TOKENS.colors.textMuted,
                            border: `1px solid ${estaRevisado ? '#1E4620' : THEME_TOKENS.colors.borderDark}`,
                            padding: '0.45rem 0.95rem',
                            borderRadius: THEME_TOKENS.radii.xs,
                            fontSize: '0.8125rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            marginTop: '0.25rem',
                            transition: `all ${THEME_TOKENS.transitions.fast}`,
                          }}
                          title={
                            estaRevisado
                              ? 'Descargar Informe Oficial de Transcripción y Acta Pericial'
                              : '🔒 Bloqueado: Primero debes revisar los hablantes y marcar como revisada para emitir el informe.'
                          }
                        >
                          <span>{estaRevisado ? '📑' : '🔒'}</span>
                          <span>{estaRevisado ? 'Descargar Informe Oficial' : 'Informe Bloqueado (Sin revisar)'}</span>
                        </button>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sección de Base de Datos de Transcripciones Realizadas */}
      {mostrarHistorialBD && (
        <div
          style={{
            marginTop: '1.5rem',
            backgroundColor: THEME_TOKENS.colors.surfaceBase,
            border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
            borderRadius: THEME_TOKENS.radii.md,
            padding: '1.5rem',
            boxShadow: THEME_TOKENS.shadows.md,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              paddingBottom: '0.65rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.1rem',
                  fontFamily: THEME_TOKENS.fonts.serif,
                  fontWeight: 600,
                  color: THEME_TOKENS.colors.textPrimary,
                }}
              >
                🗄️ Base de Datos de Transcripciones Realizadas
              </h3>
              <span style={{ fontSize: '0.775rem', color: THEME_TOKENS.colors.textMuted }}>
                Registro histórico local persistente de expedientes procesados y sus rutas de guardado
              </span>
            </div>

            <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
              {historialBD.length > 0 && (
                <button
                  onClick={handleLimpiarHistorialBD}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${THEME_TOKENS.colors.stateErrorBorder}`,
                    color: THEME_TOKENS.colors.stateError,
                    padding: '0.25rem 0.65rem',
                    fontSize: '0.75rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Vaciar base de datos
                </button>
              )}
              <button
                onClick={() => setMostrarHistorialBD(false)}
                title="Cerrar vista de base de datos"
                style={{
                  backgroundColor: 'transparent',
                  border: 'none',
                  fontSize: '1.25rem',
                  lineHeight: 1,
                  cursor: 'pointer',
                  color: THEME_TOKENS.colors.textMuted,
                  padding: '0.25rem',
                }}
              >
                &times;
              </button>
            </div>
          </div>

          {historialBD.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: '0.85rem',
                color: THEME_TOKENS.colors.textMuted,
                fontStyle: 'italic',
                textAlign: 'center',
                padding: '2rem 1rem',
              }}
            >
              No hay transcripciones registradas aún en la base de datos local.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {transcripcionesSeleccionadas.size > 0 && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: '#F0F4EC',
                    border: '1px solid #C8D8B8',
                    padding: '0.6rem 1rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    gap: '0.75rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>🔗</span>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#2E4720' }}>
                      {transcripcionesSeleccionadas.size === 2
                        ? '2 transcripciones seleccionadas para combinar'
                        : `${transcripcionesSeleccionadas.size} seleccionada(s) (selecciona exactamente 2 para combinar)`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {transcripcionesSeleccionadas.size === 2 && (
                      <button
                        type="button"
                        onClick={handleCombinarTranscripcionesSeleccionadas}
                        style={{
                          backgroundColor: '#4E6A3B',
                          color: '#FFFFFF',
                          border: 'none',
                          padding: '0.35rem 0.75rem',
                          borderRadius: THEME_TOKENS.radii.xs,
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                      >
                        🧩 Combinar en una sola transcripción (1 clic)
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setTranscripcionesSeleccionadas(new Set())}
                      style={{
                        backgroundColor: 'transparent',
                        color: THEME_TOKENS.colors.textSecondary,
                        border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        padding: '0.3rem 0.6rem',
                        borderRadius: THEME_TOKENS.radii.xs,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                      }}
                    >
                      Desmarcar
                    </button>
                  </div>
                </div>
              )}

              {historialBD.map((item) => (
                <div
                  key={item.id}
                  style={{
                    padding: '0.85rem 1rem',
                    backgroundColor: transcripcionesSeleccionadas.has(item.id) ? '#F5F7F2' : THEME_TOKENS.colors.bgCanvas,
                    border: transcripcionesSeleccionadas.has(item.id) ? '2px solid #5C6B50' : `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    borderLeft: `4px solid ${transcripcionesSeleccionadas.has(item.id) ? '#4E6A3B' : THEME_TOKENS.colors.accentTaupe}`,
                    borderRadius: THEME_TOKENS.radii.xs,
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <label
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            cursor: 'pointer',
                            marginRight: '0.25rem',
                            backgroundColor: transcripcionesSeleccionadas.has(item.id) ? '#E2EBD8' : THEME_TOKENS.colors.surfaceBase,
                            padding: '0.15rem 0.4rem',
                            borderRadius: THEME_TOKENS.radii.xs,
                            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                          }}
                          title="Seleccionar para combinar con otra transcripción"
                        >
                          <input
                            type="checkbox"
                            checked={transcripcionesSeleccionadas.has(item.id)}
                            onChange={() => handleToggleSeleccionTrx(item.id)}
                            style={{ cursor: 'pointer', width: '14px', height: '14px' }}
                          />
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: THEME_TOKENS.colors.textPrimary }}>
                            {transcripcionesSeleccionadas.has(item.id) ? 'Seleccionada' : 'Seleccionar'}
                          </span>
                        </label>
                        <span className={item.fileType === 'video' ? 'file-badge-video' : 'file-badge-audio'}>
                          {item.fileType === 'video' ? '🎬 Video' : '🎵 Audio'}
                        </span>
                        <strong style={{ fontSize: '0.875rem', color: THEME_TOKENS.colors.textPrimary }}>
                          {item.fileName}
                        </strong>
                        <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted }}>
                          ({item.fileSizeFormatted})
                        </span>
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontFamily: THEME_TOKENS.fonts.mono,
                            backgroundColor: THEME_TOKENS.colors.bgSecondary,
                            padding: '0.1rem 0.4rem',
                            borderRadius: THEME_TOKENS.radii.xs,
                            color: THEME_TOKENS.colors.textSecondary,
                          }}
                        >
                          Folio: {item.id}
                        </span>

                        {item.revisado ? (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              backgroundColor: '#EBF7EE',
                              color: '#216334',
                              border: '1px solid #B7EB8F',
                              padding: '0.1rem 0.45rem',
                              borderRadius: THEME_TOKENS.radii.xs,
                              fontWeight: 600,
                            }}
                          >
                            ✓ Revisada
                          </span>
                        ) : (
                          <span
                            style={{
                              fontSize: '0.6875rem',
                              backgroundColor: '#FFF9EB',
                              color: '#8A6100',
                              border: '1px solid #FFE58F',
                              padding: '0.1rem 0.45rem',
                              borderRadius: THEME_TOKENS.radii.xs,
                              fontWeight: 600,
                            }}
                          >
                            ⚠️ Sin revisar
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary, marginTop: '0.3rem' }}>
                        Modelo: <strong>{item.modelUsed}</strong> &middot; Idioma: <strong>{item.language}</strong> &middot; Fecha: {item.date}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: THEME_TOKENS.colors.textMuted,
                          marginTop: '0.2rem',
                          fontFamily: THEME_TOKENS.fonts.mono,
                          wordBreak: 'break-all',
                        }}
                      >
                        Carpeta destino: {item.destinationFolder}
                      </div>

                      {item.speakerNames && Object.keys(item.speakerNames).length > 0 && (
                        <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary, fontWeight: 600 }}>
                            👥 Hablantes identificados:
                          </span>
                          {Object.entries(item.speakerNames).map(([spkId, name]) => (
                            <span
                              key={spkId}
                              style={{
                                fontSize: '0.7rem',
                                backgroundColor: THEME_TOKENS.colors.surfaceBase,
                                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                                padding: '0.1rem 0.45rem',
                                borderRadius: '10px',
                                color: THEME_TOKENS.colors.textPrimary,
                                fontWeight: 500,
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => handleAbrirRevisor(item.fileName, item.id, item.audioBlobUrl, item.rawSegments)}
                        style={{
                          backgroundColor: THEME_TOKENS.colors.surfaceDark,
                          color: THEME_TOKENS.colors.textOnDark,
                          border: 'none',
                          padding: '0.35rem 0.75rem',
                          borderRadius: THEME_TOKENS.radii.xs,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                        title="Identificar personas hablantes, generar hash y validar esta transcripción"
                      >
                        👥 Revisar y Validar Hablantes
                      </button>

                      {/* Botón de Informe Oficial condicionado a revisión pericial */}
                      <button
                        onClick={() => handleDescargarInformeDesdePanel(item.id, item.fileName)}
                        style={{
                          backgroundColor: item.revisado ? '#1E4620' : 'transparent',
                          color: item.revisado ? '#ffffff' : THEME_TOKENS.colors.textMuted,
                          border: `1px solid ${item.revisado ? '#1E4620' : THEME_TOKENS.colors.borderDark}`,
                          padding: '0.35rem 0.75rem',
                          borderRadius: THEME_TOKENS.radii.xs,
                          fontSize: '0.75rem',
                          cursor: 'pointer',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                        }}
                        title={
                          item.revisado
                            ? 'Descargar Informe Oficial de Transcripción y Acta Pericial'
                            : '🔒 Bloqueado: Primero debes revisar y validar los hablantes en esta transcripción.'
                        }
                      >
                        <span>{item.revisado ? '📑' : '🔒'}</span>
                        <span>{item.revisado ? 'Descargar Informe' : 'Informe Bloqueado'}</span>
                      </button>

                      <button
                        onClick={() => handleEliminarRegistroBD(item.id)}
                        title="Eliminar este expediente de la base de datos"
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: THEME_TOKENS.colors.textMuted,
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          padding: '0.2rem 0.4rem',
                        }}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                    {item.outputs.map((out, outIdx) => {
                      const contenido = out.format === 'txt' ? item.textContent : item.srtContent;
                      return (
                        <button
                          key={outIdx}
                          type="button"
                          onClick={() => {
                            if (!contenido) return;
                            const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = out.fileName;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                          style={{
                            fontSize: '0.725rem',
                            padding: '0.2rem 0.55rem',
                            backgroundColor: THEME_TOKENS.colors.surfaceBase,
                            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                            borderRadius: THEME_TOKENS.radii.xs,
                            fontFamily: THEME_TOKENS.fonts.mono,
                            color: THEME_TOKENS.colors.textPrimary,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            fontWeight: 500,
                          }}
                          title={`Descargar archivo ${out.fileName} (Ubicación: ${out.fullPath})`}
                        >
                          <span>↓</span>
                          <span>{out.fileName} ({out.format.toUpperCase()})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ⚠️ Zona de Peligro — Depuración y borrado total de datos */}
      <div
        style={{
          marginTop: '2rem',
          border: `1px solid ${zonaPeligroAbierta ? '#b91c1c' : THEME_TOKENS.colors.stateErrorBorder}`,
          borderRadius: THEME_TOKENS.radii.md,
          overflow: 'hidden',
          transition: 'border-color 0.2s',
        }}
      >
        {/* Cabecera colapsable */}
        <button
          onClick={() => {
            setZonaPeligroAbierta((v) => !v);
            if (zonaPeligroAbierta) handleCancelarPeligro();
          }}
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.75rem 1.1rem',
            backgroundColor: zonaPeligroAbierta ? '#fef2f2' : THEME_TOKENS.colors.surfaceBase,
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>⚠️</span>
            <strong style={{ fontSize: '0.875rem', color: '#b91c1c', fontFamily: THEME_TOKENS.fonts.sans }}>
              Zona de Peligro
            </strong>
            <span style={{ fontSize: '0.775rem', color: THEME_TOKENS.colors.textMuted }}>
              — Acciones irreversibles de depuración
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>
            {zonaPeligroAbierta ? '▲ Cerrar' : '▼ Expandir'}
          </span>
        </button>

        {/* Contenido expandible */}
        {zonaPeligroAbierta && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              borderTop: '1px solid #fecaca',
              padding: '1.25rem 1.1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            {/* Fase 0: Selector de elementos a eliminar y a conservar */}
            {zonaPeligroFase === 0 && (
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #fecaca',
                  borderRadius: THEME_TOKENS.radii.sm,
                  padding: '1.15rem 1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.925rem', color: '#991b1b', display: 'block', marginBottom: '0.25rem' }}>
                    Configuración de Depuración y Limpieza Selectiva
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#7f1d1d', lineHeight: 1.5 }}>
                    Selecciona exactamente qué datos deseas eliminar y cuáles prefieres conservar. Puedes limpiar todo el historial documental pero mantener intactos tus modelos descargados de Whisper.
                  </span>
                </div>

                {/* Lista de Checkboxes configurables */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', paddingTop: '0.5rem', borderTop: '1px solid #fee2e2' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.825rem', color: THEME_TOKENS.colors.textPrimary }}>
                    <input
                      type="checkbox"
                      checked={opcionesPeligro.transcripciones}
                      onChange={(e) => setOpcionesPeligro((prev) => ({ ...prev, transcripciones: e.target.checked }))}
                      style={{ marginTop: '0.15rem', accentColor: '#dc2626' }}
                    />
                    <div>
                      <strong>Historial de transcripciones</strong> ({historialBD.length} registros)
                      <span style={{ display: 'block', fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
                        Elimina todas las actas de texto (.txt) y subtítulos (.srt) almacenadas en la base de datos local.
                      </span>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.825rem', color: THEME_TOKENS.colors.textPrimary }}>
                    <input
                      type="checkbox"
                      checked={opcionesPeligro.expedientes}
                      onChange={(e) => setOpcionesPeligro((prev) => ({ ...prev, expedientes: e.target.checked }))}
                      style={{ marginTop: '0.15rem', accentColor: '#dc2626' }}
                    />
                    <div>
                      <strong>Expedientes de revisión pericial y notas</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
                        Elimina las modificaciones de hablantes, roles asignados, firmas SHA-256 y notas periciales.
                      </span>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.825rem', color: THEME_TOKENS.colors.textPrimary }}>
                    <input
                      type="checkbox"
                      checked={opcionesPeligro.grupos}
                      onChange={(e) => setOpcionesPeligro((prev) => ({ ...prev, grupos: e.target.checked }))}
                      style={{ marginTop: '0.15rem', accentColor: '#dc2626' }}
                    />
                    <div>
                      <strong>Grupos y carpetas de expedientes</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
                        Elimina la organización en carpetas y causas judiciales creadas.
                      </span>
                    </div>
                  </label>

                  {/* Opción de Modelos Whisper: Con badge de advertencia amigable */}
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.825rem', color: THEME_TOKENS.colors.textPrimary, backgroundColor: opcionesPeligro.modelos ? '#fff1f2' : '#f0fdf4', padding: '0.6rem 0.75rem', borderRadius: THEME_TOKENS.radii.sm, border: `1px solid ${opcionesPeligro.modelos ? '#fecdd3' : '#bbf7d0'}` }}>
                    <input
                      type="checkbox"
                      checked={opcionesPeligro.modelos}
                      onChange={(e) => setOpcionesPeligro((prev) => ({ ...prev, modelos: e.target.checked }))}
                      style={{ marginTop: '0.15rem', accentColor: '#dc2626' }}
                    />
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <strong>Modelos OpenAI Whisper</strong>
                        <span style={{
                          backgroundColor: opcionesPeligro.modelos ? '#fee2e2' : '#dcfce7',
                          color: opcionesPeligro.modelos ? '#991b1b' : '#166534',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.45rem',
                          borderRadius: '4px',
                        }}>
                          {opcionesPeligro.modelos ? '⚠️ SE ELIMINARÁ EL REGISTRO' : '🛡️ CONSERVAR MODELOS (Recomendado)'}
                        </span>
                      </div>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: opcionesPeligro.modelos ? '#991b1b' : '#15803d', marginTop: '0.15rem' }}>
                        {opcionesPeligro.modelos
                          ? 'Atención: Se desvincularán los modelos registrados y tendrás que descargarlos o verificarlos nuevamente.'
                          : 'Tus archivos de modelos descargados (.pt / .bin) se mantendrán a salvo en tu equipo para no tener que descargarlos otra vez.'}
                      </span>
                    </div>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.825rem', color: THEME_TOKENS.colors.textPrimary }}>
                    <input
                      type="checkbox"
                      checked={opcionesPeligro.configuracion}
                      onChange={(e) => setOpcionesPeligro((prev) => ({ ...prev, configuracion: e.target.checked }))}
                      style={{ marginTop: '0.15rem', accentColor: '#dc2626' }}
                    />
                    <div>
                      <strong>Restablecer ajustes de usuario a valores por defecto</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
                        Restablece el idioma por defecto, formatos de salida seleccionados y modo de destino de salida.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Resumen dinámico y Botón de acción */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #fee2e2' }}>
                  <div style={{ fontSize: '0.75rem', color: '#7f1d1d' }}>
                    {!opcionesPeligro.modelos && (
                      <span style={{ color: '#166534', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        ✓ Tus modelos Whisper permanecerán guardados y listos para usarse.
                      </span>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleIniciarBorradoTotal}
                      style={{
                        backgroundColor: '#dc2626',
                        color: '#ffffff',
                        border: 'none',
                        padding: '0.55rem 1.25rem',
                        borderRadius: THEME_TOKENS.radii.sm,
                        fontSize: '0.825rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: THEME_TOKENS.shadows.sm,
                      }}
                    >
                      🗑 Proceder con la depuración seleccionada
                    </button>
                    <button
                      onClick={() => setZonaPeligroAbierta(false)}
                      style={{
                        backgroundColor: 'transparent',
                        border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                        color: THEME_TOKENS.colors.textSecondary,
                        padding: '0.55rem 0.95rem',
                        borderRadius: THEME_TOKENS.radii.sm,
                        fontSize: '0.825rem',
                        cursor: 'pointer',
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Fase 1: confirmación final escribiendo el texto */}
            {zonaPeligroFase === 1 && (
              <div
                style={{
                  backgroundColor: '#fff',
                  border: '2px solid #dc2626',
                  borderRadius: THEME_TOKENS.radii.sm,
                  padding: '1.25rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🛑</span>
                  <strong style={{ fontSize: '0.95rem', color: '#991b1b' }}>
                    Confirmación de depuración selectiva
                  </strong>
                </div>

                <div style={{ backgroundColor: '#fef2f2', padding: '0.75rem', borderRadius: THEME_TOKENS.radii.xs, fontSize: '0.785rem', color: '#991b1b', lineHeight: 1.6 }}>
                  <div><strong>Elementos que se eliminarán:</strong></div>
                  <ul style={{ margin: '0.25rem 0 0.5rem 1.25rem', padding: 0 }}>
                    {opcionesPeligro.transcripciones && <li>Historial de transcripciones (.txt y .srt generados)</li>}
                    {opcionesPeligro.expedientes && <li>Expedientes periciales, validaciones y notas</li>}
                    {opcionesPeligro.grupos && <li>Grupos y carpetas organizadas</li>}
                    {opcionesPeligro.modelos && <li>Registro de modelos OpenAI Whisper</li>}
                    {opcionesPeligro.configuracion && <li>Ajustes y preferencias de usuario</li>}
                  </ul>

                  {!opcionesPeligro.modelos && (
                    <div style={{ color: '#166534', fontWeight: 600, borderTop: '1px solid #fecaca', paddingTop: '0.35rem' }}>
                      🛡️ Los modelos OpenAI Whisper se mantendrán guardados en tu equipo sin borrarse.
                    </div>
                  )}
                </div>

                <p style={{ margin: 0, fontSize: '0.8rem', color: '#7f1d1d', lineHeight: 1.5 }}>
                  Para ejecutar la limpieza, escribe <code style={{ backgroundColor: '#fee2e2', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>ELIMINAR</code> en el campo siguiente y haz clic en el botón de confirmación.
                </p>

                <input
                  type="text"
                  value={textoConfirmacionPeligro}
                  onChange={(e) => setTextoConfirmacionPeligro(e.target.value)}
                  placeholder="Escribe: ELIMINAR"
                  autoFocus
                  style={{
                    padding: '0.55rem 0.75rem',
                    border: `1px solid ${textoConfirmacionPeligro.trim().toUpperCase() === 'ELIMINAR' ? '#16a34a' : '#fca5a5'}`,
                    borderRadius: THEME_TOKENS.radii.sm,
                    fontSize: '0.875rem',
                    fontFamily: THEME_TOKENS.fonts.mono,
                    outline: 'none',
                    backgroundColor: textoConfirmacionPeligro.trim().toUpperCase() === 'ELIMINAR' ? '#f0fdf4' : '#fff',
                    transition: 'border-color 0.15s, background-color 0.15s',
                  }}
                />

                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleConfirmarBorradoFinal}
                    disabled={textoConfirmacionPeligro.trim().toUpperCase() !== 'ELIMINAR' && textoConfirmacionPeligro.trim().toUpperCase() !== 'ELIMINAR TODO'}
                    style={{
                      backgroundColor:
                        textoConfirmacionPeligro.trim().toUpperCase() === 'ELIMINAR' || textoConfirmacionPeligro.trim().toUpperCase() === 'ELIMINAR TODO'
                          ? '#dc2626'
                          : '#fca5a5',
                      color: '#ffffff',
                      border: 'none',
                      padding: '0.55rem 1.25rem',
                      borderRadius: THEME_TOKENS.radii.sm,
                      fontSize: '0.825rem',
                      fontWeight: 700,
                      cursor:
                        textoConfirmacionPeligro.trim().toUpperCase() === 'ELIMINAR' || textoConfirmacionPeligro.trim().toUpperCase() === 'ELIMINAR TODO'
                          ? 'pointer'
                          : 'not-allowed',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    🗑 Confirmar y depurar datos seleccionados
                  </button>
                  <button
                    onClick={handleCancelarPeligro}
                    style={{
                      backgroundColor: 'transparent',
                      border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                      color: THEME_TOKENS.colors.textSecondary,
                      padding: '0.55rem 1rem',
                      borderRadius: THEME_TOKENS.radii.sm,
                      fontSize: '0.825rem',
                      cursor: 'pointer',
                    }}
                  >
                    Volver
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Botón de donación discreto al pie */}
      <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'center' }}>
        <DonateButton />
      </div>

      {/* Pop-up emergente automático para modelos no descargados */}
      <ModelNotDownloadedModal
        abierto={modalNoDescargadoAbierto}
        modeloId={model}
        alCerrar={() => setModalNoDescargadoAbierto(false)}
        alAbrirGestor={() => {
          setModalNoDescargadoAbierto(false);
          setModalModelosAbierto(true);
        }}
        alDescargarAhora={() => {
          setModalNoDescargadoAbierto(false);
          setModeloParaDescargaDirecta(model);
          setModalModelosAbierto(true);
        }}
      />

      {/* Modal interactivo de gestión de modelos oficiales y respaldos */}
      <ModelManagerModal
        abierto={modalModelosAbierto}
        modeloAIniciarDescarga={modeloParaDescargaDirecta}
        alCerrar={() => {
          setModalModelosAbierto(false);
          setModeloParaDescargaDirecta(undefined);
          const ultimo = ModelManager.obtenerUltimoModeloUtilizadoODescargado() as ModelKey;
          setModel(ultimo);
          UserSettingsService.guardarConfiguracion({ modelo: ultimo });
          actualizarEstadoModelo(ultimo);
        }}
        alSeleccionarModelo={(modeloId) => {
          setModel(modeloId as ModelKey);
          ModelManager.registrarUltimoModeloUtilizado(modeloId);
          UserSettingsService.guardarConfiguracion({ modelo: modeloId });
          actualizarEstadoModelo(modeloId as ModelKey);
        }}
      />

      {/* Módulo de Revisión y Depuración Pericial (Modificación de Hablantes) */}
      <ReviewerWorkspaceModal
        abierto={modalRevisorAbierto}
        alCerrar={() => setModalRevisorAbierto(false)}
        fileName={archivoParaRevisar}
        transcriptionId={idTranscripcionParaRevisar}
        audioUrl={audioUrlParaRevisar}
        rawSegments={segmentosParaRevisar}
        alGuardarHablantes={(payload) => {
          setHistorialBD(TranscriptionDatabase.obtenerTodas());
          if (payload?.transcriptionId) {
            setTranscriptionRecords((prev) =>
              prev.map((rec) => {
                if (rec.transcriptionId === payload.transcriptionId) {
                  const salidasActualizadas = rec.outputs.map((out) => {
                    let nuevoContenido = '';
                    if (out.formatId === 'txt') nuevoContenido = payload.textContent || '';
                    else if (out.formatId === 'srt') nuevoContenido = payload.srtContent || '';

                    if (nuevoContenido && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
                      try {
                        const blob = new Blob([nuevoContenido], { type: `${out.mimeType};charset=utf-8` });
                        return { ...out, downloadUrl: URL.createObjectURL(blob) };
                      } catch {}
                    }
                    return out;
                  });

                  return {
                    ...rec,
                    textContent: payload.textContent || rec.textContent,
                    srtContent: payload.srtContent || rec.srtContent,
                    rawSegments: payload.rawSegments || rec.rawSegments,
                    outputs: salidasActualizadas,
                  };
                }
                return rec;
              })
            );
          }
        }}
      />

      {/* Modal Didáctico de Ayuda y Manual Interactivo */}
      <HelpModal
        abierto={modalAyudaAbierto}
        alCerrar={() => setModalAyudaAbierto(false)}
        seccionInicial={seccionAyudaInicial}
      />
    </div>
  );
}

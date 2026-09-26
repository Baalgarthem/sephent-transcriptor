import React, { useState, useEffect, useRef, ChangeEvent } from 'react';
import { TranscriptionProgressBar } from '../../../components/TranscriptionProgressBar';
import DonateButton from '../../../components/DonateButton';
import { ModelManagerModal } from '../../../components/ModelManagerModal';
import { ModelNotDownloadedModal } from '../../../components/ModelNotDownloadedModal';
import { WHISPER_MODELS, DEFAULT_MODEL } from '../../../config/whisperConfig';
import { ModelManager } from '../../../services/modelManager';
import { TranscriptionService } from '../../../services/transcription/transcriptionService';
import { TranscriptionRecord } from '../../../services/transcription/types';
import { OutputPathService, ModoDestinoSalida } from '../../../services/transcription/outputPathService';
import { TranscriptionDatabase, StoredTranscription } from '../../../services/database/transcriptionDatabase';
import { TranscriptionGroupService } from '../../../services/database/transcriptionGroupService';
import { UserSettingsService, ConfiguracionUsuario } from '../../../services/userSettingsService';
import { THEME_TOKENS } from '../../../config/themeTokens';
import { ReviewerWorkspaceModal } from '../../../components/reviewer/ReviewerWorkspaceModal';
import { TranscriptionReviewerService } from '../../../services/reviewer/transcriptionReviewerService';
import { ReviewerDatabase } from '../../../services/reviewer/storage/reviewerDatabase';
import { AudioTranscriptionEngine } from '../../../services/transcription/audioTranscriptionEngine';
import { WhisperBridgeService } from '../../../services/transcription/whisperBridgeService';
import { InfoHelpButton, HoverTooltip } from '../../../components/common/Tooltip';
import { HelpModal } from '../../../components/HelpModal';
import { TranscriptionHistorySection } from '../../../components/history/TranscriptionHistorySection';
import { DangerZoneSection } from '../../../components/danger/DangerZoneSection';
import { useService } from '../../../core/di/DIContext';
import { DI_TOKENS } from '../../../core/di/tokens';
import { ITranscriptionEngine, TelemetriaTranscripcion } from '../../../core/contracts/ITranscriptionEngine';
import { IPericialService } from '../../../core/contracts/IPericialService';
import { ITelemetryService } from '../../../core/contracts/ITelemetryService';

type ModelKey = keyof typeof WHISPER_MODELS;
type LanguageOption = 'auto' | 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'zh';

export default function ClassicTranscriptionView(): React.ReactElement {
  // Inyección de Dependencias (Estilo Arturo)
  const transcriptionEngine = useService<ITranscriptionEngine>(DI_TOKENS.TRANSCRIPTION_ENGINE);
  const pericialService = useService<IPericialService>(DI_TOKENS.PERICIAL_SERVICE);
  const telemetryService = useService<ITelemetryService>(DI_TOKENS.TELEMETRY_SERVICE);

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
  const [diarizarHablantes, setDiarizarHablantes] = useState<boolean>(configInicial.diarizarHablantes ?? true);
  const [evitarTruncamiento, setEvitarTruncamiento] = useState<boolean>(configInicial.evitarTruncamiento ?? true);
  const [outputTxt, setOutputTxt] = useState(configInicial.outputTxt);
  const [outputSrt, setOutputSrt] = useState(configInicial.outputSrt);
  const [outputVideo, setOutputVideo] = useState(configInicial.outputVideo);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [transcriptionRecords, setTranscriptionRecords] = useState<TranscriptionRecord[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const cancelacionSolicitada = useRef(false);

  // Telemetría con % exacto y tiempo estimado de completado (ETA)
  const [telemetriaActual, setTelemetriaActual] = useState<{
    porcentaje: number;
    etapaActual: number;
    totalEtapas: number;
    mensaje: string;
    tiempoEstimadoSegundos: number;
    velocidadFactor: number;
    nombreArchivo?: string;
  }>({
    porcentaje: 0,
    etapaActual: 1,
    totalEtapas: configInicial.diarizarHablantes ?? true ? 4 : 3,
    mensaje: '',
    tiempoEstimadoSegundos: 0,
    velocidadFactor: 1.0,
  });

  // Modo de destino de las transcripciones y base de datos persistente
  const [modoDestino, setModoDestino] = useState<ModoDestinoSalida>(configInicial.modoDestino);
  const [historialBD, setHistorialBD] = useState<StoredTranscription[]>(() => TranscriptionDatabase.obtenerTodas());
  const [mostrarHistorialBD, setMostrarHistorialBD] = useState(false);

  // Gestión segura de URLs temporales en memoria para prevenir fugas
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const crearObjectUrlSeguro = (blob: Blob): string => {
    try {
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.add(url);
      return url;
    } catch {
      return '';
    }
  };

  const revocarObjectUrls = () => {
    objectUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    });
    objectUrlsRef.current.clear();
  };

  useEffect(() => {
    return () => {
      revocarObjectUrls();
    };
  }, []);

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
   * Genera y descarga el Dictamen Pericial Oficial utilizando IPericialService inyectado.
   * Aísla las reglas de validación forense y cadena de custodia en su subsistema.
   */
  const handleDescargarInformeDesdePanel = async (trxId: string, nombreArchivo: string) => {
    const itemBD = TranscriptionDatabase.buscarPorId(trxId);
    if (!itemBD) return;

    // Validación pericial mediante contrato de inyección de dependencias
    const validacion = pericialService.validarRequisitosPericiales(
      itemBD.rawSegments || [],
      itemBD.speakerNames || {},
      itemBD.hashSha256
    );

    if (!validacion.puedeEmitirInforme) {
      alert(
        `⚖️ Módulo Pericial: Requisito forense pendiente.\n\n${validacion.motivoBloqueo || 'Debe revisar y validar las identidades de los interlocutores antes de emitir un dictamen pericial oficial.'}\n\nSe abrirá el Módulo Pericial Forense.`
      );
      handleAbrirRevisor(nombreArchivo, trxId);
      return;
    }

    try {
      const informeEmitido = await pericialService.emitirInformePericial(
        trxId,
        itemBD.rawSegments || [],
        itemBD.speakerNames || {},
        {
          perito: 'Perito Forense Oficial',
          notasPericiales: itemBD.notes,
          hashAudio: itemBD.hashSha256,
        }
      );
      const blob = new Blob([informeEmitido.contenidoDocumento], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nombreArchivo.replace(/\.[^/.]+$/, '')}_dictamen_pericial_oficial.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err?.message || 'Error al emitir el dictamen pericial oficial.');
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

  const handleAbrirCarpetaLogs = async () => {
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
      try {
        await (window as any).__TAURI__.invoke('abrir_carpeta_logs');
      } catch (e) {
        alert('No se pudo abrir automáticamente la carpeta de registros.');
      }
    } else {
      alert('La apertura directa de la carpeta de registros está disponible en la versión de escritorio.');
    }
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


  // Callback invocado tras ejecución de limpieza desde DangerZoneSection
  const handleLimpiezaCompleta = async () => {
    setHistorialBD([]);
    setTranscriptionRecords([]);
    setStatusMessage('');
    setProgress(0);
    await ModelManager.sincronizarModelosEnRutaOficial();
    const activo = ModelManager.resolverModeloPorDefecto() as ModelKey;
    setModel(activo);
    actualizarEstadoModelo(activo);
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
    setTelemetriaActual((prev) => ({
      ...prev,
      mensaje: '⏹ Cancelando transcripción...',
    }));
    try {
      await transcriptionEngine.cancelar();
    } catch (err) {
      console.warn('Error al solicitar cancelación de Whisper:', err);
    }
  };

  /**
   * Proceso de Transcripción
   * Aplica principios SOLID, Inyección de Dependencias y telemetría de ETA
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
    const totalEtapasNum = diarizarHablantes ? 4 : 3;
    telemetryService.iniciarSesion(totalEtapasNum, 0);

    const msgInicial = `Etapa 1 de ${totalEtapasNum}: Preparando modelo ${WHISPER_MODELS[model]?.nombreArchivo} desde la memoria local...`;
    setStatusMessage(msgInicial);
    setTelemetriaActual({
      porcentaje: 5,
      etapaActual: 1,
      totalEtapas: totalEtapasNum,
      mensaje: msgInicial,
      tiempoEstimadoSegundos: 0,
      velocidadFactor: 1.0,
      nombreArchivo: files.length > 0 ? files[0].name : undefined,
    });

    await new Promise((r) => setTimeout(r, 400));

    const records: TranscriptionRecord[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelacionSolicitada.current) {
          break;
        }

        const file = files[i];
        const prefijoArchivo = files.length > 1 ? `[Archivo ${i + 1} de ${files.length}] ` : '';
        const msgArchivo = `${prefijoArchivo}Etapa 1 de ${totalEtapasNum}: Iniciando procesamiento de "${file.name}" [Whisper: ${model}]...`;
        setStatusMessage(msgArchivo);
        setTelemetriaActual((prev) => ({
          ...prev,
          nombreArchivo: file.name,
          mensaje: msgArchivo,
        }));

        let audioBlobUrl: string | undefined = undefined;
        try {
          if (file instanceof Blob) {
            audioBlobUrl = crearObjectUrlSeguro(file);
          }
        } catch {
          // Ignorar si no está disponible en el entorno
        }

        // Procesamiento acústico real desacoplado con Inyección de Dependencias
        const resultadoAudio = await transcriptionEngine.transcribirArchivo(file, {
          modelo: model,
          idioma: language,
          diarizar: diarizarHablantes,
          evitarTruncamiento,
          onProgreso: (telemetria: TelemetriaTranscripcion) => {
            if (!cancelacionSolicitada.current) {
              setProgress(telemetria.porcentaje);
              const msgFull = `${prefijoArchivo}${telemetria.mensaje}`;
              setStatusMessage(msgFull);
              setTelemetriaActual({
                porcentaje: telemetria.porcentaje,
                etapaActual: telemetria.etapaActual,
                totalEtapas: telemetria.totalEtapas,
                mensaje: msgFull,
                tiempoEstimadoSegundos: telemetria.tiempoEstimadoSegundos || 0,
                velocidadFactor: telemetria.velocidadFactor || 1.0,
                nombreArchivo: file.name,
              });
            }
          },
        });

        const tieneSegmentos = resultadoAudio.rawSegments && resultadoAudio.rawSegments.length > 0;
        if (cancelacionSolicitada.current && !tieneSegmentos) {
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

        const esParcial = !!resultadoAudio.isPartial;
        const statusFinal: 'completado' | 'parcial' | 'error' = esParcial ? 'parcial' : 'completado';

        const registroBD = TranscriptionDatabase.guardar({
          fileName: file.name,
          fileType: esArchivoVideo(file) ? 'video' : 'audio',
          fileSizeFormatted: formatearTamano(file.size),
          modelUsed: WHISPER_MODELS[model]?.nombreVisible || model,
          language: language === 'auto' ? 'Detección automática' : language.toUpperCase(),
          destinationType: modoDestino,
          destinationFolder: carpetaDestino,
          outputs: salidasBD,
          status: statusFinal,
          isPartial: esParcial,
          wasCancelled: resultadoAudio.wasCancelled,
          errorMotivo: resultadoAudio.errorMotivo,
          logPath: resultadoAudio.logPath,
          rawSegments: resultadoAudio.rawSegments,
          textContent: resultadoAudio.txtContent,
          srtContent: resultadoAudio.srtContent,
          audioBlobUrl: audioBlobUrl,
          speakerNames: resultadoAudio.speakerNames,
        });

        records.push({
          ...record,
          transcriptionId: registroBD.id,
          rawSegments: resultadoAudio.rawSegments,
          textContent: resultadoAudio.txtContent,
          srtContent: resultadoAudio.srtContent,
          audioUrl: audioBlobUrl,
          isPartial: esParcial,
          wasCancelled: resultadoAudio.wasCancelled,
          status: statusFinal,
          errorMotivo: resultadoAudio.errorMotivo,
          logPath: resultadoAudio.logPath,
        });
      }

      if (cancelacionSolicitada.current && records.length === 0) {
        setStatusMessage('⏹ Transcripción cancelada por el usuario antes de procesar segmentos.');
        setProgress(0);
        setTelemetriaActual((prev) => ({
          ...prev,
          porcentaje: 0,
          mensaje: '⏹ Transcripción cancelada por el usuario antes de procesar segmentos.',
          tiempoEstimadoSegundos: 0,
        }));
      } else {
        setTranscriptionRecords(records);
        setHistorialBD(TranscriptionDatabase.obtenerTodas());
        setProgress(100);
        const tieneParciales = records.some((r) => r.isPartial);
        let msgFinal = '';
        if (tieneParciales) {
          const totalSegs = records.reduce((acc, r) => acc + (r.rawSegments?.length || 0), 0);
          msgFinal = `⚠️ Transcripción parcial generada con éxito hasta donde se procesó (${totalSegs} segmentos rescatados). Archivos guardados.`;
        } else {
          msgFinal = records.length === 1
            ? `Transcripción completada con éxito con OpenAI Whisper. Archivos generados listos para descarga.`
            : `${records.length} transcripciones completadas con éxito con OpenAI Whisper. Archivos generados listos para descarga.`;
        }
        setStatusMessage(msgFinal);
        setTelemetriaActual((prev) => ({
          ...prev,
          porcentaje: 100,
          mensaje: msgFinal,
          tiempoEstimadoSegundos: 0,
        }));
      }
    } catch (err: any) {
      if (cancelacionSolicitada.current && records.length === 0) {
        setStatusMessage('⏹ Transcripción cancelada por el usuario.');
        setProgress(0);
        setTelemetriaActual((prev) => ({
          ...prev,
          porcentaje: 0,
          mensaje: '⏹ Transcripción cancelada por el usuario.',
          tiempoEstimadoSegundos: 0,
        }));
      } else {
        console.error('Aviso durante la transcripción:', err);
        const msg = err?.message || String(err);
        setStatusMessage(`❌ Error en la transcripción: ${msg}`);
        setTelemetriaActual((prev) => ({
          ...prev,
          porcentaje: 0,
          mensaje: `❌ Error en la transcripción: ${msg}`,
          tiempoEstimadoSegundos: 0,
        }));

        if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
          try {
            (window as any).__TAURI__.invoke('registrar_error_log', {
              componente: 'ClassicTranscriptionView',
              mensaje: msg,
              contexto: navigator.userAgent,
              rutaAudio: files.length > 0 ? (files[0] as any).path || files[0].name : null,
            });
          } catch {}
        }
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

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleAbrirCarpetaLogs}
            className="top-control-btn"
            title="Abrir carpeta de registros técnicos y diagnósticos del sistema"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              color: '#FFFFFF',
              border: '1px solid rgba(255, 255, 255, 0.35)',
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              padding: '0.5rem 0.85rem',
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
            📋 Logs de errores
          </button>
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
                  'No hay expedientes en el Módulo Pericial Forense.\n\nPara comenzar, realiza una transcripción en la pantalla principal o carga un archivo sonoro.\n\nPuedes consultar el Tutorial interactivo para ver ejemplos guiados de uso.'
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
            title="Accede al subsistema pericial forense para auditar evidencias, identificar interlocutores, validar hashes y emitir dictámenes certificados"
          >
            ⚖️ Módulo Pericial Forense
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

        {/* ── Contenedor Principal — dos columnas ────────────────────────────────── */}
        <div
          className="two-col-config-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '1.5rem',
            marginBottom: '1.75rem',
          }}
        >

          {/* ═══ COLUMNA IZQUIERDA: Pasos 1 y 2 ══════════════════════════════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

            {/* 1. Selección de Archivos */}
            <div>
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

                {/* Cola de archivos */}
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
                            <span className="file-name-truncate" title={file.name}>
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
            </div>{/* /Paso 1 */}

            {/* 2. Selector de Modelo Whisper */}
            <div>
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
            </div>{/* /Paso 2 */}

          </div>{/* /COLUMNA IZQUIERDA */}

          {/* ═══ COLUMNA DERECHA: Pasos 3, 4 (diarización prominente) y 5 ════════ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>

            {/* 3. Selector de Idioma */}
            <div>
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
            </div>{/* /Paso 3 */}

            {/* 4. Diarización — control prominente y alternante (por defecto activo) */}
            <div
              style={{
                backgroundColor: diarizarHablantes ? THEME_TOKENS.colors.stateSuccessBg : THEME_TOKENS.colors.bgSecondary,
                border: `1px solid ${diarizarHablantes ? THEME_TOKENS.colors.stateSuccessBorder : THEME_TOKENS.colors.borderStrong}`,
                borderRadius: THEME_TOKENS.radii.md,
                padding: '1rem 1.1rem',
                transition: `all ${THEME_TOKENS.transitions.fast}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
                <label style={{ fontWeight: 700, color: THEME_TOKENS.colors.textPrimary, fontSize: '0.875rem' }}>
                  4. Identificación de hablantes (Diarización)
                </label>
                <InfoHelpButton
                  tooltip="Activa la separación e identificación de interlocutores (Persona 1, Persona 2, etc.) mediante pyannote.audio y análisis espectral. Si se desactiva, se realiza una transcripción continua de alta velocidad sin segmentar por hablantes."
                />
              </div>
              {/* Toggle switch visual pill */}
              <HoverTooltip content="Activa o desactiva la diarización. Al desactivarla, se genera una transcripción continua sin discriminación de hablantes." maxWidth="350px">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    userSelect: 'none',
                  }}
                >
                  {/* Pista del toggle */}
                  <span style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={diarizarHablantes}
                      onChange={(e) => {
                        setDiarizarHablantes(e.target.checked);
                        UserSettingsService.guardarConfiguracion({ diarizarHablantes: e.target.checked });
                      }}
                      disabled={isRunning}
                      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '12px',
                        backgroundColor: diarizarHablantes ? THEME_TOKENS.colors.stateSuccess : THEME_TOKENS.colors.borderStrong,
                        transition: `background-color ${THEME_TOKENS.transitions.fast}`,
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: '3px',
                        left: diarizarHablantes ? '23px' : '3px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: THEME_TOKENS.colors.surfaceBase,
                        boxShadow: THEME_TOKENS.shadows.sm,
                        transition: `left ${THEME_TOKENS.transitions.fast}`,
                        pointerEvents: 'none',
                      }}
                    />
                  </span>
                  {/* Etiqueta descriptiva */}
                  <span>
                    <strong style={{ fontSize: '0.875rem', color: THEME_TOKENS.colors.textPrimary }}>
                      {diarizarHablantes ? '👥 Diarización activa' : '📄 Transcripción continua'}
                    </strong>
                    <span style={{ display: 'block', fontSize: '0.775rem', color: THEME_TOKENS.colors.textSecondary, marginTop: '0.15rem' }}>
                      {diarizarHablantes
                        ? 'Identificación y separación de interlocutores activada'
                        : 'Sin diarización ni separación de voces'}
                    </span>
                  </span>
                </label>
              </HoverTooltip>
            </div>{/* /Paso 4 */}

            {/* 4.1. Protección Anti-truncamiento para archivos largos */}
            <div
              style={{
                backgroundColor: evitarTruncamiento ? 'rgba(59, 130, 246, 0.08)' : THEME_TOKENS.colors.bgSecondary,
                border: `1px solid ${evitarTruncamiento ? 'rgba(59, 130, 246, 0.35)' : THEME_TOKENS.colors.borderStrong}`,
                borderRadius: THEME_TOKENS.radii.md,
                padding: '0.85rem 1.1rem',
                marginTop: '0.65rem',
                transition: `all ${THEME_TOKENS.transitions.fast}`,
              }}
            >
              <HoverTooltip content="Previene el recorte prematuro y los bucles de silencio en grabaciones de más de 10 minutos o varias horas de duración. Aplica decodificación por ventanas independientes y rescate automático de cola." maxWidth="380px">
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.85rem',
                    cursor: isRunning ? 'not-allowed' : 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <span style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}>
                    <input
                      type="checkbox"
                      checked={evitarTruncamiento}
                      onChange={(e) => {
                        setEvitarTruncamiento(e.target.checked);
                        UserSettingsService.guardarConfiguracion({ evitarTruncamiento: e.target.checked });
                      }}
                      disabled={isRunning}
                      style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: '12px',
                        backgroundColor: evitarTruncamiento ? '#2563eb' : THEME_TOKENS.colors.borderStrong,
                        transition: `background-color ${THEME_TOKENS.transitions.fast}`,
                        cursor: isRunning ? 'not-allowed' : 'pointer',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        top: '3px',
                        left: evitarTruncamiento ? '23px' : '3px',
                        width: '18px',
                        height: '18px',
                        borderRadius: '50%',
                        backgroundColor: THEME_TOKENS.colors.surfaceBase,
                        boxShadow: THEME_TOKENS.shadows.sm,
                        transition: `left ${THEME_TOKENS.transitions.fast}`,
                        pointerEvents: 'none',
                      }}
                    />
                  </span>
                  <span>
                    <strong style={{ fontSize: '0.875rem', color: THEME_TOKENS.colors.textPrimary }}>
                      {evitarTruncamiento ? '🛡️ Protección Anti-truncamiento activa' : '⚪ Modo estándar (sin blindaje de cola)'}
                    </strong>
                    <span style={{ display: 'block', fontSize: '0.775rem', color: THEME_TOKENS.colors.textSecondary, marginTop: '0.15rem' }}>
                      {evitarTruncamiento
                        ? 'Garantiza cobertura íntegra del 100% en grabaciones largas (>10 min y multi-hora)'
                        : 'Decodificación Whisper estándar sin rescate de cola acústica'}
                    </span>
                  </span>
                </label>
              </HoverTooltip>
            </div>

            {/* 5. Opciones de Salida Documental */}
            <div style={{ paddingTop: '0.5rem', borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: '0.85rem 0 0.6rem 0' }}>
                <strong style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: '0.875rem' }}>
                  5. Formatos y actas de salida requeridas:
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
            </div>{/* /Paso 5 */}

          </div>{/* /COLUMNA DERECHA */}

        </div>{/* /Contenedor Principal dos columnas */}

        {/* ── Fila de acción: Iniciar Transcripción + Apoyar Desarrollo ─────────── */}
        <div
          className="btn-primary-container"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}
        >
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
          <DonateButton />
        </div>

        {/* Barra de progreso mejorada con % y tiempo estimado de completado (ETA) */}
        {(isRunning || telemetriaActual.mensaje || statusMessage) && (
          <TranscriptionProgressBar
            porcentaje={isRunning ? telemetriaActual.porcentaje : (statusMessage.startsWith('❌') ? 0 : 100)}
            etapaActual={telemetriaActual.etapaActual}
            totalEtapas={telemetriaActual.totalEtapas}
            mensaje={telemetriaActual.mensaje || statusMessage}
            tiempoEstimadoSegundos={telemetriaActual.tiempoEstimadoSegundos}
            velocidadFactor={telemetriaActual.velocidadFactor}
            nombreArchivo={telemetriaActual.nombreArchivo}
            enCancelar={handleCancelarTranscripcion}
            cancelando={isCanceling}
          />
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
                      title="Abrir Módulo Pericial para auditar cadena de custodia e interlocutores"
                    >
                      <span>⚖️</span>
                      <span>Módulo Pericial Forense</span>
                    </button>

                    {/* Botón de Dictamen Pericial Oficial condicionado a validación forense */}
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
                              ? 'Descargar Dictamen Pericial Oficial Certificado'
                              : 'Emite el dictamen pericial tras validar interlocutores y hash en el Módulo Pericial'
                          }
                        >
                          <span>{estaRevisado ? '📑' : '⚖️'}</span>
                          <span>{estaRevisado ? 'Descargar Dictamen Oficial' : 'Emitir Dictamen Pericial'}</span>
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

      {/* Sección de Base de Datos de Transcripciones Realizadas (Componente Modular SRP) */}
      {mostrarHistorialBD && (
        <TranscriptionHistorySection
          historial={historialBD}
          alCerrar={() => setMostrarHistorialBD(false)}
          alEliminarRegistro={handleEliminarRegistroBD}
          alVaciarHistorial={handleLimpiarHistorialBD}
          alAbrirRevisor={handleAbrirRevisor}
          alDescargarInforme={handleDescargarInformeDesdePanel}
          onActualizarHistorial={() => setHistorialBD(TranscriptionDatabase.obtenerTodas())}
        />
      )}

      {/* ⚠️ Zona de Peligro — Depuración y borrado seguro (Componente Modular SRP) */}
      <DangerZoneSection alEjecutarLimpieza={handleLimpiezaCompleta} />

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

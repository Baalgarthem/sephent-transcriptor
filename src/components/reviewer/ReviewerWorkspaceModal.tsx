import React, { useState, useEffect } from 'react';
import {
  TranscriptionReviewDossier,
  RawTranscriptSegment,
  OpcionesInformePericial,
} from '../../services/reviewer/types';
import { TranscriptionReviewerService } from '../../services/reviewer/transcriptionReviewerService';
import { ReviewerDatabase } from '../../services/reviewer/storage/reviewerDatabase';
import { TranscriptionDatabase, StoredTranscription } from '../../services/database/transcriptionDatabase';
import { TranscriptionGroupService, TranscriptionGroup } from '../../services/database/transcriptionGroupService';
import { SpeakerManagerBar, SpeakerSampleInfo } from './SpeakerManagerBar';
import { SegmentBlockItem } from './SegmentBlockItem';
import { ReviewerGroupSidebar } from './ReviewerGroupSidebar';
import { GroupEditorModal } from './GroupEditorModal';
import { THEME_TOKENS } from '../../config/themeTokens';
import { InfoHelpButton, HoverTooltip } from '../common/Tooltip';

export interface GuardarHablantesPayload {
  speakerNames: Record<string, string>;
  transcriptionId?: string;
  textContent?: string;
  srtContent?: string;
  rawSegments?: any[];
}

interface ReviewerWorkspaceModalProps {
  abierto: boolean;
  alCerrar: () => void;
  dossierInicial?: TranscriptionReviewDossier | null;
  fileName?: string;
  transcriptionId?: string;
  speakerNamesIniciales?: Record<string, string>;
  rawSegments?: RawTranscriptSegment[];
  audioUrl?: string;
  alGuardarHablantes?: (datos: GuardarHablantesPayload) => void;
}

export const ReviewerWorkspaceModal: React.FC<ReviewerWorkspaceModalProps> = ({
  abierto,
  alCerrar,
  dossierInicial,
  fileName = '',
  transcriptionId,
  speakerNamesIniciales,
  rawSegments,
  audioUrl,
  alGuardarHablantes,
}) => {
  const [dossier, setDossier] = useState<TranscriptionReviewDossier | null>(null);
  const [idSeleccionado, setIdSeleccionado] = useState<string | undefined>(transcriptionId);
  const [nombreArchivoActual, setNombreArchivoActual] = useState<string>(fileName);
  const [filtroHablante, setFiltroHablante] = useState<string>('todos');
  const [busquedaTexto, setBusquedaTexto] = useState('');
  const [notificacion, setNotificacion] = useState<{ tipo: 'exito' | 'info'; texto: string } | null>(null);
  const [hayCambiosSinGuardar, setHayCambiosSinGuardar] = useState(false);

  // Estados para selección múltiple y combinación de bloques de diálogo
  const [bloquesSeleccionados, setBloquesSeleccionados] = useState<Set<string>>(new Set());

  // Estados de Grupos / Expedientes
  const [grupos, setGrupos] = useState<TranscriptionGroup[]>([]);
  const [mostrarSidebarGrupos, setMostrarSidebarGrupos] = useState(true);
  const [modalEditorGrupoAbierto, setModalEditorGrupoAbierto] = useState(false);
  const [grupoEnEdicion, setGrupoEnEdicion] = useState<TranscriptionGroup | null>(null);

  // Estados de Notas y Observaciones de la Transcripción Activa
  const [notasTranscripcion, setNotasTranscripcion] = useState('');
  const [mostrarSeccionNotas, setMostrarSeccionNotas] = useState(false);
  const [calculandoHash, setCalculandoHash] = useState(false);
  const [audioUrlActivo, setAudioUrlActivo] = useState<string | undefined>(audioUrl);

  // Estados para modal de personalización del informe pericial
  const [modalConfigInformeAbierto, setModalConfigInformeAbierto] = useState(false);
  const [opcionesInforme, setOpcionesInforme] = useState<OpcionesInformePericial>({
    incluirMetadatos: true,
    incluirCadenaCustodiaHash: true,
    incluirCedulaHablantes: true,
    incluirNotasPericiales: true,
    incluirCuerpoTranscripcion: true,
    incluirCertificacionValidez: true,
  });

  // Lista de transcripciones en base de datos
  const [transcripcionesBD, setTranscripcionesBD] = useState<StoredTranscription[]>([]);

  const mostrarMensaje = (texto: string, tipo: 'exito' | 'info' = 'info') => {
    setNotificacion({ tipo, texto });
    setTimeout(() => setNotificacion(null), 4000);
  };

  // Cargar lista de la base de datos y grupos al abrir
  const recargarDatosBase = () => {
    TranscriptionDatabase.purgarSimulacionesLegacy();
    ReviewerDatabase.purgarSimulacionesLegacy();
    const lista = TranscriptionDatabase.obtenerTodas();
    setTranscripcionesBD(lista);
    const listaGrupos = TranscriptionGroupService.obtenerTodos();
    setGrupos(listaGrupos);
  };

  useEffect(() => {
    if (abierto) {
      recargarDatosBase();
      setAudioUrlActivo(audioUrl);
    }
  }, [abierto, audioUrl]);

  // Inicializar el expediente (dossier) y notas
  const inicializarDossierParaId = (targetId?: string, targetFileName?: string) => {
    TranscriptionDatabase.purgarSimulacionesLegacy();
    ReviewerDatabase.purgarSimulacionesLegacy();

    const file = targetFileName || fileName;
    const reg = targetId ? TranscriptionDatabase.buscarPorId(targetId) : null;

    // Cargar notas y audio de esta transcripción si existen
    if (reg) {
      setNotasTranscripcion(reg.notes || '');
      setAudioUrlActivo(audioUrl || reg.audioBlobUrl);
    } else {
      setNotasTranscripcion('');
      setAudioUrlActivo(audioUrl);
    }

    // Si no hay transcripción real en BD, nunca cargar expedientes huérfanos o simulados
    if (!reg) {
      setDossier(null);
      setHayCambiosSinGuardar(false);
      return;
    }

    // 1. Si hay un expediente ya guardado en ReviewerDatabase para esta transcripción real
    if (targetId) {
      const expedienteGuardado = ReviewerDatabase.buscarPorTranscripcionId(targetId);
      if (expedienteGuardado) {
        if (reg.revisado !== undefined) expedienteGuardado.revisado = reg.revisado;
        if (reg.fechaRevision) expedienteGuardado.fechaRevision = reg.fechaRevision;
        if (reg.hashSha256) expedienteGuardado.hashSha256 = reg.hashSha256;
        if (reg.hashGeneradoEn) expedienteGuardado.hashGeneradoEn = reg.hashGeneradoEn;
        setDossier(expedienteGuardado);
        setHayCambiosSinGuardar(false);
        return;
      }
    }

    // 2. Crear segmentos base (reales si existen en memoria o BD, o vacíos si no hay transcripción aún)
    const segmentos = (rawSegments && rawSegments.length > 0)
      ? rawSegments
      : (reg?.rawSegments && reg.rawSegments.length > 0)
      ? reg.rawSegments
      : [];

    if (segmentos.length === 0) {
      setDossier(null);
      setHayCambiosSinGuardar(false);
      return;
    }

    let nuevo = TranscriptionReviewerService.crearExpediente({
      sourceFileName: file || reg.fileName,
      originalTranscriptionId: targetId,
      rawSegments: segmentos,
    });

    // 3. Aplicar nombres de hablantes si estaban guardados previamente en TranscriptionDatabase
    let nombresAAplicar = speakerNamesIniciales;
    if (!nombresAAplicar && reg?.speakerNames) {
      nombresAAplicar = reg.speakerNames;
    }

    if (nombresAAplicar) {
      Object.entries(nombresAAplicar).forEach(([spkId, nombre]) => {
        nuevo = TranscriptionReviewerService.renombrarHablanteEnDossier(nuevo, spkId, nombre);
      });
    }

    if (reg?.speakerRoles) {
      Object.entries(reg.speakerRoles).forEach(([spkId, rol]) => {
        if (rol) {
          nuevo = TranscriptionReviewerService.asignarRolHablante(nuevo, spkId, rol);
        }
      });
    }

    if (reg) {
      if (reg.revisado !== undefined) nuevo.revisado = reg.revisado;
      if (reg.fechaRevision) nuevo.fechaRevision = reg.fechaRevision;
      if (reg.hashSha256) nuevo.hashSha256 = reg.hashSha256;
      if (reg.hashGeneradoEn) nuevo.hashGeneradoEn = reg.hashGeneradoEn;
    }

    setDossier(nuevo);
    setHayCambiosSinGuardar(false);
  };

  useEffect(() => {
    if (abierto) {
      setIdSeleccionado(transcriptionId);
      setNombreArchivoActual(fileName);
      inicializarDossierParaId(transcriptionId, fileName);
    }
  }, [abierto, transcriptionId, fileName, dossierInicial]);

  if (!abierto) return null;

  // Estado didáctico vacío si no hay ninguna transcripción en BD ni cargada en el sistema
  if ((!fileName && !transcriptionId && transcripcionesBD.length === 0) || !dossier) {
    return (
      <div
        className="modal-overlay"
        onClick={alCerrar}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(28, 25, 23, 0.75)',
          backdropFilter: 'blur(3px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          fontFamily: THEME_TOKENS.fonts.sans,
        }}
      >
        <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: THEME_TOKENS.colors.surfaceBase,
            borderRadius: THEME_TOKENS.radii.md,
            width: '100%',
            maxWidth: '520px',
            padding: '2.5rem 2rem',
            textAlign: 'center',
            boxShadow: THEME_TOKENS.shadows.lg,
            border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
          }}
        >
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              backgroundColor: '#F5F3EF',
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem auto',
              fontSize: '1.75rem',
            }}
          >
            👥
          </div>
          <h3
            style={{
              margin: '0 0 0.65rem 0',
              fontFamily: THEME_TOKENS.fonts.serif,
              color: THEME_TOKENS.colors.textPrimary,
              fontSize: '1.25rem',
            }}
          >
            Sin transcripciones para revisar
          </h3>
          <p
            style={{
              color: THEME_TOKENS.colors.textSecondary,
              fontSize: '0.85rem',
              lineHeight: 1.5,
              margin: '0 0 1.75rem 0',
            }}
          >
            El módulo pericial opera sobre transcripciones reales. Carga y procesa un archivo de audio o video en la pantalla principal para poder auditar hablantes, escuchar muestras acústicas de voz, calcular el Hash SHA-256 de integridad y emitir el Informe Oficial.
          </p>
          <button
            onClick={alCerrar}
            style={{
              backgroundColor: THEME_TOKENS.colors.surfaceDark,
              color: THEME_TOKENS.colors.textOnDark,
              border: 'none',
              padding: '0.65rem 1.5rem',
              borderRadius: THEME_TOKENS.radii.xs,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Entendido, volver a la pantalla principal
          </button>
        </div>
      </div>
    );
  }

  // Manejo de cambio de transcripción activa
  const handleSeleccionarTranscripcion = (nuevoId: string) => {
    setIdSeleccionado(nuevoId);
    const reg = transcripcionesBD.find((t) => t.id === nuevoId);
    const nuevoNombre = reg ? reg.fileName : fileName;
    setNombreArchivoActual(nuevoNombre);
    inicializarDossierParaId(nuevoId, nuevoNombre);
    mostrarMensaje(`Expediente cargado: ${nuevoNombre}`);
  };

  // Persiste en caliente en la base de datos y archivos, y recalcula el Hash SHA-256 automáticamente
  const persistirYHashearEnCaliente = async (dossierBase: TranscriptionReviewDossier) => {
    // 1. Recalcular automáticamente el Hash SHA-256 para esta versión exacta
    const nuevoHash = await TranscriptionReviewerService.generarHashIntegridad(dossierBase);
    const ahora = new Date().toISOString();
    const dossierActualizado: TranscriptionReviewDossier = {
      ...dossierBase,
      hashSha256: nuevoHash,
      hashGeneradoEn: ahora,
      updatedAt: ahora,
    };

    setDossier(dossierActualizado);
    ReviewerDatabase.guardar(dossierActualizado);

    // 2. Sincronizar contenidos (.txt y .srt) con nombres, roles y visualización actualizada
    const mapaHablantes: Record<string, string> = {};
    const mapaRoles: Record<string, string> = {};
    Object.values(dossierActualizado.speakers).forEach((s) => {
      mapaHablantes[s.speakerId] = s.displayName;
      if (s.role) mapaRoles[s.speakerId] = s.role;
    });

    const nuevoTxt = TranscriptionReviewerService.generarTxtDesdeBloques(dossierActualizado);
    const nuevoSrt = TranscriptionReviewerService.generarSrtDesdeBloques(dossierActualizado);

    const nuevosRawSegments = dossierActualizado.reviewedBlocks.map((b, idx) => ({
      id: b.id || `seg_${idx + 1}`,
      speakerId: b.speakerId,
      startTime: b.startTime,
      endTime: b.endTime,
      text: b.reviewedText,
      confidence: 1.0,
    }));

    if (idSeleccionado) {
      TranscriptionDatabase.actualizarContenidoCompleto(idSeleccionado, {
        textContent: nuevoTxt,
        srtContent: nuevoSrt,
        speakerNames: mapaHablantes,
        speakerRoles: mapaRoles,
        speakers: dossierActualizado.speakers,
        rawSegments: nuevosRawSegments,
        hashSha256: nuevoHash,
        hashGeneradoEn: ahora,
      });

      // 3. Sobrescribir archivos en disco si existen salidas configuradas
      const regActual = TranscriptionDatabase.buscarPorId(idSeleccionado);
      if (regActual?.outputs && regActual.outputs.length > 0) {
        const tauri = typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
        for (const out of regActual.outputs) {
          if (!out.fullPath || out.fullPath.startsWith('[')) continue;
          let contenidoAEscribir = '';
          if (out.format === 'txt') contenidoAEscribir = nuevoTxt;
          else if (out.format === 'srt') contenidoAEscribir = nuevoSrt;

          if (contenidoAEscribir && tauri?.invoke) {
            try {
              await tauri.invoke('guardar_archivo_texto', {
                ruta: out.fullPath,
                contenido: contenidoAEscribir,
              });
            } catch (err: any) {
              console.warn(`No se pudo sobrescribir archivo en disco (${out.fullPath}):`, err);
            }
          }
        }
      }

      recargarDatosBase();
    }

    if (alGuardarHablantes) {
      alGuardarHablantes({
        speakerNames: mapaHablantes,
        transcriptionId: idSeleccionado,
        textContent: nuevoTxt,
        srtContent: nuevoSrt,
        rawSegments: nuevosRawSegments,
      });
    }

    setHayCambiosSinGuardar(false);
  };

  // Renombrar hablante con sincronización y hash automático
  const handleRenombrarHablante = async (speakerId: string, nuevoNombre: string) => {
    const actualizado = TranscriptionReviewerService.renombrarHablanteEnDossier(
      dossier,
      speakerId,
      nuevoNombre
    );
    await persistirYHashearEnCaliente(actualizado);
  };

  // Asignar rol procesal con sincronización y hash automático
  const handleAsignarRolHablante = async (speakerId: string, rol: string) => {
    const actualizado = TranscriptionReviewerService.asignarRolHablante(
      dossier,
      speakerId,
      rol
    );
    await persistirYHashearEnCaliente(actualizado);
  };

  // Alternar visualización de rol entre paréntesis junto al nombre
  const handleToggleMostrarRolEnNombre = async (mostrar: boolean) => {
    const actualizado = TranscriptionReviewerService.cambiarPreferenciaMostrarRol(
      dossier,
      mostrar
    );
    await persistirYHashearEnCaliente(actualizado);
  };

  // Agregar una nueva persona/hablante a la transcripción
  const handleAgregarHablante = async () => {
    const actualizado = TranscriptionReviewerService.agregarHablante(dossier);
    await persistirYHashearEnCaliente(actualizado);
    mostrarMensaje('Nueva persona agregada a la transcripción. Asigna su nombre y rol.', 'info');
  };

  const handleToggleSeleccionBloque = (blockId: string) => {
    setBloquesSeleccionados((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) {
        next.delete(blockId);
      } else {
        next.add(blockId);
      }
      return next;
    });
  };

  const handleLimpiarSeleccionBloques = () => {
    setBloquesSeleccionados(new Set());
  };

  const handleUnirBloquesSeleccionados = () => {
    if (!dossier || bloquesSeleccionados.size < 2) return;
    const actualizado = TranscriptionReviewerService.unirBloques(
      dossier,
      Array.from(bloquesSeleccionados)
    );
    setDossier(actualizado);
    setBloquesSeleccionados(new Set());
    setHayCambiosSinGuardar(true);
    mostrarMensaje(`✅ ${bloquesSeleccionados.size} fragmentos combinados exitosamente. Haz clic en "Guardar Nombres y Actualizar Archivos" para persistir los cambios.`, 'exito');
  };

  const handleUnirConSiguiente = (blockId: string) => {
    if (!dossier) return;
    const idx = dossier.reviewedBlocks.findIndex((b) => b.id === blockId);
    if (idx < 0 || idx >= dossier.reviewedBlocks.length - 1) return;
    const siguiente = dossier.reviewedBlocks[idx + 1];

    const actualizado = TranscriptionReviewerService.unirBloques(dossier, [blockId, siguiente.id]);
    setDossier(actualizado);
    setHayCambiosSinGuardar(true);
    mostrarMensaje('✅ Fragmento combinado con el siguiente. Haz clic en "Guardar Nombres y Actualizar Archivos" para persistir los cambios.', 'exito');
  };

  // Guardar cambios en el expediente, en los archivos .txt y .srt de disco y en la base de datos
  const handleGuardarCambios = async () => {
    if (!dossier) return;

    const mapaHablantes: Record<string, string> = {};
    const mapaRoles: Record<string, string> = {};
    Object.values(dossier.speakers).forEach((s) => {
      mapaHablantes[s.speakerId] = s.displayName;
      if (s.role) {
        mapaRoles[s.speakerId] = s.role;
      }
    });

    // 1. Regenerar contenidos actualizados de texto literal y subtítulos con los nombres y bloques combinados
    const nuevoTxt = TranscriptionReviewerService.generarTxtDesdeBloques(dossier);
    const nuevoSrt = TranscriptionReviewerService.generarSrtDesdeBloques(dossier);

    const nuevosRawSegments = dossier.reviewedBlocks.map((b, idx) => ({
      id: b.id || `seg_${idx + 1}`,
      speakerId: b.speakerId,
      startTime: b.startTime,
      endTime: b.endTime,
      text: b.reviewedText,
      confidence: 1.0,
    }));

    if (idSeleccionado) {
      TranscriptionDatabase.actualizarContenidoCompleto(idSeleccionado, {
        textContent: nuevoTxt,
        srtContent: nuevoSrt,
        speakerNames: mapaHablantes,
        speakerRoles: mapaRoles,
        speakers: dossier.speakers,
        rawSegments: nuevosRawSegments,
      });
      TranscriptionDatabase.actualizarNotas(idSeleccionado, notasTranscripcion);

      // 2. Sobrescribir en caliente los archivos generados (.txt y/o .srt) en disco si existen salidas configuradas
      const regActual = TranscriptionDatabase.buscarPorId(idSeleccionado);
      if (regActual?.outputs && regActual.outputs.length > 0) {
        const tauri = typeof window !== 'undefined' ? (window as any).__TAURI__ : null;
        for (const out of regActual.outputs) {
          if (!out.fullPath || out.fullPath.startsWith('[')) continue;
          let contenidoAEscribir = '';
          if (out.format === 'txt') contenidoAEscribir = nuevoTxt;
          else if (out.format === 'srt') contenidoAEscribir = nuevoSrt;

          if (contenidoAEscribir && tauri?.invoke) {
            try {
              await tauri.invoke('guardar_archivo_texto', {
                ruta: out.fullPath,
                contenido: contenidoAEscribir,
              });
            } catch (err: any) {
              console.warn(`No se pudo sobrescribir archivo en disco (${out.fullPath}):`, err);
            }
          }
        }
      }

      recargarDatosBase();
    }

    ReviewerDatabase.guardar(dossier);

    if (alGuardarHablantes) {
      alGuardarHablantes({
        speakerNames: mapaHablantes,
        transcriptionId: idSeleccionado,
        textContent: nuevoTxt,
        srtContent: nuevoSrt,
        rawSegments: nuevosRawSegments,
      });
    }

    setHayCambiosSinGuardar(false);
    mostrarMensaje('✅ ¡Nombres de hablantes y archivos (.txt / .srt) actualizados exitosamente en disco y base de datos!', 'exito');
  };

  // Guardar notas específicas de la transcripción
  const handleGuardarNotas = () => {
    if (idSeleccionado) {
      TranscriptionDatabase.actualizarNotas(idSeleccionado, notasTranscripcion);
      recargarDatosBase();
      mostrarMensaje('📝 Notas periciales guardadas correctamente.', 'exito');
    }
  };

  // Handlers para Grupos
  const handleGuardarGrupo = (datos: Omit<TranscriptionGroup, 'id' | 'createdAt' | 'updatedAt' | 'orden'>) => {
    if (grupoEnEdicion) {
      TranscriptionGroupService.actualizar(grupoEnEdicion.id, datos);
      mostrarMensaje(`Grupo "${datos.nombre}" actualizado.`);
    } else {
      TranscriptionGroupService.crear(datos);
      mostrarMensaje(`Grupo "${datos.nombre}" creado exitosamente.`, 'exito');
    }
    setModalEditorGrupoAbierto(false);
    setGrupoEnEdicion(null);
    recargarDatosBase();
  };

  const handleEliminarGrupo = (id: string) => {
    TranscriptionGroupService.eliminar(id);
    recargarDatosBase();
    mostrarMensaje('Grupo eliminado. Las transcripciones se movieron a la bandeja general.');
  };

  const handleMoverTranscripcionAGrupo = (targetTrxId: string, targetGroupId: string | null) => {
    TranscriptionGroupService.asignarTranscripcion(targetTrxId, targetGroupId);
    recargarDatosBase();
    const trx = transcripcionesBD.find((t) => t.id === targetTrxId);
    const nombreTrx = trx ? trx.fileName : 'Transcripción';

    if (targetGroupId) {
      const g = grupos.find((item) => item.id === targetGroupId);
      mostrarMensaje(`📦 "${nombreTrx}" movida al expediente "${g?.nombre || 'Grupo'}".`, 'exito');
    } else {
      mostrarMensaje(`📥 "${nombreTrx}" movida a la Bandeja General.`);
    }
  };

  // Exportaciones
  const descargarArchivo = (contenido: string, nombreArchivo: string, mime: string) => {
    const blob = new Blob([contenido], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
    mostrarMensaje(`Descarga iniciada: ${nombreArchivo}`, 'exito');
  };

  const exportarTxt = () => {
    const txt = TranscriptionReviewerService.exportarTextoDepurado(dossier);
    const base = (nombreArchivoActual || dossier.sourceFileName).replace(/\.[^/.]+$/, '');
    descargarArchivo(txt, `${base}_hablantes_asignados.txt`, 'text/plain;charset=utf-8');
  };

  const exportarSrt = () => {
    const srt = TranscriptionReviewerService.exportarSrtDepurado(dossier);
    const base = (nombreArchivoActual || dossier.sourceFileName).replace(/\.[^/.]+$/, '');
    descargarArchivo(srt, `${base}_subtitulos_hablantes.srt`, 'text/plain;charset=utf-8');
  };

  const copiarTextoAlPortapapeles = async () => {
    try {
      const txt = TranscriptionReviewerService.exportarTextoDepurado(dossier);
      await navigator.clipboard.writeText(txt);
      mostrarMensaje('📋 Texto de la transcripción copiado al portapapeles.', 'exito');
    } catch {
      mostrarMensaje('No se pudo copiar automáticamente al portapapeles.');
    }
  };

  // Generar firma criptográfica SHA-256 de integridad forense
  const handleGenerarHash = async () => {
    if (!dossier) return;
    setCalculandoHash(true);
    try {
      const hash = await TranscriptionReviewerService.generarHashIntegridad(dossier);
      const ahora = new Date().toISOString();
      const actualizado = {
        ...dossier,
        hashSha256: hash,
        hashGeneradoEn: ahora,
      };
      setDossier(actualizado);
      ReviewerDatabase.guardar(actualizado);

      if (idSeleccionado) {
        TranscriptionDatabase.actualizarHash(idSeleccionado, hash);
        recargarDatosBase();
      }

      mostrarMensaje(`🛡️ Hash SHA-256 generado con éxito: ${hash.substring(0, 16)}...`, 'exito');
    } catch (err) {
      mostrarMensaje('Error al calcular el hash de integridad.');
    } finally {
      setCalculandoHash(false);
    }
  };

  // Alternar el estado de transcripción revisada y validada
  const handleAlternarRevisado = async () => {
    if (!dossier) return;
    const nuevoEstado = !dossier.revisado;
    let hashParaGuardar = dossier.hashSha256;

    // Si se marca como revisada y aún no tiene hash, generarlo automáticamente para agilidad del perito
    if (nuevoEstado && !hashParaGuardar) {
      setCalculandoHash(true);
      try {
        hashParaGuardar = await TranscriptionReviewerService.generarHashIntegridad(dossier);
      } catch (err) {
        console.warn('Error al autogenerar hash:', err);
      } finally {
        setCalculandoHash(false);
      }
    }

    const actualizado = TranscriptionReviewerService.marcarComoRevisado(
      dossier,
      nuevoEstado,
      hashParaGuardar
    );
    setDossier(actualizado);
    ReviewerDatabase.guardar(actualizado);

    if (idSeleccionado) {
      TranscriptionDatabase.marcarComoRevisada(idSeleccionado, nuevoEstado, hashParaGuardar);
      recargarDatosBase();
    }

    if (nuevoEstado) {
      mostrarMensaje('✓ Transcripción marcada como REVISADA y APROBADA. ¡Informe oficial habilitado!', 'exito');
    } else {
      mostrarMensaje('⚠️ Transcripción marcada como pendiente de revisión. El informe oficial ha sido bloqueado.', 'info');
    }
  };

  // Abrir modal de personalización o descargar el Informe Oficial de Transcripción
  const handleGenerarInforme = () => {
    if (!dossier) return;

    // REGLA ESTRICTA 1: No se puede generar informe sin antes haber marcado la transcripción como revisada
    if (!dossier.revisado) {
      mostrarMensaje(
        '🔒 Bloqueo de seguridad: No se puede generar el informe de transcripción sin antes haber marcado la transcripción como revisada en el Paso 3.',
        'info'
      );
      return;
    }

    // REQUISITO MÍNIMO PERICIAL 2: Identificar a todas las personas presentes en el audio/video
    const validacion = TranscriptionReviewerService.validarPersonasIdentificadas(dossier);
    if (!validacion.todasIdentificadas) {
      mostrarMensaje(
        `🔒 Requisito pericial mínimo no cumplido: Debe identificar a todas las personas en el audio o video asignándoles su nombre real antes de generar el informe pericial. Pendientes: ${validacion.pendientes.join(', ')}.`,
        'info'
      );
      return;
    }

    setModalConfigInformeAbierto(true);
  };

  const handleDescargarInformeConOpciones = () => {
    if (!dossier) return;

    try {
      const informe = TranscriptionReviewerService.generarInformeOficialTranscripcion(dossier, {
        ...opcionesInforme,
        notasPericiales: notasTranscripcion,
        nombreGrupo: grupoActual?.nombre,
      });
      const base = (nombreArchivoActual || dossier.sourceFileName).replace(/\.[^/.]+$/, '');
      descargarArchivo(informe, `${base}_informe_oficial_transcripcion.txt`, 'text/plain;charset=utf-8');
      setModalConfigInformeAbierto(false);
      mostrarMensaje('📑 ¡Informe Oficial de Transcripción generado y descargado con éxito!', 'exito');
    } catch (err: any) {
      mostrarMensaje(err?.message || 'Error al generar informe oficial', 'info');
    }
  };

  // Extraer muestra de audio y conteo de intervenciones por cada hablante
  const intervencionesPorHablante: Record<string, number> = {};
  const muestrasPorHablante: Record<string, SpeakerSampleInfo> = {};

  for (const b of dossier.reviewedBlocks) {
    intervencionesPorHablante[b.speakerId] = (intervencionesPorHablante[b.speakerId] || 0) + 1;

    if (!muestrasPorHablante[b.speakerId]) {
      muestrasPorHablante[b.speakerId] = {
        startTime: b.startTime,
        endTime: Math.min(b.endTime, b.startTime + 5),
        sampleText: b.reviewedText,
      };
    }
  }

  // Filtrado de intervenciones
  const bloquesFiltrados = dossier.reviewedBlocks.filter((b) => {
    const coincideHablante = filtroHablante === 'todos' || b.speakerId === filtroHablante;
    const coincideTexto =
      b.reviewedText.toLowerCase().includes(busquedaTexto.toLowerCase()) ||
      b.speakerName.toLowerCase().includes(busquedaTexto.toLowerCase());
    return coincideHablante && coincideTexto;
  });

  // Grupo al que pertenece la transcripción actual
  const transcripcionActualBD = idSeleccionado ? transcripcionesBD.find((t) => t.id === idSeleccionado) : undefined;
  const grupoActual = transcripcionActualBD?.groupId
    ? grupos.find((g) => g.id === transcripcionActualBD.groupId)
    : undefined;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9998,
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: THEME_TOKENS.colors.bgCanvas,
          border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
          borderRadius: THEME_TOKENS.radii.md,
          width: '100%',
          maxWidth: '1280px',
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: THEME_TOKENS.shadows.lg,
          overflow: 'hidden',
        }}
      >
        {/* Cabecera Principal */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.surfaceDark,
            color: THEME_TOKENS.colors.textOnDark,
            padding: '0.85rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              onClick={() => setMostrarSidebarGrupos(!mostrarSidebarGrupos)}
              style={{
                backgroundColor: mostrarSidebarGrupos ? 'rgba(255,255,255,0.2)' : 'transparent',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)',
                padding: '0.35rem 0.65rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.785rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
              title={mostrarSidebarGrupos ? 'Ocultar panel de expedientes' : 'Ver panel de expedientes'}
            >
              <span>📂</span>
              <span>Expedientes ({grupos.length})</span>
            </button>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <span style={{ fontSize: '1.1rem' }}>👥</span>
                <h2
                  style={{
                    margin: 0,
                    fontSize: '1.05rem',
                    fontFamily: THEME_TOKENS.fonts.serif,
                    letterSpacing: '0.02em',
                    color: THEME_TOKENS.colors.textOnDark,
                  }}
                >
                  Revisión e Identificación de Hablantes y Validación Forense
                </h2>
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontSize: '0.725rem',
                  color: THEME_TOKENS.colors.textOnDarkMuted,
                  flexWrap: 'wrap',
                }}
              >
                <span>Archivo: <strong>{nombreArchivoActual}</strong></span>
                {grupoActual && (
                  <>
                    <span>•</span>
                    <span style={{ color: '#E2D9CF' }}>
                      Expediente: <strong>{grupoActual.nombre}</strong>
                    </span>
                  </>
                )}
                {idSeleccionado && (
                  <>
                    <span>•</span>
                    <span>Folio: <code style={{ color: '#fff' }}>{idSeleccionado}</code></span>
                  </>
                )}
                <span>•</span>
                <span style={{ color: dossier.revisado ? '#A3E635' : '#FBBF24' }}>
                  {dossier.revisado ? '✓ Transcripción Revisada y Aprobada' : '⚠️ Pendiente de Revisión'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              onClick={() => {
                if (confirm('¿Deseas purgar absolutamente todos los datos de prueba, expedientes e historiales, restableciendo la aplicación totalmente en datos cero?')) {
                  TranscriptionDatabase.limpiarTodo();
                  ReviewerDatabase.limpiarTodo();
                  TranscriptionGroupService.limpiarTodo();
                  setDossier(null);
                  recargarDatosBase();
                  if (alGuardarHablantes) alGuardarHablantes({ speakerNames: {} });
                  mostrarMensaje('🧹 Todos los datos han sido eliminados. El sistema está en cero.', 'exito');
                }
              }}
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.5)',
                color: '#fca5a5',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.35rem 0.65rem',
                cursor: 'pointer',
              }}
              title="Vaciar expedientes y restablecer a cero"
            >
              🧹 Limpiar todo a cero
            </button>
            <button
              onClick={alCerrar}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '1.5rem',
                cursor: 'pointer',
                lineHeight: 1,
                padding: '0.2rem 0.5rem',
              }}
              title="Cerrar revisor"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Notificación Flotante */}
        {notificacion && (
          <div
            style={{
              backgroundColor: notificacion.tipo === 'exito' ? '#1A4D2E' : THEME_TOKENS.colors.surfaceDark,
              color: '#ffffff',
              padding: '0.5rem 1rem',
              fontSize: '0.8125rem',
              textAlign: 'center',
              fontWeight: 500,
              borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
            }}
          >
            {notificacion.texto}
          </div>
        )}

        {/* Banner Pedagógico y Didáctico de Validación Forense (Flujo en 4 Pasos) */}
        <div
          style={{
            backgroundColor: '#F9F8F6',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Paso 1: Personas Hablantes */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.785rem',
                backgroundColor: '#ffffff',
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                padding: '0.3rem 0.6rem',
                borderRadius: THEME_TOKENS.radii.xs,
              }}
            >
              <HoverTooltip text="Escucha las muestras de voz abajo y asigna los nombres y roles procesales de los hablantes detectados.">
                <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.accentDark }}>1. Hablantes:</span>
              </HoverTooltip>
              <span style={{ color: THEME_TOKENS.colors.textPrimary }}>
                {Object.keys(dossier.speakers).length} personas
              </span>
              <span style={{ color: '#216334', fontSize: '0.75rem', fontWeight: 700 }}>✓</span>
              <InfoHelpButton
                title="Paso 1: Identificación y Roles de Hablantes"
                content="Escucha los segmentos de audio extraídos de la grabación para identificar con certeza a los interlocutores. Asigna sus nombres reales y roles procesales (Fiscal, Juez, Imputado, Testigo, etc.). Estos datos se propagarán de inmediato a todos los segmentos y al informe final."
              />
            </div>

            <span style={{ color: THEME_TOKENS.colors.textMuted, fontSize: '0.85rem' }}>→</span>

            {/* Paso 2: Generar Hash SHA-256 */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                fontSize: '0.785rem',
                backgroundColor: '#ffffff',
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                padding: '0.3rem 0.6rem',
                borderRadius: THEME_TOKENS.radii.xs,
              }}
            >
              <HoverTooltip text="Garantiza la autenticidad y no alteración del documento con una huella criptográfica SHA-256.">
                <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.accentDark }}>2. Integridad:</span>
              </HoverTooltip>
              {dossier.hashSha256 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <HoverTooltip text={`Firma SHA-256 completa: ${dossier.hashSha256}`}>
                    <span
                      style={{
                        fontFamily: THEME_TOKENS.fonts.mono,
                        fontSize: '0.725rem',
                        backgroundColor: '#EBF7EE',
                        color: '#216334',
                        border: '1px solid #B7EB8F',
                        padding: '0.1rem 0.4rem',
                        borderRadius: THEME_TOKENS.radii.xs,
                        fontWeight: 600,
                      }}
                    >
                      SHA-256: {dossier.hashSha256.substring(0, 8)}...
                    </span>
                  </HoverTooltip>
                  <HoverTooltip text="Copiar firma criptográfica al portapapeles">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(dossier.hashSha256 || '');
                        mostrarMensaje('📋 Hash SHA-256 copiado al portapapeles.', 'exito');
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.75rem',
                        padding: '0 0.2rem',
                      }}
                      aria-label="Copiar firma SHA-256 al portapapeles"
                    >
                      📋
                    </button>
                  </HoverTooltip>
                  <HoverTooltip text="Recalcular firma SHA-256 con los últimos cambios realizados">
                    <button
                      onClick={handleGenerarHash}
                      disabled={calculandoHash}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '0.725rem',
                        color: THEME_TOKENS.colors.textMuted,
                        textDecoration: 'underline',
                        padding: '0 0.2rem',
                      }}
                      aria-label="Recalcular hash con los últimos cambios"
                    >
                      🔄
                    </button>
                  </HoverTooltip>
                </div>
              ) : (
                <HoverTooltip text="Calcula la huella criptográfica inmutable SHA-256 del contenido pericial">
                  <button
                    onClick={handleGenerarHash}
                    disabled={calculandoHash}
                    style={{
                      backgroundColor: THEME_TOKENS.colors.surfaceDark,
                      color: THEME_TOKENS.colors.textOnDark,
                      border: 'none',
                      padding: '0.2rem 0.65rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      fontSize: '0.725rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {calculandoHash ? '⏳ Calculando...' : '🛡️ Generar Hash SHA-256'}
                  </button>
                </HoverTooltip>
              )}
              <InfoHelpButton
                title="Paso 2: Cadena de Custodia y Hash SHA-256"
                content="Genera una huella criptográfica SHA-256 inmutable a partir del texto y los hablantes asignados. Si cualquier carácter es manipulado a futuro, el hash no coincidirá, garantizando la inviolabilidad forense requerida en sedes judiciales."
              />
            </div>

            <span style={{ color: THEME_TOKENS.colors.textMuted, fontSize: '0.85rem' }}>→</span>

            {/* Paso 3: Marcar como Revisada */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.785rem' }}>
              <HoverTooltip text="Certificación formal del operador de que el audio y el texto han sido revisados.">
                <span style={{ fontWeight: 700, color: THEME_TOKENS.colors.accentDark }}>3. Validación:</span>
              </HoverTooltip>
              <HoverTooltip
                text={
                  dossier.revisado
                    ? 'Transcripción validada y aprobada. Haz clic si deseas volver a marcarla como pendiente.'
                    : 'Activa esta casilla para marcar la transcripción como formalmente revisada y habilitar la descarga del informe oficial.'
                }
              >
                <button
                  onClick={handleAlternarRevisado}
                  style={{
                    backgroundColor: dossier.revisado ? '#EBF7EE' : '#FFF9EB',
                    border: `1.5px solid ${dossier.revisado ? '#52C41A' : '#FAAD14'}`,
                    color: dossier.revisado ? '#216334' : '#8A6100',
                    padding: '0.25rem 0.75rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    fontSize: '0.785rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{dossier.revisado ? '☑' : '☐'}</span>
                  <span>{dossier.revisado ? 'Revisada y Aprobada' : 'Marcar como Revisada'}</span>
                </button>
              </HoverTooltip>
              <InfoHelpButton
                title="Paso 3: Validación y Certificación Pericial"
                content="Un informe oficial de transcripción pericial no puede expedirse legalmente sin que un revisor humano certifique haber escuchado el audio y validado la fidelidad del texto. Al marcar este paso, se desbloquea el botón de descarga del informe oficial."
              />
            </div>
          </div>

          {/* Paso 4: Botón de Informe Oficial de Transcripción Condicionado */}
          <div>
            {(() => {
              const valPersonas = TranscriptionReviewerService.validarPersonasIdentificadas(dossier);
              const puedeDescargar = dossier.revisado && valPersonas.todasIdentificadas;

              let tooltipText = 'Configurar y descargar el Dictamen e Informe Oficial Pericial';
              if (!dossier.revisado) {
                tooltipText = '🔒 Bloqueado: No se puede generar el informe sin antes haber marcado la transcripción como revisada en el Paso 3.';
              } else if (!valPersonas.todasIdentificadas) {
                tooltipText = `🔒 Requisito pericial mínimo pendiente: Identifique a todas las personas asignándoles su nombre real. Pendientes: ${valPersonas.pendientes.join(', ')}`;
              }

              let botonTexto = 'Descargar Informe de Transcripción';
              if (!dossier.revisado) {
                botonTexto = 'Informe Bloqueado (Sin revisar)';
              } else if (!valPersonas.todasIdentificadas) {
                botonTexto = `Informe Bloqueado (${valPersonas.identificadas}/${valPersonas.total} personas)`;
              }

              return (
                <HoverTooltip text={tooltipText}>
                  <button
                    onClick={handleGenerarInforme}
                    style={{
                      backgroundColor: puedeDescargar ? '#1E4620' : '#D1D5DB',
                      color: puedeDescargar ? '#ffffff' : '#4B5563',
                      border: 'none',
                      padding: '0.45rem 1.15rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      cursor: puedeDescargar ? 'pointer' : 'not-allowed',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.45rem',
                      boxShadow: puedeDescargar ? THEME_TOKENS.shadows.sm : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{puedeDescargar ? '📑' : '🔒'}</span>
                    <span>{botonTexto}</span>
                  </button>
                </HoverTooltip>
              );
            })()}
          </div>
        </div>

        {/* Barra Secundaria de Utilidades: Guardar Cambios, Notas y Formatos Rápidos */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.surfaceBase,
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            padding: '0.5rem 1.25rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.65rem',
          }}
        >
          {/* Indicador de Estado y Botón de Notas */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            {hayCambiosSinGuardar ? (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: '#8A6100',
                  backgroundColor: '#FFF9EB',
                  border: '1px solid #FFE58F',
                  padding: '0.2rem 0.55rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  fontWeight: 600,
                }}
              >
                ⚠️ Cambios de nombres sin guardar
              </span>
            ) : (
              <span
                style={{
                  fontSize: '0.75rem',
                  color: '#216334',
                  backgroundColor: '#EBF7EE',
                  border: '1px solid #B7EB8F',
                  padding: '0.2rem 0.55rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  fontWeight: 600,
                }}
              >
                ✓ Hablantes sincronizados en base de datos
              </span>
            )}

            <button
              onClick={() => setMostrarSeccionNotas(!mostrarSeccionNotas)}
              style={{
                backgroundColor: mostrarSeccionNotas ? THEME_TOKENS.colors.surfaceDarkSubtle : 'transparent',
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                color: THEME_TOKENS.colors.textPrimary,
                padding: '0.35rem 0.65rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
              title="Abrir o cerrar el cuaderno de notas periciales de esta transcripción"
            >
              <span>📝</span>
              <span>Notas de la Transcripción {notasTranscripcion ? '•' : ''}</span>
            </button>
          </div>

          {/* Botones de Guardar y Formatos */}
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={handleGuardarCambios}
              style={{
                backgroundColor: '#1E4620',
                color: '#ffffff',
                border: 'none',
                padding: '0.4rem 1rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.785rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                boxShadow: THEME_TOKENS.shadows.sm,
              }}
              title="Guardar los nombres de los hablantes y actualizar automáticamente los archivos .txt y .srt generados"
            >
              💾 Guardar Nombres y Actualizar Archivos
            </button>

            <button
              onClick={exportarTxt}
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceBase,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                color: THEME_TOKENS.colors.textPrimary,
                padding: '0.4rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Descargar archivo de texto limpio"
            >
              📄 TXT
            </button>

            <button
              onClick={exportarSrt}
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceBase,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                color: THEME_TOKENS.colors.textPrimary,
                padding: '0.4rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Descargar subtítulos SRT"
            >
              ⏱️ SRT
            </button>

            <button
              onClick={copiarTextoAlPortapapeles}
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceBase,
                border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                color: THEME_TOKENS.colors.textPrimary,
                padding: '0.4rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
              title="Copiar el texto completo de la transcripción"
            >
              📋 Copiar
            </button>
          </div>
        </div>

        {/* Contenedor Principal en Dos Columnas: Sidebar Drag & Drop + Área de Trabajo */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Sidebar de Grupos y Expedientes (con Drag and Drop) */}
          {mostrarSidebarGrupos && (
            <ReviewerGroupSidebar
              grupos={grupos}
              transcripciones={transcripcionesBD}
              idTranscripcionActiva={idSeleccionado}
              alSeleccionarTranscripcion={handleSeleccionarTranscripcion}
              alMoverTranscripcionAGrupo={handleMoverTranscripcionAGrupo}
              alAbrirCrearGrupo={() => {
                setGrupoEnEdicion(null);
                setModalEditorGrupoAbierto(true);
              }}
              alAbrirEditarGrupo={(g) => {
                setGrupoEnEdicion(g);
                setModalEditorGrupoAbierto(true);
              }}
              alEliminarGrupo={handleEliminarGrupo}
            />
          )}

          {/* Área de Trabajo Principal */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
            {/* Cuaderno de Notas y Observaciones Periciales de la Transcripción */}
            {mostrarSeccionNotas && (
              <div
                style={{
                  backgroundColor: '#FFFDF9',
                  border: `1px solid ${THEME_TOKENS.colors.accentTaupe}`,
                  borderRadius: THEME_TOKENS.radii.sm,
                  padding: '1rem',
                  marginBottom: '1.25rem',
                  boxShadow: THEME_TOKENS.shadows.sm,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>📝</span>
                    <strong style={{ fontSize: '0.85rem', color: THEME_TOKENS.colors.textPrimary, fontFamily: THEME_TOKENS.fonts.serif }}>
                      Cuaderno de Notas Periciales ({nombreArchivoActual})
                    </strong>
                  </div>
                  <button
                    onClick={handleGuardarNotas}
                    style={{
                      backgroundColor: THEME_TOKENS.colors.surfaceDark,
                      color: '#fff',
                      border: 'none',
                      padding: '0.3rem 0.75rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    💾 Guardar Notas
                  </button>
                </div>
                <textarea
                  rows={3}
                  placeholder="Escribe aquí observaciones periciales, sellos de tiempo relevantes, aclaraciones fonéticas o notas de la audiencia..."
                  value={notasTranscripcion}
                  onChange={(e) => setNotasTranscripcion(e.target.value)}
                  onBlur={handleGuardarNotas}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.65rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                    fontSize: '0.8125rem',
                    fontFamily: THEME_TOKENS.fonts.sans,
                    outline: 'none',
                    resize: 'vertical',
                    backgroundColor: '#ffffff',
                  }}
                />
              </div>
            )}

            {/* Fichas Didácticas de Hablantes */}
            <SpeakerManagerBar
              speakers={dossier.speakers}
              intervencionesPorHablante={intervencionesPorHablante}
              muestrasPorHablante={muestrasPorHablante}
              audioUrl={audioUrlActivo}
              onRenombrarHablante={handleRenombrarHablante}
              onAsignarRol={handleAsignarRolHablante}
              onAgregarHablante={handleAgregarHablante}
              mostrarRolEnNombre={dossier.mostrarRolEnNombre || false}
              onToggleMostrarRolEnNombre={handleToggleMostrarRolEnNombre}
            />

            {/* Barra de Filtro y Búsqueda en los Diálogos */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginTop: '1.5rem',
                marginBottom: '1rem',
                paddingBottom: '0.75rem',
                borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.9rem' }}>💬</span>
                  <strong style={{ fontSize: '0.9rem', color: THEME_TOKENS.colors.textPrimary }}>
                    Diálogos de transcripción ({bloquesFiltrados.length} {bloquesFiltrados.length === 1 ? 'intervención' : 'intervenciones'}):
                  </strong>
                </div>

                <input
                  type="text"
                  placeholder="Buscar en los diálogos de transcripción..."
                  value={busquedaTexto}
                  onChange={(e) => setBusquedaTexto(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                    fontSize: '0.8125rem',
                    flex: 1,
                    minWidth: '200px',
                    maxWidth: '320px',
                    outline: 'none',
                    backgroundColor: THEME_TOKENS.colors.surfaceBase,
                  }}
                />

                <select
                  value={filtroHablante}
                  onChange={(e) => setFiltroHablante(e.target.value)}
                  style={{
                    padding: '0.45rem 0.75rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                    fontSize: '0.8125rem',
                    backgroundColor: THEME_TOKENS.colors.surfaceBase,
                    outline: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <option value="todos">Todos los hablantes</option>
                  {Object.values(dossier.speakers).map((s) => (
                    <option key={s.speakerId} value={s.speakerId}>
                      {s.displayName} ({s.speakerId})
                    </option>
                  ))}
                </select>
              </div>

              <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
                Visualización con nombres y colores periciales en tiempo real
              </span>
            </div>

            {/* Barra de acción contextual para bloques seleccionados */}
            {bloquesSeleccionados.size > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#F3EFEA',
                  border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
                  borderRadius: THEME_TOKENS.radii.xs,
                  padding: '0.65rem 1rem',
                  marginBottom: '1rem',
                  boxShadow: THEME_TOKENS.shadows.sm,
                  flexWrap: 'wrap',
                  gap: '0.6rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1.1rem' }}>🔗</span>
                  <strong style={{ fontSize: '0.85rem', color: THEME_TOKENS.colors.textPrimary }}>
                    {bloquesSeleccionados.size} fragmentos de voz seleccionados
                  </strong>
                  <span style={{ fontSize: '0.78rem', color: THEME_TOKENS.colors.textSecondary }}>
                    (Se unirán en un solo bloque con su tiempo continuo)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={handleUnirBloquesSeleccionados}
                    style={{
                      backgroundColor: THEME_TOKENS.colors.surfaceDark,
                      color: THEME_TOKENS.colors.textOnDark,
                      border: 'none',
                      borderRadius: THEME_TOKENS.radii.xs,
                      padding: '0.4rem 0.9rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <span>🔗</span>
                    <span>Combinar seleccionados</span>
                  </button>
                  <button
                    onClick={handleLimpiarSeleccionBloques}
                    style={{
                      backgroundColor: 'transparent',
                      color: THEME_TOKENS.colors.textSecondary,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      borderRadius: THEME_TOKENS.radii.xs,
                      padding: '0.4rem 0.75rem',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    Desmarcar
                  </button>
                </div>
              </div>
            )}

            {/* Lista de Diálogos Secuenciales */}
            {bloquesFiltrados.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '3rem 2rem',
                  color: THEME_TOKENS.colors.textSecondary,
                  backgroundColor: THEME_TOKENS.colors.surfaceBase,
                  borderRadius: THEME_TOKENS.radii.sm,
                  border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                }}
              >
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>💬</div>
                <strong style={{ display: 'block', color: THEME_TOKENS.colors.textPrimary, marginBottom: '0.25rem' }}>
                  Sin diálogos o intervenciones disponibles
                </strong>
                <span style={{ fontSize: '0.8rem', color: THEME_TOKENS.colors.textMuted }}>
                  {busquedaTexto || filtroHablante !== 'todos'
                    ? 'No se encontraron intervenciones con los filtros actuales de búsqueda o hablante.'
                    : 'Esta transcripción aún no contiene intervenciones habladas registradas por Whisper.'}
                </span>
              </div>
            ) : (
              <div>
                {bloquesFiltrados.map((block, idx) => (
                  <SegmentBlockItem
                    key={block.id}
                    block={block}
                    speaker={dossier.speakers[block.speakerId]}
                    audioUrl={audioUrlActivo}
                    seleccionado={bloquesSeleccionados.has(block.id)}
                    onToggleSeleccion={handleToggleSeleccionBloque}
                    onUnirConSiguiente={handleUnirConSiguiente}
                    esUltimo={idx === bloquesFiltrados.length - 1}
                    onAceptarSugerencia={() => {}}
                    onRechazarSugerencia={() => {}}
                    onEditarCorreccion={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal de Creación / Edición de Grupos */}
        <GroupEditorModal
          abierto={modalEditorGrupoAbierto}
          grupoParaEditar={grupoEnEdicion}
          alCerrar={() => {
            setModalEditorGrupoAbierto(false);
            setGrupoEnEdicion(null);
          }}
          alGuardar={handleGuardarGrupo}
        />

        {/* Modal de Personalización de Opciones del Informe Pericial */}
        {modalConfigInformeAbierto && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000,
              padding: '1rem',
            }}
          >
            <div
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceBase,
                border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
                borderRadius: THEME_TOKENS.radii.sm,
                width: '100%',
                maxWidth: '620px',
                padding: '1.5rem',
                boxShadow: THEME_TOKENS.shadows.lg,
                display: 'flex',
                flexDirection: 'column',
                gap: '1.25rem',
              }}
            >
              {/* Encabezado */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  paddingBottom: '0.75rem',
                }}
              >
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: '1.1rem',
                      color: THEME_TOKENS.colors.textPrimary,
                      fontFamily: THEME_TOKENS.fonts.serif,
                    }}
                  >
                    📑 Personalizar Informe Oficial de Transcripción
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Selecciona libremente qué bloques y metadatos periciales deseas incluir
                  </span>
                </div>
                <button
                  onClick={() => setModalConfigInformeAbierto(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.2rem',
                    cursor: 'pointer',
                    color: THEME_TOKENS.colors.textSecondary,
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Lista de Checkboxes didácticos */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  maxHeight: '55vh',
                  overflowY: 'auto',
                }}
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    padding: '0.5rem 0.65rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    backgroundColor: '#ffffff',
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={opcionesInforme.incluirMetadatos ?? true}
                    onChange={(e) =>
                      setOpcionesInforme({ ...opcionesInforme, incluirMetadatos: e.target.checked })
                    }
                    style={{ marginTop: '0.2rem', accentColor: THEME_TOKENS.colors.accentNavy }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.825rem', display: 'block', color: THEME_TOKENS.colors.textPrimary }}>
                      1. Información del Expediente y Archivo Fuente
                    </strong>
                    <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary }}>
                      Folio, nombre de archivo, modelo Whisper, idioma detectado, fecha y estado de validación.
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    padding: '0.5rem 0.65rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    backgroundColor: '#ffffff',
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={opcionesInforme.incluirCadenaCustodiaHash ?? true}
                    onChange={(e) =>
                      setOpcionesInforme({ ...opcionesInforme, incluirCadenaCustodiaHash: e.target.checked })
                    }
                    style={{ marginTop: '0.2rem', accentColor: THEME_TOKENS.colors.accentNavy }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.825rem', display: 'block', color: THEME_TOKENS.colors.textPrimary }}>
                      2. Cadena de Custodia e Integridad Forense (Hash SHA-256)
                    </strong>
                    <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary }}>
                      Firma criptográfica inmutable calculada para esta precisa versión de la transcripción.
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    padding: '0.5rem 0.65rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    backgroundColor: '#ffffff',
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={opcionesInforme.incluirCedulaHablantes ?? true}
                    onChange={(e) =>
                      setOpcionesInforme({ ...opcionesInforme, incluirCedulaHablantes: e.target.checked })
                    }
                    style={{ marginTop: '0.2rem', accentColor: THEME_TOKENS.colors.accentNavy }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.825rem', display: 'block', color: THEME_TOKENS.colors.textPrimary }}>
                      3. Cédula de Personas Hablantes Identificadas
                    </strong>
                    <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary }}>
                      Tabla con IDs técnicos, nombres asignados, roles o cargos procesales e intervenciones.
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    padding: '0.5rem 0.65rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    backgroundColor: '#ffffff',
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={opcionesInforme.incluirNotasPericiales ?? true}
                    onChange={(e) =>
                      setOpcionesInforme({ ...opcionesInforme, incluirNotasPericiales: e.target.checked })
                    }
                    style={{ marginTop: '0.2rem', accentColor: THEME_TOKENS.colors.accentNavy }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.825rem', display: 'block', color: THEME_TOKENS.colors.textPrimary }}>
                      4. Cuaderno de Notas y Observaciones Periciales
                    </strong>
                    <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary }}>
                      Observaciones fonéticas, sellos de tiempo relevantes y notas introducidas en el cuaderno.
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    padding: '0.5rem 0.65rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    backgroundColor: '#ffffff',
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={opcionesInforme.incluirCuerpoTranscripcion ?? true}
                    onChange={(e) =>
                      setOpcionesInforme({ ...opcionesInforme, incluirCuerpoTranscripcion: e.target.checked })
                    }
                    style={{ marginTop: '0.2rem', accentColor: THEME_TOKENS.colors.accentNavy }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.825rem', display: 'block', color: THEME_TOKENS.colors.textPrimary }}>
                      5. Cuerpo Íntegro de la Transcripción Depurada
                    </strong>
                    <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary }}>
                      Texto íntegro ordenado cronológicamente con sellos [hh:mm:ss - hh:mm:ss] e interlocutores.
                    </span>
                  </div>
                </label>

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.65rem',
                    cursor: 'pointer',
                    padding: '0.5rem 0.65rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    backgroundColor: '#ffffff',
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={opcionesInforme.incluirCertificacionValidez ?? true}
                    onChange={(e) =>
                      setOpcionesInforme({ ...opcionesInforme, incluirCertificacionValidez: e.target.checked })
                    }
                    style={{ marginTop: '0.2rem', accentColor: THEME_TOKENS.colors.accentNavy }}
                  />
                  <div>
                    <strong style={{ fontSize: '0.825rem', display: 'block', color: THEME_TOKENS.colors.textPrimary }}>
                      6. Certificación Formal de Validez Pericial
                    </strong>
                    <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary }}>
                      Cláusula formal de cotejo acústico y correspondencia probatoria fiel con el audio original.
                    </span>
                  </div>
                </label>
              </div>

              {/* Botones de acción */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '0.75rem',
                  borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                  paddingTop: '0.75rem',
                }}
              >
                <button
                  onClick={() => setModalConfigInformeAbierto(false)}
                  style={{
                    padding: '0.45rem 1rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    backgroundColor: THEME_TOKENS.colors.surfaceBase,
                    color: THEME_TOKENS.colors.textSecondary,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDescargarInformeConOpciones}
                  style={{
                    padding: '0.45rem 1.25rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    border: 'none',
                    backgroundColor: '#1E4620',
                    color: '#ffffff',
                    fontSize: '0.8125rem',
                    cursor: 'pointer',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    boxShadow: THEME_TOKENS.shadows.sm,
                  }}
                >
                  <span>📑</span>
                  <span>Generar y Descargar Informe</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

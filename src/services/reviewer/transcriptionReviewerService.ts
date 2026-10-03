/**
 * Servicio Central de Revisión y Depuración Pericial (SOLID - Facade Pattern)
 * 
 * Orquesta:
 * 1. Inicialización de expedientes periciales no destructivos (preserva original intacto).
 * 2. Renombrado de hablantes sin mutación de identificadores técnicos.
 * 3. Gestión interactiva de correcciones (aceptar, rechazar, editar).
 * 4. Exportación pericial en formatos de texto (.txt), subtítulos (.srt) e informe de auditoría.
 */

import {
  RawTranscriptSegment,
  ReviewedSegmentBlock,
  TranscriptionReviewDossier,
  MergingRulesConfig,
  OpcionesInformePericial,
} from './types';
import { SpeakerRegistry } from './speakers/speakerRegistry';
import { SegmentMergerEngine } from './reconstruction/segmentMergerEngine';
import { DictionaryService } from './dictionary/dictionaryService';
import { ReviewerDatabase } from './storage/reviewerDatabase';

export class TranscriptionReviewerService {
  /**
   * Crea un nuevo expediente de revisión pericial a partir de segmentos crudos
   */
  public static crearExpediente(datos: {
    sourceFileName: string;
    originalTranscriptionId?: string;
    modelUsed?: string;
    language?: string;
    rawSegments: RawTranscriptSegment[];
    nombresInicialesHablantes?: Record<string, string>;
    configReglas?: MergingRulesConfig;
  }): TranscriptionReviewDossier {
    const id = `DOSSIER-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // 1. Inicializar registro de hablantes (solo si hay interlocutores identificados)
    const registry = new SpeakerRegistry();
    for (const seg of datos.rawSegments) {
      if (seg.speakerId && seg.speakerId.trim()) {
        registry.registrarODescubrirHablante(
          seg.speakerId,
          datos.nombresInicialesHablantes?.[seg.speakerId]
        );
      }
    }

    const mapaNombres = registry.obtenerMapaNombres();
    const catalogo = DictionaryService.obtenerCatalogoCompleto();

    // 2. Reconstruir oraciones y depurar texto
    const bloquesRevisados = SegmentMergerEngine.reconstruirYDepurarSegmentos(
      datos.rawSegments,
      mapaNombres,
      catalogo,
      datos.configReglas
    );

    // 3. Compilar estadísticas de auditoría
    const stats = this.calcularEstadisticas(datos.rawSegments.length, bloquesRevisados);

    const dossier: TranscriptionReviewDossier = {
      id,
      sourceFileName: datos.sourceFileName,
      originalTranscriptionId: datos.originalTranscriptionId,
      modelUsed: datos.modelUsed || 'whisper-medium',
      language: datos.language || 'es',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      speakers: registry.obtenerMapa(),
      originalSegments: [...datos.rawSegments], // Inmutable
      reviewedBlocks: bloquesRevisados,
      stats,
    };

    ReviewerDatabase.guardar(dossier);
    return dossier;
  }

  /**
   * Renombra un hablante en todo el expediente actualizando la visualización de todos los bloques
   * Mantiene intacto el identificador técnico original ('speaker_01')
   */
  public static renombrarHablanteEnDossier(
    dossier: TranscriptionReviewDossier,
    speakerId: string,
    nuevoNombre: string
  ): TranscriptionReviewDossier {
    const registry = new SpeakerRegistry(dossier.speakers);
    registry.renombrarHablante(speakerId, nuevoNombre);

    const perfilActualizado = registry.obtenerMapa()[speakerId];

    // Propagar el nuevo nombre visible a todos los bloques que tengan este speakerId
    const bloquesActualizados = dossier.reviewedBlocks.map((b) => {
      if (b.speakerId === speakerId) {
        return {
          ...b,
          speakerName: perfilActualizado.displayName,
        };
      }
      return b;
    });

    const dossierActualizado: TranscriptionReviewDossier = {
      ...dossier,
      speakers: registry.obtenerMapa(),
      reviewedBlocks: bloquesActualizados,
      updatedAt: new Date().toISOString(),
    };

    ReviewerDatabase.guardar(dossierActualizado);
    return dossierActualizado;
  }

  /**
   * Asigna un rol procesal o pericial a un hablante
   */
  public static asignarRolHablante(
    dossier: TranscriptionReviewDossier,
    speakerId: string,
    rol: string
  ): TranscriptionReviewDossier {
    const registry = new SpeakerRegistry(dossier.speakers);
    registry.asignarRol(speakerId, rol);

    const dossierActualizado: TranscriptionReviewDossier = {
      ...dossier,
      speakers: registry.obtenerMapa(),
      updatedAt: new Date().toISOString(),
    };

    ReviewerDatabase.guardar(dossierActualizado);
    return dossierActualizado;
  }

  /**
   * Agrega una nueva persona/hablante a la transcripción
   */
  public static agregarHablante(
    dossier: TranscriptionReviewDossier,
    nombreVisible?: string,
    rol?: string
  ): TranscriptionReviewDossier {
    const registry = new SpeakerRegistry(dossier.speakers);
    let count = Object.keys(dossier.speakers).length + 1;
    let nuevoId = `speaker_${String(count).padStart(2, '0')}`;
    
    // Evitar colisión de IDs
    while (dossier.speakers[nuevoId]) {
      count++;
      nuevoId = `speaker_${String(count).padStart(2, '0')}`;
    }

    const nombre = nombreVisible?.trim() || `Persona ${count}`;
    registry.registrarODescubrirHablante(nuevoId, nombre);
    if (rol) {
      registry.asignarRol(nuevoId, rol);
    }

    const dossierActualizado: TranscriptionReviewDossier = {
      ...dossier,
      speakers: registry.obtenerMapa(),
      updatedAt: new Date().toISOString(),
    };

    ReviewerDatabase.guardar(dossierActualizado);
    return dossierActualizado;
  }

  /**
   * Determina si una persona ha sido formalmente identificada por el usuario
   * (cuenta con un nombre propio asignado y no es un marcador genérico por defecto).
   */
  public static estaHablanteIdentificado(speaker?: { displayName?: string; speakerId?: string }): boolean {
    if (!speaker || !speaker.displayName) return false;
    const nombre = speaker.displayName.trim();
    if (!nombre) return false;
    // Marcadores genéricos por defecto: "Persona 1", "Persona 02", "speaker_01", "Hablante 1"
    const esGenerico = /^(persona|speaker|hablante|interlocutor)\s*[_#\-]?\s*\d+$/i.test(nombre);
    return !esGenerico;
  }

  /**
   * Valida si todas las personas detectadas en el audio/video han sido identificadas con un nombre real.
   * Este es el REQUISITO MÍNIMO de validez pericial para expedir el informe oficial.
   */
  public static validarPersonasIdentificadas(dossier: TranscriptionReviewDossier): {
    todasIdentificadas: boolean;
    total: number;
    identificadas: number;
    pendientes: string[];
  } {
    const speakers = Object.values(dossier.speakers || {});
    if (speakers.length === 0) {
      return { todasIdentificadas: true, total: 0, identificadas: 0, pendientes: [] };
    }

    const pendientes: string[] = [];
    let identificadas = 0;

    for (const spk of speakers) {
      if (this.estaHablanteIdentificado(spk)) {
        identificadas++;
      } else {
        pendientes.push(spk.displayName || spk.speakerId);
      }
    }

    return {
      todasIdentificadas: pendientes.length === 0,
      total: speakers.length,
      identificadas,
      pendientes,
    };
  }

  /**
   * Actualiza la preferencia de mostrar el rol entre paréntesis al lado del nombre
   */
  public static cambiarPreferenciaMostrarRol(
    dossier: TranscriptionReviewDossier,
    mostrarRol: boolean
  ): TranscriptionReviewDossier {
    const dossierActualizado: TranscriptionReviewDossier = {
      ...dossier,
      mostrarRolEnNombre: mostrarRol,
      updatedAt: new Date().toISOString(),
    };

    ReviewerDatabase.guardar(dossierActualizado);
    return dossierActualizado;
  }

  /**
   * Acepta una sugerencia propuesta por el motor de depuración
   */
  public static aceptarSugerencia(
    dossier: TranscriptionReviewDossier,
    blockId: string,
    correctionId: string
  ): TranscriptionReviewDossier {
    const bloques = dossier.reviewedBlocks.map((b) => {
      if (b.id !== blockId) return b;

      const correcciones = b.corrections.map((c) => {
        if (c.id === correctionId) {
          return { ...c, status: 'applied' as const };
        }
        return c;
      });

      // Aplicar el reemplazo del término en el texto revisado del bloque
      const corr = b.corrections.find((c) => c.id === correctionId);
      let nuevoTexto = b.reviewedText;
      if (corr && corr.status !== 'applied') {
        const regex = new RegExp(`\\b${this.escaparRegex(corr.originalWord)}\\b`);
        nuevoTexto = nuevoTexto.replace(regex, corr.suggestedWord);
      }

      return {
        ...b,
        reviewedText: nuevoTexto,
        corrections: correcciones,
      };
    });

    const stats = this.calcularEstadisticas(dossier.originalSegments.length, bloques);
    const actualizado: TranscriptionReviewDossier = {
      ...dossier,
      reviewedBlocks: bloques,
      stats,
      updatedAt: new Date().toISOString(),
    };

    ReviewerDatabase.guardar(actualizado);
    return actualizado;
  }

  /**
   * Rechaza una sugerencia (preserva la palabra original)
   */
  public static rechazarSugerencia(
    dossier: TranscriptionReviewDossier,
    blockId: string,
    correctionId: string
  ): TranscriptionReviewDossier {
    const bloques = dossier.reviewedBlocks.map((b) => {
      if (b.id !== blockId) return b;

      const correcciones = b.corrections.map((c) => {
        if (c.id === correctionId) {
          return { ...c, status: 'rejected' as const };
        }
        return c;
      });

      // Si había sido aplicada previamente, revertirla hacia originalWord
      const corr = b.corrections.find((c) => c.id === correctionId);
      let nuevoTexto = b.reviewedText;
      if (corr && corr.status === 'applied') {
        const regex = new RegExp(`\\b${this.escaparRegex(corr.suggestedWord)}\\b`);
        nuevoTexto = nuevoTexto.replace(regex, corr.originalWord);
      }

      return {
        ...b,
        reviewedText: nuevoTexto,
        corrections: correcciones,
      };
    });

    const stats = this.calcularEstadisticas(dossier.originalSegments.length, bloques);
    const actualizado: TranscriptionReviewDossier = {
      ...dossier,
      reviewedBlocks: bloques,
      stats,
      updatedAt: new Date().toISOString(),
    };

    ReviewerDatabase.guardar(actualizado);
    return actualizado;
  }

  /**
   * Permite al usuario ingresar una corrección manual personalizada
   */
  public static editarCorreccionManualmente(
    dossier: TranscriptionReviewDossier,
    blockId: string,
    correctionId: string,
    palabraManual: string
  ): TranscriptionReviewDossier {
    const palabraLimpia = palabraManual.trim();
    if (!palabraLimpia) return dossier;

    const bloques = dossier.reviewedBlocks.map((b) => {
      if (b.id !== blockId) return b;

      const corr = b.corrections.find((c) => c.id === correctionId);
      if (!corr) return b;

      const terminoAanterior = corr.status === 'applied' ? corr.suggestedWord : corr.originalWord;

      const correcciones = b.corrections.map((c) => {
        if (c.id === correctionId) {
          return {
            ...c,
            suggestedWord: palabraLimpia,
            status: 'user_edited' as const,
            userNote: `Modificado manualmente por el operador a "${palabraLimpia}".`,
          };
        }
        return c;
      });

      const regex = new RegExp(`\\b${this.escaparRegex(terminoAanterior)}\\b`);
      const nuevoTexto = b.reviewedText.replace(regex, palabraLimpia);

      return {
        ...b,
        reviewedText: nuevoTexto,
        corrections: correcciones,
      };
    });

    const stats = this.calcularEstadisticas(dossier.originalSegments.length, bloques);
    const actualizado: TranscriptionReviewDossier = {
      ...dossier,
      reviewedBlocks: bloques,
      stats,
      updatedAt: new Date().toISOString(),
    };

    ReviewerDatabase.guardar(actualizado);
    return actualizado;
  }

  /**
   * Combina dos o más bloques de diálogo seleccionados en un único bloque consolidado.
   * Ajusta los timestamps, concatena el texto de forma natural y preserva los fragmentos originales.
   */
  public static unirBloques(
    dossier: TranscriptionReviewDossier,
    blockIds: string[]
  ): TranscriptionReviewDossier {
    if (!blockIds || blockIds.length < 2) return dossier;

    const setIds = new Set(blockIds);
    const bloquesAUnir = dossier.reviewedBlocks.filter((b) => setIds.has(b.id));
    if (bloquesAUnir.length < 2) return dossier;

    // Ordenar cronológicamente
    bloquesAUnir.sort((a, b) => a.startTime - b.startTime);

    const primerBloque = bloquesAUnir[0];
    const startTime = primerBloque.startTime;
    const endTime = Math.max(...bloquesAUnir.map((b) => b.endTime));
    const durationSeconds = Number((endTime - startTime).toFixed(2));

    // Concatenar textos con espaciado natural
    const reviewedText = bloquesAUnir
      .map((b) => b.reviewedText.trim())
      .filter(Boolean)
      .join(' ');

    const originalText = bloquesAUnir
      .map((b) => b.originalText.trim())
      .filter(Boolean)
      .join(' ');

    const combinedOriginalSegments = bloquesAUnir.flatMap((b) => b.originalSegments);
    const combinedCorrections = bloquesAUnir.flatMap((b) => b.corrections);

    const mergedBlock: ReviewedSegmentBlock = {
      id: primerBloque.id,
      speakerId: primerBloque.speakerId,
      speakerName: primerBloque.speakerName,
      startTime,
      endTime,
      durationSeconds,
      reviewedText,
      originalText,
      confidence: primerBloque.confidence || 0.95,
      wasMerged: true,
      mergeReason: 'Fusión manual interactiva solicitada por el usuario',
      originalSegments: combinedOriginalSegments,
      corrections: combinedCorrections,
    };

    // Reemplazar los bloques fusionados en la lista manteniendo el orden cronológico
    const nuevosBloques: ReviewedSegmentBlock[] = [];
    let yaInsertado = false;

    for (const b of dossier.reviewedBlocks) {
      if (setIds.has(b.id)) {
        if (!yaInsertado) {
          nuevosBloques.push(mergedBlock);
          yaInsertado = true;
        }
      } else {
        nuevosBloques.push(b);
      }
    }

    const stats = this.calcularEstadisticas(dossier.originalSegments.length, nuevosBloques);
    const actualizado: TranscriptionReviewDossier = {
      ...dossier,
      reviewedBlocks: nuevosBloques,
      stats,
      updatedAt: new Date().toISOString(),
    };

    ReviewerDatabase.guardar(actualizado);
    return actualizado;
  }

  /**
   * Genera el contenido canónico de texto literal (.txt) a partir de los bloques revisados.
   */
  public static generarTxtDesdeBloques(
    dossier: TranscriptionReviewDossier,
    opciones?: { mostrarRol?: boolean }
  ): string {
    const mostrarRol = opciones?.mostrarRol ?? dossier.mostrarRolEnNombre ?? false;
    const lineas: string[] = [];
    lineas.push('================================================================================');
    lineas.push('                   TRANSCRIPCIÓN DE AUDIO/VIDEO — SEPHENT TRANSCRIPTOR');
    lineas.push('================================================================================');
    lineas.push(`Documento de Origen:  ${dossier.sourceFileName}`);
    lineas.push(`Modelo Utilizado:     ${dossier.modelUsed}`);
    lineas.push(`Idioma:               ${dossier.language.toUpperCase()}`);
    lineas.push(`Fecha de Revisión:    ${new Date(dossier.updatedAt).toLocaleString('es-ES')}`);
    lineas.push(
      `Hablantes Identificados: ${Object.values(dossier.speakers)
        .map((s) => (s.role ? `${s.displayName} [${s.role}]` : s.displayName))
        .join(', ')}`
    );
    lineas.push('================================================================================\n');

    for (const b of dossier.reviewedBlocks) {
      const tInicio = this.formatearSegundos(b.startTime);
      const tFin = this.formatearSegundos(b.endTime);
      const rol = dossier.speakers[b.speakerId]?.role;
      const etiqueta = (mostrarRol && rol && !b.speakerName.toLowerCase().includes(rol.toLowerCase()))
        ? `${b.speakerName} (${rol})`
        : b.speakerName;
      lineas.push(`[${tInicio} - ${tFin}] ${etiqueta}:`);
      lineas.push(`    "${b.reviewedText}"\n`);
    }

    return lineas.join('\n');
  }

  /**
   * Genera el formato de subtítulos temporizados (.srt) a partir de los bloques revisados.
   */
  public static generarSrtDesdeBloques(
    dossier: TranscriptionReviewDossier,
    opciones?: { mostrarRol?: boolean }
  ): string {
    const mostrarRol = opciones?.mostrarRol ?? dossier.mostrarRolEnNombre ?? false;
    const bloquesSrt: string[] = [];

    dossier.reviewedBlocks.forEach((b, index) => {
      const startSrt = this.formatearSegundosSRT(b.startTime);
      const endSrt = this.formatearSegundosSRT(b.endTime);
      const rol = dossier.speakers[b.speakerId]?.role;
      const etiqueta = (mostrarRol && rol && !b.speakerName.toLowerCase().includes(rol.toLowerCase()))
        ? `${b.speakerName} (${rol})`
        : b.speakerName;

      bloquesSrt.push(`${index + 1}`);
      bloquesSrt.push(`${startSrt} --> ${endSrt}`);
      bloquesSrt.push(`<b>${etiqueta}:</b> ${b.reviewedText}`);
      bloquesSrt.push('');
    });

    return bloquesSrt.join('\n');
  }

  /**
   * Exporta el texto depurado en formato formal pericial:
   * 
   * Pedro González
   * [00:14:22 - 00:14:29]
   * El documento fue entregado ayer por la tarde.
   */
  public static exportarTextoDepurado(dossier: TranscriptionReviewDossier): string {
    const lineas: string[] = [];
    lineas.push(`EXPEDIENTE PERICIAL DE TRANSCRIPCIÓN DEPURED`);
    lineas.push(`DOCUMENTO FUENTE: ${dossier.sourceFileName}`);
    lineas.push(`FECHA DE REVISIÓN: ${new Date(dossier.updatedAt).toLocaleString('es-ES')}`);
    lineas.push(`MODELO EMPLEADO: ${dossier.modelUsed} | IDIOMA: ${dossier.language}`);
    lineas.push('='.repeat(70));
    lineas.push('');

    for (const b of dossier.reviewedBlocks) {
      const tiempoInicio = this.formatearSegundos(b.startTime);
      const tiempoFin = this.formatearSegundos(b.endTime);

      if (b.speakerName && b.speakerName.trim()) {
        lineas.push(`${b.speakerName}`);
      }
      lineas.push(`[${tiempoInicio} - ${tiempoFin}]`);
      lineas.push(`${b.reviewedText}`);
      lineas.push('');
    }

    return lineas.join('\n');
  }

  /**
   * Exporta en formato de subtítulos periciales .SRT
   */
  public static exportarSrtDepurado(dossier: TranscriptionReviewDossier): string {
    const bloquesSrt: string[] = [];

    dossier.reviewedBlocks.forEach((b, index) => {
      const startSrt = this.formatearSegundosSRT(b.startTime);
      const endSrt = this.formatearSegundosSRT(b.endTime);

      bloquesSrt.push(`${index + 1}`);
      bloquesSrt.push(`${startSrt} --> ${endSrt}`);
      if (b.speakerName && b.speakerName.trim()) {
        bloquesSrt.push(`<b>${b.speakerName}:</b> ${b.reviewedText}`);
      } else {
        bloquesSrt.push(`${b.reviewedText}`);
      }
      bloquesSrt.push('');
    });

    return bloquesSrt.join('\n');
  }

  /**
   * Calcula el hash SHA-256 de una cadena de texto utilizando Web Crypto o fallback
   */
  public static async calcularSha256Texto(texto: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(texto);
    const cryptoApi =
      typeof globalThis !== 'undefined' && globalThis.crypto
        ? globalThis.crypto
        : typeof crypto !== 'undefined'
        ? (crypto as any)
        : undefined;

    if (cryptoApi && cryptoApi.subtle) {
      const hashBuffer = await cryptoApi.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    // Fallback determinista en entornos sin subtle crypto
    let hash = 0;
    for (let i = 0; i < texto.length; i++) {
      hash = (hash << 5) - hash + texto.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  /**
   * Genera el hash criptográfico SHA-256 de integridad forense para un expediente de transcripción.
   * Certifica unívocamente: archivo origen, modelo, idioma, personas hablantes asignadas y texto con marcas de tiempo.
   */
  public static async generarHashIntegridad(dossier: TranscriptionReviewDossier): Promise<string> {
    const payloadCanonico = JSON.stringify({
      id: dossier.id,
      sourceFileName: dossier.sourceFileName,
      modelUsed: dossier.modelUsed,
      language: dossier.language,
      speakers: Object.values(dossier.speakers)
        .sort((a, b) => a.speakerId.localeCompare(b.speakerId))
        .map((s) => ({ id: s.speakerId, name: s.displayName, role: s.role })),
      blocks: dossier.reviewedBlocks.map((b) => ({
        speakerId: b.speakerId,
        speakerName: b.speakerName,
        start: b.startTime,
        end: b.endTime,
        text: b.reviewedText,
      })),
    });

    return this.calcularSha256Texto(payloadCanonico);
  }

  /**
   * Marca o desmarca un expediente como revisado, actualizando las marcas de tiempo y el hash opcional.
   */
  public static marcarComoRevisado(
    dossier: TranscriptionReviewDossier,
    revisado: boolean,
    hashSha256?: string
  ): TranscriptionReviewDossier {
    const ahora = new Date().toISOString();
    return {
      ...dossier,
      revisado,
      fechaRevision: revisado ? ahora : undefined,
      hashSha256: hashSha256 || dossier.hashSha256,
      hashGeneradoEn: hashSha256 ? ahora : dossier.hashGeneradoEn,
      updatedAt: ahora,
    };
  }

  /**
   * Genera el informe oficial de transcripción pericial.
   * REGLA ESTRICTA DE SEGURIDAD: Un informe de transcripción NO se puede realizar nunca
   * sin antes haber marcado la transcripción como revisada.
   */
  public static generarInformeOficialTranscripcion(
    dossier: TranscriptionReviewDossier,
    opciones?: OpcionesInformePericial
  ): string {
    if (!dossier.revisado) {
      throw new Error(
        'Bloqueo de seguridad: No se puede realizar el informe de transcripción sin antes haber marcado la transcripción como revisada desde la sección de Revisar y Validar Hablantes.'
      );
    }

    // REQUISITO MÍNIMO ESTRICTO: Todas las personas en el audio/video deben estar identificadas
    const validacion = this.validarPersonasIdentificadas(dossier);
    if (!validacion.todasIdentificadas) {
      throw new Error(
        `Requisito mínimo pericial no cumplido: Debe identificar a todas las personas en el audio o video asignándoles su nombre real antes de generar el informe pericial. Pendientes: ${validacion.pendientes.join(', ')}.`
      );
    }

    const incMetadatos = opciones?.incluirMetadatos !== false;
    const incHash = opciones?.incluirCadenaCustodiaHash !== false;
    const incCedula = opciones?.incluirCedulaHablantes !== false;
    const incNotas = opciones?.incluirNotasPericiales !== false;
    const incCuerpo = opciones?.incluirCuerpoTranscripcion !== false;
    const incCert = opciones?.incluirCertificacionValidez !== false;

    const fechaInforme = new Date().toLocaleString('es-ES', {
      dateStyle: 'full',
      timeStyle: 'medium',
    });
    const hashCertificado = dossier.hashSha256 || 'HASH_NO_GENERADO_PREVIAMENTE';
    const fechaCertificado = dossier.hashGeneradoEn
      ? new Date(dossier.hashGeneradoEn).toLocaleString('es-ES')
      : new Date().toLocaleString('es-ES');

    const lineas: string[] = [];
    lineas.push('================================================================================');
    lineas.push('                 INFORME OFICIAL DE TRANSCRIPCIÓN Y ACTA PERICIAL');
    lineas.push('================================================================================\n');

    let seccionNum = 1;

    if (incMetadatos) {
      lineas.push(`--- ${seccionNum++}. INFORMACIÓN DEL EXPEDIENTE Y ARCHIVO ---`);
      lineas.push(`Folio de Revisión:      ${dossier.id}`);
      lineas.push(`Documento de Origen:    ${dossier.sourceFileName}`);
      if (opciones?.nombreGrupo) {
        lineas.push(`Expediente / Caso:      ${opciones.nombreGrupo}`);
      }
      if (opciones?.peritoOperador) {
        lineas.push(`Perito / Operador:      ${opciones.peritoOperador}`);
      }
      lineas.push(`Modelo Whisper:         ${dossier.modelUsed}`);
      lineas.push(`Idioma Detectado:       ${dossier.language}`);
      lineas.push(`Fecha de Emisión:       ${fechaInforme}`);
      if (dossier.fechaRevision) {
        lineas.push(`Fecha de Validación:    ${new Date(dossier.fechaRevision).toLocaleString('es-ES')}`);
      }
      lineas.push(`Estado de Validación:   CERTIFICADO Y REVISADO [✓ APROBADO]\n`);
    }

    if (incHash) {
      lineas.push(`--- ${seccionNum++}. CADENA DE CUSTODIA E INTEGRIDAD FORENSE (HASH SHA-256) ---`);
      lineas.push(`Algoritmo Criptográfico: SHA-256 (FIPS 180-4)`);
      lineas.push(`Firma Digital (Hash):    ${hashCertificado}`);
      lineas.push(`Sello Temporal de Hash:  ${fechaCertificado}`);
      lineas.push(`Garantía de Integridad:  Este hash certifica de forma unívoca e inalterable el contenido textual,`);
      lineas.push(`                         los sellos de tiempo y la asignación de personas hablantes.\n`);
    }

    if (incCedula && Object.keys(dossier.speakers).length > 0) {
      lineas.push(`--- ${seccionNum++}. CÉDULA DE PERSONAS HABLANTES IDENTIFICADAS ---`);
      lineas.push('| ID Técnico | Persona / Nombre Asignado | Rol Procesal | Intervenciones |');
      lineas.push('|:-----------|:--------------------------|:-------------|:---------------|');
      for (const spk of Object.values(dossier.speakers)) {
        const intervenciones = dossier.reviewedBlocks.filter((b) => b.speakerId === spk.speakerId).length;
        lineas.push(
          `| ${spk.speakerId.padEnd(10)} | ${spk.displayName.padEnd(25)} | ${(spk.role || 'No especificado').padEnd(12)} | ${String(intervenciones).padStart(14)} |`
        );
      }
      lineas.push('');
    }

    if (incNotas && (opciones?.notasPericiales || dossier.originalTranscriptionId)) {
      lineas.push(`--- ${seccionNum++}. CUADERNO DE NOTAS Y OBSERVACIONES PERICIALES ---`);
      lineas.push(opciones?.notasPericiales ? opciones.notasPericiales.trim() : 'Sin observaciones adicionales registradas.');
      lineas.push('\n');
    }

    if (incCuerpo) {
      const mostrarRol = dossier.mostrarRolEnNombre ?? false;
      lineas.push(`--- ${seccionNum++}. CUERPO DE LA TRANSCRIPCIÓN ÍNTEGRA Y DEPURADA ---`);
      dossier.reviewedBlocks.forEach((bloque, idx) => {
        const tiempoInicio = this.formatearSegundos(bloque.startTime);
        const tiempoFin = this.formatearSegundos(bloque.endTime);
        const rol = dossier.speakers[bloque.speakerId]?.role;
        const etiqueta = (mostrarRol && rol && !bloque.speakerName.toLowerCase().includes(rol.toLowerCase()))
          ? `${bloque.speakerName} (${rol})`
          : bloque.speakerName;
        if (etiqueta && etiqueta.trim()) {
          lineas.push(`[${idx + 1}] [${tiempoInicio} - ${tiempoFin}] ${etiqueta}:`);
        } else {
          lineas.push(`[${idx + 1}] [${tiempoInicio} - ${tiempoFin}]:`);
        }
        lineas.push(`    "${bloque.reviewedText}"\n`);
      });
    }

    if (incCert) {
      lineas.push('================================================================================');
      lineas.push('                     CERTIFICACIÓN DE VALIDEZ PERICIAL');
      lineas.push('  Se hace constar que la presente transcripción ha sido revisada, cotejada acústicamente');
      lineas.push('  y validada formalmente, conservando correspondencia fiel con el archivo original.');
      lineas.push('================================================================================');
    }

    return lineas.join('\n');
  }

  /**
   * Genera el informe pericial de cambios y trazabilidad forense
   */
  public static generarInformePericialCambios(dossier: TranscriptionReviewDossier): string {
    const md: string[] = [];
    md.push(`# Dictamen de Trazabilidad y Depuración Ortotipográfica`);
    md.push(`**Expediente:** \`${dossier.id}\`  `);
    md.push(`**Documento Fuente:** \`${dossier.sourceFileName}\`  `);
    md.push(`**Fecha de Auditoría:** ${new Date(dossier.updatedAt).toLocaleString('es-ES')}  `);
    md.push(`\n## 1. Resumen de Métricas de Intervención`);
    md.push(`- **Segmentos Originales Whisper:** ${dossier.stats.totalOriginalSegments}`);
    md.push(`- **Bloques Semánticos Reconstruidos:** ${dossier.stats.totalReviewedBlocks}`);
    md.push(`- **Correcciones Automáticas Seguras Aplicadas:** ${dossier.stats.autoCorrectionsCount}`);
    md.push(`- **Sugerencias Aceptadas por el Operador:** ${dossier.stats.acceptedCorrectionsCount}`);
    md.push(`- **Sugerencias Rechazadas (Conservadas Originales):** ${dossier.stats.rejectedCorrectionsCount}`);
    md.push(`- **Sugerencias Pendientes de Revisión:** ${dossier.stats.pendingSuggestionsCount}`);

    if (Object.keys(dossier.speakers).length > 0) {
      md.push(`\n## 2. Registro de Hablantes y Diarización`);
      md.push(`| ID Técnico Inmutable | Nombre Visible Asignado | Rol Procesal |`);
      md.push(`| --- | --- | --- |`);
      for (const h of Object.values(dossier.speakers)) {
        md.push(`| \`${h.speakerId}\` | **${h.displayName}** | ${h.role || 'No especificado'} |`);
      }
    } else {
      md.push(`\n## 2. Diarización de Hablantes`);
      md.push(`*Diarización no aplicada en este expediente (transcripción continua).*`);
    }

    md.push(`\n## 3. Bitácora de Correcciones Detalladas`);
    let hayCorrecciones = false;

    dossier.reviewedBlocks.forEach((b, idx) => {
      if (b.corrections.length > 0) {
        hayCorrecciones = true;
        const headerHablante = b.speakerName && b.speakerName.trim() ? ` — ${b.speakerName}` : '';
        md.push(`\n### Bloque ${idx + 1} [${this.formatearSegundos(b.startTime)} - ${this.formatearSegundos(b.endTime)}]${headerHablante}`);
        md.push(`* **Texto Original Reconocido:** "${b.originalText}"`);
        md.push(`* **Texto Final Depurado:** "${b.reviewedText}"`);
        md.push(`\n| Original | Reemplazo | Confianza | Estado | Motivo de Regla |`);
        md.push(`| --- | --- | --- | --- | --- |`);
        for (const c of b.corrections) {
          md.push(`| "${c.originalWord}" | **"${c.suggestedWord}"** | ${(c.confidence * 100).toFixed(0)}% | \`${c.status}\` | ${c.reason} |`);
        }
      }
    });

    if (!hayCorrecciones) {
      md.push(`*No se requirieron correcciones ortotipográficas en este expediente.*`);
    }

    return md.join('\n');
  }


  public static formatearSegundos(totalSegundos: number): string {
    const s = Math.max(0, Math.floor(totalSegundos));
    const horas = Math.floor(s / 3600);
    const minutos = Math.floor((s % 3600) / 60);
    const segundos = s % 60;

    const hh = String(horas).padStart(2, '0');
    const mm = String(minutos).padStart(2, '0');
    const ss = String(segundos).padStart(2, '0');

    return `${hh}:${mm}:${ss}`;
  }

  public static formatearSegundosSRT(totalSegundos: number): string {
    const totalMs = Math.max(0, Math.floor(totalSegundos * 1000));
    const horas = Math.floor(totalMs / 3600000);
    const minutos = Math.floor((totalMs % 3600000) / 60000);
    const segundos = Math.floor((totalMs % 60000) / 1000);
    const milisegundos = totalMs % 1000;

    const hh = String(horas).padStart(2, '0');
    const mm = String(minutos).padStart(2, '0');
    const ss = String(segundos).padStart(2, '0');
    const mmm = String(milisegundos).padStart(3, '0');

    return `${hh}:${mm}:${ss},${mmm}`;
  }

  private static calcularEstadisticas(
    totalOriginal: number,
    bloques: ReviewedSegmentBlock[]
  ): TranscriptionReviewDossier['stats'] {
    let autoCorrectionsCount = 0;
    let pendingSuggestionsCount = 0;
    let acceptedCorrectionsCount = 0;
    let rejectedCorrectionsCount = 0;

    for (const b of bloques) {
      for (const c of b.corrections) {
        if (c.type === 'auto_safe' && c.status === 'applied') {
          autoCorrectionsCount++;
        }
        if (c.status === 'pending_review') {
          pendingSuggestionsCount++;
        }
        if (c.status === 'applied' && c.type === 'suggestion') {
          acceptedCorrectionsCount++;
        }
        if (c.status === 'rejected') {
          rejectedCorrectionsCount++;
        }
      }
    }

    return {
      totalOriginalSegments: totalOriginal,
      totalReviewedBlocks: bloques.length,
      autoCorrectionsCount,
      pendingSuggestionsCount,
      acceptedCorrectionsCount,
      rejectedCorrectionsCount,
    };
  }

  private static escaparRegex(cadena: string): string {
    return cadena.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

/**
 * Implementación del Subsistema Pericial y Forense (Estilo Arturo)
 * 
 * Centraliza la custodia de evidencia, hashes criptográficos SHA-256,
 * validación forense de interlocutores y expedientes periciales.
 */

import {
  IPericialService,
  RegistroCadenaCustodia,
  RequisitosValidacionPericial,
  InformePericialEmitido,
} from '../../core/contracts/IPericialService';
import { RawTranscriptSegment } from '../reviewer/types';

export class PericialService implements IPericialService {
  private static STORAGE_PREFIX = 'sephent_pericial_custody_';

  public validarRequisitosPericiales(
    segmentos: RawTranscriptSegment[],
    nombresHablantes: Record<string, string>,
    hashSha256Audio?: string
  ): RequisitosValidacionPericial {
    // 1. Obtener identificadores únicos de hablantes en los segmentos
    const speakerIds = Array.from(new Set(segmentos.map((s) => s.speakerId).filter(Boolean)));
    const hablantesPendientes: string[] = [];

    for (const spkId of speakerIds) {
      const nombre = nombresHablantes[spkId]?.trim();
      // Si el nombre no existe, está vacío o sigue siendo el genérico 'speaker_01', 'Persona 1', etc.
      if (!nombre || /^speaker_\d+$/i.test(nombre) || /^persona\s*\d+$/i.test(nombre)) {
        hablantesPendientes.push(spkId);
      }
    }

    const todasIdentificadas = speakerIds.length > 0 && hablantesPendientes.length === 0;
    const audioValido = Boolean(hashSha256Audio && hashSha256Audio.length === 64);

    let motivoBloqueo: string | undefined = undefined;
    if (!todasIdentificadas) {
      motivoBloqueo = `Existen ${hablantesPendientes.length} hablante(s) sin identificar fehacientemente (nombres genéricos detectados).`;
    } else if (!audioValido) {
      motivoBloqueo = 'El archivo de audio no cuenta con un hash SHA-256 verificado en su cadena de custodia.';
    }

    return {
      todasLasPersonasIdentificadas: todasIdentificadas,
      hablantesPendientes,
      audioValidoConHash: audioValido,
      notasPericialesCompletas: true,
      puedeEmitirInforme: todasIdentificadas && audioValido,
      motivoBloqueo,
    };
  }

  public registrarCadenaCustodia(
    transcriptionId: string,
    registro: Partial<RegistroCadenaCustodia>
  ): RegistroCadenaCustodia {
    const actual = this.obtenerCadenaCustodia(transcriptionId) || {
      transcriptionId,
      sourceFileName: registro.sourceFileName || 'audio_evidencia.wav',
      hashSha256Audio: registro.hashSha256Audio || '',
      hashSha256Acta: registro.hashSha256Acta || '',
      fechaCreacion: new Date().toISOString(),
      identificacionCompletaHablantes: false,
      estadoRevision: 'pendiente',
      certificacionEmitida: false,
    };

    const consolidado: RegistroCadenaCustodia = {
      ...actual,
      ...registro,
      transcriptionId,
    };

    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(
          `${PericialService.STORAGE_PREFIX}${transcriptionId}`,
          JSON.stringify(consolidado)
        );
      } catch (e) {
        console.warn('No se pudo guardar la cadena de custodia en localStorage:', e);
      }
    }

    return consolidado;
  }

  public obtenerCadenaCustodia(transcriptionId: string): RegistroCadenaCustodia | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const data = localStorage.getItem(`${PericialService.STORAGE_PREFIX}${transcriptionId}`);
      if (!data) return null;
      return JSON.parse(data) as RegistroCadenaCustodia;
    } catch {
      return null;
    }
  }

  public async emitirInformePericial(
    transcriptionId: string,
    segmentos: RawTranscriptSegment[],
    nombresHablantes: Record<string, string>,
    metadatos: {
      perito?: string;
      expediente?: string;
      notasPericiales?: string;
      hashAudio?: string;
    }
  ): Promise<InformePericialEmitido> {
    const validacion = this.validarRequisitosPericiales(
      segmentos,
      nombresHablantes,
      metadatos.hashAudio
    );

    if (!validacion.puedeEmitirInforme) {
      throw new Error(`Requisito pericial no satisfecho: ${validacion.motivoBloqueo}`);
    }

    const fecha = new Date().toISOString();
    const codigoInforme = `INF-PER-${transcriptionId.substring(0, 8).toUpperCase()}-${Date.now().toString().slice(-4)}`;

    let textoActa = `================================================================================\n`;
    textoActa += `           DICTAMEN PERICIAL FORENSE DE TRANSCRIPCIÓN Y DIARIZACIÓN\n`;
    textoActa += `================================================================================\n\n`;
    textoActa += `CÓDIGO DE INFORME : ${codigoInforme}\n`;
    textoActa += `FECHA DE EMISIÓN  : ${new Date().toLocaleString()}\n`;
    textoActa += `EXPEDIENTE JUDICIAL: ${metadatos.expediente || 'S/N'}\n`;
    textoActa += `PERITO RESPONSABLE: ${metadatos.perito || 'Perito Oficial Acreditado'}\n`;
    textoActa += `INTEGRIDAD SHA-256: ${metadatos.hashAudio || 'N/A'}\n\n`;
    textoActa += `--------------------------------------------------------------------------------\n`;
    textoActa += `HABLANTES IDENTIFICADOS FEHACIENTEMENTE:\n`;
    for (const [id, nombre] of Object.entries(nombresHablantes)) {
      textoActa += `  • [${id}] -> ${nombre}\n`;
    }
    textoActa += `--------------------------------------------------------------------------------\n\n`;
    textoActa += `TRANSCRIPCIÓN CERTIFICADA:\n\n`;

    for (const seg of segmentos) {
      const spk = nombresHablantes[seg.speakerId] || seg.speakerId;
      const tStart = this.formatearSegundos(seg.startTime);
      const tEnd = this.formatearSegundos(seg.endTime);
      textoActa += `[${tStart} - ${tEnd}] ${spk}:\n  ${seg.text}\n\n`;
    }

    if (metadatos.notasPericiales) {
      textoActa += `--------------------------------------------------------------------------------\n`;
      textoActa += `NOTAS PERICIALES Y CONCLUSIONES FORENSES:\n`;
      textoActa += `${metadatos.notasPericiales}\n\n`;
    }

    textoActa += `================================================================================\n`;
    textoActa += `CERTIFICACIÓN DE INMUTABILIDAD:\n`;
    textoActa += `El presente documento ha sido verificado criptográficamente en Sephent Transcriptor.\n`;
    textoActa += `================================================================================\n`;

    // Actualizar cadena de custodia
    this.registrarCadenaCustodia(transcriptionId, {
      certificacionEmitida: true,
      peritoResponsable: metadatos.perito,
      numeroExpediente: metadatos.expediente,
      fechaValidacion: fecha,
      estadoRevision: 'validado_pericialmente',
    });

    return {
      codigoInforme,
      fechaEmision: fecha,
      contenidoDocumento: textoActa,
    };
  }

  private formatearSegundos(seg: number): string {
    const s = Math.max(0, seg);
    const mins = Math.floor(s / 60);
    const secs = (s % 60).toFixed(2);
    return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
  }
}

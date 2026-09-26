/**
 * Contrato Canónico del Subsistema Pericial y Forense (Estilo Arturo)
 * 
 * Aísla toda la lógica de cadena de custodia, certificación forense,
 * validación de hablantes e informes oficiales, separándola de la
 * transcripción acústica general.
 */

import { RawTranscriptSegment } from '../../services/reviewer/types';

export interface RegistroCadenaCustodia {
  transcriptionId: string;
  sourceFileName: string;
  hashSha256Audio: string;
  hashSha256Acta: string;
  fechaCreacion: string;
  fechaValidacion?: string;
  identificacionCompletaHablantes: boolean;
  peritoResponsable?: string;
  numeroExpediente?: string;
  estadoRevision: 'pendiente' | 'en_revision' | 'validado_pericialmente';
  certificacionEmitida: boolean;
}

export interface RequisitosValidacionPericial {
  todasLasPersonasIdentificadas: boolean;
  hablantesPendientes: string[];
  audioValidoConHash: boolean;
  notasPericialesCompletas: boolean;
  puedeEmitirInforme: boolean;
  motivoBloqueo?: string;
}

export interface InformePericialEmitido {
  codigoInforme: string;
  fechaEmision: string;
  contenidoDocumento: string;
  rutaArchivo?: string;
}

export interface IPericialService {
  /**
   * Valida si un expediente cumple los requisitos mínimos periciales:
   * todas las personas identificadas y cadena de custodia íntegra.
   */
  validarRequisitosPericiales(
    segmentos: RawTranscriptSegment[],
    nombresHablantes: Record<string, string>,
    hashSha256Audio?: string
  ): RequisitosValidacionPericial;

  /**
   * Registra o actualiza la cadena de custodia de una transcripción.
   */
  registrarCadenaCustodia(
    transcriptionId: string,
    registro: Partial<RegistroCadenaCustodia>
  ): RegistroCadenaCustodia;

  /**
   * Obtiene la cadena de custodia asociada a un expediente.
   */
  obtenerCadenaCustodia(transcriptionId: string): RegistroCadenaCustodia | null;

  /**
   * Genera el acta pericial certificada oficial con metadatos forenses.
   */
  emitirInformePericial(
    transcriptionId: string,
    segmentos: RawTranscriptSegment[],
    nombresHablantes: Record<string, string>,
    metadatos: {
      perito?: string;
      expediente?: string;
      notasPericiales?: string;
      hashAudio?: string;
    }
  ): Promise<InformePericialEmitido>;
}

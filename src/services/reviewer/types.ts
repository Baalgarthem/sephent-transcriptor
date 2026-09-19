/**
 * Modelos e interfaces de datos para el Módulo de Revisión y Depuración Inteligente Pericial
 * Principio SOLID: Interface Segregation Principle (ISP)
 */

export type TermCategory =
  | 'siglas'
  | 'juridico'
  | 'medico'
  | 'tecnico'
  | 'ingles'
  | 'institucional'
  | 'general'
  | 'personalizado';

export interface DictionaryEntry {
  readonly id: string;
  readonly term: string;
  readonly category: TermCategory;
  readonly acronymExpanded?: string;
  readonly frequentMisrecognitions: readonly string[];
  readonly contextKeywords?: readonly string[];
  readonly description?: string;
  readonly source: 'builtin' | 'custom';
}

export type CorrectionType = 'auto_safe' | 'suggestion' | 'manual';
export type CorrectionStatus = 'applied' | 'pending_review' | 'rejected' | 'user_edited';

export interface CorrectionTrace {
  readonly id: string;
  readonly originalWord: string;
  suggestedWord: string;
  type: CorrectionType;
  readonly confidence: number;
  readonly reason: string;
  status: CorrectionStatus;
  readonly suggestedOptions?: readonly string[];
  userNote?: string;
}

export interface SpeakerProfile {
  readonly speakerId: string; // Identificador técnico inmutable e.g. 'speaker_01'
  displayName: string;       // Nombre visible editable e.g. 'Lic. Roberto Méndez'
  color: string;             // Color principal sobrio
  colorBg: string;           // Fondo tenue para etiquetas
  colorBorder: string;       // Borde tenue
  role?: string;             // e.g. 'Juez', 'Defensa', 'Perito'
}

export interface RawTranscriptSegment {
  readonly id: string;
  readonly speakerId: string;
  readonly startTime: number; // en segundos
  readonly endTime: number;   // en segundos
  readonly text: string;
  readonly confidence?: number;
}

export interface ReviewedSegmentBlock {
  readonly id: string;
  readonly speakerId: string; // Mantiene la referencia inmutable
  speakerName: string;        // Nombre visible dinámico
  startTime: number;          // Timestamp inicial del primer fragmento
  endTime: number;            // Timestamp final del último fragmento
  readonly originalSegments: readonly RawTranscriptSegment[]; // Providencia y trazabilidad probatoria
  readonly originalText: string;
  reviewedText: string;
  confidence: number;
  corrections: CorrectionTrace[];
  wasMerged: boolean;
  mergeReason?: string;
}

export interface TranscriptionReviewDossier {
  readonly id: string;
  readonly sourceFileName: string;
  readonly originalTranscriptionId?: string;
  readonly modelUsed: string;
  readonly language: string;
  readonly createdAt: string;
  updatedAt: string;
  speakers: Record<string, SpeakerProfile>;
  readonly originalSegments: readonly RawTranscriptSegment[];
  reviewedBlocks: ReviewedSegmentBlock[];
  stats: {
    totalOriginalSegments: number;
    totalReviewedBlocks: number;
    autoCorrectionsCount: number;
    pendingSuggestionsCount: number;
    acceptedCorrectionsCount: number;
    rejectedCorrectionsCount: number;
  };
  revisado?: boolean;
  fechaRevision?: string;
  hashSha256?: string;
  hashGeneradoEn?: string;
}

export interface MergingRulesConfig {
  maxPauseSeconds: number; // Silencio máximo permitido para considerar unir (ej: 1.4s)
  maxBlockWords: number;   // Límite de palabras por bloque de oración (ej: 50 palabras)
  enforceSameSpeaker: boolean;
  respectTerminalPunctuation: boolean;
}

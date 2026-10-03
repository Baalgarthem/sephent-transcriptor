/**
 * Tipos e interfaces segredadas para el servicio de transcripción y salidas documentales
 * Principio SOLID: Interface Segregation Principle (ISP)
 */

export interface SourceFileInfo {
  readonly originalName: string;
  readonly baseName: string;
  readonly originalExtension: string;
  readonly sizeBytes: number;
}

export interface TranscriptionOutput {
  readonly formatId: string;
  readonly extension: string;
  readonly fileName: string;
  readonly downloadUrl: string;
  readonly label: string;
  readonly mimeType: string;
}

export interface TranscriptionRecord {
  readonly sourceFileName: string;
  readonly baseName: string;
  readonly outputs: TranscriptionOutput[];
  readonly processedAt: string;
  readonly transcriptionId?: string;
  readonly rawSegments?: any[];
  readonly audioUrl?: string;
  readonly textContent?: string;
  readonly srtContent?: string;
  readonly isPartial?: boolean;
  readonly wasCancelled?: boolean;
  readonly status?: 'completado' | 'parcial' | 'error';
  readonly errorMotivo?: string;
  readonly logPath?: string;
  readonly horaInicio?: string;
  readonly horaFin?: string;
  readonly duracionSegundos?: number;
  readonly duracionFormateada?: string;
}

export interface SelectedOutputFormats {
  readonly txt: boolean;
  readonly srt: boolean;
  readonly video: boolean;
}

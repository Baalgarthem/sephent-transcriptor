/**
 * Patrón Strategy y Factory para la generación de formatos de salida de transcripción
 * 
 * Principios aplicados:
 * - Single Responsibility Principle (SRP): Cada estrategia se encarga únicamente de su formato.
 * - Open/Closed Principle (OCP): Se pueden incorporar nuevos formatos (VTT, PDF, DOCX) sin modificar las clases existentes.
 * - Liskov Substitution Principle (LSP): Todas las estrategias son sustituibles mediante OutputFormatStrategy.
 * - DRY (Don't Repeat Yourself): Generación unificada del nombre de archivo conservando el nombre original exacto.
 */

import { TranscriptionOutput } from './types';

export interface OutputFormatStrategy {
  readonly formatId: string;
  readonly extension: string;
  readonly label: string;
  readonly mimeType: string;
  generateOutput(baseName: string, content?: string): TranscriptionOutput;
}

/**
 * Estrategia para salida de texto sin formato (.txt)
 * Conserva estrictamente el nombre base del archivo cargado.
 */
export class TxtFormatStrategy implements OutputFormatStrategy {
  public readonly formatId = 'txt';
  public readonly extension = 'txt';
  public readonly label = 'Transcripción literal (.txt)';
  public readonly mimeType = 'text/plain';

  public generateOutput(baseName: string, content?: string): TranscriptionOutput {
    const fileName = `${baseName}.${this.extension}`;
    let downloadUrl = `file:///output/${encodeURIComponent(fileName)}`;

    if (content && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        const blob = new Blob([content], { type: `${this.mimeType};charset=utf-8` });
        downloadUrl = URL.createObjectURL(blob);
      } catch (e) {
        // Fallback
      }
    }

    return {
      formatId: this.formatId,
      extension: this.extension,
      fileName,
      downloadUrl,
      label: this.label,
      mimeType: this.mimeType,
    };
  }
}

/**
 * Estrategia para salida de subtítulos temporizados (.srt)
 * Conserva estrictamente el nombre base del archivo cargado.
 */
export class SrtFormatStrategy implements OutputFormatStrategy {
  public readonly formatId = 'srt';
  public readonly extension = 'srt';
  public readonly label = 'Subtítulos temporizados periciales (.srt)';
  public readonly mimeType = 'application/x-subrip';

  public generateOutput(baseName: string, content?: string): TranscriptionOutput {
    const fileName = `${baseName}.${this.extension}`;
    let downloadUrl = `file:///output/${encodeURIComponent(fileName)}`;

    if (content && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        const blob = new Blob([content], { type: `${this.mimeType};charset=utf-8` });
        downloadUrl = URL.createObjectURL(blob);
      } catch (e) {
        // Fallback
      }
    }

    return {
      formatId: this.formatId,
      extension: this.extension,
      fileName,
      downloadUrl,
      label: this.label,
      mimeType: this.mimeType,
    };
  }
}

/**
 * Estrategia para salida de video subtitulado con meta-imagen (.mp4)
 * Conserva estrictamente el nombre base del archivo cargado, cambiando solo el contenedor a .mp4.
 */
export class VideoFormatStrategy implements OutputFormatStrategy {
  public readonly formatId = 'video';
  public readonly extension = 'mp4';
  public readonly label = 'Video generado con meta‑imagen (.mp4)';
  public readonly mimeType = 'video/mp4';

  public generateOutput(baseName: string, content?: string): TranscriptionOutput {
    const fileName = `${baseName}.${this.extension}`;
    let downloadUrl = `file:///output/${encodeURIComponent(fileName)}`;

    if (content && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      try {
        const blob = new Blob([content], { type: this.mimeType });
        downloadUrl = URL.createObjectURL(blob);
      } catch (e) {
        // Fallback
      }
    }

    return {
      formatId: this.formatId,
      extension: this.extension,
      fileName,
      downloadUrl,
      label: this.label,
      mimeType: this.mimeType,
    };
  }
}

/**
 * Factoría para instanciar las estrategias según los formatos solicitados (Factory Pattern)
 */
export class OutputFormatFactory {
  private static readonly registry: Record<string, () => OutputFormatStrategy> = {
    txt: () => new TxtFormatStrategy(),
    srt: () => new SrtFormatStrategy(),
    video: () => new VideoFormatStrategy(),
  };

  public static getStrategies(selectedFormats: { txt?: boolean; srt?: boolean; video?: boolean }): OutputFormatStrategy[] {
    const strategies: OutputFormatStrategy[] = [];
    if (selectedFormats.txt) strategies.push(this.registry.txt());
    if (selectedFormats.srt) strategies.push(this.registry.srt());
    if (selectedFormats.video) strategies.push(this.registry.video());
    return strategies;
  }
}

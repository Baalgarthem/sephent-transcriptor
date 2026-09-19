/**
 * Servicio Central de Transcripción (Fachada / Facade Pattern)
 * 
 * Principios aplicados:
 * - Single Responsibility Principle (SRP): Coordina el procesamiento de archivos y la obtención de salidas.
 * - Dependency Inversion Principle (DIP): Depende de la abstracción OutputFormatFactory y OutputFormatStrategy.
 * - KISS (Keep It Simple, Stupid): Lógica clara, directa y sin sobrecarga cognitiva.
 * - DRY (Don't Repeat Yourself): Función centralizada de extracción de nombre base sin duplicar expresiones regulares.
 */

import { SourceFileInfo, TranscriptionRecord, SelectedOutputFormats } from './types';
import { OutputFormatFactory } from './formatStrategies';

export class TranscriptionService {
  /**
   * Extrae el nombre base del archivo omitiendo exclusivamente su extensión final.
   * Maneja con robustez nombres con múltiples puntos (ej: "audiencia.caso.01.mp3" -> "audiencia.caso.01").
   */
  public static extractBaseName(fileName: string): string {
    if (!fileName || typeof fileName !== 'string') return 'documento_sin_nombre';
    const ultimoPunto = fileName.lastIndexOf('.');
    if (ultimoPunto === -1 || ultimoPunto === 0) {
      return fileName;
    }
    return fileName.substring(0, ultimoPunto);
  }

  /**
   * Extrae los metadatos esenciales del archivo fuente.
   */
  public static parseSourceFileInfo(file: File | { name: string; size?: number }): SourceFileInfo {
    const originalName = file.name;
    const baseName = this.extractBaseName(originalName);
    const ultimoPunto = originalName.lastIndexOf('.');
    const originalExtension = ultimoPunto > 0 ? originalName.substring(ultimoPunto + 1).toLowerCase() : '';

    return {
      originalName,
      baseName,
      originalExtension,
      sizeBytes: file.size || 0,
    };
  }

  /**
   * Genera los registros documentales de salida para un archivo procesado.
   * Garantiza que CADA archivo de salida tenga EXACTAMENTE el mismo nombre que el archivo cargado,
   * modificando únicamente su extensión según lo seleccionado por el usuario.
   */
  public static generateTranscriptionRecord(
    file: File | SourceFileInfo,
    selectedFormats: SelectedOutputFormats,
    contentMap?: { txt?: string; srt?: string; video?: string }
  ): TranscriptionRecord {
    const info = 'baseName' in file ? file : this.parseSourceFileInfo(file);
    const strategies = OutputFormatFactory.getStrategies(selectedFormats);

    const outputs = strategies.map((strategy) => {
      const content = contentMap ? (contentMap as any)[strategy.formatId] : undefined;
      return strategy.generateOutput(info.baseName, content);
    });

    return {
      sourceFileName: info.originalName,
      baseName: info.baseName,
      outputs,
      processedAt: new Date().toISOString(),
      textContent: contentMap?.txt,
      srtContent: contentMap?.srt,
    };
  }
}

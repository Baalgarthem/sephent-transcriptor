/**
 * Tokens de Inyección de Dependencias (Estilo Arturo)
 * 
 * Claves únicas fuertemente tipadas para resolución en el contenedor de servicios.
 */

export const DI_TOKENS = {
  TRANSCRIPTION_ENGINE: 'ITranscriptionEngine',
  MODEL_STORAGE: 'IModelStorageService',
  PERICIAL_SERVICE: 'IPericialService',
  TELEMETRY_SERVICE: 'ITelemetryService',
  USER_SETTINGS: 'IUserSettingsService',
} as const;

export type DITokenKey = keyof typeof DI_TOKENS;

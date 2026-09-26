/**
 * TranscriptionPanel — Re-exportación y compatibilidad hacia atrás (Estilo Arturo)
 * 
 * La interfaz gráfica clásica ha sido trasladada a:
 * src/gui/views/classic/ClassicTranscriptionView.tsx
 * 
 * Este archivo actúa como puente de compatibilidad para evitar roturas
 * en cualquier consumidor existente mientras se opera bajo el contrato IGUIView.
 */

import ClassicTranscriptionView from '../gui/views/classic/ClassicTranscriptionView';

export default ClassicTranscriptionView;
export { ClassicTranscriptionView };

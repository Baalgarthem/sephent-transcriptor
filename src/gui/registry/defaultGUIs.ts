/**
 * Registro Canónico de Interfaces Gráficas por Defecto (Estilo Arturo)
 * 
 * Declara las implementaciones de interfaz gráfica preinstaladas en la aplicación.
 * Nuevas tecnologías (Web Components, Canvas, etc.) pueden añadirse aquí o mediante plugins.
 */

import { IGUIView } from '../../core/contracts/IGUIView';
import { IGUIManager } from '../../core/contracts/IGUIManager';
import { DIContainer } from '../../core/di/container';
import { DI_TOKENS } from '../../core/di/tokens';
import ClassicTranscriptionView from '../views/classic/ClassicTranscriptionView';
import StreamlinedTranscriptionView from '../views/streamlined/StreamlinedTranscriptionView';

export const INTERFACES_GRAFICAS_DISPONIBLES: readonly IGUIView[] = [
  {
    id: 'classic',
    name: 'Clásica Forense (Lexis & Archive)',
    description: 'Entorno pericial integral con validación judicial de hablantes, bitácoras de revisión y emisión de dictámenes.',
    technology: 'react-classic',
    badge: 'Lexis Judicial',
    icon: '🏛️',
    Component: ClassicTranscriptionView,
  },
  {
    id: 'streamlined',
    name: 'Moderna Rápida (Streamlined Focus)',
    description: 'Entorno minimalista y ágil enfocado en procesamiento acústico veloz, diarización directa y telemetría de alta resolución.',
    technology: 'react-streamlined',
    badge: 'Moderna Ágil',
    icon: '⚡',
    Component: StreamlinedTranscriptionView,
  },
];

/**
 * Registra las interfaces gráficas canónicas en el contenedor de dependencias
 */
export function registrarInterfacesPorDefecto(container: DIContainer): void {
  if (container.has(DI_TOKENS.GUI_MANAGER)) {
    const manager = container.resolve<IGUIManager>(DI_TOKENS.GUI_MANAGER);
    INTERFACES_GRAFICAS_DISPONIBLES.forEach((gui) => manager.registrarInterfaz(gui));
  }
}

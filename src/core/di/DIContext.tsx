/**
 * Integración de Inyección de Dependencias con React Context (Estilo Arturo)
 * 
 * Permite que los componentes de la interfaz consuman contratos sin acoplarse
 * a implementaciones concretas ni clases estáticas globales.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { DIContainer, appContainer } from './container';

const DIContext = createContext<DIContainer>(appContainer);

export interface DIProviderProps {
  container?: DIContainer;
  children: ReactNode;
}

export const DIProvider: React.FC<DIProviderProps> = ({
  container = appContainer,
  children,
}) => {
  return <DIContext.Provider value={container}>{children}</DIContext.Provider>;
};

/**
 * Hook para inyectar un servicio a partir de su token de contrato.
 */
export function useService<T>(token: string): T {
  const container = useContext(DIContext);
  if (!container) {
    throw new Error(`[useService] DIContext no inicializado para el token: "${token}"`);
  }
  return container.resolve<T>(token);
}

/**
 * Hook para inyectar un servicio opcional sin lanzar error si no está registrado.
 */
export function useOptionalService<T>(token: string): T | null {
  const container = useContext(DIContext);
  if (!container || !container.has(token)) {
    return null;
  }
  try {
    return container.resolve<T>(token);
  } catch {
    return null;
  }
}

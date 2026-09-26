/**
 * Contrato Canónico de Vista e Interfaz Gráfica (Estilo Arturo)
 * 
 * Permite desacoplar el motor y los servicios centrales de cualquier tecnología
 * de presentación gráfica (React Clásico, React Moderno, Web Components, Canvas, etc.).
 */

import React from 'react';

export type GUITechnology =
  | 'react-classic'
  | 'react-streamlined'
  | 'web-components'
  | 'canvas'
  | 'custom';

export interface IGUIViewDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly technology: GUITechnology;
  readonly badge?: string;
  readonly icon?: string;
  readonly isExperimental?: boolean;
}

export interface IGUIView extends IGUIViewDescriptor {
  readonly Component: React.ComponentType<any>;
}

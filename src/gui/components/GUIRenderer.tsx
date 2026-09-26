/**
 * GUIRenderer — Renderizador Dinámico de Interfaces Gráficas (Estilo Arturo)
 * 
 * Componente de orden superior que consulta el IGUIManager inyectado por DI
 * y renderiza dinámicamente la interfaz gráfica activa.
 */

import React, { useState, useEffect } from 'react';
import { useService } from '../../core/di/DIContext';
import { DI_TOKENS } from '../../core/di/tokens';
import { IGUIManager } from '../../core/contracts/IGUIManager';
import { IGUIView } from '../../core/contracts/IGUIView';
import { THEME_TOKENS } from '../../config/themeTokens';

export const GUIRenderer: React.FC = () => {
  const guiManager = useService<IGUIManager>(DI_TOKENS.GUI_MANAGER);
  const [interfazActiva, setInterfazActiva] = useState<IGUIView>(() => guiManager.obtenerInterfazActiva());

  useEffect(() => {
    const desuscribir = guiManager.suscribirCambio((nuevaGui) => {
      setInterfazActiva(nuevaGui);
    });
    return () => desuscribir();
  }, [guiManager]);

  if (!interfazActiva || !interfazActiva.Component) {
    return (
      <div
        style={{
          textAlign: 'center',
          padding: '3rem',
          backgroundColor: THEME_TOKENS.colors.surfaceCard,
          borderRadius: THEME_TOKENS.radii.md,
          margin: '2rem auto',
          maxWidth: '500px',
        }}
      >
        <span style={{ fontSize: '2rem' }}>⚠️</span>
        <h3 style={{ margin: '0.5rem 0', color: THEME_TOKENS.colors.textPrimary }}>
          Sin interfaz gráfica seleccionada
        </h3>
        <p style={{ fontSize: '0.875rem', color: THEME_TOKENS.colors.textSecondary }}>
          Por favor seleccione una interfaz gráfica registrada en el gestor.
        </p>
      </div>
    );
  }

  const ActiveComponent = interfazActiva.Component;
  return <ActiveComponent />;
};

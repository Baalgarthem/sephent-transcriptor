/**
 * GUISwitcher — Selector y Conmutador de Interfaces Gráficas (Estilo Arturo)
 * 
 * Componente desacoplado que consume IGUIManager a través de Inyección de Dependencias.
 * Permite al usuario alternar entre múltiples tecnologías o variantes de interfaz
 * gráfica en tiempo de ejecución, persistiendo automáticamente su elección.
 */

import React, { useState, useEffect } from 'react';
import { useService } from '../../core/di/DIContext';
import { DI_TOKENS } from '../../core/di/tokens';
import { IGUIManager } from '../../core/contracts/IGUIManager';
import { IGUIView, IGUIViewDescriptor } from '../../core/contracts/IGUIView';
import { THEME_TOKENS } from '../../config/themeTokens';

export const GUISwitcher: React.FC = () => {
  const guiManager = useService<IGUIManager>(DI_TOKENS.GUI_MANAGER);
  const [interfazActiva, setInterfazActiva] = useState<IGUIView>(() => guiManager.obtenerInterfazActiva());
  const [interfacesDisponibles, setInterfacesDisponibles] = useState<IGUIViewDescriptor[]>(() =>
    guiManager.obtenerInterfaces()
  );
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    const desuscribir = guiManager.suscribirCambio((nuevaGui) => {
      setInterfazActiva(nuevaGui);
    });
    setInterfacesDisponibles(guiManager.obtenerInterfaces());
    return () => desuscribir();
  }, [guiManager]);

  const handleCambiarInterfaz = (id: string) => {
    guiManager.establecerInterfazActiva(id);
    setMenuAbierto(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setMenuAbierto((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          color: '#F5F5F0',
          padding: '0.35rem 0.75rem',
          borderRadius: THEME_TOKENS.radii.pill,
          fontSize: '0.785rem',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
          backdropFilter: 'blur(4px)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.15)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.4)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        }}
        title="Cambiar entre diferentes tecnologías o diseños de interfaz gráfica"
      >
        <span>{interfazActiva.icon || '🎨'}</span>
        <span>{interfazActiva.name}</span>
        <span
          style={{
            fontSize: '0.675rem',
            backgroundColor: 'rgba(255, 255, 255, 0.18)',
            padding: '0.1rem 0.4rem',
            borderRadius: THEME_TOKENS.radii.xs,
            color: '#E2E8F0',
          }}
        >
          {interfazActiva.badge || interfazActiva.technology}
        </span>
        <span style={{ fontSize: '0.65rem', marginLeft: '0.2rem', opacity: 0.75 }}>
          {menuAbierto ? '▲' : '▼'}
        </span>
      </button>

      {/* Menú desplegable flotante de selección de interfaces */}
      {menuAbierto && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            width: '280px',
            backgroundColor: '#1E1E1C',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: THEME_TOKENS.radii.md,
            padding: '0.5rem',
            boxShadow: THEME_TOKENS.shadows.lg,
            zIndex: 1000,
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            style={{
              padding: '0.35rem 0.5rem 0.5rem',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              marginBottom: '0.35rem',
            }}
          >
            <strong style={{ fontSize: '0.75rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Interfaces Gráficas (DI)
            </strong>
          </div>

          {interfacesDisponibles.map((desc) => {
            const esActiva = desc.id === interfazActiva.id;
            return (
              <div
                key={desc.id}
                onClick={() => handleCambiarInterfaz(desc.id)}
                style={{
                  padding: '0.6rem 0.75rem',
                  borderRadius: THEME_TOKENS.radii.sm,
                  backgroundColor: esActiva ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  cursor: 'pointer',
                  marginBottom: '0.25rem',
                  transition: 'background-color 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
                onMouseEnter={(e) => {
                  if (!esActiva) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                }}
                onMouseLeave={(e) => {
                  if (!esActiva) e.currentTarget.style.backgroundColor = 'transparent';
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span>{desc.icon || '🖥️'}</span>
                    <strong style={{ fontSize: '0.825rem', color: '#F1F5F9' }}>{desc.name}</strong>
                  </div>
                  {esActiva && (
                    <span style={{ fontSize: '0.75rem', color: '#4ADE80', fontWeight: 700 }}>✓</span>
                  )}
                </div>
                <span style={{ fontSize: '0.725rem', color: '#94A3B8' }}>{desc.description}</span>
                <div style={{ marginTop: '0.2rem' }}>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      padding: '0.1rem 0.35rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      color: '#CBD5E1',
                    }}
                  >
                    Tecnología: {desc.technology}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

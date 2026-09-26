/**
 * DangerZoneSection — Zona de Depuración y Borrado Seguro (SRP)
 * 
 * Componente modular desacoplado para ejecutar limpiezas totales o selectivas
 * mediante un flujo de doble confirmación con confirmación escrita.
 */

import React, { useState } from 'react';
import { THEME_TOKENS } from '../../config/themeTokens';
import { TranscriptionDatabase } from '../../services/database/transcriptionDatabase';
import { ReviewerDatabase } from '../../services/reviewer/storage/reviewerDatabase';
import { TranscriptionGroupService } from '../../services/database/transcriptionGroupService';
import { ModelManager } from '../../services/modelManager';
import { UserSettingsService } from '../../services/userSettingsService';

export interface DangerZoneSectionProps {
  alEjecutarLimpieza: () => Promise<void>;
}

export const DangerZoneSection: React.FC<DangerZoneSectionProps> = ({ alEjecutarLimpieza }) => {
  const [abierta, setAbierta] = useState(false);
  const [fase, setFase] = useState<0 | 1>(0); // 0=configuración, 1=confirmación por texto
  const [textoConfirmacion, setTextoConfirmacion] = useState('');
  const [opciones, setOpciones] = useState({
    transcripciones: true,
    expedientes: true,
    grupos: true,
    modelos: false, // Por defecto FALSE para conservar y no perder los modelos Whisper
    configuracion: false,
  });

  const handleIniciarBorrado = () => {
    if (
      !opciones.transcripciones &&
      !opciones.expedientes &&
      !opciones.grupos &&
      !opciones.modelos &&
      !opciones.configuracion
    ) {
      alert('Por favor selecciona al menos un elemento que deseas depurar.');
      return;
    }
    setTextoConfirmacion('');
    setFase(1);
  };

  const handleCancelar = () => {
    setFase(0);
    setTextoConfirmacion('');
  };

  const handleConfirmar = async () => {
    const palabra = textoConfirmacion.trim().toUpperCase();
    if (palabra !== 'ELIMINAR' && palabra !== 'ELIMINAR TODO') return;

    const eliminados: string[] = [];
    const conservados: string[] = [];

    if (opciones.transcripciones) {
      TranscriptionDatabase.limpiarTodo();
      eliminados.push('Historial de transcripciones');
    } else {
      conservados.push('Historial de transcripciones');
    }

    if (opciones.expedientes) {
      ReviewerDatabase.limpiarTodo();
      eliminados.push('Expedientes periciales y notas');
    } else {
      conservados.push('Expedientes periciales');
    }

    if (opciones.grupos) {
      TranscriptionGroupService.limpiarTodo();
      eliminados.push('Grupos de expedientes');
    } else {
      conservados.push('Grupos de expedientes');
    }

    if (opciones.modelos) {
      ModelManager.limpiarModelosRegistrados();
      eliminados.push('Modelos OpenAI Whisper (registro restablecido)');
    } else {
      conservados.push('Modelos OpenAI Whisper (conservados intactos)');
    }

    if (opciones.configuracion) {
      UserSettingsService.guardarConfiguracion({
        modelo: 'medium',
        idioma: 'es',
        outputTxt: true,
        outputSrt: true,
        outputVideo: false,
        modoDestino: 'default',
      });
      eliminados.push('Preferencias de usuario');
    }

    setFase(0);
    setAbierta(false);
    setTextoConfirmacion('');

    await alEjecutarLimpieza();

    alert(
      `✓ Limpieza completada con éxito.\n\n` +
      `Elementos eliminados:\n• ${eliminados.join('\n• ') || 'Ninguno'}\n\n` +
      `Elementos conservados:\n• ${conservados.join('\n• ')}`
    );
  };

  return (
    <div
      style={{
        marginTop: '2rem',
        border: `1px solid ${abierta ? '#b91c1c' : THEME_TOKENS.colors.stateErrorBorder}`,
        borderRadius: THEME_TOKENS.radii.md,
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Cabecera colapsable */}
      <button
        type="button"
        onClick={() => {
          setAbierta((v) => !v);
          if (abierta) handleCancelar();
        }}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1.1rem',
          backgroundColor: abierta ? '#fef2f2' : THEME_TOKENS.colors.surfaceBase,
          border: 'none',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem' }}>⚠️</span>
          <strong style={{ fontSize: '0.875rem', color: '#b91c1c', fontFamily: THEME_TOKENS.fonts.sans }}>
            Zona de Peligro
          </strong>
          <span style={{ fontSize: '0.775rem', color: THEME_TOKENS.colors.textMuted }}>
            — Acciones irreversibles de depuración
          </span>
        </div>
        <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 600 }}>
          {abierta ? '▲ Cerrar' : '▼ Expandir'}
        </span>
      </button>

      {/* Contenido expandible */}
      {abierta && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            padding: '1.25rem',
            borderTop: '1px solid #fecaca',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {fase === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <p style={{ margin: 0, fontSize: '0.8125rem', color: '#7f1d1d', lineHeight: 1.5 }}>
                Selecciona los elementos que deseas restablecer o vaciar de la aplicación.
                Por defecto, tus modelos descargados de Whisper permanecen conservados.
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '0.5rem',
                  backgroundColor: '#fff',
                  padding: '0.85rem',
                  borderRadius: THEME_TOKENS.radii.sm,
                  border: '1px solid #fecaca',
                }}
              >
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={opciones.transcripciones}
                    onChange={(e) => setOpciones((p) => ({ ...p, transcripciones: e.target.checked }))}
                    style={{ accentColor: '#dc2626' }}
                  />
                  <span>Historial de transcripciones</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={opciones.expedientes}
                    onChange={(e) => setOpciones((p) => ({ ...p, expedientes: e.target.checked }))}
                    style={{ accentColor: '#dc2626' }}
                  />
                  <span>Expedientes periciales y notas</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={opciones.grupos}
                    onChange={(e) => setOpciones((p) => ({ ...p, grupos: e.target.checked }))}
                    style={{ accentColor: '#dc2626' }}
                  />
                  <span>Grupos de expedientes</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={opciones.modelos}
                    onChange={(e) => setOpciones((p) => ({ ...p, modelos: e.target.checked }))}
                    style={{ accentColor: '#dc2626' }}
                  />
                  <span>Registro de modelos Whisper</span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: '#374151' }}>
                  <input
                    type="checkbox"
                    checked={opciones.configuracion}
                    onChange={(e) => setOpciones((p) => ({ ...p, configuracion: e.target.checked }))}
                    style={{ accentColor: '#dc2626' }}
                  />
                  <span>Preferencias de usuario</span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleIniciarBorrado}
                  style={{
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.55rem 1.1rem',
                    borderRadius: THEME_TOKENS.radii.sm,
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: THEME_TOKENS.shadows.sm,
                  }}
                >
                  Continuar depuración selectiva...
                </button>
                <button
                  type="button"
                  onClick={() => setAbierta(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                    color: THEME_TOKENS.colors.textSecondary,
                    padding: '0.55rem 0.95rem',
                    borderRadius: THEME_TOKENS.radii.sm,
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Fase 1: confirmación final escribiendo el texto */}
          {fase === 1 && (
            <div
              style={{
                backgroundColor: '#fff',
                border: '2px solid #dc2626',
                borderRadius: THEME_TOKENS.radii.sm,
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.85rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>🛑</span>
                <strong style={{ fontSize: '0.95rem', color: '#991b1b' }}>
                  Confirmación de depuración selectiva
                </strong>
              </div>

              <div style={{ backgroundColor: '#fef2f2', padding: '0.75rem', borderRadius: THEME_TOKENS.radii.xs, fontSize: '0.785rem', color: '#991b1b', lineHeight: 1.6 }}>
                <div><strong>Elementos que se eliminarán:</strong></div>
                <ul style={{ margin: '0.25rem 0 0.5rem 1.25rem', padding: 0 }}>
                  {opciones.transcripciones && <li>Historial de transcripciones (.txt y .srt generados)</li>}
                  {opciones.expedientes && <li>Expedientes periciales, validaciones y notas</li>}
                  {opciones.grupos && <li>Grupos y carpetas organizadas</li>}
                  {opciones.modelos && <li>Registro de modelos OpenAI Whisper</li>}
                  {opciones.configuracion && <li>Ajustes y preferencias de usuario</li>}
                </ul>

                {!opciones.modelos && (
                  <div style={{ color: '#166534', fontWeight: 600, borderTop: '1px solid #fecaca', paddingTop: '0.35rem' }}>
                    🛡️ Los modelos OpenAI Whisper se mantendrán guardados en tu equipo sin borrarse.
                  </div>
                )}
              </div>

              <p style={{ margin: 0, fontSize: '0.8rem', color: '#7f1d1d', lineHeight: 1.5 }}>
                Para ejecutar la limpieza, escribe <code style={{ backgroundColor: '#fee2e2', padding: '0.1rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>ELIMINAR</code> en el campo siguiente y haz clic en el botón de confirmación.
              </p>

              <input
                type="text"
                value={textoConfirmacion}
                onChange={(e) => setTextoConfirmacion(e.target.value)}
                placeholder="Escribe: ELIMINAR"
                autoFocus
                style={{
                  padding: '0.55rem 0.75rem',
                  border: `1px solid ${textoConfirmacion.trim().toUpperCase() === 'ELIMINAR' ? '#16a34a' : '#fca5a5'}`,
                  borderRadius: THEME_TOKENS.radii.sm,
                  fontSize: '0.875rem',
                  fontFamily: THEME_TOKENS.fonts.mono,
                  outline: 'none',
                  backgroundColor: textoConfirmacion.trim().toUpperCase() === 'ELIMINAR' ? '#f0fdf4' : '#fff',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
              />

              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleConfirmar}
                  disabled={textoConfirmacion.trim().toUpperCase() !== 'ELIMINAR' && textoConfirmacion.trim().toUpperCase() !== 'ELIMINAR TODO'}
                  style={{
                    backgroundColor:
                      textoConfirmacion.trim().toUpperCase() === 'ELIMINAR' || textoConfirmacion.trim().toUpperCase() === 'ELIMINAR TODO'
                        ? '#dc2626'
                        : '#fca5a5',
                    color: '#ffffff',
                    border: 'none',
                    padding: '0.55rem 1.25rem',
                    borderRadius: THEME_TOKENS.radii.sm,
                    fontSize: '0.825rem',
                    fontWeight: 700,
                    cursor:
                      textoConfirmacion.trim().toUpperCase() === 'ELIMINAR' || textoConfirmacion.trim().toUpperCase() === 'ELIMINAR TODO'
                        ? 'pointer'
                        : 'not-allowed',
                    transition: 'background-color 0.15s',
                  }}
                >
                  🗑 Confirmar y depurar datos seleccionados
                </button>
                <button
                  type="button"
                  onClick={handleCancelar}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                    color: THEME_TOKENS.colors.textSecondary,
                    padding: '0.55rem 1rem',
                    borderRadius: THEME_TOKENS.radii.sm,
                    fontSize: '0.825rem',
                    cursor: 'pointer',
                  }}
                >
                  Volver
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { SpeakerProfile } from '../../services/reviewer/types';
import { THEME_TOKENS } from '../../config/themeTokens';
import { AudioSegmentPlayer } from './AudioSegmentPlayer';
import { UserSettingsService } from '../../services/userSettingsService';
import { TranscriptionReviewerService } from '../../services/reviewer/transcriptionReviewerService';

export interface SpeakerSampleInfo {
  startTime: number;
  endTime: number;
  sampleText?: string;
}

interface SpeakerManagerBarProps {
  speakers: Record<string, SpeakerProfile>;
  intervencionesPorHablante?: Record<string, number>;
  muestrasPorHablante?: Record<string, SpeakerSampleInfo>;
  audioUrl?: string;
  onRenombrarHablante: (speakerId: string, nuevoNombre: string) => void;
  onAsignarRol?: (speakerId: string, rol: string) => void;
  onAgregarHablante?: () => void;
  mostrarRolEnNombre?: boolean;
  onToggleMostrarRolEnNombre?: (mostrar: boolean) => void;
}

export const SpeakerManagerBar: React.FC<SpeakerManagerBarProps> = ({
  speakers,
  intervencionesPorHablante = {},
  muestrasPorHablante = {},
  audioUrl,
  onRenombrarHablante,
  onAsignarRol,
  onAgregarHablante,
  mostrarRolEnNombre = false,
  onToggleMostrarRolEnNombre,
}) => {
  const listaHablantes = Object.values(speakers);
  const [nuevoRolPersonalizado, setNuevoRolPersonalizado] = useState('');
  const [rolesDisponibles, setRolesDisponibles] = useState<string[]>(() =>
    UserSettingsService.obtenerRolesGlobales()
  );
  const [mensajeRol, setMensajeRol] = useState<string | null>(null);

  const totalHablantes = listaHablantes.length;
  const identificados = listaHablantes.filter((s) =>
    TranscriptionReviewerService.estaHablanteIdentificado(s)
  ).length;
  const todosIdentificados = totalHablantes > 0 && identificados === totalHablantes;

  const handleAgregarRolGlobal = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const rolLimpio = nuevoRolPersonalizado.trim();
    if (!rolLimpio) return;
    const actualizados = UserSettingsService.agregarRolPersonalizado(rolLimpio);
    setRolesDisponibles(actualizados);
    setNuevoRolPersonalizado('');
    setMensajeRol(`✓ Rol "${rolLimpio}" añadido globalmente.`);
    setTimeout(() => setMensajeRol(null), 3500);
  };

  return (
    <div
      style={{
        backgroundColor: THEME_TOKENS.colors.surfaceBase,
        border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        borderRadius: THEME_TOKENS.radii.sm,
        padding: '1.25rem',
        marginBottom: '1.25rem',
        boxShadow: THEME_TOKENS.shadows.sm,
      }}
    >
      {/* Encabezado Pedagógico de la Subsección de Personas */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.2rem' }}>👥</span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1rem',
                  color: THEME_TOKENS.colors.textPrimary,
                  fontFamily: THEME_TOKENS.fonts.serif,
                  fontWeight: 600,
                }}
              >
                Subsección de Personas ({listaHablantes.length} personas agrupadas)
              </h3>
              <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textMuted }}>
                Personas e interlocutores participantes identificados en este audio
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {onAgregarHablante && (
              <button
                onClick={onAgregarHablante}
                style={{
                  backgroundColor: THEME_TOKENS.colors.surfaceDark,
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.35rem 0.85rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  boxShadow: THEME_TOKENS.shadows.sm,
                }}
                title="Añadir una nueva persona a esta transcripción"
              >
                <span>+</span>
                <span>Añadir Persona</span>
              </button>
            )}
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                padding: '0.2rem 0.65rem',
                borderRadius: '12px',
                backgroundColor: todosIdentificados ? '#E8EFE3' : '#FEF3C7',
                color: todosIdentificados ? '#2A4A1C' : '#92400E',
                border: `1px solid ${todosIdentificados ? '#C4DAB5' : '#FCD34D'}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
              title={
                todosIdentificados
                  ? 'Requisito pericial cumplido: todas las personas identificadas'
                  : 'Requisito pericial pendiente: se deben identificar todas las personas asignándoles su nombre real'
              }
            >
              <span>{todosIdentificados ? '✓' : '⚠️'}</span>
              <span>
                {todosIdentificados
                  ? `Personas Identificadas (${identificados}/${totalHablantes})`
                  : `Identificación: ${identificados}/${totalHablantes}`}
              </span>
            </span>
            <span
              style={{
                fontSize: '0.75rem',
                color: THEME_TOKENS.colors.accentTaupe,
                fontWeight: 600,
                backgroundColor: THEME_TOKENS.colors.accentTaupeBg,
                padding: '0.2rem 0.6rem',
                borderRadius: THEME_TOKENS.radii.xs,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              }}
            >
              Edición en Tiempo Real
            </span>
          </div>
        </div>

        {/* Guía didáctica en 3 pasos simples */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '0.75rem',
            marginTop: '0.85rem',
            padding: '0.75rem 1rem',
            backgroundColor: THEME_TOKENS.colors.bgCanvas,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.xs,
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceDark,
                color: THEME_TOKENS.colors.textOnDark,
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                flexShrink: 0,
                marginTop: '0.1rem',
              }}
            >
              1
            </span>
            <div style={{ fontSize: '0.775rem' }}>
              <strong style={{ color: THEME_TOKENS.colors.textPrimary, display: 'block' }}>
                Escucha la muestra de voz
              </strong>
              <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                Pulsa el reproductor en cada ficha para oír la voz de esa persona en el audio.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceDark,
                color: THEME_TOKENS.colors.textOnDark,
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                flexShrink: 0,
                marginTop: '0.1rem',
              }}
            >
              2
            </span>
            <div style={{ fontSize: '0.775rem' }}>
              <strong style={{ color: THEME_TOKENS.colors.textPrimary, display: 'block' }}>
                Escribe su nombre real y rol
              </strong>
              <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                Asigna el nombre de la persona (ej. Lic. Roberto Gómez) o elige su cargo procesal.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <span
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceDark,
                color: THEME_TOKENS.colors.textOnDark,
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.7rem',
                fontWeight: 700,
                flexShrink: 0,
                marginTop: '0.1rem',
              }}
            >
              3
            </span>
            <div style={{ fontSize: '0.775rem' }}>
              <strong style={{ color: THEME_TOKENS.colors.textPrimary, display: 'block' }}>
                Actualización instantánea
              </strong>
              <span style={{ color: THEME_TOKENS.colors.textSecondary }}>
                Todos los diálogos del documento adoptarán el nuevo nombre de inmediato.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Barra de Opciones Globales de Roles y Personalización */}
      <div
        style={{
          backgroundColor: '#ffffff',
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          borderRadius: THEME_TOKENS.radii.sm,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.85rem',
          boxShadow: THEME_TOKENS.shadows.xs,
        }}
      >
        {/* Opción de mostrar rol entre paréntesis al lado del nombre */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.8125rem',
            color: THEME_TOKENS.colors.textPrimary,
            cursor: 'pointer',
            fontWeight: 500,
            userSelect: 'none',
          }}
          title="Si está activo, en la transcripción y subtítulos aparecerá: Nombre (Rol)"
        >
          <input
            type="checkbox"
            checked={mostrarRolEnNombre}
            onChange={(e) => onToggleMostrarRolEnNombre?.(e.target.checked)}
            style={{ cursor: 'pointer', accentColor: THEME_TOKENS.colors.accentNavy }}
          />
          <span>Mostrar rol entre paréntesis al lado del nombre (ej. <em>Pedro González (Fiscal)</em>)</span>
        </label>

        {/* Añadir nuevo rol personalizado global */}
        <form
          onSubmit={handleAgregarRolGlobal}
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}
        >
          <input
            type="text"
            value={nuevoRolPersonalizado}
            onChange={(e) => setNuevoRolPersonalizado(e.target.value)}
            placeholder="Añadir rol personalizado global..."
            style={{
              padding: '0.35rem 0.6rem',
              borderRadius: THEME_TOKENS.radii.xs,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              fontSize: '0.78rem',
              minWidth: '220px',
              outline: 'none',
              backgroundColor: THEME_TOKENS.colors.surfaceBase,
            }}
          />
          <button
            type="button"
            onClick={() => handleAgregarRolGlobal()}
            style={{
              backgroundColor: THEME_TOKENS.colors.surfaceDark,
              color: '#ffffff',
              border: 'none',
              padding: '0.35rem 0.75rem',
              borderRadius: THEME_TOKENS.radii.xs,
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
            title="Añadir rol personalizado a la lista global para reutilizarlo en cualquier audio"
          >
            <span>+</span>
            <span>Añadir Rol</span>
          </button>
          {mensajeRol && (
            <span style={{ fontSize: '0.725rem', color: '#2A4A1C', fontWeight: 600 }}>
              {mensajeRol}
            </span>
          )}
        </form>
      </div>

      {/* Grid de Tarjetas Didácticas por Hablante */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1rem',
        }}
      >
        {listaHablantes.map((spk, idx) => {
          const totalIntervenciones = intervencionesPorHablante[spk.speakerId] || 0;
          const muestra = muestrasPorHablante[spk.speakerId];

          return (
            <div
              key={spk.speakerId}
              style={{
                backgroundColor: spk.colorBg,
                border: `1.5px solid ${spk.colorBorder}`,
                borderRadius: THEME_TOKENS.radii.sm,
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                boxShadow: THEME_TOKENS.shadows.sm,
                position: 'relative',
              }}
            >
              {/* Encabezado de la Tarjeta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: spk.color,
                      color: '#ffffff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}
                  >
                    {idx + 1}
                  </span>
                  <div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontFamily: THEME_TOKENS.fonts.mono,
                        color: THEME_TOKENS.colors.textMuted,
                        display: 'block',
                      }}
                    >
                      ID Técnico: {spk.speakerId}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '0.875rem', color: spk.color }}>
                        {spk.displayName}
                      </strong>
                      {TranscriptionReviewerService.estaHablanteIdentificado(spk) ? (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            backgroundColor: '#E8EFE3',
                            color: '#2A4A1C',
                            border: '1px solid #C4DAB5',
                            padding: '0.05rem 0.35rem',
                            borderRadius: '6px',
                            fontWeight: 600,
                          }}
                        >
                          ✓ Identificado
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.65rem',
                            backgroundColor: '#FEF3C7',
                            color: '#92400E',
                            border: '1px solid #FCD34D',
                            padding: '0.05rem 0.35rem',
                            borderRadius: '6px',
                            fontWeight: 600,
                          }}
                          title="Requisito pericial: asigne el nombre real de esta persona"
                        >
                          ⚠️ Asignar nombre
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contador de intervenciones */}
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: THEME_TOKENS.colors.textSecondary,
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    border: `1px solid ${spk.colorBorder}`,
                    padding: '0.15rem 0.5rem',
                    borderRadius: '12px',
                    fontWeight: 600,
                  }}
                  title={`Esta persona intervino ${totalIntervenciones} veces en la grabación`}
                >
                  🗣️ {totalIntervenciones} {totalIntervenciones === 1 ? 'intervención' : 'intervenciones'}
                </span>
              </div>

              {/* Muestra acústica de voz */}
              {muestra && (
                <div
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.75)',
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    borderRadius: THEME_TOKENS.radii.xs,
                    padding: '0.5rem 0.65rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: 600, color: THEME_TOKENS.colors.textSecondary }}>
                      🎙️ Muestra de voz de esta persona:
                    </span>
                    <span style={{ fontSize: '0.65rem', fontFamily: THEME_TOKENS.fonts.mono, color: THEME_TOKENS.colors.textMuted }}>
                      [{muestra.startTime.toFixed(1)}s - {muestra.endTime.toFixed(1)}s]
                    </span>
                  </div>

                  <AudioSegmentPlayer
                    startTime={muestra.startTime}
                    endTime={muestra.endTime}
                    audioUrl={audioUrl}
                  />

                  {muestra.sampleText && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        color: THEME_TOKENS.colors.textMuted,
                        fontStyle: 'italic',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                      title={muestra.sampleText}
                    >
                      &ldquo;{muestra.sampleText}&rdquo;
                    </span>
                  )}
                </div>
              )}

              {/* Campo para renombrar al hablante */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: THEME_TOKENS.colors.textPrimary,
                    marginBottom: '0.3rem',
                  }}
                >
                  Nombre completo de la persona:
                </label>
                <div style={{ display: 'flex', gap: '0.35rem' }}>
                  <input
                    type="text"
                    value={spk.displayName}
                    onChange={(e) => onRenombrarHablante(spk.speakerId, e.target.value)}
                    placeholder={`Ej. Lic. Roberto Gómez`}
                    style={{
                      flex: 1,
                      padding: '0.45rem 0.65rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
                      backgroundColor: '#ffffff',
                      fontSize: '0.8125rem',
                      fontWeight: 600,
                      color: THEME_TOKENS.colors.textPrimary,
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              {/* Selector de Rol Procesal o Cargo Institucional */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '0.725rem',
                    fontWeight: 500,
                    color: THEME_TOKENS.colors.textSecondary,
                    marginBottom: '0.25rem',
                  }}
                >
                  Rol o Cargo de la persona:
                </label>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={spk.role || ''}
                    onChange={(e) => {
                      const nuevoRol = e.target.value;
                      if (onAsignarRol) {
                        onAsignarRol(spk.speakerId, nuevoRol);
                      }
                    }}
                    placeholder="Escribe el cargo (ej. Juez, Fiscal, Testigo)"
                    style={{
                      flex: 1,
                      padding: '0.4rem 0.6rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      fontSize: '0.78rem',
                      backgroundColor: '#ffffff',
                      color: THEME_TOKENS.colors.textPrimary,
                      outline: 'none',
                    }}
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      const rolElegido = e.target.value;
                      if (!rolElegido) return;
                      if (onAsignarRol) {
                        onAsignarRol(spk.speakerId, rolElegido);
                      }
                    }}
                    style={{
                      padding: '0.4rem 0.5rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                      fontSize: '0.75rem',
                      backgroundColor: THEME_TOKENS.colors.surfaceBase,
                      color: THEME_TOKENS.colors.textSecondary,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                    title="Seleccionar sugerencia de rol predefinido"
                  >
                    <option value="">Roles guardados...</option>
                    {rolesDisponibles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                {spk.role && (
                  <span
                    style={{
                      fontSize: '0.6875rem',
                      backgroundColor: '#E8EFE3',
                      color: '#2A4A1C',
                      border: '1px solid #C4DAB5',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '8px',
                      fontWeight: 600,
                      display: 'inline-block',
                      marginTop: '0.35rem',
                    }}
                  >
                    📋 Rol asignado: {spk.role}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

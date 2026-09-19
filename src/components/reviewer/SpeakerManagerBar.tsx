import React from 'react';
import { SpeakerProfile } from '../../services/reviewer/types';
import { THEME_TOKENS } from '../../config/themeTokens';
import { AudioSegmentPlayer } from './AudioSegmentPlayer';

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
}

const ROLES_PREDEFINIDOS = [
  'Juez / Autoridad',
  'Fiscal / Ministerio Público',
  'Defensor / Abogado',
  'Perito / Especialista',
  'Testigo',
  'Víctima / Querellante',
  'Imputado / Declarante',
  'Secretario de Acuerdos',
  'Interlocutor / Participante',
];

export const SpeakerManagerBar: React.FC<SpeakerManagerBarProps> = ({
  speakers,
  intervencionesPorHablante = {},
  muestrasPorHablante = {},
  audioUrl,
  onRenombrarHablante,
  onAsignarRol,
  onAgregarHablante,
}) => {
  const listaHablantes = Object.values(speakers);

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
                    <strong style={{ fontSize: '0.875rem', color: spk.color }}>
                      {spk.displayName}
                    </strong>
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
                    <option value="">Sugerencias...</option>
                    {ROLES_PREDEFINIDOS.map((r) => (
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

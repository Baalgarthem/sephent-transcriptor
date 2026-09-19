import React, { useState } from 'react';
import { TranscriptionGroup } from '../../services/database/transcriptionGroupService';
import { StoredTranscription } from '../../services/database/transcriptionDatabase';
import { THEME_TOKENS } from '../../config/themeTokens';

interface ReviewerGroupSidebarProps {
  grupos: TranscriptionGroup[];
  transcripciones: StoredTranscription[];
  idTranscripcionActiva?: string;
  alSeleccionarTranscripcion: (id: string) => void;
  alMoverTranscripcionAGrupo: (transcriptionId: string, groupId: string | null) => void;
  alAbrirCrearGrupo: () => void;
  alAbrirEditarGrupo: (grupo: TranscriptionGroup) => void;
  alEliminarGrupo: (id: string) => void;
}

export const ReviewerGroupSidebar: React.FC<ReviewerGroupSidebarProps> = ({
  grupos,
  transcripciones,
  idTranscripcionActiva,
  alSeleccionarTranscripcion,
  alMoverTranscripcionAGrupo,
  alAbrirCrearGrupo,
  alAbrirEditarGrupo,
  alEliminarGrupo,
}) => {
  const [arrastrandoId, setArrastrandoId] = useState<string | null>(null);
  const [zonaActivaHover, setZonaActivaHover] = useState<string | null>(null);

  // Separar transcripciones sin agrupar vs agrupadas
  const sinAgrupar = transcripciones.filter((t) => !t.groupId);
  const porGrupo: Record<string, StoredTranscription[]> = {};

  grupos.forEach((g) => {
    porGrupo[g.id] = transcripciones.filter((t) => t.groupId === g.id);
  });

  // Handlers de Drag and Drop Nativo HTML5
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setArrastrandoId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setArrastrandoId(null);
    setZonaActivaHover(null);
  };

  const handleDragOver = (e: React.DragEvent, zonaId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (zonaActivaHover !== zonaId) {
      setZonaActivaHover(zonaId);
    }
  };

  const handleDragLeave = (_e: React.DragEvent, zonaId: string) => {
    if (zonaActivaHover === zonaId) {
      setZonaActivaHover(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetGroupId: string | null) => {
    e.preventDefault();
    setZonaActivaHover(null);
    const id = e.dataTransfer.getData('text/plain') || arrastrandoId;
    if (id) {
      alMoverTranscripcionAGrupo(id, targetGroupId);
    }
    setArrastrandoId(null);
  };

  return (
    <div
      style={{
        width: '335px',
        backgroundColor: THEME_TOKENS.colors.surfaceBase,
        borderRight: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        fontSize: '0.8125rem',
      }}
    >
      {/* Cabecera del Panel Lateral */}
      <div
        style={{
          padding: '0.85rem 1rem',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          backgroundColor: THEME_TOKENS.colors.bgCanvas,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <strong style={{ color: THEME_TOKENS.colors.textPrimary, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span>📂</span>
            <span>Casos y Expedientes</span>
          </strong>
          <span style={{ fontSize: '0.7rem', color: THEME_TOKENS.colors.textMuted }}>
            Jerarquía: Caso &gt; Transcripción &gt; Personas
          </span>
        </div>

        <button
          onClick={alAbrirCrearGrupo}
          style={{
            backgroundColor: THEME_TOKENS.colors.surfaceDark,
            color: '#fff',
            border: 'none',
            padding: '0.35rem 0.65rem',
            borderRadius: THEME_TOKENS.radii.xs,
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
          title="Crear un nuevo grupo contenedor (caso u objeto de análisis)"
        >
          <span>+</span>
          <span>Nuevo Caso</span>
        </button>
      </div>

      {/* Indicador pedagógico de Drag and Drop */}
      <div
        style={{
          padding: '0.45rem 1rem',
          backgroundColor: THEME_TOKENS.colors.accentTaupeBg,
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          fontSize: '0.7rem',
          color: THEME_TOKENS.colors.textSecondary,
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        <span>💡</span>
        <span>Arrastra transcripciones a cualquier grupo para organizarlas.</span>
      </div>

      {/* Contenedor con Scroll */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
        {/* Si no hay grupos creados aún */}
        {grupos.length === 0 && (
          <div
            style={{
              padding: '1rem',
              backgroundColor: '#ffffff',
              border: `1.5px dashed ${THEME_TOKENS.colors.borderStrong}`,
              borderRadius: THEME_TOKENS.radii.xs,
              textAlign: 'center',
              marginBottom: '0.85rem',
            }}
          >
            <div style={{ fontSize: '1.4rem', marginBottom: '0.3rem' }}>📁</div>
            <strong style={{ fontSize: '0.8rem', color: THEME_TOKENS.colors.textPrimary, display: 'block', marginBottom: '0.2rem' }}>
              No hay casos o expedientes creados
            </strong>
            <p style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary, margin: '0 0 0.65rem 0', lineHeight: 1.4 }}>
              Crea tu primer grupo contenedor para asociar un caso y sus detalles, y luego arrastra tus transcripciones.
            </p>
            <button
              onClick={alAbrirCrearGrupo}
              style={{
                backgroundColor: THEME_TOKENS.colors.surfaceDark,
                color: '#fff',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              + Crear Primer Caso
            </button>
          </div>
        )}

        {/* 1. Zona: Bandeja General ("Sin Agrupar") */}
        <div
          onDragOver={(e) => handleDragOver(e, 'general')}
          onDragLeave={(e) => handleDragLeave(e, 'general')}
          onDrop={(e) => handleDrop(e, null)}
          style={{
            backgroundColor: zonaActivaHover === 'general' ? '#F4EDE4' : THEME_TOKENS.colors.bgCanvas,
            border: `1.5px ${zonaActivaHover === 'general' ? 'dashed #8C7B6D' : 'solid ' + THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.xs,
            padding: '0.65rem 0.75rem',
            marginBottom: '0.85rem',
            transition: 'all 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <span style={{ fontWeight: 600, color: THEME_TOKENS.colors.textPrimary, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <span>📥</span>
              <span>Transcripciones Pendientes ({sinAgrupar.length})</span>
            </span>
            <span style={{ fontSize: '0.65rem', color: THEME_TOKENS.colors.textMuted }}>
              Sin agrupar
            </span>
          </div>

          {sinAgrupar.length === 0 ? (
            <div
              style={{
                fontSize: '0.7rem',
                color: THEME_TOKENS.colors.textMuted,
                fontStyle: 'italic',
                padding: '0.4rem 0.2rem',
                textAlign: 'center',
              }}
            >
              {zonaActivaHover === 'general' ? '¡Suelta aquí para desagrupar!' : 'Todas las transcripciones están organizadas en casos'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {sinAgrupar.map((trx) => (
                <TranscriptionDragCard
                  key={trx.id}
                  transcription={trx}
                  estaActiva={idTranscripcionActiva === trx.id}
                  estaSiendoArrastrada={arrastrandoId === trx.id}
                  onDragStart={(e) => handleDragStart(e, trx.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => alSeleccionarTranscripcion(trx.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* 2. Lista de Grupos Contenedores (Casos / Expedientes) */}
        {grupos.map((grupo) => {
          const items = porGrupo[grupo.id] || [];
          const esZonaHover = zonaActivaHover === grupo.id;

          return (
            <div
              key={grupo.id}
              onDragOver={(e) => handleDragOver(e, grupo.id)}
              onDragLeave={(e) => handleDragLeave(e, grupo.id)}
              onDrop={(e) => handleDrop(e, grupo.id)}
              style={{
                backgroundColor: esZonaHover ? '#F4EDE4' : THEME_TOKENS.colors.surfaceBase,
                border: `1.5px ${esZonaHover ? 'dashed #8C7B6D' : 'solid ' + THEME_TOKENS.colors.borderSubtle}`,
                borderLeft: `4px solid ${grupo.colorBadge || '#4A5568'}`,
                borderRadius: THEME_TOKENS.radii.xs,
                padding: '0.75rem',
                marginBottom: '0.85rem',
                boxShadow: THEME_TOKENS.shadows.sm,
                transition: 'all 0.15s ease',
              }}
            >
              {/* Nivel 1: Cabecera del Caso (Nombre y Detalles) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.35rem', marginBottom: '0.35rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span style={{ fontSize: '0.85rem' }}>📁</span>
                    <strong
                      style={{
                        fontSize: '0.8125rem',
                        color: THEME_TOKENS.colors.textPrimary,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        fontFamily: THEME_TOKENS.fonts.serif,
                      }}
                      title={grupo.nombre}
                    >
                      {grupo.nombre}
                    </strong>
                  </div>

                  {/* Detalles obligatorios del caso */}
                  {grupo.detalles && (
                    <p
                      style={{
                        fontSize: '0.7rem',
                        color: THEME_TOKENS.colors.textSecondary,
                        margin: '0.2rem 0 0 0',
                        lineHeight: 1.35,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                      title={grupo.detalles}
                    >
                      {grupo.detalles}
                    </p>
                  )}

                  {/* Metadatos Estructurados Complementarios */}
                  {(grupo.personaInvolucrada || grupo.numeroExpediente) && (
                    <div style={{ fontSize: '0.6875rem', color: THEME_TOKENS.colors.textMuted, marginTop: '0.25rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {grupo.personaInvolucrada && <span>👤 {grupo.personaInvolucrada}</span>}
                      {grupo.numeroExpediente && <span>⚖️ {grupo.numeroExpediente}</span>}
                    </div>
                  )}
                </div>

                {/* Acciones de Grupo */}
                <div style={{ display: 'flex', gap: '0.2rem' }}>
                  <button
                    onClick={() => alAbrirEditarGrupo(grupo)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      padding: '0.15rem 0.25rem',
                      color: THEME_TOKENS.colors.textSecondary,
                    }}
                    title="Editar nombre y detalles de este caso"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`¿Desea eliminar el caso "${grupo.nombre}"? Sus transcripciones no se borrarán, volverán a la bandeja de pendientes.`)) {
                        alEliminarGrupo(grupo.id);
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      padding: '0.15rem 0.25rem',
                      color: THEME_TOKENS.colors.textMuted,
                    }}
                    title="Eliminar este caso"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Zona de Transcripciones Contenidas */}
              <div style={{ marginTop: '0.65rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: THEME_TOKENS.colors.textMuted, textTransform: 'uppercase' }}>
                    Transcripciones ({items.length}):
                  </span>
                  <span style={{ fontSize: '0.65rem', color: THEME_TOKENS.colors.textMuted }}>
                    Zona Drag & Drop
                  </span>
                </div>

                {items.length === 0 ? (
                  <div
                    style={{
                      fontSize: '0.6875rem',
                      color: THEME_TOKENS.colors.textMuted,
                      fontStyle: 'italic',
                      padding: '0.5rem 0.25rem',
                      textAlign: 'center',
                      backgroundColor: 'rgba(0,0,0,0.02)',
                      borderRadius: '3px',
                      border: '1px dashed rgba(0,0,0,0.1)',
                    }}
                  >
                    {esZonaHover ? '¡Soltar aquí para agregar a este caso!' : 'Arrastra transcripciones a este caso'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {items.map((trx) => (
                      <TranscriptionDragCard
                        key={trx.id}
                        transcription={trx}
                        estaActiva={idTranscripcionActiva === trx.id}
                        estaSiendoArrastrada={arrastrandoId === trx.id}
                        onDragStart={(e) => handleDragStart(e, trx.id)}
                        onDragEnd={handleDragEnd}
                        onClick={() => alSeleccionarTranscripcion(trx.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface DragCardProps {
  transcription: StoredTranscription;
  estaActiva: boolean;
  estaSiendoArrastrada: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}

/**
 * Nivel 2: Transcripción (con su título original)
 * Nivel 3: Subsección de Personas (Hablantes de esa transcripción con sus muestras de voz)
 */
const TranscriptionDragCard: React.FC<DragCardProps> = ({
  transcription,
  estaActiva,
  estaSiendoArrastrada,
  onDragStart,
  onDragEnd,
  onClick,
}) => {
  const personas = transcription.speakerNames
    ? Object.entries(transcription.speakerNames)
    : [];

  return (
    <div
      draggable={true}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.35rem',
        padding: '0.5rem 0.6rem',
        backgroundColor: estaActiva ? THEME_TOKENS.colors.surfaceDark : '#ffffff',
        color: estaActiva ? '#ffffff' : THEME_TOKENS.colors.textPrimary,
        border: `1.5px solid ${estaActiva ? THEME_TOKENS.colors.surfaceDark : THEME_TOKENS.colors.borderSubtle}`,
        borderRadius: THEME_TOKENS.radii.xs,
        cursor: 'grab',
        opacity: estaSiendoArrastrada ? 0.4 : 1,
        transition: 'all 0.1s ease',
        userSelect: 'none',
        boxShadow: estaActiva ? THEME_TOKENS.shadows.sm : 'none',
      }}
      title={`Arrastra para mover a otro caso, o haz clic para abrir "${transcription.fileName}"`}
    >
      {/* Nivel 2: Título Original de la Transcripción */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ fontSize: '0.75rem', color: estaActiva ? '#ccc' : THEME_TOKENS.colors.textMuted, cursor: 'grab' }}>
          ⋮⋮
        </span>
        <span style={{ fontSize: '0.8rem' }}>
          {transcription.fileType === 'video' ? '🎬' : '🎵'}
        </span>
        <strong
          style={{
            flex: 1,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontSize: '0.775rem',
          }}
        >
          {transcription.fileName}
        </strong>
        {transcription.notes && (
          <span style={{ fontSize: '0.65rem' }} title="Contiene notas periciales">
            📝
          </span>
        )}
        <span
          style={{
            fontSize: '0.65rem',
            color: transcription.revisado
              ? (estaActiva ? '#A3E635' : '#216334')
              : (estaActiva ? '#FBBF24' : '#8A6100'),
            fontWeight: 700,
          }}
          title={transcription.revisado ? 'Transcripción revisada y aprobada' : 'Pendiente de revisión'}
        >
          {transcription.revisado ? '✓' : '⚠️'}
        </span>
      </div>

      {/* Nivel 3: Subsección de Personas de esta Transcripción */}
      <div
        style={{
          borderTop: `1px solid ${estaActiva ? 'rgba(255,255,255,0.15)' : THEME_TOKENS.colors.borderSubtle}`,
          paddingTop: '0.3rem',
          marginTop: '0.1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '0.65rem',
              color: estaActiva ? 'rgba(255,255,255,0.8)' : THEME_TOKENS.colors.textSecondary,
              fontWeight: 600,
            }}
          >
            👥 Personas ({personas.length > 0 ? personas.length : 'detectadas'}):
          </span>
        </div>

        {personas.length > 0 ? (
          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
            {personas.map(([spkId, nombre]) => (
              <span
                key={spkId}
                style={{
                  fontSize: '0.65rem',
                  backgroundColor: estaActiva ? 'rgba(255,255,255,0.15)' : THEME_TOKENS.colors.bgCanvas,
                  color: estaActiva ? '#ffffff' : THEME_TOKENS.colors.textPrimary,
                  border: `1px solid ${estaActiva ? 'rgba(255,255,255,0.25)' : THEME_TOKENS.colors.borderSubtle}`,
                  padding: '0.05rem 0.35rem',
                  borderRadius: '3px',
                  fontWeight: 500,
                }}
              >
                {nombre}
              </span>
            ))}
          </div>
        ) : (
          <span
            style={{
              fontSize: '0.625rem',
              color: estaActiva ? 'rgba(255,255,255,0.6)' : THEME_TOKENS.colors.textMuted,
              fontStyle: 'italic',
            }}
          >
            Haz clic para abrir y escuchar sus muestras de voz
          </span>
        )}
      </div>
    </div>
  );
};

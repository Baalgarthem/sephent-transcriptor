import React, { useState } from 'react';
import { ReviewedSegmentBlock, SpeakerProfile, CorrectionTrace } from '../../services/reviewer/types';
import { TranscriptionReviewerService } from '../../services/reviewer/transcriptionReviewerService';
import { AudioSegmentPlayer } from './AudioSegmentPlayer';
import { THEME_TOKENS } from '../../config/themeTokens';

interface SegmentBlockItemProps {
  block: ReviewedSegmentBlock;
  speaker?: SpeakerProfile;
  audioUrl?: string;
  seleccionado?: boolean;
  onToggleSeleccion?: (blockId: string) => void;
  onUnirConSiguiente?: (blockId: string) => void;
  esUltimo?: boolean;
  onAceptarSugerencia: (blockId: string, correctionId: string) => void;
  onRechazarSugerencia: (blockId: string, correctionId: string) => void;
  onEditarCorreccion: (blockId: string, correctionId: string, nuevoTexto: string) => void;
}

export const SegmentBlockItem: React.FC<SegmentBlockItemProps> = ({
  block,
  speaker,
  audioUrl,
  seleccionado,
  onToggleSeleccion,
  onUnirConSiguiente,
  esUltimo,
  onAceptarSugerencia,
  onRechazarSugerencia,
  onEditarCorreccion,
}) => {
  const [mostrarTrazabilidad, setMostrarTrazabilidad] = useState(false);
  const [sugerenciaActivaId, setSugerenciaActivaId] = useState<string | null>(null);
  const [editandoTexto, setEditandoTexto] = useState('');

  const colorHablante = speaker?.color || '#3B414B';
  const bgHablante = speaker?.colorBg || '#F5F5F7';
  const borderHablante = speaker?.colorBorder || '#D2D2D7';

  const tiempoInicio = TranscriptionReviewerService.formatearSegundos(block.startTime);
  const tiempoFin = TranscriptionReviewerService.formatearSegundos(block.endTime);

  const sugerenciaSeleccionada = block.corrections.find((c) => c.id === sugerenciaActivaId);

  return (
    <div
      style={{
        backgroundColor: seleccionado ? '#F9F8F6' : THEME_TOKENS.colors.surfaceBase,
        border: `1px solid ${seleccionado ? THEME_TOKENS.colors.surfaceDark : THEME_TOKENS.colors.borderSubtle}`,
        borderRadius: THEME_TOKENS.radii.sm,
        padding: '1rem 1.15rem',
        marginBottom: '0.85rem',
        boxShadow: THEME_TOKENS.shadows.sm,
        transition: `all ${THEME_TOKENS.transitions.fast}`,
      }}
    >
      {/* Cabecera del Bloque: Hablante, Timestamps, Reproductor */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.65rem',
          marginBottom: '0.65rem',
          paddingBottom: '0.45rem',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          {/* Checkbox de selección múltiple */}
          {onToggleSeleccion && (
            <input
              type="checkbox"
              checked={!!seleccionado}
              onChange={() => onToggleSeleccion(block.id)}
              title="Seleccionar este fragmento para combinarlo con otros"
              style={{
                cursor: 'pointer',
                width: '16px',
                height: '16px',
                accentColor: THEME_TOKENS.colors.surfaceDark,
              }}
            />
          )}

          {/* Badge del Hablante */}
          <span
            style={{
              backgroundColor: bgHablante,
              color: colorHablante,
              border: `1px solid ${borderHablante}`,
              padding: '0.2rem 0.6rem',
              borderRadius: THEME_TOKENS.radii.xs,
              fontSize: '0.8125rem',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: colorHablante,
                display: 'inline-block',
              }}
            />
            {block.speakerName}
          </span>

          {/* Timestamps Legibles [00:14:22 - 00:14:29] */}
          <span
            style={{
              fontFamily: THEME_TOKENS.fonts.mono,
              fontSize: '0.75rem',
              color: THEME_TOKENS.colors.textSecondary,
              backgroundColor: THEME_TOKENS.colors.bgSecondary,
              padding: '0.15rem 0.45rem',
              borderRadius: THEME_TOKENS.radii.xs,
              border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
            }}
          >
            [{tiempoInicio} - {tiempoFin}]
          </span>

          {/* Badge si fue unificado de varios fragmentos */}
          {block.wasMerged && (
            <span
              style={{
                fontSize: '0.6875rem',
                color: THEME_TOKENS.colors.textSecondary,
                backgroundColor: THEME_TOKENS.colors.accentTaupeBg,
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                padding: '0.1rem 0.4rem',
                borderRadius: THEME_TOKENS.radii.xs,
              }}
              title={block.mergeReason}
            >
              🔗 {block.originalSegments.length} fragmentos unidos
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Botón rápido para unir con el bloque siguiente */}
          {onUnirConSiguiente && !esUltimo && (
            <button
              onClick={() => onUnirConSiguiente(block.id)}
              title="Combinar este fragmento con el siguiente fragmento de audio"
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                borderRadius: THEME_TOKENS.radii.xs,
                color: THEME_TOKENS.colors.textSecondary,
                fontSize: '0.725rem',
                padding: '0.2rem 0.55rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                fontWeight: 500,
                transition: `all ${THEME_TOKENS.transitions.fast}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = THEME_TOKENS.colors.bgSecondary;
                e.currentTarget.style.color = THEME_TOKENS.colors.textPrimary;
                e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderDark;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary;
                e.currentTarget.style.borderColor = THEME_TOKENS.colors.borderSubtle;
              }}
            >
              <span>⬇️</span>
              <span>Unir con siguiente</span>
            </button>
          )}

          {/* Reproductor de Audio Acotado para este fragmento */}
          <AudioSegmentPlayer
            startTime={block.startTime}
            endTime={block.endTime}
            audioUrl={audioUrl}
          />
        </div>
      </div>

      {/* Texto Revisado con Resaltado Interactivo */}
      <div
        style={{
          fontSize: '0.95rem',
          lineHeight: '1.65',
          color: THEME_TOKENS.colors.textPrimary,
          fontFamily: THEME_TOKENS.fonts.sans,
          marginBottom: '0.75rem',
        }}
      >
        {block.reviewedText}
      </div>

      {/* Franja de Avisos / Sugerencias si existen correcciones */}
      {block.corrections.length > 0 && (
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgCanvas,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.xs,
            padding: '0.5rem 0.75rem',
            marginBottom: '0.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.75rem' }}>🔍</span>
            <strong style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary }}>
              Términos evaluados por el diccionario ({block.corrections.length}):
            </strong>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {block.corrections.map((c) => {
              const esAutoSeguro = c.type === 'auto_safe';
              const esPendiente = c.status === 'pending_review';
              const esRechazado = c.status === 'rejected';

              let badgeBg = '#EBF7EE';
              let badgeColor = '#216334';
              let badgeBorder = '#B6E2C0';

              if (esPendiente) {
                badgeBg = '#FFF8E6';
                badgeColor = '#8A6100';
                badgeBorder = '#F3D280';
              } else if (esRechazado) {
                badgeBg = '#FBEBEB';
                badgeColor = '#8A2020';
                badgeBorder = '#EAB0B0';
              }

              return (
                <button
                  key={c.id}
                  onClick={() => {
                    setSugerenciaActivaId(c.id);
                    setEditandoTexto(c.suggestedWord);
                  }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                    backgroundColor: badgeBg,
                    color: badgeColor,
                    border: `1px solid ${badgeBorder}`,
                    borderRadius: THEME_TOKENS.radii.xs,
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.725rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  title={c.reason}
                >
                  <span>{esAutoSeguro ? '✓ Auto:' : esPendiente ? '⚠️ Sugerencia:' : '✕ Conservado:'}</span>
                  <strong>{c.originalWord} → {c.suggestedWord}</strong>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal / Popover Interactivo para Sugerencia Seleccionada */}
      {sugerenciaSeleccionada && (
        <div
          style={{
            backgroundColor: '#FFFCF2',
            border: '1px solid #E6D29E',
            borderRadius: THEME_TOKENS.radii.sm,
            padding: '0.75rem 1rem',
            margin: '0.5rem 0',
            boxShadow: THEME_TOKENS.shadows.sm,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <strong style={{ fontSize: '0.8rem', color: '#664D03' }}>
              Revisión Pericial del Término: "{sugerenciaSeleccionada.originalWord}"
            </strong>
            <button
              onClick={() => setSugerenciaActivaId(null)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              ✕
            </button>
          </div>

          <p style={{ fontSize: '0.75rem', color: '#664D03', margin: '0 0 0.5rem 0' }}>
            {sugerenciaSeleccionada.reason} (Confianza: {(sugerenciaSeleccionada.confidence * 100).toFixed(0)}%)
          </p>

          {/* Opciones interactivas: Aceptar, Rechazar, Editar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                onAceptarSugerencia(block.id, sugerenciaSeleccionada.id);
                setSugerenciaActivaId(null);
              }}
              style={{
                backgroundColor: '#2E6930',
                color: '#fff',
                border: 'none',
                padding: '0.3rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ✓ Aceptar ("{sugerenciaSeleccionada.suggestedWord}")
            </button>

            <button
              onClick={() => {
                onRechazarSugerencia(block.id, sugerenciaSeleccionada.id);
                setSugerenciaActivaId(null);
              }}
              style={{
                backgroundColor: '#7A2424',
                color: '#fff',
                border: 'none',
                padding: '0.3rem 0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ✕ Rechazar (Mantener "{sugerenciaSeleccionada.originalWord}")
            </button>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="text"
                value={editandoTexto}
                onChange={(e) => setEditandoTexto(e.target.value)}
                placeholder="Corrección personalizada..."
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.5rem',
                  border: '1px solid #CCC',
                  borderRadius: THEME_TOKENS.radii.xs,
                  outline: 'none',
                }}
              />
              <button
                onClick={() => {
                  if (editandoTexto.trim()) {
                    onEditarCorreccion(block.id, sugerenciaSeleccionada.id, editandoTexto.trim());
                    setSugerenciaActivaId(null);
                  }
                }}
                style={{
                  backgroundColor: THEME_TOKENS.colors.surfaceDark,
                  color: '#fff',
                  border: 'none',
                  padding: '0.3rem 0.6rem',
                  borderRadius: THEME_TOKENS.radii.xs,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                ✏️ Aplicar Manual
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Botón y Sección Desplegable de Trazabilidad Forense */}
      <div>
        <button
          onClick={() => setMostrarTrazabilidad(!mostrarTrazabilidad)}
          style={{
            background: 'none',
            border: 'none',
            color: THEME_TOKENS.colors.textSecondary,
            fontSize: '0.725rem',
            cursor: 'pointer',
            padding: '0.2rem 0',
            textDecoration: 'underline',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <span>{mostrarTrazabilidad ? '▼' : '►'}</span>
          <span>{mostrarTrazabilidad ? 'Ocultar cotejo y trazabilidad' : 'Ver cotejo con original e historial de fragmentos'}</span>
        </button>

        {mostrarTrazabilidad && (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              backgroundColor: THEME_TOKENS.colors.bgSecondary,
              border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
              borderRadius: THEME_TOKENS.radii.xs,
              fontSize: '0.75rem',
            }}
          >
            <div style={{ marginBottom: '0.5rem' }}>
              <strong style={{ color: THEME_TOKENS.colors.textPrimary }}>Texto Original Reconocido (Crudo Whisper):</strong>
              <p style={{ margin: '0.2rem 0', color: THEME_TOKENS.colors.textSecondary, fontStyle: 'italic' }}>
                "{block.originalText}"
              </p>
            </div>

            <div>
              <strong style={{ color: THEME_TOKENS.colors.textPrimary }}>
                Fragmentos Originales Fusionados ({block.originalSegments.length}):
              </strong>
              <div style={{ marginTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {block.originalSegments.map((s, idx) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      fontFamily: THEME_TOKENS.fonts.mono,
                      fontSize: '0.7rem',
                      color: THEME_TOKENS.colors.textSecondary,
                    }}
                  >
                    <span>#{idx + 1}</span>
                    <span>[{TranscriptionReviewerService.formatearSegundos(s.startTime)} - {TranscriptionReviewerService.formatearSegundos(s.endTime)}]</span>
                    <span style={{ fontFamily: THEME_TOKENS.fonts.sans, color: THEME_TOKENS.colors.textPrimary }}>"{s.text}"</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

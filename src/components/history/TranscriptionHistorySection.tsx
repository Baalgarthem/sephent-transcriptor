/**
 * TranscriptionHistorySection — Vista del Historial de Transcripciones (SRP)
 * 
 * Componente modular desacoplado para visualizar, gestionar, descargar
 * y combinar transcripciones almacenadas localmente en la base de datos.
 */

import React, { useState } from 'react';
import { StoredTranscription, TranscriptionDatabase } from '../../services/database/transcriptionDatabase';
import { THEME_TOKENS } from '../../config/themeTokens';

export interface TranscriptionHistorySectionProps {
  historial: StoredTranscription[];
  alCerrar: () => void;
  alEliminarRegistro: (id: string) => void;
  alVaciarHistorial: () => void;
  alAbrirRevisor: (fileName?: string, id?: string, audioUrl?: string, segments?: any[]) => void;
  alDescargarInforme: (id: string, fileName: string) => void;
  onActualizarHistorial: () => void;
}

export const TranscriptionHistorySection: React.FC<TranscriptionHistorySectionProps> = ({
  historial,
  alCerrar,
  alEliminarRegistro,
  alVaciarHistorial,
  alAbrirRevisor,
  alDescargarInforme,
  onActualizarHistorial,
}) => {
  const [transcripcionesSeleccionadas, setTranscripcionesSeleccionadas] = useState<Set<string>>(new Set());

  const handleToggleSeleccionTrx = (id: string) => {
    setTranscripcionesSeleccionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCombinarTranscripcionesSeleccionadas = () => {
    const ids = Array.from(transcripcionesSeleccionadas);
    if (ids.length !== 2) {
      alert('Por favor selecciona exactamente dos transcripciones para combinarlas en una sola.');
      return;
    }

    const combinada = TranscriptionDatabase.combinarDosTranscripciones(ids[0], ids[1]);
    if (combinada) {
      onActualizarHistorial();
      setTranscripcionesSeleccionadas(new Set());
      alert(`¡Transcripciones combinadas exitosamente!\n\nSe ha consolidado una nueva transcripción:\n"${combinada.fileName}"\n(Folio: ${combinada.id})`);
    } else {
      alert('No se pudieron combinar las transcripciones seleccionadas.');
    }
  };

  const handleDescargarContenido = (contenido: string | undefined, nombreArchivo: string) => {
    if (!contenido) return;
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      style={{
        marginTop: '1.5rem',
        backgroundColor: THEME_TOKENS.colors.surfaceBase,
        border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
        borderRadius: THEME_TOKENS.radii.md,
        padding: '1.5rem',
        boxShadow: THEME_TOKENS.shadows.md,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          paddingBottom: '0.65rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '1.1rem',
              fontFamily: THEME_TOKENS.fonts.serif,
              fontWeight: 600,
              color: THEME_TOKENS.colors.textPrimary,
            }}
          >
            🗄️ Base de Datos de Transcripciones Realizadas
          </h3>
          <span style={{ fontSize: '0.775rem', color: THEME_TOKENS.colors.textMuted }}>
            Registro histórico local persistente de expedientes procesados y sus rutas de guardado
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'center' }}>
          {historial.length > 0 && (
            <button
              onClick={alVaciarHistorial}
              style={{
                backgroundColor: 'transparent',
                border: `1px solid ${THEME_TOKENS.colors.stateErrorBorder}`,
                color: THEME_TOKENS.colors.stateError,
                padding: '0.25rem 0.65rem',
                fontSize: '0.75rem',
                borderRadius: THEME_TOKENS.radii.xs,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Vaciar base de datos
            </button>
          )}
          <button
            onClick={alCerrar}
            title="Cerrar vista de base de datos"
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              lineHeight: 1,
              cursor: 'pointer',
              color: THEME_TOKENS.colors.textMuted,
              padding: '0.25rem',
            }}
          >
            &times;
          </button>
        </div>
      </div>

      {historial.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: '0.85rem',
            color: THEME_TOKENS.colors.textMuted,
            fontStyle: 'italic',
            textAlign: 'center',
            padding: '2rem 1rem',
          }}
        >
          No hay transcripciones registradas aún en la base de datos local.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {transcripcionesSeleccionadas.size > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#F0F4EC',
                border: '1px solid #C8D8B8',
                padding: '0.6rem 1rem',
                borderRadius: THEME_TOKENS.radii.xs,
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }}>🔗</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#2E4720' }}>
                  {transcripcionesSeleccionadas.size === 2
                    ? '2 transcripciones seleccionadas para combinar'
                    : `${transcripcionesSeleccionadas.size} seleccionada(s) (selecciona exactamente 2 para combinar)`}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {transcripcionesSeleccionadas.size === 2 && (
                  <button
                    type="button"
                    onClick={handleCombinarTranscripcionesSeleccionadas}
                    style={{
                      backgroundColor: '#4E6A3B',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '0.35rem 0.75rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    🧩 Combinar en una sola transcripción (1 clic)
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setTranscripcionesSeleccionadas(new Set())}
                  style={{
                    backgroundColor: 'transparent',
                    color: THEME_TOKENS.colors.textSecondary,
                    border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                    padding: '0.3rem 0.6rem',
                    borderRadius: THEME_TOKENS.radii.xs,
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  Desmarcar
                </button>
              </div>
            </div>
          )}

          {historial.map((item) => (
            <div
              key={item.id}
              style={{
                backgroundColor: THEME_TOKENS.colors.bgCanvas,
                border: `1px solid ${
                  transcripcionesSeleccionadas.has(item.id)
                    ? '#4E6A3B'
                    : THEME_TOKENS.colors.borderSubtle
                }`,
                borderLeft: `4px solid ${
                  transcripcionesSeleccionadas.has(item.id)
                    ? '#4E6A3B'
                    : item.revisado
                    ? '#1E4620'
                    : THEME_TOKENS.colors.surfaceDark
                }`,
                borderRadius: THEME_TOKENS.radii.xs,
                padding: '0.85rem 1rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input
                      type="checkbox"
                      checked={transcripcionesSeleccionadas.has(item.id)}
                      onChange={() => handleToggleSeleccionTrx(item.id)}
                      title="Selecciona exactamente 2 transcripciones para combinarlas"
                      style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                    />
                    <strong style={{ fontSize: '0.9rem', color: THEME_TOKENS.colors.textPrimary }}>
                      {item.fileName}
                    </strong>
                    <span
                      style={{
                        fontSize: '0.725rem',
                        backgroundColor: THEME_TOKENS.colors.surfaceDark,
                        color: THEME_TOKENS.colors.textOnDark,
                        padding: '0.1rem 0.4rem',
                        borderRadius: THEME_TOKENS.radii.xs,
                        fontFamily: THEME_TOKENS.fonts.mono,
                      }}
                    >
                      {item.fileType.toUpperCase()}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textMuted }}>
                      ({item.fileSizeFormatted})
                    </span>

                    {item.revisado ? (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#E8F5E9',
                          color: '#1E4620',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '10px',
                          border: '1px solid #C8E6C9',
                          fontWeight: 600,
                        }}
                      >
                        ✓ Revisada pericialmente
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.7rem',
                          backgroundColor: '#FFF8E1',
                          color: '#8D6E63',
                          padding: '0.1rem 0.45rem',
                          borderRadius: '10px',
                          border: '1px solid #FFE082',
                          fontWeight: 500,
                        }}
                      >
                        ⚖️ Sin peritaje
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textSecondary, marginTop: '0.3rem' }}>
                    Modelo: <strong>{item.modelUsed}</strong> &middot; Idioma: <strong>{item.language}</strong> &middot; Fecha: {item.date}
                    {item.horaInicio && item.horaFin && (
                      <> &middot; Inicio: <strong>{item.horaInicio}</strong> &middot; Fin: <strong>{item.horaFin}</strong></>
                    )}
                    {item.duracionFormateada && (
                      <> &middot; Tardó: <strong>{item.duracionFormateada}</strong></>
                    )}
                    {item.rawSegments && item.rawSegments.length > 0 && (
                      <> &middot; <strong>{item.rawSegments.length}</strong> fragmentos</>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: THEME_TOKENS.colors.textMuted,
                      marginTop: '0.2rem',
                      fontFamily: THEME_TOKENS.fonts.mono,
                      wordBreak: 'break-all',
                    }}
                  >
                    Carpeta destino: {item.destinationFolder}
                  </div>

                  {item.speakerNames && Object.keys(item.speakerNames).length > 0 && (
                    <div style={{ marginTop: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.725rem', color: THEME_TOKENS.colors.textSecondary, fontWeight: 600 }}>
                        👥 Hablantes identificados:
                      </span>
                      {Object.entries(item.speakerNames).map(([spkId, name]) => (
                        <span
                          key={spkId}
                          style={{
                            fontSize: '0.7rem',
                            backgroundColor: THEME_TOKENS.colors.surfaceBase,
                            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                            padding: '0.1rem 0.45rem',
                            borderRadius: '10px',
                            color: THEME_TOKENS.colors.textPrimary,
                            fontWeight: 500,
                          }}
                        >
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => alAbrirRevisor(item.fileName, item.id, item.audioBlobUrl, item.rawSegments)}
                    style={{
                      backgroundColor: THEME_TOKENS.colors.surfaceDark,
                      color: THEME_TOKENS.colors.textOnDark,
                      border: 'none',
                      padding: '0.35rem 0.75rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    title="Abrir Módulo Pericial para auditar interlocutores y evidencia"
                  >
                    <span>⚖️</span>
                    <span>Módulo Pericial</span>
                  </button>

                  <button
                    onClick={() => alDescargarInforme(item.id, item.fileName)}
                    style={{
                      backgroundColor: item.revisado ? '#1E4620' : 'transparent',
                      color: item.revisado ? '#ffffff' : THEME_TOKENS.colors.textPrimary,
                      border: `1px solid ${item.revisado ? '#1E4620' : THEME_TOKENS.colors.borderDark}`,
                      padding: '0.35rem 0.75rem',
                      borderRadius: THEME_TOKENS.radii.xs,
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      fontWeight: 600,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                    title={
                      item.revisado
                        ? 'Descargar Dictamen Pericial Oficial Certificado'
                        : 'Emitir Dictamen Pericial Forense'
                    }
                  >
                    <span>{item.revisado ? '📑' : '⚖️'}</span>
                    <span>{item.revisado ? 'Descargar Dictamen' : 'Emitir Dictamen'}</span>
                  </button>

                  <button
                    onClick={() => alEliminarRegistro(item.id)}
                    title="Eliminar este expediente de la base de datos"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: THEME_TOKENS.colors.textMuted,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      padding: '0.2rem 0.4rem',
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              <div style={{ marginTop: '0.6rem', display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                {item.outputs.map((out, outIdx) => {
                  const contenido = out.format === 'txt' ? item.textContent : item.srtContent;
                  return (
                    <button
                      key={outIdx}
                      type="button"
                      onClick={() => handleDescargarContenido(contenido, out.fileName)}
                      style={{
                        fontSize: '0.725rem',
                        padding: '0.2rem 0.55rem',
                        backgroundColor: THEME_TOKENS.colors.surfaceBase,
                        border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
                        borderRadius: THEME_TOKENS.radii.xs,
                        fontFamily: THEME_TOKENS.fonts.mono,
                        color: THEME_TOKENS.colors.textPrimary,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        fontWeight: 500,
                      }}
                      title={`Descargar archivo ${out.fileName} (Ubicación: ${out.fullPath})`}
                    >
                      <span>↓</span>
                      <span>{out.fileName} ({out.format.toUpperCase()})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

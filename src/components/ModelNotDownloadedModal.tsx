import React from 'react';
import { WHISPER_MODELS } from '../config/whisperConfig';
import { THEME_TOKENS } from '../config/themeTokens';

interface ModelNotDownloadedModalProps {
  abierto: boolean;
  modeloId: string;
  alCerrar: () => void;
  alAbrirGestor: () => void;
  alDescargarAhora: () => void;
}

export const ModelNotDownloadedModal: React.FC<ModelNotDownloadedModalProps> = ({
  abierto,
  modeloId,
  alCerrar,
  alAbrirGestor,
  alDescargarAhora,
}) => {
  if (!abierto) return null;

  const def = WHISPER_MODELS[modeloId];
  const nombreModelo = def ? def.nombreVisible : modeloId;
  const tamanoMB = def ? def.tamanoAproximadoMB : 'desconocido';

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(18, 18, 18, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '1rem',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        style={{
          backgroundColor: THEME_TOKENS.colors.surfaceBase,
          borderRadius: THEME_TOKENS.radii.lg,
          width: '100%',
          maxWidth: '540px',
          padding: '2rem',
          boxShadow: THEME_TOKENS.shadows.modal,
          fontFamily: THEME_TOKENS.fonts.sans,
          border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
        }}
      >
        {/* Encabezado formal */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.25rem' }}>
          <div
            style={{
              backgroundColor: THEME_TOKENS.colors.stateWarningBg,
              color: THEME_TOKENS.colors.stateWarning,
              border: `1px solid ${THEME_TOKENS.colors.stateWarningBorder}`,
              borderRadius: THEME_TOKENS.radii.sm,
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.2rem',
              flexShrink: 0,
            }}
          >
            §
          </div>
          <div>
            <h3
              style={{
                margin: '0 0 0.25rem 0',
                color: THEME_TOKENS.colors.textPrimary,
                fontSize: '1.25rem',
                fontFamily: THEME_TOKENS.fonts.serif,
                fontWeight: 600,
              }}
            >
              Modelo de Voz No Descargado
            </h3>
            <span style={{ fontSize: '0.825rem', color: THEME_TOKENS.colors.textSecondary }}>
              Requisito previo para el procesamiento de audio local
            </span>
          </div>
        </div>

        {/* Mensaje descriptivo con borde fino editorial */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            borderLeft: `3px solid ${THEME_TOKENS.colors.stateWarning}`,
            padding: '1rem 1.25rem',
            marginBottom: '1.25rem',
            fontSize: '0.875rem',
            color: THEME_TOKENS.colors.textPrimary,
            lineHeight: 1.5,
          }}
        >
          <p style={{ margin: '0 0 0.4rem 0' }}>
            Ha seleccionado el modelo <strong>{nombreModelo}</strong> (~{tamanoMB} MB). Este archivo aún <strong>no está instalado</strong> en su equipo.
          </p>
          <p style={{ margin: 0, color: THEME_TOKENS.colors.textSecondary, fontSize: '0.825rem' }}>
            Para transcribir con este nivel de precisión, es necesario descargarlo o cargar una copia de seguridad previa.
          </p>
        </div>

        {/* Recordatorio de gestión de modelos */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.accentTaupeBg,
            border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            borderRadius: THEME_TOKENS.radii.sm,
            padding: '0.85rem 1rem',
            marginBottom: '1.75rem',
            fontSize: '0.825rem',
            color: THEME_TOKENS.colors.textSecondary,
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.6rem',
            lineHeight: 1.45,
          }}
        >
          <span style={{ color: THEME_TOKENS.colors.accentTaupe, fontWeight: 700 }}>◈</span>
          <div>
            <strong style={{ color: THEME_TOKENS.colors.textPrimary }}>Disposición operativa:</strong> Puede gestionar sus modelos, auditar la caché oficial o importar respaldos externos en cualquier momento mediante el botón <strong>"Gestionar modelos"</strong> en la cabecera.
          </div>
        </div>

        {/* Botones de acción jerarquizados */}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            onClick={alCerrar}
            style={{
              padding: '0.55rem 1.1rem',
              backgroundColor: THEME_TOKENS.colors.surfaceBase,
              color: THEME_TOKENS.colors.textSecondary,
              border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: `all ${THEME_TOKENS.transitions.fast}`,
            }}
          >
            Cerrar
          </button>

          <button
            onClick={alAbrirGestor}
            style={{
              padding: '0.55rem 1.15rem',
              backgroundColor: THEME_TOKENS.colors.surfaceBase,
              color: THEME_TOKENS.colors.textPrimary,
              border: `1px solid ${THEME_TOKENS.colors.borderStrong}`,
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: THEME_TOKENS.shadows.sm,
              transition: `all ${THEME_TOKENS.transitions.fast}`,
            }}
          >
            Abrir Gestor
          </button>

          <button
            onClick={alDescargarAhora}
            style={{
              padding: '0.55rem 1.25rem',
              backgroundColor: THEME_TOKENS.colors.accentPrimary,
              color: THEME_TOKENS.colors.textOnDark,
              border: 'none',
              borderRadius: THEME_TOKENS.radii.sm,
              fontSize: '0.825rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: THEME_TOKENS.shadows.sm,
              transition: `background-color ${THEME_TOKENS.transitions.fast}`,
            }}
          >
            Descargar ahora
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelNotDownloadedModal;

import React, { useState } from 'react';
import { THEME_TOKENS } from '../config/themeTokens';
import { APP_VERSION } from '../config/appConfig';

interface HelpModalProps {
  abierto: boolean;
  alCerrar: () => void;
  seccionInicial?: 'general' | 'modelos' | 'formatos' | 'forense' | 'plataforma';
}

export const HelpModal: React.FC<HelpModalProps> = ({
  abierto,
  alCerrar,
  seccionInicial = 'general',
}) => {
  const [seccionActiva, setSeccionActiva] = useState<string>(seccionInicial);

  if (!abierto) return null;

  return (
    <div
      className="modal-overlay"
      onClick={alCerrar}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(28, 25, 23, 0.75)',
        backdropFilter: 'blur(3px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: THEME_TOKENS.colors.surfaceBase,
          borderRadius: THEME_TOKENS.radii.md,
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: THEME_TOKENS.shadows.lg,
          border: `1px solid ${THEME_TOKENS.colors.borderDark}`,
          overflow: 'hidden',
          fontFamily: THEME_TOKENS.fonts.sans,
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            backgroundColor: THEME_TOKENS.colors.surfaceDark,
            padding: '1.25rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderDark}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: THEME_TOKENS.colors.accentGold,
                color: THEME_TOKENS.colors.surfaceDark,
                fontWeight: 'bold',
                fontSize: '0.9rem',
              }}
            >
              ?
            </span>
            <div>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.15rem',
                  fontFamily: THEME_TOKENS.fonts.serif,
                  color: THEME_TOKENS.colors.textOnDark,
                  letterSpacing: '0.02em',
                }}
              >
                Guía de Uso y Manual Didáctico — Sephent Transcriptor v{APP_VERSION}
              </h3>
              <span style={{ fontSize: '0.75rem', color: THEME_TOKENS.colors.textOnDarkMuted }}>
                Aprende cómo funciona el sistema, sus reglas forenses y mejores prácticas
              </span>
            </div>
          </div>

          <button
            onClick={alCerrar}
            style={{
              background: 'transparent',
              border: 'none',
              color: THEME_TOKENS.colors.textOnDarkMuted,
              fontSize: '1.4rem',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            title="Cerrar ventana de ayuda"
          >
            &times;
          </button>
        </div>

        {/* Barra de Pestañas de Navegación Temática */}
        <div
          style={{
            display: 'flex',
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            overflowX: 'auto',
          }}
        >
          {[
            { id: 'general', label: '🚀 Flujo en 4 Pasos' },
            { id: 'modelos', label: '🧠 Modelos Whisper' },
            { id: 'formatos', label: '📄 Formatos de Salida' },
            { id: 'forense', label: '🛡️ Validación y Hashes' },
            { id: 'plataforma', label: '📱 Desktop y Android' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSeccionActiva(tab.id)}
              style={{
                padding: '0.75rem 1rem',
                border: 'none',
                background: seccionActiva === tab.id ? THEME_TOKENS.colors.surfaceBase : 'transparent',
                color: seccionActiva === tab.id ? THEME_TOKENS.colors.textPrimary : THEME_TOKENS.colors.textSecondary,
                fontWeight: seccionActiva === tab.id ? 700 : 500,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                borderBottom: seccionActiva === tab.id ? `2px solid ${THEME_TOKENS.colors.accentTaupe}` : 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Cuerpo con Contenido Scrollable */}
        <div
          style={{
            padding: '1.5rem',
            overflowY: 'auto',
            flex: 1,
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: THEME_TOKENS.colors.textPrimary,
          }}
        >
          {seccionActiva === 'general' && (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontFamily: THEME_TOKENS.fonts.serif, fontSize: '1.05rem' }}>
                El Flujo Pericial en 4 Pasos Sencillos
              </h4>
              <p style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: '0.8125rem', marginTop: 0 }}>
                Sephent Transcriptor está diseñado bajo una arquitectura pericial estricta: cada documento generado
                conserva exactamente el nombre del archivo de origen para garantizar la cadena de custodia y la trazabilidad.
              </p>

              <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
                <div style={{ padding: '0.85rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`, borderRadius: THEME_TOKENS.radii.xs }}>
                  <strong style={{ color: THEME_TOKENS.colors.surfaceDark }}>1. Cargar Archivos de Audio o Video:</strong>
                  <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Arrastra o examina tus archivos (.mp3, .wav, .m4a, .mp4, .mkv, .flac). Puedes encolar varios archivos a la vez. El nombre de tu archivo nunca será alterado ni reemplazado.
                  </p>
                </div>

                <div style={{ padding: '0.85rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`, borderRadius: THEME_TOKENS.radii.xs }}>
                  <strong style={{ color: THEME_TOKENS.colors.surfaceDark }}>2. Elegir el Modelo y el Idioma:</strong>
                  <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Selecciona el modelo de Inteligencia Artificial según el equilibrio que requieras entre velocidad y precisión. El programa siempre recordará tus opciones y modelos descargados.
                  </p>
                </div>

                <div style={{ padding: '0.85rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`, borderRadius: THEME_TOKENS.radii.xs }}>
                  <strong style={{ color: THEME_TOKENS.colors.surfaceDark }}>3. Iniciar Transcripción:</strong>
                  <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    El motor acústico procesará el audio analizando la voz (VAD) y los turnos de diálogo. Al terminar, se generarán los archivos de texto (.txt) y subtítulos (.srt) descargables de inmediato.
                  </p>
                </div>

                <div style={{ padding: '0.85rem', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: THEME_TOKENS.radii.xs }}>
                  <strong style={{ color: '#166534' }}>4. Revisar Hablantes, Generar Hash y Emitir Informe:</strong>
                  <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.8rem', color: '#166534' }}>
                    Al finalizar, se abrirá el panel pericial. Escucha las muestras de voz de cada interlocutor, asígnales sus nombres y roles reales, calcula el Hash SHA-256 de integridad y valida la transcripción para desbloquear el Informe Oficial.
                  </p>
                </div>
              </div>
            </div>
          )}

          {seccionActiva === 'modelos' && (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontFamily: THEME_TOKENS.fonts.serif, fontSize: '1.05rem' }}>
                Guía de Selección de Modelos Whisper (OpenAI)
              </h4>
              <p style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: '0.8125rem', marginTop: 0 }}>
                Todos los modelos se descargan y verifican en la <strong>Ruta Oficial Estándar de OpenAI Whisper</strong>
                (<code>%USERPROFILE%\.cache\whisper</code> en Windows). Si un modelo ya existe en tu equipo, el programa lo
                detecta automáticamente mediante una comprobación SHA-256 para evitar duplicar descargas o gastar datos.
              </p>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem', fontSize: '0.8rem' }}>
                <thead>
                  <tr style={{ backgroundColor: THEME_TOKENS.colors.surfaceDark, color: '#fff', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem 0.75rem' }}>Modelo</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>Tamaño</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>Velocidad</th>
                    <th style={{ padding: '0.5rem 0.75rem' }}>Uso Recomendado</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}><strong>Tiny</strong></td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>~75 MB</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>⚡ Muy rápida</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>Pruebas rápidas y audios cortos sin ruido</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`, backgroundColor: '#FAF8F5' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}><strong>Base</strong></td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>~145 MB</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>⚡ Rápida</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>Transcripción cotidiana de buena calidad</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}><strong>Small</strong></td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>~465 MB</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>⚖️ Moderada</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>Equilibrio profesional entre tiempo y vocabulario</td>
                  </tr>
                  <tr style={{ borderBottom: `1px solid ${THEME_TOKENS.colors.borderSubtle}`, backgroundColor: '#FAF8F5' }}>
                    <td style={{ padding: '0.5rem 0.75rem' }}><strong>Medium</strong></td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>~1.5 GB</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>🐢 Precisa</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>Auditorías periciales, términos jurídicos y técnicos</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.5rem 0.75rem' }}><strong>Large</strong></td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>~3.0 GB</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>🔬 Máxima</td>
                    <td style={{ padding: '0.5rem 0.75rem' }}>Máxima fidelidad forense, acentos y múltiples idiomas</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {seccionActiva === 'formatos' && (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontFamily: THEME_TOKENS.fonts.serif, fontSize: '1.05rem' }}>
                Formatos de Salida Documentales
              </h4>
              <p style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: '0.8125rem', marginTop: 0 }}>
                Todas las salidas preservan exactamente el nombre original del archivo procesado, cambiando únicamente su extensión:
              </p>

              <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
                <div style={{ padding: '0.75rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <strong>📄 Formato TXT (.txt) — Acta Literal de Transcripción</strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Genera un documento estructurado con encabezado formal, datos del expediente, modelo utilizado,
                    lista de hablantes identificados y el diálogo cronológico con marcas de tiempo <code>[MM:SS - MM:SS]</code>.
                  </p>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <strong>⏱️ Formato SRT (.srt) — Subtítulos Periciales</strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Archivo de subtítulos canónico compatible con cualquier reproductor de video (VLC, Windows Media, etc.),
                    mostrando las marcas de tiempo precisas <code>00:00:00,000 --&gt; 00:00:00,000</code> y el nombre del hablante.
                  </p>
                </div>

                <div style={{ padding: '0.75rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <strong>📑 Informe Oficial de Transcripción</strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Dictamen formal con certificación forense, sello de revisión, identificación nominal de todos los
                    hablantes y la firma criptográfica Hash SHA-256. (Requiere validación previa en el Revisor).
                  </p>
                </div>
              </div>
            </div>
          )}

          {seccionActiva === 'forense' && (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontFamily: THEME_TOKENS.fonts.serif, fontSize: '1.05rem' }}>
                Cadena de Custodia, Hashes Criptográficos e Integridad Procesal
              </h4>
              <p style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: '0.8125rem', marginTop: 0 }}>
                En procedimientos jurídicos, periciales y forenses, una transcripción carece de valor probatorio si no se
                garantiza su inmutabilidad y la identidad de los intervinientes.
              </p>

              <div style={{ padding: '0.85rem', backgroundColor: '#FFF9EB', border: '1px solid #FFE58F', borderRadius: THEME_TOKENS.radii.xs, marginTop: '1rem' }}>
                <strong style={{ color: '#8A6100' }}>🔒 ¿Por qué el Informe Oficial está inicialmente bloqueado?</strong>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: '#8A6100' }}>
                  Por estricto protocolo de calidad procesal, no se permite emitir un informe oficial sin que el perito
                  o usuario haya validado los hablantes y marcado la casilla <strong>"Marcar como Revisada y Aprobada"</strong>.
                  Esto asegura que ningún informe sea presentado con etiquetas genéricas sin auditar.
                </p>
              </div>

              <div style={{ padding: '0.85rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`, borderRadius: THEME_TOKENS.radii.xs, marginTop: '0.85rem' }}>
                <strong>🛡️ Hash SHA-256 de Integridad Forense:</strong>
                <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                  El sistema genera una huella digital única (64 caracteres hexadecimales) basada en el archivo original,
                  la fecha, los modelos y la transcripción exacta. Cualquier modificación posterior al texto alteraría el hash,
                  demostrando de inmediato si el documento fue manipulado.
                </p>
              </div>
            </div>
          )}

          {seccionActiva === 'plataforma' && (
            <div>
              <h4 style={{ margin: '0 0 0.75rem 0', fontFamily: THEME_TOKENS.fonts.serif, fontSize: '1.05rem' }}>
                Compatibilidad Multiplataforma y Política Cero CMD
              </h4>
              <p style={{ color: THEME_TOKENS.colors.textSecondary, fontSize: '0.8125rem', marginTop: 0 }}>
                Sephent Transcriptor está diseñado para operar limpiamente tanto en equipos de escritorio (Windows, Mac, Linux)
                como en dispositivos móviles (Android):
              </p>

              <div style={{ display: 'grid', gap: '0.85rem', marginTop: '1rem' }}>
                <div style={{ padding: '0.85rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <strong>🔇 Ventanas de CMD 100% Ocultas (Zero CMD Policy):</strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Toda la comprobación y ejecución se realiza en memoria mediante la Web Audio API y algoritmos internos.
                    En Windows Desktop, los procesos están blindados con la bandera <code>CREATE_NO_WINDOW (0x08000000)</code>
                    y <code>windowsHide: true</code>, garantizando que jamás aparezca ninguna ventana emergente de terminal o CMD.
                  </p>
                </div>

                <div style={{ padding: '0.85rem', backgroundColor: '#FAF8F5', border: `1px solid ${THEME_TOKENS.colors.borderSubtle}` }}>
                  <strong>🤖 Preparación Nativa para Android:</strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem', color: THEME_TOKENS.colors.textSecondary }}>
                    Al compilarse o ejecutarse en Android, el sistema adapta las rutas de archivos al almacenamiento
                    interno de la aplicación (sandbox) y prescinde de cualquier llamada a shells de escritorio,
                    asegurando un rendimiento fluido y libre de errores.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pie del Modal */}
        <div
          style={{
            padding: '1rem 1.5rem',
            backgroundColor: THEME_TOKENS.colors.bgSecondary,
            borderTop: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
            display: 'flex',
            justifyContent: 'flex-end',
          }}
        >
          <button
            onClick={alCerrar}
            style={{
              backgroundColor: THEME_TOKENS.colors.surfaceDark,
              color: THEME_TOKENS.colors.textOnDark,
              border: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: THEME_TOKENS.radii.xs,
              fontSize: '0.8125rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Entendido / Cerrar Guía
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * AppErrorBoundary — Escudo Anticaídas del Frontend (Estilo Arturo)
 * 
 * Captura excepciones imprevistas en el ciclo de vida o renderizado de React,
 * previene el cierre súbito de la aplicación de escritorio y persiste automáticamente
 * el diagnóstico en el archivo de log del programa (sephent_errores.log).
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { THEME_TOKENS } from '../config/themeTokens';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  logPath: string | null;
}

export class AppErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      logPath: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Registrar en archivo de logs del programa a través de Tauri
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
      try {
        (window as any).__TAURI__
          .invoke('registrar_error_log', {
            componente: 'ReactUI:ErrorBoundary',
            mensaje: `${error.name}: ${error.message}\nStack: ${error.stack || 'N/A'}`,
            contexto: errorInfo.componentStack || navigator.userAgent,
            rutaAudio: null,
          })
          .then((ruta: string) => {
            this.setState({ logPath: ruta });
          })
          .catch((e: any) => {
            console.error('Error registrando log desde ErrorBoundary:', e);
          });
      } catch (err) {
        console.error('No se pudo invocar registro de error nativo:', err);
      }
    }
  }

  handleAbrirLogs = async (): Promise<void> => {
    if (typeof window !== 'undefined' && (window as any).__TAURI__?.invoke) {
      try {
        await (window as any).__TAURI__.invoke('abrir_carpeta_logs');
      } catch {
        alert('No se pudo abrir automáticamente la carpeta de registros.');
      }
    } else {
      alert('La apertura de carpetas está disponible en la versión de escritorio de Sephent Transcriptor.');
    }
  };

  handleReiniciar = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0F172A',
            color: '#F8FAFC',
            fontFamily: THEME_TOKENS.fonts.sans,
            padding: '2rem',
            boxSizing: 'border-box',
          }}
        >
          <div
            style={{
              maxWidth: '680px',
              width: '100%',
              backgroundColor: '#1E293B',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: THEME_TOKENS.radii.lg,
              padding: '2.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1.25rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#EF4444',
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                }}
              >
                🛡️
              </div>
              <div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: '#EF4444',
                    fontWeight: 700,
                  }}
                >
                  Escudo de Resiliencia del Sistema
                </span>
                <h2 style={{ margin: '0.15rem 0 0 0', fontSize: '1.35rem', fontWeight: 600, color: '#FFFFFF' }}>
                  Anomalía Aislada con Éxito
                </h2>
              </div>
            </div>

            <p style={{ color: '#CBD5E1', fontSize: '0.9rem', lineHeight: '1.6', margin: '0 0 1.25rem 0' }}>
              Para evitar que el programa se cierre súbitamente y proteger todas las transcripciones en curso,
              Sephent Transcriptor ha contenido la excepción de forma segura. Tus expedientes y datos en la base
              de datos se mantienen íntegros.
            </p>

            <div
              style={{
                backgroundColor: '#0F172A',
                border: '1px solid #334155',
                borderRadius: THEME_TOKENS.radii.md,
                padding: '1rem',
                marginBottom: '1.5rem',
                fontSize: '0.8rem',
                color: '#FCA5A5',
                fontFamily: 'monospace',
                maxHeight: '160px',
                overflowY: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              <strong>{this.state.error?.name || 'Error'}:</strong> {this.state.error?.message || 'Error desconocido'}
              {this.state.error?.stack && `\n\n${this.state.error.stack}`}
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                onClick={this.handleReiniciar}
                style={{
                  backgroundColor: THEME_TOKENS.colors.accentPrimary,
                  color: '#FFFFFF',
                  border: 'none',
                  borderRadius: THEME_TOKENS.radii.md,
                  padding: '0.65rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                🔄 Reiniciar Interfaz
              </button>

              <button
                onClick={this.handleAbrirLogs}
                style={{
                  backgroundColor: '#334155',
                  color: '#F8FAFC',
                  border: '1px solid #475569',
                  borderRadius: THEME_TOKENS.radii.md,
                  padding: '0.65rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                📁 Abrir Carpeta de Registros (Logs)
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

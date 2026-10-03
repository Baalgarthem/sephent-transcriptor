import React, { useEffect } from 'react';
import { GUIRenderer } from './gui/components/GUIRenderer';
import { GUISwitcher } from './gui/components/GUISwitcher';
import { THEME_TOKENS } from './config/themeTokens';
import { APP_VERSION } from './config/appConfig';
import sephentLogo from './assets/sephent-3.svg';

const App: React.FC = () => {
  useEffect(() => {
    document.title = `Sephent Transcriptor v${APP_VERSION}`;
  }, []);

  return (
    <div className="app-viewport">
      <header className="app-header" style={{ position: 'relative' }}>
        {/* Selector de Interfaz Gráfica Pluggable (Inyección de Dependencias) */}
        <div
          style={{
            position: 'absolute',
            top: '0.85rem',
            right: '1.25rem',
            zIndex: 50,
          }}
        >
          <GUISwitcher />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.85rem',
            marginBottom: '0.45rem',
          }}
        >
          <img
            src={sephentLogo}
            alt="Logo Sephent"
            style={{
              width: '38px',
              height: '38px',
              objectFit: 'contain',
              display: 'inline-block',
            }}
          />
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.65rem',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <h1 className="app-title font-serif" style={{ margin: 0 }}>
              Sephent Transcriptor
            </h1>
            <span
              className="app-version-badge"
              style={{
                fontSize: '0.785rem',
                fontWeight: 600,
                color: THEME_TOKENS.colors.accentGold,
                backgroundColor: 'rgba(146, 64, 14, 0.12)',
                border: '1px solid rgba(146, 64, 14, 0.3)',
                padding: '0.15rem 0.55rem',
                borderRadius: THEME_TOKENS.radii.pill,
                letterSpacing: '0.04em',
                fontFamily: THEME_TOKENS.fonts.sans,
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.25)',
                userSelect: 'none',
                verticalAlign: 'middle',
              }}
              title={`Versión activa del sistema: v${APP_VERSION}`}
            >
              v{APP_VERSION}
            </span>
          </div>
        </div>
        <p
          className="app-subtitle"
          style={{
            margin: '0 auto',
            color: THEME_TOKENS.colors.textSecondary,
            maxWidth: '620px',
          }}
        >
          Plataforma pericial de transcripción de audio y video con modelos canónicos OpenAI Whisper
        </p>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('sephent:abrirTutorial'))}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            margin: '0.35rem auto 0',
            display: 'block',
            cursor: 'pointer',
            fontSize: '0.775rem',
            color: THEME_TOKENS.colors.textMuted,
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            textUnderlineOffset: '3px',
            letterSpacing: '0.02em',
            fontFamily: THEME_TOKENS.fonts.sans,
            opacity: 0.75,
            transition: 'opacity 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '1';
            e.currentTarget.style.color = THEME_TOKENS.colors.textSecondary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '0.75';
            e.currentTarget.style.color = THEME_TOKENS.colors.textMuted;
          }}
          title="Abrir el manual de uso de Sephent Transcriptor"
        >
          ver tutorial
        </button>
      </header>

      <main className="app-main">
        {/* Renderizado dinámico de la interfaz gráfica activa resuelta vía DI */}
        <GUIRenderer />
      </main>
    </div>
  );
};

export default App;

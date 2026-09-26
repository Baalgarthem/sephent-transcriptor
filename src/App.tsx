import React from 'react';
import { GUIRenderer } from './gui/components/GUIRenderer';
import { GUISwitcher } from './gui/components/GUISwitcher';
import { THEME_TOKENS } from './config/themeTokens';
import sephentLogo from './assets/sephent-3.svg';

const App: React.FC = () => {
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
          <h1 className="app-title font-serif" style={{ margin: 0 }}>
            Sephent Transcriptor
          </h1>
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

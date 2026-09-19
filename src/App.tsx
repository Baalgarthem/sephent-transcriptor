import React from 'react';
import TranscriptionPanel from './components/TranscriptionPanel';
import { THEME_TOKENS } from './config/themeTokens';

const App: React.FC = () => {
  return (
    <div className="app-viewport">
      <header className="app-header">
        <h1 className="app-title font-serif">
          Sephent Transcriptor
        </h1>
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
        <TranscriptionPanel />
      </main>
    </div>
  );
};

export default App;

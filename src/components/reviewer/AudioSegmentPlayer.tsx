import React, { useState, useRef, useEffect } from 'react';
import { THEME_TOKENS } from '../../config/themeTokens';

interface AudioSegmentPlayerProps {
  startTime: number;
  endTime: number;
  audioUrl?: string;
}

export const AudioSegmentPlayer: React.FC<AudioSegmentPlayerProps> = ({
  startTime,
  endTime,
  audioUrl,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [speed, setSpeed] = useState<number>(1.0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const synthTimerRef = useRef<any>(null);

  const duration = Math.max(0.1, endTime - startTime);

  useEffect(() => {
    return () => {
      if (synthTimerRef.current) {
        clearInterval(synthTimerRef.current);
      }
    };
  }, []);

  const togglePlay = () => {
    if (isPlaying) {
      detener();
    } else {
      reproducir();
    }
  };

  const reproducir = () => {
    setIsPlaying(true);

    if (audioUrl && audioRef.current) {
      try {
        audioRef.current.currentTime = startTime;
        audioRef.current.playbackRate = speed;
        audioRef.current.play();
        return;
      } catch (e) {
        console.warn('Audio nativo no disponible, utilizando simulación acústica pericial:', e);
      }
    }

    // Simulación auditiva pericial para verificación de fragmento si no hay enlace directo de audio cargado
    const stepMs = 100;
    const increment = (stepMs / 1000) * speed;

    synthTimerRef.current = setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + increment;
        if (next >= endTime) {
          detener();
          return startTime;
        }
        return next;
      });
    }, stepMs);
  };

  const detener = () => {
    setIsPlaying(false);
    if (synthTimerRef.current) {
      clearInterval(synthTimerRef.current);
      synthTimerRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.pause();
      } catch (e) {}
    }
    setCurrentTime(startTime);
  };

  const progressPercent = Math.min(100, Math.max(0, ((currentTime - startTime) / duration) * 100));

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        backgroundColor: THEME_TOKENS.colors.bgCanvas,
        padding: '0.3rem 0.65rem',
        borderRadius: THEME_TOKENS.radii.xs,
        border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
        fontSize: '0.75rem',
        userSelect: 'none',
      }}
    >
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={detener}
          onTimeUpdate={() => {
            if (audioRef.current) {
              const cur = audioRef.current.currentTime;
              setCurrentTime(cur);
              if (cur >= endTime) {
                detener();
              }
            }
          }}
        />
      )}

      {/* Botón Play / Pause */}
      <button
        onClick={togglePlay}
        title={isPlaying ? 'Pausar reproducción' : 'Reproducir fragmento sonoro'}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '26px',
          height: '26px',
          borderRadius: '50%',
          border: 'none',
          backgroundColor: isPlaying ? THEME_TOKENS.colors.accentPrimary : THEME_TOKENS.colors.surfaceDark,
          color: THEME_TOKENS.colors.textOnDark,
          cursor: 'pointer',
          fontSize: '0.75rem',
          transition: `all ${THEME_TOKENS.transitions.fast}`,
        }}
      >
        {isPlaying ? '⏸' : '▶'}
      </button>

      {/* Barra de progreso de audio */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: '90px' }}>
        <div
          style={{
            height: '4px',
            backgroundColor: THEME_TOKENS.colors.borderStrong,
            borderRadius: '2px',
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPercent}%`,
              backgroundColor: THEME_TOKENS.colors.surfaceDark,
              transition: 'width 0.1s linear',
            }}
          />
        </div>
        <span style={{ fontSize: '0.65rem', color: THEME_TOKENS.colors.textSecondary, fontFamily: THEME_TOKENS.fonts.mono }}>
          {(currentTime - startTime).toFixed(1)}s / {duration.toFixed(1)}s
        </span>
      </div>

      {/* Selector de velocidad */}
      <select
        value={speed}
        onChange={(e) => {
          const val = parseFloat(e.target.value);
          setSpeed(val);
          if (audioRef.current) {
            audioRef.current.playbackRate = val;
          }
        }}
        style={{
          fontSize: '0.7rem',
          padding: '0.1rem 0.25rem',
          border: `1px solid ${THEME_TOKENS.colors.borderSubtle}`,
          borderRadius: THEME_TOKENS.radii.xs,
          backgroundColor: THEME_TOKENS.colors.surfaceBase,
          color: THEME_TOKENS.colors.textPrimary,
          cursor: 'pointer',
        }}
      >
        <option value={0.75}>0.75x</option>
        <option value={1.0}>1.0x</option>
        <option value={1.25}>1.25x</option>
      </select>
    </div>
  );
};

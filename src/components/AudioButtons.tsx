import type { Voice } from '../audio/manifest';
import { usePlay } from './usePlay';

const Speaker = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
    <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
  </svg>
);

/** Big "listen" button plus a slow version. */
export function ListenButtons({ text, voice, big = false, disabled = false }: { text: string; voice: Voice; big?: boolean; disabled?: boolean }) {
  const { play, playing } = usePlay();
  return (
    <div className={`listen${big ? ' listen--big' : ''}`}>
      <button
        className="tile listen-main"
        data-playing={playing === 'n' || undefined}
        disabled={disabled}
        onClick={() => play(text, voice, 'normal', 'n')}
        aria-label="Escuchar (listen)"
      >
        <Speaker />
        {big ? null : <span>Escuchar</span>}
      </button>
      <button
        className="tile tile--light listen-slow"
        data-playing={playing === 's' || undefined}
        disabled={disabled}
        onClick={() => play(text, voice, 'slow', 's')}
        aria-label="Lento (slow)"
      >
        Lento
      </button>
    </div>
  );
}

/** Small inline play control used on teach cards: tap the text to hear it. */
export function SayIt({ text, voice = 'f', className = '', children }: { text: string; voice?: Voice; className?: string; children?: React.ReactNode }) {
  const { play, playing } = usePlay();
  return (
    <button className={`say-it ${className}`} data-playing={playing !== null || undefined} onClick={() => play(text, voice)} lang="es-ES">
      <Speaker />
      <span>{children ?? text}</span>
    </button>
  );
}

/** Elvira / Álvaro / slow, for phrases. */
export function VoiceRow({ text }: { text: string }) {
  const { play, playing } = usePlay();
  return (
    <div className="voice-row">
      <button className="tile tile--small" data-playing={playing === 'f' || undefined} onClick={() => play(text, 'f', 'normal', 'f')}>
        ▶ Elvira
      </button>
      <button className="tile tile--small" data-playing={playing === 'm' || undefined} onClick={() => play(text, 'm', 'normal', 'm')}>
        ▶ Álvaro
      </button>
      <button className="tile tile--light tile--small" data-playing={playing === 's' || undefined} onClick={() => play(text, 'f', 'slow', 's')}>
        Lento
      </button>
    </div>
  );
}

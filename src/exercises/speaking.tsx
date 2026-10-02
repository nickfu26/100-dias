import { createContext, useContext, useRef, useState } from 'react';
import { copySpeechLog } from '../lib/debugLog';

/** Per-lesson speaking state: once recognition fails, the learner can switch the rest of the session to recording. */
export interface SpeakingSession {
  /** Record & compare instead of recognition, from Ajustes or for the rest of this session. */
  recordOnly: boolean;
  /** Why record-only is on, shown under the exercise. */
  reason?: string;
  recordRestOfSession: () => void;
}

const Ctx = createContext<SpeakingSession>({ recordOnly: false, recordRestOfSession() {} });
export const SpeakingProvider = Ctx.Provider;
export const useSpeaking = () => useContext(Ctx);

/** Error box: a long press reveals "Copy speech log", so a failure in a real lesson can be reported. */
export function SpeechError({ children }: { children: React.ReactNode }) {
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState<boolean | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancel = () => clearTimeout(timer.current);
  return (
    <div
      className="error error--press"
      role="alert"
      onPointerDown={() => {
        cancel();
        timer.current = setTimeout(() => setReveal(true), 600);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p>{children}</p>
      {reveal && (
        <button className="tile tile--light tile--small" onClick={() => copySpeechLog().then(setCopied)}>
          {copied === null ? 'Copy speech log' : copied ? 'Copiado ✓' : 'Clipboard unavailable'}
        </button>
      )}
    </div>
  );
}

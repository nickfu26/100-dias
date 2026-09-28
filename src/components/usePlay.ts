import { useCallback, useEffect, useRef, useState } from 'react';
import type { Speed, Voice } from '../audio/manifest';
import { playSpanish, stopAudio } from '../audio/player';

/**
 * Play Spanish audio and remember which button is playing. `play` must be called straight
 * from a tap handler (iOS): nothing is awaited before playback starts.
 */
export function usePlay() {
  const [playing, setPlaying] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const play = useCallback((text: string, voice: Voice, speed: Speed = 'normal', key = `${text}|${voice}|${speed}`) => {
    setPlaying(key);
    return playSpanish(text, { voice, speed })
      .catch(() => undefined) // not in a gesture, or no audio at all: stay silent, never hang
      .finally(() => {
        if (alive.current) setPlaying((p) => (p === key ? null : p));
      });
  }, []);

  const stop = useCallback(() => {
    stopAudio();
    setPlaying(null);
  }, []);

  return { play, stop, playing };
}

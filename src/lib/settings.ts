import { persisted, useStore } from './persisted';

/** How 🎤 exercises are done: scored by speech recognition, or recorded and self-rated. */
export type SpeakingMode = 'recognition' | 'record';

export interface Settings {
  /** Unlock every day and checkpoint for testing. Progress made in preview is kept separately. */
  preview: boolean;
  speakingMode: SpeakingMode;
  /** Set once the learner picks a mode in Ajustes; earlier builds saved 'recognition' as the default. */
  speakingModeChosen?: boolean;
}

// Record & compare until recognition is reliable on iOS; recognition is opt-in.
const DEFAULTS: Settings = { preview: false, speakingMode: 'record' };

export const settingsStore = persisted<Settings>('100dias.settings.v1', DEFAULTS, (raw) => {
  const r = raw as Partial<Settings>;
  return { ...DEFAULTS, ...r, speakingMode: r.speakingModeChosen ? (r.speakingMode ?? DEFAULTS.speakingMode) : DEFAULTS.speakingMode };
});

export const useSettings = () => useStore(settingsStore);

export function setPreview(preview: boolean) {
  settingsStore.set((s) => ({ ...s, preview }));
}

export function setSpeakingMode(speakingMode: SpeakingMode) {
  settingsStore.set((s) => ({ ...s, speakingMode, speakingModeChosen: true }));
}

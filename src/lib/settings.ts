import { persisted, useStore } from './persisted';

/** How 🎤 exercises are done: scored by speech recognition, or recorded and self-rated. */
export type SpeakingMode = 'recognition' | 'record';

export interface Settings {
  /** Unlock every day and checkpoint for testing. Progress made in preview is kept separately. */
  preview: boolean;
  speakingMode: SpeakingMode;
}

const DEFAULTS: Settings = { preview: false, speakingMode: 'recognition' };

export const settingsStore = persisted<Settings>('100dias.settings.v1', DEFAULTS, (raw) => ({
  ...DEFAULTS,
  ...(raw as Partial<Settings>),
}));

export const useSettings = () => useStore(settingsStore);

export function setPreview(preview: boolean) {
  settingsStore.set((s) => ({ ...s, preview }));
}

export function setSpeakingMode(speakingMode: SpeakingMode) {
  settingsStore.set((s) => ({ ...s, speakingMode }));
}

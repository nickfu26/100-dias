import { persisted, useStore } from './persisted';

export interface Settings {
  /** Unlock every day and checkpoint for testing. Progress made in preview is kept separately. */
  preview: boolean;
}

const DEFAULTS: Settings = { preview: false };

export const settingsStore = persisted<Settings>('100dias.settings.v1', DEFAULTS, (raw) => ({
  ...DEFAULTS,
  ...(raw as Partial<Settings>),
}));

export const useSettings = () => useStore(settingsStore);

export function setPreview(preview: boolean) {
  settingsStore.set((s) => ({ ...s, preview }));
}

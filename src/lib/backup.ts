// Export / import of everything the app stores: settings, real + preview progress, FSRS cards.
import { previewProgress, realProgress, type ProgressData } from '../progress/store';
import { previewCards, realCards, type CardMap } from '../srs/cards';
import { localDateKey } from './date';
import { persisted, type Store } from './persisted';
import { settingsStore, type Settings } from './settings';

const APP = '100-dias';
const VERSION = 1;

interface BackupData {
  settings: Settings;
  progress: ProgressData;
  previewProgress: ProgressData;
  cards: CardMap;
  previewCards: CardMap;
}
export interface Backup {
  app: typeof APP;
  version: number;
  exportedAt: string; // ISO
  build: string;
  data: BackupData;
}

const STORES: { [K in keyof BackupData]: Store<BackupData[K]> } = {
  settings: settingsStore,
  progress: realProgress,
  previewProgress,
  cards: realCards,
  previewCards,
};

export const backupMeta = persisted<{ lastExport?: string; lastImport?: string }>('100dias.backup.v1', {});
/** What an import replaced, in case it was the wrong file. */
const beforeImport = persisted<Backup | null>('100dias.beforeImport.v1', null);

export function makeBackup(now = new Date()): Backup {
  return {
    app: APP,
    version: VERSION,
    exportedAt: now.toISOString(),
    build: __APP_VERSION__,
    data: {
      settings: settingsStore.get(),
      progress: realProgress.get(),
      previewProgress: previewProgress.get(),
      cards: realCards.get(),
      previewCards: previewCards.get(),
    },
  };
}

export const backupFileName = (now = new Date()) => `100-dias-backup-${localDateKey(now)}.json`;

export interface BackupSummary {
  exportedAt: string;
  daysCompleted: number[];
  words: number;
  lastActive?: string;
  streakDates: number;
}

export function summarize(b: Backup): BackupSummary {
  const p = b.data.progress;
  return {
    exportedAt: b.exportedAt,
    daysCompleted: Object.keys(p.completed).map(Number).sort((a, c) => a - c),
    words: Object.keys(b.data.cards).length,
    lastActive: [...p.activeDates].sort().pop(),
    streakDates: p.activeDates.length,
  };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isProgress = (x: unknown) => isObj(x) && isObj(x.completed) && Array.isArray(x.activeDates) && isObj(x.inProgress);

/** Parse and check a backup file. Throws an Error with a plain-language message. */
export function parseBackup(text: string): Backup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That isn’t a 100 Días backup (not valid JSON).');
  }
  if (!isObj(raw) || raw.app !== APP || !isObj(raw.data)) throw new Error('That isn’t a 100 Días backup.');
  if (typeof raw.version !== 'number' || raw.version > VERSION)
    throw new Error('This backup comes from a newer version of the app. Update the app first (close and reopen it).');
  const d = raw.data;
  if (!isProgress(d.progress) || !isObj(d.cards)) throw new Error('This backup is incomplete or damaged.');
  return {
    ...(raw as unknown as Backup),
    data: {
      settings: isObj(d.settings) ? (d.settings as unknown as Settings) : settingsStore.get(),
      progress: d.progress as unknown as ProgressData,
      previewProgress: isProgress(d.previewProgress) ? (d.previewProgress as unknown as ProgressData) : previewProgress.get(),
      cards: d.cards as CardMap,
      previewCards: isObj(d.previewCards) ? (d.previewCards as CardMap) : {},
    },
  };
}

/** Replace everything with the backup (a copy of the current data is kept first). */
export function restoreBackup(b: Backup) {
  beforeImport.set(makeBackup());
  (Object.keys(STORES) as (keyof BackupData)[]).forEach((k) => (STORES[k] as Store<unknown>).set(b.data[k]));
  backupMeta.set((m) => ({ ...m, lastImport: new Date().toISOString() }));
}

export function markExported() {
  backupMeta.set((m) => ({ ...m, lastExport: new Date().toISOString() }));
}

/**
 * Hand the backup to the user: the share sheet on phones (Save to Files, AirDrop, Mail),
 * otherwise a download. Must be called from a tap.
 */
export async function exportBackup(): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const now = new Date();
  const json = JSON.stringify(makeBackup(now), null, 1);
  const name = backupFileName(now);
  const file = new File([json], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: '100 Días backup' });
      markExported();
      return 'shared';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'cancelled';
      // fall through to a download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  markExported();
  return 'downloaded';
}

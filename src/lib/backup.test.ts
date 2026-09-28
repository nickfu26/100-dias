import { describe, expect, it } from 'vitest';
import { makeBackup, parseBackup, restoreBackup, summarize } from './backup';
import { realProgress } from '../progress/store';
import { realCards } from '../srs/cards';

describe('backup', () => {
  it('round-trips and summarises', () => {
    realProgress.set({
      completed: { 1: { firstCompletedOn: '2026-10-01', lastCompletedOn: '2026-10-01', correct: 14, graded: 14 } },
      activeDates: ['2026-10-01'],
      inProgress: {},
    });
    const b = parseBackup(JSON.stringify(makeBackup(new Date('2026-10-01T20:00:00'))));
    expect(summarize(b)).toMatchObject({ daysCompleted: [1], words: 0, lastActive: '2026-10-01' });

    realProgress.set({ completed: {}, activeDates: [], inProgress: {} });
    realCards.set({});
    restoreBackup(b);
    expect(Object.keys(realProgress.get().completed)).toEqual(['1']);
  });

  it('rejects files that are not backups, with a readable message', () => {
    expect(() => parseBackup('hello')).toThrow(/not valid JSON/);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/isn’t a 100 Días backup/);
    expect(() => parseBackup('{"app":"100-dias","version":99,"data":{}}')).toThrow(/newer version/);
    expect(() => parseBackup('{"app":"100-dias","version":1,"data":{"progress":{}}}')).toThrow(/incomplete/);
  });
});

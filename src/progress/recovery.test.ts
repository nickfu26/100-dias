import { describe, expect, it } from 'vitest';
import { isCheckpointUnlocked, isDayUnlocked } from './unlock';
import { applyRecovery, completeDay, realProgress, recoverableDays, type DayRecord, type ProgressData } from './store';

const rec = (on: string): DayRecord => ({ firstCompletedOn: on, lastCompletedOn: on, correct: 5, graded: 6 });

// Lost Días 1–5; 6–10 done; Level 1 test attempted.
const lost: ProgressData = {
  completed: { 6: rec('2026-10-06'), 7: rec('2026-10-07'), 8: rec('2026-10-08'), 9: rec('2026-10-09'), 10: rec('2026-10-10') },
  activeDates: ['2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'],
  inProgress: {},
  checkpoints: { 1: { attempts: [{ on: '2026-10-10', correct: 1, graded: 2, passed: false }] } },
};

describe('one-time recovery of Días 1–5', () => {
  it('marks only the missing Días 1–5 and leaves everything else as it was', () => {
    const p = applyRecovery(lost, '2026-10-14');
    expect(Object.keys(p.completed).map(Number).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(p.completed[1]).toEqual({ firstCompletedOn: '2026-10-14', lastCompletedOn: '2026-10-14', correct: 0, graded: 0, recovered: true });
    for (const d of [6, 7, 8, 9, 10]) expect(p.completed[d]).toBe(lost.completed[d]);
    expect(p.activeDates).toBe(lost.activeDates); // streak untouched
    expect(p.checkpoints).toBe(lost.checkpoints);
    expect(p.recovery).toEqual({ on: '2026-10-14', days: [1, 2, 3, 4, 5] });
  });

  it('keeps days among 1–5 that are already done', () => {
    const p = applyRecovery({ ...lost, completed: { ...lost.completed, 3: rec('2026-10-03') } }, '2026-10-14');
    expect(p.completed[3]).toEqual(rec('2026-10-03'));
    expect(p.recovery?.days).toEqual([1, 2, 4, 5]);
  });

  it('never marks a day outside 1–5', () => {
    const p = applyRecovery({ completed: {}, activeDates: [], inProgress: {} }, '2026-10-14');
    expect(Object.keys(p.completed).map(Number)).toEqual([1, 2, 3, 4, 5]);
  });

  it('runs only once, even if a day among 1–5 goes missing again', () => {
    const once = applyRecovery(lost, '2026-10-14');
    expect(recoverableDays(once)).toEqual([]);
    expect(applyRecovery(once, '2026-10-15')).toBe(once);
    const { 2: _, ...without2 } = once.completed;
    const again = { ...once, completed: without2 };
    expect(recoverableDays(again)).toEqual([]);
    expect(applyRecovery(again, '2026-10-15')).toBe(again);
  });

  it('opens the Level 1 test legitimately; date unlock is unchanged', () => {
    expect(isCheckpointUnlocked(1, false, lost.completed)).toBe(false);
    expect(isCheckpointUnlocked(1, false, applyRecovery(lost, '2026-10-14').completed)).toBe(true);
    expect(isCheckpointUnlocked(2, false, applyRecovery(lost, '2026-10-14').completed)).toBe(false);
    expect(isDayUnlocked(15, false, '2026-10-14')).toBe(false);
    expect(isDayUnlocked(14, false, '2026-10-14')).toBe(true);
  });
});

describe('completeDay', () => {
  it('keeps checkpoint results and the recovery marker', () => {
    const passed: ProgressData = {
      ...applyRecovery(lost, '2026-10-14'),
      checkpoints: { 1: { attempts: [{ on: '2026-10-14', correct: 9, graded: 10, passed: true }], passedOn: '2026-10-14' } },
    };
    realProgress.set(passed);
    completeDay(11, 8, 10, '2026-10-14');
    const p = realProgress.get();
    expect(p.completed[11]?.lastCompletedOn).toBe('2026-10-14');
    expect(p.checkpoints?.[1]?.passedOn).toBe('2026-10-14');
    expect(p.recovery).toEqual(passed.recovery);
  });
});

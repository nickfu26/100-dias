import { afterEach, describe, expect, it, vi } from 'vitest';
import { beginActivity, micQuiet, SETTLE_MS } from './activity';

describe('mic gate', () => {
  afterEach(() => vi.useRealTimers());

  it('stays closed until every activity ends and SETTLE_MS passes', () => {
    vi.useFakeTimers();
    const clip = beginActivity('clip');
    const rec = beginActivity('recognition');
    expect(micQuiet()).toBe(false);
    clip();
    clip(); // idempotent
    vi.advanceTimersByTime(SETTLE_MS * 2);
    expect(micQuiet()).toBe(false); // recogniser still open (e.g. next exercise mounted)
    rec();
    vi.advanceTimersByTime(SETTLE_MS - 1);
    expect(micQuiet()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(micQuiet()).toBe(true);
  });

  it('a new activity during the settle delay keeps it closed', () => {
    vi.useFakeTimers();
    beginActivity('a')();
    vi.advanceTimersByTime(SETTLE_MS / 2);
    const b = beginActivity('b');
    vi.advanceTimersByTime(SETTLE_MS);
    expect(micQuiet()).toBe(false);
    b();
    vi.advanceTimersByTime(SETTLE_MS);
    expect(micQuiet()).toBe(true);
  });
});

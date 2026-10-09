import { describe, expect, it } from 'vitest';
import type { Backend, Saved } from './durable';
import { persisted, requireObject } from './persisted';

type Name = Backend['name'];
function fake(name: Name, init?: Saved, opts: { failRead?: boolean; writable?: boolean } = {}) {
  const data = new Map<string, Saved>(init ? [['k', init]] : []);
  const writes: Saved[] = [];
  const b: Backend = {
    name,
    writable: opts.writable ?? name !== 'legacy',
    async read(key) {
      if (opts.failRead) throw new Error('read failed');
      return data.get(key);
    },
    async write(key, s) {
      writes.push(s);
      data.set(key, s);
    },
  };
  return { b, data, writes };
}

const progress = (days: number[]) => ({ completed: Object.fromEntries(days.map((d) => [d, true])) });
const parse = (r: unknown) => requireObject(r) as { completed: Record<string, boolean> };
const EMPTY = { completed: {} };

describe('persisted', () => {
  it('starts empty and saves to every store when nothing is saved anywhere', async () => {
    const [i, m] = [fake('idb'), fake('mirror')];
    const s = persisted('k', EMPTY, parse, [i.b, m.b]);
    await s.loaded;
    expect(s.status()).toBe('ready');
    s.set(progress([1]));
    expect(i.writes.at(-1)?.v).toEqual(progress([1]));
    expect(m.writes.at(-1)?.v).toEqual(progress([1]));
  });

  it('migrates legacy localStorage data into IndexedDB and the mirror', async () => {
    const [i, m, l] = [fake('idb'), fake('mirror'), fake('legacy', { at: 0, v: progress([1, 2, 3]) })];
    const s = persisted('k', EMPTY, parse, [i.b, m.b, l.b]);
    await s.loaded;
    expect(s.get()).toEqual(progress([1, 2, 3]));
    expect(i.data.get('k')?.v).toEqual(progress([1, 2, 3]));
    expect(m.data.get('k')?.v).toEqual(progress([1, 2, 3]));
    expect(l.writes).toEqual([]); // legacy is never written
  });

  it('takes the newest copy and brings the others up to date', async () => {
    const i = fake('idb', { at: 100, v: progress([1, 2]) });
    const m = fake('mirror', { at: 200, v: progress([1, 2, 3]) });
    const s = persisted('k', EMPTY, parse, [i.b, m.b]);
    await s.loaded;
    expect(s.get()).toEqual(progress([1, 2, 3]));
    expect(i.data.get('k')).toEqual({ at: 200, v: progress([1, 2, 3]) });
  });

  it('when IndexedDB is wiped but the mirror survives, restores from the mirror', async () => {
    const [i, m] = [fake('idb'), fake('mirror', { at: 200, v: progress([1, 2, 3, 4, 5]) })];
    const s = persisted('k', EMPTY, parse, [i.b, m.b]);
    await s.loaded;
    expect(s.get()).toEqual(progress([1, 2, 3, 4, 5]));
    expect(i.data.get('k')?.v).toEqual(progress([1, 2, 3, 4, 5]));
  });

  it('a failed read is unknown, not empty: nothing is saved over it', async () => {
    const i = fake('idb', { at: 100, v: progress([1, 2, 3, 4, 5]) }, { failRead: true });
    const m = fake('mirror'); // e.g. localStorage cleared by iOS
    const s = persisted('k', EMPTY, parse, [i.b, m.b]);
    await s.loaded;
    expect(s.status()).toBe('unknown');
    s.set(progress([1]));
    expect(s.get()).toEqual(progress([1])); // the lesson still works in memory…
    expect(i.writes).toEqual([]); // …but neither store is touched
    expect(m.writes).toEqual([]);
    expect(i.data.get('k')?.v).toEqual(progress([1, 2, 3, 4, 5]));
  });

  it('never writes to a store it could not read, even when another store loaded fine', async () => {
    const i = fake('idb', { at: 300, v: progress([1, 2, 3, 4, 5]) }, { failRead: true });
    const m = fake('mirror', { at: 300, v: progress([1, 2, 3, 4, 5]) });
    const s = persisted('k', EMPTY, parse, [i.b, m.b]);
    await s.loaded;
    expect(s.status()).toBe('ready');
    s.set(progress([1, 2, 3, 4, 5, 6]));
    expect(m.data.get('k')?.v).toEqual(progress([1, 2, 3, 4, 5, 6]));
    expect(i.writes).toEqual([]);
  });

  it('doesn’t build on the old legacy copy while IndexedDB is unreadable', async () => {
    const i = fake('idb', { at: 300, v: progress([1, 2, 3, 4, 5, 6, 7, 8]) }, { failRead: true });
    const m = fake('mirror'); // localStorage mirror cleared
    const l = fake('legacy', { at: 0, v: progress([1, 2, 3, 4, 5]) });
    const s = persisted('k', EMPTY, parse, [i.b, m.b, l.b]);
    await s.loaded;
    expect(s.status()).toBe('unknown');
    expect(s.get()).toEqual(progress([1, 2, 3, 4, 5]));
    s.set(progress([1, 2, 3, 4, 5, 6]));
    expect(m.writes).toEqual([]);
    expect(i.writes).toEqual([]);
  });

  it('treats corrupt saved data as unreadable, not as zero progress', async () => {
    const i = fake('idb');
    const m = fake('mirror', { at: 300, v: 'garbage' });
    const s = persisted('k', EMPTY, parse, [i.b, m.b]);
    await s.loaded;
    expect(s.status()).toBe('unknown');
    s.set(progress([1]));
    expect(m.data.get('k')?.v).toBe('garbage');
    expect(i.writes).toEqual([]);
  });

  it('a change made before saved data loaded is never saved', async () => {
    const i = fake('idb', { at: 100, v: progress([1, 2, 3]) });
    const s = persisted('k', EMPTY, parse, [i.b]);
    s.set(progress([9]));
    await s.loaded;
    expect(s.status()).toBe('unknown');
    s.set(progress([9, 10]));
    expect(i.writes).toEqual([]);
  });

  it('each save is stamped later than the copy it replaced', async () => {
    const i = fake('idb', { at: Date.now() + 60_000, v: progress([1]) }); // clock went backwards
    const s = persisted('k', EMPTY, parse, [i.b]);
    await s.loaded;
    s.set(progress([1, 2]));
    expect(i.writes.at(-1)!.at).toBeGreaterThan(i.writes.length > 1 ? i.writes.at(-2)!.at : 0);
    expect(i.data.get('k')!.at).toBeGreaterThan(Date.now() + 59_000);
  });
});

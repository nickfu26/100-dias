// Tiny event bus so low-level modules (audio, speech) can report what happened.
// The mic-test screen subscribes and shows it; later screens can ignore it.

type Listener = (line: string) => void;
const listeners = new Set<Listener>();

export function debug(line: string) {
  for (const l of listeners) l(line);
}

export function onDebug(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

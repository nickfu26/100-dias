// Tiny event bus so low-level modules (audio, speech) can report what happened.
// The mic-test screen subscribes and shows it. Every line is also kept in memory, so a
// failure in a lesson can be copied from Ajustes ("Copy last speech log") and sent in.

type Listener = (line: string) => void;
const listeners = new Set<Listener>();

const MAX_LINES = 400;
const lines: string[] = [];

export function debug(line: string) {
  const t = new Date().toLocaleTimeString('es-ES', { hour12: false });
  lines.push(`${t}  ${line}`);
  if (lines.length > MAX_LINES) lines.splice(0, lines.length - MAX_LINES);
  for (const l of listeners) l(line);
}

export function onDebug(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The in-memory log as a report (oldest first), headed with build and device. */
export function speechLogReport(): string {
  return [
    `100 Días — speech log · build ${__APP_VERSION__}`,
    navigator.userAgent,
    `${location.hash || '#/'} · ${new Date().toISOString()}`,
    '',
    ...(lines.length ? lines : ['(empty: nothing has played or listened since the app opened)']),
  ].join('\n');
}

export async function copySpeechLog(): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(speechLogReport());
    return true;
  } catch {
    return false;
  }
}

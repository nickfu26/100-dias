import { storageHealth } from '../lib/persisted';

/** Shown when saved progress couldn't be read: we stop saving rather than risk replacing it. */
export function StorageBanner() {
  if (storageHealth().unknown.length === 0) return null;
  return (
    <p className="storage-banner" role="alert">
      <strong>Couldn’t read your saved progress.</strong> To protect it, nothing is being saved right now. Close the app
      completely (swipe it away) and open it again.
    </p>
  );
}

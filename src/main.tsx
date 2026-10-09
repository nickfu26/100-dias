import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/young-serif/latin-400.css';
import '@fontsource/lexend/latin-400.css';
import '@fontsource/lexend/latin-600.css';
import './styles/tokens.css';
import './styles/global.css';
import './styles/speech.css';
import { App } from './App';
import { loadManifest } from './audio/manifest';
import { requestPersistentStorage } from './lib/storage';
import { registerSW } from 'virtual:pwa-register';

void loadManifest();
void requestPersistentStorage().then((granted) => console.info('[storage] persisted:', granted));

// autoUpdate: when a new service worker takes over, the page reloads onto the new build.
// iOS Home Screen apps resume rather than relaunch, so also check on return to foreground.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    setInterval(check, 30 * 60 * 1000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

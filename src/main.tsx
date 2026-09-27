import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/young-serif/latin-400.css';
import '@fontsource/lexend/latin-400.css';
import '@fontsource/lexend/latin-600.css';
import './styles/tokens.css';
import './styles/global.css';
import { App } from './App';
import { loadManifest } from './audio/manifest';
import { requestPersistentStorage } from './lib/storage';

void loadManifest();
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

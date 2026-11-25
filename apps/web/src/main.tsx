import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import { App } from './App';
import { initializeOffline } from './lib/offline';
import { reconcileCompletedSession } from './store/session';
import { AppStartup } from './components/AppStartup';
import { ensureSeed } from './db/seed';
import { getSettings } from './db/repo';
import { applyAppearance } from './lib/appearance';

async function initialize() {
  await ensureSeed();
  await reconcileCompletedSession();
  const settings = await getSettings();
  applyAppearance(settings.theme, settings.accent, window.matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.lang = settings.lang === 'en' ? 'en' : 'pt-BR';
  return settings;
}

// Start exactly once, outside StrictMode; show the welcome while IndexedDB opens.
initializeOffline();
const initialization = initialize();
createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AppStartup initialization={initialization}><App /></AppStartup>
      </BrowserRouter>
    </StrictMode>,
);

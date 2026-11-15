import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import { App } from './App';
import { ensureSeed } from './db/seed';
import { getSettings } from './db/repo';
import { applyAppearance } from './lib/appearance';

// Aplica tema e acento no <html> antes do primeiro render, evitando flash.
async function applyInitialAppearance() {
  try {
    const s = await getSettings();
    applyAppearance(s.theme, s.accent, window.matchMedia('(prefers-color-scheme: light)').matches);
  } catch {
    // Atributos do HTML mantêm a aparência inicial se a leitura falhar.
  }
}

// Semeia o banco local (idempotente) + aplica aparência antes de montar.
Promise.all([ensureSeed(), applyInitialAppearance()]).finally(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
});

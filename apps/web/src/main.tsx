import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/global.css';
import { App } from './App';
import { ensureSeed } from './db/seed';
import { getSettings } from './db/repo';

// Aplica tema e acento no <html> antes do primeiro render, evitando flash.
async function applyInitialAppearance() {
  try {
    const s = await getSettings();
    // Tema: 'system' → remove o atributo (a media query CSS cuida do resto);
    // dark/light → seta explicitamente.
    if (s.theme === 'system') {
      delete document.documentElement.dataset['theme'];
    } else {
      document.documentElement.dataset['theme'] = s.theme;
    }
    // Acento: vazio = padrão CSS (:root sem [data-accent])
    if (s.accent && s.accent !== 'flame') {
      document.documentElement.dataset['accent'] = s.accent;
    }
  } catch {
    // banco ainda não existe no primeiro boot — mantém dark/flame (padrão do CSS)
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

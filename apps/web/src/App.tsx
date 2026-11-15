import { MotionConfig } from 'framer-motion';
import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { getSettings } from './db/repo';
import { applyAppearance } from './lib/appearance';
import { AppNavigation } from './components/AppNavigation';
import { watchSync } from './lib/sync-client';
import { useT } from './lib/i18n';

const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })));
const Treinos = lazy(() => import('./pages/Treinos').then(m => ({ default: m.Treinos })));
const RotinaEditor = lazy(() => import('./pages/RotinaEditor').then(m => ({ default: m.RotinaEditor })));
const Exercicios = lazy(() => import('./pages/Exercicios').then(m => ({ default: m.Exercicios })));
const TreinoGuiado = lazy(() => import('./pages/TreinoGuiado').then(m => ({ default: m.TreinoGuiado })));
const Historico = lazy(() => import('./pages/Historico').then(m => ({ default: m.Historico })));
const Progresso = lazy(() => import('./pages/Progresso').then(m => ({ default: m.Progresso })));
const Perfil = lazy(() => import('./pages/Perfil').then(m => ({ default: m.Perfil })));

const Dispositivos = lazy(() => import('./pages/Dispositivos').then(m => ({ default: m.Dispositivos })));
const Conectar = lazy(() => import('./pages/Dispositivos').then(m => ({ default: m.Conectar })));

const Assistente = lazy(() => import('./pages/Assistente').then(m => ({ default: m.Assistente })));

export function App() {
  const t = useT();
  const { pathname, hash } = useLocation();
  const settings = useLiveQuery(getSettings, []);
  const theme = settings?.theme;
  const accent = settings?.accent;
  const lang = settings?.lang ?? 'pt';
  useEffect(watchSync, []);
  useEffect(() => { document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'; }, [lang]);
  useEffect(() => {
    if (theme === undefined) return;
    const system = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => applyAppearance(theme, accent, system.matches);
    apply();
    system.addEventListener('change', apply);
    return () => system.removeEventListener('change', apply);
  }, [theme, accent]);
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
  }, [pathname, hash]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <a className="skip-link" href="#conteudo" onClick={(event) => {
          event.preventDefault();
          document.getElementById('conteudo')?.focus();
        }}>{t('locale.skip')}</a>
        <AppNavigation />
        <main className="app-main" id="conteudo" tabIndex={-1}>
          <Suspense fallback={<p className="empty" role="status">{t('hist.loading')}</p>}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/treinos" element={<Treinos />} />
              <Route path="/treinos/rotina/nova" element={<RotinaEditor />} />
              <Route path="/treinos/rotina/:id" element={<RotinaEditor />} />
              <Route path="/exercicios" element={<Exercicios />} />
              <Route path="/treino" element={<TreinoGuiado />} />
              <Route path="/historico" element={<Historico />} />
              <Route path="/progresso" element={<Progresso />} />
              <Route path="/perfil" element={<Perfil />} />
              <Route path="/perfil/dispositivos" element={<Dispositivos />} />
              <Route path="/perfil/assistente" element={<Assistente />} />
              <Route path="/conectar" element={<Conectar />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </MotionConfig>
  );
}

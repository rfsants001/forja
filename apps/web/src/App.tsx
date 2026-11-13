import { MotionConfig } from 'framer-motion';
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';

// Importações estáticas (componentes necessários no load principal)
// BottomNav fica estático pois é renderizado sempre

// Lazy loading das páginas (code-splitting)
const Home = lazy(() => import('./pages/Home').then(m => ({ default: m.Home })));
const Treinos = lazy(() => import('./pages/Treinos').then(m => ({ default: m.Treinos })));
const RotinaEditor = lazy(() => import('./pages/RotinaEditor').then(m => ({ default: m.RotinaEditor })));
const Exercicios = lazy(() => import('./pages/Exercicios').then(m => ({ default: m.Exercicios })));
const TreinoGuiado = lazy(() => import('./pages/TreinoGuiado').then(m => ({ default: m.TreinoGuiado })));
const Historico = lazy(() => import('./pages/Historico').then(m => ({ default: m.Historico })));
const Progresso = lazy(() => import('./pages/Progresso').then(m => ({ default: m.Progresso })));
const Perfil = lazy(() => import('./pages/Perfil').then(m => ({ default: m.Perfil })));

const LoadingFallback = () => <div className="empty">Carregando…</div>;

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <Suspense fallback={<LoadingFallback />}>
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <BottomNav />
      </div>
    </MotionConfig>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Home } from './pages/Home';
import { Treinos } from './pages/Treinos';
import { RotinaEditor } from './pages/RotinaEditor';
import { Exercicios } from './pages/Exercicios';
import { TreinoGuiado } from './pages/TreinoGuiado';
import { Historico } from './pages/Historico';
import { Perfil } from './pages/Perfil';

export function App() {
  return (
    <div className="app">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/treinos" element={<Treinos />} />
        <Route path="/treinos/rotina/nova" element={<RotinaEditor />} />
        <Route path="/treinos/rotina/:id" element={<RotinaEditor />} />
        <Route path="/exercicios" element={<Exercicios />} />
        <Route path="/treino" element={<TreinoGuiado />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <BottomNav />
    </div>
  );
}

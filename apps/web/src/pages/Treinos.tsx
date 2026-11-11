import { Dumbbell } from 'lucide-react';

export function Treinos() {
  return (
    <>
      <div className="topbar">
        <div className="brand">
          <h1>Treinos</h1>
        </div>
      </div>
      <div className="empty">
        <Dumbbell size={40} strokeWidth={1.6} style={{ opacity: 0.5 }} />
        <p style={{ marginTop: 12 }}>
          CRUD de categorias e treinos chega na <strong>Fase 1</strong>.
        </p>
      </div>
    </>
  );
}

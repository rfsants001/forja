import { CalendarDays } from 'lucide-react';

export function Historico() {
  return (
    <>
      <div className="topbar">
        <div className="brand">
          <h1>Histórico</h1>
        </div>
      </div>
      <div className="empty">
        <CalendarDays size={40} strokeWidth={1.6} style={{ opacity: 0.5 }} />
        <p style={{ marginTop: 12 }}>
          Heatmap e dias treinados chegam na <strong>Fase 2</strong>.
        </p>
      </div>
    </>
  );
}

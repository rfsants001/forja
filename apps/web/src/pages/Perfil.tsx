import { useLiveQuery } from 'dexie-react-hooks';
import { User } from 'lucide-react';
import { db } from '../db/db';

export function Perfil() {
  const settings = useLiveQuery(() => db.settings.get('app'), []);
  return (
    <>
      <div className="topbar">
        <div className="brand">
          <h1>Perfil</h1>
        </div>
      </div>
      <div className="card">
        <div className="brand" style={{ gap: 12 }}>
          <span className="mark">
            <User size={20} strokeWidth={2.4} />
          </span>
          <div>
            <div style={{ fontWeight: 700 }}>Rafael</div>
            <div className="hint">single-user local</div>
          </div>
        </div>
      </div>
      <div className="section-title">Preferências</div>
      <div className="card">
        <div className="hint">Unidade: {settings?.unit ?? 'kg'}</div>
        <div className="hint">Descanso padrão: {settings?.defaultRestSec ?? 90}s</div>
        <div className="hint">Tema: {settings?.theme ?? 'dark'}</div>
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: 24 }}>
        Export/import e login por passkey (sync) chegam nas Fases 4 e 6.
      </p>
    </>
  );
}

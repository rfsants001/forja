import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import { db } from '../db/db';
import { getSettings, updateSettings } from '../db/repo';
import { equipmentKey } from '../lib/equipment';
import { useT } from '../lib/i18n';
import '../styles/self-host.css';

export function Equipamentos() {
  const t = useT();
  const settings = useLiveQuery(getSettings, []);
  const { state } = useLocation();
  const fromCoach = state?.from === 'coach';
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const items = settings?.gymEquipment ?? [];

  function edit(item?: string) {
    setEditing(item);
    setName(item ?? '');
    setError('');
    setNotice('');
    if (item !== undefined) input.current?.focus();
  }

  async function change(oldName: string | undefined, newName?: string) {
    if (busy || !settings) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await db.transaction('rw', db.settings, async () => {
        const current = (await db.settings.get('app'))?.gymEquipment ?? [];
        const key = newName && equipmentKey(newName);
        if (key === 'barra') { setError(t('inventory.barType')); return; }
        if (newName !== undefined && (!key || current.some((item) => item !== oldName && equipmentKey(item) === key))) {
          setError(t(key ? 'inventory.duplicate' : 'inventory.invalid'));
          return;
        }
        const next = oldName === undefined ? [...current, newName!]
          : newName === undefined ? current.filter((item) => item !== oldName)
          : current.map((item) => item === oldName ? newName : item);
        await updateSettings({ gymEquipment: next });
        if (newName !== undefined || oldName === editing) edit();
        setNotice(t(newName === undefined ? 'inventory.removed' : 'inventory.saved'));
      });
    } catch {
      setError(t('ui.equipmentSaveError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="coach-workspace inventory-page">
      <header className="coach-page-header">
        <div>
          <h1>{t('ui.myEquipment')}</h1>
          <p className="hint">{t('inventory.description')}</p>
        </div>
        <Link className="btn ghost" to={fromCoach ? '/perfil/assistente' : '/perfil'}>
          <ArrowLeft size={16} aria-hidden />{t(fromCoach ? 'coach.title' : 'nav.profile')}
        </Link>
      </header>
      <section className="card self-host-card" aria-labelledby="inventory-list-title">
        <h2 id="inventory-list-title">{t('inventory.items')}</h2>
        {settings === undefined ? <p className="hint" role="status">{t('ui.loadingPreferences')}</p>
          : items.length === 0 ? <p className="hint">{t('inventory.empty')}</p>
          : <ul className="self-host-list">
              {items.map((item) => <li key={item}>
                <span>{item}{equipmentKey(item) === 'barra' && <small className="hint">{t('inventory.barType')}</small>}</span>
                <div className="self-host-actions">
                  <button className="btn ghost inventory-icon" type="button" disabled={busy} aria-label={t('inventory.rename', [item])}
                    onClick={() => edit(item)}><Pencil size={16} aria-hidden /></button>
                  <button className="btn ghost inventory-icon" type="button" disabled={busy} aria-label={t('inventory.remove', [item])}
                    onClick={() => void change(item)}><Trash2 size={16} aria-hidden /></button>
                </div>
              </li>)}
            </ul>}
      </section>
      <section className="card self-host-card">
        <form className="inventory-form" onSubmit={(event) => { event.preventDefault(); void change(editing, name.trim()); }}>
          <label htmlFor="inventory-name">{t('inventory.name')}</label>
          <p className="hint" id="inventory-examples">{t('inventory.examples')}</p>
          <input ref={input} id="inventory-name" type="text" value={name} maxLength={80} required
            aria-describedby="inventory-examples" disabled={busy} onChange={(event) => { setName(event.target.value); setError(''); }} />
          <div className="self-host-actions">
            <button className="btn" type="submit" disabled={!settings || busy || !name.trim()}>
              {editing ? <Pencil size={16} aria-hidden /> : <Plus size={16} aria-hidden />}
              {t(editing ? 'inventory.save' : 'inventory.add')}
            </button>
            {editing && <button className="btn ghost" type="button" onClick={() => edit()} disabled={busy}>{t('tg.cancel')}</button>}
          </div>
          {error && <p className="feedback error" role="alert">{error}</p>}
          {notice && <p className="hint" role="status">{notice}</p>}
        </form>
      </section>
    </div>
  );
}

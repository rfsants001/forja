import { useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, Pencil, Plus, Trash2 } from 'lucide-react';
import type { EquipmentItem } from '@forja/core';
import { db, uid } from '../db/db';
import { getSettings, updateSettings } from '../db/repo';
import { equipmentItems, equipmentKey } from '../lib/equipment';
import { useT } from '../lib/i18n';
import '../styles/self-host.css';

export function Equipamentos() {
  const t = useT();
  const settings = useLiveQuery(getSettings, []);
  const { state } = useLocation();
  const fromCoach = state?.from === 'coach';
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitWeight, setUnitWeight] = useState('');
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const items = equipmentItems(settings);
  const number = new Intl.NumberFormat(settings?.lang === 'en' ? 'en' : 'pt-BR', { maximumFractionDigits: 6 });

  function edit(item?: EquipmentItem) {
    setEditing(item?.id);
    setName(item?.name ?? '');
    setQuantity(item ? String(item.quantity ?? '') : '1');
    setUnitWeight(item?.unitWeightKg === undefined ? '' : String(item.unitWeightKg));
    setError('');
    setNotice('');
    if (item !== undefined) input.current?.focus();
  }

  async function change(oldId: string | undefined, newItem?: Omit<EquipmentItem, 'id'>) {
    if (busy || !settings) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await db.transaction('rw', db.settings, async () => {
        const current = equipmentItems(await getSettings());
        const key = newItem && equipmentKey(newItem.name);
        if (key === 'barra') { setError(t('inventory.barType')); return; }
        if (newItem && (!key || current.some((item) => item.id !== oldId && equipmentKey(item.name) === key
          && item.unitWeightKg === newItem.unitWeightKg))) {
          setError(t(key ? 'inventory.duplicate' : 'inventory.invalid'));
          return;
        }
        if (oldId !== undefined && !current.some((item) => item.id === oldId)) throw new Error('Equipment was removed');
        const next = newItem === undefined ? current.filter((item) => item.id !== oldId)
          : oldId === undefined ? [...current, { id: uid('equip_'), ...newItem }]
          : current.map((item) => item.id === oldId ? { id: oldId, ...newItem } : item);
        const names = [...new Map(next.map((item) => [equipmentKey(item.name), item.name])).values()];
        await updateSettings({ equipmentInventory: next, gymEquipment: names });
        if (newItem !== undefined || oldId === editing) edit();
        setNotice(t(newItem === undefined ? 'inventory.removed' : 'inventory.saved'));
      });
    } catch {
      setError(t('ui.equipmentSaveError'));
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const count = Number(quantity);
    const weight = unitWeight.trim();
    const unitWeightKg = weight ? Number(weight.replace(',', '.')) : undefined;
    if (!Number.isInteger(count) || count < 1 || count > 999) { setError(t('inventory.badQuantity')); return; }
    if (unitWeightKg !== undefined && (!/^\d+(?:[.,]\d+)?$/.test(weight) || unitWeightKg <= 0 || unitWeightKg > 1000)) {
      setError(t('inventory.badWeight'));
      return;
    }
    void change(editing, { name: name.trim(), quantity: count, unitWeightKg });
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
              {items.map((item) => {
                const unit = item.unitWeightKg === undefined ? '' : t('inventory.weightEach', [number.format(item.unitWeightKg)]);
                const description = unit ? item.name + ' · ' + unit : item.name;
                return <li key={item.id}>
                  <span><strong>{item.name}</strong>
                    <small className="hint">{item.quantity === undefined ? t('inventory.quantityUnknown') : t('inventory.quantityValue', [item.quantity])}
                      {unit && ' · ' + unit}</small>
                    {equipmentKey(item.name) === 'barra' && <small className="hint">{t('inventory.barType')}</small>}</span>
                  <div className="self-host-actions">
                    <button className="btn ghost inventory-icon" type="button" disabled={busy} aria-label={t('inventory.rename', [description])}
                      onClick={() => edit(item)}><Pencil size={16} aria-hidden /></button>
                    <button className="btn ghost inventory-icon" type="button" disabled={busy} aria-label={t('inventory.remove', [description])}
                      onClick={() => void change(item.id)}><Trash2 size={16} aria-hidden /></button>
                  </div>
                </li>;
              })}
            </ul>}
      </section>
      <section className="card self-host-card">
        <form className="inventory-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
          <label htmlFor="inventory-name">{t('inventory.name')}</label>
          <p className="hint" id="inventory-examples">{t('inventory.examples')}</p>
          <input ref={input} id="inventory-name" type="text" value={name} maxLength={80} required
            aria-describedby="inventory-examples" disabled={busy} onChange={(event) => { setName(event.target.value); setError(''); }} />
          <div className="inventory-fields">
            <label>{t('inventory.quantity')}
              <input type="number" min={1} max={999} step={1} value={quantity} required disabled={busy}
                onChange={(event) => { setQuantity(event.target.value); setError(''); }} />
            </label>
            <label>{t('inventory.unitWeight')}
              <input type="text" inputMode="decimal" maxLength={12} value={unitWeight} disabled={busy}
                aria-describedby="inventory-weight-hint" onChange={(event) => { setUnitWeight(event.target.value); setError(''); }} />
            </label>
          </div>
          <p className="hint" id="inventory-weight-hint">{t('inventory.weightHint')}</p>
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

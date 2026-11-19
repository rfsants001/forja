import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Weekday } from '@forja/core';
import { db } from '../db/db';
import { readPortablePlan, savePortablePlan, type PortableRoutine } from '../lib/portable-plan';
import { useT } from '../lib/i18n';
import { UiError } from '../lib/ui-error';
import { CoachFileInput } from './CoachFileInput';

export const weekdayOrder: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export function PortablePlanImport({ catalog }: { catalog: readonly Exercise[] }) {
  const t = useT();
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  const occupied = useLiveQuery(async () => {
    const rows = await db.weekPlan.toArray();
    return new Set(rows.filter(({ routineId }) => routineId).map(({ weekday }) => weekday));
  }, []);
  const [routines, setRoutines] = useState<PortableRoutine[]>([]);
  const [category, setCategory] = useState('');
  const [schedule, setSchedule] = useState<Map<Weekday, string>>(new Map());
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const categoryId = category || categories?.[0]?.id || '';
  const hasConflict = [...schedule.keys()].some((day) => occupied?.has(day));

  async function read(file?: File) {
    setError(''); setRoutines([]); setSchedule(new Map()); setReplace(false); setSaved(false);
    if (!file) return;
    setBusy(true);
    try { setRoutines(await readPortablePlan(file, catalog)); }
    catch (failure) { setError(failure instanceof UiError ? t(failure.key) : t('coach.portInvalid')); }
    finally { setBusy(false); }
  }

  async function save() {
    if (busy || saved || !schedule.size || !categoryId || (hasConflict && !replace)) return;
    setError('');
    setBusy(true);
    try { await savePortablePlan(routines, schedule, categoryId, replace); setSaved(true); }
    catch (failure) { setError(failure instanceof UiError ? t(failure.key) : t('ui.saveRoutineFailed')); }
    finally { setBusy(false); }
  }

  return <div className="self-host-card coach-port">
    <p className="hint">{t('coach.portHelp')}</p>
    <CoachFileInput accept=".json,application/json" disabled={busy} onFile={(file) => void read(file)} />
    {routines.length > 0 && !saved && <>
      <div className="coach-week-rows">
        {weekdayOrder.map((day) => <label key={day}>
          <span id={'port-day-' + day}>{t('wd.full.' + day)}{occupied?.has(day) ? ' · ' + t('coach.dayOccupied') : ''}</span>
          <select aria-labelledby={'port-day-' + day} value={schedule.get(day) ?? ''} disabled={busy}
            onChange={(event) => {
              const updated = new Map(schedule);
              if (event.target.value) updated.set(day, event.target.value);
              else updated.delete(day);
              setSchedule(updated);
            }}>
            <option value="">{t('coach.leaveDay')}</option>
            {routines.map(({ key, name }) => <option key={key} value={key}>{name}</option>)}
          </select>
        </label>)}
      </div>
      <details>
        <summary>{t('coach.portRoutines', [routines.length])}</summary>
        <ul className="self-host-list">
          {routines.map(({ key, name, moves }) => <li key={key}><strong>{name}</strong>
            <span>{t('ui.exercisesTotal', [moves.length, moves.length !== 1 ? 's' : ''])}</span></li>)}
        </ul>
      </details>
      <label>{t('ui.category')}<select value={categoryId} disabled={busy}
        onChange={(event) => setCategory(event.target.value)}>
        {categories?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      </select></label>
      {hasConflict && <label className="coach-plan-inventory"><input type="checkbox" checked={replace} disabled={busy}
        onChange={(event) => setReplace(event.target.checked)} />{t('ui.replaceBusyDays')}</label>}
      <button className="btn" type="button" disabled={busy || !schedule.size || !categoryId || (hasConflict && !replace)}
        onClick={() => void save()}>{t('coach.portSave')}</button>
    </>}
    {saved && <p role="status">{t('coach.portSaved', [routines.length, schedule.size])} <Link to="/treinos">{t('nav.workouts')}</Link></p>}
    {error && <p className="feedback error" role="alert">{error}</p>}
  </div>;
}

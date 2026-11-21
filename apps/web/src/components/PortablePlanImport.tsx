import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Download, FileJson, Upload, X } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, Weekday } from '@forja/core';
import { db } from '../db/db';
import { readPortablePlan, savePortablePlan, type PortableRoutine } from '../lib/portable-plan';
import { weekdayOrder } from '../lib/weekdays';
import { useT } from '../lib/i18n';
import { UiError } from '../lib/ui-error';
import { WeekdayPicker } from './WeekdayPicker';
import '../styles/portable-plan.css';

export function PortablePlanImport({ catalog, onBusyChange }: {
  catalog: readonly Exercise[];
  onBusyChange?: (busy: boolean) => void;
}) {
  const t = useT();
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const categories = useLiveQuery(() => db.categories.orderBy('order').toArray(), []);
  const occupied = useLiveQuery(async () => {
    const rows = await db.weekPlan.toArray();
    return new Set(rows.filter(({ routineId }) => routineId).map(({ weekday }) => weekday));
  }, []);
  const [routines, setRoutines] = useState<PortableRoutine[]>([]);
  const [filename, setFilename] = useState('');
  const [category, setCategory] = useState('');
  const [schedule, setSchedule] = useState<Map<Weekday, string>>(new Map());
  const [replace, setReplace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const categoryId = category || categories?.[0]?.id || '';
  const hasConflict = [...schedule.keys()].some((day) => occupied?.has(day));
  const example = JSON.stringify({ routines: [{ name: t('port.exampleRoutine'), note: t('port.exampleNote'), exercises: [
    { name: t('port.exampleExercise'), sets: 3, reps: '8–12', loadKg: 10, restSec: 90 },
    { name: t('port.exampleTimed'), sets: 2, seconds: 30, restSec: 60 },
  ] }] }, null, 2);

  function working(value: boolean) { setBusy(value); onBusyChange?.(value); }
  async function read(file?: File) {
    if (!file) return;
    setError(''); setRoutines([]); setSchedule(new Map()); setReplace(false); setSaved(false); setFilename(file.name);
    working(true);
    try { setRoutines(await readPortablePlan(file, catalog)); }
    catch (failure) { setError(failure instanceof UiError ? t(failure.key) : t('coach.portInvalid')); }
    finally { working(false); }
  }
  function downloadExample() {
    const url = URL.createObjectURL(new Blob([example + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'forja-plano-exemplo.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function toggleDay(day: Weekday) {
    const updated = new Map(schedule);
    if (updated.has(day)) updated.delete(day);
    else {
      const used = new Set(updated.values());
      const routine = routines.find(({ key }) => !used.has(key)) ?? routines[0];
      if (routine) updated.set(day, routine.key);
    }
    setSchedule(updated); setReplace(false);
  }
  async function save() {
    if (busy || saved || !schedule.size || !categoryId || (hasConflict && !replace)) return;
    setError(''); working(true);
    try { await savePortablePlan(routines, schedule, categoryId, replace); setSaved(true); }
    catch (failure) { setError(failure instanceof UiError ? t(failure.key) : t('ui.saveRoutineFailed')); }
    finally { working(false); }
  }

  return <div className="portable-import">
    <p className="hint">{t('port.intro')}</p>
    {!saved && <>
      <input ref={fileInput} id={id + '-file'} type="file" tabIndex={-1} className="visually-hidden"
        aria-label={t('port.file')} accept=".json,application/json" disabled={busy}
        onChange={(event) => { void read(event.target.files?.[0]); event.target.value = ''; }} />
      <div className={'portable-file' + (routines.length ? ' ready' : '')}>
        <FileJson size={24} aria-hidden />
        <div><strong>{filename || t('port.file')}</strong>{!routines.length && <span className="hint">{t('port.fileHelp')}</span>}</div>
        <button className="btn" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
          <Upload size={15} aria-hidden />{t(busy ? 'perf.processing' : routines.length ? 'port.changeFile' : 'coach.pickFile')}
        </button>
      </div>
      {routines.length === 0 && <details className="portable-format" open>
        <summary>{t('port.format')}</summary>
        <p>{t('port.required')}</p><p>{t('port.optional')}</p>
        <pre tabIndex={0} aria-label={t('port.example')}><code>{example}</code></pre>
        <button className="btn ghost" type="button" onClick={downloadExample}><Download size={15} aria-hidden />{t('port.download')}</button>
      </details>}
      {routines.length > 0 && <>
        <div className="portable-section-heading"><h3>{t('port.preview')}</h3><span className="hint">{t('coach.portRoutines', [routines.length])}</span></div>
        <div className="portable-routines">
          {routines.map(({ key, name, note, moves }) => <details key={key}>
            <summary><strong>{name}</strong><span>{t('ui.exercisesTotal', [moves.length, moves.length !== 1 ? 's' : ''])}</span></summary>
            {note && <p className="hint">{note}</p>}
            <ol>{moves.map(({ exercise, config }, index) => <li key={index}><span>{exercise.name}</span>
              <small>{config.sets} × {config.targetReps ?? (config.targetSec !== undefined ? config.targetSec + ' s' : '—')}
                {config.targetSecMax !== undefined && '–' + config.targetSecMax + ' s'}
                {config.targetWeightKg !== undefined && ' · ' + config.targetWeightKg + ' kg'}
                {config.restSec !== undefined && ' · ' + t('port.rest', [config.restSec])}
                {config.targetDistanceM !== undefined && ' · ' + config.targetDistanceM + ' m'}
                {config.targetSpeedKmh !== undefined && ' · ' + config.targetSpeedKmh + ' km/h'}</small>
              {config.note && <p className="hint">{config.note}</p>}
            </li>)}</ol>
          </details>)}
        </div>
        <fieldset className="portable-schedule" disabled={busy}>
          <legend id={id + '-days'}>{t('port.days')}</legend>
          <p className="hint">{t('port.daysHelp')}</p>
          <WeekdayPicker selected={new Set(schedule.keys())} onToggle={toggleDay} labelledBy={id + '-days'} disabled={busy} />
          <div className="portable-day-rows">
            {weekdayOrder.filter((day) => schedule.has(day)).map((day) => <label key={day}>
              <span>{t('wd.full.' + day)}{occupied?.has(day) && <small>{t('coach.dayOccupied')}</small>}</span>
              <select aria-label={t('port.routineDay', [t('wd.full.' + day)])} value={schedule.get(day)}
                onChange={(event) => setSchedule(new Map(schedule).set(day, event.target.value))}>
                {routines.map(({ key, name }) => <option key={key} value={key}>{name}</option>)}
              </select>
            </label>)}
          </div>
          <label className="portable-category">{t('ui.category')}<select value={categoryId}
            onChange={(event) => setCategory(event.target.value)}>
            {categories?.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select></label>
          {hasConflict && <label className="portable-conflict"><input type="checkbox" checked={replace}
            onChange={(event) => setReplace(event.target.checked)} />{t('ui.replaceBusyDays')}</label>}
        </fieldset>
        <div className="portable-footer"><span className="hint" role="status">{t('port.saveSummary', [routines.length, routines.length === 1 ? '' : 's', schedule.size, schedule.size === 1 ? '' : 's'])}</span>
          <button className="btn" type="button" disabled={busy || !schedule.size || !categoryId || (hasConflict && !replace)}
            onClick={() => void save()}>{t(busy ? 'perf.processing' : 'coach.portSave')}</button>
        </div>
      </>}
    </>}
    {saved && <div className="portable-success" role="status"><Check size={22} aria-hidden /><div>
      <strong>{t('coach.portSaved', [routines.length, routines.length === 1 ? '' : 's', schedule.size, schedule.size === 1 ? '' : 's'])}</strong><p>{t('port.savedHelp')}</p>
      <Link className="btn" to="/treinos">{t('nav.workouts')}</Link>
    </div></div>}
    {error && <p className="feedback error" role="alert">{error}</p>}
  </div>;
}

/** Same local import flow from Profile and the training assistant. Native dialog owns focus and Escape. */
export function PortablePlanImportDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const catalog = useLiveQuery(() => db.exercises.toArray(), []);
  const [busy, setBusy] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  return <dialog ref={dialog} className="sheet form-dialog portable-dialog" aria-labelledby={id}
    onClose={onClose} onCancel={(event) => { if (busy) event.preventDefault(); }}>
    <header className="form-dialog-heading"><h2 id={id}>{t('port.title')}</h2>
      <button className="btn ghost icon" type="button" disabled={busy} aria-label={t('ui.closeForm')}
        onClick={() => dialog.current?.close()}><X size={18} aria-hidden /></button>
    </header>
    {catalog === undefined ? <p role="status">{t('ui.loadingPreferences')}</p> : <PortablePlanImport catalog={catalog} onBusyChange={setBusy} />}
  </dialog>;
}

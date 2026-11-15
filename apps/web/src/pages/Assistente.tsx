import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { toISO, type Routine } from '@forja/core';
import { db } from '../db/db';
import { getSettings } from '../db/repo';
import { api, post, sessionInfo, syncNow, syncRuntime, SyncError } from '../lib/sync-client';
import { useT } from '../lib/i18n';
import { applySuggestion, undoSuggestion, weeklyReview } from '../lib/coach-review';
import type { ReviewResult, Suggestion } from '../lib/coach-review';
import { syncMessage } from './Dispositivos';

interface Providers { destination: string; models: string[]; available: boolean }

export function Assistente() {
  const t = useT();
  const [end, setEnd] = useState(toISO(new Date()));
  const [providers, setProviders] = useState<Providers>();
  const [model, setModel] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviewResult>();
  const [baseline, setBaseline] = useState<Routine[]>([]);
  const [selected, setSelected] = useState<Suggestion>();
  const call = useRef<AbortController>(null);
  const workouts = useLiveQuery(() => db.workouts.toArray(), []);
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const settings = useLiveQuery(getSettings, []);
  const edits = useLiveQuery(() => db.coachEdits.toArray(), []);
  const pending = useLiveQuery(() => db.syncOutbox.count(), []);
  const preview = end && workouts && routines && exercises
    ? weeklyReview(end, workouts, routines, exercises, settings?.gymEquipment ?? []) : undefined;

  async function refreshProvider() {
    const next = await api<Providers>('/coach/providers');
    setProviders(next);
    setModel((current) => next.models.includes(current) ? current : (next.models[0] ?? ''));
  }
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try { await work(); }
    catch (error) { setError(error instanceof SyncError && error.code === 'STALE_PROPOSAL' ? t('coach.stale') : syncMessage(error, t)); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    void sessionInfo().then(async (session) => {
      const parts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit', timeZone: session.timeZone,
      }).formatToParts(new Date());
      setEnd(['year', 'month', 'day'].map((part) => parts.find((item) => item.type === part)?.value).join('-'));
      if (session.device) await refreshProvider();
    }).catch(() => {});
    return () => call.current?.abort();
  }, []);

  function generate() {
    if (!preview || !routines) return;
    setResult(undefined);
    setSelected(undefined);
    setBaseline(routines);
    call.current = new AbortController();
    const controller = call.current;
    void run(async () => {
      try {
        const response = await post<ReviewResult>('/coach/reviews', { ...preview, model, lang: settings?.lang }, controller.signal);
        if (!controller.signal.aborted) setResult(response);
      } catch (error) {
        if (!controller.signal.aborted) throw error;
        setNotice(t('coach.canceled'));
      } finally { call.current = null; }
    });
  }

  return (
    <>
      <header className="topbar"><div className="brand"><span className="mark"><ClipboardList size={20} aria-hidden="true" /></span><h1>{t('coach.title')}</h1></div></header>
      <div className="self-host-layout">
        <section className="card self-host-card">
          <h2>{t('coach.weekly')}</h2>
          <label>{t('coach.lastDate')}<input type="date" required disabled={busy} value={end} onChange={(event) => {
            setEnd(event.target.value);
            setResult(undefined);
            setSelected(undefined);
          }} /></label>
          <h3>{t('coach.preview')}</h3>
          {preview && (
            <>
              <p className="hint">{preview.start} – {preview.end}</p>
              <dl className="coach-metrics">
                <div><dt>{t('sync.kind.workouts')}</dt><dd>{preview.workouts}</dd></div>
                <div><dt>{t('hist.workSets')}</dt><dd>{preview.sets}</dd></div>
                <div><dt>{t('hist.volume')}</dt><dd>{new Intl.NumberFormat(document.documentElement.lang).format(preview.volume)} kg</dd></div>
              </dl>
              {pending ? <p className="hint">{t('coach.pending')}</p> : null}
              <details><summary>{t('coach.candidates', [preview.candidates.length])}</summary>
                <ul className="self-host-list">{preview.candidates.map((item) => (
                  <li key={item.routineId + ':' + item.index + ':' + item.toId}>{item.fromName} → {item.toName}</li>
                ))}</ul>
              </details>
              {providers && <p>{t('coach.destination', [providers.destination])}</p>}
              <div className="self-host-actions">
                <button className="btn" type="button" disabled={busy || !model || !preview.workouts} onClick={generate}>{t('coach.generate')}</button>
                {call.current && <button className="btn ghost" type="button" onClick={() => call.current?.abort()}>{t('tg.cancel')}</button>}
              </div>
            </>
          )}
          {notice && <p className="feedback" role="status">{notice}</p>}
          {error && <p className="feedback error" role="alert">{error}</p>}
          {result && (
            <div className="self-host-card">
              <h3>{t('coach.review')}</h3>
              <p>{result.summary}</p>
              {result.suggestions.map((suggestion) => {
                const key = suggestion.routineId + ':' + suggestion.index + ':' + suggestion.toId;
                const isSelected = selected === suggestion;
                return <div className="coach-proposal" key={key}>
                  <p>{baseline.find((routine) => routine.id === suggestion.routineId)?.name}</p>
                  <p><strong>{t('coach.current')}</strong> {suggestion.fromName}</p>
                  <p><strong>{t('coach.suggested')}</strong> {suggestion.toName}</p>
                  <p className="hint">{suggestion.reason}</p>
                  <div className="self-host-actions">
                    {!isSelected ? <button type="button" className="btn ghost" onClick={() => setSelected(suggestion)}>{t('coach.reviewChange')}</button>
                      : <><button type="button" className="btn ghost" onClick={() => setSelected(undefined)}>{t('tg.cancel')}</button>
                        <button className="btn" disabled={busy || !settings} type="button" onClick={() => void run(async () => {
                          const original = baseline.find((routine) => routine.id === suggestion.routineId);
                          if (!original || !settings) throw new SyncError('STALE_PROPOSAL');
                          if (await db.syncState.get('installation')) {
                            await syncNow();
                            if (syncRuntime().status !== 'updated') throw new SyncError('STALE_PROPOSAL');
                          }
                          await applySuggestion(suggestion, original);
                          setSelected(undefined);
                          setResult(undefined);
                          setNotice(t('coach.applied'));
                        })}>{t('coach.apply')}</button></>}
                  </div>
                </div>;
              })}
            </div>
          )}
          {edits?.map((edit) => <div className="self-host-actions" key={edit.id}>
            <span>{edit.after.name}</span>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => void run(async () => {
              await undoSuggestion(edit.id);
              setNotice(t('coach.undone'));
            })}>{t('coach.undo')}</button>
          </div>)}
        </section>
        <section className="card self-host-card">
          <h2>{t('coach.provider')}</h2>
          <p>{providers?.available ? 'Ollama' : t('coach.unavailable')}</p>
          {providers && !providers.models.length && <p className="hint">{t('coach.modelUnavailable')}</p>}
          {providers && providers.models.length > 0 && (
            <label>{t('coach.model')}<select disabled={busy} value={model} onChange={(event) => setModel(event.target.value)}>
              {providers.models.map((name) => <option key={name}>{name}</option>)}
            </select></label>
          )}
          <div className="self-host-actions">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => void run(refreshProvider)}>{t('coach.refresh')}</button>
            <button type="button" className="btn ghost" disabled={busy || !model} onClick={() => void run(async () => {
              await post('/coach/test', { model });
              setNotice(t('coach.testOk'));
            })}>{t('coach.test')}</button>
          </div>
          <Link className="btn ghost" to="/perfil/dispositivos">{t('sync.devices')}</Link>
        </section>
      </div>
    </>
  );
}

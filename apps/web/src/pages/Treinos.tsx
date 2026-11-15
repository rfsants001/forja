import { useT } from '../lib/i18n';
import '../styles/setup.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Plus, Dumbbell, CalendarDays, Library, Sparkles, X, Trash2 } from 'lucide-react';
import { fromISO, toISO } from '@forja/core';
import type { Routine, Weekday } from '@forja/core';
import { db } from '../db/db';
import { clearDayOverride, deleteRoutine, deleteStarterPlan, setDayOverride, setWeekday } from '../db/repo';
import { useSessionStore } from '../store/session';
import { STARTER_PLANS, applyStarterPlan } from '../lib/starter-plans';
import type { ApplyResult } from '../lib/starter-plans';

// ---------------------------------------------------------------------------
// Helpers de label do dia da semana
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT: Record<Weekday, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

const WEEKDAY_FULL: Record<Weekday, string> = {
  0: 'Domingo',
  1: 'Segunda',
  2: 'Terça',
  3: 'Quarta',
  4: 'Quinta',
  5: 'Sexta',
  6: 'Sábado',
};

// ---------------------------------------------------------------------------
// StarterPlansSheet — modal/sheet de seleção e aplicação de planos prontos
// ---------------------------------------------------------------------------

const WEEKDAY_SHORT_LABELS: Record<Weekday, string> = {
  0: 'Dom', 1: 'Seg', 2: 'Ter', 3: 'Qua', 4: 'Qui', 5: 'Sex', 6: 'Sáb',
};

function StarterPlansSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [selected, setSelected] = useState<string | null>(null);
  const [replaceDays, setReplaceDays] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (selected === null) return;
    setApplying(true);
    setError(null);
    try {
      const res = await applyStarterPlan(selected, replaceDays);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ui.planFailure'));
    } finally {
      setApplying(false);
    }
  }

  return (
    <dialog ref={dialog} className="sheet starter-dialog" aria-labelledby="starter-plans-title" onCancel={(event) => {
      event.preventDefault();
      if (!applying) onClose();
    }}>
        <div className="sheet-handle" />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 id="starter-plans-title" style={{ margin: 0 }}>{t("workouts.starterPlans")}</h2>
          <button
            className="btn ghost"
            style={{ padding: '8px', borderRadius: '50%' }}
            onClick={onClose}
            disabled={applying}
            aria-label={t("workouts.close")}
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </div>

        {/* Lista de planos */}
        {result === null ? (
          <>
            <div className="sp-plan-list">
              {STARTER_PLANS.map((plan) => (
                <button
                  key={plan.id}
                  className={`sp-plan-card${selected === plan.id ? ' selected' : ''}`}
                  aria-pressed={selected === plan.id}
                  onClick={() => setSelected(plan.id)}
                >
                  <div className="sp-plan-card-header">
                    <span className="sp-plan-dot" style={{ background: plan.color }} />
                    <span className="sp-plan-name">{plan.name}</span>
                    <span className="sp-plan-days">
                      {plan.weekdays.map((d) => WEEKDAY_SHORT_LABELS[d]).join(' / ')}
                    </span>
                  </div>
                  <span className="sp-plan-desc">{plan.description}</span>
                  <div className="sp-plan-routines">
                    {plan.routines.map((r) => (
                      <span key={r.name}>{r.name}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            <label className="starter-replace">
              <input type="checkbox" checked={replaceDays} onChange={(event) => setReplaceDays(event.target.checked)} />{t("ui.replaceBusyDays")}</label>
            {error !== null && (
              <div className="sp-feedback warn" role="alert">{error}</div>
            )}

            <div className="btn-row">
              <button className="btn ghost" disabled={applying} onClick={onClose}>{t("workouts.cancel")}</button>
              <button
                className="btn"
                disabled={selected === null || applying}
                onClick={() => { void handleApply(); }}
              >
                {applying ? t("workouts.applying") : t("workouts.applyPlan")}
              </button>
            </div>
          </>
        ) : (
          /* Feedback pós-aplicação */
          <>
            <div className="sp-feedback" role="status">
              {result.created > 0
                ? `${result.created} rotina${result.created > 1 ? 's' : ''} criada${result.created > 1 ? 's' : ''} com sucesso!`
                : t("workouts.alreadyApplied")}
              {result.skipped > 0 && (
                <span>{t('ui.planExisting', [result.skipped])}</span>
              )}
            </div>
            {result.preservedDays > 0 && <p className="feedback">{result.preservedDays} dia(s) ocupados foram mantidos.</p>}
            {result.unresolved.length > 0 && (
              <div className="sp-feedback warn" style={{ marginTop: 8 }}>
                Exercícios não encontrados no catálogo:{' '}
                {result.unresolved.join(', ')}
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn" onClick={onClose}>{t("workouts.close")}</button>
            </div>
          </>
        )}
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

type Deletion = {
  name: string;
  routines: Routine[];
  categoryId?: string;
};

function DeletePlanDialog({ target, onClose, onDeleted }: {
  target: Deletion;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const isPlan = target.categoryId !== undefined;
  const containsActive = useSessionStore((state) => target.routines.some((routine) => routine.id === state.active?.routineId));

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
  }, []);

  async function confirm() {
    if (deleting) return;
    setDeleting(true);
    setError('');
    try {
      if (target.categoryId !== undefined) {
        await deleteStarterPlan(target.categoryId, target.routines.map((routine) => routine.id));
      } else if (target.routines[0]) {
        await deleteRoutine(target.routines[0].id);
      }
      onDeleted();
    } catch (error) {
      setError(error instanceof Error && error.message.startsWith('O plano recebeu novas rotinas')
        ? error.message : t('ui.deleteFailure'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <dialog ref={dialog} className="sheet form-dialog plan-delete-dialog" aria-labelledby="plan-delete-title"
      aria-describedby="plan-delete-description" onClose={onClose}
      onCancel={(event) => { if (deleting) event.preventDefault(); }}>
      <header className="form-dialog-heading">
        <h2 id="plan-delete-title">{isPlan ? t("ui.deletePlanQuestion") : t("ui.deleteRoutineQuestion")}</h2>
      </header>
      <p id="plan-delete-description">
        <strong>{target.name}</strong>{t("ui.routineRemoved")}</p>
      {isPlan && target.routines.length > 0 && (
        <ul className="plan-delete-list" aria-label={t("ui.routinesToDelete")}>
          {target.routines.map((routine) => <li key={routine.id}>{routine.name}</li>)}
        </ul>
      )}
      {containsActive && <p className="hint">{t("ui.sessionContinues")}</p>}
      {error && <p className="feedback error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" autoFocus disabled={deleting} onClick={() => dialog.current?.close()}>{t("workouts.cancel")}</button>
        <button type="button" className="btn danger" disabled={deleting} onClick={() => void confirm()}>
          {deleting ? t("ui.deleting") : isPlan ? t("ui.deletePlan") : t("re.deleteRoutine")}
        </button>
      </div>
    </dialog>
  );
}

function RoutineRow({ routine, color, activeId, onDelete }: {
  routine: Routine; color?: string; activeId: string | null | undefined; onDelete: () => void;
}) {
  const t = useT();
  const resume = activeId === routine.id;
  return (
    <div className="routine-list-row">
      <Link to={`/treinos/rotina/${encodeURIComponent(routine.id)}`} className="routine-item"
        style={color ? { borderLeftColor: color, borderLeftWidth: 3 } : undefined} aria-label={`Editar ${routine.name}`}>
        <div className="routine-info">
          <div className="routine-name">{routine.name}</div>
          <div className="routine-meta">{t('ui.exercisesTotal', [routine.exercises.length, routine.exercises.length === 1 ? '' : 's'])}{routine.note ? ` · ${routine.note}` : ''}</div>
        </div>
      </Link>
      {routine.exercises.length > 0 && (activeId === null || resume) && (
        <Link className="btn ghost" to={`/treino?routineId=${encodeURIComponent(routine.id)}`}
          aria-label={`${resume ? 'Continuar' : 'Treinar agora'} · ${routine.name}`}>
          {resume ? t("ui.continue") : t("ui.trainNow")}
        </Link>
      )}
      <button type="button" className="icon-btn routine-delete" aria-label={`Excluir rotina · ${routine.name}`}
        title={t("re.deleteRoutine")} onClick={onDelete}><Trash2 size={16} aria-hidden="true" /></button>
    </div>
  );
}

function DateOverrideEditor({ routines, selectedDate }: { routines: Routine[]; selectedDate?: string }) {
  const t = useT();
  const [date, setDate] = useState(() => selectedDate ?? toISO(new Date()));
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error?: boolean } | null>(null);
  const row = useLiveQuery(async () => (await db.dayOverrides.get(date)) ?? null, [date]);
  const value = choice ?? (row?.dateISO === date ? row.routine : null) ?? '';

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback(null);
    try {
      if (value === '') await clearDayOverride(date);
      else await setDayOverride(date, value);
      setFeedback({ text: 'Agenda desta data atualizada.' });
    } catch {
      setFeedback({ text: t('ui.dateChangeFailure'), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card date-override" onSubmit={(event) => void save(event)}>
      <h2>{t("ui.changeDay")}</h2>
      <p className="hint">{t("ui.changeDayHelp")}</p>
      <div className="field-grid">
        <label>{t("prog.measureDate")}<input type="date" required value={date} disabled={busy} onChange={(event) => {
            setDate(event.target.value);
            setChoice(null);
            setFeedback(null);
          }} />
        </label>
        <label>{t("ui.workoutOnDate")}<select value={value} disabled={busy} onChange={(event) => setChoice(event.target.value)}>
            <option value="">{t("ui.useWeeklyPlan")}</option>
            <option value="rest">{t("workouts.rest")}</option>
            {routines.map((routine) => <option key={routine.id} value={routine.id}>{routine.name}</option>)}
          </select>
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn" disabled={busy || !date || row === undefined}>{busy ? t("re.saving") : t("ui.saveChange")}</button>
      </div>
      {feedback !== null && <p className={`feedback${feedback.error ? ' error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    </form>
  );
}

export function Treinos() {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();
  const active = useSessionStore((state) => state.active);
  const [deletion, setDeletion] = useState<Deletion | null>(null);
  const [deletedMessage, setDeletedMessage] = useState('');
  const routinesHeading = useRef<HTMLHeadingElement>(null);
  const activeId = active === null ? null : active.routineId;
  const dateParam = searchParams.get('data');
  const selectedDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) && toISO(fromISO(dateParam)) === dateParam
    ? dateParam : undefined;
  const agendaRef = useRef<HTMLElement>(null);
  const anchor = useLocation().hash;
  useEffect(() => {
    if (anchor !== '#agenda') return;
    agendaRef.current?.focus({ preventScroll: true });
    agendaRef.current?.scrollIntoView({ block: 'start' });
  }, [anchor, selectedDate]);
  // Dados reativos
  const categories = useLiveQuery(
    () => db.categories.orderBy('order').toArray(),
    [],
  );
  const routines = useLiveQuery(
    () => db.routines.orderBy('order').toArray(),
    [],
  );
  const weekPlanRows = useLiveQuery(
    () => db.weekPlan.toArray(),
    [],
  );
  const settings = useLiveQuery(
    () => db.settings.get('app'),
    [],
  );

  // Plano semanal montado em memória
  const weekPlan = useMemo<Record<Weekday, string | null>>(() => {
    const plan: Record<Weekday, string | null> = {
      0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null,
    };
    for (const row of weekPlanRows ?? []) {
      plan[row.weekday] = row.routineId;
    }
    return plan;
  }, [weekPlanRows]);

  // Semana ordenada respeitando weekStartsOn
  const weekStartsOn: 0 | 1 = settings?.weekStartsOn ?? 1;
  const orderedDays = useMemo<Weekday[]>(
    () => Array.from({ length: 7 }, (_, i) => ((i + weekStartsOn) % 7) as Weekday),
    [weekStartsOn],
  );

  // Hoje (para destacar o dia atual no plano)
  const todayWd = new Date().getDay() as Weekday;

  // Rotinas agrupadas por categoria
  const grouped = useMemo(() => {
    const cats = categories ?? [];
    const rots = routines ?? [];
    return cats.map((cat) => ({
      cat,
      routines: rots.filter((r) => r.categoryId === cat.id),
    }));
  }, [categories, routines]);

  const totalRoutines = (routines ?? []).length;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  async function handleWeekday(day: Weekday, value: string) {
    await setWeekday(day, value === '__rest__' ? null : value);
  }

  // Saving state por dia (para feedback visual)
  const [saving, setSaving] = useState<Weekday | null>(null);
  const [scheduleError, setScheduleError] = useState('');

  // Sheet de planos prontos
  const showStarterPlans = searchParams.get('planos') === '1';
  function setShowStarterPlans(show: boolean) {
    setSearchParams((params) => {
      if (show) params.set('planos', '1');
      else params.delete('planos');
      return params;
    }, { replace: true });
  }

  async function handleWeekdayChange(day: Weekday, value: string) {
    setSaving(day);
    setScheduleError('');
    try {
      await handleWeekday(day, value);
    } catch {
      setScheduleError(t('ui.scheduleError'));
    } finally {
      setSaving(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <>
      {deletion && (
        <DeletePlanDialog target={deletion} onClose={() => setDeletion(null)} onDeleted={() => {
          setDeletedMessage(deletion.categoryId ? 'Plano excluído.' : 'Rotina excluída.');
          setDeletion(null);
          routinesHeading.current?.focus();
        }} />
      )}
      {/* Sheet de planos prontos */}
      {showStarterPlans && (
        <StarterPlansSheet onClose={() => setShowStarterPlans(false)} />
      )}

      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <h1>{t("workouts.title")}</h1>
        </div>
        <div className="page-actions">
          <button
            className="btn ghost"
            style={{ padding: '10px 14px', fontSize: 13 }}
            onClick={() => setShowStarterPlans(true)}
            title={t("workouts.starterPlans")}
          >
            <Sparkles size={16} strokeWidth={2.2} aria-hidden />{t("workouts.starterPlans")}</button>
          <Link
            to="/exercicios"
            className="btn ghost"
            style={{ padding: '10px 14px', fontSize: 13 }}
          >
            <Library size={16} strokeWidth={2.4} />{t("workouts.exercises")}</Link>
          <Link
            to="/treinos/rotina/nova"
            className="btn"
            style={{ padding: '10px 16px', fontSize: 13 }}
          >
            <Plus size={16} strokeWidth={2.8} />{t("workouts.newRoutine")}</Link>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Seção 1: Rotinas por categoria                                       */}
      {/* ------------------------------------------------------------------ */}
      <div className="planning-layout">
        <section className="card planning-routines" aria-labelledby="my-routines">
        <h2 className="section-title panel-title" id="my-routines" ref={routinesHeading} tabIndex={-1}>
          <Dumbbell size={13} style={{ verticalAlign: 'middle', marginRight: 6, opacity: 0.7 }} />{t("workouts.myRoutines")}</h2>

        <p role="status" className={deletedMessage ? 'feedback plan-deletion-feedback' : 'sr-only'}>{deletedMessage}</p>
        {totalRoutines === 0 && !grouped.some(({ cat }) => cat.slug.startsWith('starter-')) ? (
          <div className="empty">
            <Dumbbell size={40} strokeWidth={1.6} style={{ opacity: 0.4 }} />
            <p style={{ marginTop: 12 }}>{t("workouts.noRoutines")}</p>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <button
                className="btn ghost-accent"
                style={{ display: 'inline-flex', gap: 6 }}
                onClick={() => setShowStarterPlans(true)}
              >
                <Sparkles size={16} strokeWidth={2.2} />{t("workouts.startWithPlan")}</button>
              <Link
                to="/treinos/rotina/nova"
                className="btn ghost"
                style={{ display: 'inline-flex' }}
              >
                <Plus size={16} />{t("workouts.createFromScratch")}</Link>
            </div>
          </div>
        ) : (
          <>
            {grouped.map(({ cat, routines: rots }) => {
              const isPlan = cat.slug.startsWith('starter-');
              if (rots.length === 0 && !isPlan) return null;
              return (
                <div key={cat.id} className="routine-group">
                  <div className="routine-group-header">
                    <span
                      className="cat-dot"
                      style={{ background: cat.color }}
                    />
                    <span className="cat-name">{cat.name}</span>
                    {isPlan && <button type="button" className="btn ghost plan-delete"
                      aria-label={`Excluir plano · ${cat.name}`} onClick={() => {
                        setDeletedMessage('');
                        setDeletion({ name: cat.name, categoryId: cat.id, routines: rots });
                      }}><Trash2 size={14} aria-hidden="true" />{t("ui.deletePlan")}</button>}
                  </div>
                  <div className="routine-list">
                    {rots.map((routine) => <RoutineRow key={routine.id} routine={routine} color={cat.color} activeId={activeId}
                      onDelete={() => {
                        setDeletedMessage('');
                        setDeletion({ name: routine.name, routines: [routine] });
                      }} />)}
                  </div>
                </div>
              );
            })}

            {/* Rotinas sem categoria reconhecida (categoria foi deletada) */}
            {(() => {
              const catIds = new Set((categories ?? []).map((c) => c.id));
              const orphans = (routines ?? []).filter((r) => !catIds.has(r.categoryId));
              if (orphans.length === 0) return null;
              return (
                <div className="routine-group">
                  <div className="routine-group-header">
                    <span className="cat-dot" style={{ background: 'var(--text-muted)' }} />
                    <span className="cat-name">{t("workouts.noCategory")}</span>
                  </div>
                  <div className="routine-list">
                    {orphans.map((routine) => <RoutineRow key={routine.id} routine={routine} activeId={activeId}
                      onDelete={() => {
                        setDeletedMessage('');
                        setDeletion({ name: routine.name, routines: [routine] });
                      }} />)}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* Seção 2: Plano da semana                                             */}
        </section>
        <section className="planning-agenda" id="agenda" ref={agendaRef} tabIndex={-1} aria-labelledby="plan-week">
        <div className="card">
        <h2 className="section-title panel-title" id="plan-week">
          <CalendarDays size={16} aria-hidden />{t("workouts.weekPlan")}</h2>

        {totalRoutines === 0 ? (
          <p className="hint" style={{ textAlign: 'center', paddingBottom: 12 }}>{t("workouts.createFirst")}</p>
        ) : (
          <div className="week-plan">
            {scheduleError && <p className="feedback error" role="alert">{scheduleError}</p>}
            {orderedDays.map((day) => {
              const isToday = day === todayWd;
              const currentValue = weekPlan[day] ?? '__rest__';
              return (
                <div key={day} className="week-row">
                  <span className={`wd-label${isToday ? ' today' : ''}`} title={WEEKDAY_FULL[day]}>
                    {WEEKDAY_SHORT[day]}
                  </span>
                  <select
                    value={currentValue}
                    onChange={(e) => { void handleWeekdayChange(day, e.target.value); }}
                    disabled={saving === day}
                    aria-label={`Treino de ${WEEKDAY_FULL[day]}`}
                  >
                    <option value="__rest__">{t("workouts.rest")}</option>
                    {(routines ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        )}

        </div>
        {totalRoutines > 0 && <DateOverrideEditor key={selectedDate ?? 'today'} selectedDate={selectedDate} routines={(routines ?? []).filter((routine) => routine.exercises.length > 0)} />}
        </section>
      </div>
    </>
  );
}

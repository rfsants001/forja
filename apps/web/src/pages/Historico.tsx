// Tela de histórico de treinos.
// Rota: /historico (wiring em App.tsx).
// Lista todos os workouts agrupados por data, com card expansível por treino.

import '../styles/historico.css';

import { useEffect, useId, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChevronDown, Clock, Dumbbell, Trash2, Check, X, Search } from 'lucide-react';
import type { WorkoutLog, WorkoutEntry, SetLog, TargetSnapshot, Exercise, Routine, Category, MuscleGroup, Settings } from '@forja/core';
import { addDays, compareWorkouts, fromISO, readSession, startOfWeek, toISO } from '@forja/core';
import { normalizeExName } from '../lib/normalize';
import { db } from '../db/db';
import { deleteWorkout, updateWorkoutEntries } from '../db/repo';
import { MuscleCoverage } from '../components/MuscleCoverage';
import { useT } from '../lib/i18n';
import { computeSummary } from '../lib/stats';

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

type HistoryPeriod = 'all' | 'thisWeek' | 'lastWeek' | 'custom';
type HistorySettings = Pick<Settings, 'unit' | 'lang' | 'muscleFigure'>;

function formatDate(iso: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return fromISO(iso).toLocaleDateString(locale, options);
}

function displayWeight(weightKg: number, unit: Settings['unit'], format: Intl.NumberFormat): string {
  return `${format.format(unit === 'lb' ? weightKg / 0.45359237 : weightKg)} ${unit}`;
}

/** Converte segundos em texto legível: "47 min" ou "1h 03 min" */
function formatDuration(secs: number | undefined): string | null {
  if (secs === undefined || secs <= 0) return null;
  const m = Math.round(secs / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${String(rm).padStart(2, '0')} min`;
}

/** Descreve o valor de uma série logada (reps×kg, Xs, —). */
/** Rótulo discreto do esforço logado (RIR/RPE), ou null se não houver. */
function describeEffort(set: SetLog): string | null {
  const rir = set.effort?.rir;
  const rpe = set.effort?.rpe;
  if (rir !== undefined) return `RIR ${rir}`;
  if (rpe !== undefined) return `RPE ${rpe}`;
  return null;
}

function describeSet(set: Pick<SetLog, 'reps' | 'weightKg' | 'sec' | 'distanceM' | 'speedKmh'>,
  unit: Settings['unit'], format: Intl.NumberFormat): string {
  const parts = [
    set.weightKg === undefined ? undefined : displayWeight(set.weightKg, unit, format),
    set.reps === undefined ? undefined : `${format.format(set.reps)} reps`,
    set.sec === undefined ? undefined : `${format.format(set.sec)} s`,
    set.distanceM === undefined ? undefined : `${format.format(set.distanceM)} m`,
    set.speedKmh === undefined ? undefined : `${format.format(set.speedKmh)} km/h`,
  ];
  return parts.filter((part) => part !== undefined).join(' · ');
}

function describeTarget(target: TargetSnapshot, index: number, unit: Settings['unit'], format: Intl.NumberFormat): string {
  if (target.unknown) return '';
  const mainSet = target.mainSets?.[index];
  return mainSet
    ? `${mainSet.reps}${mainSet.amrap ? '+' : ''} × ${displayWeight(mainSet.weightKg, unit, format)}`
    : [target.reps ? `${target.reps} reps` : '', describeSet({ ...target, reps: undefined }, unit, format)].filter(Boolean).join(' · ');
}

interface ExerciseDetailProps {
  entry: WorkoutEntry;
  exerciseName: string;
  unit: Settings['unit'];
  format: Intl.NumberFormat;
}

function ExerciseDetail({ entry, exerciseName, unit, format }: ExerciseDetailProps) {
  const t = useT();
  const session = readSession(entry);
  const warmupOnly = !!entry.warmupSets?.length && !entry.sets.some((set) => set.done);
  const badge = warmupOnly ? 'hist.onlyWarmup'
    : entry.target.unknown ? 'hist.targetUnknown'
      : session.hit ? 'hist.targetReached' : 'hist.belowTarget';

  return (
    <section className="hist-exercise">
      <div className="hist-exercise-header">
        <h4 className="hist-exercise-name">{exerciseName}</h4>
        <span className={`hist-ex-badge ${entry.target.unknown || warmupOnly ? '' : session.hit ? 'hit' : 'miss'}`}>
          {t(badge)}
        </span>
        {!entry.target.unknown && !warmupOnly && (
          <span className="hist-ex-sets-info">{t('hist.sets', [session.setsHit, session.setsTotal])}</span>
        )}
      </div>
      {(['warmupSets', 'sets'] as const).map((list) => {
        const sets = entry[list];
        if (!sets?.length) return null;
        const warmup = list === 'warmupSets';
        return (
          <div className="hist-set-group" key={list}>
            <p>{t(warmup ? 'hist.warmups' : 'hist.workSets')}</p>
            <ol className="hist-sets-list">
              {sets.map((set, index) => {
                const target = warmup ? '' : describeTarget(entry.target, index, unit, format);
                const effort = describeEffort(set);
                return (
                  <li key={index} className="hist-set-row">
                    <span className="hist-set-idx">{index + 1}</span>
                    <span className={`hist-set-done-icon ${set.done ? 'ok' : 'miss'}`} role="img"
                      aria-label={t(set.done ? 'hist.setDone' : 'hist.setPending')}>
                      {set.done ? <Check size={13} aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
                    </span>
                    <span className="hist-set-value">{describeSet(set, unit, format) || '—'}</span>
                    {effort && <span className="hist-set-effort">{effort}</span>}
                    {target && <span className="hist-set-target">{t('hist.targetValue', [target])}</span>}
                    {set.note && <span className="hist-set-note">{set.note}</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: card de um workout
// ---------------------------------------------------------------------------

function EditWorkout({ workout, exerciseMap, onClose }: {
  workout: WorkoutLog; exerciseMap: Map<string, Exercise>; onClose: (saved?: boolean) => void;
}) {
  const t = useT();
  const [entries, setEntries] = useState(workout.entries);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const labels = { reps: 'Repetições', weightKg: 'Carga (kg)', sec: 'Tempo (s)', distanceM: 'Distância (m)', speedKmh: 'Velocidade (km/h)' };

  function patch(entryIndex: number, setIndex: number, change: Partial<SetLog>, list: 'sets' | 'warmupSets') {
    setEntries((current) => current.map((entry, index) => index === entryIndex ? {
      ...entry, [list]: (entry[list] ?? []).map((set, si) => si === setIndex ? { ...set, ...change } : set),
    } : entry));
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await updateWorkoutEntries(workout.id, entries);
      onClose(true);
    } catch {
      setError(t('ui.editSetFailure'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="hist-edit" onSubmit={(event) => void save(event)}>
      <h3>{t("hist.editSets")}</h3>
      <p className="hint">{t("ui.editSetHelp")}</p>
      {entries.map((entry, entryIndex) => {
        const exercise = exerciseMap.get(entry.exerciseId);
        return (
          <section key={entryIndex}>
            <h4>{exercise?.name ?? entry.exerciseId}</h4>
            {(['warmupSets', 'sets'] as const).flatMap((list) => (entry[list] ?? []).map((set, setIndex) => {
              const mode = exercise?.mode ?? (set.distanceM !== undefined || set.speedKmh !== undefined ? 'cardio' : set.sec === undefined ? 'reps' : 'time');
              const metrics = mode === 'cardio' ? (['sec', 'distanceM', 'speedKmh'] as const)
                : mode === 'time' ? (['sec'] as const) : (['reps', 'weightKg'] as const);
              return (
                <fieldset key={`${list}-${setIndex}`} className="hist-edit-set" disabled={saving}>
                  <legend>{list === 'warmupSets' ? t("hist.warmups") : t("ui.set")} {setIndex + 1}</legend>
                  {metrics.map((metric) => (
                    <label key={metric}>{labels[metric]}
                      <input type="number" min={0} step={metric === 'reps' || metric === 'sec' ? 1 : 'any'}
                        inputMode={metric === 'reps' || metric === 'sec' ? 'numeric' : 'decimal'}
                        value={set[metric] ?? ''} onChange={(event) => patch(entryIndex, setIndex, {
                          [metric]: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : undefined,
                        }, list)} />
                    </label>
                  ))}
                  <label className="hist-edit-done"><input type="checkbox" checked={set.done}
                    onChange={(event) => patch(entryIndex, setIndex, { done: event.target.checked }, list)} />{t("ui.done")}</label>
                </fieldset>
              );
            }))}
          </section>
        );
      })}
      {error && <p className="feedback error" role="alert">{error}</p>}
      <div className="btn-row">
        <button type="button" className="btn ghost" disabled={saving} onClick={() => onClose()}>{t("ui.cancelEdit")}</button>
        <button type="submit" className="btn" disabled={saving}>{saving ? t("prog.measureSaving") : t("ui.saveSets")}</button>
      </div>
    </form>
  );
}

interface WorkoutCardProps {
  workout: WorkoutLog;
  routineName: string;
  categoryColor: string | undefined;
  exerciseMap: Map<string, Exercise>;
  onDelete: (id: string) => void;
  requested: boolean;
  settings: HistorySettings;
  format: Intl.NumberFormat;
}

function WorkoutCard({ workout, routineName, categoryColor, exerciseMap, onDelete, requested, settings, format }: WorkoutCardProps) {
  const t = useT();
  const detailId = useId();
  const [expanded, setExpanded] = useState(requested);
  const headerRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!requested) return;
    setExpanded(true);
    headerRef.current?.focus({ preventScroll: true });
    headerRef.current?.scrollIntoView({ block: 'nearest' });
  }, [requested]);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState('');

  const summary = useMemo(() => {
    const primary = new Set<MuscleGroup>();
    const secondary = new Set<MuscleGroup>();
    let partial = false;
    let completed = 0;
    let hits = 0;
    let evaluated = 0;
    for (const entry of workout.entries) {
      if (!entry.target.unknown) {
        evaluated++;
        if (readSession(entry).hit) hits++;
      }
      const completedForExercise = entry.sets.filter((set) => set.done).length;
      completed += completedForExercise;
      if (completedForExercise === 0) continue;
      const exercise = exerciseMap.get(entry.exerciseId);
      if (!exercise) {
        partial = true;
        continue;
      }
      if (exercise.primaryMuscle === 'other') partial = true;
      else if (exercise.primaryMuscle !== 'cardio') primary.add(exercise.primaryMuscle);
      for (const group of exercise.secondaryMuscles) {
        if (group !== 'other' && group !== 'cardio') secondary.add(group);
      }
    }
    return {
      completed, evaluated, hits, partial, primary: [...primary], secondary: [...secondary],
      volume: computeSummary([workout], null).totalVolume,
    };
  }, [exerciseMap, workout]);
  const duration = formatDuration(workout.durationSec);

  function handleDelete() {
    if (window.confirm(t('hist.deleteConfirm', [routineName]))) onDelete(workout.id);
  }

  return (
    <article className="hist-card">
      <h3>
        <button ref={headerRef} type="button" className="hist-card-header" aria-expanded={expanded}
          aria-controls={detailId} onClick={() => setExpanded((value) => !value)}>
          {categoryColor !== undefined && (
            <span className="hist-cat-dot" style={{ background: categoryColor }} aria-hidden="true" />
          )}
          <span className="hist-card-info">
            <span className="hist-card-title">{routineName}</span>
            <span className="hist-card-meta">
              {duration && <span className="hist-meta-chip"><Clock size={12} aria-hidden="true" />{duration}</span>}
              <span className="hist-meta-chip">
                <Dumbbell size={12} aria-hidden="true" />
                {t(summary.completed === 1 ? 'hist.oneCompleted' : 'hist.manyCompleted', [summary.completed])}
              </span>
              {summary.evaluated > 0 && (
                <span className={`hist-hits-badge ${summary.hits === summary.evaluated ? '' : 'miss'}`}>
                  {t('hist.targetSummary', [summary.hits, summary.evaluated])}
                </span>
              )}
            </span>
          </span>
          <ChevronDown size={18} className={`hist-chevron ${expanded ? 'open' : ''}`} aria-hidden="true" />
        </button>
      </h3>

      <div id={detailId} className="hist-detail" hidden={!expanded}>
        {expanded && (
          <div className="hist-detail-inner">
            {editing && <EditWorkout workout={workout} exerciseMap={exerciseMap} onClose={(saved) => {
              setEditing(false);
              if (saved) setStatus(t('hist.savedSets'));
            }} />}
            {status && <p className="feedback" role="status">{status}</p>}
            {!editing && (
              <div className="hist-detail-layout">
                <div className="hist-exercises">
                  {summary.volume > 0 && (
                    <div className="hist-volume">
                      <span>{t('hist.volume')}</span>
                      <strong>{displayWeight(summary.volume, settings.unit, format)}</strong>
                      <small>{t('hist.volumeDescription')}</small>
                    </div>
                  )}
                  {workout.note && workout.note !== routineName && <p className="hist-workout-note">{workout.note}</p>}
                  {workout.entries.length === 0 && <p className="hint">{t('hist.noExercises')}</p>}
                  {workout.entries.map((entry, index) => (
                    <ExerciseDetail key={`${entry.exerciseId}-${index}`} entry={entry}
                      exerciseName={exerciseMap.get(entry.exerciseId)?.name ?? t('hist.exerciseFallback', [entry.exerciseId])}
                      unit={settings.unit} format={format} />
                  ))}
                  {workout.prs?.length ? <p className="feedback">{t('hist.personalRecords', [workout.prs.length])}</p> : null}
                </div>
                <section className="hist-muscle-map" aria-label={t('hist.muscleMap')}>
                  <h4>{t('hist.muscleMap')}</h4>
                  {(summary.primary.length > 0 || summary.secondary.length > 0)
                    ? <MuscleCoverage figure={settings.muscleFigure} primary={summary.primary} secondary={summary.secondary} />
                    : <p className="hint">{t('hist.muscleMapEmpty')}</p>}
                  {summary.partial && <p className="hint">{t('hist.muscleMapPartial')}</p>}
                </section>
              </div>
            )}
            {!editing && <div className="hist-card-footer">
              {workout.entries.length > 0 && <button type="button" className="btn ghost" onClick={() => {
                setStatus('');
                setEditing(true);
              }}>{t('hist.editSets')}</button>}
              <button type="button" className="hist-delete-btn" onClick={handleDelete}>
                <Trash2 size={14} aria-hidden="true" /> {t('hist.deleteBtn')}
              </button>
            </div>}
          </div>
        )}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

/** Agrupa workouts por dateISO (já ordenados desc), retornando pares [data, workouts[]]. */
function groupByDate(workouts: WorkoutLog[]): Array<[string, WorkoutLog[]]> {
  const map = new Map<string, WorkoutLog[]>();
  for (const w of workouts) {
    const list = map.get(w.dateISO);
    if (list !== undefined) {
      list.push(w);
    } else {
      map.set(w.dateISO, [w]);
    }
  }
  // Map mantém ordem de inserção; workouts já vêm ordenados desc, então a ordem está correta
  return Array.from(map.entries());
}

export function Historico() {
  const t = useT();
  const [params] = useSearchParams();
  const requestedWorkout = params.get('treino');
  const [search, setSearch] = useState('');
  const [routineFilter, setRoutineFilter] = useState('');
  const today = toISO(new Date());
  const monday = startOfWeek(today, 1);
  const [period, setPeriod] = useState<HistoryPeriod>('all');
  const [startDate, setStartDate] = useState(monday);
  const [endDate, setEndDate] = useState(addDays(monday, 6));

  useEffect(() => {
    if (requestedWorkout) {
      setPeriod('all');
      setSearch('');
      setRoutineFilter('');
    }
  }, [requestedWorkout]);

  const from = period === 'thisWeek' ? monday
    : period === 'lastWeek' ? addDays(monday, -7)
      : period === 'custom' ? startDate : '';
  const to = period === 'thisWeek' ? addDays(monday, 6)
    : period === 'lastWeek' ? addDays(monday, -1)
      : period === 'custom' ? endDate : '';
  const invalidRange = period === 'custom' && (!from || !to || from > to);
  const savedSettings = useLiveQuery(() => db.settings.get('app'), []);
  const settings: HistorySettings = savedSettings ?? { unit: 'kg' };
  const locale = settings.lang === 'en' ? 'en-US' : 'pt-BR';
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }), [locale]);

  // Dados reativos via Dexie
  const workouts = useLiveQuery(
    () => db.workouts.orderBy('dateISO').reverse().toArray(),
    [],
  );
  const routines = useLiveQuery(() => db.routines.toArray(), []);
  const exercises = useLiveQuery(() => db.exercises.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);

  // Carregando
  const isLoading =
    workouts === undefined ||
    routines === undefined ||
    exercises === undefined ||
    categories === undefined;

  // Mapas de lookup (recalculam só quando os dados mudam)
  const routineMap = useMemo(() => {
    const m = new Map<string, Routine>();
    for (const r of routines ?? []) m.set(r.id, r);
    return m;
  }, [routines]);

  const exerciseMap = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of exercises ?? []) m.set(e.id, e);
    return m;
  }, [exercises]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);

  const filteredWorkouts = useMemo(() => {
    if (invalidRange) return [];
    const query = normalizeExName(search);
    return (workouts ?? []).filter((workout) => {
      if ((from && workout.dateISO < from) || (to && workout.dateISO > to)) return false;
      if (routineFilter && workout.routineId !== routineFilter) return false;
      if (!query) return true;
      const labels = [
        routineMap.get(workout.routineId ?? '')?.name, workout.routineName, workout.note,
        ...workout.entries.map((entry) => exerciseMap.get(entry.exerciseId)?.name),
      ];
      return labels.some((label) => label && normalizeExName(label).includes(query));
    }).sort((a, b) => compareWorkouts(b, a));
  }, [workouts, search, routineFilter, routineMap, exerciseMap, from, to, invalidRange]);

  const routineOptions = useMemo(() => {
    const names = new Map((routines ?? []).map(({ id, name }) => [id, name]));
    for (const workout of workouts ?? []) {
      if (workout.routineId && !names.has(workout.routineId) && workout.routineName) {
        names.set(workout.routineId, workout.routineName);
      }
    }
    return [...names.entries()].sort(([, first], [, second]) => first.localeCompare(second, locale));
  }, [routines, workouts, locale]);

  const groups = useMemo(() => groupByDate(filteredWorkouts), [filteredWorkouts]);

  async function handleDelete(id: string) {
    await deleteWorkout(id);
  }

  // ---- render ----

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <span className="mark">
            <CalendarDays size={20} strokeWidth={2.4} />
          </span>
          <h1>{t('hist.title')}</h1>
        </div>
      </div>

      <div className="history-layout">
        <section className="history-filters" aria-label={t('hist.filter')}>
          <div className="history-filter-period field">
            <label htmlFor="history-period">{t('hist.period')}</label>
            <select id="history-period" value={period} onChange={(event) => setPeriod(event.target.value as HistoryPeriod)}>
              <option value="all">{t('hist.allPeriods')}</option>
              <option value="thisWeek">{t('hist.currentWeek')}</option>
              <option value="lastWeek">{t('hist.previousWeek')}</option>
              <option value="custom">{t('hist.customPeriod')}</option>
            </select>
          </div>
          <div className="history-filter-routine field">
            <label htmlFor="history-routine">{t('hist.routine')}</label>
            <select id="history-routine" value={routineFilter} onChange={(event) => setRoutineFilter(event.target.value)}>
              <option value="">{t('hist.allRoutines')}</option>
              {routineOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          <div className="history-filter-search field">
            <label htmlFor="history-search">{t('hist.search')}</label>
            <div className="search-bar">
              <Search size={16} aria-hidden="true" />
              <input id="history-search" type="search" value={search}
                onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          {period === 'custom' && (
            <div className="history-date-range">
              <div className="field">
                <label htmlFor="history-start">{t('hist.startDate')}</label>
                <input type="date" id="history-start" required value={startDate}
                  aria-invalid={invalidRange} aria-describedby={invalidRange ? 'history-range-error' : undefined}
                  onChange={(event) => setStartDate(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="history-end">{t('hist.endDate')}</label>
                <input type="date" id="history-end" required value={endDate}
                  aria-invalid={invalidRange} aria-describedby={invalidRange ? 'history-range-error' : undefined}
                  onChange={(event) => setEndDate(event.target.value)} />
              </div>
            </div>
          )}
          {invalidRange && <p className="feedback error" id="history-range-error" role="alert">{t('hist.invalidRange')}</p>}
          <div className="history-filter-footer">
            {!isLoading && !invalidRange && (
              <p className="hint history-count" role="status">
                {from && to && <>{t('hist.dateRange', [
                  formatDate(from, locale, { dateStyle: 'short' }),
                  formatDate(to, locale, { dateStyle: 'short' }),
                ])} · </>}
                {t(filteredWorkouts.length === 1 ? 'hist.oneWorkout' : 'hist.manyWorkouts', [filteredWorkouts.length])}
              </p>
            )}
            {(search || routineFilter || period !== 'all') && (
              <button type="button" className="btn ghost history-clear" onClick={() => {
                setSearch('');
                setRoutineFilter('');
                setPeriod('all');
                document.getElementById('history-search')?.focus();
              }}><X size={15} aria-hidden="true" /> {t('hist.clearFilters')}</button>
            )}
          </div>
        </section>
        <section className="history-results" aria-label={t('hist.results')}>
        {isLoading ? (
          <p className="hint">{t('hist.loading')}</p>
        ) : invalidRange ? null : filteredWorkouts.length === 0 ? (
          <div className="empty">
            <CalendarDays size={42} strokeWidth={1.4} aria-hidden="true" />
            <p>{t(workouts.length === 0 ? 'hist.noWorkouts' : 'hist.noMatches')}</p>
          </div>
        ) : (
          groups.map(([dateISO, dayWorkouts]) => (
            <div key={dateISO}>
              <h2 className="hist-date-header"><time dateTime={dateISO}>{formatDate(dateISO, locale, {
                weekday: 'long', day: 'numeric', month: 'long',
                year: dateISO.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
              })}</time></h2>
              {dayWorkouts.map((workout) => {
                const routine =
                  workout.routineId !== undefined
                    ? routineMap.get(workout.routineId)
                    : undefined;
                const routineName = routine?.name ?? workout.routineName ?? workout.note ?? t('hist.freeWorkout');

                const category =
                  workout.categoryId !== undefined
                    ? categoryMap.get(workout.categoryId)
                    : routine?.categoryId !== undefined
                    ? categoryMap.get(routine.categoryId)
                    : undefined;
                const categoryColor = category?.color;

                return (
                  <WorkoutCard
                    key={workout.id}
                    workout={workout}
                    routineName={routineName}
                    categoryColor={categoryColor}
                    exerciseMap={exerciseMap}
                    settings={settings}
                    format={numberFormat}
                    onDelete={handleDelete}
                    requested={requestedWorkout === workout.id}
                  />
                );
              })}
            </div>
          ))
        )}
        </section>
      </div>
    </>
  );
}

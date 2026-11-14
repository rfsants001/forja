// Tela de histórico de treinos.
// Rota: /historico (wiring em App.tsx).
// Lista todos os workouts agrupados por data, com card expansível por treino.

import '../styles/historico.css';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarDays, ChevronDown, Clock, Dumbbell, Trash2, Check, X, Search } from 'lucide-react';
import type { WorkoutLog, WorkoutEntry, SetLog, TargetSnapshot, Exercise, Routine, Category } from '@forja/core';
import { compareWorkouts, readSession } from '@forja/core';
import { normalizeExName } from '../lib/normalize';
import { db } from '../db/db';
import { deleteWorkout, updateWorkoutEntries } from '../db/repo';

// ---------------------------------------------------------------------------
// Helpers de formatação
// ---------------------------------------------------------------------------

/** Formata dateISO (YYYY-MM-DD) em PT-BR. Ex.: "qua, 12 nov" */
function formatDatePT(dateISO: string): string {
  const [yearStr, monthStr, dayStr] = dateISO.split('-');
  const year = parseInt(yearStr ?? '2000', 10);
  const month = parseInt(monthStr ?? '1', 10) - 1;
  const day = parseInt(dayStr ?? '1', 10);
  // Usar UTC para evitar deslocamento de fuso (dateISO é só a data, sem hora)
  const d = new Date(Date.UTC(year, month, day));
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
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

function describeSet(set: SetLog): string {
  const parts = [
    set.reps === undefined ? undefined : `${set.reps} reps`,
    set.weightKg === undefined ? undefined : `${set.weightKg} kg`,
    set.sec === undefined ? undefined : `${set.sec} s`,
    set.distanceM === undefined ? undefined : `${set.distanceM} m`,
    set.speedKmh === undefined ? undefined : `${set.speedKmh} km/h`,
  ];
  return parts.filter((part) => part !== undefined).join(' · ') || '—';
}

function describeTarget(target: TargetSnapshot, index: number): string {
  if (target.unknown) return '';
  const mainSet = target.mainSets?.[index];
  if (mainSet !== undefined) return `Alvo: ${mainSet.reps}${mainSet.amrap ? '+' : ''} × ${mainSet.weightKg} kg`;
  const values = [
    target.reps === undefined ? undefined : `${target.reps} reps`,
    target.weightKg === undefined ? undefined : `${target.weightKg} kg`,
    target.sec === undefined ? undefined : `${target.sec} s`,
    target.distanceM === undefined ? undefined : `${target.distanceM} m`,
    target.speedKmh === undefined ? undefined : `${target.speedKmh} km/h`,
  ].filter((value) => value !== undefined);
  return values.length > 0 ? `Alvo: ${values.join(' · ')}` : '';
}

// ---------------------------------------------------------------------------
// Sub-componente: detalhe de um exercício
// ---------------------------------------------------------------------------

interface ExerciseDetailProps {
  entry: WorkoutEntry;
  exerciseName: string;
}

function ExerciseDetail({ entry, exerciseName }: ExerciseDetailProps) {
  const session = readSession(entry);
  const targetDesc = `${session.setsHit}/${session.setsTotal} séries`;
  const warmupOnly = !!entry.warmupSets?.length && !entry.sets.some((row) => row.done);

  return (
    <div className="hist-exercise">
      <div className="hist-exercise-header">
        <span className="hist-exercise-name">{exerciseName}</span>
        <span className={`hist-ex-badge ${entry.target.unknown || warmupOnly ? '' : session.hit ? 'hit' : 'miss'}`}>
          {warmupOnly ? 'Só aquecimento' : entry.target.unknown ? 'Alvo não importado' : session.hit ? 'Alvo atingido' : 'Abaixo do alvo'}
        </span>
        <span className="hist-ex-sets-info">{entry.target.unknown ? `${entry.sets.length} série(s)` : targetDesc}</span>
      </div>

      <div className="hist-sets-list">
        {entry.warmupSets?.map((set, index) => (
          <div key={`warmup-${index}`} className="hist-set-row">
            <span className="hist-set-idx">A{index + 1}</span>
            <span className="hist-set-done-icon ok">{set.done ? <Check size={13} aria-label="Concluída" /> : <X size={13} aria-label="Não concluída" />}</span>
            <span className="hist-set-value">{describeSet(set)}</span>
            <span className="hist-set-target">Aquecimento</span>
          </div>
        ))}
        {entry.sets.map((set, idx) => (
          <div key={idx} className="hist-set-row">
            <span className="hist-set-idx">{idx + 1}</span>
            <span className={`hist-set-done-icon ${set.done ? 'ok' : 'miss'}`} role="img" aria-label={set.done ? 'Série concluída' : 'Série não concluída'}>
              {set.done ? <Check size={13} /> : <X size={13} />}
            </span>
            <span className="hist-set-value">{describeSet(set)}</span>
            <span className="hist-set-target">{describeTarget(entry.target, idx)}</span>
            {set.note && <span className="hist-set-note">{set.note}</span>}
            {describeEffort(set) !== null && (
              <span className="hist-set-effort">{describeEffort(set)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: card de um workout
// ---------------------------------------------------------------------------

function EditWorkout({ workout, exerciseMap, onClose }: {
  workout: WorkoutLog; exerciseMap: Map<string, Exercise>; onClose: (saved?: boolean) => void;
}) {
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
      setError('Não foi possível salvar a correção. Confira os campos e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="hist-edit" onSubmit={(event) => void save(event)}>
      <h3>Corrigir séries</h3>
      <p className="hint">As metas originais permanecem no histórico. Corrija o que você realizou.</p>
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
                  <legend>{list === 'warmupSets' ? 'Aquecimento' : 'Série'} {setIndex + 1}</legend>
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
                    onChange={(event) => patch(entryIndex, setIndex, { done: event.target.checked }, list)} /> Concluída</label>
                </fieldset>
              );
            }))}
          </section>
        );
      })}
      {error && <p className="feedback error" role="alert">{error}</p>}
      <div className="btn-row">
        <button type="button" className="btn ghost" disabled={saving} onClick={() => onClose()}>Cancelar edição</button>
        <button type="submit" className="btn" disabled={saving}>{saving ? 'Salvando…' : 'Salvar séries'}</button>
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
}

function WorkoutCard({ workout, routineName, categoryColor, exerciseMap, onDelete, requested }: WorkoutCardProps) {
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

  // Calcula o resumo de hits por exercício
  const hitsCount = useMemo(
    () => workout.entries.filter((e) => readSession(e).hit).length,
    [workout.entries],
  );
  const totalExercises = workout.entries.length;
  const durationText = formatDuration(workout.durationSec);
  const evaluated = workout.entries.filter((entry) => !entry.target.unknown).length;
  const allHit = hitsCount === evaluated;

  function handleDelete() {
    const confirmado = window.confirm(`Excluir o treino "${routineName}"? Esta ação não pode ser desfeita.`);
    if (confirmado) onDelete(workout.id);
  }

  return (
    <div className="hist-card">
      {/* Cabeçalho clicável */}
      <button ref={headerRef} type="button" className="hist-card-header" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
        {categoryColor !== undefined && (
          <div
            className="hist-cat-dot"
            style={{ background: categoryColor }}
          />
        )}

        <div className="hist-card-info">
          <div className="hist-card-title">{routineName}</div>
          <div className="hist-card-meta">
            {durationText !== null && (
              <span className="hist-meta-chip">
                <Clock size={12} />
                {durationText}
              </span>
            )}
            {totalExercises > 0 && (
              <span className="hist-meta-chip">
                <Dumbbell size={12} />
                {totalExercises} exerc.
              </span>
            )}
            {evaluated > 0 && (
              <span className={`hist-hits-badge ${allHit ? '' : 'miss'}`}>
                {hitsCount}/{evaluated} alvos
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          size={18}
          className={`hist-chevron ${expanded ? 'open' : ''}`}
        />
      </button>

      {expanded && (
        <div className="hist-detail">
          <div className="hist-detail-inner">
            {editing ? <EditWorkout workout={workout} exerciseMap={exerciseMap} onClose={(saved) => {
              setEditing(false);
              if (saved) setStatus('Séries atualizadas. O progresso usa os valores corrigidos.');
            }} /> : null}
            {status && <p className="feedback" role="status">{status}</p>}
            {!editing && (workout.entries.length === 0 ? (
              <p className="hint">Nenhum exercício registrado neste treino.</p>
            ) : (
              workout.entries.map((entry) => {
                const ex = exerciseMap.get(entry.exerciseId);
                return (
                  <ExerciseDetail
                    key={entry.exerciseId}
                    entry={entry}
                    exerciseName={ex?.name ?? `Exercício ${entry.exerciseId}`}
                  />
                );
              })
            ))}

            {workout.prs?.length ? <p className="feedback">Recordes registrados: {workout.prs.length}</p> : null}

            {/* Rodapé com botão excluir */}
            {!editing && <div className="hist-card-footer">
              {totalExercises > 0 && <button className="btn ghost" onClick={() => {
                setStatus('');
                setEditing(true);
              }}>Corrigir séries</button>}
              <button className="hist-delete-btn" onClick={handleDelete}>
                <Trash2 size={14} />
                Excluir
              </button>
            </div>}
          </div>
        </div>
      )}
    </div>
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
  const [params] = useSearchParams();
  const requestedWorkout = params.get('treino');
  const [search, setSearch] = useState('');
  const [routineFilter, setRoutineFilter] = useState('');
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
    const query = normalizeExName(search);
    return (workouts ?? []).filter((workout) => {
      if (routineFilter && workout.routineId !== routineFilter) return false;
      if (!query) return true;
      const labels = [
        routineMap.get(workout.routineId ?? '')?.name, workout.routineName, workout.note,
        ...workout.entries.map((entry) => exerciseMap.get(entry.exerciseId)?.name),
      ];
      return labels.some((label) => label && normalizeExName(label).includes(query));
    }).sort((a, b) => compareWorkouts(b, a));
  }, [workouts, search, routineFilter, routineMap, exerciseMap]);

  const routineOptions = useMemo(() => {
    const names = new Map((routines ?? []).map(({ id, name }) => [id, name]));
    for (const workout of workouts ?? []) {
      if (workout.routineId && !names.has(workout.routineId) && workout.routineName) {
        names.set(workout.routineId, workout.routineName);
      }
    }
    return [...names.entries()].sort(([, first], [, second]) => first.localeCompare(second, 'pt-BR'));
  }, [routines, workouts]);

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
          <h1>Histórico</h1>
        </div>
      </div>

      <div className="history-layout">
        <section className="history-filters" aria-label="Filtrar histórico">
          <div className="history-filter-search field">
            <label htmlFor="history-search">Buscar por rotina ou exercício</label>
            <div className="search-bar">
              <Search size={16} aria-hidden="true" />
              <input id="history-search" type="search" value={search}
                onChange={(event) => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="history-filter-routine field">
            <label htmlFor="history-routine">Rotina</label>
            <select id="history-routine" value={routineFilter} onChange={(event) => setRoutineFilter(event.target.value)}>
              <option value="">Todas as rotinas</option>
              {routineOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </div>
          {(search || routineFilter) && (
            <button type="button" className="btn ghost history-clear" onClick={() => {
              setSearch('');
              setRoutineFilter('');
              document.getElementById('history-search')?.focus();
            }}><X size={15} aria-hidden="true" /> Limpar filtros</button>
          )}
          {!isLoading && <p className="hint history-count" role="status">{filteredWorkouts.length} {filteredWorkouts.length === 1 ? 'treino' : 'treinos'}</p>}
        </section>
        <section className="history-results" aria-label="Sessões registradas">
        {isLoading ? (
          <p className="hint" style={{ textAlign: 'center', marginTop: 32 }}>
            Carregando…
          </p>
        ) : filteredWorkouts.length === 0 ? (
          <div className="empty">
            <CalendarDays size={42} strokeWidth={1.4} style={{ opacity: 0.4 }} />
            <p style={{ marginTop: 12 }}>
              {workouts.length === 0 ? 'Nenhum treino registrado.' : 'Nenhum treino corresponde aos filtros.'}
            </p>
          </div>
        ) : (
          groups.map(([dateISO, dayWorkouts]) => (
            <div key={dateISO}>
              <h2 className="hist-date-header"><time dateTime={dateISO}>{formatDatePT(dateISO)}</time></h2>
              {dayWorkouts.map((workout) => {
                const routine =
                  workout.routineId !== undefined
                    ? routineMap.get(workout.routineId)
                    : undefined;
                const routineName = routine?.name ?? workout.routineName ?? workout.note ?? 'Treino livre';

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

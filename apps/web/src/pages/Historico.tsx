// Tela de histórico de treinos.
// Rota: /historico (wiring em App.tsx).
// Lista todos os workouts agrupados por data, com card expansível por treino.

import '../styles/historico.css';

import { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarDays, ChevronDown, Clock, Dumbbell, Trash2, Check, X } from 'lucide-react';
import type { WorkoutLog, WorkoutEntry, SetLog, TargetSnapshot, Exercise, Routine, Category } from '@forja/core';
import { readSession } from '@forja/core';
import { db } from '../db/db';
import { deleteWorkout } from '../db/repo';

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

function describeSet(set: SetLog, _target: TargetSnapshot): string {
  if (set.sec !== undefined) {
    return `${set.sec}s`;
  }
  if (set.reps !== undefined && set.weightKg !== undefined) {
    return `${set.reps} × ${set.weightKg} kg`;
  }
  if (set.reps !== undefined) {
    return `${set.reps} reps`;
  }
  return '—';
}

/** Descreve o alvo de uma série. */
function describeTarget(target: TargetSnapshot): string {
  if (target.sec !== undefined && target.reps === undefined) {
    return `alvo: ${target.sec}s`;
  }
  if (target.reps !== undefined && target.weightKg !== undefined) {
    return `alvo: ${target.reps} × ${target.weightKg} kg`;
  }
  if (target.reps !== undefined) {
    return `alvo: ${target.reps}`;
  }
  if (target.sec !== undefined) {
    return `alvo: ${target.sec}s`;
  }
  return '';
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

  return (
    <div className="hist-exercise">
      <div className="hist-exercise-header">
        <span className="hist-exercise-name">{exerciseName}</span>
        <span className={`hist-ex-badge ${session.hit ? 'hit' : 'miss'}`}>
          {session.hit ? 'bateu' : 'não bateu'}
        </span>
        <span className="hist-ex-sets-info">{targetDesc}</span>
      </div>

      <div className="hist-sets-list">
        {entry.sets.map((set, idx) => (
          <div key={idx} className="hist-set-row">
            <span className="hist-set-idx">{idx + 1}</span>
            <span className={`hist-set-done-icon ${set.done ? 'ok' : 'miss'}`}>
              {set.done ? <Check size={13} /> : <X size={13} />}
            </span>
            <span className="hist-set-value">{describeSet(set, entry.target)}</span>
            <span className="hist-set-target">{describeTarget(entry.target)}</span>
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

interface WorkoutCardProps {
  workout: WorkoutLog;
  routineName: string;
  categoryColor: string | undefined;
  exerciseMap: Map<string, Exercise>;
  onDelete: (id: string) => void;
}

function WorkoutCard({ workout, routineName, categoryColor, exerciseMap, onDelete }: WorkoutCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Calcula o resumo de hits por exercício
  const hitsCount = useMemo(
    () => workout.entries.filter((e) => readSession(e).hit).length,
    [workout.entries],
  );
  const totalExercises = workout.entries.length;
  const durationText = formatDuration(workout.durationSec);
  const allHit = hitsCount === totalExercises && totalExercises > 0;

  function handleDelete() {
    const confirmado = window.confirm(`Excluir o treino "${routineName}"? Esta ação não pode ser desfeita.`);
    if (confirmado) onDelete(workout.id);
  }

  return (
    <div className="hist-card">
      {/* Cabeçalho clicável */}
      <div className="hist-card-header" onClick={() => setExpanded((v) => !v)}>
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
            {totalExercises > 0 && (
              <span className={`hist-hits-badge ${allHit ? '' : 'miss'}`}>
                {hitsCount}/{totalExercises} bateram
              </span>
            )}
          </div>
        </div>

        <ChevronDown
          size={18}
          className={`hist-chevron ${expanded ? 'open' : ''}`}
        />
      </div>

      {/* Detalhe expansível */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="hist-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <div className="hist-detail-inner">
              {workout.entries.length === 0 ? (
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
              )}

              {/* Rodapé com botão excluir */}
              <div className="hist-card-footer">
                <button className="hist-delete-btn" onClick={handleDelete}>
                  <Trash2 size={14} />
                  Excluir
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

  // Agrupamento por data
  const groups = useMemo(
    () => (workouts !== undefined ? groupByDate(workouts) : []),
    [workouts],
  );

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

      {isLoading ? (
        <p className="hint" style={{ textAlign: 'center', marginTop: 32 }}>
          Carregando…
        </p>
      ) : workouts.length === 0 ? (
        <div className="empty">
          <CalendarDays size={42} strokeWidth={1.4} style={{ opacity: 0.4 }} />
          <p style={{ marginTop: 12 }}>
            Nenhum treino registrado. Bora inaugurar?
          </p>
        </div>
      ) : (
        groups.map(([dateISO, dayWorkouts]) => (
          <div key={dateISO}>
            <div className="hist-date-header">{formatDatePT(dateISO)}</div>
            {dayWorkouts.map((workout) => {
              const routine =
                workout.routineId !== undefined
                  ? routineMap.get(workout.routineId)
                  : undefined;
              const routineName = routine?.name ?? 'Treino livre';

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
                />
              );
            })}
          </div>
        ))
      )}
    </>
  );
}

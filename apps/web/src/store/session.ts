// Store do treino ATIVO — estado efêmero e device-local.
// Persiste em localStorage (middleware persist do Zustand) para sobreviver a
// reloads e crashes no meio do treino. Não é sincronizável com a API.
//
// Decisões de projeto:
// - finish() GRAVA no banco via repo.addWorkout e retorna o WorkoutLog.
//   Motivo: o store já tem todos os dados necessários; delegar ao caller exigiria
//   que ele lesse o estado recém-limpo, causando race condition. O import de repo
//   não cria ciclo (repo não importa session).
// - O tick do timer e o wake lock ficam nos componentes; o store só guarda endsAt.
// - O caller é responsável por calcular a prescrição (nextPrescription do @forja/core)
//   e passar os sets pré-preenchidos em start(). O store apenas persiste e muta.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { draftStorage, reportSessionRead, sessionReadFailed } from '../lib/session-storage';
import { db, uid } from '../db/db';
import { saveFinishedWorkout } from '../db/repo';
import type { ExerciseMode, PR, Prescription, SetLog, TargetSnapshot, WorkoutLog, WorkoutEntry } from '@forja/core';
export type { TargetSnapshot } from '@forja/core';

// ---------------------------------------------------------------------------
// Tipos do estado interno
// ---------------------------------------------------------------------------

/** Snapshot do alvo de um exercício no momento em que o treino começou. */
/** Um exercício ativo na sessão em andamento. */
export interface ActiveExercise {
  exerciseId: string;
  name?: string;
  mode?: ExerciseMode;
  restSec?: number;
  targetSecMax?: number;
  note?: string;
  supersetGroup?: number;
  prescription?: Prescription;
  /** Target que valia quando o treino foi iniciado (imutável durante a sessão). */
  target: TargetSnapshot;
  /**
   * Séries pré-preenchidas pelo caller (via nextPrescription do @forja/core).
   * O store muta os campos via logSet/toggleSetDone.
   */
  sets: SetLog[];
  warmupSets?: SetLog[];
}

/** Estado do timer de descanso. */
export interface RestState {
  /** Timestamp (ms) em que o descanso termina. null = sem descanso ativo. */
  endsAt: number | null;
}

/** Sessão de treino em andamento. */
export interface ActiveSession {
  /** ID gerado em start(), reutilizado como id do WorkoutLog em finish(). */
  id: string;
  dateISO: string;
  startedAt: number;
  routineId?: string;
  categoryId?: string;
  exercises: ActiveExercise[];
  /** Índice do exercício sendo exibido no momento. */
  currentIndex: number;
  rest: RestState;
  work?: { exerciseIndex: number; setIndex: number; startedAt: number };
  routineName?: string;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SessionState {
  active: ActiveSession | null;
  saving: boolean;

  /**
   * Inicia uma nova sessão. Se já houver uma ativa, ela é substituída.
   * O caller deve passar os exercícios com sets pré-preenchidos
   * (calculados via nextPrescription de @forja/core).
   */
  start: (session: Omit<ActiveSession, 'id' | 'startedAt' | 'currentIndex' | 'rest'>) => void;

  /**
   * Aplica um patch parcial em uma série de um exercício.
   * Não marca done automaticamente — use toggleSetDone para isso.
   */
  logSet: (exIndex: number, setIndex: number, patch: Partial<SetLog>) => void;

  /**
   * Alterna o estado done de uma série.
   * Não altera os outros campos (reps, weightKg, etc.).
   */
  toggleSetDone: (exIndex: number, setIndex: number) => void;

  addWarmup: (exIndex: number) => void;
  logWarmup: (exIndex: number, setIndex: number, patch: Partial<SetLog>) => void;
  removeWarmup: (exIndex: number, setIndex: number) => void;

  /** Move o cursor para o exercício de índice i. */
  goToExercise: (i: number) => void;

  /**
   * Inicia o timer de descanso por `seconds` segundos.
   * Seta rest.endsAt = Date.now() + seconds * 1000.
   * O componente é responsável pelo tick e pelo wake lock.
   */
  startRest: (seconds: number) => void;

  /** Para o timer de descanso (seta endsAt = null). */
  stopRest: () => void;
  startWork: (exerciseIndex: number, setIndex: number) => void;
  stopWork: () => void;

  /** Cancela a sessão sem gravar nada. */
  cancel: () => void;

  /**
   * Finaliza a sessão:
   * 1. Monta o WorkoutLog a partir do estado atual.
   * 2. Grava via repo.addWorkout (async — retorna Promise).
   * 3. Limpa o estado active.
   * @returns Promise<WorkoutLog> — o log gravado.
   */
  finish: (prs?: PR[]) => Promise<WorkoutLog>;
}

function updateWarmups(
  state: SessionState, exIndex: number, change: (sets: SetLog[]) => SetLog[],
): Partial<SessionState> {
  const { active, saving } = state;
  if (!active || saving) return state;
  const exercises = active.exercises.map((exercise, index) => index === exIndex
    ? { ...exercise, warmupSets: change(exercise.warmupSets ?? []) }
    : exercise);
  return { active: { ...active, exercises } };
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      active: null,
      saving: false,

      start(session) {
        set({
          active: {
            ...session,
            id: uid('wk_'),
            startedAt: Date.now(),
            currentIndex: 0,
            rest: { endsAt: null },
          },
        });
      },

      logSet(exIndex, setIndex, patch) {
        set((state) => {
          if (state.active === null || state.saving) return state;

          const exercises = state.active.exercises.map((ex, ei) => {
            if (ei !== exIndex) return ex;
            const sets = ex.sets.map((s, si) =>
              si === setIndex ? { ...s, ...patch } : s,
            );
            return { ...ex, sets };
          });

          return { active: { ...state.active, exercises } };
        });
      },

      toggleSetDone(exIndex, setIndex) {
        set((state) => {
          if (state.active === null || state.saving) return state;

          const exercises = state.active.exercises.map((ex, ei) => {
            if (ei !== exIndex) return ex;
            const sets = ex.sets.map((s, si) =>
              si === setIndex ? { ...s, done: !s.done } : s,
            );
            return { ...ex, sets };
          });

          return { active: { ...state.active, exercises } };
        });
      },

      addWarmup(exIndex) {
        set((state) => updateWarmups(state, exIndex, (sets) => [...sets, { done: false }]));
      },

      logWarmup(exIndex, setIndex, patch) {
        set((state) => updateWarmups(state, exIndex, (sets) =>
          sets.map((row, index) => index === setIndex ? { ...row, ...patch } : row)));
      },

      removeWarmup(exIndex, setIndex) {
        set((state) => updateWarmups(state, exIndex, (sets) =>
          sets.filter((_, index) => index !== setIndex)));
      },

      goToExercise(i) {
        set((state) => {
          if (state.active === null || state.saving) return state;
          return { active: { ...state.active, currentIndex: i } };
        });
      },

      startRest(seconds) {
        set((state) => {
          if (state.active === null) return state;
          return {
            active: {
              ...state.active,
              rest: { endsAt: Date.now() + seconds * 1000 },
            },
          };
        });
      },

      stopRest() {
        set((state) => {
          if (state.active === null) return state;
          return { active: { ...state.active, rest: { endsAt: null } } };
        });
      },

      startWork(exerciseIndex, setIndex) {
        const { active, saving } = get();
        if (active === null || active.work !== undefined || saving) return;
        set({ active: { ...active, rest: { endsAt: null }, work: { exerciseIndex, setIndex, startedAt: Date.now() } } });
      },

      stopWork() {
        const { active } = get();
        if (active === null) return;
        set({ active: { ...active, work: undefined } });
      },

      cancel() {
        if (!get().saving) set({ active: null });
      },

      async finish(prs) {
        const { active, saving } = get();
        if (saving) throw new Error('O treino já está sendo salvo.');
        if (active === null) {
          throw new Error('Nenhuma sessão ativa para finalizar.');
        }

        if (!active.exercises.some((exercise) => exercise.sets.some((row) => row.done))) {
          throw new Error('Registre pelo menos uma série de trabalho.');
        }

        const entries: WorkoutEntry[] = active.exercises.map((exercise) => {
          const warmupSets = exercise.warmupSets?.filter((row) => row.done);
          return {
            exerciseId: exercise.exerciseId,
            sets: exercise.sets,
            target: exercise.target,
            ...(warmupSets?.length ? { warmupSets } : {}),
          };
        });

        const durationSec = Math.round((Date.now() - active.startedAt) / 1000);

        const log: WorkoutLog = {
          id: active.id,
          dateISO: active.dateISO,
          routineId: active.routineId,
          routineName: active.routineName,
          categoryId: active.categoryId,
          entries,
          durationSec,
          createdAt: active.startedAt,
          prs: prs?.length ? prs : undefined,
        };

        set({ saving: true });
        try {
          await saveFinishedWorkout(log);
          if (get().active?.id === log.id) set({ active: null });
          return log;
        } finally {
          set({ saving: false });
        }
      },
    }),
    {
      storage: createJSONStorage(() => draftStorage),
      onRehydrateStorage: () => (_state, error) => { reportSessionRead(!!error); },
      name: 'forja-session', // chave no localStorage
      // Persiste apenas o estado active; ações são recriadas pelo create
      partialize: (state) => ({ active: state.active }),
    },
  ),
);

/** Retry the current in-memory draft after storage becomes available again. */
export async function retrySessionStorage() {
  if (sessionReadFailed() && !useSessionStore.getState().active) {
    await useSessionStore.persist.rehydrate();
    await reconcileCompletedSession();
    return;
  }
  draftStorage.setItem('forja-session', JSON.stringify({ state: { active: useSessionStore.getState().active }, version: 0 }));
}

/** A crash after the log commits must not resurrect its already-finished draft. */
export async function reconcileCompletedSession() {
  const active = useSessionStore.getState().active;
  if (active && await db.workouts.get(active.id) && useSessionStore.getState().active?.id === active.id) {
    useSessionStore.setState({ active: null });
  }
}

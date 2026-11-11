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
import { persist } from 'zustand/middleware';
import { uid } from '../db/db';
import { addWorkout } from '../db/repo';
import type { SetLog, WorkoutLog, WorkoutEntry } from '@forja/core';

// ---------------------------------------------------------------------------
// Tipos do estado interno
// ---------------------------------------------------------------------------

/** Snapshot do alvo de um exercício no momento em que o treino começou. */
export interface TargetSnapshot {
  sets: number;
  reps?: string;
  sec?: number;
  weightKg?: number;
}

/** Um exercício ativo na sessão em andamento. */
export interface ActiveExercise {
  exerciseId: string;
  /** Target que valia quando o treino foi iniciado (imutável durante a sessão). */
  target: TargetSnapshot;
  /**
   * Séries pré-preenchidas pelo caller (via nextPrescription do @forja/core).
   * O store muta os campos via logSet/toggleSetDone.
   */
  sets: SetLog[];
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
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface SessionState {
  active: ActiveSession | null;

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

  /** Cancela a sessão sem gravar nada. */
  cancel: () => void;

  /**
   * Finaliza a sessão:
   * 1. Monta o WorkoutLog a partir do estado atual.
   * 2. Grava via repo.addWorkout (async — retorna Promise).
   * 3. Limpa o estado active.
   * @returns Promise<WorkoutLog> — o log gravado.
   */
  finish: () => Promise<WorkoutLog>;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      active: null,

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
          if (state.active === null) return state;

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
          if (state.active === null) return state;

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

      goToExercise(i) {
        set((state) => {
          if (state.active === null) return state;
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

      cancel() {
        set({ active: null });
      },

      async finish() {
        const { active } = get();
        if (active === null) {
          throw new Error('Nenhuma sessão ativa para finalizar.');
        }

        // Monta as entries do WorkoutLog a partir dos exercícios ativos
        const entries: WorkoutEntry[] = active.exercises.map((ex) => ({
          exerciseId: ex.exerciseId,
          sets: ex.sets,
          target: ex.target,
        }));

        const durationSec = Math.round((Date.now() - active.startedAt) / 1000);

        const log: WorkoutLog = {
          id: active.id,
          dateISO: active.dateISO,
          routineId: active.routineId,
          categoryId: active.categoryId,
          entries,
          durationSec,
          createdAt: active.startedAt,
        };

        // Limpa o estado ANTES de gravar (evita dupla gravação se finish for chamado duas vezes)
        set({ active: null });

        await addWorkout(log);
        return log;
      },
    }),
    {
      name: 'forja-session', // chave no localStorage
      // Persiste apenas o estado active; ações são recriadas pelo create
      partialize: (state) => ({ active: state.active }),
    },
  ),
);

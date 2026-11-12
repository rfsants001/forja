// Cálculos puros de progresso/insights. Sem I/O, sem React.
// Recebe os dados já carregados e devolve métricas prontas pra exibir.

import type { WorkoutLog, Exercise, MuscleGroup, RoutineExercise } from '@forja/core';
import { estimate1RM } from '@forja/core';

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------

/** PR de um exercício: melhor 1RM estimado e melhor carga bruta. */
export interface ExercisePR {
  exerciseId: string;
  exerciseName: string;
  /** 1RM estimado (Epley) em kg, da melhor série registrada. */
  best1RM: number;
  /** Maior carga bruta (kg) usada em qualquer série. */
  bestWeightKg: number;
  /** Reps da série que gerou o melhor 1RM. */
  repsAtBest: number;
}

/** Resumo geral de um período. */
export interface PeriodSummary {
  /** Número de sessões (workouts) no período. */
  workoutCount: number;
  /** Número de datas distintas treinadas. */
  daysCount: number;
  /** Volume total: Σ (reps × carga) para séries done com reps+carga. */
  totalVolume: number;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Filtra workouts pelo período (em dias a partir de hoje). null = todos. */
function filterByPeriod(workouts: WorkoutLog[], days: number | null): WorkoutLog[] {
  if (days === null) return workouts;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffISO = cutoff.toISOString().slice(0, 10);
  return workouts.filter((w) => w.dateISO >= cutoffISO);
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Calcula o resumo geral de um período.
 * @param workouts Lista de workouts (já filtrada ou não — passa `days` para filtrar aqui).
 * @param days Número de dias a considerar. null = todos.
 */
export function computeSummary(workouts: WorkoutLog[], days: number | null): PeriodSummary {
  const filtered = filterByPeriod(workouts, days);

  const daysSet = new Set(filtered.map((w) => w.dateISO));

  let totalVolume = 0;
  for (const workout of filtered) {
    for (const entry of workout.entries) {
      for (const set of entry.sets) {
        if (set.done && set.reps !== undefined && set.weightKg !== undefined) {
          totalVolume += set.reps * set.weightKg;
        }
      }
    }
  }

  return {
    workoutCount: filtered.length,
    daysCount: daysSet.size,
    totalVolume,
  };
}

/**
 * Calcula os PRs por exercício.
 * Só considera exercícios com pelo menos uma série done com reps + carga.
 * Ordena por melhor 1RM descendente.
 *
 * @param workouts Lista de workouts.
 * @param exerciseMap Map id→Exercise para lookup de nomes.
 * @param days Número de dias a considerar. null = todos.
 */
export function computePRs(
  workouts: WorkoutLog[],
  exerciseMap: Map<string, Exercise>,
  days: number | null,
): ExercisePR[] {
  const filtered = filterByPeriod(workouts, days);

  // Acumula o melhor por exercício
  const best = new Map<string, { best1RM: number; bestWeightKg: number; repsAtBest: number }>();

  for (const workout of filtered) {
    for (const entry of workout.entries) {
      for (const set of entry.sets) {
        if (!set.done || set.reps === undefined || set.weightKg === undefined) continue;
        if (set.reps <= 0 || set.weightKg <= 0) continue;

        const rm = estimate1RM(set.weightKg, set.reps);
        const existing = best.get(entry.exerciseId);

        if (existing === undefined) {
          best.set(entry.exerciseId, {
            best1RM: rm,
            bestWeightKg: set.weightKg,
            repsAtBest: set.reps,
          });
        } else {
          // Atualiza 1RM se melhorou
          if (rm > existing.best1RM) {
            existing.best1RM = rm;
            existing.repsAtBest = set.reps;
          }
          // Atualiza carga bruta independentemente
          if (set.weightKg > existing.bestWeightKg) {
            existing.bestWeightKg = set.weightKg;
          }
        }
      }
    }
  }

  // Converte para array de PRs com nome
  const prs: ExercisePR[] = [];
  for (const [exerciseId, data] of best) {
    prs.push({
      exerciseId,
      exerciseName: exerciseMap.get(exerciseId)?.name ?? `Exercício ${exerciseId}`,
      best1RM: Math.round(data.best1RM * 10) / 10,
      bestWeightKg: data.bestWeightKg,
      repsAtBest: data.repsAtBest,
    });
  }

  // Ordena por 1RM descendente
  prs.sort((a, b) => b.best1RM - a.best1RM);

  return prs;
}

/**
 * Agrega volume (Σ reps×carga) por grupo muscular primário.
 * Retorna um Map MuscleGroup→volume; grupos sem dado não aparecem.
 *
 * @param workouts Lista de workouts.
 * @param exerciseMap Map id→Exercise para lookup de primaryMuscle.
 * @param days Número de dias a considerar. null = todos.
 */
export function computeVolumeByMuscle(
  workouts: WorkoutLog[],
  exerciseMap: Map<string, Exercise>,
  days: number | null,
): Map<MuscleGroup, number> {
  const filtered = filterByPeriod(workouts, days);
  const result = new Map<MuscleGroup, number>();

  for (const workout of filtered) {
    for (const entry of workout.entries) {
      const ex = exerciseMap.get(entry.exerciseId);
      if (ex === undefined) continue;

      const muscle = ex.primaryMuscle;

      for (const set of entry.sets) {
        if (!set.done || set.reps === undefined || set.weightKg === undefined) continue;
        const vol = set.reps * set.weightKg;
        result.set(muscle, (result.get(muscle) ?? 0) + vol);
      }
    }
  }

  return result;
}

/**
 * Extrai as datas ISO de todos os workouts num período.
 * Útil para o heatmap (pode ter duplicatas quando há >1 treino por dia).
 */
export function workoutDates(workouts: WorkoutLog[], days: number | null): string[] {
  return filterByPeriod(workouts, days).map((w) => w.dateISO);
}

/**
 * Calcula um mapa de volume sintético para preview da rotina no editor.
 * Não usa histórico — deriva de quais exercícios estão na rotina.
 *
 * Contribuição:
 *   - primaryMuscle do exercício  → peso 1.0
 *   - cada secondaryMuscle        → peso 0.5
 *
 * O resultado é normalizado para [0, 1] (máximo = 1.0).
 * Adequado para o modo `preview` do MuscleMap.
 *
 * @param exercises   Exercícios configurados na rotina (RoutineExercise[]).
 * @param exerciseMap Map id→Exercise para resolver primaryMuscle/secondaryMuscles.
 */
export function previewVolumeByMuscle(
  exercises: RoutineExercise[],
  exerciseMap: Map<string, Exercise>,
): Map<MuscleGroup, number> {
  const acc = new Map<MuscleGroup, number>();

  for (const re of exercises) {
    const ex = exerciseMap.get(re.exerciseId);
    if (ex === undefined) continue;

    acc.set(ex.primaryMuscle, (acc.get(ex.primaryMuscle) ?? 0) + 1.0);

    for (const sec of ex.secondaryMuscles) {
      acc.set(sec, (acc.get(sec) ?? 0) + 0.5);
    }
  }

  // Normaliza para [0, 1]
  let max = 0;
  for (const v of acc.values()) {
    if (v > max) max = v;
  }
  if (max === 0) return acc;

  const normalized = new Map<MuscleGroup, number>();
  for (const [muscle, v] of acc) {
    normalized.set(muscle, v / max);
  }
  return normalized;
}

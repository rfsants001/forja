// Cálculos puros de progresso/insights. Sem I/O, sem React.
// Recebe os dados já carregados e devolve métricas prontas pra exibir.

import type { WorkoutLog, Exercise, MuscleGroup, RoutineExercise } from '@forja/core';
import { estimate1RM } from '@forja/core';

// ---------------------------------------------------------------------------
// Escala comum de esforço
// ---------------------------------------------------------------------------
//
// Convenção: a escala comum é RPE 0–10, onde 10 = falha total.
//   • Se a série tem `rpe`: usa direto.
//   • Se a série tem `rir`: converte com RPE = 10 - RIR (RIR 0 = falha = RPE 10).
//   • Se ambos estiverem presentes, `rpe` tem precedência.
//   • Valores fora de [0, 10] são descartados (undefined).
//
// Exemplo:
//   RIR 2 → RPE 8 (2 reps na reserva, 80 % do esforço máximo)
//   RIR 0 → RPE 10 (falha)
//   RPE 9 → RPE 9 (passthrough)

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------

/** Resultado de uma semana de esforço. */
export interface EffortWeek {
  /** Semana no formato ISO (segunda-feira da semana, YYYY-MM-DD). */
  weekISO: string;
  /** Média de esforço (RPE 0–10) dos sets avaliados na semana. */
  avg: number;
  /** Número de sets com esforço registrado na semana. */
  setCount: number;
}

/** Ponto na curva de top-set de um exercício: data, 1RM estimado e esforço. */
export interface TopSetPoint {
  dateISO: string;
  topSet1RM: number;
  effort: number | undefined;
}

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

/**
 * Retorna o início da semana (segunda-feira) de uma data ISO como string YYYY-MM-DD.
 * weekStartsOn=1 (segunda) é o padrão do Forja.
 */
function isoWeekStart(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00`);
  const dow = d.getDay(); // 0=dom … 6=sáb
  // Dias para subtrair pra chegar na segunda (1). Dom(0)→-6, Seg(1)→0, …, Sáb(6)→-5
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

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

export function completedSetsByMuscle(
  workouts: WorkoutLog[],
  exerciseMap: Map<string, Exercise>,
  days: number | null,
): Map<MuscleGroup, number> {
  const groups = new Map<MuscleGroup, number>();
  for (const workout of filterByPeriod(workouts, days)) {
    for (const entry of workout.entries) {
      const completed = entry.sets.filter((set) => set.done).length;
      const exercise = exerciseMap.get(entry.exerciseId);
      if (exercise === undefined || completed === 0) continue;
      for (const muscle of new Set([exercise.primaryMuscle, ...exercise.secondaryMuscles])) {
        groups.set(muscle, (groups.get(muscle) ?? 0) + completed);
      }
    }
  }
  return groups;
}

/**
 * Extrai as datas ISO de todos os workouts num período.
 * Útil para o heatmap (pode ter duplicatas quando há >1 treino por dia).
 */
export function workoutDates(workouts: WorkoutLog[], days: number | null): string[] {
  return filterByPeriod(workouts, days).map((w) => w.dateISO);
}

// ---------------------------------------------------------------------------
// Esforço — funções públicas (G4 / P45-003)
// ---------------------------------------------------------------------------

/**
 * Normaliza um objeto `Effort` para a escala RPE 0–10.
 *
 * Convenção:
 *   - `rpe` presente: usa direto (tem precedência).
 *   - Só `rir`: RPE = 10 − RIR.
 *   - Valores fora de [0, 10]: descartados (undefined).
 *
 * @example
 *   toCommonEffort({ rir: 2 })       // 8
 *   toCommonEffort({ rpe: 9 })       // 9
 *   toCommonEffort({ rpe: 9, rir: 1 }) // 9 (rpe vence)
 *   toCommonEffort({})               // undefined
 */
export function toCommonEffort(
  effort: { rir?: number; rpe?: number } | undefined,
): number | undefined {
  if (effort === undefined) return undefined;

  let value: number | undefined;

  if (effort.rpe !== undefined) {
    value = effort.rpe;
  } else if (effort.rir !== undefined) {
    value = 10 - effort.rir;
  }

  if (value === undefined) return undefined;
  if (value < 0 || value > 10) return undefined;
  return value;
}

/**
 * Agrega esforço médio e contagem de sets avaliados por semana ISO.
 * Semanas sem nenhum set com esforço não aparecem no resultado.
 * Resultado ordenado por `weekISO` crescente.
 *
 * @param workouts Lista de workouts (todos; filtragem por período feita aqui se `days` passado).
 * @param days     Janela em dias. null = todos.
 */
export function effortByWeek(workouts: WorkoutLog[], days: number | null): EffortWeek[] {
  const filtered = filterByPeriod(workouts, days);

  // weekISO → { sum, count }
  const acc = new Map<string, { sum: number; count: number }>();

  for (const workout of filtered) {
    const week = isoWeekStart(workout.dateISO);
    for (const entry of workout.entries) {
      for (const set of entry.sets) {
        if (!set.done) continue;
        const e = toCommonEffort(set.effort);
        if (e === undefined) continue;
        const existing = acc.get(week);
        if (existing === undefined) {
          acc.set(week, { sum: e, count: 1 });
        } else {
          existing.sum += e;
          existing.count += 1;
        }
      }
    }
  }

  const result: EffortWeek[] = [];
  for (const [weekISO, { sum, count }] of acc) {
    result.push({
      weekISO,
      avg: Math.round((sum / count) * 10) / 10,
      setCount: count,
    });
  }

  result.sort((a, b) => (a.weekISO < b.weekISO ? -1 : 1));
  return result;
}

/**
 * Distribui os sets avaliados por nível de RPE (escala comum 0–10).
 * Retorna um histograma: `Record<nível_arredondado, contagem>`.
 * Apenas níveis com ao menos 1 set aparecem no resultado.
 *
 * @param workouts Lista de workouts.
 * @param days     Janela em dias. null = todos.
 */
export function effortSpread(
  workouts: WorkoutLog[],
  days: number | null,
): Record<number, number> {
  const filtered = filterByPeriod(workouts, days);
  const counts: Record<number, number> = {};

  for (const workout of filtered) {
    for (const entry of workout.entries) {
      for (const set of entry.sets) {
        if (!set.done) continue;
        const e = toCommonEffort(set.effort);
        if (e === undefined) continue;
        const level = Math.round(e);
        counts[level] = (counts[level] ?? 0) + 1;
      }
    }
  }

  return counts;
}

/**
 * Para um exercício específico, retorna por sessão o 1RM estimado do top-set
 * (série com maior 1RM) e o esforço normalizado daquela série.
 *
 * "Top-set" = série done com maior 1RM estimado (Epley) na sessão.
 * Se a sessão tiver múltiplos workouts no mesmo dia, considera todos.
 * Resultado ordenado por data crescente.
 *
 * @param workouts   Lista de workouts (todos — sem filtro de período para ver curva completa).
 * @param exerciseId ID do exercício.
 */
export function topSetEffortCurve(
  workouts: WorkoutLog[],
  exerciseId: string,
): TopSetPoint[] {
  // dateISO → melhor ponto da sessão
  const byDate = new Map<string, { topSet1RM: number; effort: number | undefined }>();

  for (const workout of workouts) {
    for (const entry of workout.entries) {
      if (entry.exerciseId !== exerciseId) continue;

      for (const set of entry.sets) {
        if (!set.done) continue;
        if (set.reps === undefined || set.weightKg === undefined) continue;
        if (set.reps <= 0 || set.weightKg <= 0) continue;

        const rm = estimate1RM(set.weightKg, set.reps);
        const existing = byDate.get(workout.dateISO);

        if (existing === undefined || rm > existing.topSet1RM) {
          byDate.set(workout.dateISO, {
            topSet1RM: Math.round(rm * 10) / 10,
            effort: toCommonEffort(set.effort),
          });
        }
      }
    }
  }

  const result: TopSetPoint[] = [];
  for (const [dateISO, { topSet1RM, effort }] of byDate) {
    result.push({ dateISO, topSet1RM, effort });
  }
  result.sort((a, b) => (a.dateISO < b.dateISO ? -1 : 1));
  return result;
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

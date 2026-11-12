// Detecção de recordes pessoais (PRs). Função pura — sem efeitos colaterais.
//
// Critérios:
//   - PR de CARGA (kind: 'weight'): maior weightKg em qualquer série done do exercício,
//     comparado ao maior weightKg já usado no histórico anterior.
//   - PR de 1RM estimado (kind: '1rm'): maior estimate1RM(weightKg, reps) calculado sobre
//     séries done com reps >= 1, weightKg > 0 e reps <= 12 (zona de validade da fórmula).
//     Comparado ao melhor 1RM de todo o histórico anterior.
//   - PR de REPS (kind: 'reps'): maior número de reps em uma única série done com
//     weightKg > 0 (não conta séries sem carga), comparado ao máximo histórico.
//
// Histórico: apenas workouts já finalizados passados por parâmetro — a sessão atual
// NÃO deve ser incluída (evita comparar série 2 com série 1 da mesma sessão).
//
// Retorna lista de PRs batidos (pode ser vazia; pode ter até 3 itens por exercício).

import type { WorkoutEntry, WorkoutLog, PR } from './types.js';
import { estimate1RM } from './onerm.js';

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/** Resumo de máximos históricos para um exercício. */
interface HistoricalBests {
  bestWeightKg: number;   // 0 se não há histórico
  best1RM: number;        // 0 se não há histórico elegível
  bestReps: number;       // 0 se não há histórico com carga
}

/**
 * Varre todas as entradas do histórico para o exercício dado e devolve os
 * melhores valores de carga, 1RM estimado e reps com carga.
 */
function computeHistoricalBests(
  history: WorkoutLog[],
  exerciseId: string,
): HistoricalBests {
  let bestWeightKg = 0;
  let best1RM = 0;
  let bestReps = 0;

  for (const workout of history) {
    for (const entry of workout.entries) {
      if (entry.exerciseId !== exerciseId) continue;
      for (const set of entry.sets) {
        if (!set.done) continue;

        // PR de carga bruta
        if (set.weightKg !== undefined && set.weightKg > bestWeightKg) {
          bestWeightKg = set.weightKg;
        }

        // PR de 1RM (apenas séries elegíveis: carga > 0 e 1 <= reps <= 12)
        if (
          set.weightKg !== undefined &&
          set.weightKg > 0 &&
          set.reps !== undefined &&
          set.reps >= 1 &&
          set.reps <= 12
        ) {
          const orm = estimate1RM(set.weightKg, set.reps);
          if (orm > best1RM) best1RM = orm;
        }

        // PR de reps (exige carga > 0 para diferenciar de exercícios de peso corporal)
        if (
          set.reps !== undefined &&
          set.weightKg !== undefined &&
          set.weightKg > 0 &&
          set.reps > bestReps
        ) {
          bestReps = set.reps;
        }
      }
    }
  }

  return { bestWeightKg, best1RM, bestReps };
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Detecta PRs batidos pela entrada atual comparando com o histórico anterior.
 *
 * @param entry   - Entrada do exercício na sessão que acabou de ser concluída.
 * @param history - Workouts ANTERIORES finalizados (NÃO inclui a sessão atual).
 * @returns Array de PRs batidos (vazio se nenhum PR foi superado).
 *
 * Regras de elegibilidade (NF-002 da spec):
 *   Só celebra PRs de carga/1RM se houver ao menos 1 workout anterior com o exercício.
 *   Primeira vez com o exercício → retorna lista vazia.
 */
export function detectPRs(entry: WorkoutEntry, history: WorkoutLog[]): PR[] {
  const { exerciseId, sets } = entry;

  // Verifica se há histórico anterior para este exercício
  const hasHistory = history.some((w) =>
    w.entries.some((e) => e.exerciseId === exerciseId),
  );
  if (!hasHistory) return [];

  const bests = computeHistoricalBests(history, exerciseId);
  const prs: PR[] = [];

  // Melhores valores da entrada atual
  let currentBestWeight = 0;
  let currentBest1RM = 0;
  let currentBestReps = 0;

  for (const set of sets) {
    if (!set.done) continue;

    // Carga bruta
    if (set.weightKg !== undefined && set.weightKg > currentBestWeight) {
      currentBestWeight = set.weightKg;
    }

    // 1RM estimado (zona elegível)
    if (
      set.weightKg !== undefined &&
      set.weightKg > 0 &&
      set.reps !== undefined &&
      set.reps >= 1 &&
      set.reps <= 12
    ) {
      const orm = estimate1RM(set.weightKg, set.reps);
      if (orm > currentBest1RM) currentBest1RM = orm;
    }

    // Reps com carga
    if (
      set.reps !== undefined &&
      set.weightKg !== undefined &&
      set.weightKg > 0 &&
      set.reps > currentBestReps
    ) {
      currentBestReps = set.reps;
    }
  }

  // Compara com o histórico e registra PRs batidos
  if (currentBestWeight > bests.bestWeightKg) {
    prs.push({ exerciseId, kind: 'weight', value: currentBestWeight });
  }

  if (currentBest1RM > bests.best1RM) {
    prs.push({ exerciseId, kind: '1rm', value: currentBest1RM });
  }

  if (currentBestReps > bests.bestReps) {
    prs.push({ exerciseId, kind: 'reps', value: currentBestReps });
  }

  return prs;
}

/**
 * Conveniência: detecta PRs para TODOS os exercícios de um array de entries
 * comparando com o histórico anterior.
 *
 * @param entries - Todas as entradas da sessão concluída.
 * @param history - Workouts anteriores finalizados (sem a sessão atual).
 * @returns Todos os PRs batidos na sessão.
 */
export function detectAllPRs(entries: WorkoutEntry[], history: WorkoutLog[]): PR[] {
  return entries.flatMap((entry) => detectPRs(entry, history));
}

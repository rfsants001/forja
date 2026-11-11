// Funções de leitura honesta do histórico de treinos. Puras e determinísticas — nenhuma
// dessas funções grava, lança erro de rede ou depende de relógio.
//
// Princípio herdado do openGym: o LOG é o que aconteceu; a prescrição é DERIVADA toda vez.
// Mesmo que a política mude depois, cada entrada já carrega o `target` que valia na hora,
// permitindo julgamento honesto retroativo.

import type { WorkoutLog, WorkoutEntry, SetLog, TargetSnapshot } from './types.js';

// ---------------------------------------------------------------------------
// Tipos de retorno
// ---------------------------------------------------------------------------

/** Resultado da leitura honesta de uma sessão de exercício. */
export interface SessionRead {
  /**
   * true quando todas as séries previstas foram executadas com reps >= alvo (modo reps/double)
   * ou sec >= alvo (modo time). Critérios:
   *   - sets feitos (done=true) >= target.sets
   *   - cada série feita com reps >= mínimo do alvo (ou sec >= target.sec para time)
   *   - série marcada como não feita (done=false) conta como miss
   * Um único miss ⇒ hit=false para a sessão inteira.
   */
  hit: boolean;
  /** Quantas séries bateram o alvo individualmente. */
  setsHit: number;
  /** Total de séries previstas no target. */
  setsTotal: number;
  /** Maior carga usada em qualquer série da sessão (kg). */
  topWeightKg?: number;
  /** Soma de todas as reps executadas (séries done). */
  totalReps?: number;
  /** Reps da última série (candidata a AMRAP no Greyskull). */
  lastSetReps?: number;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

/**
 * Extrai o número mínimo de reps de uma faixa textual.
 * Aceita: "8", "8–12", "8-12", "8—12".
 * Sem alvo definido devolve 1 (não bloqueia nada).
 */
function minRepsFromTarget(targetReps: string | undefined): number {
  if (!targetReps) return 1;
  // separa pelo primeiro separador de faixa (hífen, en-dash, em-dash)
  const parts = targetReps.split(/[–—-]/);
  const first = parts[0]?.trim();
  const parsed = first !== undefined ? parseInt(first, 10) : NaN;
  return Number.isNaN(parsed) ? 1 : parsed;
}

/**
 * Verifica se uma série individual bateu o alvo, dado o snapshot do target.
 * Para modo time (target.sec definido e target.reps ausente), compara sec.
 * Para modo reps, compara reps.
 */
function setHit(set: SetLog, target: TargetSnapshot): boolean {
  if (!set.done) return false;

  const isTimeMode = target.sec !== undefined && target.reps === undefined;

  if (isTimeMode) {
    return (set.sec ?? 0) >= (target.sec ?? 0);
  }

  const minReps = minRepsFromTarget(target.reps);
  return (set.reps ?? 0) >= minReps;
}

// ---------------------------------------------------------------------------
// API pública — history
// ---------------------------------------------------------------------------

/**
 * Retorna a entrada mais recente (por dateISO) de um dado exercício em todo o histórico.
 * Devolve undefined quando o exercício nunca foi logado.
 */
export function lastEntryFor(
  workouts: WorkoutLog[],
  exerciseId: string,
): WorkoutEntry | undefined {
  // Ordena decrescente por data e pega o primeiro match.
  const sorted = [...workouts].sort((a, b) => (a.dateISO > b.dateISO ? -1 : 1));

  for (const workout of sorted) {
    const entry = workout.entries.find((e) => e.exerciseId === exerciseId);
    if (entry !== undefined) return entry;
  }

  return undefined;
}

/**
 * Leitura honesta de uma sessão de exercício.
 *
 * Regra de hit: considera as primeiras `target.sets` séries marcadas como done.
 * Se a sessão tiver menos séries done que o prescrito, o restante conta como miss.
 * Todas essas séries devem bater o alvo (reps >= mínimo da faixa, ou sec >= alvo) para
 * que `hit` seja true. Uma série não feita (done=false) é sempre miss.
 */
export function readSession(entry: WorkoutEntry): SessionRead {
  const { sets: setLogs, target } = entry;
  const setsTotal = target.sets;

  // Separa séries feitas das não feitas.
  const doneSets = setLogs.filter((s) => s.done);

  // Para cálculo de hit precisamos julgar exatamente `setsTotal` séries.
  // Se sobraram menos séries done que o prescrito, as faltantes contam como miss.
  let setsHit = 0;
  for (let i = 0; i < setsTotal; i++) {
    const set = setLogs[i];
    if (set !== undefined && setHit(set, target)) {
      setsHit++;
    }
    // set undefined ou done=false → não incrementa setsHit
  }

  const hit = setsHit === setsTotal;

  // Estatísticas extras (modo reps).
  const doneSetsWithReps = doneSets.filter((s) => s.reps !== undefined);
  const totalReps =
    doneSetsWithReps.length > 0
      ? doneSetsWithReps.reduce((acc, s) => acc + (s.reps ?? 0), 0)
      : undefined;

  const doneSetsWithWeight = doneSets.filter((s) => s.weightKg !== undefined);
  const topWeightKg =
    doneSetsWithWeight.length > 0
      ? Math.max(...doneSetsWithWeight.map((s) => s.weightKg ?? 0))
      : undefined;

  // Reps da última série (útil para AMRAP do Greyskull).
  const lastDone = doneSets[doneSets.length - 1];
  const lastSetReps = lastDone?.reps;

  return { hit, setsHit, setsTotal, topWeightKg, totalReps, lastSetReps };
}

/**
 * Retorna as últimas N sessões de um exercício, ordenadas da mais antiga para a mais recente.
 * Útil para contar stalls consecutivos na progressão.
 */
export function lastNEntriesFor(
  workouts: WorkoutLog[],
  exerciseId: string,
  n: number,
): WorkoutEntry[] {
  const sorted = [...workouts].sort((a, b) => (a.dateISO > b.dateISO ? 1 : -1));

  const entries: WorkoutEntry[] = [];
  for (const workout of sorted) {
    const entry = workout.entries.find((e) => e.exerciseId === exerciseId);
    if (entry !== undefined) entries.push(entry);
  }

  // Retorna os últimos N (os mais recentes, mantendo ordem cronológica).
  return entries.slice(-n);
}

/**
 * Conta quantas sessões consecutivas mais recentes resultaram em miss para o exercício.
 * Ordem: da mais recente pra trás. Para no primeiro hit.
 * Usado pela progressão para detectar stalls e disparar deload.
 */
export function consecutiveMisses(
  workouts: WorkoutLog[],
  exerciseId: string,
): number {
  // Ordena da mais recente pra mais antiga.
  const sorted = [...workouts].sort((a, b) => (a.dateISO > b.dateISO ? -1 : 1));

  let count = 0;
  for (const workout of sorted) {
    const entry = workout.entries.find((e) => e.exerciseId === exerciseId);
    if (entry === undefined) continue; // sessão sem esse exercício, ignora

    const { hit } = readSession(entry);
    if (!hit) {
      count++;
    } else {
      break; // primeiro hit encontrado encerra a contagem
    }
  }

  return count;
}

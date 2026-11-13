// Motor de progressão de carga. Puro e determinístico: dado o histórico + config,
// devolve sempre a mesma prescrição. Nenhum contador é guardado — tudo derivado do log.
//
// Referência semântica: REFERENCE-opengym.md (políticas linear, greyskull, double, time).
// Princípio: o log é o que aconteceu; a próxima prescrição é DERIVADA toda vez.

import type { MainSet531, Prescription, ProgressionPolicy, RoutineExercise, WorkoutLog } from './types.js';
import { lastEntryFor, readSession, consecutiveMisses, lastNEntriesFor } from './history.js';
import { prescribe531, weekScheme } from './fivethreeone.js';

// ---------------------------------------------------------------------------
// Configuração de stalls
// ---------------------------------------------------------------------------

/** Número de misses consecutivos que dispara o deload (por política). */
const STALL_THRESHOLD: Record<ProgressionPolicy, number> = {
  off: Infinity,     // nunca faz deload
  linear: 3,
  greyskull: 1,      // greyskull: um miss já reseta
  double: 3,
  time: 3,
  '531': Infinity,   // 5/3/1 gerencia sua própria progressão — sem deload automático
};

/** Fator de deload (~10%). */
const DELOAD_FACTOR = 0.9;

// ---------------------------------------------------------------------------
// Helpers de faixa de reps
// ---------------------------------------------------------------------------

/**
 * Faixa de reps parseada a partir de uma string textual.
 * Aceita: "10", "8–12", "8-12", "8—12", "5 a 10".
 * Separadores suportados: hífen ASCII (-), en-dash (–), em-dash (—), " a ".
 */
export interface RepsRange {
  min: number;
  max: number;
}

/**
 * Faz o parse de uma faixa de reps textual.
 * - "10" → { min: 10, max: 10 }
 * - "8–12" → { min: 8, max: 12 }
 * - Falha silenciosa: devolve { min: 1, max: 1 } para evitar crash.
 */
export function parseRepsRange(targetReps: string): RepsRange {
  // Normaliza separadores para hífen simples.
  const normalized = targetReps.trim().replace(/[–—]|(\sa\s)/g, '-');
  const parts = normalized.split('-').map((p) => parseInt(p.trim(), 10));

  const first = parts[0];
  const second = parts[1];

  if (first === undefined || Number.isNaN(first)) {
    return { min: 1, max: 1 };
  }

  if (second === undefined || Number.isNaN(second)) {
    // Apenas um número: faixa unitária.
    return { min: first, max: first };
  }

  return { min: Math.min(first, second), max: Math.max(first, second) };
}

// ---------------------------------------------------------------------------
// Helpers de arredondamento de carga
// ---------------------------------------------------------------------------

/**
 * Arredonda o peso para o incremento mais próximo (evita casas decimais estranhas).
 * Exemplo: round para 2.5kg → 102.3 vira 102.5.
 */
function roundToIncrement(weightKg: number, incrementKg: number): number {
  if (incrementKg <= 0) return weightKg;
  return Math.round(weightKg / incrementKg) * incrementKg;
}

/**
 * Aplica deload (~10%) e arredonda pro incremento.
 */
function applyDeload(weightKg: number, incrementKg: number): number {
  const deloaded = weightKg * DELOAD_FACTOR;
  return roundToIncrement(deloaded, incrementKg);
}

// ---------------------------------------------------------------------------
// API pública — nextPrescription
// ---------------------------------------------------------------------------

/** Argumentos para derivar a próxima prescrição de um exercício. */
export interface NextPrescriptionArgs {
  /** Histórico completo de treinos do usuário. */
  workouts: WorkoutLog[];
  /** Configuração do exercício na rotina. */
  config: RoutineExercise;
  /**
   * Número de misses consecutivos para disparar deload.
   * Usa o default por política quando não informado.
   */
  stallThresholdOverride?: Partial<Record<ProgressionPolicy, number>>;
}

/**
 * Deriva a próxima prescrição (peso/reps/tempo) para um exercício dado o histórico.
 *
 * Nunca persiste nada — toda chamada recalcula do zero a partir dos logs.
 * O campo `why` sempre descreve a decisão em português para auditoria no app.
 */
export function nextPrescription({
  workouts,
  config,
  stallThresholdOverride,
}: NextPrescriptionArgs): Prescription {
  const policy: ProgressionPolicy = config.progression ?? 'off';
  const incrementKg = config.incrementKg ?? 2.5;

  const thresholds = { ...STALL_THRESHOLD, ...stallThresholdOverride };
  const stallLimit = thresholds[policy];

  // ---------------------------------------------------------------------------
  // Política 5/3/1 — tratada antes do guard de "sem histórico" porque funciona
  // com 0 sessões (semana 1 do ciclo). Tem sua própria lógica de "sem TM".
  // ---------------------------------------------------------------------------
  if (policy === '531') {
    return apply531Policy({ workouts, config });
  }

  const lastEntry = lastEntryFor(workouts, config.exerciseId);

  // Sem histórico: prescrição fresh (os campos ficam indefinidos — o app usa os defaults da rotina).
  if (lastEntry === undefined) {
    return {
      why: 'Nenhum histórico encontrado para este exercício. Primeira sessão.',
      kind: 'fresh',
    };
  }

  const session = readSession(lastEntry);
  const misses = consecutiveMisses(workouts, config.exerciseId);
  const lastWeight = lastEntry.target.weightKg;
  const lastSec = lastEntry.target.sec;

  // ---------------------------------------------------------------------------
  // Política OFF → repete o último target sem modificação.
  // ---------------------------------------------------------------------------
  if (policy === 'off') {
    return prescribePrefill(lastEntry.target.weightKg, lastEntry.target.reps, lastEntry.target.sec);
  }

  // ---------------------------------------------------------------------------
  // Política TIME → progride targetSec, sem carga.
  // ---------------------------------------------------------------------------
  if (policy === 'time') {
    return applyTimePolicy({
      lastSec,
      incrementSec: incrementKg, // reutiliza o campo incrementKg como incremento de segundos
      hit: session.hit,
      misses,
      stallLimit,
    });
  }

  // ---------------------------------------------------------------------------
  // Políticas de carga: linear, greyskull, double.
  // ---------------------------------------------------------------------------

  // Deload por stalls (vale para linear e double; greyskull tem lógica própria abaixo).
  if (policy !== 'greyskull' && misses >= stallLimit) {
    const base = lastWeight ?? 0;
    const newWeight = applyDeload(base, incrementKg);
    return {
      weightKg: newWeight,
      reps: lastEntry.target.reps !== undefined
        ? parseRepsRange(lastEntry.target.reps).min
        : undefined,
      why: `Falhou ${misses}x seguidas (limite: ${stallLimit}), deload de ~10%: ${base.toFixed(1)}kg → ${newWeight.toFixed(1)}kg.`,
      kind: policy,
    };
  }

  if (policy === 'linear') {
    return applyLinearPolicy({ lastEntry, session, incrementKg });
  }

  if (policy === 'greyskull') {
    return applyGreyskullPolicy({ lastEntry, session, incrementKg, misses, stallLimit });
  }

  if (policy === 'double') {
    return applyDoublePolicy({ lastEntry, session, incrementKg, config, misses, stallLimit });
  }

  // Fallback seguro (nunca deve chegar aqui com as políticas atuais).
  // Nota: '531' é tratado antes do guard de lastEntry, nunca chega aqui.
  return prescribePrefill(lastEntry.target.weightKg, lastEntry.target.reps, lastEntry.target.sec);
}

// ---------------------------------------------------------------------------
// Helpers de prescrição por política
// ---------------------------------------------------------------------------

/** Repete o último alvo sem modificação (política off ou fallback). */
function prescribePrefill(
  weightKg: number | undefined,
  reps: string | undefined,
  sec: number | undefined,
): Prescription {
  return {
    weightKg,
    reps: reps !== undefined ? parseRepsRange(reps).min : undefined,
    sec,
    why: 'Política "off": repete o último alvo sem alteração.',
    kind: 'prefill',
  };
}

// ---------------------------------------------------------------------------
// Linear LP
// ---------------------------------------------------------------------------

interface LinearArgs {
  lastEntry: import('./types.js').WorkoutEntry;
  session: import('./history.js').SessionRead;
  incrementKg: number;
}

/**
 * Progressão linear: bateu todas as séries no alvo ⇒ sobe o incremento.
 * Senão, mantém o peso atual. Deload por stalls é tratado antes desta função.
 */
function applyLinearPolicy({ lastEntry, session, incrementKg }: LinearArgs): Prescription {
  const base = lastEntry.target.weightKg ?? 0;
  const targetReps = lastEntry.target.reps;

  if (session.hit) {
    const newWeight = base + incrementKg;
    return {
      weightKg: newWeight,
      reps: targetReps !== undefined ? parseRepsRange(targetReps).min : undefined,
      why: `Bateu ${session.setsHit}/${session.setsTotal} no alvo, +${incrementKg}kg: ${base.toFixed(1)}kg → ${newWeight.toFixed(1)}kg.`,
      kind: 'linear',
    };
  }

  return {
    weightKg: base,
    reps: targetReps !== undefined ? parseRepsRange(targetReps).min : undefined,
    why: `Não bateu o alvo (${session.setsHit}/${session.setsTotal} séries), mantém ${base.toFixed(1)}kg.`,
    kind: 'linear',
  };
}

// ---------------------------------------------------------------------------
// Greyskull LP
// ---------------------------------------------------------------------------

interface GreyskullArgs {
  lastEntry: import('./types.js').WorkoutEntry;
  session: import('./history.js').SessionRead;
  incrementKg: number;
  misses: number;
  stallLimit: number;
}

/**
 * Greyskull LP: 2 sets fixos + 1 AMRAP (last set).
 * - Deload imediato (1 miss): reduz ~10% e volta pro mínimo de reps.
 * - Bateu com folga (dobrou reps no AMRAP): sobe o DOBRO do incremento.
 * - Bateu normalmente: sobe o incremento.
 */
function applyGreyskullPolicy({
  lastEntry,
  session,
  incrementKg,
  misses,
  stallLimit,
}: GreyskullArgs): Prescription {
  const base = lastEntry.target.weightKg ?? 0;
  const targetReps = lastEntry.target.reps;
  const minReps = targetReps !== undefined ? parseRepsRange(targetReps).min : 1;

  // Greyskull: 1 miss já dispara deload.
  if (misses >= stallLimit) {
    const newWeight = applyDeload(base, incrementKg);
    return {
      weightKg: newWeight,
      reps: minReps,
      why: `Greyskull: falhou a sessão anterior, deload de ~10%: ${base.toFixed(1)}kg → ${newWeight.toFixed(1)}kg.`,
      kind: 'greyskull',
    };
  }

  if (!session.hit) {
    // Mantém para a próxima leitura acumular o miss (o deload ocorre na próxima chamada).
    return {
      weightKg: base,
      reps: minReps,
      why: `Greyskull: não bateu o alvo (${session.setsHit}/${session.setsTotal}), mantém ${base.toFixed(1)}kg.`,
      kind: 'greyskull',
    };
  }

  // Verifica se a última série (AMRAP) foi "folgada" = dobrou as reps mínimas.
  const amrapReps = session.lastSetReps ?? 0;
  const folgada = amrapReps >= minReps * 2;

  if (folgada) {
    const newWeight = base + incrementKg * 2;
    return {
      weightKg: newWeight,
      reps: minReps,
      why: `Greyskull: AMRAP folgado (${amrapReps} reps ≥ ${minReps * 2}), sobe dobro do incremento: ${base.toFixed(1)}kg → ${newWeight.toFixed(1)}kg.`,
      kind: 'greyskull',
    };
  }

  const newWeight = base + incrementKg;
  return {
    weightKg: newWeight,
    reps: minReps,
    why: `Greyskull: bateu o alvo (AMRAP ${amrapReps} reps), +${incrementKg}kg: ${base.toFixed(1)}kg → ${newWeight.toFixed(1)}kg.`,
    kind: 'greyskull',
  };
}

// ---------------------------------------------------------------------------
// Double Progression
// ---------------------------------------------------------------------------

interface DoubleArgs {
  lastEntry: import('./types.js').WorkoutEntry;
  session: import('./history.js').SessionRead;
  incrementKg: number;
  config: RoutineExercise;
  misses: number;
  stallLimit: number;
}

/**
 * Dupla progressão: sobe reps até o topo da faixa em TODAS as séries, depois sobe carga
 * e volta para o mínimo da faixa. Deload por stalls tratado antes desta função.
 *
 * Lógica de reps prescritas:
 * - Se a última sessão bateu o topo da faixa em todos os sets → sobe carga, prescreve mínimo.
 * - Se bateu mas sem chegar ao topo → mantém carga, prescreve reps = lastTopReps+1 (sobe reps).
 * - Senão → mantém carga e reps atuais.
 */
function applyDoublePolicy({
  lastEntry,
  session,
  incrementKg,
  config,
}: DoubleArgs): Prescription {
  const base = lastEntry.target.weightKg ?? 0;
  const targetReps = config.targetReps ?? lastEntry.target.reps;
  const range = targetReps !== undefined ? parseRepsRange(targetReps) : { min: 1, max: 1 };

  // Reps prescritas na sessão anterior (alvo que o usuário tinha).
  const lastTargetReps = lastEntry.target.reps !== undefined
    ? parseRepsRange(lastEntry.target.reps).min
    : range.min;

  // Bateu o topo da faixa em TODAS as séries previstas?
  const hittingTop = (() => {
    const doneSets = lastEntry.sets.filter((s) => s.done);
    const relevantSets = doneSets.slice(0, lastEntry.target.sets);
    if (relevantSets.length < lastEntry.target.sets) return false;
    return relevantSets.every((s) => (s.reps ?? 0) >= range.max);
  })();

  if (hittingTop) {
    const newWeight = base + incrementKg;
    return {
      weightKg: newWeight,
      reps: range.min,
      why: `Dupla progressão: bateu o topo da faixa (${range.max} reps) em todas as séries, +${incrementKg}kg e volta ao mínimo (${range.min} reps): ${base.toFixed(1)}kg → ${newWeight.toFixed(1)}kg.`,
      kind: 'double',
    };
  }

  if (session.hit) {
    // Bateu o alvo mas ainda não chegou ao topo: sobe 1 rep no alvo.
    const nextReps = Math.min(lastTargetReps + 1, range.max);
    return {
      weightKg: base,
      reps: nextReps,
      why: `Dupla progressão: bateu ${session.setsHit}/${session.setsTotal} séries, sobe alvo de reps: ${lastTargetReps} → ${nextReps} (topo: ${range.max}).`,
      kind: 'double',
    };
  }

  return {
    weightKg: base,
    reps: lastTargetReps,
    why: `Dupla progressão: não bateu o alvo (${session.setsHit}/${session.setsTotal}), mantém ${base.toFixed(1)}kg com ${lastTargetReps} reps.`,
    kind: 'double',
  };
}

// ---------------------------------------------------------------------------
// Time / Cardio
// ---------------------------------------------------------------------------

interface TimeArgs {
  lastSec: number | undefined;
  incrementSec: number;
  hit: boolean;
  misses: number;
  stallLimit: number;
}

/**
 * Progressão por tempo: bateu o alvo de duração ⇒ sobe o incremento em segundos.
 * Stalls consecutivos ⇒ reduz ~10%.
 */
function applyTimePolicy({ lastSec, incrementSec, hit, misses, stallLimit }: TimeArgs): Prescription {
  const base = lastSec ?? 30;

  if (misses >= stallLimit) {
    const newSec = Math.round(base * DELOAD_FACTOR);
    return {
      sec: newSec,
      why: `Tempo: falhou ${misses}x seguidas (limite: ${stallLimit}), deload de ~10%: ${base}s → ${newSec}s.`,
      kind: 'time',
    };
  }

  if (hit) {
    const newSec = base + incrementSec;
    return {
      sec: newSec,
      why: `Tempo: bateu o alvo (${base}s), +${incrementSec}s: ${base}s → ${newSec}s.`,
      kind: 'time',
    };
  }

  return {
    sec: base,
    why: `Tempo: não bateu o alvo (${base}s), mantém.`,
    kind: 'time',
  };
}

// ---------------------------------------------------------------------------
// 5/3/1
// ---------------------------------------------------------------------------

interface Args531 {
  workouts: WorkoutLog[];
  config: RoutineExercise;
}

/**
 * Prescrição 5/3/1: deriva a semana do ciclo a partir do número de sessões já logadas
 * para este exercício.
 *
 * Mapeamento: sessões % 4 → semana
 *   0 (ou múltiplo de 4) → semana 1
 *   1                    → semana 2
 *   2                    → semana 3
 *   3                    → semana 4 (deload)
 *
 * O TM vem de `config.trainingMaxKg`. Sem TM definido, devolve 'fresh' com orientação.
 */
function apply531Policy({ workouts, config }: Args531): Prescription {
  const tmKg = config.trainingMaxKg;

  if (tmKg === undefined || tmKg <= 0) {
    return {
      why: '5/3/1: Training max não definido. Configure o TM no editor de rotina (ou derive do seu 1RM × 90%).',
      kind: 'fresh',
    };
  }

  // Conta quantas sessões deste exercício já foram logadas.
  // Usamos lastNEntriesFor com N grande para obter o total completo.
  const allSessions = lastNEntriesFor(workouts, config.exerciseId, 10_000);
  const sessionCount = allSessions.length;

  // Semana do ciclo: posição dentro do bloco de 4 sessões.
  const weekIndex = sessionCount % 4; // 0, 1, 2, 3
  const week = (weekIndex + 1) as 1 | 2 | 3 | 4;

  // Incremento de arredondamento (default 2.5 kg).
  const roundKg = config.incrementKg ?? 2.5;

  const sets = prescribe531(tmKg, week, roundKg);
  const scheme = weekScheme(week);

  // Monta mainSets com os dados completos (percentual + carga calculada).
  const mainSets: MainSet531[] = sets.map((s, i) => ({
    percentOfTM: scheme[i]?.percentOfTM ?? 0,
    weightKg: s.weightKg,
    reps: s.reps,
    amrap: s.amrap,
  }));

  // O peso prescrito para prefill da série (carga mais pesada = último set).
  const topSet = sets[sets.length - 1];
  const topWeight = topSet?.weightKg;

  const nomesSemana: Record<1 | 2 | 3 | 4, string> = {
    1: 'Semana 1 (5s)',
    2: 'Semana 2 (3s)',
    3: 'Semana 3 (5/3/1)',
    4: 'Semana 4 (deload)',
  };

  return {
    weightKg: topWeight,
    reps: topSet?.reps,
    why: `5/3/1 · TM ${tmKg}kg · ${nomesSemana[week]} · ${sessionCount} sessão(ões) logada(s).`,
    kind: '531',
    mainSets,
    cycleWeek: week,
    trainingMaxKg: tmKg,
  };
}

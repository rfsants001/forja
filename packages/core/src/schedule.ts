// Regra NF-003: dado uma data ISO, devolve a rotina efetiva considerando o plano
// semanal e os overrides por data. Função pura — sem I/O, sem relógio.

import type { WeekPlan, DayOverride, Weekday } from './types.js';
import { weekdayOf } from './date.js';

/**
 * Retorna a rotina efetiva para uma data ISO.
 *
 * Lógica de prioridade:
 * 1. Se existe um override para a data:
 *    - `'rest'`  → descanso explícito (retorna 'rest')
 *    - `null`    → "volta ao plano semanal" (cai no weekPlan)
 *    - string    → routineId do override (retorna o routineId)
 * 2. Sem override (ou override null): consulta weekPlan[weekday].
 *    - string    → routineId do plano
 *    - `null`    → sem treino planejado (retorna null)
 *
 * @returns routineId | 'rest' | null
 */
export function effectiveRoutine(
  dateISO: string,
  weekPlan: WeekPlan,
  overrides: DayOverride[],
): string | 'rest' | null {
  // Busca override exato para a data
  const override = overrides.find((o) => o.dateISO === dateISO);

  if (override !== undefined) {
    // 'rest' explícito → descanso
    if (override.routine === 'rest') return 'rest';
    // null → ignora o override e cai no plano semanal
    if (override.routine !== null) return override.routine;
    // override.routine === null → continua para o weekPlan abaixo
  }

  // Consulta o plano semanal pelo dia da semana
  const weekday = weekdayOf(dateISO) as Weekday;
  const planned = weekPlan[weekday];
  return planned ?? null;
}

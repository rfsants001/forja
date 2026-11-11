// Streak estilo Duolingo: dias consecutivos com pelo menos um treino. Puro e derivado do
// histórico — nunca um contador salvo (herança do openGym).
import type { Streak } from './types.js';
import { addDays, daysBetween, toISO } from './date.js';

/** Normaliza datas ISO em um conjunto único e ordenado (asc). */
function uniqueSortedDates(datesISO: string[]): string[] {
  return Array.from(new Set(datesISO)).sort();
}

/**
 * Calcula a streak a partir das datas (ISO) em que houve treino.
 * - `current`: dias consecutivos terminando hoje ou ontem (se treinou ontem mas não hoje,
 *   a streak ainda está viva — você tem o dia de hoje pra manter).
 * - `longest`: maior sequência já atingida.
 * - `alive`: treinou hoje ou ontem.
 */
export function computeStreak(datesISO: string[], today: string = toISO(new Date())): Streak {
  const days = uniqueSortedDates(datesISO);
  if (days.length === 0) {
    return { current: 0, longest: 0, lastTrainedISO: null, alive: false };
  }

  // Maior sequência consecutiva em todo o histórico.
  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = daysBetween(days[i - 1]!, days[i]!);
    run = gap === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const last = days[days.length - 1]!;
  const sinceLast = daysBetween(last, today);
  const alive = sinceLast === 0 || sinceLast === 1;

  // Streak atual: conta pra trás a partir do último dia treinado, enquanto consecutivo.
  let current = 0;
  if (alive) {
    current = 1;
    for (let i = days.length - 2; i >= 0; i--) {
      if (daysBetween(days[i]!, days[i + 1]!) === 1) current++;
      else break;
    }
  }

  return { current, longest, lastTrainedISO: last, alive };
}

/** Dias da semana treinados (array de 7 bool) para a semana que contém `ref`. */
export function weekActivity(
  datesISO: string[],
  weekStartISO: string,
): boolean[] {
  const set = new Set(datesISO);
  return Array.from({ length: 7 }, (_, i) => set.has(addDays(weekStartISO, i)));
}

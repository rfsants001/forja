// 1RM estimado (one-rep max). Fórmulas clássicas; puras. Usado nos insights (Fase 5).

export type OneRmFormula = 'epley' | 'brzycki';

/** Estima o 1RM a partir de carga × reps. Reps=1 devolve a própria carga. */
export function estimate1RM(
  weightKg: number,
  reps: number,
  formula: OneRmFormula = 'epley',
): number {
  if (reps <= 1) return weightKg;
  if (formula === 'brzycki') {
    return weightKg * (36 / (37 - reps));
  }
  // Epley
  return weightKg * (1 + reps / 30);
}

/** Arredonda pra 1 casa (apresentação). */
export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

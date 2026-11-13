// Implementação do esquema de periodização 5/3/1 (Wendler).
// Puro e determinístico: dado o TM e a semana do ciclo, devolve as séries principais.
// Referência: "5/3/1: The Simplest and Most Effective Training System for Raw Strength"

/** Um set principal do esquema 5/3/1, expresso em termos do TM. */
export interface MainSet {
  /** Percentual do TM (ex.: 85 significa 85%). */
  percentOfTM: number;
  /** Reps-alvo (mínimas no set AMRAP). */
  reps: number;
  /** Último set de cada semana é AMRAP (as many reps as possible). */
  amrap: boolean;
}

// ---------------------------------------------------------------------------
// Esquema semanal (percentual × reps)
// ---------------------------------------------------------------------------

/**
 * Retorna os 3 sets principais do ciclo 5/3/1 para a semana indicada.
 *
 * Semana 1 (5s):       65×5, 75×5, 85×5+
 * Semana 2 (3s):       70×3, 80×3, 90×3+
 * Semana 3 (5/3/1):    75×5, 85×3, 95×1+
 * Semana 4 (deload):   40×5, 50×5, 60×5  (sem AMRAP)
 */
export function weekScheme(week: 1 | 2 | 3 | 4): MainSet[] {
  switch (week) {
    case 1:
      return [
        { percentOfTM: 65, reps: 5, amrap: false },
        { percentOfTM: 75, reps: 5, amrap: false },
        { percentOfTM: 85, reps: 5, amrap: true },
      ];
    case 2:
      return [
        { percentOfTM: 70, reps: 3, amrap: false },
        { percentOfTM: 80, reps: 3, amrap: false },
        { percentOfTM: 90, reps: 3, amrap: true },
      ];
    case 3:
      return [
        { percentOfTM: 75, reps: 5, amrap: false },
        { percentOfTM: 85, reps: 3, amrap: false },
        { percentOfTM: 95, reps: 1, amrap: true },
      ];
    case 4:
      // Semana de deload: cargas mais leves, sem AMRAP.
      return [
        { percentOfTM: 40, reps: 5, amrap: false },
        { percentOfTM: 50, reps: 5, amrap: false },
        { percentOfTM: 60, reps: 5, amrap: false },
      ];
  }
}

// ---------------------------------------------------------------------------
// Prescrição com cargas calculadas
// ---------------------------------------------------------------------------

/**
 * Calcula as cargas dos 3 sets principais para o TM e a semana informados.
 *
 * @param tmKg    - Training max em kg.
 * @param week    - Semana do ciclo (1–4).
 * @param roundKg - Incremento de arredondamento (padrão 2.5 kg).
 * @returns Array de 3 objetos `{ weightKg, reps, amrap }`.
 */
export function prescribe531(
  tmKg: number,
  week: 1 | 2 | 3 | 4,
  roundKg = 2.5,
): { weightKg: number; reps: number; amrap: boolean }[] {
  const scheme = weekScheme(week);
  return scheme.map(({ percentOfTM, reps, amrap }) => {
    const raw = tmKg * (percentOfTM / 100);
    // Arredonda pro múltiplo mais próximo de roundKg (evita casas decimais estranhas).
    const weightKg = roundKg > 0
      ? Math.round(raw / roundKg) * roundKg
      : raw;
    return { weightKg, reps, amrap };
  });
}

// ---------------------------------------------------------------------------
// Progressão do TM após um ciclo
// ---------------------------------------------------------------------------

/**
 * Incrementa o training max após completar um ciclo de 4 semanas.
 *
 * Regra Wendler:
 * - Upper body (supino, desenvolvimento): +2.5 kg
 * - Lower body (agachamento, levantamento): +5 kg
 *
 * @param tmKg    - Training max atual em kg.
 * @param isUpper - true para membros superiores, false para inferiores.
 * @returns Novo training max.
 */
export function nextTrainingMax(tmKg: number, isUpper: boolean): number {
  return tmKg + (isUpper ? 2.5 : 5);
}

// Calculadora de anilhas — utilitário puro (G15).
// Dado peso-alvo, barra e anilhas disponíveis, calcula quais anilhas colocar por lado.
// Algoritmo greedy das maiores anilhas.

/** Anilhas padrão disponíveis (kg), da maior para a menor. */
export const DEFAULT_BAR_KG = 20;
export const DEFAULT_PLATES_KG: number[] = [25, 20, 15, 10, 5, 2.5, 1.25];

export interface PlateResult {
  /** Lista de anilhas por lado (da maior para a menor), em kg. */
  perSide: number[];
  /** Peso total realmente montável (barra + 2× a soma das anilhas por lado). */
  achievableKg: number;
  /** Diferença entre o alvo e o peso montável (0 quando exato). */
  leftover: number;
}

/**
 * Calcula as anilhas por lado para atingir `targetKg`.
 *
 * - Se `targetKg` <= `barKg`, devolve perSide vazio e achievableKg = barKg.
 * - Greedy: tenta encaixar as anilhas da maior para a menor (anilhas disponíveis
 *   no array `available` são repetíveis — representa o estoque do usuário).
 * - `available` deve vir em ordem decrescente ou será ordenado internamente.
 * - `leftover` >= 0 sempre: é o quanto falta montar o alvo com as anilhas disponíveis.
 */
export function computePlates(
  targetKg: number,
  barKg: number,
  available: number[],
): PlateResult {
  // Alvo menor ou igual à barra → só a barra já cobre
  if (targetKg <= barKg) {
    return { perSide: [], achievableKg: barKg, leftover: Math.max(0, barKg - targetKg) };
  }

  // Peso a distribuir pelos dois lados
  const neededPerSide = (targetKg - barKg) / 2;

  // Ordena anilhas da maior para a menor
  const plates = [...available].sort((a, b) => b - a);

  const perSide: number[] = [];
  let remaining = neededPerSide;

  for (const plate of plates) {
    // Acrescenta quantas unidades desta anilha couberem
    while (remaining >= plate - 1e-9) {
      perSide.push(plate);
      remaining -= plate;
    }
  }

  const loadedPerSide = perSide.reduce((s, p) => s + p, 0);
  const achievableKg = barKg + loadedPerSide * 2;
  // Arredonda a 2 casas para evitar ruído de ponto flutuante
  const leftover = Math.max(0, Math.round((targetKg - achievableKg) * 100) / 100);

  return { perSide, achievableKg, leftover };
}

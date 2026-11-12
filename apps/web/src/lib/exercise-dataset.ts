// Carregamento lazy do dataset público de exercícios.
//
// Dataset: hasaneyldrm/exercises-dataset
// Commit pinado: 7455efae41b330c265e7cd4b78dfa848e7ce5ebd
// CDN: jsDelivr (https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@<commit>/)
// Atribuição: © Gym visual (gymvisual.com)
//
// O JSON NÃO é importado estaticamente para não inflar o bundle principal.
// A primeira chamada dispara o import dinâmico; chamadas subsequentes retornam o cache.

import type { Exercise } from '@forja/core';

// Versão do dataset — bump aqui quando o commit mudar para forçar re-seed.
export const DATASET_VERSION = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd';

let _cached: Exercise[] | null = null;

/**
 * Carrega (lazy) o dataset completo de exercícios.
 * Retorna array vazio se o import falhar (offline ou bundle ausente).
 */
export async function loadExerciseDataset(): Promise<Exercise[]> {
  if (_cached !== null) return _cached;

  try {
    const mod = await import('../data/exercises.generated.json');
    // Vite entrega o default export para JSON imports
    const raw = mod.default as Exercise[];
    _cached = raw;
    return _cached;
  } catch (err) {
    console.warn('[exercise-dataset] Falha ao carregar dataset:', err);
    return [];
  }
}

/** Limpa o cache em memória (usado em testes). */
export function _clearExerciseDatasetCache(): void {
  _cached = null;
}

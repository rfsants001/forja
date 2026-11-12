// Seed do primeiro uso. Fase 0: cria as 3 categorias base + settings + biblioteca de exercícios.
// Fase 3.5: popula o dataset público (1.324 exercícios) se ainda não estiver presente.
import { db } from './db';
import { DEFAULT_SETTINGS } from '@forja/core';
import type { Category } from '@forja/core';
import { SEED_EXERCISES } from './seed-exercises';
import { loadExerciseDataset, DATASET_VERSION } from '../lib/exercise-dataset';

const SEED_CATEGORIES: Omit<Category, 'createdAt' | 'updatedAt'>[] = [
  { id: 'cal', name: 'Calistenia', slug: 'calistenia', color: '#e8a838', icon: 'activity', order: 0 },
  { id: 'gym', name: 'Musculação', slug: 'musculacao', color: '#4a9fd4', icon: 'dumbbell', order: 1 },
  { id: 'box', name: 'Boxe', slug: 'boxe', color: '#a768d8', icon: 'swords', order: 2 },
];

/** Chave usada em Settings para registrar a versão do dataset já inserido. */
const DATASET_VERSION_KEY = 'datasetVersion';

/** Roda uma vez (idempotente): só semeia se o banco estiver vazio. */
export async function ensureSeed(): Promise<void> {
  // ── Categorias ─────────────────────────────────────────────────────────────
  const catCount = await db.categories.count();
  if (catCount === 0) {
    const now = Date.now();
    await db.categories.bulkAdd(
      SEED_CATEGORIES.map((c) => ({ ...c, createdAt: now, updatedAt: now })),
    );
  }

  // ── Exercícios curados (seed original de 36) ──────────────────────────────
  // Mantidos independentemente do dataset — IDs sem prefixo 'ds-'.
  const exCount = await db.exercises.count();
  if (exCount === 0) {
    const now = Date.now();
    await db.exercises.bulkAdd(
      SEED_EXERCISES.map((ex) => ({ ...ex, createdAt: now, updatedAt: now })),
    );
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  const s = await db.settings.get('app');
  if (!s) {
    await db.settings.put({ id: 'app', ...DEFAULT_SETTINGS });
  }

  // ── Dataset público (1.324 exercícios, lazy, em background) ───────────────
  // Verifica se já foi inserido na versão atual para evitar re-seed.
  // Usa a tabela settings para persistir a versão do dataset inserido.
  const versionEntry = await db.settings.get(DATASET_VERSION_KEY as 'app');
  const versaoAtual = (versionEntry as unknown as { version?: string } | undefined)?.version;

  if (versaoAtual !== DATASET_VERSION) {
    // Deferred: não bloqueia a UI — executa em background após o app estar visível.
    const semearDataset = async () => {
      try {
        const exercicios = await loadExerciseDataset();
        if (exercicios.length === 0) return; // import falhou (offline) — tentar novamente na próxima abertura

        const now = Date.now();
        // bulkPut é idempotente: sobrescreve se o id já existir (exercícios com prefixo 'ds-')
        await db.exercises.bulkPut(
          exercicios.map((ex) => ({ ...ex, createdAt: now, updatedAt: now })),
        );

        // Registra a versão do dataset inserido
        await db.settings.put({
          id: DATASET_VERSION_KEY as 'app',
          ...DEFAULT_SETTINGS, // necessário para satisfazer o schema da tabela
          // @ts-expect-error — campo extra para versionamento do dataset
          version: DATASET_VERSION,
        });

        console.info(`[seed] Dataset inserido: ${exercicios.length} exercícios (${DATASET_VERSION.slice(0, 7)})`);
      } catch (err) {
        // Fallback silencioso: app continua com os 36 exercícios curados
        console.warn('[seed] Falha ao inserir dataset, usando seed curado:', err);
      }
    };

    // Aguarda o app estar idle antes de semear para não bloquear a UI
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => { void semearDataset(); }, { timeout: 5000 });
    } else {
      // Fallback para ambientes sem requestIdleCallback (SSR, testes)
      setTimeout(() => { void semearDataset(); }, 500);
    }
  }
}

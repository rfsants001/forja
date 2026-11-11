// Seed do primeiro uso. Fase 0: cria as 3 categorias base + settings + biblioteca de exercícios.
// Fase 1 vai expandir carregando seeds/treino-rafa.json (rotinas + exercícios do Rafael).
import { db } from './db';
import { DEFAULT_SETTINGS } from '@forja/core';
import type { Category } from '@forja/core';
import { SEED_EXERCISES } from './seed-exercises';

const SEED_CATEGORIES: Omit<Category, 'createdAt' | 'updatedAt'>[] = [
  { id: 'cal', name: 'Calistenia', slug: 'calistenia', color: '#e8a838', icon: 'activity', order: 0 },
  { id: 'gym', name: 'Musculação', slug: 'musculacao', color: '#4a9fd4', icon: 'dumbbell', order: 1 },
  { id: 'box', name: 'Boxe', slug: 'boxe', color: '#a768d8', icon: 'swords', order: 2 },
];

/** Roda uma vez (idempotente): só semeia se o banco estiver vazio. */
export async function ensureSeed(): Promise<void> {
  const catCount = await db.categories.count();
  if (catCount === 0) {
    const now = Date.now();
    await db.categories.bulkAdd(
      SEED_CATEGORIES.map((c) => ({ ...c, createdAt: now, updatedAt: now })),
    );
  }
  const exCount = await db.exercises.count();
  if (exCount === 0) {
    const now = Date.now();
    await db.exercises.bulkAdd(
      SEED_EXERCISES.map((ex) => ({ ...ex, createdAt: now, updatedAt: now })),
    );
  }
  const s = await db.settings.get('app');
  if (!s) {
    await db.settings.put({ id: 'app', ...DEFAULT_SETTINGS });
  }
}

import { db } from '../db/db';
import { upsertExercise, upsertRoutine } from '../db/repo';
import { syncWrite } from '../db/sync-write';
import { equipmentItems, exerciseRequirements, hasDumbbellPair, inventoryKeys, supportsEquipment } from './equipment';
import { SyncError } from './sync-client';
import { homeMovements, pairedDumbbellExercises } from './home-exercises';
import { cardioExercises } from './coach-cardio';

export type PlanGoal = 'strength' | 'muscle' | 'general' | 'weight-loss';
export type PlanFocus = 'full' | 'upper' | 'lower';
export type PlanVenue = 'home' | 'gym';
export type TrainingLevel = 'beginner' | 'intermediate' | 'advanced';
export const trainingLevelCounts: Record<TrainingLevel, number> = { beginner: 4, intermediate: 6, advanced: 8 };

export interface PlanExercise {
  exerciseId: string;
  sets: number;
  reps: number;
  restSec: number;
}
export interface CoachPlanResult {
  name: string;
  summary: string;
  estimatedMinutes?: number;
  exercises: PlanExercise[];
  cardio?: { exerciseId: string; seconds: number };
  week?: {
    role: string;
    variant: number;
    variation: 'initial' | 'exercises' | 'prescription';
    changedExercises: number;
  };
}

// Pure catalog selection is also exercised by the home-coach regression tests.
export { eligiblePlanExercises, planCandidates } from './coach-catalog';

export async function saveCoachPlan(plan: CoachPlanResult, categoryId: string, useInventory: boolean, note?: string) {
  return syncWrite(['routines', 'categories', 'exercises', 'settings'], async () => {
    const [category, catalog] = await Promise.all([
      db.categories.get(categoryId),
      db.exercises.bulkGet(plan.exercises.map(({ exerciseId }) => exerciseId)),
    ]);
    const settings = await db.settings.get('app');
    const items = equipmentItems(settings);
    const equipment = inventoryKeys(items.map(({ name }) => name));
    const dumbbellPair = hasDumbbellPair(items);
    if (!category) throw new SyncError('STALE_PROPOSAL');
    for (const [index, { exerciseId }] of plan.exercises.entries()) {
      const exercise = catalog[index] ?? homeMovements.get(exerciseId);
      if (!exercise || exercise.mode !== 'reps' || (useInventory && (!supportsEquipment(exerciseRequirements(exercise), equipment)
        || (!dumbbellPair && pairedDumbbellExercises.has(exerciseId))))) {
        throw new SyncError('STALE_PROPOSAL');
      }
      if (!catalog[index]) await upsertExercise(exercise);
    }
    const cardio = plan.cardio;
    if (cardio) {
      const available = cardioExercises(settings?.lang ?? 'pt').find(({ id }) => id === cardio.exerciseId);
      if (!available || (useInventory && !supportsEquipment(available.equipment, equipment))) throw new SyncError('STALE_PROPOSAL');
      const saved = await db.exercises.get(available.id);
      if (saved && saved.mode !== 'cardio') throw new SyncError('STALE_PROPOSAL');
      if (!saved) await upsertExercise(available);
    }
    return upsertRoutine({
      name: plan.name, categoryId, note, order: ((await db.routines.orderBy('order').last())?.order ?? -1) + 1,
      exercises: [...plan.exercises.map(({ exerciseId, sets, reps, restSec }) => ({
        exerciseId, sets, targetReps: String(reps), restSec, progression: 'off',
      } as const)), ...(cardio ? [{ exerciseId: cardio.exerciseId, sets: 1, targetSec: cardio.seconds,
        restSec: 0, progression: 'off' as const }] : [])],
    });
  });
}

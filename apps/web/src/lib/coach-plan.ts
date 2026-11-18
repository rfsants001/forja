import type { Exercise, MuscleGroup } from '@forja/core';
import { db } from '../db/db';
import { upsertRoutine } from '../db/repo';
import { syncWrite } from '../db/sync-write';
import { equipmentKey, supportsEquipment } from './equipment';
import { normalizeExName } from './normalize';
import { movementFamily, resistance } from './coach-movements';
import { SyncError } from './sync-client';

export type PlanGoal = 'strength' | 'muscle' | 'general';
export type PlanFocus = 'full' | 'upper' | 'lower';
export type PlanVenue = 'home' | 'gym';

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
}

const lower = new Set<MuscleGroup>(['quads', 'hamstrings', 'glutes', 'calves']);
const upper = new Set<MuscleGroup>(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps', 'lats']);

export function eligiblePlanExercises(catalog: readonly Exercise[], equipment: string[], focus: PlanFocus, useInventory: boolean) {
  const available = new Set(equipment);
  return catalog.filter((exercise) => {
    const muscle = exercise.primaryMuscle;
    if (exercise.mode !== 'reps' || muscle === 'other' || muscle === 'cardio') return false;
    if (focus === 'lower' && !lower.has(muscle)) return false;
    if (focus === 'upper' && !upper.has(muscle)) return false;
    return !useInventory || supportsEquipment(exercise.equipment, available);
  });
}

export function planCandidates(eligible: readonly Exercise[], equipment: string[], previousNames: string[]) {
  const previous = new Set(previousNames.map(normalizeExName));
  const rank = (exercise: Exercise) => 4 * Number(previous.has(normalizeExName(exercise.name)))
    + 2 * Number(Boolean(movementFamily(exercise))) + Number(exercise.demo.kind === 'asset');
  const sorted = [...eligible].sort((a, b) => rank(b) - rank(a));
  const picked = new Map<string, Exercise>();
  for (const key of new Set(equipment.map(equipmentKey))) {
    const item = sorted.find((exercise) => exercise.equipment.some((value) => equipmentKey(value) === key));
    if (item) picked.set(item.id, item);
  }
  const groups = new Set<string>();
  for (const exercise of sorted) {
    const family = movementFamily(exercise);
    if (!family || groups.has(family)) continue;
    picked.set(exercise.id, exercise);
    groups.add(family);
  }
  const counts = new Map<MuscleGroup, number>();
  for (const exercise of sorted) {
    const count = counts.get(exercise.primaryMuscle) ?? 0;
    if (count >= 4 || picked.has(exercise.id)) continue;
    picked.set(exercise.id, exercise);
    counts.set(exercise.primaryMuscle, count + 1);
  }
  return [...picked.values()].slice(0, 60).map((exercise) => ({
    id: exercise.id, name: exercise.name, muscle: exercise.primaryMuscle, family: movementFamily(exercise),
    resistance: resistance(exercise),
  }));
}

export async function saveCoachPlan(plan: CoachPlanResult, categoryId: string, note?: string) {
  return syncWrite(['routines', 'categories', 'exercises'], async () => {
    const [category, catalog] = await Promise.all([
      db.categories.get(categoryId),
      db.exercises.bulkGet(plan.exercises.map(({ exerciseId }) => exerciseId)),
    ]);
    if (!category || catalog.some((exercise) => exercise?.mode !== 'reps')) throw new SyncError('STALE_PROPOSAL');
    return upsertRoutine({
      name: plan.name, categoryId, note, order: ((await db.routines.orderBy('order').last())?.order ?? -1) + 1,
      exercises: plan.exercises.map(({ exerciseId, sets, reps, restSec }) => ({
        exerciseId, sets, targetReps: String(reps), restSec, progression: 'off',
      })),
    });
  });
}

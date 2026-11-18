import type { EquipmentItem, Exercise, MuscleGroup } from '@forja/core';
import { db } from '../db/db';
import { upsertExercise, upsertRoutine } from '../db/repo';
import { syncWrite } from '../db/sync-write';
import { equipmentItems, equipmentKey, exerciseRequirements, hasDumbbellPair, inventoryKeys, supportsEquipment } from './equipment';
import { normalizeExName } from './normalize';
import { movementFamily, resistance } from './coach-movements';
import { SyncError } from './sync-client';
import { canPlanAtHome, homeMovements, pairedDumbbellExercises } from './home-exercises';
import { cardioExercises } from './coach-cardio';

export type PlanGoal = 'strength' | 'muscle' | 'general' | 'weight-loss';
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
  cardio?: { exerciseId: string; seconds: number };
}

const lower = new Set<MuscleGroup>(['quads', 'hamstrings', 'glutes', 'calves']);
const upper = new Set<MuscleGroup>(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps', 'lats']);

export function eligiblePlanExercises(catalog: readonly Exercise[], equipment: readonly EquipmentItem[], focus: PlanFocus, useInventory: boolean, venue: PlanVenue) {
  const available = inventoryKeys(equipment.map(({ name }) => name));
  const dumbbellPair = hasDumbbellPair(equipment);
  const list = venue === 'home' ? new Map([...homeMovements, ...catalog.map((exercise) => [exercise.id, exercise] as const)]) : catalog;
  return [...list.values()].filter((exercise) => {
    const muscle = exercise.primaryMuscle;
    if (exercise.mode !== 'reps' || muscle === 'other' || muscle === 'cardio') return false;
    if (focus === 'lower' && !lower.has(muscle)) return false;
    if (focus === 'upper' && !upper.has(muscle)) return false;
    if (!useInventory) return true;
    const requirements = exerciseRequirements(exercise);
    return (venue !== 'home' || canPlanAtHome(exercise, requirements)) && supportsEquipment(requirements, available)
      && (dumbbellPair || !pairedDumbbellExercises.has(exercise.id));
  });
}

export function planCandidates(eligible: readonly Exercise[], equipment: string[], previousNames: string[]) {
  const previous = new Set(previousNames.map(normalizeExName));
  const rank = (exercise: Exercise) => 4 * Number(previous.has(normalizeExName(exercise.name)))
    + 2 * Number(Boolean(movementFamily(exercise))) + Number(exercise.demo.kind === 'asset');
  const sorted = [...eligible].sort((a, b) => rank(b) - rank(a));
  const picked = new Map<string, Exercise>();
  for (const key of new Set(equipment.map(equipmentKey))) {
    const item = sorted.find((exercise) => exerciseRequirements(exercise).includes(key));
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

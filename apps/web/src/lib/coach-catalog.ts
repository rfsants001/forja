import type { EquipmentItem, Exercise, MuscleGroup } from '@forja/core';
import { allowsCoachRole, movementIdentity } from '../../../../packages/core/src/coach-movements.ts';
import { isCoachWorkingExercise } from '../../../../packages/core/src/coach-exercises.ts';
import type { PlanFocus, PlanVenue } from './coach-plan.ts';
import { equipmentKey, exerciseRequirements, hasDumbbellPair, inventoryKeys, supportsEquipment } from './equipment.ts';
import { normalizeExName } from './normalize.ts';
import { movementFamily, resistance } from './coach-movements.ts';
import { canPlanAtHome, homeMovements, pairedDumbbellExercises } from './home-exercises.ts';

export type PlanDayRole = 'upper' | 'lower' | 'full' | 'push' | 'pull' | 'legs' | 'cardio';
export const matchesPlanRole = (exercise: Exercise, role: PlanDayRole) => allowsCoachRole(exercise, role);

const lower = new Set<MuscleGroup>(['quads', 'hamstrings', 'glutes', 'calves']);
const upper = new Set<MuscleGroup>(['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps', 'lats']);

export function eligiblePlanExercises(catalog: readonly Exercise[], equipment: readonly EquipmentItem[], focus: PlanFocus, useInventory: boolean, venue: PlanVenue, level?: string) {
  const available = inventoryKeys(equipment.map(({ name }) => name));
  const dumbbellPair = hasDumbbellPair(equipment);
  const list = venue === 'home' ? new Map([...homeMovements, ...catalog.map((exercise) => [exercise.id, exercise] as const)]) : catalog;
  return [...list.values()].filter((exercise) => {
    const muscle = exercise.primaryMuscle;
    if (exercise.mode !== 'reps' || muscle === 'other' || muscle === 'cardio') return false;
    if (!isCoachWorkingExercise(exercise, level)) return false;
    if (focus === 'lower' && !lower.has(muscle)) return false;
    if (focus === 'upper' && !upper.has(muscle)) return false;
    if (!useInventory) return true;
    const requirements = exerciseRequirements(exercise);
    return (venue !== 'home' || canPlanAtHome(exercise, requirements)) && supportsEquipment(requirements, available)
      && (dumbbellPair || !pairedDumbbellExercises.has(exercise.id));
  });
}

export function planCandidates(eligible: readonly Exercise[], equipment: string[], previousNames: string[], retainIds: ReadonlySet<string> = new Set(), preferHome = false) {
  const previous = new Set(previousNames.map(normalizeExName));
  const rank = (exercise: Exercise) => 4 * Number(previous.has(normalizeExName(exercise.name)))
    + 3 * Number(preferHome && homeMovements.has(exercise.id))
    + 2 * Number(Boolean(movementFamily(exercise))) + Number(exercise.demo.kind === 'asset');
  const sorted = [...eligible].sort((a, b) => rank(b) - rank(a));
  const picked = new Map<string, Exercise>(eligible.filter(({ id }) => retainIds.has(id)).map((exercise) => [exercise.id, exercise]));
  const identities = new Set([...picked.values()].map(exercise => movementIdentity({ ...exercise, family: movementFamily(exercise), resistance: resistance(exercise) })));
  function add(exercise: Exercise) {
    const key = movementIdentity({ ...exercise, family: movementFamily(exercise), resistance: resistance(exercise) });
    if (identities.has(key)) return false;
    picked.set(exercise.id, exercise);
    identities.add(key);
    return true;
  }
  for (const key of new Set(equipment.map(equipmentKey))) {
    const item = sorted.find((exercise) => exerciseRequirements(exercise).includes(key));
    if (item) add(item);
  }
  const groups = new Set<string>();
  for (const exercise of sorted) {
    const family = movementFamily(exercise);
    if (!family || groups.has(family)) continue;
    add(exercise);
    groups.add(family);
  }
  const counts = new Map<MuscleGroup, number>();
  for (const exercise of sorted) {
    const count = counts.get(exercise.primaryMuscle) ?? 0;
    if (count >= 8 || picked.has(exercise.id)) continue;
    if (!add(exercise)) continue;
    counts.set(exercise.primaryMuscle, count + 1);
  }
  return [...picked.values()].slice(0, 60).map((exercise) => ({
    id: exercise.id, name: exercise.name, muscle: exercise.primaryMuscle, family: movementFamily(exercise),
    resistance: resistance(exercise),
  }));
}


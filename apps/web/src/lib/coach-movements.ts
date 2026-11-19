import type { Exercise } from '@forja/core';
import { catalogEquipmentKey } from './equipment.ts';
import { movementFamilyFor } from '../../../../packages/core/src/coach-movements.ts';

export const movementFamily = (exercise: Exercise) => movementFamilyFor(exercise);

export function resistance(exercise: Exercise) {
  const keys = exercise.equipment.map(catalogEquipmentKey);
  return keys.find((key) => ['polia', 'maquina', 'smith machine', 'halter', 'barra reta', 'barra ez', 'barra hexagonal', 'anilha', 'elastica', 'kettlebell', 'barra fixa'].includes(key)) ?? keys[0] ?? 'peso corporal';
}

export function planAlternatives(exercise: Exercise, eligible: readonly Exercise[]) {
  const family = movementFamily(exercise);
  if (!family) return [];
  const used = new Set([resistance(exercise)]);
  return eligible.filter((candidate) => {
    if (candidate.id === exercise.id || movementFamily(candidate) !== family) return false;
    const type = resistance(candidate);
    if (used.has(type)) return false;
    used.add(type);
    return true;
  }).slice(0, 2);
}

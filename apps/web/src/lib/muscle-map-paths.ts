// Geometry converted from MuscleMap by Melih Colpan (MIT).
// https://github.com/melihcolpan/MuscleMap/tree/d53ddf4d480b65979f1008b203e6b6eda0e67e54
import type { MuscleGroup } from '@forja/core';
import geometry from '../data/muscle-map.generated.json';

export type MuscleFigure = keyof typeof geometry;
export type MuscleView = 'front' | 'back';

export const MUSCLE_PATH_GROUPS: Readonly<Partial<Record<string, MuscleGroup>>> = {
  chest: 'chest',
  upperBack: 'lats',
  lowerBack: 'back',
  rhomboids: 'back',
  rotatorCuff: 'shoulders',
  deltoids: 'shoulders',
  biceps: 'biceps',
  triceps: 'triceps',
  forearm: 'forearms',
  quadriceps: 'quads',
  hamstring: 'hamstrings',
  gluteal: 'glutes',
  calves: 'calves',
  abs: 'abs',
  obliques: 'obliques',
  trapezius: 'traps',
};

export const MUSCLES_IN_ATLAS = [...new Set(Object.values(MUSCLE_PATH_GROUPS))]
  .filter((group): group is MuscleGroup => group !== undefined);

export function muscleGeometry(figure: MuscleFigure, view: MuscleView) {
  return geometry[figure][view];
}

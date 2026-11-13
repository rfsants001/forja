// Utilitário de labels PT-BR para enums do domínio Forja.
// Importado por Exercicios.tsx, RotinaEditor.tsx e qualquer tela que precise de label legível.

import type { MuscleGroup, ExerciseMode, ProgressionPolicy } from '@forja/core';

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest: 'Peito',
  back: 'Costas',
  shoulders: 'Ombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebraços',
  quads: 'Quadríceps',
  hamstrings: 'Posterior',
  glutes: 'Glúteos',
  calves: 'Panturrilha',
  abs: 'Abdômen',
  obliques: 'Oblíquos',
  traps: 'Trapézio',
  lats: 'Latíssimo',
  fullbody: 'Corpo todo',
  cardio: 'Cardio',
  other: 'Outro',
};

export const MODE_LABEL: Record<ExerciseMode, string> = {
  reps: 'Repetições',
  time: 'Tempo',
  cardio: 'Cardio',
};

export const PROGRESSION_LABEL: Record<ProgressionPolicy, string> = {
  off: 'Sem progressão',
  linear: 'Linear',
  greyskull: 'Greyskull',
  double: 'Double progression',
  time: 'Progressão por tempo',
  '531': '5/3/1 (Wendler)',
};

/** Lista ordenada de MuscleGroups para uso em selects. */
export const MUSCLE_OPTIONS: MuscleGroup[] = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
  'quads', 'hamstrings', 'glutes', 'calves', 'abs', 'obliques',
  'traps', 'lats', 'fullbody', 'cardio', 'other',
];

/** Lista de ExerciseModes para uso em selects. */
export const MODE_OPTIONS: ExerciseMode[] = ['reps', 'time', 'cardio'];

/** Lista de ProgressionPolicies para uso em selects. */
export const PROGRESSION_OPTIONS: ProgressionPolicy[] = [
  'off', 'linear', 'greyskull', 'double', 'time', '531',
];

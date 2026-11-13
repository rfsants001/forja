// Utilitário de labels para enums do domínio Forja.
// Os maps PT estáticos (MUSCLE_LABEL, MODE_LABEL, PROGRESSION_LABEL) são mantidos
// para retrocompatibilidade em contextos não-reativos (ex.: MuscleMap, título de SVG).
// Para UI reativa com troca de idioma, use as funções getLang* via useT() no componente.

import type { MuscleGroup, ExerciseMode, ProgressionPolicy } from '@forja/core';
import { t } from './i18n';
import type { Lang } from './i18n';

// ---------------------------------------------------------------------------
// Maps estáticos PT-BR (retrocompatibilidade)
// ---------------------------------------------------------------------------

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  chest:      'Peito',
  back:       'Costas',
  shoulders:  'Ombros',
  biceps:     'Bíceps',
  triceps:    'Tríceps',
  forearms:   'Antebraços',
  quads:      'Quadríceps',
  hamstrings: 'Posterior',
  glutes:     'Glúteos',
  calves:     'Panturrilha',
  abs:        'Abdômen',
  obliques:   'Oblíquos',
  traps:      'Trapézio',
  lats:       'Latíssimo',
  fullbody:   'Corpo todo',
  cardio:     'Cardio',
  other:      'Outro',
};

export const MODE_LABEL: Record<ExerciseMode, string> = {
  reps:   'Repetições',
  time:   'Tempo',
  cardio: 'Cardio',
};

export const PROGRESSION_LABEL: Record<ProgressionPolicy, string> = {
  off:        'Sem progressão',
  linear:     'Linear',
  greyskull:  'Greyskull',
  double:     'Double progression',
  time:       'Progressão por tempo',
  '531':      '5/3/1 (Wendler)',
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

// ---------------------------------------------------------------------------
// Funções i18n-aware (usam o dicionário centralizado de i18n.ts)
// ---------------------------------------------------------------------------

/** Label de músculo no idioma pedido. */
export function muscleLabelI18n(muscle: MuscleGroup, lang: Lang): string {
  return t(`muscle.${muscle}`, lang);
}

/** Label de modo no idioma pedido. */
export function modeLabelI18n(mode: ExerciseMode, lang: Lang): string {
  return t(`mode.${mode}`, lang);
}

/** Label de política de progressão no idioma pedido. */
export function progressionLabelI18n(policy: ProgressionPolicy, lang: Lang): string {
  return t(`prog.policy.${policy}`, lang);
}

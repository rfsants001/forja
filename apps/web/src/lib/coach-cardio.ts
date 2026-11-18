import type { Exercise } from '@forja/core';
import { t, type Lang } from './i18n';

const cardio = [
  { id: 'coach-treadmill', equipment: 'esteira', label: 'coach.cardio.treadmill' },
  { id: 'coach-exercise-bike', equipment: 'bicicleta ergometrica', label: 'coach.cardio.bike' },
  { id: 'coach-elliptical', equipment: 'eliptico', label: 'coach.cardio.elliptical' },
  { id: 'coach-rower', equipment: 'remo ergometrico', label: 'coach.cardio.rower' },
  { id: 'coach-walk', equipment: 'peso corporal', label: 'coach.cardio.walk' },
] as const;

export function cardioExercises(lang: Lang): Exercise[] {
  return cardio.map(({ id, equipment, label }) => ({
    id, name: t(label, lang), equipment: [equipment], mode: 'cardio', demo: { kind: 'none' },
    primaryMuscle: 'cardio', secondaryMuscles: [], instructions: t('coach.cardioIntensity', lang),
  }));
}

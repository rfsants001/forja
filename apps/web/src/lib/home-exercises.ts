import type { Exercise, MuscleGroup } from '@forja/core';

// Only include built-in movements whose setup was checked for home use.
const verified = new Set([
  'flexao', 'barra-fixa', 'remada-curvada', 'levantamento-terra', 'desenvolvimento-halter',
  'elevacao-lateral', 'elevacao-frontal', 'rosca-martelo', 'afundo', 'kettlebell-swing',
  'supino-reto-barra', 'supino-inclinado-barra', 'agachamento-livre', 'remada-halter',
  'ds-0276', 'ds-1373', 'ds-1460', 'ds-2398', 'ds-3211', 'ds-3645',
  'ds-0659', 'ds-0662', 'ds-0699', 'ds-1772',
  'ds-0652', 'ds-0688', 'ds-1326', 'ds-1429', 'ds-0970',
  'ds-0293', 'ds-0294', 'ds-0300', 'ds-0313', 'ds-0334', 'ds-0336',
  'ds-0381', 'ds-0413', 'ds-0417', 'ds-0426', 'ds-1459', 'ds-1760', 'ds-0289', 'ds-0308',
  'ds-0025', 'ds-0027', 'ds-0031', 'ds-0032', 'ds-0033', 'ds-0043', 'ds-0047', 'ds-0085', 'ds-0117',
  'ds-0446', 'ds-0447', 'ds-0451', 'ds-0811',
  'ds-0975', 'ds-1004', 'ds-3123', 'ds-3124', 'ds-3144',
  'ds-0534', 'ds-0541', 'ds-0549', 'ds-1298',
]);

function movement(id: string, name: string, primaryMuscle: MuscleGroup, equipment: string[], secondaryMuscles: MuscleGroup[]): Exercise {
  return { id: 'home-' + id, name, primaryMuscle, secondaryMuscles, equipment,
    mode: 'reps', demo: { kind: 'none' } };
}

export const homeMovements = new Map([
  movement('air-squat', 'Agachamento livre sem carga', 'quads', ['peso corporal'], ['glutes']),
  movement('reverse-lunge', 'Afundo reverso sem carga', 'quads', ['peso corporal'], ['glutes']),
  movement('glute-bridge', 'Ponte de glúteo no chão', 'glutes', ['peso corporal'], ['hamstrings']),
  movement('prone-row', 'Remada deitada sem carga', 'back', ['peso corporal'], ['shoulders']),
  movement('supine-floor-press', 'Supino com halteres no chão', 'chest', ['halter'], ['triceps', 'shoulders']),
  movement('single-arm-floor-press', 'Supino unilateral com halter no chão', 'chest', ['halter'], ['triceps', 'shoulders']),
  movement('floor-fly', 'Crucifixo com halteres no chão', 'chest', ['halter'], ['shoulders']),
  movement('plate-squat', 'Agachamento segurando anilha', 'quads', ['anilha'], ['glutes']),
  movement('plate-raise', 'Elevação frontal com anilha', 'shoulders', ['anilha'], []),
  movement('plate-curl', 'Rosca com anilha', 'biceps', ['anilha'], ['forearms']),
  movement('plate-twist', 'Rotação de tronco no chão com anilha', 'abs', ['anilha'], []),
  movement('ez-romanian-deadlift', 'Terra romeno com barra W', 'glutes', ['barra ez'], ['hamstrings', 'back']),
  movement('sliding-leg-curl', 'Flexão de pernas no chão com discos deslizantes', 'hamstrings', ['disco deslizante'], ['glutes']),
  movement('pushup-handles', 'Flexão com apoios de flexão', 'chest', ['apoio de flexao'], ['triceps', 'shoulders']),
  movement('backpack-squat', 'Agachamento segurando mochila com peso', 'quads', ['mochila'], ['glutes']),
].map((exercise) => [exercise.id, exercise]));

export const pairedDumbbellExercises = new Set(['ds-0289', 'ds-0308', 'home-supine-floor-press', 'home-floor-fly']);

export function canPlanAtHome(exercise: Exercise, requirements: readonly string[]): boolean {
  return (exercise.custom === true && requirements.length > 0) || verified.has(exercise.id) || homeMovements.has(exercise.id);
}

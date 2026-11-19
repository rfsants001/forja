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
  movement('wall-pushup', 'Flexão na parede', 'chest', ['peso corporal'], ['triceps', 'shoulders']),
  movement('scapular-pushup', 'Flexão escapular', 'chest', ['peso corporal'], ['shoulders']),
  movement('air-squat', 'Agachamento livre sem carga', 'quads', ['peso corporal'], ['glutes']),
  movement('reverse-lunge', 'Afundo reverso sem carga', 'quads', ['peso corporal'], ['glutes']),
  movement('glute-bridge', 'Ponte de glúteo no chão', 'glutes', ['peso corporal'], ['hamstrings']),
  movement('prone-row', 'Remada deitada sem carga', 'back', ['peso corporal'], ['shoulders']),
  movement('supine-floor-press', 'Supino com halteres no chão', 'chest', ['halter'], ['triceps', 'shoulders']),
  movement('single-arm-floor-press', 'Supino unilateral com halter no chão', 'chest', ['halter'], ['triceps', 'shoulders']),
  movement('neutral-floor-press', 'Supino neutro com halteres no chão', 'chest', ['halter'], ['triceps', 'shoulders']),
  movement('floor-fly', 'Crucifixo com halteres no chão', 'chest', ['halter'], ['shoulders']),
  movement('plate-squat', 'Agachamento segurando anilha', 'quads', ['anilha'], ['glutes']),
  movement('plate-raise', 'Elevação frontal com anilha', 'shoulders', ['anilha'], []),
  movement('plate-curl', 'Rosca com anilha', 'biceps', ['anilha'], ['forearms']),
  movement('hollow-rock', 'Hollow body rocks', 'abs', ['peso corporal'], ['obliques']),
  movement('reverse-crunch', 'Abdominal reverso no chão', 'abs', ['peso corporal'], []),
  movement('plate-twist', 'Rotação de tronco no chão com anilha', 'abs', ['anilha'], []),
  movement('ez-romanian-deadlift', 'Terra romeno com barra W', 'glutes', ['barra ez'], ['hamstrings', 'back']),
  movement('sliding-leg-curl', 'Flexão de pernas no chão com discos deslizantes', 'hamstrings', ['disco deslizante'], ['glutes']),
  movement('pushup-handles', 'Flexão com apoios de flexão', 'chest', ['apoio de flexao'], ['triceps', 'shoulders']),
  movement('backpack-squat', 'Agachamento segurando mochila com peso', 'quads', ['mochila'], ['glutes']),
  // Home setups with no bench, rack, cable station or improvised furniture.
  movement('dumbbell-row', 'Remada curvada com halteres', 'back', ['halter'], ['biceps', 'lats']),
  movement('single-arm-row', 'Remada unilateral com halter em pé', 'back', ['halter'], ['biceps', 'lats']),
  movement('ez-row', 'Remada curvada com barra W', 'back', ['barra ez'], ['biceps', 'lats']),
  movement('wide-pullup', 'Pull-up com pegada larga', 'lats', ['barra fixa'], ['back', 'biceps']),
  movement('chinup', 'Chin-up com pegada supinada', 'lats', ['barra fixa'], ['back', 'biceps']),
  movement('dumbbell-curl', 'Rosca direta com halter', 'biceps', ['halter'], ['forearms']),
  movement('hammer-curl', 'Rosca martelo com halter', 'biceps', ['halter'], ['forearms']),
  movement('reverse-curl', 'Rosca inversa com halter', 'biceps', ['halter'], ['forearms']),
  movement('ez-curl', 'Rosca direta com barra W', 'biceps', ['barra ez'], ['forearms']),
  movement('dumbbell-shrug', 'Encolhimento com halteres', 'traps', ['halter'], ['forearms']),
  movement('rear-delt-fly', 'Crucifixo inverso com halteres', 'shoulders', ['halter'], ['back']),
  movement('floor-pullover', 'Pullover no chão com halter', 'lats', ['halter'], ['chest', 'triceps']),
  movement('wrist-curl', 'Flexão de punho com halter', 'forearms', ['halter'], []),
  movement('wrist-extension', 'Extensão de punho com halter', 'forearms', ['halter'], []),
  movement('dumbbell-press', 'Desenvolvimento com halteres em pé', 'shoulders', ['halter'], ['triceps']),
  movement('arnold-press', 'Desenvolvimento Arnold com halteres em pé', 'shoulders', ['halter'], ['triceps']),
  movement('lateral-raise', 'Elevação lateral com halter em pé', 'shoulders', ['halter'], []),
  movement('overhead-triceps', 'Extensão de tríceps acima da cabeça com halter em pé', 'triceps', ['halter'], []),
  movement('single-arm-overhead-triceps', 'Extensão de tríceps unilateral acima da cabeça com halter', 'triceps', ['halter'], []),
  movement('floor-triceps', 'Tríceps testa no chão com halteres', 'triceps', ['halter'], []),
  movement('ez-floor-triceps', 'Tríceps testa no chão com barra W', 'triceps', ['barra ez'], []),
  movement('diamond-pushup', 'Flexão diamante no chão', 'chest', ['peso corporal'], ['triceps', 'shoulders']),
  movement('goblet-squat', 'Agachamento goblet com halter', 'quads', ['halter'], ['glutes']),
  movement('sumo-squat', 'Agachamento sumô com halter', 'quads', ['halter'], ['glutes']),
  movement('dumbbell-rdl', 'Terra romeno com halteres', 'hamstrings', ['halter'], ['glutes', 'back']),
  movement('single-leg-rdl', 'Terra romeno unilateral com halter', 'hamstrings', ['halter'], ['glutes']),
  movement('dumbbell-reverse-lunge', 'Afundo reverso com halter', 'quads', ['halter'], ['glutes']),
  movement('dumbbell-side-lunge', 'Afundo lateral com halter', 'quads', ['halter'], ['glutes']),
  movement('dumbbell-walking-lunge', 'Afundo andando com halter', 'quads', ['halter'], ['glutes']),
  movement('weighted-glute-bridge', 'Ponte de glúteo no chão com anilha', 'glutes', ['anilha'], ['hamstrings']),
  movement('standing-calf', 'Panturrilha em pé com halter', 'calves', ['halter'], []),
  movement('single-leg-calf', 'Panturrilha unilateral com halter', 'calves', ['halter'], []),
].map((exercise) => [exercise.id, exercise]));

export const pairedDumbbellExercises = new Set(['ds-0289', 'ds-0308', 'home-supine-floor-press', 'home-floor-fly',
  'home-dumbbell-row', 'home-dumbbell-shrug', 'home-rear-delt-fly', 'home-dumbbell-press', 'home-arnold-press',
  'home-floor-triceps', 'home-dumbbell-rdl', 'home-neutral-floor-press']);

export function canPlanAtHome(exercise: Exercise, requirements: readonly string[]): boolean {
  return (exercise.custom === true && requirements.length > 0) || verified.has(exercise.id) || homeMovements.has(exercise.id);
}

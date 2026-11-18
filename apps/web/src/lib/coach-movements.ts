import type { Exercise } from '@forja/core';
import { catalogEquipmentKey } from './equipment';
import { normalizeExName } from './normalize';

export function movementFamily(exercise: Exercise): string | undefined {
  const name = normalizeExName(exercise.name);
  const muscle = exercise.primaryMuscle;
  if (muscle === 'chest' && /\b(fly|flyes|crossovers?|pec deck|peck deck|crucifixo|butterfly)\b/.test(name)) return 'chest-fly';
  if (muscle === 'chest' && /\b(bench press|chest press|supino|pushup|push up|flexao)\b/.test(name)) return 'chest-press';
  if (muscle === 'shoulders' && /\b(overhead press|shoulder press|military press|desenvolvimento)\b/.test(name)) return 'overhead-press';
  if ((muscle === 'back' || muscle === 'lats') && /\b(row|remada)\b/.test(name)) return 'row';
  if ((muscle === 'back' || muscle === 'lats') && /\b(pullup|pull up|chinup|chin up|pulldown|puxada|barra fixa)\b/.test(name)) return 'vertical-pull';
  if ((muscle === 'quads' || muscle === 'glutes') && /\b(lunge|afundo|split squat|passada)\b/.test(name)) return 'lunge';
  if ((muscle === 'quads' || muscle === 'glutes') && /\b(squat|agachamento)\b/.test(name)) return 'squat';
  if (muscle === 'quads' && /\b(leg press)\b/.test(name)) return 'leg-press';
  if ((muscle === 'back' || muscle === 'hamstrings' || muscle === 'glutes') && /\b(deadlift|levantamento terra|terra romeno|stiff)\b/.test(name)) return 'hinge';
  if (muscle === 'glutes' && /\b(hip thrust|glute bridge|elevacao pelvica|ponte de gluteo)\b/.test(name)) return 'hip-extension';
  if (muscle === 'biceps' && /\b(curl|rosca)\b/.test(name)) return 'biceps-curl';
  if (muscle === 'triceps' && /\b(extension|pushdown|extensao|triceps testa)\b/.test(name)) return 'triceps-extension';
}

export function resistance(exercise: Exercise) {
  const keys = exercise.equipment.map(catalogEquipmentKey);
  return keys.find((key) => ['polia', 'maquina', 'smith machine', 'halter', 'barra reta', 'barra ez', 'barra hexagonal', 'anilha', 'elastica', 'kettlebell'].includes(key)) ?? keys[0] ?? 'peso corporal';
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

/** Whether a movement belongs in the working sets of a generated strength plan. */
export function isCoachWorkingExercise(exercise: { id?: string; name: string }, level?: string): boolean {
  const name = exercise.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  // Keep scapular control and unloaded floor drills out of the exercise quota.
  if (exercise.id === 'home-prone-row' || exercise.id === 'home-scapular-pushup'
    || /^(?:scapular (?:pullups?|pull ups?|pushups?|push ups?)|(?:puxada|flexao) escapular|elbow lift|remada deitada sem carga)\b/.test(name)) return false;
  if (level !== 'advanced') return true;
  return !['home-wall-pushup', 'home-air-squat', 'home-reverse-lunge', 'home-glute-bridge'].includes(exercise.id ?? '')
    && !/^(?:wall pushups?|wall push ups?|flexao na parede|air squat|agachamento livre sem carga|afundo reverso sem carga)\b/.test(name);
}

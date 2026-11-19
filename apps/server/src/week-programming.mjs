import { assert } from './storage.mjs';

const upper = ['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps'];
const lower = ['quads', 'hamstrings', 'glutes', 'calves'];
const roles = {
  upper, lower, legs: lower,
  full: [...upper, ...lower, 'abs', 'obliques', 'fullbody'],
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'lats', 'biceps', 'forearms', 'traps'],
};
const priorities = {
  upper: [['chest-press', 'row'], ['overhead-press', 'vertical-pull']],
  lower: [['squat', 'lunge'], ['hinge', 'hip-extension']],
  legs: [['squat', 'lunge'], ['hinge', 'hip-extension']],
  full: [['squat', 'chest-press', 'row'], ['hinge', 'overhead-press', 'vertical-pull']],
  push: [['chest-press'], ['overhead-press']],
  pull: [['row'], ['vertical-pull']],
};
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 160;
const normalize = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

/** Detect duplicate catalog IDs and translations of the same known movement. */
export function exerciseIdentity(exercise) {
  const name = normalize(exercise.name);
  if (!exercise.family) return 'name:' + name.replace(/\s+v?\s*\d+$/, '');
  const angle = /\b(incline|inclinado)\b/.test(name) ? 'incline'
    : /\b(decline|declinado)\b/.test(name) ? 'decline'
    : /\b(floor|chao|solo)\b/.test(name) ? 'floor' : 'standard';
  const unilateral = /\b(unilateral|one arm|single arm|one leg|single leg)\b/.test(name);
  return [exercise.family, exercise.resistance ?? '', angle, unilateral].join(':');
}

export function weekInput(value, focus, exercises) {
  if (value === undefined) return undefined;
  assert(value && Object.hasOwn(roles, value.role) && integer(value.variant, 0, 6)
    && Array.isArray(value.previous) && value.previous.length === value.variant);
  const expectedFocus = value.role === 'full' ? 'full' : ['lower', 'legs'].includes(value.role) ? 'lower' : 'upper';
  assert(focus === expectedFocus && exercises.every(({ muscle }) => roles[value.role].includes(muscle)));
  const previous = value.previous.map((session) => {
    assert(session && Array.isArray(session.exercises) && integer(session.exercises.length, 3, 8));
    const seen = new Set();
    return { exercises: session.exercises.map((entry) => {
      assert(entry && text(entry.exerciseId) && !seen.has(entry.exerciseId) && integer(entry.sets, 1, 5)
        && integer(entry.reps, 4, 20) && integer(entry.restSec, 30, 240)
        && exercises.some(({ id }) => id === entry.exerciseId));
      seen.add(entry.exerciseId);
      const { exerciseId, sets, reps, restSec } = entry;
      return { exerciseId, sets, reps, restSec };
    }) };
  });
  return { role: value.role, variant: value.variant, previous };
}

export function programWeek(exercises, input, baseline) {
  if (!input.week) return { exercises };
  const { role, variant, previous } = input.week;
  const byId = new Map(input.exercises.map((item) => [item.id, item]));
  const identity = (id) => byId.has(id) ? exerciseIdentity(byId.get(id)) : 'unavailable:' + id;
  const used = new Map();
  for (const session of previous) {
    for (const { exerciseId } of session.exercises) {
      const key = identity(exerciseId);
      used.set(key, (used.get(key) ?? 0) + 1);
    }
  }
  const sorted = [...input.exercises].sort((a, b) => (used.get(identity(a.id)) ?? 0) - (used.get(identity(b.id)) ?? 0));
  const preferred = priorities[role][variant % 2];
  const selected = [];
  const minimumCount = input.trainingLevel ? exercises.length : Math.min(3, exercises.length);
  const keys = new Set();
  const families = new Set();

  function add(candidate) {
    if (!candidate || keys.has(identity(candidate.id))) return;
    selected.push(exercises.find(({ exerciseId }) => exerciseId === candidate.id) ?? baseline(candidate));
    keys.add(identity(candidate.id));
    if (candidate.family) families.add(candidate.family);
  }

  for (const family of preferred) add(sorted.find((candidate) => candidate.family === family));
  // Keep compatible model choices while avoiding a row of catalog aliases.
  for (const entry of exercises) {
    if (selected.length >= exercises.length) break;
    const candidate = byId.get(entry.exerciseId);
    if (!candidate.family || !families.has(candidate.family)) add(candidate);
  }
  for (const candidate of sorted) {
    if (selected.length >= exercises.length) break;
    if (!candidate.family || !families.has(candidate.family)) add(candidate);
  }
  for (const candidate of sorted) {
    if (selected.length >= minimumCount) break;
    add(candidate);
  }
  // The catalog can contain fewer than three distinct known movement variants.
  for (const entry of exercises) {
    if (selected.length >= minimumCount) break;
    if (!selected.some(({ exerciseId }) => exerciseId === entry.exerciseId)) selected.push(entry);
  }

  const composition = (entries) => [...new Set(entries.map(({ exerciseId }) => identity(exerciseId)))].sort().join('|');
  const previousKeys = new Set(previous.map(({ exercises }) => composition(exercises)));
  if (previousKeys.has(composition(selected))) {
    // Replace within the same muscle and movement family before broader swaps.
    const replacements = [];
    for (const [index, entry] of selected.entries()) {
      const current = byId.get(entry.exerciseId);
      for (const candidate of sorted) {
        if (candidate.muscle !== current.muscle || keys.has(identity(candidate.id))) continue;
        const replacement = [...selected];
        replacement[index] = { ...entry, exerciseId: candidate.id, restSec: Math.max(entry.restSec, baseline(candidate).restSec) };
        if (previousKeys.has(composition(replacement))) continue;
        const sameFamily = candidate.family && candidate.family === current.family;
        replacements.push({ replacement, score: sameFamily ? 0 : preferred.includes(current.family) ? 2 : 1 });
      }
    }
    replacements.sort((a, b) => a.score - b.score);
    if (replacements.length) selected.splice(0, selected.length, ...replacements[0].replacement);
  }
  const currentKeys = new Set(selected.map(({ exerciseId }) => identity(exerciseId)));
  const lastKeys = new Set(previous.at(-1)?.exercises.map(({ exerciseId }) => identity(exerciseId)));
  const changedExercises = [...currentKeys].filter((key) => !lastKeys.has(key)).length;
  return {
    exercises: selected,
    week: { role, variant, variation: !previous.length ? 'initial' : previousKeys.has(composition(selected)) ? 'prescription' : 'exercises',
      changedExercises: previous.length ? changedExercises : 0 },
  };
}

/** Fit each candidate before comparing so time-based volume changes cannot undo the check. */
export function distinguishPrescription(exercises, input, minReps, maxReps, fit) {
  if (!input.week?.previous.length) return fit(exercises);
  const byId = new Map(input.exercises.map((item) => [item.id, item]));
  const signature = (entries) => entries.map(({ exerciseId, sets, reps, restSec }) => [
    byId.has(exerciseId) ? exerciseIdentity(byId.get(exerciseId)) : 'unavailable:' + exerciseId, sets, reps, restSec,
  ].join('|')).sort().join('\n');
  const previous = new Set(input.week.previous.map(({ exercises }) => signature(exercises)));
  const duration = fit(exercises);
  if (!previous.has(signature(exercises))) return duration;
  for (let delta = 1; delta <= maxReps - minReps; delta++) {
    for (const [index, entry] of exercises.entries()) {
      for (const reps of [entry.reps + delta, entry.reps - delta]) {
        if (reps < minReps || reps > maxReps) continue;
        const candidate = exercises.map((item, position) => position === index ? { ...item, reps } : { ...item });
        let estimate;
        try { estimate = fit(candidate); }
        catch (error) {
          if (error.code === 'SESSION_DURATION_TOO_SHORT') continue;
          throw error;
        }
        if (previous.has(signature(candidate))) continue;
        exercises.splice(0, exercises.length, ...candidate);
        return estimate;
      }
    }
  }
  assert(false, 'WEEK_VARIATION_UNAVAILABLE', 422);
}

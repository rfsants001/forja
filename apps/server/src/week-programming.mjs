import { assert } from './storage.mjs';
import { movementIdentity as exerciseIdentity, allowsCoachRole, movementFamilyFor } from '../../../packages/core/src/coach-movements.ts';

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
  pull: [['row', 'vertical-pull'], ['vertical-pull', 'row']],
};
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const text = (value) => typeof value === 'string' && value.length > 0 && value.length <= 160;
const normalize = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

export { movementIdentity as exerciseIdentity } from '../../../packages/core/src/coach-movements.ts';

function legCoreSlots(input, count) {
  if (count < 6) return 0;
  if (input.reference) return Math.min(2, input.reference.exercises.filter(exercise => movementFamilyFor(exercise)?.startsWith('core-')).length);
  return (input.week?.variant ?? 0) % 2;
}

function compositionProfile(input, count) {
  const role = input.week?.role ?? input.focus;
  const requirements = [...(priorities[role]?.[(input.week?.variant ?? 0) % 2] ?? [])].map(family => ({ family, count: 1 }));
  if (role === 'pull') requirements.push({ family: 'biceps-curl', count: count >= 6 ? 2 : 1 });
  if (role === 'push') {
    if (!requirements.some(({ family }) => family === 'chest-press')) requirements.push({ family: 'chest-press', count: 1 });
    if (count >= 6 && !requirements.some(({ family }) => family === 'overhead-press')) requirements.push({ family: 'overhead-press', count: 1 });
    requirements.push({ family: 'triceps-extension', count: count >= 6 ? 2 : 1 });
    if (count >= 6) requirements.push({ family: 'lateral-raise', count: 1 }, { family: 'chest-fly', count: 1 });
  }
  if (['legs', 'lower'].includes(role) && count >= 6) {
    const core = legCoreSlots(input, count);
    for (const family of ['hinge', 'lunge', 'hip-extension', 'calf-raise', 'leg-curl']) {
      if (!requirements.some(item => item.family === family)) requirements.push({ family, count: 1 });
    }
    if (core) requirements.splice(2, 0, { family: 'core-', count: core });
  }
  const matches = (candidate, family) => family === 'core-' ? candidate.family?.startsWith('core-') : candidate.family === family;
  const available = requirements.map(item => ({ ...item, count: Math.min(item.count,
    new Set(input.exercises.filter(candidate => matches(candidate, item.family)).map(exerciseIdentity)).size) })).filter(item => item.count);
  // Never request more mandatory slots than the selected level can contain.
  let slots = 0;
  return { role, matches, requirements: available.filter(item => {
    if (slots + item.count > count) return false;
    slots += item.count;
    return true;
  }) };
}

function compositionAllowed(entries, input) {
  const byId = new Map(input.exercises.map(item => [item.id, item]));
  const counts = new Map();
  const identities = new Set();
  const role = input.week?.role ?? input.focus;
  const coreLimit = ['lower', 'legs'].includes(role) ? legCoreSlots(input, input.trainingLevel === 'advanced' ? 8 : input.trainingLevel === 'intermediate' ? 6 : 4) : 2;
  const referenceCalves = input.reference?.exercises.filter(exercise => movementFamilyFor(exercise) === 'calf-raise').length ?? 0;
  const calfLimit = referenceCalves ? Math.min(2, referenceCalves) : 2;
  let calves = 0, forearms = 0, core = 0;
  for (const entry of entries) {
    const candidate = byId.get(entry.exerciseId);
    const identity = exerciseIdentity(candidate);
    if (identities.has(identity)) return false;
    identities.add(identity);
    if (input.week && !allowsCoachRole(candidate, input.week.role)) return false;
    if (candidate.family) {
      const count = (counts.get(candidate.family) ?? 0) + 1;
      counts.set(candidate.family, count);
      const referenceCount = input.reference?.exercises.filter(exercise => movementFamilyFor(exercise) === candidate.family).length ?? 0;
      if (count > Math.max(2, Math.min(3, referenceCount))) return false;
    }
    if (candidate.muscle === 'calves' && ++calves > calfLimit) return false;
    if (candidate.muscle === 'forearms' && ++forearms > 1) return false;
    if (['abs', 'obliques'].includes(candidate.muscle) && ++core > coreLimit) return false;
  }
  return true;
}

function balancedSelection(exercises, input, baseline, sorted) {
  const selected = [], identities = new Set();
  const count = exercises.length;
  const profile = compositionProfile(input, count);
  const modelOrder = new Map(exercises.map((entry, index) => [entry.exerciseId, index]));
  const referenceMatch = candidate => Math.max(0, ...(input.reference?.exercises ?? []).map(source => {
    const name = normalize(source.name);
    const explicitResistance = /\b(barra (w|ez|z)|ez bar(?:bell)?)\b/.test(name) ? 'barra ez'
      : /\b(halter(?:e|es)?|dumbbells?)\b/.test(name) ? 'halter' : /\b(anilha|weight plate)\b/.test(name) ? 'anilha' : undefined;
    if (exerciseIdentity({ ...source, resistance: explicitResistance ?? candidate.resistance }) === exerciseIdentity(candidate)) return 4;
    if (movementFamilyFor(source) !== candidate.family || (explicitResistance && explicitResistance !== candidate.resistance)) return 0;
    if (candidate.family === 'vertical-pull') {
      const supinated = value => /\b(chinups?|chin ups?|supinad[oa]|supinated|underhand)\b/.test(normalize(value));
      if (supinated(source.name) !== supinated(candidate.name)) return 0;
    }
    return 2;
  }));
  const available = [...sorted].sort((a, b) => referenceMatch(b) - referenceMatch(a)
    || (modelOrder.get(a.id) ?? 100) - (modelOrder.get(b.id) ?? 100));
  function add(candidate) {
    if (selected.length === count || identities.has(exerciseIdentity(candidate))) return;
    const entry = exercises.find(item => item.exerciseId === candidate.id) ?? baseline(candidate);
    if (!compositionAllowed([...selected, entry], input)) return;
    selected.push(entry);
    identities.add(exerciseIdentity(candidate));
  }
  for (const { family, count: required } of profile.requirements) {
    for (const candidate of available) {
      if (selected.filter(entry => profile.matches(input.exercises.find(item => item.id === entry.exerciseId), family)).length >= required) break;
      if (profile.matches(candidate, family)) add(candidate);
    }
  }
  for (const candidate of available) add(candidate);
  assert(selected.length === count, 'PLAN_COMPOSITION_UNAVAILABLE', 422);
  const anchors = new Set(selected.slice(0, Math.min(2, profile.requirements.length)).map(item => item.exerciseId));
  const major = new Set(['chest-press', 'overhead-press', 'row', 'vertical-pull', 'squat', 'lunge', 'leg-press', 'hinge', 'hip-extension']);
  const rank = entry => {
    const candidate = input.exercises.find(item => item.id === entry.exerciseId);
    if (anchors.has(entry.exerciseId)) return 0;
    if (major.has(candidate.family)) return 1;
    if (['biceps-curl', 'triceps-extension'].includes(candidate.family)) return 3;
    if (candidate.family?.startsWith('core-') || ['calves', 'forearms'].includes(candidate.muscle)) return 4;
    return 2;
  };
  return selected.sort((a, b) => rank(a) - rank(b));
}

export function weekInput(value, focus, exercises) {
  if (value === undefined) return undefined;
  assert(value && Object.hasOwn(roles, value.role) && integer(value.variant, 0, 6)
    && Array.isArray(value.previous) && value.previous.length === value.variant);
  const expectedFocus = value.role === 'full' ? 'full' : ['lower', 'legs'].includes(value.role) ? 'lower' : 'upper';
  assert(focus === expectedFocus && exercises.every(exercise => allowsCoachRole(exercise, value.role)));
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
  if (!input.week) return { exercises: input.trainingLevel ? balancedSelection(exercises, input, baseline, input.exercises) : exercises };
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
  const selected = input.trainingLevel ? balancedSelection(exercises, input, baseline, sorted) : [];
  const minimumCount = input.trainingLevel ? exercises.length : Math.min(3, exercises.length);
  const keys = new Set(selected.map(({ exerciseId }) => identity(exerciseId)));
  const families = new Set(selected.map(({ exerciseId }) => byId.get(exerciseId).family).filter(Boolean));

  function add(candidate) {
    if (!candidate || keys.has(identity(candidate.id))) return;
    selected.push(exercises.find(({ exerciseId }) => exerciseId === candidate.id) ?? baseline(candidate));
    keys.add(identity(candidate.id));
    if (candidate.family) families.add(candidate.family);
  }

  if (!input.trainingLevel) for (const family of preferred) add(sorted.find((candidate) => candidate.family === family));
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
        if (input.trainingLevel) {
          if (!compositionAllowed(replacement, input)) continue;
          const profile = compositionProfile(input, replacement.length);
          if (profile.requirements.some(({ family, count }) => replacement.filter(item => profile.matches(byId.get(item.exerciseId), family)).length < count)) continue;
        }
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

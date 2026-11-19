import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoach } from '../src/coach.mjs';
import { exerciseIdentity } from '../src/week-programming.mjs';

const upper = [
  { id: 'bench', name: 'Bench press', muscle: 'chest', family: 'chest-press', resistance: 'halter' },
  { id: 'row', name: 'Bent-over row', muscle: 'back', family: 'row', resistance: 'halter' },
  { id: 'curl', name: 'Biceps curl', muscle: 'biceps', family: 'biceps-curl', resistance: 'halter' },
  { id: 'ohp', name: 'Overhead press', muscle: 'shoulders', family: 'overhead-press', resistance: 'halter' },
  { id: 'pullup', name: 'Pull-up', muscle: 'back', family: 'vertical-pull', resistance: 'barra fixa' },
  { id: 'alias', name: 'Supino com Halter', muscle: 'chest', family: 'chest-press', resistance: 'halter' },
];
const lower = [
  { id: 'squat', name: 'Goblet squat', muscle: 'quads', family: 'squat', resistance: 'halter' },
  { id: 'lunge', name: 'Reverse lunge', muscle: 'quads', family: 'lunge', resistance: 'halter' },
  { id: 'calf', name: 'Calf raise', muscle: 'calves', resistance: 'peso corporal' },
  { id: 'hinge', name: 'Romanian deadlift', muscle: 'glutes', family: 'hinge', resistance: 'halter' },
  { id: 'bridge', name: 'Glute bridge', muscle: 'glutes', family: 'hip-extension', resistance: 'peso corporal' },
];
const inputFor = (exercises, role, previous = []) => ({
  model: 'fixture', goal: 'muscle', venue: 'home', focus: role, minutes: 40, exercises,
  week: { role, variant: previous.length, previous: previous.map(({ exercises }) => ({ exercises })) },
});
function constantProvider(exercises, id = 'fixture') {
  return createCoach({
    id,
    async listModels() { return { models: ['fixture'], available: true }; },
    async generate(_model, _system, input) {
      assert(input.week);
      return { name: 'Identical routine from model', summary: 'Three movements',
        exercises: exercises.slice(0, 3).map(({ id }) => ({ exerciseId: id, sets: 3, reps: 10, restSec: 60 })) };
    },
  });
}
const keys = (plan, catalog) => plan.exercises.map(({ exerciseId }) => exerciseIdentity(catalog.find(({ id }) => id === exerciseId))).sort();
const families = (plan, catalog) => plan.exercises.map(({ exerciseId }) => catalog.find(({ id }) => id === exerciseId).family);

test('every provider goes through A/B checks even when the model returns identical exercises', async () => {
  for (const provider of ['ollama', 'codex-cli', 'compatible']) {
    const coach = constantProvider(upper, provider);
    const a = await coach.plan(inputFor(upper, 'upper'));
    const b = await coach.plan(inputFor(upper, 'upper', [a]));
    assert.notDeepEqual(keys(a, upper), keys(b, upper), provider);
    assert(families(a, upper).includes('chest-press') && families(a, upper).includes('row'));
    assert(families(b, upper).includes('overhead-press') && families(b, upper).includes('vertical-pull'));
    assert.equal(b.week.variation, 'exercises');
    assert(b.week.changedExercises >= 2);
    assert(b.exercises.length <= 6 && b.estimatedMinutes <= 40);
  }
});

test('Lower B prioritizes hip movements while Lower A prioritizes knee movements', async () => {
  const coach = constantProvider(lower);
  const a = await coach.plan(inputFor(lower, 'lower'));
  const b = await coach.plan(inputFor(lower, 'lower', [a]));
  assert(families(a, lower).includes('squat'));
  assert(families(b, lower).includes('hinge'));
  assert(families(b, lower).includes('hip-extension'));
  assert.notDeepEqual(keys(a, lower), keys(b, lower));
});

test('catalog aliases do not count as variation and limited equipment has distinct prescriptions', async () => {
  const limited = upper.slice(0, 3).concat(upper.at(-1));
  const coach = constantProvider(limited);
  const prior = [];
  const signatures = new Set();
  for (let variant = 0; variant < 7; variant++) {
    const plan = await coach.plan({ ...inputFor(limited, 'upper', prior), minutes: 15, goal: 'strength' });
    const signature = plan.exercises.map(({ exerciseId, sets, reps, restSec }) => [
      exerciseIdentity(limited.find(({ id }) => id === exerciseId)), sets, reps, restSec,
    ].join('|')).sort().join('\n');
    assert(!signatures.has(signature), 'seven sessions must not repeat the exact prescription');
    signatures.add(signature);
    assert(plan.exercises.every(({ reps, sets }) => reps >= 4 && reps <= 8 && sets <= 3));
    assert(plan.estimatedMinutes <= 15);
    if (variant) assert.equal(plan.week.variation, 'prescription');
    prior.push(plan);
  }
});

test('a weekly role cannot include muscles from another role or an inconsistent variant index', async () => {
  const coach = constantProvider(upper);
  await assert.rejects(coach.plan(inputFor([...upper, ...lower], 'upper')));
  await assert.rejects(coach.plan({ ...inputFor(upper, 'upper'), week: { role: 'upper', variant: 1, previous: [] } }));
  await assert.rejects(coach.plan({ ...inputFor(upper, 'upper'), focus: 'lower' }));
});

const allMovements = [...upper, ...lower,
  { id: 'triceps', name: 'Triceps extension', muscle: 'triceps', family: 'triceps-extension', resistance: 'halter' },
  { id: 'fly', name: 'Chest fly', muscle: 'chest', family: 'chest-fly', resistance: 'halter' },
  { id: 'cable-row', name: 'Cable row', muscle: 'back', family: 'row', resistance: 'polia' },
];
const roleMuscles = {
  upper: ['chest', 'back', 'lats', 'shoulders', 'biceps', 'triceps', 'forearms', 'traps'],
  lower: ['quads', 'hamstrings', 'glutes', 'calves'],
  full: [...new Set(allMovements.map(({ muscle }) => muscle))],
  push: ['chest', 'shoulders', 'triceps'],
  pull: ['back', 'lats', 'biceps', 'forearms', 'traps'],
  legs: ['quads', 'hamstrings', 'glutes', 'calves'],
};
const splits = {
  'upper-lower': ['upper', 'lower', 'upper', 'lower', 'upper'],
  'upper-lower-cardio': ['upper', 'lower', 'cardio', 'upper', 'lower'],
  'full-body': ['full', 'full', 'full', 'full', 'full'],
  'push-pull-legs': ['push', 'pull', 'legs', 'push', 'pull', 'legs'],
};

for (const [split, sequence] of Object.entries(splits)) {
  test(split + ' varies every repeated role while the model keeps the same choices', async () => {
    const previous = new Map();
    let calls = 0;
    for (const role of sequence) {
      if (role === 'cardio') continue;
      const catalog = allMovements.filter(({ muscle }) => roleMuscles[role].includes(muscle));
      const coach = constantProvider(catalog);
      const prior = previous.get(role) ?? [];
      const focus = ['lower', 'legs'].includes(role) ? 'lower' : role === 'full' ? 'full' : 'upper';
      const result = await coach.plan({ ...inputFor(catalog, role, prior), focus });
      calls++;
      assert.equal(result.week.variant, prior.length);
      assert(result.exercises.every(({ exerciseId }) => roleMuscles[role].includes(catalog.find(({ id }) => id === exerciseId).muscle)));
      assert(result.estimatedMinutes <= 40);
      for (const session of prior) assert.notDeepEqual(keys(result, catalog), keys(session, catalog), role);
      if (prior.length) assert.equal(result.week.variation, 'exercises');
      if (role === 'full') {
        assert(result.exercises.some(({ exerciseId }) => lower.some(({ id }) => id === exerciseId)));
        assert(result.exercises.some(({ exerciseId }) => upper.some(({ id }) => id === exerciseId)));
      }
      previous.set(role, [...prior, result]);
    }
    assert.equal(calls, sequence.filter((role) => role !== 'cardio').length);
  });
}

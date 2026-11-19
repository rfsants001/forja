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

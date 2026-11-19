import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoach } from '../src/coach.mjs';
import { eligiblePlanExercises, matchesPlanRole, planCandidates } from '../../web/src/lib/coach-catalog.ts';
import { SEED_EXERCISES } from '../../web/src/db/seed-exercises.ts';
import { movementFamilyFor, movementIdentity } from '../../../packages/core/src/coach-movements.ts';

const inventory = [
  { id: 'bar', name: 'barra fixa', quantity: 1 }, { id: 'ez', name: 'barra W', quantity: 1 },
  { id: 'db', name: 'barra de haltere (haltere customizado com anilhas)', quantity: 2 },
  ...[3, 4, 5, 10].map(weight => ({ id: 'plate-' + weight, name: 'anilhas', quantity: weight === 10 ? 2 : 4, unitWeightKg: weight })),
  { id: 'pushup', name: 'suporte para flexão', quantity: 2 },
];
const candidates = role => planCandidates(eligiblePlanExercises(SEED_EXERCISES, inventory,
  role === 'legs' ? 'full' : 'upper', true, 'home', 'advanced').filter(exercise => matchesPlanRole(exercise, role)),
inventory.map(({ name }) => name), [], undefined, true);
const source = [
  { name: 'Terra romeno barra W', sets: 4, reps: '8–10' },
  { name: 'Elevação pélvica', sets: 4, reps: '12–15' },
  { name: 'Bulgarian split squat', sets: 3, reps: '10–12' },
  { name: 'Afundo andando com halter', sets: 3, reps: '12' },
  { name: 'Leg curl deslizante', sets: 3, reps: '12' },
  { name: 'Panturrilha unilateral', sets: 3, reps: '15–20' },
  { name: 'Hollow body rocks', sets: 4, reps: '15' },
  { name: 'Russian twist com anilha', sets: 3, reps: '20' },
];
const badNames = {
  pull: ['Remada curvada com barra W', 'Pull-up com pegada larga', 'Pullover no chão com halter', 'Crucifixo inverso com halteres',
    'Encolhimento com halteres', 'Rosca martelo com halter', 'Extensão de punho com halter', 'Flexão de punho com halter'],
  push: ['Supino com halteres no chão', 'Desenvolvimento com halteres em pé', 'Crucifixo com halteres no chão',
    'Elevação lateral com halter em pé', 'Tríceps testa no chão com barra W', 'Elevação frontal com anilha', 'dumbbell lateral raise'],
  legs: ['Agachamento goblet com halter', 'Afundo reverso com halter', 'Terra romeno com barra W', 'Ponte de glúteo no chão com anilha',
    'Panturrilha unilateral com halter', 'Panturrilha em pé com halter', 'dumbbell standing calf raise', 'bodyweight standing calf raise'],
};

for (const provider of ['ollama', 'codex-cli', 'compatible']) {
  test(provider + ': rebuilds the reported PPL composition without padding calves, forearms or translated aliases', async () => {
    const coach = createCoach({ id: provider, async listModels() { return { available: true, models: ['fixture'] }; },
      async generate(_model, _system, input) {
        const choices = badNames[input.week.role].map(name => input.exercises.find(item => item.name === name)).filter(Boolean);
        return { name: 'Sample', summary: 'Original model output', exercises: choices.map(({ id }) => ({ exerciseId: id, sets: 3, reps: 12, restSec: 90 })) };
      },
    });
    const prior = new Map();
    for (const role of ['pull', 'push', 'legs', 'pull', 'push', 'legs']) {
      const pool = candidates(role);
      // Simulate an older client that still sends translated aliases without family metadata.
      if (role === 'push') pool.push({ id: 'alias-lateral', name: 'dumbbell lateral raise', muscle: 'shoulders', resistance: 'halter' });
      if (role === 'legs') pool.push({ id: 'alias-calf', name: 'dumbbell standing calf raise', muscle: 'calves', resistance: 'halter' },
        { id: 'bodyweight-calf', name: 'bodyweight standing calf raise', muscle: 'calves', resistance: 'peso corporal' });
      const previous = prior.get(role) ?? [];
      const result = await coach.plan({ model: 'fixture', goal: 'muscle', venue: 'home', trainingLevel: 'advanced', minutes: 90,
        focus: role === 'legs' ? 'lower' : 'upper', exercises: pool,
        week: { role, variant: previous.length, previous },
        ...(role === 'legs' && previous.length ? { reference: { kind: 'prescribed', exercises: source } } : {}),
        ...(role === 'pull' && previous.length ? { reference: { kind: 'prescribed', exercises: [{ name: 'Chin-up pegada fechada', sets: 3, reps: '6' }] } } : {}),
      });
      const selected = result.exercises.map(entry => ({ ...pool.find(item => item.id === entry.exerciseId), ...entry }));
      const families = selected.map(movementFamilyFor);
      assert.equal(selected.length, 8);
      assert.equal(new Set(selected.map(movementIdentity)).size, 8);
      assert(selected.filter(item => item.muscle === 'calves').length <= 2);
      assert(selected.filter(item => item.muscle === 'forearms').length <= 1);
      if (role === 'push') {
        assert(!families.includes('rear-delt-fly'));
        assert.equal(families.filter(f => f === 'lateral-raise').length, 1);
        assert.equal(families.filter(f => f === 'triceps-extension').length, 2);
      }
      if (role === 'pull') assert.equal(families.filter(f => f === 'biceps-curl').length, 2);
      if (role === 'pull' && previous.length) assert.match(selected[0].name, /Chin-up/);
      if (role === 'legs' && previous.length) {
        assert.equal(families.filter(f => f?.startsWith('core-')).length, 2);
        assert.equal(selected.filter(item => item.muscle === 'calves').length, 1);
        assert.equal(result.referenceComparison.setsBefore, 27);
        assert.equal(result.referenceComparison.setsAfter, result.exercises.reduce((sum, item) => sum + item.sets, 0));
        assert.deepEqual(result.referenceComparison.unavailableExamples, ['Leg curl deslizante']);
      }
      if (role === 'legs' && !previous.length) assert(!families.some(f => f?.startsWith('core-')));
      prior.set(role, [...previous, { exercises: result.exercises }]);
    }
  });
}

test('valid same-family variants retain the model’s prescription instead of being reset to minimal defaults', async () => {
  const pool = candidates('pull');
  const names = ['Remada curvada com barra W', 'Pull-up com pegada larga', 'Remada unilateral com halter em pé',
    'Crucifixo inverso com halteres', 'Encolhimento com halteres', 'Rosca direta com barra W', 'Rosca martelo com halter', 'Pullover no chão com halter'];
  const choices = names.map(name => pool.find(item => item.name === name));
  assert(choices.every(Boolean));
  const coach = createCoach({ id: 'fixture', async listModels() { return { available: true, models: ['fixture'] }; },
    async generate() { return { name: 'Sample', summary: 'Valid prescription',
      exercises: choices.map(({ id }) => ({ exerciseId: id, sets: 4, reps: 10, restSec: 90 })) }; },
  });
  const plan = await coach.plan({ model: 'fixture', goal: 'muscle', venue: 'home', trainingLevel: 'advanced', minutes: 90,
    focus: 'upper', exercises: pool, week: { role: 'pull', variant: 0, previous: [] } });
  assert(plan.exercises.every(({ sets, reps }) => sets === 4 && reps === 10));
});

test('duration counts both sides in unilateral work and the rest between exercises', async () => {
  async function plan(unilateral, minutes = 90) {
    const pool = [
      { id: 'press', name: 'Dumbbell bench press', muscle: 'chest', resistance: 'halter' },
      { id: 'row', name: unilateral ? 'One-arm row' : 'Dumbbell row', muscle: 'back', resistance: 'halter' },
      { id: 'squat', name: 'Goblet squat', muscle: 'quads', resistance: 'halter' },
      { id: 'calf', name: 'Standing calf raise', muscle: 'calves', resistance: 'halter' },
    ];
    const coach = createCoach({ id: 'fixture', async listModels() { return { available: true, models: ['fixture'] }; },
      async generate() { return { name: 'Timing', summary: 'Fixture', exercises: pool.map(({ id }) => ({ exerciseId: id, sets: 2, reps: 10, restSec: 120 })) }; },
    });
    return coach.plan({ model: 'fixture', goal: 'general', venue: 'gym', trainingLevel: 'beginner', focus: 'full', minutes, exercises: pool });
  }
  assert.equal((await plan(false)).estimatedMinutes, 23);
  assert.equal((await plan(true)).estimatedMinutes, 24);
  await assert.rejects(plan(false, 20), { code: 'SESSION_DURATION_TOO_SHORT' });
});

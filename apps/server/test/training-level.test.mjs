import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCoach } from '../src/coach.mjs';
import { exerciseIdentity } from '../src/week-programming.mjs';

const catalog = [
  ['bench', 'Bench press', 'chest', 'chest-press'],
  ['incline', 'Incline press', 'chest', 'chest-press'],
  ['row', 'Dumbbell row', 'back', 'row'],
  ['pullup', 'Pull-up', 'back', 'vertical-pull'],
  ['curl', 'Biceps curl', 'biceps', 'biceps-curl'],
  ['ohp', 'Overhead press', 'shoulders', 'overhead-press'],
  ['triceps', 'Triceps extension', 'triceps', 'triceps-extension'],
  ['fly', 'Chest fly', 'chest', 'chest-fly'],
  ['squat', 'Squat', 'quads', 'squat'],
  ['hinge', 'Romanian deadlift', 'hamstrings', 'hinge'],
  ['calf', 'Standing calf raise', 'calves'],
].map(([id, name, muscle, family]) => ({ id, name, muscle, family, resistance: 'halter' }));

const input = { model: 'fixture', goal: 'muscle', venue: 'gym', focus: 'full', minutes: 60, exercises: catalog };
function fixture(id, choose = (input) => input.exercises.slice(0, 3)) {
  return createCoach({ id,
    async listModels() { return { available: true, models: ['fixture'] }; },
    async generate(_model, system, input) {
      assert.match(system, /exatamente (4|6|8)/);
      assert(input.trainingLevel);
      return { name: 'Level fixture', summary: 'Test session',
        exercises: choose(input).map(({ id }) => ({ exerciseId: id, sets: 3, reps: 10, restSec: 120 })) };
    },
  });
}

for (const provider of ['ollama', 'codex-cli', 'compatible']) {
  for (const [trainingLevel, count] of [['beginner', 4], ['intermediate', 6], ['advanced', 8]]) {
    test(provider + ': ' + trainingLevel + ' keeps exactly ' + count + ' distinct exercises despite a short model answer', async () => {
      const coach = fixture(provider);
      const plan = await coach.plan({ ...input, trainingLevel });
      assert.equal(plan.exercises.length, count);
      const identities = plan.exercises.map(({ exerciseId }) => exerciseIdentity(catalog.find(({ id }) => id === exerciseId)));
      assert.equal(new Set(identities).size, count);
      assert(plan.estimatedMinutes <= input.minutes);
      assert(plan.exercises.every(({ sets }) => sets >= 2));
    });
  }
}

test('advanced weekly sessions keep eight exercises through A/B programming and accept eight previous exercises', async () => {
  const coach = fixture('fixture');
  const previous = [];
  for (let variant = 0; variant < 3; variant++) {
    const plan = await coach.plan({ ...input, trainingLevel: 'advanced',
      week: { role: 'full', variant, previous } });
    assert.equal(plan.exercises.length, 8);
    assert(plan.estimatedMinutes <= 60);
    previous.push({ exercises: plan.exercises });
  }
});

test('level presets trim an excessive answer and supplement even a one-exercise answer', async () => {
  const excessive = await fixture('fixture', (input) => input.exercises.slice(0, 8)).plan({ ...input, trainingLevel: 'beginner' });
  const short = await fixture('fixture', (input) => input.exercises.slice(0, 1)).plan({ ...input, trainingLevel: 'advanced' });
  assert.equal(excessive.exercises.length, 4);
  assert.equal(short.exercises.length, 8);
});

test('catalog aliases cannot fill a level and an infeasible level fails before calling the model', async () => {
  let called = false;
  const coach = createCoach({ id: 'fixture', async listModels() { called = true; return {}; } });
  const aliases = Array.from({ length: 8 }, (_, i) => ({ ...catalog[0], id: 'alias-' + i }));
  await assert.rejects(coach.plan({ ...input, trainingLevel: 'advanced', exercises: aliases }), { code: 'PLAN_EXERCISE_COUNT_UNAVAILABLE' });
  assert.equal(called, false);
  await assert.rejects(coach.plan({ ...input, trainingLevel: 'expert' }), { code: 'INVALID_DATA' });
});

test('a short duration never silently reduces the exercise count or collapses the level to single sets', async () => {
  const coach = fixture('fixture', (input) => input.exercises.slice(0, 8));
  await assert.rejects(coach.plan({ ...input, minutes: 15, trainingLevel: 'advanced' }), { code: 'SESSION_DURATION_TOO_SHORT' });
});

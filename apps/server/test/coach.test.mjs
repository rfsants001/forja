import assert from 'node:assert/strict';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createCoach } from '../src/coach.mjs';
import { codexCliProvider } from '../src/providers/codex-cli.mjs';
import { resolveProvider } from '../src/providers/index.mjs';

const example = {
  model: 'default', goal: 'general', focus: 'full', minutes: 40, lang: 'en', notes: 'private',
  exercises: ['a', 'b', 'c'].map((id) => ({ id, name: 'Fixture ' + id, muscle: 'quads', note: 'private' })),
};
const result = {
  name: 'Sample workout', summary: 'Three movements',
  exercises: example.exercises.map(({ id }) => ({ exerciseId: id, sets: 3, reps: 8, restSec: 60 })),
};

test('select an explicit provider; Ollama remains the default', () => {
  assert.equal(resolveProvider({}).id, 'ollama');
  assert.equal(resolveProvider({ FORJA_COACH_PROVIDER: 'codex-cli' }).id, 'codex-cli');
  assert.throws(() => resolveProvider({ FORJA_COACH_PROVIDER: 'claude-cli' }), /ollama ou codex-cli/);
});

test('Codex CLI workout uses a private ChatGPT login and a bounded structured invocation', { skip: process.platform !== 'linux' }, async (t) => {
  const home = await mkdtemp(join(tmpdir(), 'forja-coach-fixture-'));
  t.after(() => rm(home, { force: true, recursive: true }));
  const auth = join(home, 'auth.json');
  let response = JSON.stringify(result);
  let authenticated = true;
  const provider = codexCliProvider({
    binary: process.execPath, home,
    run: async ({ argv, prompt, schema, signal }) => {
      assert(argv.includes('forced_login_method="chatgpt"'));
      if (argv.includes('status')) return authenticated ? 'Logged in using ChatGPT' : 'Logged in using an API key';
      assert.equal(argv.at(-1), '-');
      assert(argv.includes('read-only') && argv.includes('shell_tool') && argv.includes('--ephemeral'));
      assert(!argv.some((arg) => arg.includes('Fixture a')));
      assert(prompt.includes('English') && prompt.includes('Fixture a'));
      assert(!prompt.includes('private'));
      assert.equal(schema.required.includes('exercises'), true);
      assert(signal instanceof AbortSignal);
      return response;
    },
  });
  assert.equal((await provider.listModels()).reason, 'CODEX_LOGIN_REQUIRED');
  await writeFile(auth, '{}', { mode: 0o600 });
  authenticated = false;
  assert.equal((await provider.listModels()).reason, 'CODEX_LOGIN_REQUIRED');
  authenticated = true;
  const coach = createCoach(provider);
  const signal = new AbortController().signal;
  assert.deepEqual(await coach.plan(example, signal), result);
  response = 'invalid';
  await assert.rejects(coach.plan(example, signal), { code: 'INVALID_PROVIDER_RESPONSE' });
  response = JSON.stringify({ ...result, exercises: [{ ...result.exercises[0], exerciseId: 'unknown' }, ...result.exercises.slice(1)] });
  await assert.rejects(coach.plan(example, signal), { code: 'INVALID_PROVIDER_RESPONSE' });
  response = JSON.stringify({ ...result, exercises: [result.exercises[0], result.exercises[0], result.exercises[1]] });
  await assert.rejects(coach.plan(example, signal), { code: 'INVALID_PROVIDER_RESPONSE' });
  await chmod(auth, 0o644);
  assert.equal((await provider.listModels()).reason, 'CODEX_LOGIN_REQUIRED');
});

test('use a bounded previous workout summary and enforce the goal and duration', async () => {
  const candidates = [
    { id: 'fly', name: 'Dumbbell fly', muscle: 'chest', family: 'chest-fly', resistance: 'halter' },
    { id: 'pec', name: 'Pec deck', muscle: 'chest', family: 'chest-fly', resistance: 'maquina' },
    { id: 'cross', name: 'Cable crossover', muscle: 'chest', family: 'chest-fly', resistance: 'polia' },
    { id: 'squat', name: 'Goblet squat', muscle: 'quads', family: 'squat', resistance: 'halter' },
    { id: 'press', name: 'Bench press', muscle: 'chest', family: 'chest-press', resistance: 'barra' },
  ];
  const coach = createCoach({
    id: 'fixture',
    async listModels() { return { available: true, models: ['default'] }; },
    async generate(model, system, input) {
      assert.match(system, /ACSM 2026/);
      assert.deepEqual(input.reference, { kind: 'prescribed', exercises: [
        { name: 'Goblet squat', sets: 3, reps: '8–10', loadKg: 20 },
        { name: 'Dead hang', sets: 3, reps: undefined, loadKg: undefined, seconds: 25 },
      ] });
      assert(!JSON.stringify(input).includes('private'));
      return {
        name: 'Sample', summary: 'Training session',
        exercises: candidates.slice(0, 3).map(({ id }) => ({ exerciseId: id, sets: 5, reps: 20, restSec: 30 })),
      };
    },
  });
  const output = await coach.plan({
    ...example, venue: 'gym', goal: 'strength', minutes: 15, exercises: candidates,
    reference: { kind: 'prescribed', filename: 'private.csv', notes: 'private', exercises: [
      { name: 'Goblet squat', sets: 3, reps: '8–10', loadKg: 20, note: 'private' },
      { name: 'Dead hang', sets: 3, seconds: 25 },
    ] },
  });
  assert(output.estimatedMinutes <= 15);
  assert(output.exercises.every(({ sets, reps }) => sets <= 3 && reps <= 8));
  assert.equal(output.exercises.filter(({ exerciseId }) => ['fly', 'pec', 'cross'].includes(exerciseId)).length, 1);
  assert(output.exercises.some(({ exerciseId }) => exerciseId === 'squat'));
  assert(output.exercises.some(({ exerciseId }) => exerciseId === 'press'));
  assert.notEqual(output.exercises[0].exerciseId, 'fly');
});

test('fit cardio and strength into a weight-loss session while forwarding only relevant profile data', async () => {
  const inventory = [
    { name: 'Weight plates', quantity: 4, unitWeightKg: 5, note: 'private' },
    { name: 'Weight plates', quantity: 2, unitWeightKg: 10 },
    { name: 'Treadmill', quantity: 1 },
  ];
  const cardioCandidates = [{ id: 'treadmill', name: 'Treadmill' }, { id: 'walk', name: 'Walk' }];
  let received;
  let cardioExerciseId = 'treadmill';
  const coach = createCoach({
    id: 'fixture',
    async listModels() { return { available: true, models: ['default'] }; },
    async generate(_model, _system, input, schema) {
      received = JSON.parse(JSON.stringify(input));
      assert.equal(schema.required.includes('cardioExerciseId'), input.goal === 'weight-loss');
      return { ...result, cardioExerciseId, exercises: result.exercises.map((item) => ({ ...item, sets: 4, reps: 15 })) };
    },
  });
  const input = { ...example, goal: 'weight-loss', venue: 'home', minutes: 16, inventory, cardioCandidates,
    weightGoal: { currentKg: 88, targetKg: 80, history: 'private' } };
  const session = await coach.plan(input);
  assert.deepEqual(received.weightGoal, { currentKg: 88, targetKg: 80 });
  assert.deepEqual(received.inventory[0], { name: 'Weight plates', quantity: 4, unitWeightKg: 5 });
  assert.deepEqual(received.inventory[1], inventory[1]);
  assert.deepEqual(session.cardio, { exerciseId: 'treadmill', seconds: 300 });
  assert.equal(session.estimatedMinutes, 16);
  await assert.rejects(coach.plan({ ...input, minutes: 15 }), { code: 'SESSION_DURATION_TOO_SHORT' });
  cardioExerciseId = 'unavailable';
  const withoutMachines = await coach.plan({ ...input, cardioCandidates: [cardioCandidates[1]] });
  assert.deepEqual(withoutMachines.cardio, { exerciseId: 'walk', seconds: 300 });
  const general = await coach.plan({ ...input, goal: 'general' });
  assert.equal(general.cardio, undefined);
  assert.equal(received.weightGoal, undefined);
  await assert.rejects(coach.plan({ ...input, inventory: [{ name: 'Weight plates', quantity: 0 }] }));
});

test('strength days in a weight-loss split do not require an aerobic candidate', async () => {
  const coach = createCoach({
    id: 'fixture',
    async listModels() { return { available: true, models: ['default'] }; },
    async generate(_model, _system, input, schema) {
      assert.deepEqual(input.weightGoal, { currentKg: 80, targetKg: 75 });
      assert.deepEqual(input.cardioCandidates, []);
      assert(!schema.required.includes('cardioExerciseId'));
      return result;
    },
  });
  const plan = await coach.plan({ ...example, venue: 'home', goal: 'weight-loss', includeCardio: false,
    weightGoal: { currentKg: 80, targetKg: 75 } });
  assert.equal(plan.cardio, undefined);
  assert.equal(plan.exercises.length, 3);
});

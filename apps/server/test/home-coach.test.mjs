import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEED_EXERCISES } from '../../web/src/db/seed-exercises.ts';
import { eligiblePlanExercises, matchesPlanRole, planCandidates } from '../../web/src/lib/coach-catalog.ts';
import { equipmentKey, exerciseRequirements, hasDumbbellPair, inventoryKeys, supportsEquipment } from '../../web/src/lib/equipment.ts';
import { isCoachWorkingExercise } from '../../../packages/core/src/coach-exercises.ts';
import { homeMovements, pairedDumbbellExercises } from '../../web/src/lib/home-exercises.ts';
import { createCoach } from '../src/coach.mjs';
import { exerciseIdentity } from '../src/week-programming.mjs';

test('movement families preserve genuine grip, support and exercise variants', () => {
  const key = (name, family = 'biceps-curl') => exerciseIdentity({ name, family, resistance: 'halter' });
  const curls = ['Rosca direta', 'Rosca martelo', 'Rosca inversa', 'Rosca concentrada', 'Rosca Scott'];
  assert.equal(new Set(curls.map(name => key(name))).size, curls.length);
  assert.equal(key('Rosca martelo'), key('Hammer curl'));
  assert.equal(key('Rosca martelo'), key('Rosca martelo pesada com pausa no topo'));
  assert.equal(key('Rosca direta'), key('Dumbbell biceps curl'));
  assert.notEqual(key('Pull-up pegada larga', 'vertical-pull'), key('Chin-up pegada supinada', 'vertical-pull'));
  assert.notEqual(key('Desenvolvimento Arnold', 'overhead-press'), key('Desenvolvimento com halteres', 'overhead-press'));
  assert.notEqual(key('Afundo lateral', 'lunge'), key('Afundo reverso', 'lunge'));
  assert.equal(key('Supino com halter', 'chest-press'), key('Dumbbell bench press', 'chest-press'));
});

const inventory = [
  { id: 'dumbbells', name: 'barra de haltere (haltere customizado com anilhas)', quantity: 2 },
  { id: 'ez', name: 'Barra W', quantity: 1 },
  { id: 'pullup', name: 'Barra fixa', quantity: 1 },
  { id: 'plates-3', name: 'Anilhas', quantity: 4, unitWeightKg: 3 },
  { id: 'plates-4', name: 'Anilhas', quantity: 4, unitWeightKg: 4 },
  { id: 'plates-5', name: 'Anilhas', quantity: 4, unitWeightKg: 5 },
  { id: 'plates-10', name: 'Anilhas', quantity: 2, unitWeightKg: 10 },
  { id: 'handles', name: 'suporte para flexão', quantity: 2 },
];
const names = inventory.map(({ name }) => name);
const available = inventoryKeys(names);
const catalog = SEED_EXERCISES.map(exercise => ({ ...exercise, createdAt: 0, updatedAt: 0 }));
const candidates = (role) => {
  const focus = role === 'legs' ? 'lower' : 'upper';
  const eligible = eligiblePlanExercises(catalog, inventory, focus, true, 'home', 'advanced').filter(exercise => matchesPlanRole(exercise, role));
  assert(eligible.every(exercise => supportsEquipment(exerciseRequirements(exercise), available)));
  return planCandidates(eligible, names, [], undefined, true);
};

for (const id of ['ollama', 'codex-cli', 'compatible']) {
  test(id + ': advanced home Pull/Push/Legs A/B retains eight exercises with dumbbells, EZ bar, pull-up bar and plates', async () => {
    const coach = createCoach({ id,
      async listModels() { return { available: true, models: ['fixture'] }; },
      async generate(_model, _system, input) {
        assert(input.exercises.every(exercise => isCoachWorkingExercise(exercise, 'advanced')));
        return { name: 'Home workout', summary: 'A stale model explanation of the initial order',
          exercises: input.exercises.slice(0, 3).map(({ id }) => ({ exerciseId: id, sets: 3, reps: 8, restSec: 90 })) };
      },
    });
    const prior = new Map();
    for (const role of ['pull', 'push', 'legs', 'pull', 'push', 'legs']) {
      const previous = prior.get(role) ?? [];
      const exercises = candidates(role);
      const plan = await coach.plan({ model: 'fixture', goal: 'muscle', venue: 'home', trainingLevel: 'advanced',
        focus: role === 'legs' ? 'lower' : 'upper', minutes: 75, exercises,
        week: { role, variant: previous.length, previous } });
      assert.equal(plan.exercises.length, 8);
      const first = exercises.find(({ id }) => id === plan.exercises[0].exerciseId);
      assert(plan.summary.startsWith('Comece por ' + first.name + '.'));
      assert(!plan.summary.includes('stale model explanation'));
      if (role === 'pull') {
        const families = plan.exercises.map(({ exerciseId }) => exercises.find(({ id }) => id === exerciseId).family);
        assert(families.includes('row') && families.includes('vertical-pull'));
      }
      if(previous.length)assert.notDeepEqual(plan.exercises.map(e=>e.exerciseId).sort(),previous[0].exercises.map(e=>e.exerciseId).sort());
      assert.equal(new Set(plan.exercises.map(({ exerciseId }) => exerciseIdentity(exercises.find(({ id }) => id === exerciseId)))).size, 8);
      assert(plan.estimatedMinutes <= 75);
      prior.set(role, [...previous, { exercises: plan.exercises }]);
    }
  });
}

test('pull admits rear delts without admitting shoulder presses', async () => {
  const coach = createCoach({ id: 'fixture', async listModels() { throw new Error('must not call model'); } });
  await assert.rejects(coach.plan({ model: 'fixture', goal: 'muscle', venue: 'home', trainingLevel: 'advanced',
    focus: 'upper', minutes: 75, exercises: [...candidates('pull'), candidates('push').find(({ family }) => family === 'overhead-press')],
    week: { role: 'pull', variant: 0, previous: [] } }), { code: 'INVALID_DATA' });
});

test('the user’s adjustable dumbbell handles and push-up supports are recognized without renaming', () => {
  assert.equal(equipmentKey(inventory[0].name), 'halter');
  assert.equal(equipmentKey('barra de haltere'), 'halter');
  assert.equal(equipmentKey('suporte para flexão'), 'apoio de flexao');
  assert(hasDumbbellPair(inventory));
  assert(available.has('halter') && available.has('apoio de flexao'));
  assert.equal(equipmentKey('barra W'), 'barra ez');
  const customCurl = { ...homeMovements.get('home-dumbbell-curl'), name: 'Rosca com barra de haltere', equipment: ['barra de haltere'] };
  assert.deepEqual(exerciseRequirements(customCurl), ['halter']);
  const noPlates = inventory.filter(item => equipmentKey(item.name) !== 'anilha');
  assert(!inventoryKeys(noPlates.map(({ name }) => name)).has('halter'));
  assert(!hasDumbbellPair(noPlates));
});

test('unassisted pull-up aliases do not become extra exercises by switching equipment labels', () => {
  assert.equal(exerciseIdentity({ name: 'Barra Fixa (Puxada)', family: 'vertical-pull', resistance: 'barra fixa' }),
    exerciseIdentity({ name: 'pull-up', family: 'vertical-pull', resistance: 'peso corporal' }));
});

test('the real home catalog filter respects inventory quantities and absent fixtures', () => {
  const single = inventory.map(item => item.id === 'dumbbells' ? { ...item, quantity: 1 } : item);
  assert.equal(hasDumbbellPair(single), false);
  const eligible = eligiblePlanExercises(catalog, single, 'full', true, 'home');
  assert(eligible.length > 0);
  assert(eligible.every(exercise => !pairedDumbbellExercises.has(exercise.id)));
  assert(eligible.every(exercise => !exerciseRequirements(exercise).some(key => ['banco', 'banco inclinado', 'rack', 'barra reta', 'polia', 'maquina'].includes(key))));
  const withoutBar = single.filter(item => item.id !== 'pullup');
  assert(eligiblePlanExercises(catalog, withoutBar, 'upper', true, 'home').every(exercise => !exerciseRequirements(exercise).includes('barra fixa')));
  assert(matchesPlanRole(homeMovements.get('home-rear-delt-fly'), 'pull'));
  assert(!matchesPlanRole(homeMovements.get('home-dumbbell-press'), 'pull'));
});

import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { adminKey } from '../src/devices.mjs';
import { createStore } from '../src/storage.mjs';
import { createForjaServer } from '../src/index.mjs';

const origin = 'http://127.0.0.1';
const directory = await mkdtemp(join(tmpdir(), 'forja-integration-'));
const fakeOllama = createServer(async (incoming, response) => {
  response.setHeader('Content-Type', 'application/json');
  if (incoming.url === '/api/tags') {
    response.end(JSON.stringify({ models: [{ name: 'fixture:1' }, { name: 'x:cloud', remote_host: 'https://example.com' }] }));
    return;
  }
  let input = '';
  for await (const chunk of incoming) input += chunk;
  const { messages } = JSON.parse(input);
  assert(!input.includes('nota da sessão'));
  const { candidates } = JSON.parse(messages[1].content);
  const suggestions = candidates?.length ? [
    { ...candidates[0], kind: 'replaceExercise', reason: 'Fixture' },
    { ...candidates[0], toId: 'invalid', kind: 'replaceExercise', reason: 'Fixture invalid' },
  ] : [];
  response.end(JSON.stringify({ message: { content: JSON.stringify({ summary: 'Revisão de teste.', suggestions }) } }));
});
fakeOllama.listen(0, '127.0.0.1');
await once(fakeOllama, 'listening');
const server = createForjaServer({ directory, origin, ollama: origin + ':' + fakeOllama.address().port });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = origin + ':' + server.address().port + '/api/v1';

after(async () => {
  await Promise.all([server, fakeOllama].map((item) => new Promise((resolve) => item.close(resolve))));
  await rm(directory, { recursive: true, force: true });
});

function client() {
  let cookie = '';
  return async (path, method = 'GET', body, from = origin) => {
    const response = await fetch(base + path, {
      method, headers: { Cookie: cookie, Origin: from, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const received = response.headers.get('Set-Cookie');
    if (received) cookie = received.split(';')[0];
    return { status: response.status, ...await response.json() };
  };
}

const category = { id: 'cat', name: 'Força', slug: 'forca', color: '#123456', order: 0, createdAt: 0, updatedAt: 0 };
const routine = { id: 'rot', name: 'Superior', categoryId: 'cat', exercises: [], createdAt: 0, updatedAt: 0 };
const workout = {
  id: 'treino', dateISO: '2026-11-15', routineId: routine.id, createdAt: 0, note: 'nota da sessão',
  entries: [{ exerciseId: 'supino', target: { sets: 1 }, sets: [{ done: true, weightKg: 50, reps: 8 }] }],
};
const mutation = (kind, key, value, baseVersion = 0) => ({ kind, key, value, baseVersion });

test('pair, retry an offline workout, handle concurrent edits and deletes, and revoke', async () => {
  const desktop = client();
  const mobile = client();
  assert.equal((await mobile('/session')).device, null);
  assert.equal((await mobile('/sync/changes')).status, 401);
  assert.equal((await desktop('/session/bootstrap', 'POST', { name: 'PC', key: adminKey(directory) }, 'https://other.invalid')).status, 403);
  assert.equal((await desktop('/session/bootstrap', 'POST', { name: 'PC', key: adminKey(directory) })).owner, true);

  const abandoned = await desktop('/pairings', 'POST');
  await desktop('/pairings/' + abandoned.id, 'DELETE');
  assert.equal((await mobile('/pairings/claim', 'POST', { name: 'Celular', code: abandoned.code })).status, 410);

  const invite = await desktop('/pairings', 'POST');
  assert.match(invite.qr, /^data:image\/svg\+xml;base64,/);
  assert.match(invite.url, /\/conectar#pair=[\w-]+$/);
  const claim = await mobile('/pairings/claim', 'POST', { name: 'Celular', token: new URL(invite.url).hash.slice(6) });
  assert.equal((await mobile('/pairings/exchange', 'POST', claim)).pending, true);
  assert.equal((await desktop('/pairings/' + invite.id, 'GET')).name, 'Celular');
  await desktop('/pairings/' + invite.id + '/approve', 'POST');
  const linked = await mobile('/pairings/exchange', 'POST', claim);
  assert.equal((await mobile('/pairings/exchange', 'POST', claim)).device.id, linked.device.id);
  assert.equal((await mobile('/devices')).status, 403);

  const batch = (changes, id = randomUUID()) => ({ protocol: 1, id, mutations: changes });
  const setup = await desktop('/sync/push', 'POST', batch([
    mutation('categories', 'cat', category), mutation('routines', 'rot', routine),
    mutation('weekPlan', '1', { weekday: 1, routineId: 'rot' }),
  ]));
  const version = setup.changes.find((row) => row.kind === 'routines').version;
  const offline = batch([mutation('workouts', 'treino', workout)]);
  const accepted = await mobile('/sync/push', 'POST', offline);
  assert.deepEqual(await mobile('/sync/push', 'POST', offline), accepted);
  const retryWithOtherContent = { ...offline, mutations: [mutation('workouts', 'treino', { ...workout, note: 'changed' })] };
  assert.equal((await mobile('/sync/push', 'POST', retryWithOtherContent)).error, 'REUSED_OPERATION');
  const feed = await desktop('/sync/changes?after=0');
  assert.equal(feed.changes.filter((row) => row.kind === 'workouts').length, 1);

  const modified = { ...routine, name: 'Superior A' };
  const acceptedEdit = await desktop('/sync/push', 'POST', batch([mutation('routines', 'rot', modified, version)]));
  const conflict = await mobile('/sync/push', 'POST', batch([mutation('routines', 'rot', { ...routine, name: 'Superior B' }, version)]));
  assert.equal(conflict.status, 'conflict');
  assert.equal(conflict.conflicts[0].value.name, 'Superior A');
  const deleted = await desktop('/sync/push', 'POST', batch([
    mutation('routines', 'rot', null, acceptedEdit.changes[0].version),
  ]));
  assert.equal(deleted.changes.find((row) => row.kind === 'weekPlan').value.routineId, null);
  assert.equal(deleted.changes.find((row) => row.kind === 'workouts').value.routineName, 'Superior A');
  assert.equal((await mobile('/sync/push', 'POST', batch([
    mutation('routines', 'rot', routine, deleted.changes[0].version),
  ]))).status, 'conflict');

  const providers = await mobile('/coach/providers');
  assert.deepEqual(providers.models, ['fixture:1']);
  assert.equal((await mobile('/coach/test', 'POST', { model: 'fixture:1' })).ok, true);
  const review = await mobile('/coach/reviews', 'POST', {
    model: 'fixture:1', start: '2026-11-09', end: '2026-11-15', workouts: 1, sets: 1, volume: 400,
    note: 'nota da sessão',
    candidates: [{ routineId: 'rot', index: 0, fromId: 'supino', toId: 'supino-halter', fromName: 'Supino', toName: 'Supino halter' }],
  });
  assert.equal(review.suggestions.length, 1);
  assert.equal(review.suggestions[0].toId, 'supino-halter');
  await desktop('/devices/' + linked.device.id, 'DELETE');
  assert.equal((await mobile('/sync/changes')).error, 'DEVICE_REVOKED');
  assert.equal((await mobile('/coach/providers')).error, 'DEVICE_REVOKED');
});


test('keeps whole transactions in the feed and retains receipts across restarts', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'forja-restart-'));
  const file = join(temp, 'forja.db');
  let database = createStore(file);
  const owner = { id: 'test-owner' };
  const bulk = {
    protocol: 1,
    id: randomUUID(),
    mutations: Array.from({ length: 151 }, (_, i) => mutation('workouts', 'workout-' + i, {
      ...workout, id: 'workout-' + i,
    })),
  };
  try {
    const reply = database.push(owner, bulk);
    const installation = database.installation;
    database.close();
    database = createStore(file);
    assert.equal(database.installation, installation);
    assert.deepEqual(database.push(owner, bulk), reply);
    const feed = database.feed(0);
    assert.equal(feed.changes.length, 151);
    assert.equal(feed.more, false);
    assert.throws(() => database.feed(feed.cursor + 1), { code: 'CURSOR_RESET' });
  } finally {
    database.close();
    await rm(temp, { recursive: true, force: true });
  }
});

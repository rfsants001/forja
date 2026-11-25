import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createForjaServer } from '../apps/server/src/index.mjs';
import { adminKey } from '../apps/server/src/devices.mjs';
import { SEED_EXERCISES } from '../apps/web/src/db/seed-exercises.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = await mkdtemp(join(tmpdir(), 'forja-offline-'));
const staticRoot = join(directory, 'web');
await cp(join(root, 'apps/web/dist'), staticRoot, { recursive: true });
const dataDirectory = join(directory, 'data');
const port = Number(process.env.FORJA_QA_PORT || 18983);
const origin = `http://127.0.0.1:${port}`;
let server;
async function startServer() {
  server = createForjaServer({ directory: dataDirectory, staticRoot, origin });
  server.listen(port, '127.0.0.1'); await once(server, 'listening');
}
async function stopServer() { if (server?.listening) { server.closeAllConnections(); await new Promise(r => server.close(r)); } }
await startServer();
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined,
  args: ['--disable-background-networking', '--disable-breakpad', '--disable-crash-reporter'] });
const desktop = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
let pc, phone;
const errors = [];
const transfers = [];
const shots = process.env.FORJA_QA_ARTIFACTS;
if (shots) await mkdir(shots, { recursive: true });
async function screenshot(page, name) { if (shots) await page.screenshot({ path: join(shots, name + '.png') }); }
function observe(page) {
  page.setDefaultTimeout(15_000); page.on('pageerror', e => errors.push(e.message));
  page.on('request', request => {
    if (request.url().endsWith('/sync/push')) {
      const data = request.postDataJSON();
      transfers.push({ source: page === pc ? 'desktop' : 'mobile', id: data.id,
        mutations: data.mutations.map(m => ({ kind: m.kind, key: m.key, deleted: m.value === null })) });
    }
  });
}
async function open(page, path = '/perfil') {
  await page.goto(origin + path);
  const skip = page.getByRole('button', { name: 'Pular introdução', exact: true });
  await Promise.race([skip.waitFor(), page.locator('.app-navigation').waitFor()]);
  if (await skip.isVisible()) {
    await page.getByRole('checkbox', { name: 'Não mostrar a introdução novamente', exact: true }).check();
    await skip.click();
  }
  await page.locator('.app-navigation').waitFor();
}
async function call(page, path, method = 'GET', body) {
  return page.evaluate(async ({ path, method, body }) => {
    const result = await fetch('/api/v1' + path, { method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const value = await result.json(); if (!result.ok) throw new Error(value.error); return value;
  }, { path, method, body });
}
async function rows(page, table) {
  return page.evaluate(table => new Promise((resolve, reject) => {
    const q = indexedDB.open('forja'); q.onerror = () => reject(q.error);
    q.onsuccess = () => { const db = q.result; const request = db.transaction(table).objectStore(table).getAll();
      request.onsuccess = () => { db.close(); resolve(request.result); }; request.onerror = () => { db.close(); reject(request.error); }; };
  }), table);
}
async function until(read, message) {
  const deadline = Date.now() + 15_000;
  while (!await read()) {
    if (Date.now() > deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function waitRows(page, table, count) {
  await until(async () => (await rows(page, table)).length === count, `${table} did not reach ${count} records`);
}
async function enable(page) {
  await page.goto(origin + '/perfil/dispositivos');
  await page.getByRole('button', { name: 'Revisar dados', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar e sincronizar', exact: true }).click();
  await waitRows(page, 'syncOutbox', 0);
  await until(async () => (await rows(page, 'syncState')).some(row => row.id === 'installation' && row.lastSync), 'sync never completed');
}
try {
  pc = await desktop.newPage(); observe(pc); await open(pc);
  const media = JSON.parse(await readFile(join(root, 'apps/web/src/data/exercise-media.json'), 'utf8'));
  const exercise = SEED_EXERCISES.find(e => e.mode === 'reps' && media[e.id]); assert(exercise);
  const plan = { _meta: { app: 'forja', kind: 'plan', version: 2, exportedAt: new Date().toISOString() }, categories: [], weekPlan: [],
    exercises: [{ ...exercise, createdAt: 1, updatedAt: 1 }], routines: [{ id: 'qa-source', name: 'Treino offline', categoryId: 'gym',
      order: 0, createdAt: 1, updatedAt: 1, exercises: [{ exerciseId: exercise.id, sets: 2, targetReps: '8', targetWeightKg: 10, restSec: 3 }] }] };
  await pc.getByRole('button', { name: /Importar JSON personalizado/ }).click();
  const dialog = pc.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'offline-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(plan)) });
  await dialog.getByRole('button', { name: 'Segunda', exact: true }).click();
  await dialog.getByRole('button', { name: 'Importar e agendar', exact: true }).click();
  await waitRows(pc, 'routines', 1); await pc.keyboard.press('Escape');
  await pc.locator('#profile-offline').getByText('Pronto para treinar offline', { exact: true }).waitFor();
  await pc.locator('#profile-offline').scrollIntoViewIfNeeded();
  await screenshot(pc, 'offline-desktop');
  const inventory = await pc.evaluate(async () => { const keys = await caches.keys(); const urls = [];
    for (const key of keys) for (const request of await (await caches.open(key)).keys()) urls.push(new URL(request.url).pathname); return urls; });
  assert(!inventory.some(path => path.startsWith('/api/'))); assert(inventory.includes('/apple-touch-icon.png'));
  await pc.goto(origin + '/'); await pc.getByRole('link', { name: 'Ver preparo offline', exact: true }).click();
  await pc.waitForFunction(() => document.activeElement?.id === 'offline-profile');
  assert.equal(new URL(pc.url()).hash, '#profile-offline');
  // Prove readiness notices cache eviction, and repairs the original build through SRI.
  const frame = '/exercise-media/' + media[exercise.id].frames[0] + '.webp';
  await pc.evaluate(async frame => { for (const key of await caches.keys()) await (await caches.open(key)).delete(location.origin + frame, { ignoreSearch: true }); }, frame);
  await pc.getByRole('button', { name: 'Conferir recursos', exact: true }).click();
  await pc.waitForFunction(() => [...document.querySelectorAll('#profile-offline button')].some(button => button.textContent.includes('Conferir recursos') && !button.disabled));
  await pc.locator('#profile-offline').getByText('Pronto para treinar offline', { exact: true }).waitFor();
  assert(await pc.evaluate(async frame => !!await caches.match(location.origin + frame, { ignoreSearch: true }), frame));
  console.log('Offline resources: actual cache, PNG icon, no API caching, eviction repair: OK');

  await call(pc, '/session/bootstrap', 'POST', { name: 'Desktop QA', key: adminKey(dataDirectory) }); await enable(pc);
  assert(await pc.getByRole('button', { name: 'Parear aparelho', exact: true }).isDisabled());
  phone = await mobile.newPage(); observe(phone); await open(phone);
  const invite = await call(pc, '/pairings', 'POST');
  const claim = await call(phone, '/pairings/claim', 'POST', { name: 'Mobile QA', code: invite.code });
  await call(pc, '/pairings/' + invite.id + '/approve', 'POST'); await call(phone, '/pairings/exchange', 'POST', claim);
  await enable(phone); await waitRows(phone, 'routines', 1);
  await phone.goto(origin + '/perfil'); await phone.locator('#profile-offline').getByText('Pronto para treinar offline', { exact: true }).waitFor();
  await phone.locator('#profile-offline').scrollIntoViewIfNeeded(); await screenshot(phone, 'offline-mobile');
  const routine = (await rows(phone, 'routines'))[0];
  await phone.goto(origin + '/treino?routineId=' + routine.id);
  await phone.getByRole('button', { name: 'Marcar série como feita', exact: true }).first().waitFor();
  await stopServer(); await mobile.setOffline(true);
  await phone.getByRole('button', { name: 'Marcar série como feita', exact: true }).first().click();
  const draft = await phone.evaluate(() => JSON.parse(localStorage.getItem('forja-session')).state.active);
  assert(draft.exercises[0].sets[0].done); assert(draft.rest.endsAt > Date.now());
  await phone.close(); phone = await mobile.newPage(); observe(phone);
  await phone.goto(origin + '/treino');
  await phone.getByRole('button', { name: 'Desmarcar série', exact: true }).first().waitFor();
  assert.equal(await phone.evaluate(() => JSON.parse(localStorage.getItem('forja-session')).state.active.id), draft.id);
  await phone.locator('.session-guide summary').click();
  await phone.waitForFunction(() => [...document.querySelectorAll('.session-guide img')].some(img => img.complete && img.naturalWidth > 0));
  assert(await phone.locator('.session-guide svg').count());
  await screenshot(phone, 'workout-offline');
  // Fake disk failure to verify that edits stay in memory and a retry persists the newest draft.
  await phone.evaluate(() => { window.qaSetItem = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) {
    if (key === 'forja-session') throw new DOMException('Full', 'QuotaExceededError'); return window.qaSetItem.call(this, key, value); }; });
  const skipRest = phone.getByRole('button', { name: 'Pular descanso', exact: true }); if (await skipRest.isVisible()) await skipRest.click();
  await phone.getByRole('button', { name: 'Marcar série como feita', exact: true }).last().click();
  await phone.getByRole('alert').filter({ hasText: 'Não foi possível salvar o rascunho' }).waitFor();
  await phone.evaluate(() => { Storage.prototype.setItem = window.qaSetItem; });
  await phone.getByRole('button', { name: 'Tentar salvar rascunho', exact: true }).click();
  await phone.waitForFunction(() => JSON.parse(localStorage.getItem('forja-session')).state.active.exercises[0].sets.every(s => s.done));
  if (await skipRest.isVisible()) await skipRest.click();
  await phone.getByRole('button', { name: 'Finalizar treino', exact: true }).click();
  await waitRows(phone, 'workouts', 1); assert.equal((await rows(phone, 'workouts'))[0].id, draft.id);
  assert((await rows(phone, 'syncOutbox')).length > 0);
  await phone.locator('.app-status').getByText(/Salvo neste aparelho · pendências de sincronização:/).waitFor();
  // Simulate a crash between the IndexedDB commit and clearing the old localStorage draft.
  await phone.evaluate(draft => localStorage.setItem('forja-session', JSON.stringify({ state: { active: draft }, version: 0 })), draft);
  await phone.reload(); await waitRows(phone, 'workouts', 1);
  await phone.waitForFunction(() => JSON.parse(localStorage.getItem('forja-session')).state.active === null);
  console.log('Server off + airplane mode: cold reopen, media/atlas, sets/rest, disk error/retry, finish + queued history: OK');

  await startServer(); await mobile.setOffline(false); await waitRows(phone, 'syncOutbox', 0);
  await pc.reload(); await waitRows(pc, 'workouts', 1);
  await phone.goto(origin + '/perfil/dispositivos'); await phone.getByRole('button', { name: 'Tentar sincronizar', exact: true }).click();
  assert.equal((await rows(phone, 'workouts')).length, 1, 'mobile workout count'); assert.equal((await rows(pc, 'workouts')).length, 1, 'desktop workout count');
  console.log('Pairing + reconnect: one workout on both devices, no duplicate after retry: OK');

  // Keep one stale tab open to ensure it cannot activate an update over another tab's draft.
  const stale = await mobile.newPage(); observe(stale); await stale.goto(origin + '/'); await stale.locator('.app-navigation').waitFor();
  await phone.goto(origin + '/treino?routineId=' + routine.id); await phone.getByRole('button', { name: 'Marcar série como feita', exact: true }).first().waitFor();
  const activeId = await phone.evaluate(() => JSON.parse(localStorage.getItem('forja-session')).state.active.id);
  await writeFile(join(staticRoot, 'sw.js'), await readFile(join(staticRoot, 'sw.js'), 'utf8') + '\n// forja update test\n');
  await phone.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await phone.getByRole('button', { name: 'Atualizar aplicativo', exact: true }).waitFor();
  assert(await phone.getByRole('button', { name: 'Atualizar aplicativo', exact: true }).isDisabled());
  await stale.getByRole('button', { name: 'Atualizar aplicativo', exact: true }).click();
  await stale.getByText('Conclua a sessão ativa, inclusive em outra aba, e feche o editor ou diálogo antes de atualizar.', { exact: true }).waitFor();
  assert.equal(await phone.evaluate(() => JSON.parse(localStorage.getItem('forja-session')).state.active.id), activeId);
  phone.once('dialog', dialog => dialog.accept()); await phone.getByRole('button', { name: 'Cancelar treino', exact: true }).click();
  await stale.getByRole('button', { name: 'Atualizar aplicativo', exact: true }).click();
  await stale.waitForFunction(() => !document.querySelector('.app-status-update'));
  assert.equal((await rows(stale, 'workouts')).length, 1);
  assert.equal(await stale.evaluate(() => JSON.parse(localStorage.getItem('forja-session')).state.active), null);
  console.log('Update: waits for user, blocks active workout across tabs, preserves records: OK');

  await stale.goto(origin + '/perfil');
  const download = stale.waitForEvent('download'); await stale.locator('#profile-offline').getByRole('button', { name: 'Exportar backup', exact: true }).click();
  const backup = JSON.parse(await readFile(await (await download).path(), 'utf8')); assert.equal(backup.data.workouts.length, 1);
  await stale.evaluate(() => new Promise(resolve => { const q = indexedDB.open('forja'); q.onsuccess = () => { const db = q.result;
    const tx = db.transaction('settings', 'readwrite'); const store = tx.objectStore('settings'); const row = store.get('app');
    row.onsuccess = () => store.put({ ...row.result, lang: 'en', theme: 'light' }); tx.oncomplete = () => { db.close(); resolve(); }; }; }));
  await stale.reload(); await stale.locator('#profile-offline').getByText('Ready to train offline', { exact: true }).waitFor();
  for (const width of [320, 390, 1440]) { await stale.setViewportSize({ width, height: 900 });
    assert(await stale.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horizontal overflow'); }
  assert.deepEqual(errors, []);
  console.log('Backup, PT/EN, light theme, 320–1440 px and zero JavaScript errors: OK');
} catch (error) {
  console.error('Offline QA failed:', error.message);
  console.error('Transfers:', JSON.stringify(transfers));
  if (pc) console.error('Desktop records/queue:', await rows(pc, 'workouts').catch(() => []), await rows(pc, 'syncOutbox').catch(() => []));
  if (phone) console.error('Mobile records/queue:', await rows(phone, 'workouts').catch(() => []), await rows(phone, 'syncOutbox').catch(() => []));
  if (pc) console.error('Readiness:', await pc.locator('#profile-offline').innerText().catch(() => 'unavailable'));
  if (pc) console.error('Worker:', await pc.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    const manifest = await fetch('/offline-assets.json').then(r => r.json());
    const missing = [];
    for (const path of manifest.assets) if (!await caches.match(location.origin + path, { ignoreSearch: true })) missing.push(path);
    return { controller: !!navigator.serviceWorker.controller, active: registration?.active?.state, waiting: registration?.waiting?.state, missing };
  }).catch(e => e.message));
  if (phone) console.error((await phone.locator('body').innerText()).slice(-1800));
  if (shots) await (phone || pc)?.screenshot({ path: join(shots, 'failure.png') }).catch(() => {});
  throw error;
} finally { await browser.close(); await stopServer(); await rm(directory, { recursive: true, force: true }); }

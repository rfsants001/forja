import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { offlineManifest, precacheIntegrity } from '../../web/offline-manifest.mjs';
import { readOfflineManifest, transferState } from '../../web/src/lib/offline-policy.ts';
import { createDraftStorage } from '../../web/src/lib/session-storage.ts';

test('a paired device is not presented as synced before a successful transfer', () => {
  assert.equal(transferState(false, 0, false, 'idle'), 'local');
  assert.equal(transferState(true, 0, false, 'idle'), 'waiting');
  assert.equal(transferState(true, 0, false, 'updated'), 'waiting');
  assert.equal(transferState(true, 0, false, 'updated', 42), 'updated');
  assert.equal(transferState(true, 0, false, 'waiting', 42), 'waiting');
  assert.equal(transferState(true, 3, false, 'updated', 42), 'pending');
  assert.equal(transferState(true, 3, true, 'running', 42), 'conflict');
  assert.equal(transferState(true, 3, false, 'running', 42), 'running');
});

test('offline inventory rejects remote URLs, APIs, traversal and incomplete manifests', () => {
  assert.deepEqual(readOfflineManifest({ version: 'build', assets: ['/index.html', '/assets/app.js', '/index.html'], cacheKeys: { '/index.html': '/index.html?__WB_REVISION__=a', '/assets/app.js': '/assets/app.js' } }),
    [{ path: '/index.html', cacheKey: '/index.html?__WB_REVISION__=a' }, { path: '/assets/app.js', cacheKey: '/assets/app.js' }]);
  for (const assets of [[], ['/assets/app.js'], ['/index.html', '//external.test/a'],
    ['/index.html', '/api/v1/session'], ['/index.html', '/assets/../api/a'], ['/index.html', '/assets/a?x=1']]) {
    assert.throws(() => readOfflineManifest({ version: 'build', assets }));
  }
});

test('full or blocked draft storage reports failure without discarding the in-memory draft', () => {
  const reports = [];
  const values = new Map();
  let full = true;
  const adapter = createDraftStorage(() => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (full) throw new Error('QuotaExceededError'); values.set(key, value); },
    removeItem: (key) => values.delete(key),
  }), (failed) => reports.push(failed));
  const draft = JSON.stringify({ state: { active: { id: 'offline-workout', sets: [8, 9] } }, version: 0 });
  assert.doesNotThrow(() => adapter.setItem('forja-session', draft));
  assert.equal(reports.at(-1), true);
  full = false;
  adapter.setItem('forja-session', draft);
  assert.equal(reports.at(-1), false);
  assert.equal(adapter.getItem('forja-session'), draft);
  adapter.removeItem('forja-session');
  assert.equal(adapter.getItem('forja-session'), null);
});

test('a read failure is surfaced to hydration rather than becoming an empty draft', () => {
  const reports = [];
  const adapter = createDraftStorage(() => { throw new Error('Storage blocked'); }, (failed) => reports.push(failed));
  assert.throws(() => adapter.getItem('forja-session'), /Storage blocked/);
  assert.equal(reports.at(-1), true);
});

test('the final offline inventory contains the entry point and assets, not the worker itself', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'forja-manifest-'));
  try {
    await mkdir(join(dir, 'assets'));
    await writeFile(join(dir, 'index.html'), '<html>Forja</html>');
    await writeFile(join(dir, 'assets/app.js'), 'console.log("offline")');
    await writeFile(join(dir, 'sw.js'), 'worker');
    await writeFile(join(dir, 'workbox-runtime.js'), 'worker engine');
    await writeFile(join(dir, 'assets/workbox-window.js'), 'client registration');
    offlineManifest().writeBundle({ dir });
    precacheIntegrity([{ url: 'assets/app.js', revision: null }, { url: 'assets/workbox-window.js', revision: 'client' }, { url: 'index.html', revision: 'html' }, { url: 'offline-assets.json', revision: 'initial' }], dir);
    const manifest = JSON.parse(await readFile(join(dir, 'offline-assets.json'), 'utf8'));
    assert.deepEqual(readOfflineManifest(manifest), [{ path: '/assets/app.js', cacheKey: '/assets/app.js' }, { path: '/assets/workbox-window.js', cacheKey: '/assets/workbox-window.js?__WB_REVISION__=client' }, { path: '/index.html', cacheKey: '/index.html?__WB_REVISION__=html' }]);
    const result = precacheIntegrity([{ url: 'index.html', revision: 'one' }], dir);
    assert.match(result.manifest[0].integrity, /^sha256-/);
    await writeFile(join(dir, 'index.html'), '<html>Updated</html>');
    offlineManifest().writeBundle({ dir });
    assert.notEqual(JSON.parse(await readFile(join(dir, 'offline-assets.json'), 'utf8')).version, manifest.version);
    assert.notEqual(precacheIntegrity([{ url: 'index.html' }], dir).manifest[0].integrity, result.manifest[0].integrity);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

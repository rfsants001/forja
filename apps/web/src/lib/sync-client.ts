import { db, uid } from '../db/db';
import { readShared } from '../db/sync-write';
import { entityId, sameBaseline, syncKinds } from './sync-protocol';
import type { SyncSession, SyncReply, SyncCounts, VersionedEntity, LocalMutation, QueueBatch, SyncValue, WireBatch } from './sync-protocol';
import type { Exercise, Routine } from '@forja/core';

export class SyncError extends Error {
  constructor(readonly code: string) { super(code); }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    const timeout = path.startsWith('/coach/') ? 95_000 : 10_000;
    const signal = AbortSignal.timeout(timeout);
    response = await fetch('/api/v1' + path, {
      ...options, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
      signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch {
    throw new SyncError('OFFLINE');
  }
  if (!response.headers.get('Content-Type')?.includes('application/json')) throw new SyncError('NO_SERVER');
  const body = await response.json();
  if (!response.ok) throw new SyncError(body.error ?? 'SERVER_ERROR');
  return body as T;
}
export const post = <T>(path: string, body?: object, signal?: AbortSignal) => api<T>(path, {
  method: 'POST', body: body ? JSON.stringify(body) : undefined, signal,
});
export const sessionInfo = () => api<SyncSession>('/session');

const tables = () => [...syncKinds.map((kind) => db.table(kind)), db.syncState, db.syncOutbox, db.syncShadow];
type RunState = 'idle' | 'running' | 'updated' | 'conflict' | 'waiting';
interface Runtime { status: RunState; error?: string }
let runtime: Runtime = { status: 'idle' };
const listeners = new Set<() => void>();
export function subscribeSync(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const syncRuntime = () => runtime;
function status(next: Runtime) {
  runtime = next;
  listeners.forEach((listener) => listener());
}

export async function getLocalCounts(): Promise<SyncCounts> {
  return db.transaction('r', syncKinds.map((kind) => db.table(kind)), async () => Object.fromEntries(
    await Promise.all(syncKinds.map(async (kind) => [kind, (await readShared(kind)).size])),
  ));
}

export async function enableSync(session: SyncSession) {
  if (!session.device || session.origin !== location.origin) throw new SyncError('PAIR_REQUIRED');
  const fresh = await sessionInfo();
  if (!fresh.device || fresh.device.id !== session.device.id || fresh.installation !== session.installation) {
    throw new SyncError('INSTALLATION_CHANGED');
  }
  await db.transaction('rw', tables(), async () => {
    const current = await db.syncState.get('installation');
    if (current?.installation === session.installation) return;
    if (current) throw new SyncError('INSTALLATION_CHANGED');
    for (const kind of syncKinds) {
      const shared = await readShared(kind);
      const mutations: LocalMutation[] = [...shared].map(([key, value]) => ({
        kind, key, value, before: null, baseVersion: 0,
      }));
      for (let offset = 0; offset < mutations.length; offset += 100) {
        await db.syncOutbox.add({ id: crypto.randomUUID(), mutations: mutations.slice(offset, offset + 100) });
      }
    }
    await db.syncState.put({ id: 'installation', installation: session.installation, cursor: 0 });
  });
  void syncNow();
}

export async function forgetSync() {
  await db.transaction('rw', [db.syncState, db.syncOutbox, db.syncShadow], async () => {
    await db.syncState.clear();
    await db.syncShadow.clear();
    await db.syncOutbox.clear();
  });
  status({ status: 'idle' });
}

async function applyEntity(entity: Pick<VersionedEntity, 'kind' | 'key' | 'value'>) {
  const { kind, key, value } = entity;
  const table = db.table<SyncValue, string | number>(kind);
  const primaryKey = kind === 'weekPlan' ? Number(key) : key;
  if (value === null) {
    await table.delete(primaryKey);
  } else if (kind === 'exercises') {
    const existing = await db.exercises.get(key);
    const synced = value as Exercise;
    await db.exercises.put({
      ...synced, note: existing?.note, demo: existing?.demo ?? synced.demo, attribution: existing?.attribution,
    });
  } else await table.put(value);
}

async function applyRemote(installation: string, changes: VersionedEntity[], cursor?: number, sent?: QueueBatch) {
  await db.transaction('rw', tables(), async () => {
    const state = await db.syncState.get('installation');
    if (!state || state.installation !== installation) return;
    if (sent?.seq !== undefined) {
      const stored = await db.syncOutbox.get(sent.seq);
      if (stored?.id !== sent.id) return;
      await db.syncOutbox.delete(sent.seq);
    }
    const pending = new Set((await db.syncOutbox.toArray()).flatMap((batch) => batch.mutations.map(
      (change) => entityId(change.kind, change.key),
    )));
    for (const change of changes) {
      const id = entityId(change.kind, change.key);
      const previous = await db.syncShadow.get(id);
      if (previous && previous.version >= change.version) continue;
      await db.syncShadow.put({ ...change, id });
      if (!pending.has(id)) await applyEntity(change);
    }
    if (cursor !== undefined && cursor > state.cursor) {
      await db.syncState.put({ ...state, cursor });
    }
  });
}

async function prepareBatch(seq: number): Promise<QueueBatch | undefined> {
  return db.transaction('rw', [db.syncOutbox, db.syncShadow], async () => {
    const batch = await db.syncOutbox.get(seq);
    if (!batch || batch.sent || batch.conflicts) return batch;
    const mutations = await Promise.all(batch.mutations.map(async ({ before, ...change }) => {
      const shadow = await db.syncShadow.get(entityId(change.kind, change.key));
      return {
        ...change,
        baseVersion: shadow && sameBaseline(change.kind, before, shadow.value) ? shadow.version : change.baseVersion,
      };
    }));
    const sent: WireBatch = { protocol: 1, id: batch.id, mutations };
    await db.syncOutbox.put({ ...batch, sent });
    return { ...batch, sent };
  });
}

async function pull(installation: string) {
  for (;;) {
    const state = await db.syncState.get('installation');
    if (!state || state.installation !== installation) return;
    const result = await api<{ changes: VersionedEntity[]; cursor: number; more: boolean }>(
      '/sync/changes?after=' + state.cursor,
    );
    await applyRemote(installation, result.changes, result.cursor);
    if (!result.more) return;
  }
}

async function performSync() {
  const state = await db.syncState.get('installation');
  if (!state) return;
  if (!navigator.onLine) { status({ status: 'waiting', error: 'OFFLINE' }); return; }
  status({ status: 'running' });
  const session = await sessionInfo();
  if (session.installation !== state.installation) throw new SyncError('INSTALLATION_CHANGED');
  if (!session.device) throw new SyncError('DEVICE_REVOKED');

  for (;;) {
    const head = await db.syncOutbox.orderBy('seq').first();
    if (head?.seq === undefined || head.conflicts) break;
    const batch = await prepareBatch(head.seq);
    if (!batch?.sent) break;
    const reply = await post<SyncReply>('/sync/push', batch.sent);
    if (reply.status === 'conflict') {
      await db.transaction('rw', db.syncOutbox, async () => {
        const stored = await db.syncOutbox.get(head.seq!);
        if (stored?.id === batch.id) {
          await db.syncOutbox.update(head.seq!, { conflicts: reply.conflicts, reason: reply.reason });
        }
      });
      break;
    }
    await applyRemote(state.installation, reply.changes, undefined, batch);
  }
  await pull(state.installation);
  const first = await db.syncOutbox.orderBy('seq').first();
  if (first?.conflicts) {
    status({ status: 'conflict' });
  } else {
    await db.syncState.update('installation', { lastSync: Date.now() });
    status({ status: 'updated' });
  }
}

let running: Promise<void> | undefined;
export function syncNow(): Promise<void> {
  if (running) return running;
  const work = () => performSync().catch((error: unknown) => {
    status({ status: 'waiting', error: error instanceof SyncError ? error.code : 'SERVER_ERROR' });
  });
  const current = Promise.resolve(navigator.locks ? navigator.locks.request('forja-sync', work) : work())
    .finally(() => { running = undefined; });
  running = current;
  return current;
}

export function watchSync() {
  const refresh = () => { void syncNow(); };
  const visible = () => { if (!document.hidden) refresh(); };
  refresh();
  const interval = window.setInterval(visible, 5000);
  addEventListener('online', refresh);
  addEventListener('offline', refresh);
  document.addEventListener('visibilitychange', visible);
  return () => {
    clearInterval(interval);
    removeEventListener('online', refresh);
    removeEventListener('offline', refresh);
    document.removeEventListener('visibilitychange', visible);
  };
}

const permanent = new Set(['routines', 'workouts', 'exercises', 'categories']);
export function requiresCopy(change: VersionedEntity) {
  return change.value === null && change.version > 0 && permanent.has(change.kind);
}

export async function resolveConflict(seq: number, choice: 'remote' | 'local' | 'copy') {
  await db.transaction('rw', tables(), async () => {
    const batch = await db.syncOutbox.get(seq);
    if (!batch?.conflicts) return;
    const latest = await Promise.all(batch.conflicts.map(async (change) => {
      const shadow = await db.syncShadow.get(entityId(change.kind, change.key));
      return shadow && shadow.version > change.version ? shadow : change;
    }));
    if (latest.some((change, index) => change.version !== batch.conflicts?.[index]?.version)) {
      await db.syncOutbox.update(seq, { conflicts: latest });
      return;
    }
    const remote = new Map(latest.map((change) => [entityId(change.kind, change.key), change]));
    const others = (await db.syncOutbox.where('seq').above(seq).toArray()).flatMap((item) => item.mutations);
    const mutations: LocalMutation[] = [];
    for (const mutation of batch.mutations) {
      const id = entityId(mutation.kind, mutation.key);
      const remoteConflict = remote.get(id);
      if (!remoteConflict) {
        mutations.push(mutation);
        continue;
      }
      const conflict = remoteConflict;
      if (choice === 'local') {
        if ((requiresCopy(conflict) && mutation.value) || batch.reason === 'INVALID_REFERENCE') {
          throw new SyncError('CONFLICT_REQUIRES_COPY');
        }
        mutations.push({ ...mutation, before: conflict.value, baseVersion: conflict.version });
        continue;
      }
      if (choice === 'copy' && mutation.kind === 'routines' && requiresCopy(conflict) && mutation.value) {
        const newest = others.filter((item) => item.kind === mutation.kind && item.key === mutation.key).at(-1);
        const original = (newest ? newest.value : mutation.value) as Routine | null;
        if (original) {
          const key = uid('rot_');
          const value = { ...original, id: key, name: original.name + ' (cópia)', createdAt: Date.now(), updatedAt: Date.now() };
          await applyEntity({ kind: 'routines', key, value });
          mutations.push({ kind: 'routines', key, value, before: null, baseVersion: 0 });
        }
      }
      if (!others.some((item) => item.kind === conflict.kind && item.key === conflict.key)) await applyEntity(conflict);
    }
    if (mutations.length) await db.syncOutbox.put({ seq, id: crypto.randomUUID(), mutations });
    else await db.syncOutbox.delete(seq);
  });
  await syncNow();
}

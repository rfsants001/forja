import Dexie from 'dexie';
import { db } from './db';
import { entityId, keyOf, sameValue, sharedValue, syncKinds } from '../lib/sync-protocol';
import type { LocalMutation, SyncKind, SyncValue } from '../lib/sync-protocol';

type Writable = SyncKind | 'bodyweight' | 'measurements' | 'settings' | 'coachEdits';
const scope = new WeakSet<object>();

export async function readShared(kind: SyncKind, retain: ReadonlySet<string> = new Set()): Promise<Map<string, SyncValue>> {
  const ids = new Set(retain);
  if (kind === 'exercises') {
    for (const routine of await db.routines.toArray()) routine.exercises.forEach((entry) => ids.add(entry.exerciseId));
    for (const workout of await db.workouts.toArray()) workout.entries.forEach((entry) => ids.add(entry.exerciseId));
  }
  const result = new Map<string, SyncValue>();
  for (const value of await db.table<SyncValue>(kind).toArray()) {
    const filtered = sharedValue(kind, value);
    if (filtered !== null) {
      const key = keyOf(kind, filtered);
      if (kind !== 'exercises' || ids.has(key)) result.set(key, filtered);
    }
  }
  return result;
}

export function syncWrite<T>(tables: readonly Writable[], operation: () => Promise<T>): Promise<T> {
  const outer = Dexie.currentTransaction;
  if (outer && scope.has(outer)) return operation();
  const captureExercises = tables.some((name) => name === 'exercises' || name === 'routines' || name === 'workouts');
  const kinds = syncKinds.filter((kind) => tables.includes(kind) || (kind === 'exercises' && captureExercises));
  const scopeNames = new Set(tables);
  if (captureExercises) {
    scopeNames.add('exercises');
    scopeNames.add('routines');
    scopeNames.add('workouts');
  }
  return db.transaction('rw', [...[...scopeNames].map((name) => db.table(name)), db.syncState, db.syncShadow, db.syncOutbox], async (tx) => {
    scope.add(tx);
    const state = await db.syncState.get('installation');
    if (!state) return operation();
    const retained = new Set<string>();
    if (captureExercises && tables.includes('exercises')) {
      const shadows = await db.syncShadow.toArray();
      for (const item of shadows) if (item.kind === 'exercises' && item.value) retained.add(item.key);
      for (const batch of await db.syncOutbox.toArray()) {
        for (const item of batch.mutations) if (item.kind === 'exercises' && item.value) retained.add(item.key);
      }
    }
    const before = await Promise.all(kinds.map((kind) => readShared(kind, retained)));
    const result = await operation();
    const mutations: LocalMutation[] = [];
    for (const [index, kind] of kinds.entries()) {
      const previous = before[index]!;
      // Removing a reference does not delete a previously shared definition.
      const after = await readShared(kind, kind === 'exercises' ? new Set([...retained, ...previous.keys()]) : retained);
      for (const key of new Set([...previous.keys(), ...after.keys()])) {
        const old = previous.get(key) ?? null;
        const value = after.get(key) ?? null;
        if (!sameValue(old, value)) {
          const shadow = await db.syncShadow.get(entityId(kind, key));
          mutations.push({ kind, key, before: old, value, baseVersion: shadow?.version ?? 0 });
        }
      }
    }
    if (mutations.length) await db.syncOutbox.add({ id: crypto.randomUUID(), mutations });
    return result;
  });
}

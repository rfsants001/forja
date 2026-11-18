import { addDays } from '@forja/core';
import type { Exercise, Routine, WorkoutLog } from '@forja/core';
import { db } from '../db/db';
import { syncWrite } from '../db/sync-write';
import { computeSummary } from './stats';
import { sameValue } from './sync-protocol';
import { exerciseRequirements, inventoryKeys, supportsEquipment } from './equipment';
import { SyncError } from './sync-client';

export interface Candidate {
  routineId: string;
  index: number;
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
}
export interface Suggestion extends Candidate {
  kind: 'replaceExercise';
  reason: string;
}
export interface ReviewResult {
  summary: string;
  suggestions: Suggestion[];
}

function compatible(from: Exercise, to: Exercise, equipment: ReadonlySet<string>) {
  return from.id !== to.id && from.mode === to.mode && from.primaryMuscle === to.primaryMuscle
    && supportsEquipment(exerciseRequirements(to), equipment);
}

export function weeklyReview(end: string, workouts: WorkoutLog[], routines: Routine[], catalog: Exercise[], equipment: string[]) {
  const start = addDays(end, -6);
  const logs = workouts.filter((log) => log.dateISO >= start && log.dateISO <= end);
  const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const trainedRoutines = new Set(logs.map((log) => log.routineId));
  const available = inventoryKeys(equipment);
  const candidates: Candidate[] = [];
  for (const routine of routines.filter((item) => trainedRoutines.has(item.id))) {
    for (const [index, entry] of routine.exercises.entries()) {
      const from = byId.get(entry.exerciseId);
      if (!from || entry.progression === '531') continue;
      for (const to of catalog.filter((item) => compatible(from, item, available)).slice(0, 3)) {
        candidates.push({ routineId: routine.id, index, fromId: from.id, toId: to.id, fromName: from.name, toName: to.name });
      }
    }
  }
  const sets = logs.reduce((count, log) => count + log.entries.reduce(
    (subtotal, entry) => subtotal + entry.sets.filter((set) => set.done).length, 0), 0);
  return { start, end, workouts: logs.length, sets, volume: computeSummary(logs, null).totalVolume, candidates: candidates.slice(0, 48) };
}

export async function applySuggestion(suggestion: Suggestion, baseline: Routine) {
  return syncWrite(['routines', 'exercises', 'coachEdits', 'settings'], async () => {
    const current = await db.routines.get(suggestion.routineId);
    const entry = current?.exercises[suggestion.index];
    if (!current || !sameValue(current, baseline) || entry?.exerciseId !== suggestion.fromId
      || entry.progression === '531') throw new SyncError('STALE_PROPOSAL');
    const [from, to] = await db.exercises.bulkGet([suggestion.fromId, suggestion.toId]);
    const settings = await db.settings.get('app');
    if (!from || !to || !compatible(from, to, inventoryKeys(settings?.gymEquipment ?? []))) throw new SyncError('STALE_PROPOSAL');
    const exercises = current.exercises.map((item, index) => index === suggestion.index
      ? { ...item, exerciseId: to.id, trainingMaxKg: undefined, trainingMaxIncrementKg: undefined }
      : item);
    const after = { ...current, exercises, updatedAt: Math.max(Date.now(), current.updatedAt + 1) };
    const id = crypto.randomUUID();
    await db.routines.put(after);
    await db.coachEdits.put({ id, before: current, after });
    return id;
  });
}

export async function undoSuggestion(id: string) {
  await syncWrite(['routines', 'coachEdits'], async () => {
    const edit = await db.coachEdits.get(id);
    if (!edit) throw new SyncError('STALE_PROPOSAL');
    const current = await db.routines.get(edit.after.id);
    if (!current || !sameValue(current, edit.after)) throw new SyncError('STALE_PROPOSAL');
    await db.routines.put({ ...edit.before, updatedAt: Math.max(Date.now(), current.updatedAt + 1) });
    await db.coachEdits.delete(id);
  });
}

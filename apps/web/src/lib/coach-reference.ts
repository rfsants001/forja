import { compareWorkouts, type Exercise, type WorkoutLog } from '@forja/core';
import { parseBackup } from './backup';
import { parseFitNotes, parseStrong, parseHevy } from './importers';
import { parsePlan } from './plan-share';
import { UiError } from './ui-error';
import { readExternalReferences } from './coach-external-reference';

export type ReferenceSource = 'fitnotes' | 'strong' | 'hevy' | 'backup' | 'plan' | 'external';
export interface ReferenceExercise {
  name: string;
  sets: number;
  reps?: string;
  seconds?: number;
  loadKg?: number;
}
export interface CoachReference {
  key: string;
  label: string;
  kind: 'logged' | 'prescribed';
  exercises: ReferenceExercise[];
}

const limit = 16;

function fromWorkouts(workouts: readonly WorkoutLog[], names: Map<string, string>): CoachReference[] {
  return [...workouts].sort((a, b) => compareWorkouts(b, a)).flatMap((workout) => {
    const exercises = workout.entries.flatMap(({ exerciseId, sets }) => {
      const name = names.get(exerciseId);
      const completed = sets.filter(({ done }) => done).slice(0, 100);
      if (!name || !completed.length) return [];
      const reps = completed.flatMap((set) => Number.isInteger(set.reps) && set.reps! > 0 && set.reps! <= 1000 ? [set.reps!] : []);
      const weight = completed.flatMap(({ weightKg }) => weightKg !== undefined && weightKg >= 0 && weightKg <= 1000 ? [weightKg] : []);
      const min = Math.min(...reps);
      const max = Math.max(...reps);
      return [{
        name: name.slice(0, 220), sets: Math.min(100, completed.length),
        reps: reps.length ? (min === max ? String(min) : `${min}–${max}`) : undefined,
        loadKg: weight.length ? Math.round(Math.max(...weight) * 100) / 100 : undefined,
      }];
    }).slice(0, limit);
    return exercises.length ? [{
      key: workout.id, label: [workout.dateISO, workout.routineName].filter(Boolean).join(' · '),
      kind: 'logged' as const, exercises,
    }] : [];
  }).slice(0, 40);
}

const namesFrom = (catalog: readonly Exercise[]) => new Map(catalog.map(({ id, name }) => [id, name]));

export function localCoachReferences(workouts: readonly WorkoutLog[], catalog: readonly Exercise[]): CoachReference[] {
  return fromWorkouts(workouts, namesFrom(catalog));
}

export async function readCoachReferences(file: File, source: ReferenceSource, catalog: readonly Exercise[]): Promise<CoachReference[]> {
  if (file.size > 12 * 1024 * 1024) throw new UiError('coach.referenceLarge');
  const raw = await file.text();
  const names = namesFrom(catalog);
  let result: CoachReference[];
  if (source === 'external') {
    result = await readExternalReferences(raw, file.name);
  } else if (source === 'backup') {
    const { data } = parseBackup(raw);
    // parseBackup validates both tables before returning its generic row map.
    for (const { id, name } of (data.exercises ?? []) as unknown as Exercise[]) names.set(id, name);
    result = fromWorkouts((data.workouts ?? []) as unknown as WorkoutLog[], names);
  } else if (source === 'plan') {
    const { routines, exercises } = parsePlan(raw);
    for (const { id, name } of exercises) names.set(id, name);
    result = routines.flatMap((routine) => {
      const moves = routine.exercises.flatMap(({ exerciseId, sets, targetReps, targetSec }) => {
        const name = names.get(exerciseId);
        return name ? [{ name: name.slice(0, 220), sets: Math.min(100, sets),
          reps: /^\d{1,4}(?:[–-]\d{1,4})?$/.test(targetReps?.trim() ?? '') ? targetReps?.trim() : undefined,
          seconds: targetSec !== undefined && Number.isInteger(targetSec) && targetSec > 0 && targetSec <= 86400 ? targetSec : undefined,
        }] : [];
      }).slice(0, limit);
      return moves.length ? [{ key: routine.id, label: routine.name, kind: 'prescribed' as const, exercises: moves }] : [];
    }).slice(0, 40);
  } else {
    const imported = (source === 'fitnotes' ? parseFitNotes : source === 'strong' ? parseStrong : parseHevy)(raw);
    for (const [id, name] of imported._exerciseNameById ?? []) names.set(id, name);
    for (const { id, name } of imported.exercises) names.set(id, name);
    result = fromWorkouts(imported.workouts, names);
  }
  if (!result.length) throw new UiError('coach.referenceEmpty');
  return result;
}

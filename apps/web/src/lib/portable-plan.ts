import type { Exercise, RoutineExercise, Weekday } from '@forja/core';
import { db } from '../db/db';
import { setWeekday, upsertExercise, upsertRoutine } from '../db/repo';
import { syncWrite } from '../db/sync-write';
import { loadExerciseDataset } from './exercise-dataset';
import { parsePlan } from './plan-share';
import { UiError } from './ui-error';

type Move = { exercise: Exercise; config: Omit<RoutineExercise, 'exerciseId'> };
export type PortableRoutine = { key: string; name: string; note?: string; moves: Move[] };

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : undefined;
function numeric(value: unknown) {
  const number = typeof value === 'string' && /^\d+(?:[,.]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : value;
  return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : undefined;
}
function target(value: unknown) {
  const number = numeric(value);
  return number !== undefined && Number.isInteger(number) && number > 0 ? number : undefined;
}
const repsText = (value: unknown) => typeof value === 'number' && value > 0 && Number.isInteger(value) ? String(value) : text(value);
const invalid = () => new UiError('coach.portInvalid');

export async function readPortablePlan(file: File, catalog: readonly Exercise[]): Promise<PortableRoutine[]> {
  if (file.size > 12 * 1024 * 1024) throw new UiError('coach.referenceLarge');
  const raw = (await file.text()).replace(/^\uFEFF/, '');
  let plan: Record<string, unknown>;
  try { plan = object(JSON.parse(raw)); } catch { throw invalid(); }
  if ('_meta' in plan) {
    const native = parsePlan(raw);
    const exercises = new Map([...catalog, ...native.exercises].map((item) => [item.id, item]));
    if (!native.routines.length || native.routines.some(({ exercises }) => !exercises.length
      || exercises.some(({ sets }) => sets < 1 || sets > 100))) throw invalid();
    return native.routines.map((item, index) => ({ key: String(index), name: item.name, note: item.note,
      moves: item.exercises.map(({ exerciseId, ...config }) => {
        const exercise = exercises.get(exerciseId);
        if (!exercise) throw invalid();
        return { exercise, config };
      }),
    }));
  }

  const openGym = plan.opengym_plan === 1;
  const known = new Map<string, Exercise>();
  if (openGym) {
    for (const exercise of await loadExerciseDataset()) known.set(exercise.id, exercise);
    for (const item of Array.isArray(plan.customEx) ? plan.customEx : []) {
      const row = object(item);
      const id = text(row.id);
      const name = text(row.n);
      if (id && name) known.set(id, { id, name, mode: 'reps', primaryMuscle: 'other', secondaryMuscles: [],
        equipment: [], demo: { kind: 'none' }, instructions: text(row.desc), custom: true });
    }
  }
  const rows = Array.isArray(plan.routines) ? plan.routines : Array.isArray(plan.exercises) ? [plan] : [];
  if (!rows.length) throw invalid();
  return rows.map((item, index) => {
    const row = object(item);
    const name = text(row.name);
    const entries = openGym ? row.ex : row.exercises;
    if (!name || !Array.isArray(entries) || !entries.length) throw invalid();
    return { key: String(index), name, note: text(row.note), moves: entries.map((entry) => {
      const move = object(entry);
      // Reject invalid supported fields rather than silently losing a source prescription.
      if (!openGym) {
        for (const field of ['loadKg', 'weight', 'restSec', 'rest', 'targetDistanceM', 'targetSpeedKmh', 'trainingMaxKg']) {
          if (move[field] !== undefined && numeric(move[field]) === undefined) throw invalid();
        }
        for (const field of ['seconds', 'sec', 'secondsMax', 'supersetGroup']) {
          if (move[field] !== undefined && target(move[field]) === undefined) throw invalid();
        }
        if (move.reps !== undefined && repsText(move.reps) === undefined) throw invalid();
        if (move.mode !== undefined && !['reps', 'time', 'cardio'].includes(String(move.mode))) throw invalid();
        const seconds = target(move.seconds ?? move.sec);
        const maximum = target(move.secondsMax);
        if (maximum !== undefined && (seconds === undefined || maximum < seconds)) throw invalid();
      }
      const sets = target(move.sets);
      const sourceId = text(move.id) ?? (typeof move.id === 'number' ? String(move.id) : undefined);
      const matched = sourceId && known.get(/^\d{1,4}$/.test(sourceId) ? 'ds-' + sourceId.padStart(4, '0') : sourceId);
      const exerciseName = openGym ? matched && matched.name : text(move.name);
      if (!sets || sets > 100 || !exerciseName) throw invalid();
      const seconds = target(move.seconds ?? move.sec) ?? (target(move.min) === undefined ? undefined : Number(move.min) * 60);
      const targetReps = repsText(move.reps);
      const targetSecMax = target(move.secondsMax);
      const targetWeightKg = numeric(move.loadKg ?? move.weight);
      const restSec = numeric(move.restSec ?? move.rest);
      const cardio = move.mode === 'cardio' || move.min !== undefined
        || (seconds !== undefined && /\b(caminhada|esteira|treadmill|walking|cardio|bike|bicicleta)\b/i.test(exerciseName));
      const mode = cardio ? 'cardio' : seconds !== undefined || move.mode === 'time' ? 'time' : 'reps';
      const supportedPolicy = ['off', 'linear', 'greyskull', 'double', 'time', '531'] as const;
      const progression = supportedPolicy.find((policy) => policy === (move.prog ?? row.prog));
      const note = [text(move.prescription), text(move.note)].filter(Boolean).join('\n') || undefined;
      const exercise: Exercise = matched && matched.mode === mode ? matched
        : { ...(matched || {}), id: '', name: exerciseName, mode, equipment: matched ? matched.equipment : [],
          primaryMuscle: matched ? matched.primaryMuscle : mode === 'cardio' ? 'cardio' : 'other',
          secondaryMuscles: matched ? matched.secondaryMuscles : [], demo: { kind: 'none' }, instructions: matched ? matched.instructions : text(move.instructions), custom: true };
      return { exercise, config: { sets, targetReps, targetSec: seconds, targetSecMax, targetWeightKg, restSec, note,
        progression: progression === '531' && !numeric(move.trainingMaxKg) ? undefined : progression,
        trainingMaxKg: numeric(move.trainingMaxKg), supersetGroup: target(move.supersetGroup),
        targetDistanceM: numeric(move.targetDistanceM), targetSpeedKmh: numeric(move.targetSpeedKmh),
      } };
    }) };
  });
}

export async function savePortablePlan(routines: readonly PortableRoutine[], schedule: ReadonlyMap<Weekday, string>,
    categoryId: string, allowReplace: boolean) {
  return syncWrite(['categories', 'exercises', 'routines', 'weekPlan'], async () => {
    if (!await db.categories.get(categoryId) || !schedule.size) throw invalid();
    if (!allowReplace && (await db.weekPlan.bulkGet([...schedule.keys()])).some((item) => item?.routineId)) {
      throw new UiError('coach.portOccupied');
    }
    const reference = new Map<string, string>();
    const definitions = new Map<string, string>();
    let order = (await db.routines.orderBy('order').last())?.order ?? -1;
    for (const routine of routines) {
      const exercises = [];
      for (const { exercise, config } of routine.moves) {
        const key = JSON.stringify([exercise.id, exercise.name, exercise.mode, exercise.equipment, exercise.instructions]);
        let exerciseId = definitions.get(key);
        if (!exerciseId) {
          const existing = exercise.id && await db.exercises.get(exercise.id);
          const compatible = existing && existing.name === exercise.name && existing.mode === exercise.mode
            && JSON.stringify(existing.equipment) === JSON.stringify(exercise.equipment);
          exerciseId = compatible ? existing.id : (await upsertExercise({ ...exercise,
            id: exercise.id && !existing ? exercise.id : undefined })).id;
          definitions.set(key, exerciseId);
        }
        exercises.push({ ...config, exerciseId });
      }
      const saved = await upsertRoutine({ categoryId, name: routine.name, note: routine.note, exercises, order: ++order });
      reference.set(routine.key, saved.id);
    }
    for (const [day, key] of schedule) {
      const id = reference.get(key);
      if (!id) throw invalid();
      await setWeekday(day, id);
    }
  });
}

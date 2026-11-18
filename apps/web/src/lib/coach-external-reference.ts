import { loadExerciseDataset } from './exercise-dataset';
import { csvToObjects } from './importers';
import { normalizeExName } from './normalize';
import type { CoachReference, ReferenceExercise } from './coach-reference';
import { UiError } from './ui-error';

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const label = (value: unknown): string => typeof value === 'string' ? value.trim().slice(0, 220) : '';
const number = (value: unknown): number => typeof value === 'number' ? value
  : typeof value === 'string' && /^\d+(?:[.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(',', '.')) : NaN;

function prescription(name: string, row: Record<string, unknown>): ReferenceExercise[] {
  const sets = number(row.sets);
  if (!name || !Number.isInteger(sets) || sets < 1 || sets > 100) return [];
  const rawReps = (typeof row.reps === 'number' ? String(row.reps) : label(row.reps)).replace(/\s*[–—-]\s*/g, '–');
  const reps = /^\d{1,4}(?:–\d{1,4})?$/.test(rawReps) && !rawReps.startsWith('0') ? rawReps : undefined;
  const seconds = number(row.seconds ?? row.sec ?? number(row.min) * 60);
  const load = number(row.loadKg ?? row.weight);
  return [{
    name, sets, reps,
    seconds: Number.isInteger(seconds) && seconds > 0 && seconds <= 86400 ? seconds : undefined,
    loadKg: load > 0 && load <= 1000 ? Math.round(load * 100) / 100 : undefined,
  }];
}

function routine(label: string, index: number, exercises: ReferenceExercise[]): CoachReference[] {
  return exercises.length ? [{ key: 'external-' + index, label, kind: 'prescribed', exercises: exercises.slice(0, 16) }] : [];
}

async function parseJson(raw: string, filename: string): Promise<CoachReference[]> {
  let value: unknown;
  try { value = JSON.parse(raw.replace(/^\uFEFF/, '')); }
  catch { throw new UiError('coach.referenceExternalFormat'); }
  const plan = record(value);
  if (plan.opengym_plan === 1) {
    const names = new Map((await loadExerciseDataset()).map(({ id, name }) => [id, name]));
    for (const item of list(plan.customEx)) {
      const row = record(item);
      if (label(row.id) && label(row.n)) names.set(label(row.id), label(row.n));
    }
    return list(plan.routines).slice(0, 40).flatMap((value, index) => {
      const entry = record(value);
      return routine(label(entry.name) || filename, index, list(entry.ex).flatMap((exercise) => {
        const row = record(exercise);
        const id = label(row.id) || (Number.isInteger(row.id) ? String(row.id) : '');
        const datasetId = /^\d{1,4}$/.test(id) ? 'ds-' + id.padStart(4, '0') : id;
        return prescription(names.get(id) ?? names.get(datasetId) ?? '', row);
      }));
    });
  }

  const routines = Array.isArray(plan.routines) ? plan.routines : Array.isArray(plan.exercises) ? [plan] : [];
  if (!routines.length) throw new UiError('coach.referenceExternalFormat');
  return routines.slice(0, 40).flatMap((value, index) => {
    const entry = record(value);
    return routine(label(entry.name) || filename, index, list(entry.exercises).flatMap((exercise) => {
      const row = record(exercise);
      return prescription(label(row.name), row);
    }));
  });
}

function parseCsv(raw: string, filename: string): CoachReference[] {
  const header = raw.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '';
  const rows = csvToObjects(raw, [], header.includes(';') && !header.includes(',') ? ';' : ',');
  const sessions = new Map<string, ReferenceExercise[]>();
  for (const row of rows) {
    const fields = new Map(Object.entries(row).map(([key, value]) => [normalizeExName(key), value]));
    const title = label(fields.get('routine') ?? fields.get('treino') ?? fields.get('rotina')) || filename;
    const name = label(fields.get('exercise') ?? fields.get('exercicio'));
    const exercises = prescription(name, {
      sets: fields.get('sets') ?? fields.get('series'), reps: fields.get('reps') ?? fields.get('repeticoes'),
      seconds: fields.get('seconds') ?? fields.get('segundos'), loadKg: fields.get('loadkg') ?? fields.get('cargakg'),
    });
    if (!exercises.length) continue;
    const session = sessions.get(title);
    if (session && session.length < 16) session.push(...exercises);
    else if (!session && sessions.size < 40) sessions.set(title, exercises);
  }
  if (!sessions.size) throw new UiError('coach.referenceExternalFormat');
  return [...sessions].flatMap(([title, exercises], index) => routine(title, index, exercises));
}

export function readExternalReferences(raw: string, filename: string): Promise<CoachReference[]> | CoachReference[] {
  const displayName = label(filename);
  return /^[\s\uFEFF]*[\[{]/.test(raw) || /\.json$/i.test(filename) ? parseJson(raw, displayName) : parseCsv(raw, displayName);
}

import { UiError } from './ui-error';
import { syncWrite } from '../db/sync-write';
import type { Table } from 'dexie';
import { db } from '../db/db';

const BACKUP_APP = 'forja';
const BACKUP_VERSION = 2;

const backupTables = {
  categories: db.categories,
  exercises: db.exercises,
  routines: db.routines,
  weekPlan: db.weekPlan,
  dayOverrides: db.dayOverrides,
  workouts: db.workouts,
  bodyweight: db.bodyweight,
  settings: db.settings,
  measurements: db.measurements,
};

type TableName = keyof typeof backupTables;
type Row = Record<string, unknown>;
type BackupData = Partial<Record<TableName, Row[]>>;
export type BackupMode = 'replace' | 'merge';
const tableNames = Object.keys(backupTables) as TableName[];

export interface ParsedBackup {
  version: 1 | 2;
  data: BackupData;
}

const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null && !Array.isArray(value);
const string = (value: unknown): value is string => typeof value === 'string';
const id = (value: unknown): value is string => string(value) && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const nonnegative = (value: unknown): value is number => number(value) && value >= 0;
const integer = (value: unknown): value is number => nonnegative(value) && Number.isInteger(value);
const positiveInteger = (value: unknown): value is number => integer(value) && value > 0;
const weekday = (value: unknown): value is number => integer(value) && value <= 6;
const date = (value: unknown): value is string => {
  if (!string(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const optional = (test: (value: unknown) => boolean) => (value: unknown) => value === undefined || test(value);
const oneOf = (...options: unknown[]) => (value: unknown) => options.includes(value);
const list = (test: (value: unknown) => boolean) => (value: unknown) => Array.isArray(value) && value.every(test);
const fields = (rules: Record<string, (value: unknown) => boolean>) => (value: unknown): value is Row =>
  isRow(value) && Object.entries(rules).every(([name, test]) => test(value[name]));

const optString = optional(string);
const optNumber = optional(nonnegative);
const policy = optional(oneOf('off', 'linear', 'greyskull', 'double', 'time', '531'));
const muscle = oneOf('chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings',
  'glutes', 'calves', 'abs', 'obliques', 'traps', 'lats', 'fullbody', 'cardio', 'other');
const boolean = oneOf(true, false);
const demo = (value: unknown) => {
  if (!isRow(value)) return false;
  switch (value.kind) {
    case 'none': return true;
    case 'asset': return positiveInteger(value.frames);
    case 'custom': return id(value.svg);
    case 'cdn': {
      const imageUrl = optional((url) => string(url) && url.startsWith('https://'));
      return fields({ image: imageUrl, gif: imageUrl })(value);
    }
    default: return false;
  }
};
const target = fields({
  sets: integer, reps: optString, sec: optNumber, weightKg: optNumber, policy,
  distanceM: optNumber, speedKmh: optNumber, unknown: optional(oneOf(true)),
  cycleWeek: optional(oneOf(1, 2, 3, 4)), baseTrainingMaxKg: optNumber, trainingMaxKg: optNumber,
  mainSets: optional(list(fields({ percentOfTM: nonnegative, weightKg: nonnegative, reps: positiveInteger, amrap: boolean }))),
});
const set = fields({
  reps: optNumber, weightKg: optNumber, sec: optNumber, distanceM: optNumber, speedKmh: optNumber, done: boolean, note: optString,
  effort: optional(fields({ rir: optNumber, rpe: optNumber })),
});
const settings = fields({
  unit: optional(oneOf('kg', 'lb')), theme: optional(oneOf('dark', 'light', 'system')), defaultRestSec: optNumber,
  gymEquipment: optional(list(id)), trackEffort: optional(boolean), weekStartsOn: optional(oneOf(0, 1)), bodyWeightGoalKg: optNumber,
  equipmentInventory: optional(list(fields({ id, name: id,
    quantity: optional((value) => positiveInteger(value) && value <= 999),
    unitWeightKg: optional((value) => number(value) && value > 0 && value <= 1000),
  }))),
  muscleFigure: optional(oneOf('male', 'female')), accent: optString, lang: optional(oneOf('pt', 'en')),
});
const validRow: Record<TableName, (value: unknown) => boolean> = {
  categories: fields({ id, name: id, slug: id, color: string, order: number, createdAt: number, updatedAt: number }),
  exercises: fields({ id, name: id, mode: oneOf('reps', 'time', 'cardio'), primaryMuscle: muscle,
    secondaryMuscles: list(muscle), equipment: list(string), demo, instructions: optString, note: optString }),
  routines: fields({ id, name: id, categoryId: id, note: optString, createdAt: number, updatedAt: number,
    exercises: list(fields({ exerciseId: id, sets: integer, targetReps: optString, targetSec: optNumber,
      restSec: optNumber, progression: policy, incrementKg: optNumber, targetDistanceM: optNumber,
      targetSpeedKmh: optNumber, supersetGroup: optional(integer), trainingMaxKg: optNumber, trainingMaxIncrementKg: optNumber })) }),
  weekPlan: fields({ weekday, routineId: (value) => value === null || id(value) }),
  dayOverrides: fields({ dateISO: date, routine: (value) => value === null || id(value) }),
  workouts: fields({ id, dateISO: date, createdAt: number, durationSec: optNumber, routineId: optional(id), routineName: optString,
    categoryId: optional(id), note: optString, entries: list(fields({ exerciseId: id, sets: list(set), warmupSets: optional(list(set)), target })),
    prs: optional(list(fields({ exerciseId: id, kind: oneOf('1rm', 'weight', 'reps'), value: nonnegative }))) }),
  bodyweight: fields({ dateISO: date, kg: nonnegative }),
  settings: (value) => isRow(value) && (value.id === 'app' && settings(value)
    || value.id === 'datasetVersion' && id(value.version)),
  measurements: fields({ dateISO: date, waistCm: optNumber, chestCm: optNumber, hipsCm: optNumber,
    leftArmCm: optNumber, rightArmCm: optNumber, leftThighCm: optNumber, rightThighCm: optNumber,
    neckCm: optNumber, calfCm: optNumber, note: optString }),
};

export function isBackupExercise(value: unknown): boolean {
  return validRow.exercises(value);
}

export function isBackupRoutine(value: unknown): boolean {
  return validRow.routines(value);
}

export function isBackupCategory(value: unknown): boolean {
  return validRow.categories(value);
}

export function isBackupWeekday(value: unknown): boolean {
  return validRow.weekPlan(value);
}

export function parseBackup(json: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new UiError('file.backupJson');
  }
  if (!isRow(parsed) || !isRow(parsed._meta) || parsed._meta.app !== BACKUP_APP || !isRow(parsed.data)) {
    throw new UiError('file.backupWrong');
  }
  const { version } = parsed._meta;
  if (version !== 1 && version !== BACKUP_VERSION) {
    throw new UiError('file.backupVersion');
  }
  const data: BackupData = {};
  for (const name of tableNames) {
    const rows = parsed.data[name];
    // O formato v1 não exportava medidas. Preservá-las no destino permite restaurar arquivos antigos.
    if (version === 1 && name === 'measurements' && rows === undefined) continue;
    if (!Array.isArray(rows)) throw new UiError('file.backupMissing', [name]);
    const invalidIndex = rows.findIndex((row: unknown) => !validRow[name](row));
    if (invalidIndex !== -1) throw new UiError('file.backupRow', [name, invalidIndex + 1]);
    data[name] = rows as Row[];
  }
  return { version, data };
}

export async function exportAll(): Promise<string> {
  const data = await db.transaction('r', db.tables, async () => {
    const rows = await Promise.all(tableNames.map(async (name) => [name, await backupTables[name].toArray()] as const));
    return Object.fromEntries(rows);
  });
  return JSON.stringify({ _meta: { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString() }, data }, null, 2);
}

export async function downloadBackup(): Promise<void> {
  const json = await exportAll();
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `forja-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function restoreBackup({ data }: ParsedBackup, mode: BackupMode): Promise<Record<string, number>> {
  return syncWrite(tableNames, async () => {
    if (mode === 'replace' && await db.syncState.get('installation')) {
      throw new UiError('file.backupSync');
    }
    const counts: Record<string, number> = {};
    for (const name of tableNames) {
      const rows = data[name];
      if (rows === undefined) continue;
      const table = backupTables[name] as unknown as Table<Row>;
      if (mode === 'replace') await table.clear();
      await table.bulkPut(rows);
      counts[name] = rows.length;
    }
    return counts;
  });
}

import { UiError } from './ui-error';
import { syncWrite } from '../db/sync-write';
/**
 * importers.ts — G5: Parsers de importação de apps de treino externos.
 *
 * Suporta: FitNotes, Strong, Hevy, Apple Health (somente peso corporal).
 * Sem libs externas — CSV/XML puro com utilitários nativos.
 *
 * Estratégia de casamento de exercício:
 *   1. Normaliza nome (lowercase, sem acentos, sem pontuação).
 *   2. Busca correspondência exata no catálogo local.
 *   3. Se não encontrar → exercício custom (custom: true).
 *   4. A prévia informa as linhas ignoradas e as referências novas.
 */

import type { WorkoutLog, Exercise, BodyWeight, SetLog, WorkoutEntry } from '@forja/core';
import { db, uid } from '../db/db';
import { upsertExercise, addWorkout, addBodyWeight } from '../db/repo';
import { normalizeExName } from './normalize';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface ImportResult {
  workouts: WorkoutLog[];
  exercises: Exercise[];
  bodyweight: BodyWeight[];
  /** Nomes de exercício que não foram reconhecidos (viraram custom). */
  unrecognized: string[];
  skippedRows?: number;
  _exerciseNameById?: Map<string, string>;
}

export interface ImportCounts {
  workouts: number;
  exercises: number;
  bodyweight: number;
  duplicates: number;
}

// ---------------------------------------------------------------------------
// Utilitários CSV
// ---------------------------------------------------------------------------

/** Parser CSV mínimo: respeita campos entre aspas e quebras de linha em campos. */
function parseCSV(csv: string): string[][] {
  const rows: string[][] = [];
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < lines.length; i++) {
    const ch = lines[i] ?? '';
    if (inQuotes) {
      if (ch === '"') {
        // aspas duplas dentro de campo = escape
        if (lines[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // Última linha sem \n final
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Remove linhas vazias e retorna header + dados. */
function csvToObjects(csv: string, required: string[]): Array<Record<string, string>> {
  const rows = parseCSV(csv).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length === 0) throw new UiError('file.csvEmpty');
  const header = rows[0]?.map((h) => h.replace(/^\uFEFF/, '').trim()) ?? [];
  if (!required.every((field) => header.includes(field))) {
    throw new UiError('file.csvColumns');
  }
  return rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((key, i) => {
      obj[key] = (row[i] ?? '').trim();
    });
    return obj;
  });
}

// ---------------------------------------------------------------------------
// Casamento de exercício com o catálogo local
// ---------------------------------------------------------------------------

/**
 * Encontra o id do exercício pelo nome normalizado.
 * Se não encontrar, cria um exercício custom e devolve o id novo.
 */
function resolveExerciseId(
  rawName: string,
  cacheMap: Map<string, Exercise>,
  newExercises: Map<string, Exercise>,
): string {
  const norm = normalizeExName(rawName);

  // 1. Catálogo local
  const existing = cacheMap.get(norm);
  if (existing !== undefined) return existing.id;

  // 2. Exercícios já criados nesta importação (evita duplicar na mesma sessão)
  const inNew = newExercises.get(norm);
  if (inNew !== undefined) return inNew.id;

  // 3. Criar exercício custom
  const newEx: Exercise = {
    id: uid('ex_'),
    name: rawName,
    mode: 'reps',
    primaryMuscle: 'other',
    secondaryMuscles: [],
    equipment: [],
    demo: { kind: 'none' },
    custom: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  newExercises.set(norm, newEx);
  cacheMap.set(norm, newEx); // atualiza o cache p/ evitar duplicar
  return newEx.id;
}

// ---------------------------------------------------------------------------
// Helpers de série
// ---------------------------------------------------------------------------

function parseNum(s: string | undefined): number | undefined {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s.trim().replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parsePosInt(s: string | undefined): number | undefined {
  const n = parseNum(s);
  if (n === undefined) return undefined;
  const i = Math.round(n);
  return i > 0 ? i : undefined;
}

// ---------------------------------------------------------------------------
// Parser FitNotes
// ---------------------------------------------------------------------------
//
// Formato padrão do FitNotes (export via Google Drive):
// Date,Exercise,Category,Weight (kgs),Reps,Distance,Distance Unit,Time
// "2024-01-15","Bench Press","Chest",80,8,"","",""

export function parseFitNotes(csv: string): ImportResult {
  const rows = csvToObjects(csv, ['Date', 'Exercise']);
  let skippedRows = 0;
  const workoutsMap = new Map<string, WorkoutLog>();
  const unrecognizedSet = new Set<string>();
  const newExercises = new Map<string, Exercise>();
  // Exercícios são resolvidos de forma síncrona nesta fase —
  // usamos um placeholder; resolução real é feita em applyImport.
  const exerciseNameById = new Map<string, string>(); // id → nome original

  for (const row of rows) {
    const dateISO = row['Date'] ?? '';
    const exName = (row['Exercise'] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !exName) {
      skippedRows++;
      continue;
    }

    const exId = uid('ex_');
    exerciseNameById.set(exId, exName);

    const weightKg = parseNum(row['Weight (kgs)'] ?? row['Weight']);
    const reps = parsePosInt(row['Reps']);
    const rawTime = row['Time'];
    const timeSec = rawTime?.includes(':')
      ? rawTime.split(':').reduce((total, part) => total * 60 + Number(part), 0)
      : parseNum(rawTime);
    const distance = parseNum(row['Distance']);
    const distanceUnit = row['Distance Unit']?.toLowerCase();
    const distM = distance === undefined ? undefined : distance *
      (distanceUnit === 'km' ? 1000 : /^(mi|mile|miles)$/.test(distanceUnit ?? '') ? 1609.344 : 1);

    const setLog: SetLog = {
      reps,
      weightKg,
      sec: timeSec !== undefined && Number.isFinite(timeSec) ? Math.round(timeSec) : undefined,
      distanceM: distM,
      done: true,
    };

    if (!workoutsMap.has(dateISO)) {
      workoutsMap.set(dateISO, {
        id: `import-fitnotes:${dateISO}`,
        dateISO,
        entries: [],
        createdAt: Date.now(),
      });
    }

    const wk = workoutsMap.get(dateISO)!;
    // Acumula série no entry do exercício (mesmo workout, mesmo exercício)
    const existingEntry = wk.entries.find((e) => {
      const name = exerciseNameById.get(e.exerciseId);
      return name !== undefined && normalizeExName(name) === normalizeExName(exName);
    });

    if (existingEntry !== undefined) {
      existingEntry.sets.push(setLog);
    } else {
      wk.entries.push({
        exerciseId: exId,
        sets: [setLog],
        target: { sets: 1, unknown: true },
      });
    }
  }

  return {
    workouts: Array.from(workoutsMap.values()),
    exercises: Array.from(newExercises.values()),
    bodyweight: [],
    unrecognized: Array.from(unrecognizedSet),
    // exerciseNameById é passado internamente via workouts.entries[].exerciseId
    // A resolução real acontece em applyImport.
    // Guardamos o mapa na closure do resultado para uso interno.
    skippedRows,
    _exerciseNameById: exerciseNameById,
  } as ImportResult & { _exerciseNameById: Map<string, string> };
}

// ---------------------------------------------------------------------------
// Parser Strong
// ---------------------------------------------------------------------------
//
// Formato Strong:
// Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
// "2024-01-15 07:00:00","Chest Day","1h 10m","Bench Press",1,80,8,"","","","",8

export function parseStrong(csv: string): ImportResult {
  const rows = csvToObjects(csv, ['Date', 'Workout Name', 'Exercise Name']);
  let skippedRows = 0;
  const workoutsMap = new Map<string, { wk: WorkoutLog; name: string }>();
  const exerciseNameById = new Map<string, string>();

  for (const row of rows) {
    const rawDate = row['Date'] ?? '';
    const dateISO = rawDate.slice(0, 10); // "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DD"
    const exName = (row['Exercise Name'] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !exName) {
      skippedRows++;
      continue;
    }

    const workoutName = (row['Workout Name'] ?? '').trim();
    const mapKey = `${rawDate}_${workoutName}`;

    const exId = uid('ex_');
    exerciseNameById.set(exId, exName);

    const weight = parseNum(row['Weight'] ?? row['Weight (kg)'] ?? row['Weight (lbs)']);
    const weightUnit = (row['Weight Unit'] ?? (row['Weight (lbs)'] !== undefined ? 'lb' : 'kg')).toLowerCase();
    const weightKg = weight === undefined ? undefined : /^(lb|lbs)$/.test(weightUnit) ? weight * 0.45359237 : weight;
    const reps = parsePosInt(row['Reps']);
    const sec = parsePosInt(row['Seconds']);
    const distM = parseNum(row['Distance']);
    const rpe = parseNum(row['RPE']);

    const setLog: SetLog = {
      reps,
      weightKg,
      sec,
      distanceM: distM,
      done: true,
      note: row['Notes']?.trim() || undefined,
      effort: rpe !== undefined ? { rpe } : undefined,
    };

    if (!workoutsMap.has(mapKey)) {
      workoutsMap.set(mapKey, {
        wk: {
          id: `import-strong:${encodeURIComponent(mapKey)}`,
          dateISO,
          entries: [],
          createdAt: Date.parse(rawDate.replace(' ', 'T')) || Date.now(),
          note: row['Workout Notes']?.trim() || workoutName || undefined,
        },
        name: workoutName,
      });
    }

    const { wk } = workoutsMap.get(mapKey)!;
    const existingEntry = wk.entries.find((e) => {
      const name = exerciseNameById.get(e.exerciseId);
      return name !== undefined && normalizeExName(name) === normalizeExName(exName);
    });

    if (existingEntry !== undefined) {
      existingEntry.sets.push(setLog);
    } else {
      wk.entries.push({
        exerciseId: exId,
        sets: [setLog],
        target: { sets: 1, unknown: true },
      });
    }
  }

  return {
    workouts: Array.from(workoutsMap.values()).map((v) => v.wk),
    exercises: [],
    bodyweight: [],
    unrecognized: [],
    skippedRows,
    _exerciseNameById: exerciseNameById,
  } as ImportResult & { _exerciseNameById: Map<string, string> };
}

// ---------------------------------------------------------------------------
// Parser Hevy
// ---------------------------------------------------------------------------
//
// Formato Hevy (CSV export):
// title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,
// set_index,set_type,weight_kg,reps,distance_meters,duration_seconds,rpe
//
// Workout = agrupado por (title + start_time). Set_type: "normal","warmup","failure","dropset"

const hevyMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function hevyDateTime(raw: string): string {
  const named = /^(\d{1,2}) ([a-z]{3}) (\d{4}), (\d{2}:\d{2})$/i.exec(raw);
  if (!named) return raw.replace(' ', 'T');
  const [, day, month, year, time] = named;
  const monthNumber = hevyMonths.indexOf(month!.toLowerCase()) + 1;
  if (!monthNumber) return '';
  return `${year}-${String(monthNumber).padStart(2, '0')}-${day!.padStart(2, '0')}T${time}`;
}

export function parseHevy(csv: string): ImportResult {
  const rows = csvToObjects(csv, ['start_time', 'exercise_title']);
  let skippedRows = 0;
  const workoutsMap = new Map<string, WorkoutLog>();
  const exerciseNameById = new Map<string, string>();

  for (const row of rows) {
    const startRaw = row['start_time'] ?? '';
    const start = hevyDateTime(startRaw);
    const dateISO = start.slice(0, 10);
    const exName = (row['exercise_title'] ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || !exName) {
      skippedRows++;
      continue;
    }

    const mapKey = `${dateISO}_${startRaw}`;

    const exId = uid('ex_');
    exerciseNameById.set(exId, exName);

    const weightLbs = parseNum(row['weight_lbs']);
    const weightKg = parseNum(row['weight_kg']) ?? (weightLbs === undefined ? undefined : weightLbs * 0.45359237);
    const reps = parsePosInt(row['reps']);
    const sec = parsePosInt(row['duration_seconds']);
    const distanceMiles = parseNum(row['distance_miles']);
    const distM = parseNum(row['distance_meters']) ?? (distanceMiles === undefined ? undefined : distanceMiles * 1609.344);
    const rpe = parseNum(row['rpe']);

    // Hevy guarda RIR às vezes no campo rpe como decimal; normalizar
    // Hevy usa rpe com escala 1-10 direta
    const effortObj =
      rpe !== undefined ? { rpe } : undefined;

    const isWarmup = row['set_type']?.trim().toLowerCase() === 'warmup';
    const setLog: SetLog = {
      reps,
      weightKg,
      sec,
      distanceM: distM,
      done: true,
      note: row['exercise_notes']?.trim() || undefined,
      effort: effortObj,
    };

    if (!workoutsMap.has(mapKey)) {
      const wkNote = (row['description'] ?? '').trim() || row['title']?.trim() || undefined;
      // duração: end_time - start_time em segundos
      let durationSec: number | undefined;
      const startMs = Date.parse(start);
      const endMs = Date.parse(hevyDateTime(row['end_time'] ?? ''));
      if (endMs > startMs) durationSec = Math.round((endMs - startMs) / 1000);
      workoutsMap.set(mapKey, {
        id: `import-hevy:${encodeURIComponent(mapKey)}`,
        dateISO,
        entries: [],
        createdAt: startMs || Date.now(),
        note: wkNote,
        durationSec,
      });
    }

    const wk = workoutsMap.get(mapKey)!;
    const existingEntry = wk.entries.find((e) => {
      const name = exerciseNameById.get(e.exerciseId);
      return name !== undefined && normalizeExName(name) === normalizeExName(exName);
    });

    if (existingEntry !== undefined) {
      if (isWarmup) (existingEntry.warmupSets ??= []).push(setLog);
      else existingEntry.sets.push(setLog);
    } else {
      wk.entries.push({
        exerciseId: exId,
        sets: isWarmup ? [] : [setLog],
        ...(isWarmup ? { warmupSets: [setLog] } : {}),
        target: { sets: isWarmup ? 0 : 1, unknown: true },
      });
    }
  }

  return {
    workouts: Array.from(workoutsMap.values()),
    exercises: [],
    bodyweight: [],
    unrecognized: [],
    skippedRows,
    _exerciseNameById: exerciseNameById,
  } as ImportResult & { _exerciseNameById: Map<string, string> };
}

// ---------------------------------------------------------------------------
// Parser Apple Health (peso corporal apenas)
// ---------------------------------------------------------------------------
//
// O export do Apple Health é um ZIP contendo export.xml.
// Aqui assumimos que o usuário já extraiu o XML e fez upload.
// Busca registros:
//   <Record type="HKQuantityTypeIdentifierBodyMass"
//           unit="kg" value="80.5" startDate="2024-01-15 ..." />
//
// NOTA PARCIAL: o XML do Apple Health pode ter centenas de MB.
// O parser opera em modo string puro (sem DOM parser pra suportar
// Workers no futuro), lendo apenas as linhas com BodyMass.
// Ele NÃO carrega o DOM inteiro — extrai via regex linha a linha.

export function parseAppleHealthWeight(xml: string): ImportResult {
  const bodyweight: BodyWeight[] = [];
  const seen = new Set<string>();

  // Estratégia: regex sobre o XML inteiro para encontrar todos os Record BodyMass
  const recordRe =
    /<Record[^>]+type="HKQuantityTypeIdentifierBodyMass"[^>]+>/g;

  let match: RegExpExecArray | null;
  while ((match = recordRe.exec(xml)) !== null) {
    const tag = match[0] ?? '';

    // Extrair value e unidade
    const valueM = /value="([^"]+)"/.exec(tag);
    const unitM = /unit="([^"]+)"/.exec(tag);
    const dateM = /startDate="([^"]+)"/.exec(tag);

    if (valueM === null || dateM === null) continue;

    const rawValue = parseFloat(valueM[1] ?? '');
    const unit = (unitM?.[1] ?? 'kg').toLowerCase();
    const rawDate = dateM[1] ?? '';
    const dateISO = rawDate.slice(0, 10); // "YYYY-MM-DD ..." → "YYYY-MM-DD"

    if (isNaN(rawValue) || !dateISO) continue;

    // Converter lb → kg se necessário
    const kg = unit === 'lb' ? rawValue * 0.453592 : rawValue;

    if (!seen.has(dateISO)) {
      seen.add(dateISO);
      bodyweight.push({ dateISO, kg: parseFloat(kg.toFixed(2)) });
    }
    // Se já viu essa data, mantém o primeiro registro (keep-first)
  }

  return {
    workouts: [],
    exercises: [],
    bodyweight,
    unrecognized: [],
  };
}

// ---------------------------------------------------------------------------
// applyImport — grava o ImportResult no banco (merge, nunca sobrescreve)
// ---------------------------------------------------------------------------

/**
 * Grava um ImportResult no IndexedDB via repo.
 * - Exercícios: upsert com casamento de nome (custom se não reconhecido).
 * - Workouts: add (não sobrescreve logs existentes; duplicar data é permitido).
 * - BodyWeight: addBodyWeight (put — mesmo dia sobrescreve).
 *
 * Retorna contagens de itens gravados.
 */
export async function previewImport(result: ImportResult): Promise<string[]> {
  const known = new Set((await db.exercises.toArray()).map((exercise) => normalizeExName(exercise.name)));
  const names = [...(result._exerciseNameById?.values() ?? [])];
  return [...new Map(names.filter((name) => !known.has(normalizeExName(name)))
    .map((name) => [normalizeExName(name), name])).values()];
}

export async function applyImport(result: ImportResult): Promise<ImportCounts> {
  return syncWrite(['exercises', 'workouts', 'bodyweight'], async () => {
    const catalog = await db.exercises.toArray();
    const byName = new Map(catalog.map((exercise) => [normalizeExName(exercise.name), exercise]));
    const newExercises = new Map<string, Exercise>();
    let workouts = 0;
    let duplicates = 0;

    for (const workout of result.workouts) {
      if (await db.workouts.get(workout.id) !== undefined) {
        duplicates++;
        continue;
      }
      const entries = workout.entries.map((entry): WorkoutEntry => {
        const name = result._exerciseNameById?.get(entry.exerciseId) ?? entry.exerciseId;
        const exerciseId = resolveExerciseId(name, byName, newExercises);
        return { ...entry, exerciseId, target: { sets: entry.sets.length, unknown: true } };
      });
      await addWorkout({ ...workout, entries });
      workouts++;
    }

    for (const exercise of newExercises.values()) await upsertExercise(exercise);
    for (const weight of result.bodyweight) await addBodyWeight(weight);
    return { workouts, exercises: newExercises.size, bodyweight: result.bodyweight.length, duplicates };
  });
}

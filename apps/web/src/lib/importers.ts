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
 *   4. Nada é descartado.
 */

import type { WorkoutLog, Exercise, BodyWeight, SetLog, WorkoutEntry } from '@forja/core';
import { db, uid } from '../db/db';
import { upsertExercise, addWorkout, addBodyWeight } from '../db/repo';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

export interface ImportResult {
  workouts: WorkoutLog[];
  exercises: Exercise[];
  bodyweight: BodyWeight[];
  /** Nomes de exercício que não foram reconhecidos (viraram custom). */
  unrecognized: string[];
}

export interface ImportCounts {
  workouts: number;
  exercises: number;
  bodyweight: number;
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
function csvToObjects(csv: string): Array<Record<string, string>> {
  const rows = parseCSV(csv).filter((r) => r.some((c) => c.trim() !== ''));
  if (rows.length < 2) return [];
  const header = rows[0]?.map((h) => h.trim()) ?? [];
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

function normalizeExName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .replace(/[^a-z0-9 ]/g, '')      // só letras, dígitos e espaço
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cache em memória de um exercício por nome normalizado. Carregado uma vez por chamada de applyImport. */
let _exerciseCacheMap: Map<string, Exercise> | null = null;

async function getExerciseCacheMap(): Promise<Map<string, Exercise>> {
  if (_exerciseCacheMap !== null) return _exerciseCacheMap;
  const all = await db.exercises.toArray();
  const map = new Map<string, Exercise>();
  for (const ex of all) {
    map.set(normalizeExName(ex.name), ex);
  }
  _exerciseCacheMap = map;
  return map;
}

/** Invalida o cache (use após gravar novos exercícios). */
function invalidateExerciseCache(): void {
  _exerciseCacheMap = null;
}

/**
 * Encontra o id do exercício pelo nome normalizado.
 * Se não encontrar, cria um exercício custom e devolve o id novo.
 */
async function resolveExerciseId(
  rawName: string,
  cacheMap: Map<string, Exercise>,
  unrecognized: Set<string>,
  newExercises: Map<string, Exercise>,
): Promise<string> {
  const norm = normalizeExName(rawName);

  // 1. Catálogo local
  const existing = cacheMap.get(norm);
  if (existing !== undefined) return existing.id;

  // 2. Exercícios já criados nesta importação (evita duplicar na mesma sessão)
  const inNew = newExercises.get(norm);
  if (inNew !== undefined) return inNew.id;

  // 3. Criar exercício custom
  unrecognized.add(rawName);
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
  if (s === undefined || s === '') return undefined;
  const n = parseFloat(s);
  return isNaN(n) ? undefined : n;
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
  const rows = csvToObjects(csv);
  const workoutsMap = new Map<string, WorkoutLog>();
  const unrecognizedSet = new Set<string>();
  const newExercises = new Map<string, Exercise>();
  // Exercícios são resolvidos de forma síncrona nesta fase —
  // usamos um placeholder; resolução real é feita em applyImport.
  const exerciseNameById = new Map<string, string>(); // id → nome original

  for (const row of rows) {
    const dateISO = row['Date'] ?? '';
    const exName = (row['Exercise'] ?? '').trim();
    if (!dateISO || !exName) continue;

    const exId = uid('ex_');
    exerciseNameById.set(exId, exName);

    const weightKg = parseNum(row['Weight (kgs)'] ?? row['Weight']);
    const reps = parsePosInt(row['Reps']);
    const timeSec = parseNum(row['Time']); // em segundos se vier
    const distM = parseNum(row['Distance']);

    const setLog: SetLog = {
      reps,
      weightKg,
      sec: timeSec !== undefined ? Math.round(timeSec) : undefined,
      distanceM: distM,
      done: true,
    };

    if (!workoutsMap.has(dateISO)) {
      workoutsMap.set(dateISO, {
        id: uid('wk_'),
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
        target: { sets: 1 },
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
  const rows = csvToObjects(csv);
  const workoutsMap = new Map<string, { wk: WorkoutLog; name: string }>();
  const exerciseNameById = new Map<string, string>();

  for (const row of rows) {
    const rawDate = row['Date'] ?? '';
    const dateISO = rawDate.slice(0, 10); // "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DD"
    const exName = (row['Exercise Name'] ?? '').trim();
    if (!dateISO || !exName) continue;

    const workoutName = (row['Workout Name'] ?? '').trim();
    const mapKey = `${dateISO}_${workoutName}`;

    const exId = uid('ex_');
    exerciseNameById.set(exId, exName);

    const weightKg = parseNum(row['Weight']);
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
      effort: rpe !== undefined ? { rpe } : undefined,
    };

    if (!workoutsMap.has(mapKey)) {
      workoutsMap.set(mapKey, {
        wk: {
          id: uid('wk_'),
          dateISO,
          entries: [],
          createdAt: Date.now(),
          note: workoutName || undefined,
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
        target: { sets: 1 },
      });
    }
  }

  return {
    workouts: Array.from(workoutsMap.values()).map((v) => v.wk),
    exercises: [],
    bodyweight: [],
    unrecognized: [],
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

export function parseHevy(csv: string): ImportResult {
  const rows = csvToObjects(csv);
  const workoutsMap = new Map<string, WorkoutLog>();
  const exerciseNameById = new Map<string, string>();

  for (const row of rows) {
    const startRaw = row['start_time'] ?? '';
    const dateISO = startRaw.slice(0, 10);
    const exName = (row['exercise_title'] ?? '').trim();
    if (!dateISO || !exName) continue;

    const mapKey = `${dateISO}_${startRaw}`;

    const exId = uid('ex_');
    exerciseNameById.set(exId, exName);

    const weightKg = parseNum(row['weight_kg']);
    const reps = parsePosInt(row['reps']);
    const sec = parsePosInt(row['duration_seconds']);
    const distM = parseNum(row['distance_meters']);
    const rpe = parseNum(row['rpe']);

    // Hevy guarda RIR às vezes no campo rpe como decimal; normalizar
    // Hevy usa rpe com escala 1-10 direta
    const effortObj =
      rpe !== undefined ? { rpe } : undefined;

    const setLog: SetLog = {
      reps,
      weightKg,
      sec,
      distanceM: distM,
      done: true,
      effort: effortObj,
    };

    if (!workoutsMap.has(mapKey)) {
      const wkNote = (row['description'] ?? '').trim() || undefined;
      // duração: end_time - start_time em segundos
      let durationSec: number | undefined;
      const endRaw = row['end_time'] ?? '';
      if (startRaw && endRaw) {
        const startMs = new Date(startRaw).getTime();
        const endMs = new Date(endRaw).getTime();
        if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
          durationSec = Math.round((endMs - startMs) / 1000);
        }
      }
      workoutsMap.set(mapKey, {
        id: uid('wk_'),
        dateISO,
        entries: [],
        createdAt: Date.now(),
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
      existingEntry.sets.push(setLog);
    } else {
      wk.entries.push({
        exerciseId: exId,
        sets: [setLog],
        target: { sets: 1 },
      });
    }
  }

  return {
    workouts: Array.from(workoutsMap.values()),
    exercises: [],
    bodyweight: [],
    unrecognized: [],
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
export async function applyImport(result: ImportResult): Promise<ImportCounts> {
  invalidateExerciseCache();
  const cacheMap = await getExerciseCacheMap();
  const unrecognizedSet = new Set<string>(result.unrecognized);
  const newExercises = new Map<string, Exercise>();

  // Mapa de exerciseId antigo (do parser) → id real no banco
  const idRemap = new Map<string, string>();

  // Coleta todos os exerciseIds referenciados nos workouts
  const internal = result as ImportResult & { _exerciseNameById?: Map<string, string> };
  const nameById: Map<string, string> = internal._exerciseNameById ?? new Map();

  // Resolve exercícios referenciados nos workouts
  for (const wk of result.workouts) {
    for (const entry of wk.entries) {
      const tempId = entry.exerciseId;
      if (idRemap.has(tempId)) continue;

      const rawName = nameById.get(tempId) ?? tempId;
      const realId = await resolveExerciseId(rawName, cacheMap, unrecognizedSet, newExercises);
      idRemap.set(tempId, realId);
    }
  }

  // Grava exercícios novos (os que não existiam no catálogo)
  let exercisesCount = 0;
  for (const ex of newExercises.values()) {
    await upsertExercise(ex);
    exercisesCount++;
  }
  // Também grava exercícios explicitamente passados no result (parsers que os populam)
  for (const ex of result.exercises) {
    // Só grava se não foi já gravado via newExercises
    const norm = normalizeExName(ex.name);
    if (!cacheMap.has(norm)) {
      await upsertExercise(ex);
      exercisesCount++;
    }
  }

  // Grava workouts remanejando os exerciseIds para os reais
  for (const wk of result.workouts) {
    const remapped = {
      ...wk,
      entries: wk.entries.map((entry): WorkoutEntry => ({
        ...entry,
        exerciseId: idRemap.get(entry.exerciseId) ?? entry.exerciseId,
      })),
    };
    await addWorkout(remapped);
  }

  // Grava peso corporal
  for (const bw of result.bodyweight) {
    await addBodyWeight(bw);
  }

  invalidateExerciseCache();

  return {
    workouts: result.workouts.length,
    exercises: exercisesCount,
    bodyweight: result.bodyweight.length,
  };
}

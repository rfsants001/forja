// Camada de ESCRITA e queries derivadas sobre o Dexie (db.ts).
// A leitura reativa continua sendo feita via useLiveQuery nas telas —
// este módulo cobre apenas operações imperativas (create, update, delete, queries pontuais).
//
// Decisões de projeto:
// - searchExercises: filtro em memória (array já lido do Dexie), não query Dexie.
//   Exercícios cabem facilmente em memória (<2k itens) e a busca full-text seria
//   complicada com índices Dexie. Chame antes: const all = await db.exercises.toArray().
// - getWeekPlan: monta o Record<Weekday, string|null> completo a partir das 7 linhas
//   da tabela weekPlan; dias sem linha equivalem a null.
// - getSettings: devolve DEFAULT_SETTINGS fundido com o que estiver salvo (patch).
// - updatedAt/createdAt: sempre em ms (Date.now()).

import { db, uid } from './db';
import type { WeekPlanRow, DayOverrideRow } from './db';
import {
  DEFAULT_SETTINGS,
} from '@forja/core';
import type {
  BodyMeasurement,
  Category,
  Exercise,
  MuscleGroup,
  Routine,
  WeekPlan,
  Weekday,
  DayOverride,
  WorkoutLog,
  BodyWeight,
  Settings,
} from '@forja/core';

// ---------------------------------------------------------------------------
// Categorias
// ---------------------------------------------------------------------------

/**
 * Cria ou atualiza uma categoria.
 * Se `data.id` existir na tabela, atualiza; caso contrário, insere com id gerado.
 */
export async function upsertCategory(
  data: Omit<Category, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number },
): Promise<Category> {
  const now = Date.now();

  if (data.id !== undefined) {
    const existing = await db.categories.get(data.id);
    if (existing !== undefined) {
      const updated: Category = { ...existing, ...data, id: existing.id, updatedAt: now };
      await db.categories.put(updated);
      return updated;
    }
  }

  const category: Category = {
    id: data.id ?? uid('cat_'),
    name: data.name,
    slug: data.slug,
    color: data.color,
    icon: data.icon,
    order: data.order,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  };
  await db.categories.put(category);
  return category;
}

/** Remove uma categoria pelo id. */
export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id);
}

/**
 * Reordena as categorias de acordo com a lista de ids fornecida.
 * Atribui `order = índice` para cada id na ordem dada.
 */
export async function reorderCategories(ids: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.categories, async () => {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id !== undefined) {
        await db.categories.where('id').equals(id).modify({ order: i, updatedAt: now });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Exercícios
// ---------------------------------------------------------------------------

/**
 * Cria ou atualiza um exercício.
 * Se `data.id` existir na tabela, atualiza; caso contrário, insere com id gerado.
 */
export async function upsertExercise(
  data: Omit<Exercise, 'id'> & { id?: string },
): Promise<Exercise> {
  const now = Date.now();

  if (data.id !== undefined) {
    const existing = await db.exercises.get(data.id);
    if (existing !== undefined) {
      const updated: Exercise = { ...existing, ...data, id: existing.id, updatedAt: now };
      await db.exercises.put(updated);
      return updated;
    }
  }

  const exercise: Exercise = {
    ...data,
    id: data.id ?? uid('ex_'),
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  };
  await db.exercises.put(exercise);
  return exercise;
}

/** Remove um exercício pelo id. */
export async function deleteExercise(id: string): Promise<void> {
  await db.exercises.delete(id);
}

/**
 * Busca exercícios por nome (case-insensitive, substring) com filtros opcionais.
 * Estratégia: filtro em memória sobre o array completo (exercícios cabem em RAM).
 *
 * @param query  Texto livre a buscar no nome (vazio = sem filtro de texto).
 * @param filters  Filtros adicionais: equipment (substring) e primaryMuscle.
 */
export async function searchExercises(
  query: string,
  filters?: { equipment?: string; muscle?: MuscleGroup },
): Promise<Exercise[]> {
  const all = await db.exercises.toArray();
  const q = query.toLowerCase().trim();

  return all.filter((ex) => {
    // Filtro por nome
    if (q.length > 0 && !ex.name.toLowerCase().includes(q)) return false;

    // Filtro por equipment (substring em qualquer item do array)
    if (filters?.equipment !== undefined) {
      const eq = filters.equipment.toLowerCase();
      const hasEquip = ex.equipment.some((e) => e.toLowerCase().includes(eq));
      if (!hasEquip) return false;
    }

    // Filtro por músculo principal
    if (filters?.muscle !== undefined && ex.primaryMuscle !== filters.muscle) {
      return false;
    }

    return true;
  });
}

// ---------------------------------------------------------------------------
// Rotinas
// ---------------------------------------------------------------------------

/**
 * Cria ou atualiza uma rotina.
 * Se `data.id` existir na tabela, atualiza; caso contrário, insere com id gerado.
 */
export async function upsertRoutine(
  data: Omit<Routine, 'id' | 'createdAt' | 'updatedAt'> & { id?: string; createdAt?: number },
): Promise<Routine> {
  const now = Date.now();

  if (data.id !== undefined) {
    const existing = await db.routines.get(data.id);
    if (existing !== undefined) {
      const updated: Routine = { ...existing, ...data, id: existing.id, updatedAt: now };
      await db.routines.put(updated);
      return updated;
    }
  }

  const routine: Routine = {
    id: data.id ?? uid('rot_'),
    name: data.name,
    categoryId: data.categoryId,
    note: data.note,
    exercises: data.exercises,
    order: data.order,
    createdAt: data.createdAt ?? now,
    updatedAt: now,
  };
  await db.routines.put(routine);
  return routine;
}

/** Remove uma rotina pelo id. */
export async function deleteRoutine(id: string): Promise<void> {
  await db.transaction('rw', [db.routines, db.weekPlan, db.dayOverrides], async () => {
    await db.routines.delete(id);
    await db.weekPlan.filter((row) => row.routineId === id).modify({ routineId: null });
    await db.dayOverrides.filter((row) => row.routine === id).delete();
  });
}

/**
 * Reordena as rotinas de uma categoria de acordo com a lista de ids fornecida.
 * Atribui `order = índice` para cada id na ordem dada.
 */
export async function reorderRoutines(categoryId: string, ids: string[]): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.routines, async () => {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (id !== undefined) {
        await db.routines
          .where('id')
          .equals(id)
          .modify({ order: i, updatedAt: now });
      }
    }
  });
  // Silencia aviso de variável não usada (categoryId é contexto semântico para o caller)
  void categoryId;
}

// ---------------------------------------------------------------------------
// Plano semanal
// ---------------------------------------------------------------------------

/**
 * Lê todas as linhas da tabela weekPlan e monta o Record<Weekday, string|null>.
 * Dias sem linha equivalem a null (sem treino planejado).
 */
export async function getWeekPlan(): Promise<WeekPlan> {
  const rows = await db.weekPlan.toArray();

  // Valor padrão: todos os dias sem treino
  const plan: WeekPlan = { 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };

  for (const row of rows) {
    plan[row.weekday] = row.routineId;
  }

  return plan;
}

/**
 * Define (ou limpa) a rotina de um weekday no plano semanal.
 * Faz upsert na tabela weekPlan (chave primária = weekday).
 *
 * @param weekday  0=domingo … 6=sábado
 * @param routineId  ID da rotina, ou null para "sem treino"
 */
export async function setWeekday(weekday: Weekday, routineId: string | null): Promise<void> {
  const row: WeekPlanRow = { weekday, routineId };
  await db.weekPlan.put(row);
}

// ---------------------------------------------------------------------------
// Overrides por data
// ---------------------------------------------------------------------------

/**
 * Cria ou substitui o override de uma data ISO.
 *
 * @param dateISO   Data no formato "YYYY-MM-DD"
 * @param routine   routineId, 'rest', ou null ("volta ao plano semanal")
 */
export async function setDayOverride(dateISO: string, routine: string | 'rest' | null): Promise<void> {
  const row: DayOverrideRow = { dateISO, routine };
  await db.dayOverrides.put(row);
}

/** Remove o override de uma data ISO, se existir. */
export async function clearDayOverride(dateISO: string): Promise<void> {
  await db.dayOverrides.delete(dateISO);
}

/** Retorna todos os overrides cadastrados. */
export async function listOverrides(): Promise<DayOverride[]> {
  return db.dayOverrides.toArray();
}

// ---------------------------------------------------------------------------
// Workouts
// ---------------------------------------------------------------------------

/**
 * Persiste um WorkoutLog.
 * Espera o objeto já montado pelo caller (incluindo id via uid() e createdAt).
 */
export async function addWorkout(log: WorkoutLog): Promise<WorkoutLog> {
  await db.workouts.add(log);
  return log;
}

/** Atualiza o realizado e preserva o alvo registrado no início da sessão. */
export async function updateWorkoutEntries(id: string, entries: WorkoutLog['entries']): Promise<void> {
  const updated = await db.workouts.update(id, { entries, prs: undefined });
  if (updated === 0) throw new Error('Este treino não está mais no histórico.');
}

/** Remove um workout pelo id. */
export async function saveFinishedWorkout(log: WorkoutLog): Promise<void> {
  await db.transaction('rw', db.workouts, async () => {
    if (await db.workouts.get(log.id) === undefined) await db.workouts.add(log);
  });
}

export async function deleteWorkout(id: string): Promise<void> {
  await db.workouts.delete(id);
}

// ---------------------------------------------------------------------------
// Peso corporal
// ---------------------------------------------------------------------------

/**
 * Adiciona (ou substitui) um ponto de peso corporal.
 * A chave primária é dateISO, então dois pontos no mesmo dia sobrescrevem.
 */
export async function addBodyWeight(point: BodyWeight): Promise<BodyWeight> {
  await db.bodyweight.put(point);
  return point;
}

/** Remove o registro de peso de uma data ISO. */
export async function deleteBodyWeight(dateISO: string): Promise<void> {
  await db.bodyweight.delete(dateISO);
}

// ---------------------------------------------------------------------------
// Medidas corporais (G14)
// ---------------------------------------------------------------------------

/**
 * Adiciona (ou substitui) um registro de medidas corporais.
 * A chave primária é dateISO, então dois registros no mesmo dia sobrescrevem.
 */
export async function addMeasurement(m: BodyMeasurement): Promise<BodyMeasurement> {
  await db.measurements.put(m);
  return m;
}

/** Remove o registro de medidas de uma data ISO. */
export async function deleteMeasurement(dateISO: string): Promise<void> {
  await db.measurements.delete(dateISO);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * Retorna as configurações do app.
 * Se a linha 'app' não existir, devolve DEFAULT_SETTINGS sem gravar nada.
 */
export async function getSettings(): Promise<Settings> {
  const row = await db.settings.get('app');
  if (row === undefined) return { ...DEFAULT_SETTINGS };
  // Remove a chave interna 'id' antes de retornar como Settings
  const { id: _id, ...settings } = row;
  return settings;
}

/**
 * Aplica um patch parcial nas configurações, fundindo com o que já estava salvo.
 * Cria a linha 'app' se ainda não existir.
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const current = await getSettings();
  const updated: Settings = { ...current, ...patch };
  await db.settings.put({ id: 'app', ...updated });
  return updated;
}

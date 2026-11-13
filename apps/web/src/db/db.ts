// Camada de persistência local-first (IndexedDB via Dexie). Toda a leitura/escrita do
// cliente passa por aqui. Sync com a api é da Fase 6 — por ora é 100% local e offline.
import Dexie, { type Table } from 'dexie';
import type {
  BodyMeasurement,
  Category,
  Exercise,
  Routine,
  WorkoutLog,
  BodyWeight,
  Settings,
  Weekday,
} from '@forja/core';

/** Linha única do plano semanal (weekday → routineId|null). */
export interface WeekPlanRow {
  weekday: Weekday;
  routineId: string | null;
}

/** Override por data (remarcar dia). */
export interface DayOverrideRow {
  dateISO: string;
  routine: string | 'rest' | null;
}

/** Key-value pra settings (linha única id='app'). */
export interface SettingsRow extends Settings {
  id: 'app';
}

export class ForjaDB extends Dexie {
  categories!: Table<Category, string>;
  exercises!: Table<Exercise, string>;
  routines!: Table<Routine, string>;
  weekPlan!: Table<WeekPlanRow, number>;
  dayOverrides!: Table<DayOverrideRow, string>;
  workouts!: Table<WorkoutLog, string>;
  bodyweight!: Table<BodyWeight, string>;
  settings!: Table<SettingsRow, string>;
  /** Medidas corporais (G14) — chave primária: dateISO. */
  measurements!: Table<BodyMeasurement, string>;

  constructor() {
    super('forja');
    // v1 — esquema original (mantido intacto para migrações seguras)
    this.version(1).stores({
      categories: 'id, slug, order',
      exercises: 'id, name, primaryMuscle, mode, custom',
      routines: 'id, categoryId, order',
      weekPlan: 'weekday',
      dayOverrides: 'dateISO',
      workouts: 'id, dateISO, routineId, categoryId',
      bodyweight: 'dateISO',
      settings: 'id',
    });
    // v2 — adiciona tabela de medidas corporais; repete TODOS os stores (exigência do Dexie)
    this.version(2).stores({
      categories: 'id, slug, order',
      exercises: 'id, name, primaryMuscle, mode, custom',
      routines: 'id, categoryId, order',
      weekPlan: 'weekday',
      dayOverrides: 'dateISO',
      workouts: 'id, dateISO, routineId, categoryId',
      bodyweight: 'dateISO',
      settings: 'id',
      measurements: 'dateISO',
    });
  }
}

export const db = new ForjaDB();

/** ID curto e ordenável (timestamp + aleatório). */
export function uid(prefix = ''): string {
  return (
    prefix +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7)
  );
}

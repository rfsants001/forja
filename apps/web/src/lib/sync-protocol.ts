import type { Category, DayOverride, Exercise, Routine, WorkoutLog } from '@forja/core';
import type { WeekPlanRow } from '../db/db';

export interface SyncValues {
  categories: Category;
  exercises: Exercise;
  routines: Routine;
  weekPlan: WeekPlanRow;
  dayOverrides: DayOverride;
  workouts: WorkoutLog;
}
export type SyncKind = keyof SyncValues;
export type SyncValue = SyncValues[SyncKind];

export const syncKinds = ['categories', 'exercises', 'routines', 'weekPlan', 'dayOverrides', 'workouts'] as const;
export const entityId = (kind: SyncKind, key: string) => kind + '/' + key;

export interface VersionedEntity {
  kind: SyncKind;
  key: string;
  value: SyncValue | null;
  version: number;
}

export interface LocalMutation {
  kind: SyncKind;
  key: string;
  value: SyncValue | null;
  before: SyncValue | null;
  baseVersion: number;
}

export interface WireBatch {
  protocol: 1;
  id: string;
  mutations: Array<Omit<LocalMutation, 'before'>>;
}
export interface QueueBatch {
  seq?: number;
  id: string;
  mutations: LocalMutation[];
  sent?: WireBatch;
  conflicts?: VersionedEntity[];
  reason?: string;
}
export interface SyncState {
  id: 'installation';
  installation: string;
  cursor: number;
  lastSync?: number;
}
export interface SyncDevice {
  id: string;
  name: string;
  owner: boolean;
}
export interface SyncSession {
  installation: string;
  origin: string;
  timeZone: string;
  device: SyncDevice | null;
}
export type SyncCounts = Partial<Record<SyncKind, number>>;
export type SyncReply = { status: 'accepted'; changes: VersionedEntity[] }
  | { status: 'conflict'; conflicts: VersionedEntity[]; reason?: string };

export function keyOf(kind: SyncKind, value: SyncValue): string {
  if (kind === 'weekPlan') return String((value as WeekPlanRow).weekday);
  if (kind === 'dayOverrides') return (value as DayOverride).dateISO;
  return (value as Category).id;
}

export function sharedValue(kind: SyncKind, value: SyncValue): SyncValue | null {
  if (kind !== 'exercises') return value;
  const exercise = value as Exercise;
  if (!exercise.custom) return null;
  const { note, demo, attribution, updatedAt, ...shared } = exercise;
  return { ...shared, demo: { kind: 'none' } };
}

function canonical(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') {
    const fields = Object.entries(value).filter(([, item]) => item !== undefined);
    return '{' + fields.sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  }
  return JSON.stringify(value);
}
export const sameValue = (left: unknown, right: unknown) => canonical(left) === canonical(right);


export function sameBaseline(kind: SyncKind, left: SyncValue | null, right: SyncValue | null) {
  if (!left || !right || !['categories', 'routines', 'exercises'].includes(kind)) return sameValue(left, right);
  const { createdAt: _left, updatedAt: _updatedLeft, ...leftFields } = left as Category | Routine | Exercise;
  const { createdAt: _right, updatedAt: _updatedRight, ...rightFields } = right as Category | Routine | Exercise;
  return sameValue(leftFields, rightFields);
}

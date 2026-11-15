import { DatabaseSync } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';

export const kinds = ['categories', 'exercises', 'routines', 'weekPlan', 'dayOverrides', 'workouts'];
const permanent = new Set(['categories', 'routines', 'exercises', 'workouts']);

export class ApiError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export function assert(condition, code = 'INVALID_DATA', status = 400) {
  if (!condition) throw new ApiError(status, code);
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, limit = 300) => typeof value === 'string' && value.length > 0 && value.length <= limit;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const date = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const integer = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;
const keyText = (value) => text(value, 160) && !/[\u0000-\u001f]/.test(value);
const matchesId = (value, id) => value.id === id;
const optional = (value, fn) => value === undefined || fn(value);
const muscle = (value) => [
  'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings',
  'glutes', 'calves', 'abs', 'obliques', 'traps', 'lats', 'fullbody', 'cardio', 'other',
].includes(value);
const mode = (value) => ['reps', 'time', 'cardio'].includes(value);
const policy = (value) => ['off', 'linear', 'greyskull', 'double', 'time', '531'].includes(value);
const list = (value, check, limit = 500) => Array.isArray(value) && value.length <= limit && value.every(check);
const set = (value) => object(value) && typeof value.done === 'boolean'
  && ['reps', 'weightKg', 'sec', 'distanceM', 'speedKmh'].every((key) => optional(value[key], (n) => finite(n) && n >= 0));
const target = (value) => object(value) && integer(value.sets, 0, 500)
  && optional(value.mainSets, (rows) => list(rows, (row) => object(row) && finite(row.weightKg)
    && finite(row.reps) && finite(row.percentOfTM) && typeof row.amrap === 'boolean'))
  && ['weightKg', 'sec', 'distanceM', 'speedKmh'].every((key) => optional(value[key], finite));
const workoutEntry = (value) => object(value) && keyText(value.exerciseId)
  && list(value.sets, set) && optional(value.warmupSets, (rows) => list(rows, set)) && target(value.target);
const routineEntry = (value) => object(value) && keyText(value.exerciseId) && integer(value.sets, 1, 500)
  && optional(value.progression, policy)
  && ['targetSec', 'restSec', 'incrementKg', 'targetDistanceM', 'targetSpeedKmh', 'trainingMaxKg',
    'trainingMaxIncrementKg', 'supersetGroup'].every((key) => optional(value[key], finite));

const validateByKind = {
  categories: (v, id) => matchesId(v, id) && text(v.name) && text(v.slug) && /^#[0-9a-f]{6}$/i.test(v.color)
    && finite(v.order) && finite(v.createdAt) && finite(v.updatedAt),
  exercises: (v, id) => matchesId(v, id) && text(v.name) && mode(v.mode) && muscle(v.primaryMuscle)
    && list(v.secondaryMuscles, muscle, 30) && list(v.equipment, (item) => text(item), 80),
  routines: (v, id) => matchesId(v, id) && text(v.name) && keyText(v.categoryId)
    && finite(v.createdAt) && finite(v.updatedAt) && list(v.exercises, routineEntry, 250),
  weekPlan: (v, id) => String(v.weekday) === id && (v.routineId === null || keyText(v.routineId)),
  dayOverrides: (v, id) => v.dateISO === id && (v.routine === null || keyText(v.routine)),
  workouts: (v, id) => matchesId(v, id) && date(v.dateISO) && finite(v.createdAt)
    && optional(v.routineId, keyText) && optional(v.durationSec, finite) && list(v.entries, workoutEntry, 250),
};

export function validateMutation(change) {
  assert(object(change) && kinds.includes(change.kind) && keyText(change.key)
    && integer(change.baseVersion, 0, Number.MAX_SAFE_INTEGER));
  if (change.kind === 'weekPlan') assert(/^[0-6]$/.test(change.key));
  if (change.kind === 'dayOverrides') assert(date(change.key));
  if (change.value === null) return null;
  assert(object(change.value) && validateByKind[change.kind](change.value, change.key));
  if (change.kind === 'exercises') {
    const { note, demo, attribution, ...shared } = change.value;
    return { ...shared, custom: true, demo: { kind: 'none' } };
  }
  return change.value;
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort()
    .map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
}

function sameValue(kind, left, right) {
  if (left === null || right === null) return left === right;
  if (kind === 'categories' || kind === 'routines' || kind === 'exercises') {
    const { createdAt: _leftCreated, updatedAt: _leftUpdated, ...leftFields } = left;
    const { createdAt: _rightCreated, updatedAt: _rightUpdated, ...rightFields } = right;
    return canonical(leftFields) === canonical(rightFields);
  }
  return canonical(left) === canonical(right);
}

export function createStore(filename) {
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, owner INTEGER NOT NULL,
      secret TEXT UNIQUE NOT NULL, createdAt INTEGER NOT NULL, lastSeen INTEGER NOT NULL, revokedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS pairings (
      id TEXT PRIMARY KEY, code TEXT NOT NULL, qr TEXT NOT NULL, expires INTEGER NOT NULL,
      failures INTEGER NOT NULL DEFAULT 0, proof TEXT, name TEXT, approved INTEGER NOT NULL DEFAULT 0,
      deviceId TEXT
    );
    CREATE TABLE IF NOT EXISTS entities (
      kind TEXT, key TEXT, version INTEGER NOT NULL, payload TEXT, PRIMARY KEY (kind, key)
    );
    CREATE TABLE IF NOT EXISTS changes (
      version INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, key TEXT NOT NULL, payload TEXT, batch TEXT
    );
    CREATE TABLE IF NOT EXISTS receipts (
      deviceId TEXT, id TEXT, hash TEXT NOT NULL, result TEXT NOT NULL, PRIMARY KEY (deviceId, id)
    );
  `);
  if (!db.prepare('PRAGMA table_info(changes)').all().some((column) => column.name === 'batch')) {
    db.exec('ALTER TABLE changes ADD COLUMN batch TEXT');
  }
  const get = (sql, ...params) => db.prepare(sql).get(...params);
  const all = (sql, ...params) => db.prepare(sql).all(...params);
  const run = (sql, ...params) => db.prepare(sql).run(...params);
  run('INSERT OR IGNORE INTO config VALUES (?,?)', 'installation', randomUUID());
  const installation = get('SELECT value FROM config WHERE key=?', 'installation').value;

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function decode(row) {
    return { kind: row.kind, key: row.key, version: row.version, value: row.payload === null ? null : JSON.parse(row.payload) };
  }
  function current(kind, key) {
    const row = get('SELECT * FROM entities WHERE kind=? AND key=?', kind, key);
    return row ? decode(row) : { kind, key, version: 0, value: null };
  }
  function record(kind, key, value, batch) {
    const payload = value === null ? null : JSON.stringify(value);
    const version = Number(run('INSERT INTO changes(kind,key,payload,batch) VALUES (?,?,?,?)', kind, key, payload, batch).lastInsertRowid);
    run(`INSERT INTO entities VALUES (?,?,?,?) ON CONFLICT(kind,key)
      DO UPDATE SET version=excluded.version, payload=excluded.payload`, kind, key, version, payload);
    return { kind, key, version, value };
  }
  function feed(after) {
    const newest = get('SELECT COALESCE(max(version), 0) AS version FROM changes').version;
    assert(after <= newest, 'CURSOR_RESET', 409);
    const rows = all('SELECT * FROM changes WHERE version>? ORDER BY version LIMIT 150', after);
    const last = rows.at(-1);
    if (last?.batch) {
      rows.push(...all('SELECT * FROM changes WHERE version>? AND batch=? ORDER BY version', last.version, last.batch));
    }
    const changes = rows.map(decode);
    const cursor = changes.at(-1)?.version ?? after;
    return { changes, cursor, more: cursor < newest };
  }
  function summary() {
    return Object.fromEntries(all('SELECT kind,count(*) AS n FROM entities WHERE payload IS NOT NULL GROUP BY kind')
      .map(({ kind, n }) => [kind, n]));
  }

  function push(device, body) {
    assert(body.protocol === 1, 'UPDATE_REQUIRED', 409);
    assert(keyText(body.id) && list(body.mutations, object, 5000) && body.mutations.length > 0);
    const hash = createHash('sha256').update(canonical(body)).digest('hex');
    const seen = new Set();
    const changes = body.mutations.map((change) => {
      const value = validateMutation(change);
      const id = change.kind + '/' + change.key;
      assert(!seen.has(id));
      seen.add(id);
      return { kind: change.kind, key: change.key, baseVersion: change.baseVersion, value };
    });
    return transaction(() => {
      const receipt = get('SELECT hash,result FROM receipts WHERE deviceId=? AND id=?', device.id, body.id);
      if (receipt) {
        assert(receipt.hash === hash, 'REUSED_OPERATION', 409);
        return JSON.parse(receipt.result);
      }
      const conflicts = [];
      const before = changes.map((change) => {
        const previous = current(change.kind, change.key);
        const identical = sameValue(change.kind, change.value, previous.value);
        if (!identical && (change.baseVersion !== previous.version
          || (previous.version > 0 && previous.value === null && permanent.has(change.kind)))) {
          conflicts.push(previous);
        }
        return { previous, identical };
      });
      if (conflicts.length) return { status: 'conflict', conflicts };

      const batch = device.id + '/' + body.id;
      const proposed = new Map(changes.map((change) => [change.kind + '/' + change.key, change.value]));
      const resulting = (kind, key) => {
        const id = kind + '/' + key;
        return proposed.has(id) ? proposed.get(id) : current(kind, key).value;
      };
      for (const change of changes) {
        if (change.kind === 'categories' && change.value === null) {
          const remaining = all("SELECT key FROM entities WHERE kind='routines' AND json_extract(payload,'$.categoryId')=?", change.key)
            .some((row) => resulting('routines', row.key)?.categoryId === change.key);
          if (remaining) conflicts.push(current(change.kind, change.key));
        }
        if (change.value === null) continue;
        let dependency;
        if (change.kind === 'routines') dependency = ['categories', change.value.categoryId];
        if (change.kind === 'weekPlan' && change.value.routineId) dependency = ['routines', change.value.routineId];
        if (change.kind === 'dayOverrides' && change.value.routine && change.value.routine !== 'rest') {
          dependency = ['routines', change.value.routine];
        }
        if (dependency && !resulting(...dependency)) conflicts.push(current(change.kind, change.key));
        if (change.kind === 'routines') {
          for (const entry of change.value.exercises) {
            const exercise = current('exercises', entry.exerciseId);
            if (exercise.version > 0 && !resulting('exercises', entry.exerciseId)) {
              conflicts.push(current(change.kind, change.key));
              break;
            }
          }
        }
      }
      if (conflicts.length) return { status: 'conflict', conflicts, reason: 'INVALID_REFERENCE' };

      const written = [];
      for (const [index, change] of changes.entries()) {
        const { identical, previous } = before[index];
        written.push(identical ? previous : record(change.kind, change.key, change.value, batch));
      }
      for (const [index, change] of changes.entries()) {
        const previous = before[index].previous.value;
        if (change.kind !== 'routines' || change.value !== null || previous === null) continue;
        const linkedDays = all(`SELECT * FROM entities WHERE
          (kind='weekPlan' AND json_extract(payload,'$.routineId')=?) OR
          (kind='dayOverrides' AND json_extract(payload,'$.routine')=?)`, change.key, change.key);
        for (const item of linkedDays) {
          const row = decode(item);
          written.push(record(row.kind, row.key, row.kind === 'weekPlan' ? { ...row.value, routineId: null } : null, batch));
        }
        for (const item of all(`SELECT * FROM entities WHERE kind='workouts'
          AND json_extract(payload,'$.routineId')=? AND json_extract(payload,'$.routineName') IS NULL`, change.key)) {
          const row = decode(item);
          written.push(record(row.kind, row.key, { ...row.value, routineName: previous.name }, batch));
        }
      }
      const result = { status: 'accepted', changes: written };
      run('INSERT INTO receipts VALUES (?,?,?,?)', device.id, body.id, hash, JSON.stringify(result));
      return result;
    });
  }

  return { close: () => db.close(), installation, get, all, run, transaction, feed, summary, push };
}

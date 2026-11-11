/**
 * backup.ts — Export/import completo dos dados locais do Forja.
 * Fase 4: "dono dos seus dados". Sem libs externas — Blob + FileReader nativos.
 */

import { db } from '../db/db';

// ---------------------------------------------------------------------------
// Formato do arquivo de backup
// ---------------------------------------------------------------------------

const BACKUP_APP = 'forja';
const BACKUP_VERSION = 1;

interface BackupMeta {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string; // ISO 8601
}

interface BackupData {
  categories?: unknown[];
  exercises?: unknown[];
  routines?: unknown[];
  weekPlan?: unknown[];
  dayOverrides?: unknown[];
  workouts?: unknown[];
  bodyweight?: unknown[];
  settings?: unknown[];
}

interface BackupFile {
  _meta: BackupMeta;
  data: BackupData;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Lê todas as 8 tabelas e retorna JSON formatado. */
export async function exportAll(): Promise<string> {
  const [
    categories,
    exercises,
    routines,
    weekPlan,
    dayOverrides,
    workouts,
    bodyweight,
    settings,
  ] = await Promise.all([
    db.categories.toArray(),
    db.exercises.toArray(),
    db.routines.toArray(),
    db.weekPlan.toArray(),
    db.dayOverrides.toArray(),
    db.workouts.toArray(),
    db.bodyweight.toArray(),
    db.settings.toArray(),
  ]);

  const backup: BackupFile = {
    _meta: {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
    },
    data: {
      categories,
      exercises,
      routines,
      weekPlan,
      dayOverrides,
      workouts,
      bodyweight,
      settings,
    },
  };

  return JSON.stringify(backup, null, 2);
}

/** Dispara download do JSON com nome forja-backup-AAAA-MM-DD.json. */
export async function downloadBackup(): Promise<void> {
  const json = await exportAll();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10); // AAAA-MM-DD
  const filename = `forja-backup-${dateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  // Libera o object URL logo depois do click
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface ImportResult {
  counts: Record<string, number>;
}

/**
 * Importa dados de um JSON de backup.
 *
 * - `replace`: limpa cada tabela e insere todos os registros do arquivo.
 * - `merge`: insere por cima (bulkPut) — itens com mesmo id são sobrescritos,
 *   novos são adicionados, existentes sem conflito ficam intactos.
 *
 * Tabelas ausentes no arquivo são ignoradas sem erro.
 */
export async function importAll(
  json: string,
  mode: 'replace' | 'merge',
): Promise<ImportResult> {
  // Parse
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error('Arquivo inválido: não é um JSON válido.');
  }

  // Validação mínima da estrutura
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('_meta' in parsed) ||
    !('data' in parsed)
  ) {
    throw new Error('Arquivo inválido: estrutura inesperada (falta _meta ou data).');
  }

  const file = parsed as { _meta: unknown; data: unknown };

  if (
    typeof file._meta !== 'object' ||
    file._meta === null ||
    !('app' in file._meta) ||
    (file._meta as { app: unknown }).app !== BACKUP_APP
  ) {
    throw new Error(
      'Arquivo inválido: este backup não pertence ao Forja (_meta.app incorreto).',
    );
  }

  const data = (typeof file.data === 'object' && file.data !== null
    ? file.data
    : {}) as BackupData;

  // Mapeamento tabela → dados do arquivo
  const tableMap = [
    { table: db.categories,  key: 'categories'  as const },
    { table: db.exercises,   key: 'exercises'   as const },
    { table: db.routines,    key: 'routines'    as const },
    { table: db.weekPlan,    key: 'weekPlan'    as const },
    { table: db.dayOverrides,key: 'dayOverrides' as const },
    { table: db.workouts,    key: 'workouts'    as const },
    { table: db.bodyweight,  key: 'bodyweight'  as const },
    { table: db.settings,    key: 'settings'    as const },
  ] as const;

  const counts: Record<string, number> = {};

  await db.transaction('rw', db.tables, async () => {
    for (const { table, key } of tableMap) {
      const rows = data[key];

      // Tabela ausente no arquivo → pula
      if (!Array.isArray(rows)) continue;

      if (mode === 'replace') {
        await table.clear();
      }

      // bulkPut funciona em ambos os modos: insert ou upsert
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (table as any).bulkPut(rows);
      counts[key] = rows.length;
    }
  });

  return { counts };
}

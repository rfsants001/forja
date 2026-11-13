/**
 * plan-share.ts — G6: Exportar, importar e imprimir o plano semanal.
 *
 * O "plano" é: categorias + rotinas + plano semanal.
 * NÃO inclui workouts, peso corporal, settings, nem exercícios.
 *
 * Formato do arquivo:
 * { _meta: { app:'forja', kind:'plan', version:1, exportedAt:ISO },
 *   categories: Category[], routines: Routine[], weekPlan: WeekPlanRow[] }
 */

import type { Category, Routine } from '@forja/core';
import type { WeekPlanRow } from '../db/db';
import { db } from '../db/db';
import { upsertCategory, upsertRoutine, setWeekday } from '../db/repo';

// ---------------------------------------------------------------------------
// Formato do arquivo de plano
// ---------------------------------------------------------------------------

const PLAN_APP = 'forja';
const PLAN_KIND = 'plan';
const PLAN_VERSION = 1;

interface PlanMeta {
  app: typeof PLAN_APP;
  kind: typeof PLAN_KIND;
  version: typeof PLAN_VERSION;
  exportedAt: string;
}

interface PlanFile {
  _meta: PlanMeta;
  categories: Category[];
  routines: Routine[];
  weekPlan: WeekPlanRow[];
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Lê categorias, rotinas e plano semanal; retorna JSON formatado. */
export async function exportPlan(): Promise<string> {
  const [categories, routines, weekPlan] = await Promise.all([
    db.categories.toArray(),
    db.routines.toArray(),
    db.weekPlan.toArray(),
  ]);

  const plan: PlanFile = {
    _meta: {
      app: PLAN_APP,
      kind: PLAN_KIND,
      version: PLAN_VERSION,
      exportedAt: new Date().toISOString(),
    },
    categories,
    routines,
    weekPlan,
  };

  return JSON.stringify(plan, null, 2);
}

/** Dispara download de `forja-plano-AAAA-MM-DD.json`. */
export async function downloadPlan(): Promise<void> {
  const json = await exportPlan();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `forja-plano-${dateStr}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export interface PlanImportCounts {
  categories: number;
  routines: number;
  weekPlan: number;
}

/**
 * Importa um arquivo de plano no modo 'merge':
 * - Categorias e rotinas: upsert por id (preserva workouts e peso).
 * - Plano semanal: sobrescreve apenas os dias presentes no arquivo.
 */
export async function importPlan(json: string): Promise<PlanImportCounts> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new Error('Arquivo inválido: não é um JSON válido.');
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('_meta' in parsed)
  ) {
    throw new Error('Arquivo inválido: estrutura inesperada.');
  }

  const file = parsed as { _meta: unknown; categories?: unknown; routines?: unknown; weekPlan?: unknown };

  if (
    typeof file._meta !== 'object' ||
    file._meta === null ||
    !('app' in file._meta) ||
    !('kind' in file._meta) ||
    (file._meta as { app: unknown }).app !== PLAN_APP ||
    (file._meta as { kind: unknown }).kind !== PLAN_KIND
  ) {
    throw new Error('Arquivo inválido: este arquivo não é um plano do Forja.');
  }

  const categories = Array.isArray(file.categories) ? (file.categories as Category[]) : [];
  const routines = Array.isArray(file.routines) ? (file.routines as Routine[]) : [];
  const weekPlanRows = Array.isArray(file.weekPlan) ? (file.weekPlan as WeekPlanRow[]) : [];

  // Upsert categorias
  for (const cat of categories) {
    if (typeof cat.id === 'string' && typeof cat.name === 'string') {
      await upsertCategory(cat);
    }
  }

  // Upsert rotinas
  for (const rot of routines) {
    if (typeof rot.id === 'string' && typeof rot.name === 'string') {
      await upsertRoutine(rot);
    }
  }

  // Plano semanal: sobrescreve dias presentes
  for (const row of weekPlanRows) {
    if (typeof row.weekday === 'number' && row.weekday >= 0 && row.weekday <= 6) {
      await setWeekday(row.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6, row.routineId ?? null);
    }
  }

  return {
    categories: categories.length,
    routines: routines.length,
    weekPlan: weekPlanRows.length,
  };
}

// ---------------------------------------------------------------------------
// Print → PDF
// ---------------------------------------------------------------------------

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Lê o plano atual do banco e abre uma janela de impressão com HTML limpo.
 * O usuário salva como PDF pelo diálogo nativo do browser.
 * O CSS dedicado de print (print.css) é importado em Perfil.tsx.
 */
export async function printPlan(): Promise<void> {
  const [categories, routines, weekPlanRows] = await Promise.all([
    db.categories.orderBy('order').toArray(),
    db.routines.orderBy('order').toArray(),
    db.weekPlan.toArray(),
  ]);

  // Busca exercícios referenciados nas rotinas
  const exIds = new Set<string>();
  for (const rot of routines) {
    for (const re of rot.exercises) {
      exIds.add(re.exerciseId);
    }
  }
  const exercises = await db.exercises
    .where('id')
    .anyOf(Array.from(exIds))
    .toArray();
  const exMap = new Map(exercises.map((e) => [e.id, e]));

  // Mapa weekday → routineId
  const weekMap = new Map<number, string | null>();
  for (const row of weekPlanRows) {
    weekMap.set(row.weekday, row.routineId ?? null);
  }

  // Mapa routineId → Routine
  const routineMap = new Map(routines.map((r) => [r.id, r]));

  // Monta o HTML do plano
  const semana = DAY_LABELS.map((dayLabel, i) => {
    const routineId = weekMap.get(i) ?? null;
    if (routineId === null) {
      return `<tr><td class="day">${dayLabel}</td><td class="routine-name muted">Descanso</td></tr>`;
    }
    const rot = routineMap.get(routineId);
    if (rot === undefined) {
      return `<tr><td class="day">${dayLabel}</td><td class="routine-name muted">—</td></tr>`;
    }
    return `<tr><td class="day">${dayLabel}</td><td class="routine-name">${escHtml(rot.name)}</td></tr>`;
  }).join('\n');

  const catSections = categories.map((cat) => {
    const catRoutines = routines.filter((r) => r.categoryId === cat.id);
    if (catRoutines.length === 0) return '';

    const rotHtml = catRoutines.map((rot) => {
      const exRows = rot.exercises.map((re) => {
        const ex = exMap.get(re.exerciseId);
        const exName = ex?.name ?? re.exerciseId;
        const repsLabel = re.targetReps !== undefined
          ? re.targetReps
          : re.targetSec !== undefined
          ? `${re.targetSec}s`
          : '—';
        return `<tr>
          <td class="ex-name">${escHtml(exName)}</td>
          <td class="ex-sets">${re.sets}×</td>
          <td class="ex-reps">${escHtml(repsLabel)}</td>
        </tr>`;
      }).join('\n');

      return `<div class="routine-block">
        <h3 class="routine-title">${escHtml(rot.name)}</h3>
        ${rot.note ? `<p class="routine-note">${escHtml(rot.note)}</p>` : ''}
        <table class="ex-table">
          <thead><tr><th>Exercício</th><th>Séries</th><th>Reps / Tempo</th></tr></thead>
          <tbody>${exRows}</tbody>
        </table>
      </div>`;
    }).join('\n');

    return `<section class="cat-section">
      <h2 class="cat-title" style="border-left: 4px solid ${escHtml(cat.color)}">
        ${cat.icon ? escHtml(cat.icon) + ' ' : ''}${escHtml(cat.name)}
      </h2>
      ${rotHtml}
    </section>`;
  }).join('\n');

  const dateStr = new Date().toLocaleDateString('pt-BR');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Forja — Plano de Treino</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    color: #111;
    background: #fff;
    padding: 24px;
  }
  .header { margin-bottom: 20px; border-bottom: 2px solid #111; padding-bottom: 10px; }
  .header h1 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
  .header .subtitle { font-size: 12px; color: #666; margin-top: 4px; }
  .week-section { margin-bottom: 24px; }
  .week-section h2 { font-size: 14px; font-weight: 700; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; color: #444; }
  .week-table { width: 100%; border-collapse: collapse; }
  .week-table td { padding: 6px 8px; border-bottom: 1px solid #e5e5e5; }
  .week-table .day { font-weight: 700; width: 60px; }
  .week-table .routine-name { }
  .week-table .muted { color: #999; }
  .cat-section { margin-bottom: 24px; break-inside: avoid; }
  .cat-title { font-size: 15px; font-weight: 700; padding-left: 10px; margin-bottom: 12px; }
  .routine-block { margin-bottom: 16px; padding-left: 14px; break-inside: avoid; }
  .routine-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; color: #333; }
  .routine-note { font-size: 11px; color: #777; margin-bottom: 6px; font-style: italic; }
  .ex-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .ex-table th { text-align: left; font-weight: 600; color: #666; padding: 3px 6px 3px 0; border-bottom: 1px solid #ddd; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  .ex-table td { padding: 4px 6px 4px 0; border-bottom: 1px solid #f0f0f0; }
  .ex-table .ex-sets, .ex-table .ex-reps { text-align: right; width: 70px; color: #444; }
  @media print {
    body { padding: 0; }
    .cat-section { break-inside: avoid; }
    .routine-block { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="header">
  <h1>Forja — Plano de Treino</h1>
  <div class="subtitle">Exportado em ${dateStr}</div>
</div>

<div class="week-section">
  <h2>Semana</h2>
  <table class="week-table"><tbody>${semana}</tbody></table>
</div>

${catSections}
</body>
</html>`;

  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (printWindow === null) {
    throw new Error(
      'Não foi possível abrir a janela de impressão. Verifique se o navegador bloqueou pop-ups.',
    );
  }

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  // Aguarda recursos carregarem antes de print()
  printWindow.onload = () => {
    printWindow.print();
  };
}

// ---------------------------------------------------------------------------
// Utilitário
// ---------------------------------------------------------------------------

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

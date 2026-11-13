/**
 * starter-plans.ts — P5-001 / G9: Planos de treino prontos para instanciar.
 *
 * Cada plano referencia exercícios pelo NOME CANÔNICO (string), nunca
 * por id `ds-XXXX` frágil. A resolução acontece em `applyStarterPlan`
 * usando casamento normalizado contra o catálogo Dexie:
 *   1. Match exato por nome normalizado.
 *   2. Fallback: qualquer exercício cujo nome normalizado contenha a query.
 *   3. Sem match: exercício pulado, nome acumulado em `unresolved`.
 *
 * Idempotente: se já existir rotina com o mesmo nome, o apply pula e
 * avisa via `skipped[]` em vez de duplicar silenciosamente.
 */

import type { RoutineExercise, Weekday } from '@forja/core';
import { db } from '../db/db';
import { upsertCategory, upsertRoutine, setWeekday } from '../db/repo';
import { normalizeExName } from './normalize';

// ---------------------------------------------------------------------------
// Tipos públicos
// ---------------------------------------------------------------------------

/** Exercício de um plano referenciado por nome canônico (en). */
export interface PlanExercise {
  /** Nome canônico usado para resolver contra o catálogo. */
  canonicalName: string;
  sets: number;
  targetReps?: string;
  restSec?: number;
  /** 'linear' para 5×5; 'off' para treinos de hipertrofia sem progressão automática. */
  progression?: RoutineExercise['progression'];
  /** Incremento de carga em kg por sessão (ativo quando progression = 'linear'). */
  incrementKg?: number;
  note?: string;
}

/** Rotina dentro de um plano. */
export interface PlanRoutine {
  /** Nome da rotina (ex: "Full Body", "Upper A"). */
  name: string;
  note?: string;
  exercises: PlanExercise[];
}

/** Plano de treino completo. */
export interface StarterPlan {
  id: string;
  name: string;
  description: string;
  /** Dias sugeridos (0=dom … 6=sáb). */
  weekdays: Weekday[];
  /** Cor hex da categoria criada. */
  color: string;
  /** Ícone lucide ou emoji para a categoria. */
  icon: string;
  routines: PlanRoutine[];
}

/** Resultado de `applyStarterPlan`. */
export interface ApplyResult {
  /** Número de rotinas criadas. */
  created: number;
  /** Número de rotinas puladas (já existiam com o mesmo nome). */
  skipped: number;
  /** Nomes canônicos de exercícios que não foram encontrados no catálogo. */
  unresolved: string[];
}

// ---------------------------------------------------------------------------
// Definição dos planos
// ---------------------------------------------------------------------------

export const STARTER_PLANS: StarterPlan[] = [
  // -------------------------------------------------------------------------
  // 1. Full Body 3×/semana — iniciante, seg/qua/sex
  // -------------------------------------------------------------------------
  {
    id: 'fullbody-3x',
    name: 'Full Body 3×',
    description: 'Treino completo 3 vezes por semana. Ideal para iniciantes: compostos principais + assistência básica.',
    weekdays: [1, 3, 5], // seg, qua, sex
    color: '#4ade80',
    icon: 'Dumbbell',
    routines: [
      {
        name: 'Full Body',
        note: 'Mesmo treino nas 3 sessões semanais',
        exercises: [
          {
            canonicalName: 'barbell full squat',
            sets: 3,
            targetReps: '8–10',
            restSec: 120,
            progression: 'off',
          },
          {
            canonicalName: 'barbell bench press',
            sets: 3,
            targetReps: '8–10',
            restSec: 120,
            progression: 'off',
          },
          {
            canonicalName: 'barbell bent over row',
            sets: 3,
            targetReps: '8–10',
            restSec: 120,
            progression: 'off',
          },
          {
            canonicalName: 'barbell seated overhead press',
            sets: 3,
            targetReps: '8–10',
            restSec: 90,
            progression: 'off',
          },
          {
            canonicalName: 'barbell romanian deadlift',
            sets: 3,
            targetReps: '10–12',
            restSec: 90,
            progression: 'off',
          },
          {
            canonicalName: 'pull-up',
            sets: 3,
            targetReps: '5–8',
            restSec: 90,
            progression: 'off',
            note: 'Assistido se necessário',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 2. Upper / Lower 4×/semana — intermediário, seg/ter/qui/sex
  // -------------------------------------------------------------------------
  {
    id: 'upper-lower-4x',
    name: 'Upper / Lower 4×',
    description: 'Divisão superior/inferior 4 vezes por semana. Upper A e B alternam foco em força e hipertrofia.',
    weekdays: [1, 2, 4, 5], // seg, ter, qui, sex
    color: '#60a5fa',
    icon: 'Zap',
    routines: [
      {
        name: 'Upper A',
        note: 'Foco em força — repetições mais baixas',
        exercises: [
          {
            canonicalName: 'barbell bench press',
            sets: 4,
            targetReps: '5–6',
            restSec: 180,
            progression: 'off',
          },
          {
            canonicalName: 'barbell bent over row',
            sets: 4,
            targetReps: '5–6',
            restSec: 180,
            progression: 'off',
          },
          {
            canonicalName: 'barbell seated overhead press',
            sets: 3,
            targetReps: '6–8',
            restSec: 120,
            progression: 'off',
          },
          {
            canonicalName: 'pull-up',
            sets: 3,
            targetReps: '5–8',
            restSec: 120,
            progression: 'off',
          },
          {
            canonicalName: 'dumbbell biceps curl',
            sets: 3,
            targetReps: '10–12',
            restSec: 60,
            progression: 'off',
          },
          {
            canonicalName: 'cable pushdown',
            sets: 3,
            targetReps: '10–12',
            restSec: 60,
            progression: 'off',
          },
        ],
      },
      {
        name: 'Lower A',
        note: 'Foco em força — agachamento pesado',
        exercises: [
          {
            canonicalName: 'barbell full squat',
            sets: 4,
            targetReps: '5–6',
            restSec: 180,
            progression: 'off',
          },
          {
            canonicalName: 'barbell romanian deadlift',
            sets: 3,
            targetReps: '8–10',
            restSec: 120,
            progression: 'off',
          },
          {
            canonicalName: 'lever leg extension',
            sets: 3,
            targetReps: '10–15',
            restSec: 60,
            progression: 'off',
          },
          {
            canonicalName: 'lever seated leg curl',
            sets: 3,
            targetReps: '10–15',
            restSec: 60,
            progression: 'off',
          },
          {
            canonicalName: 'barbell glute bridge',
            sets: 3,
            targetReps: '12–15',
            restSec: 60,
            progression: 'off',
          },
        ],
      },
      {
        name: 'Upper B',
        note: 'Foco em hipertrofia — mais volume',
        exercises: [
          {
            canonicalName: 'barbell incline bench press',
            sets: 4,
            targetReps: '8–12',
            restSec: 120,
            progression: 'off',
          },
          {
            canonicalName: 'dumbbell one arm bent-over row',
            sets: 4,
            targetReps: '10–12',
            restSec: 90,
            progression: 'off',
          },
          {
            canonicalName: 'dumbbell seated shoulder press',
            sets: 3,
            targetReps: '10–12',
            restSec: 90,
            progression: 'off',
          },
          {
            canonicalName: 'cable lat pulldown full range of motion',
            sets: 3,
            targetReps: '10–12',
            restSec: 90,
            progression: 'off',
          },
          {
            canonicalName: 'dumbbell fly',
            sets: 3,
            targetReps: '12–15',
            restSec: 60,
            progression: 'off',
          },
          {
            canonicalName: 'dumbbell lateral raise',
            sets: 3,
            targetReps: '12–15',
            restSec: 60,
            progression: 'off',
          },
        ],
      },
      {
        name: 'Lower B',
        note: 'Foco em hipertrofia — volume e isolados',
        exercises: [
          {
            canonicalName: 'barbell romanian deadlift',
            sets: 4,
            targetReps: '10–12',
            restSec: 120,
            progression: 'off',
          },
          {
            canonicalName: 'dumbbell lunge',
            sets: 3,
            targetReps: '10–12',
            restSec: 90,
            progression: 'off',
          },
          {
            canonicalName: 'lever leg extension',
            sets: 3,
            targetReps: '12–15',
            restSec: 60,
            progression: 'off',
          },
          {
            canonicalName: 'lever seated leg curl',
            sets: 3,
            targetReps: '12–15',
            restSec: 60,
            progression: 'off',
          },
          {
            canonicalName: 'barbell glute bridge',
            sets: 4,
            targetReps: '15–20',
            restSec: 60,
            progression: 'off',
          },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 3. 5×5 (StrongLifts-style) — força linear, 3×/sem alternando A e B
  // -------------------------------------------------------------------------
  {
    id: 'stronglifts-5x5',
    name: '5×5 (StrongLifts)',
    description: 'Força linear clássica. 3 vezes por semana alternando Treino A e B. Adiciona 2,5 kg por sessão nos compostos.',
    weekdays: [1, 3, 5], // seg, qua, sex
    color: '#f97316',
    icon: 'TrendingUp',
    routines: [
      {
        name: 'Treino A — 5×5',
        note: 'Agachamento + Supino + Remada (alternar com Treino B)',
        exercises: [
          {
            canonicalName: 'barbell full squat',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 2.5,
            note: 'Aumentar 2,5 kg a cada sessão bem-sucedida',
          },
          {
            canonicalName: 'barbell bench press',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 2.5,
            note: 'Supino — alternar com Desenvolvimento no Treino B',
          },
          {
            canonicalName: 'barbell bent over row',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 2.5,
            note: 'Remada curvada com barra',
          },
        ],
      },
      {
        name: 'Treino B — 5×5',
        note: 'Agachamento + Desenvolvimento + Levantamento Terra (alternar com Treino A)',
        exercises: [
          {
            canonicalName: 'barbell full squat',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 2.5,
            note: 'Sempre em toda sessão — base do StrongLifts',
          },
          {
            canonicalName: 'barbell seated overhead press',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 1.25,
            note: 'Desenvolvimento — alternado com Supino no Treino A',
          },
          {
            canonicalName: 'barbell deadlift',
            sets: 1,
            targetReps: '5',
            restSec: 240,
            progression: 'linear',
            incrementKg: 5,
            note: 'Terra — 1 série pesada; incremento de 5 kg por sessão',
          },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Resolução de exercícios pelo catálogo Dexie
// ---------------------------------------------------------------------------

/**
 * Monta o mapa nome-normalizado → exerciseId a partir do catálogo.
 * Carregado uma vez por chamada de applyStarterPlan (sem cache global
 * para evitar stale data entre applies).
 */
async function buildExerciseMap(): Promise<Map<string, string>> {
  const all = await db.exercises.toArray();
  const map = new Map<string, string>();
  for (const ex of all) {
    map.set(normalizeExName(ex.name), ex.id);
  }
  return map;
}

/**
 * Resolve um nome canônico para um exerciseId do catálogo.
 *
 * Estratégia:
 *   1. Match exato (nome normalizado idêntico).
 *   2. Fallback: primeira entrada cujo nome normalizado contenha a query.
 *   3. Sem match: retorna null (exercício será pulado e registrado em unresolved).
 */
function resolveByName(
  canonicalName: string,
  exMap: Map<string, string>,
): string | null {
  const norm = normalizeExName(canonicalName);

  // 1. Exato
  const exact = exMap.get(norm);
  if (exact !== undefined) return exact;

  // 2. Includes fallback
  for (const [key, id] of exMap) {
    if (key.includes(norm) || norm.includes(key)) return id;
  }

  return null;
}

// ---------------------------------------------------------------------------
// applyStarterPlan
// ---------------------------------------------------------------------------

/**
 * Instancia um plano de treino no banco local:
 *   1. Cria (ou reusa por slug) a categoria do plano.
 *   2. Para cada rotina: resolve exercícios por nome, cria via upsertRoutine.
 *      Pula silenciosamente rotinas que já existam com o mesmo nome (idempotente).
 *   3. Mapeia os dias sugeridos com setWeekday (sobrepõe configuração atual).
 *
 * Retorna um resumo com contagens e exercícios não resolvidos.
 */
export async function applyStarterPlan(planId: string): Promise<ApplyResult> {
  const plan = STARTER_PLANS.find((p) => p.id === planId);
  if (plan === undefined) throw new Error(`Plano "${planId}" não encontrado.`);

  const exMap = await buildExerciseMap();

  // Busca ou cria a categoria para este plano
  const slug = `starter-${plan.id}`;
  const existingCat = await db.categories.where('slug').equals(slug).first();
  const category = await upsertCategory({
    id: existingCat?.id,
    name: plan.name,
    slug,
    color: plan.color,
    icon: plan.icon,
    order: 100, // depois das categorias do usuário
  });

  // Nomes de rotinas já existentes para detectar duplicatas
  const existingRoutineNames = new Set(
    (await db.routines.toArray()).map((r) => r.name.toLowerCase().trim()),
  );

  let created = 0;
  let skipped = 0;
  const unresolved: string[] = [];
  const createdRoutineIds: string[] = [];

  for (let i = 0; i < plan.routines.length; i++) {
    const planRoutine = plan.routines[i]!;

    // Verificação de duplicata por nome
    if (existingRoutineNames.has(planRoutine.name.toLowerCase().trim())) {
      skipped++;
      // Tenta recuperar o id da rotina existente para o mapeamento de weekdays
      const existing = await db.routines.where('name').equals(planRoutine.name).first();
      if (existing !== undefined) createdRoutineIds.push(existing.id);
      continue;
    }

    // Resolve exercícios
    const exercises: RoutineExercise[] = [];
    for (const pe of planRoutine.exercises) {
      const exerciseId = resolveByName(pe.canonicalName, exMap);
      if (exerciseId === null) {
        unresolved.push(pe.canonicalName);
        continue;
      }
      exercises.push({
        exerciseId,
        sets: pe.sets,
        targetReps: pe.targetReps,
        restSec: pe.restSec,
        progression: pe.progression,
        incrementKg: pe.incrementKg,
        note: pe.note,
      });
    }

    const routine = await upsertRoutine({
      name: planRoutine.name,
      categoryId: category.id,
      note: planRoutine.note,
      exercises,
      order: i,
    });

    createdRoutineIds.push(routine.id);
    created++;
  }

  // Mapeia dias sugeridos às rotinas criadas (distribui em sequência circular)
  if (createdRoutineIds.length > 0) {
    for (let d = 0; d < plan.weekdays.length; d++) {
      const weekday = plan.weekdays[d] as Weekday;
      // Distribui rotinas em rodízio pelos dias sugeridos
      const routineId = createdRoutineIds[d % createdRoutineIds.length]!;
      await setWeekday(weekday, routineId);
    }
  }

  return { created, skipped, unresolved: [...new Set(unresolved)] };
}

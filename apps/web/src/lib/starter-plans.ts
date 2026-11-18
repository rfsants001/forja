import { syncWrite } from '../db/sync-write';
/**
 * starter-plans.ts — P5-001 / G9: Planos de treino prontos para instanciar.
 *
 * Cada plano referencia exercícios pelo NOME CANÔNICO (string), nunca
 * por id `ds-XXXX` frágil. A resolução acontece em `applyStarterPlan`
 * usando casamento normalizado contra o catálogo Dexie:
 *   1. Match exato por nome normalizado.
 *   2. Preenche os dias livres por padrão e reutiliza rotinas do mesmo plano.
 */

import type { RoutineExercise, Weekday } from '@forja/core';
import { db } from '../db/db';
import { upsertCategory, upsertExercise, upsertRoutine, setWeekday } from '../db/repo';
import { loadExerciseDataset } from './exercise-dataset';
import type { Lang } from './i18n';
import { UiError } from './ui-error';
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
  targetSec?: number;
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
  preservedDays: number;
}

// ---------------------------------------------------------------------------
// Definição dos planos
// ---------------------------------------------------------------------------

type Localized = string | { pt: string; en: string };
type SeedExercise = Omit<PlanExercise, 'note'> & { note?: Localized };
type SeedRoutine = Omit<PlanRoutine, 'name' | 'note' | 'exercises'> & {
  name: Localized; note?: Localized; exercises: SeedExercise[];
};
type SeedPlan = Omit<StarterPlan, 'name' | 'description' | 'routines'> & {
  name: Localized; description: Localized; routines: SeedRoutine[];
};

const STARTER_PLANS: SeedPlan[] = [
  // -------------------------------------------------------------------------
  // 1. Full Body 3×/semana — iniciante, seg/qua/sex
  // -------------------------------------------------------------------------
  {
    id: 'fullbody-3x',
    name: 'Full Body 3×',
    description: { pt: 'Treino completo 3 vezes por semana. Ideal para iniciantes: compostos principais + assistência básica.', en: 'A three-day full-body plan for beginners, with compound lifts and basic accessories.' },
    weekdays: [1, 3, 5], // seg, qua, sex
    color: '#4ade80',
    icon: 'Dumbbell',
    routines: [
      {
        name: 'Full Body',
        note: { pt: 'Mesmo treino nas 3 sessões semanais', en: 'Repeat this workout in all three weekly sessions.' },
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
            note: { pt: 'Assistido se necessário', en: 'Use assistance if needed.' },
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
    description: { pt: 'Divisão superior/inferior 4 vezes por semana. Upper A e B alternam foco em força e hipertrofia.', en: 'A four-day upper/lower split that alternates strength and muscle-building sessions.' },
    weekdays: [1, 2, 4, 5], // seg, ter, qui, sex
    color: '#60a5fa',
    icon: 'Zap',
    routines: [
      {
        name: 'Upper A',
        note: { pt: 'Foco em força — repetições mais baixas', en: 'Strength focus with lower reps.' },
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
        note: { pt: 'Foco em força — agachamento pesado', en: 'Strength focus with heavier squats.' },
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
        note: { pt: 'Foco em hipertrofia — mais volume', en: 'Muscle-building focus with more volume.' },
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
        note: { pt: 'Foco em hipertrofia — volume e isolados', en: 'Muscle-building focus with more volume and isolation work.' },
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
    description: { pt: 'Força linear clássica. Segunda e sexta: Treino A. Quarta: Treino B. Adiciona 2,5 kg por sessão nos compostos.', en: 'Classic linear strength plan. Workout A on Monday and Friday, workout B on Wednesday. Adds 2.5 kg per session on compound lifts.' },
    weekdays: [1, 3, 5], // seg, qua, sex
    color: '#f97316',
    icon: 'TrendingUp',
    routines: [
      {
        name: { pt: 'Treino A — 5×5', en: 'Workout A — 5×5' },
        note: { pt: 'Agachamento + Supino + Remada (alternar com Treino B)', en: 'Squat, bench press and row. Alternate with workout B.' },
        exercises: [
          {
            canonicalName: 'barbell full squat',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 2.5,
            note: { pt: 'Aumentar 2,5 kg a cada sessão bem-sucedida', en: 'Add 2.5 kg after each successful session.' },
          },
          {
            canonicalName: 'barbell bench press',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 2.5,
            note: { pt: 'Supino — alternar com Desenvolvimento no Treino B', en: 'Alternate bench press with the overhead press in workout B.' },
          },
          {
            canonicalName: 'barbell bent over row',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 2.5,
            note: { pt: 'Remada curvada com barra', en: 'Barbell bent-over row.' },
          },
        ],
      },
      {
        name: { pt: 'Treino B — 5×5', en: 'Workout B — 5×5' },
        note: { pt: 'Agachamento + Desenvolvimento + Levantamento Terra (alternar com Treino A)', en: 'Squat, overhead press and deadlift. Alternate with workout A.' },
        exercises: [
          {
            canonicalName: 'barbell full squat',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 2.5,
            note: { pt: 'Sempre em toda sessão — base do StrongLifts', en: 'Squat in every session as the foundation of StrongLifts.' },
          },
          {
            canonicalName: 'barbell seated overhead press',
            sets: 5,
            targetReps: '5',
            restSec: 180,
            progression: 'linear',
            incrementKg: 1.25,
            note: { pt: 'Desenvolvimento — alternado com Supino no Treino A', en: 'Alternate overhead press with the bench press in workout A.' },
          },
          {
            canonicalName: 'barbell deadlift',
            sets: 1,
            targetReps: '5',
            restSec: 240,
            progression: 'linear',
            incrementKg: 5,
            note: { pt: 'Terra — 1 série pesada; incremento de 5 kg por sessão', en: 'One heavy deadlift set. Add 5 kg per session.' },
          },
        ],
      },
    ],
  },
  {
    id: 'fullbody-home',
    name: { pt: 'Força em casa · 3×', en: 'Strength at home · 3×' },
    description: { pt: 'Halteres ajustáveis, barra fixa e peso corporal. Sem banco ou máquinas.', en: 'Uses adjustable dumbbells, a pull-up bar and bodyweight. No bench or machines required.' },
    weekdays: [1, 3, 5],
    color: '#53bba3',
    icon: 'activity',
    routines: [{
      name: { pt: 'Força em casa', en: 'Strength at home' },
      exercises: [
        { canonicalName: 'Afundo com Halter', sets: 3, targetReps: '8–12', restSec: 90, progression: 'double' },
        { canonicalName: 'Flexão (Pompe)', sets: 3, targetReps: '8–12', restSec: 75, progression: 'off' },
        { canonicalName: 'Remada Unilateral com Halter', sets: 3, targetReps: '8–12', restSec: 75, progression: 'double' },
        { canonicalName: 'Barra Fixa (Puxada)', sets: 2, targetReps: '3–6', restSec: 90, progression: 'off' },
        { canonicalName: 'Prancha (Plank)', sets: 2, targetSec: 25, restSec: 60, progression: 'time', incrementKg: 5 },
      ],
    }],
  },
];

const localized = (value: Localized, lang: Lang) => typeof value === 'string' ? value : value[lang];
const optionalNote = (value: Localized | undefined, lang: Lang) => value === undefined ? undefined : localized(value, lang);

function localizePlan(plan: SeedPlan, lang: Lang): StarterPlan {
  return {
    ...plan, name: localized(plan.name, lang), description: localized(plan.description, lang),
    routines: plan.routines.map((routine) => ({
      name: localized(routine.name, lang), note: optionalNote(routine.note, lang),
      exercises: routine.exercises.map((exercise) => ({ ...exercise, note: optionalNote(exercise.note, lang) })),
    })),
  };
}

export function starterPlans(lang: Lang): StarterPlan[] {
  return STARTER_PLANS.map((plan) => localizePlan(plan, lang));
}

export async function applyStarterPlan(planId: string, replaceDays = false): Promise<ApplyResult> {
  const seed = STARTER_PLANS.find((item) => item.id === planId);
  if (seed === undefined) throw new UiError('ui.starterUnavailable');

  const bundled = seed.id === 'fullbody-home' ? [] : await loadExerciseDataset();
  return syncWrite(['categories', 'routines', 'weekPlan', 'exercises', 'settings'], async () => {
    const plan = localizePlan(seed, (await db.settings.get('app'))?.lang ?? 'pt');
    const catalog = await db.exercises.toArray();
    const byName = new Map(bundled.map((exercise) => [normalizeExName(exercise.name), exercise]));
    for (const exercise of catalog) byName.set(normalizeExName(exercise.name), exercise);

    const routines = plan.routines.map((routine) => ({
      ...routine,
      exercises: routine.exercises.map((entry) => ({
        config: entry,
        exercise: byName.get(normalizeExName(entry.canonicalName)),
      })),
    }));
    const unresolved = [...new Set(routines.flatMap((routine) => routine.exercises
      .filter((entry) => entry.exercise === undefined).map((entry) => entry.config.canonicalName)))];
    if (unresolved.length > 0) {
      throw new UiError('ui.starterMissingExercises', [unresolved.join(', ')]);
    }

    const slug = `starter-${plan.id}`;
    const existingCat = await db.categories.where('slug').equals(slug).first();
    const category = existingCat ?? await upsertCategory({
      name: plan.name, slug, color: plan.color, icon: plan.icon, order: 100,
    });
    const existingRoutines = await db.routines.where('categoryId').equals(category.id).toArray();
    const knownIds = new Set(catalog.map((exercise) => exercise.id));
    const routineIds: string[] = [];
    let created = 0;
    let skipped = 0;

    for (const [order, routine] of routines.entries()) {
      const seedName = seed.routines[order]!.name;
      const aliases = [localized(seedName, 'pt'), localized(seedName, 'en')];
      const existing = existingRoutines.find((item) => aliases.includes(item.name) && item.exercises.length > 0);
      if (existing !== undefined) {
        skipped++;
        routineIds.push(existing.id);
        continue;
      }
      const exercises: RoutineExercise[] = [];
      for (const { config, exercise } of routine.exercises) {
        if (exercise === undefined) throw new UiError('ui.starterMissingExercises', [config.canonicalName]);
        if (!knownIds.has(exercise.id)) {
          await upsertExercise(exercise);
          knownIds.add(exercise.id);
        }
        const { canonicalName: _, ...entry } = config;
        exercises.push({ ...entry, exerciseId: exercise.id });
      }
      const saved = await upsertRoutine({ name: routine.name, categoryId: category.id, note: routine.note, exercises, order });
      routineIds.push(saved.id);
      created++;
    }

    let preservedDays = 0;
    for (const [index, weekday] of plan.weekdays.entries()) {
      const existing = await db.weekPlan.get(weekday);
      const routineId = routineIds[index % routineIds.length]!;
      if (existing?.routineId && existing.routineId !== routineId && !replaceDays) {
        preservedDays++;
        continue;
      }
      await setWeekday(weekday, routineId);
    }
    return { created, skipped, unresolved, preservedDays };
  });
}

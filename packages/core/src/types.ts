// Modelo de domínio do Forja. Tipado e normalizado — a mesma fonte de verdade que web e
// (futuramente) api importam. Sem React, sem Node: só tipos e regras puras.
//
// Princípio herdado do openGym: o LOG é o que aconteceu; a PRÓXIMA PRESCRIÇÃO é derivada do
// histórico toda vez, nunca um contador salvo. Cada workout guarda o `target` que valia na
// hora, pra julgar a sessão com honestidade mesmo que a política mude depois.

/** Como um exercício é medido/executado. */
export type ExerciseMode = 'reps' | 'time' | 'cardio';

/** Dia da semana — 0=domingo ... 6=sábado (igual Date.getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Políticas de progressão de carga (motor da Fase 5). */
export type ProgressionPolicy = 'off' | 'linear' | 'greyskull' | 'double' | 'time' | '531';

/** Unidade de carga. */
export type Unit = 'kg' | 'lb';

/** Grupo muscular base (de-para com MuscleMap vem na Fase 5). */
export type MuscleGroup =
  | 'chest' | 'back' | 'shoulders' | 'biceps' | 'triceps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs' | 'obliques'
  | 'traps' | 'lats' | 'fullbody' | 'cardio' | 'other';

/** Fonte da demo visual do exercício. */
export type DemoSource =
  | { kind: 'asset'; frames: number } // ilustrações SVG locais em flipbook
  | { kind: 'custom'; svg: string } // vetor desenhado à mão (SMIL)
  // Formato legado mantido para compatibilidade com backups.
  | { kind: 'cdn'; image?: string; gif?: string }
  | { kind: 'none' };

/** Exercício da biblioteca (curado, do dataset, ou criado pelo usuário). */
export interface Exercise {
  id: string;
  name: string;
  mode: ExerciseMode;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: string[];
  demo: DemoSource;
  instructions?: string;
  /** Busca no YouTube pro botão "ver vídeo" (sobrepõe a busca pelo nome). */
  videoQuery?: string;
  /** Crédito opcional de mídia personalizada ou de registros legados. */
  attribution?: string;
  /** true quando criado pelo usuário (não veio de seed/dataset). */
  custom?: boolean;
  /** Nota pessoal sobre o exercício (G15 — independente da nota por rotina). */
  note?: string;
  createdAt?: number;
  updatedAt?: number;
}

/** Categoria de treino (calistenia, musculação, box…). CRUD pelo usuário. */
export interface Category {
  id: string;
  name: string;
  slug: string;
  /** Cor de acento (hex) usada no visual por categoria. */
  color: string;
  /** Nome do ícone (lucide) ou emoji. */
  icon?: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

/** Exercício configurado dentro de uma rotina. */
export interface RoutineExercise {
  exerciseId: string;
  sets: number;
  /** Reps-alvo (modo reps) — faixa textual "8–12" ou número. */
  targetReps?: string;
  /** Tempo-alvo em segundos (modo time/cardio). */
  targetSec?: number;
  restSec?: number;
  progression?: ProgressionPolicy;
  /** Incremento de carga por sessão (kg) quando a política dispara. */
  incrementKg?: number;
  /** Alvo de distância em metros (cardio). */
  targetDistanceM?: number;
  /** Alvo de velocidade km/h (cardio). */
  targetSpeedKmh?: number;
  note?: string;
  /** Exercícios no mesmo grupo formam um superset (Fase 5). */
  supersetGroup?: number;
  /**
   * Training max (TM) do exercício em kg.
   * Usado pela política 5/3/1: ~90% do 1RM. Definido pelo usuário ou derivado de
   * `estimate1RM × 0.9`. Não é o 1RM — é a carga de trabalho que gera as séries principais.
   */
  trainingMaxKg?: number;
  /** Aumento do TM ao concluir quatro sessões 5/3/1 válidas. Padrão: 2,5 kg. */
  trainingMaxIncrementKg?: number;
}

/** Rotina nomeada (um "treino") dentro de uma categoria. */
export interface Routine {
  id: string;
  name: string;
  categoryId: string;
  note?: string;
  exercises: RoutineExercise[];
  createdAt: number;
  updatedAt: number;
  /** Ordem de exibição dentro da categoria. */
  order?: number;
}

/** Plano semanal: cada weekday aponta pra uma rotina (ou descanso = null). */
export type WeekPlan = Record<Weekday, string | null>;

/** Override por data ISO: remarcar um dia sem mexer no plano semanal. */
export interface DayOverride {
  dateISO: string;
  /** routineId, 'rest', ou null pra "voltar ao plano semanal". */
  routine: string | 'rest' | null;
}

/** Esforço opcional por série (Fase 5 — não afeta progressão/1RM por padrão). */
export interface Effort {
  rir?: number;
  rpe?: number;
}

/** Uma série logada (o que de fato aconteceu). */
export interface SetLog {
  reps?: number;
  weightKg?: number;
  sec?: number;
  /** Distância em metros (cardio). */
  distanceM?: number;
  /** Velocidade média km/h (cardio). */
  speedKmh?: number;
  done: boolean;
  effort?: Effort;
  note?: string;
}

/**
 * Um set principal do esquema 5/3/1 com carga calculada.
 * Carregado em `Prescription.mainSets` quando `kind === '531'`.
 */
export interface MainSet531 {
  /** Percentual do TM aplicado (ex.: 85). */
  percentOfTM: number;
  /** Carga calculada e arredondada (kg). */
  weightKg: number;
  /** Reps-alvo. */
  reps: number;
  /** Último set é AMRAP (as many reps as possible). */
  amrap: boolean;
}

/** Prescrição derivada do histórico pro próximo treino. */
export interface Prescription {
  weightKg?: number;
  reps?: number;
  sec?: number;
  /** Explicação legível do porquê desta prescrição (auditável). */
  why: string;
  kind: ProgressionPolicy | 'prefill' | 'fresh';
  /**
   * Sets principais do esquema 5/3/1, presentes apenas quando `kind === '531'`.
   * A UI usa isso para renderizar as 3 séries com %, carga e flag AMRAP.
   */
  mainSets?: MainSet531[];
  /** Semana do ciclo 5/3/1 (1–4), presente quando `kind === '531'`. */
  cycleWeek?: 1 | 2 | 3 | 4;
  /** Training max usado para calcular as cargas (kg), presente quando `kind === '531'`. */
  trainingMaxKg?: number;
}

/** Snapshot do target que valia quando o exercício foi logado. */
export interface TargetSnapshot {
  sets: number;
  reps?: string;
  sec?: number;
  weightKg?: number;
  policy?: ProgressionPolicy;
  distanceM?: number;
  speedKmh?: number;
  mainSets?: MainSet531[];
  cycleWeek?: 1 | 2 | 3 | 4;
  baseTrainingMaxKg?: number;
  trainingMaxKg?: number;
  /** Importações sem acesso à prescrição original. */
  unknown?: true;
}

/** Um exercício dentro de um workout logado. */
export interface WorkoutEntry {
  exerciseId: string;
  sets: SetLog[];
  /** Séries de aquecimento, fora das métricas e da prescrição. */
  warmupSets?: SetLog[];
  target: TargetSnapshot;
}

/** Recorde pessoal detectado numa sessão (derivado do histórico na hora do log). */
export interface PR {
  exerciseId: string;
  kind: 'weight' | '1rm' | 'reps';
  value: number;
}

/** Sessão de treino concluída. */
export interface WorkoutLog {
  id: string;
  dateISO: string;
  routineId?: string;
  /** Nome guardado para exibição quando a rotina já foi excluída. */
  routineName?: string;
  categoryId?: string;
  entries: WorkoutEntry[];
  durationSec?: number;
  note?: string;
  createdAt: number;
  /** PRs batidos nesta sessão (guardados p/ exibição; a verdade continua derivável do log). */
  prs?: PR[];
}

/** Ponto da série temporal de peso corporal. */
export interface BodyWeight {
  dateISO: string;
  kg: number;
}

/** Registro de medidas corporais por data (G14). Chave primária: dateISO. */
export interface BodyMeasurement {
  dateISO: string;
  waistCm?: number;
  chestCm?: number;
  hipsCm?: number;
  leftArmCm?: number;
  rightArmCm?: number;
  leftThighCm?: number;
  rightThighCm?: number;
  neckCm?: number;
  calfCm?: number;
  note?: string;
}

/** Preferências do usuário. */
export interface Settings {
  unit: Unit;
  defaultRestSec: number;
  theme: 'dark' | 'light' | 'system';
  trackEffort: boolean;
  /** 0=domingo, 1=segunda. */
  weekStartsOn: 0 | 1;
  /** Chaves do equipamento disponível no filtro da biblioteca. */
  gymEquipment?: string[];
  bodyWeightGoalKg?: number;
  /** Figura usada no mapa muscular. */
  muscleFigure?: 'male' | 'female';
  /** Nome da paleta de acento global (ex. 'flame', 'blue'). */
  accent?: string;
  /** Idioma da interface. Desacoplado do web via union inline. */
  lang?: 'pt' | 'en';
}

/** Estado derivado de streak (nunca persistido como contador — calculado do histórico). */
export interface Streak {
  current: number;
  longest: number;
  lastTrainedISO: string | null;
  /** true se a streak está "viva" hoje (treinou hoje ou ontem). */
  alive: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  unit: 'kg',
  defaultRestSec: 90,
  theme: 'dark',
  trackEffort: false,
  weekStartsOn: 1,
  accent: 'flame',
  lang: 'pt',
};

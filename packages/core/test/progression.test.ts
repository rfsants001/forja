import { describe, it, expect } from 'vitest';
import { nextPrescription, parseRepsRange } from '../src/progression.js';
import type { WorkoutLog, WorkoutEntry, RoutineExercise } from '../src/types.js';

// ---------------------------------------------------------------------------
// Factories de fixture
// ---------------------------------------------------------------------------

function makeWorkout(
  dateISO: string,
  entry: WorkoutEntry,
  id = dateISO,
): WorkoutLog {
  return { id, dateISO, entries: [entry], createdAt: 0 };
}

/** Config mínima de exercício na rotina. */
function makeConfig(overrides: Partial<RoutineExercise> = {}): RoutineExercise {
  return {
    exerciseId: 'squat',
    sets: 3,
    targetReps: '5',
    incrementKg: 2.5,
    progression: 'linear',
    ...overrides,
  };
}

/** Entrada com todas as séries done e reps/peso informados. */
function makeEntry(
  exerciseId: string,
  reps: number,
  weightKg: number,
  targetReps = '5',
  targetSets = 3,
  targetWeight = weightKg,
): WorkoutEntry {
  return {
    exerciseId,
    sets: Array.from({ length: targetSets }, () => ({ reps, weightKg, done: true })),
    target: { sets: targetSets, reps: targetReps, weightKg: targetWeight },
  };
}

/** Entrada com séries de miss (reps abaixo do alvo). */
function makeMissEntry(
  exerciseId: string,
  reps: number,
  weightKg: number,
  targetReps = '5',
  targetSets = 3,
): WorkoutEntry {
  return {
    exerciseId,
    sets: Array.from({ length: targetSets }, () => ({ reps, weightKg, done: true })),
    target: { sets: targetSets, reps: targetReps, weightKg },
  };
}

// ---------------------------------------------------------------------------
// parseRepsRange
// ---------------------------------------------------------------------------

describe('parseRepsRange', () => {
  it('"10" → { min: 10, max: 10 }', () => {
    expect(parseRepsRange('10')).toEqual({ min: 10, max: 10 });
  });

  it('"8–12" (en-dash) → { min: 8, max: 12 }', () => {
    expect(parseRepsRange('8–12')).toEqual({ min: 8, max: 12 });
  });

  it('"8-12" (hífen ASCII) → { min: 8, max: 12 }', () => {
    expect(parseRepsRange('8-12')).toEqual({ min: 8, max: 12 });
  });

  it('"8—12" (em-dash) → { min: 8, max: 12 }', () => {
    expect(parseRepsRange('8—12')).toEqual({ min: 8, max: 12 });
  });

  it('"12-8" (invertido) → normaliza para { min: 8, max: 12 }', () => {
    expect(parseRepsRange('12-8')).toEqual({ min: 8, max: 12 });
  });

  it('string inválida → { min: 1, max: 1 } sem throw', () => {
    expect(parseRepsRange('')).toEqual({ min: 1, max: 1 });
    expect(parseRepsRange('abc')).toEqual({ min: 1, max: 1 });
  });
});

// ---------------------------------------------------------------------------
// Política OFF
// ---------------------------------------------------------------------------

describe('progressão off', () => {
  it('sem histórico → kind fresh', () => {
    const p = nextPrescription({
      workouts: [],
      config: makeConfig({ progression: 'off' }),
    });
    expect(p.kind).toBe('fresh');
  });

  it('com histórico → repete o último alvo (prefill)', () => {
    const entry = makeEntry('squat', 5, 100, '5', 3, 100);
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({
      workouts: [w],
      config: makeConfig({ progression: 'off' }),
    });
    expect(p.kind).toBe('prefill');
    expect(p.weightKg).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Política LINEAR
// ---------------------------------------------------------------------------

describe('progressão linear', () => {
  it('sem histórico → kind fresh', () => {
    const p = nextPrescription({ workouts: [], config: makeConfig() });
    expect(p.kind).toBe('fresh');
  });

  it('bateu o alvo → sobe incremento (+2.5kg)', () => {
    const entry = makeEntry('squat', 5, 100, '5', 3, 100);
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: makeConfig() });
    expect(p.kind).toBe('linear');
    expect(p.weightKg).toBe(102.5);
  });

  it('não bateu → mantém o peso', () => {
    const miss = makeMissEntry('squat', 3, 100, '5', 3); // reps < 5
    const w = makeWorkout('2026-10-01', miss);
    const p = nextPrescription({ workouts: [w], config: makeConfig() });
    expect(p.kind).toBe('linear');
    expect(p.weightKg).toBe(100);
  });

  it('3 misses consecutivos → deload ~10%', () => {
    // 3 sessões consecutivas de miss
    const miss = (date: string, id: string) =>
      makeWorkout(date, makeMissEntry('squat', 3, 100, '5', 3), id);
    const workouts = [
      miss('2026-10-01', 'w1'),
      miss('2026-10-05', 'w2'),
      miss('2026-10-10', 'w3'),
    ];
    const p = nextPrescription({ workouts, config: makeConfig() });
    expect(p.kind).toBe('linear');
    // 100 * 0.9 = 90, arredondado para múltiplo de 2.5 = 90
    expect(p.weightKg).toBeCloseTo(90, 1);
  });

  it('2 misses (abaixo do limite de 3) → mantém o peso', () => {
    const miss = (date: string, id: string) =>
      makeWorkout(date, makeMissEntry('squat', 3, 100, '5', 3), id);
    const workouts = [miss('2026-10-01', 'w1'), miss('2026-10-05', 'w2')];
    const p = nextPrescription({ workouts, config: makeConfig() });
    expect(p.weightKg).toBe(100);
  });

  it('stallThresholdOverride altera o limite de deload', () => {
    // Com threshold=1, 1 miss já dispara deload
    const miss = makeMissEntry('squat', 3, 100, '5', 3);
    const w = makeWorkout('2026-10-01', miss);
    const p = nextPrescription({
      workouts: [w],
      config: makeConfig(),
      stallThresholdOverride: { linear: 1 },
    });
    expect(p.weightKg).toBeCloseTo(90, 1); // deload aplicado
  });

  it('why está preenchido e legível', () => {
    const entry = makeEntry('squat', 5, 100, '5', 3, 100);
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: makeConfig() });
    expect(typeof p.why).toBe('string');
    expect(p.why.length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// Política GREYSKULL
// ---------------------------------------------------------------------------

describe('progressão greyskull', () => {
  const cfg = makeConfig({ progression: 'greyskull', targetReps: '5', incrementKg: 2.5 });

  it('sem histórico → fresh', () => {
    const p = nextPrescription({ workouts: [], config: cfg });
    expect(p.kind).toBe('fresh');
  });

  it('bateu o alvo normalmente → sobe incremento', () => {
    // 2 sets normais + AMRAP com 6 reps (não é dobro de 5=10, então incremento simples)
    const entry: WorkoutEntry = {
      exerciseId: 'squat',
      sets: [
        { reps: 5, done: true },
        { reps: 5, done: true },
        { reps: 6, done: true }, // AMRAP: 6 < 10 (dobro de 5)
      ],
      target: { sets: 3, reps: '5', weightKg: 100 },
    };
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.kind).toBe('greyskull');
    expect(p.weightKg).toBe(102.5);
  });

  it('AMRAP folgado (dobrou as reps) → sobe DOBRO do incremento', () => {
    // alvo = 5 reps; dobro = 10 reps → sobe 2 × 2.5 = 5kg
    const entry: WorkoutEntry = {
      exerciseId: 'squat',
      sets: [
        { reps: 5, done: true },
        { reps: 5, done: true },
        { reps: 10, done: true }, // AMRAP folgado
      ],
      target: { sets: 3, reps: '5', weightKg: 100 },
    };
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.weightKg).toBe(105);
  });

  it('1 miss → deload imediato (~10%)', () => {
    const miss: WorkoutEntry = {
      exerciseId: 'squat',
      sets: [
        { reps: 5, done: true },
        { reps: 5, done: true },
        { reps: 2, done: true }, // AMRAP falhou (< 5)
      ],
      target: { sets: 3, reps: '5', weightKg: 100 },
    };
    const w = makeWorkout('2026-10-01', miss);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.kind).toBe('greyskull');
    // 100 * 0.9 = 90, arredondado para múltiplo de 2.5
    expect(p.weightKg).toBeCloseTo(90, 1);
  });
});

// ---------------------------------------------------------------------------
// Política DOUBLE PROGRESSION
// ---------------------------------------------------------------------------

describe('progressão double', () => {
  const cfg = makeConfig({
    progression: 'double',
    targetReps: '8–12',
    incrementKg: 2.5,
  });

  it('sem histórico → fresh', () => {
    const p = nextPrescription({ workouts: [], config: cfg });
    expect(p.kind).toBe('fresh');
  });

  it('bateu o alvo dentro da faixa (não chegou ao topo) → sobe reps, mantém peso', () => {
    // Executou 10 reps, alvo era 10, topo é 12 → sobe para 11
    const entry: WorkoutEntry = {
      exerciseId: 'squat',
      sets: [
        { reps: 10, done: true },
        { reps: 10, done: true },
        { reps: 10, done: true },
      ],
      target: { sets: 3, reps: '10', weightKg: 60 },
    };
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.kind).toBe('double');
    expect(p.weightKg).toBe(60); // peso mantido
    expect(p.reps).toBe(11);     // reps sobem
  });

  it('bateu o topo da faixa (12 reps em todos os sets) → sobe peso, volta ao mínimo', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'squat',
      sets: [
        { reps: 12, done: true },
        { reps: 12, done: true },
        { reps: 12, done: true },
      ],
      target: { sets: 3, reps: '12', weightKg: 60 },
    };
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.kind).toBe('double');
    expect(p.weightKg).toBe(62.5); // +2.5kg
    expect(p.reps).toBe(8);        // volta ao mínimo da faixa
  });

  it('não bateu o alvo → mantém peso e reps', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'squat',
      sets: [
        { reps: 7, done: true }, // falhou: alvo era 8
        { reps: 7, done: true },
        { reps: 7, done: true },
      ],
      target: { sets: 3, reps: '8', weightKg: 60 },
    };
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.kind).toBe('double');
    expect(p.weightKg).toBe(60);
    expect(p.reps).toBe(8); // mantém o alvo atual
  });

  it('3 misses consecutivos → deload ~10%', () => {
    const miss = (date: string, id: string): WorkoutLog =>
      makeWorkout(
        date,
        {
          exerciseId: 'squat',
          sets: Array.from({ length: 3 }, () => ({ reps: 6, done: true })),
          target: { sets: 3, reps: '8', weightKg: 60 },
        },
        id,
      );
    const workouts = [miss('2026-10-01', 'w1'), miss('2026-10-05', 'w2'), miss('2026-10-10', 'w3')];
    const p = nextPrescription({ workouts, config: cfg });
    // 60 * 0.9 = 54, arredondado para múltiplo de 2.5 = 55
    expect(p.weightKg).toBe(55);
  });
});

// ---------------------------------------------------------------------------
// Política TIME
// ---------------------------------------------------------------------------

describe('progressão time', () => {
  const cfg: RoutineExercise = {
    exerciseId: 'plank',
    sets: 1,
    targetSec: 60,
    incrementKg: 10, // reutilizado como incremento em segundos
    progression: 'time',
  };

  it('sem histórico → fresh', () => {
    const p = nextPrescription({ workouts: [], config: cfg });
    expect(p.kind).toBe('fresh');
  });

  it('bateu o alvo → sobe os segundos', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'plank',
      sets: [{ sec: 65, done: true }],
      target: { sets: 1, sec: 60 },
    };
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.kind).toBe('time');
    expect(p.sec).toBe(70); // 60 + 10
  });

  it('não bateu o alvo → mantém os segundos', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'plank',
      sets: [{ sec: 45, done: true }],
      target: { sets: 1, sec: 60 },
    };
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.kind).toBe('time');
    expect(p.sec).toBe(60);
  });

  it('3 misses consecutivos → deload ~10%', () => {
    const miss = (date: string, id: string): WorkoutLog =>
      makeWorkout(
        date,
        {
          exerciseId: 'plank',
          sets: [{ sec: 45, done: true }],
          target: { sets: 1, sec: 60 },
        },
        id,
      );
    const workouts = [miss('2026-10-01', 'w1'), miss('2026-10-05', 'w2'), miss('2026-10-10', 'w3')];
    const p = nextPrescription({ workouts, config: cfg });
    expect(p.kind).toBe('time');
    expect(p.sec).toBe(54); // Math.round(60 * 0.9)
  });

  it('progressão time não tem weightKg', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'plank',
      sets: [{ sec: 65, done: true }],
      target: { sets: 1, sec: 60 },
    };
    const w = makeWorkout('2026-10-01', entry);
    const p = nextPrescription({ workouts: [w], config: cfg });
    expect(p.weightKg).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Garantias gerais
// ---------------------------------------------------------------------------

describe('garantias gerais', () => {
  it('why sempre é string não-vazia em qualquer política', () => {
    const policies: Array<RoutineExercise['progression']> = [
      'off', 'linear', 'greyskull', 'double', 'time',
    ];
    for (const progression of policies) {
      const cfg = makeConfig({ progression, targetSec: progression === 'time' ? 60 : undefined });
      const p = nextPrescription({ workouts: [], config: cfg });
      expect(typeof p.why).toBe('string');
      expect(p.why.trim().length).toBeGreaterThan(0);
    }
  });

  it('sem histórico: todas as políticas devolvem kind fresh', () => {
    const policies: Array<RoutineExercise['progression']> = [
      'off', 'linear', 'greyskull', 'double', 'time',
    ];
    for (const progression of policies) {
      const cfg = makeConfig({ progression });
      const p = nextPrescription({ workouts: [], config: cfg });
      expect(p.kind).toBe('fresh');
    }
  });
});

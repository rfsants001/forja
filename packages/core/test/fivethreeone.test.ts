import { describe, it, expect } from 'vitest';
import { weekScheme, prescribe531, nextTrainingMax } from '../src/fivethreeone.js';
import { nextPrescription } from '../src/progression.js';
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

/** Entrada 5/3/1 mínima: todas as séries done. */
function make531Entry(exerciseId: string, weightKg = 85): WorkoutEntry {
  return {
    exerciseId,
    sets: [
      { reps: 5, weightKg, done: true },
      { reps: 5, weightKg, done: true },
      { reps: 8, weightKg, done: true }, // AMRAP
    ],
    target: { sets: 3, reps: '5', weightKg },
  };
}

/** Config mínima para política 5/3/1. */
function make531Config(trainingMaxKg?: number): RoutineExercise {
  return {
    exerciseId: 'squat',
    sets: 3,
    progression: '531',
    incrementKg: 2.5,
    trainingMaxKg,
  };
}

// ---------------------------------------------------------------------------
// weekScheme
// ---------------------------------------------------------------------------

describe('weekScheme', () => {
  it('semana 1 → 65/75/85, reps 5/5/5+', () => {
    const s = weekScheme(1);
    expect(s).toHaveLength(3);
    expect(s[0]).toEqual({ percentOfTM: 65, reps: 5, amrap: false });
    expect(s[1]).toEqual({ percentOfTM: 75, reps: 5, amrap: false });
    expect(s[2]).toEqual({ percentOfTM: 85, reps: 5, amrap: true });
  });

  it('semana 2 → 70/80/90, reps 3/3/3+', () => {
    const s = weekScheme(2);
    expect(s[0]).toEqual({ percentOfTM: 70, reps: 3, amrap: false });
    expect(s[1]).toEqual({ percentOfTM: 80, reps: 3, amrap: false });
    expect(s[2]).toEqual({ percentOfTM: 90, reps: 3, amrap: true });
  });

  it('semana 3 → 75/85/95, reps 5/3/1+', () => {
    const s = weekScheme(3);
    expect(s[0]).toEqual({ percentOfTM: 75, reps: 5, amrap: false });
    expect(s[1]).toEqual({ percentOfTM: 85, reps: 3, amrap: false });
    expect(s[2]).toEqual({ percentOfTM: 95, reps: 1, amrap: true });
  });

  it('semana 4 (deload) → 40/50/60, sem AMRAP', () => {
    const s = weekScheme(4);
    expect(s[0]).toEqual({ percentOfTM: 40, reps: 5, amrap: false });
    expect(s[1]).toEqual({ percentOfTM: 50, reps: 5, amrap: false });
    expect(s[2]).toEqual({ percentOfTM: 60, reps: 5, amrap: false });
  });
});

// ---------------------------------------------------------------------------
// prescribe531
// ---------------------------------------------------------------------------

describe('prescribe531', () => {
  it('TM 100 kg semana 1 → 65/75/85 kg (arredondado em 2.5)', () => {
    const sets = prescribe531(100, 1);
    expect(sets[0]?.weightKg).toBe(65);
    expect(sets[1]?.weightKg).toBe(75);
    expect(sets[2]?.weightKg).toBe(85);
  });

  it('TM 100 kg semana 2 → 70/80/90 kg', () => {
    const sets = prescribe531(100, 2);
    expect(sets[0]?.weightKg).toBe(70);
    expect(sets[1]?.weightKg).toBe(80);
    expect(sets[2]?.weightKg).toBe(90);
  });

  it('TM 100 kg semana 3 → 75/85/95 kg', () => {
    const sets = prescribe531(100, 3);
    expect(sets[0]?.weightKg).toBe(75);
    expect(sets[1]?.weightKg).toBe(85);
    expect(sets[2]?.weightKg).toBe(95);
  });

  it('TM 100 kg semana 4 (deload) → 40/50/60 kg', () => {
    const sets = prescribe531(100, 4);
    expect(sets[0]?.weightKg).toBe(40);
    expect(sets[1]?.weightKg).toBe(50);
    expect(sets[2]?.weightKg).toBe(60);
  });

  it('arredondamento: TM 102 kg semana 1 → 65% de 102 = 66.3 → arredonda pra 65 (múltiplo de 2.5)', () => {
    const sets = prescribe531(102, 1, 2.5);
    // 102 * 0.65 = 66.3 → round(66.3/2.5)*2.5 = round(26.52)*2.5 = 27*2.5 = 67.5
    expect(sets[0]?.weightKg).toBe(67.5);
  });

  it('arredondamento: TM 110 kg semana 3, 95% = 104.5 → arredonda pra 105', () => {
    const sets = prescribe531(110, 3, 2.5);
    // 110 * 0.95 = 104.5 → round(104.5/2.5)*2.5 = round(41.8)*2.5 = 42*2.5 = 105
    expect(sets[2]?.weightKg).toBe(105);
  });

  it('roundKg = 5 → arredonda em 5 kg', () => {
    const sets = prescribe531(100, 1, 5);
    // 65 → round(65/5)*5 = 65; 75 → 75; 85 → 85
    expect(sets[0]?.weightKg).toBe(65);
    expect(sets[1]?.weightKg).toBe(75);
    expect(sets[2]?.weightKg).toBe(85);
  });

  it('flags amrap corretas: semana 1 só o último é AMRAP', () => {
    const sets = prescribe531(100, 1);
    expect(sets[0]?.amrap).toBe(false);
    expect(sets[1]?.amrap).toBe(false);
    expect(sets[2]?.amrap).toBe(true);
  });

  it('semana 4: nenhum set é AMRAP', () => {
    const sets = prescribe531(100, 4);
    expect(sets.every((s) => !s.amrap)).toBe(true);
  });

  // Exemplo solicitado no brief: TM=100 semana 3
  it('TM 100 kg semana 3 → 75kg×5, 85kg×3, 95kg×1+ (amostra do brief)', () => {
    const sets = prescribe531(100, 3);
    expect(sets).toEqual([
      { weightKg: 75, reps: 5, amrap: false },
      { weightKg: 85, reps: 3, amrap: false },
      { weightKg: 95, reps: 1, amrap: true },
    ]);
  });
});

// ---------------------------------------------------------------------------
// nextTrainingMax
// ---------------------------------------------------------------------------

describe('nextTrainingMax', () => {
  it('upper body: +2.5 kg', () => {
    expect(nextTrainingMax(100, true)).toBe(102.5);
  });

  it('lower body: +5 kg', () => {
    expect(nextTrainingMax(100, false)).toBe(105);
  });

  it('funciona com valores fracionários', () => {
    expect(nextTrainingMax(97.5, true)).toBe(100);
    expect(nextTrainingMax(97.5, false)).toBe(102.5);
  });
});

// ---------------------------------------------------------------------------
// nextPrescription com policy '531' — derivação de semana do ciclo
// ---------------------------------------------------------------------------

describe('nextPrescription com policy 531', () => {
  const config = make531Config(100);

  it('sem histórico → kind fresh (TM não definido retorna fresh também)', () => {
    const p = nextPrescription({ workouts: [], config: make531Config(undefined) });
    expect(p.kind).toBe('fresh');
  });

  it('sem histórico mas TM definido → semana 1 (0 sessões → 0 % 4 = semana 1)', () => {
    const p = nextPrescription({ workouts: [], config });
    expect(p.kind).toBe('531');
    expect(p.cycleWeek).toBe(1);
    expect(p.trainingMaxKg).toBe(100);
    expect(p.mainSets).toHaveLength(3);
  });

  it('1 sessão logada → semana 2', () => {
    const workouts = [makeWorkout('2026-01-01', make531Entry('squat'))];
    const p = nextPrescription({ workouts, config });
    expect(p.cycleWeek).toBe(2);
  });

  it('2 sessões → semana 3', () => {
    const workouts = [
      makeWorkout('2026-01-01', make531Entry('squat'), 'w1'),
      makeWorkout('2026-01-08', make531Entry('squat'), 'w2'),
    ];
    const p = nextPrescription({ workouts, config });
    expect(p.cycleWeek).toBe(3);
  });

  it('3 sessões → semana 4 (deload)', () => {
    const workouts = [
      makeWorkout('2026-01-01', make531Entry('squat'), 'w1'),
      makeWorkout('2026-01-08', make531Entry('squat'), 'w2'),
      makeWorkout('2026-01-15', make531Entry('squat'), 'w3'),
    ];
    const p = nextPrescription({ workouts, config });
    expect(p.cycleWeek).toBe(4);
  });

  it('4 sessões → volta para semana 1 (início do próximo ciclo)', () => {
    const workouts = [
      makeWorkout('2026-01-01', make531Entry('squat'), 'w1'),
      makeWorkout('2026-01-08', make531Entry('squat'), 'w2'),
      makeWorkout('2026-01-15', make531Entry('squat'), 'w3'),
      makeWorkout('2026-01-22', make531Entry('squat'), 'w4'),
    ];
    const p = nextPrescription({ workouts, config });
    expect(p.cycleWeek).toBe(1);
  });

  it('5 sessões → semana 2 do segundo ciclo', () => {
    const workouts = Array.from({ length: 5 }, (_, i) =>
      makeWorkout(`2026-01-${String(i + 1).padStart(2, '0')}`, make531Entry('squat'), `w${i}`),
    );
    const p = nextPrescription({ workouts, config });
    expect(p.cycleWeek).toBe(2);
  });

  it('mainSets têm cargas corretas para TM=100 semana 1', () => {
    const p = nextPrescription({ workouts: [], config });
    expect(p.mainSets?.[0]?.weightKg).toBe(65);
    expect(p.mainSets?.[1]?.weightKg).toBe(75);
    expect(p.mainSets?.[2]?.weightKg).toBe(85);
    expect(p.mainSets?.[2]?.amrap).toBe(true);
  });

  it('ignora sessões de outros exercícios para contagem do ciclo', () => {
    // Bench press logado não deve influenciar o ciclo do squat.
    const workouts = [
      makeWorkout('2026-01-01', make531Entry('bench'), 'w1'),
      makeWorkout('2026-01-02', make531Entry('bench'), 'w2'),
    ];
    const p = nextPrescription({ workouts, config });
    // 0 sessões de squat → semana 1
    expect(p.cycleWeek).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { lastEntryFor, readSession, lastNEntriesFor, consecutiveMisses } from '../src/history.js';
import type { WorkoutLog, WorkoutEntry } from '../src/types.js';

// ---------------------------------------------------------------------------
// Factories de fixture
// ---------------------------------------------------------------------------

/** Cria um WorkoutLog mínimo com uma entrada de exercício. */
function makeWorkout(
  dateISO: string,
  entry: WorkoutEntry,
  id = dateISO,
): WorkoutLog {
  return {
    id,
    dateISO,
    entries: [entry],
    createdAt: 0,
  };
}

/** Entrada de exercício de reps simples (3×10 no alvo, todas done). */
function makeRepsEntry(
  exerciseId: string,
  reps: number,
  weightKg: number,
  targetReps = '10',
  targetSets = 3,
): WorkoutEntry {
  return {
    exerciseId,
    sets: Array.from({ length: targetSets }, () => ({
      reps,
      weightKg,
      done: true,
    })),
    target: { sets: targetSets, reps: targetReps, weightKg },
  };
}

/** Entrada de exercício de tempo (1 série de Ns). */
function makeTimeEntry(
  exerciseId: string,
  sec: number,
  targetSec: number,
): WorkoutEntry {
  return {
    exerciseId,
    sets: [{ sec, done: true }],
    target: { sets: 1, sec: targetSec },
  };
}

// ---------------------------------------------------------------------------
// lastEntryFor
// ---------------------------------------------------------------------------

describe('lastEntryFor', () => {
  it('histórico vazio → undefined', () => {
    expect(lastEntryFor([], 'squat')).toBeUndefined();
  });

  it('exercício inexistente nos logs → undefined', () => {
    const w = makeWorkout('2026-10-01', makeRepsEntry('bench', 100, 60));
    expect(lastEntryFor([w], 'squat')).toBeUndefined();
  });

  it('uma entrada → devolve ela', () => {
    const entry = makeRepsEntry('squat', 10, 100);
    const w = makeWorkout('2026-10-01', entry);
    expect(lastEntryFor([w], 'squat')).toBe(entry);
  });

  it('múltiplas sessões → devolve a mais recente por dateISO', () => {
    const old = makeRepsEntry('squat', 10, 80);
    const recent = makeRepsEntry('squat', 10, 100);
    const w1 = makeWorkout('2026-10-01', old, 'w1');
    const w2 = makeWorkout('2026-10-10', recent, 'w2');
    // Array fora de ordem de propósito
    const result = lastEntryFor([w2, w1], 'squat');
    expect(result).toBe(recent);
  });

  it('ignora exercícios de outro id no mesmo workout', () => {
    const entry = makeRepsEntry('bench', 10, 60);
    const w = makeWorkout('2026-10-01', entry);
    expect(lastEntryFor([w], 'squat')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// readSession
// ---------------------------------------------------------------------------

describe('readSession — modo reps', () => {
  it('todas as séries done com reps >= alvo → hit=true', () => {
    const entry = makeRepsEntry('bench', 10, 60, '10', 3);
    const r = readSession(entry);
    expect(r.hit).toBe(true);
    expect(r.setsHit).toBe(3);
    expect(r.setsTotal).toBe(3);
  });

  it('reps exatamente no mínimo da faixa → hit=true', () => {
    // faixa "8–12", executou 8 reps
    const entry: WorkoutEntry = {
      exerciseId: 'curl',
      sets: [
        { reps: 8, done: true },
        { reps: 8, done: true },
        { reps: 8, done: true },
      ],
      target: { sets: 3, reps: '8–12', weightKg: 20 },
    };
    expect(readSession(entry).hit).toBe(true);
  });

  it('reps abaixo do mínimo em uma série → hit=false', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'curl',
      sets: [
        { reps: 8, done: true },
        { reps: 7, done: true }, // falhou
        { reps: 8, done: true },
      ],
      target: { sets: 3, reps: '8', weightKg: 20 },
    };
    const r = readSession(entry);
    expect(r.hit).toBe(false);
    expect(r.setsHit).toBe(2);
  });

  it('série marcada como done=false → miss', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'bench',
      sets: [
        { reps: 10, done: true },
        { reps: 10, done: false }, // pulou
        { reps: 10, done: true },
      ],
      target: { sets: 3, reps: '10', weightKg: 60 },
    };
    expect(readSession(entry).hit).toBe(false);
  });

  it('menos sets feitos que o prescrito → hit=false', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'bench',
      sets: [
        { reps: 10, done: true },
        { reps: 10, done: true },
        // terceira série ausente
      ],
      target: { sets: 3, reps: '10', weightKg: 60 },
    };
    expect(readSession(entry).hit).toBe(false);
  });

  it('topWeightKg retorna o maior peso entre as séries done', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'deadlift',
      sets: [
        { reps: 5, weightKg: 100, done: true },
        { reps: 5, weightKg: 120, done: true },
        { reps: 5, weightKg: 110, done: true },
      ],
      target: { sets: 3, reps: '5', weightKg: 100 },
    };
    expect(readSession(entry).topWeightKg).toBe(120);
  });

  it('totalReps soma todas as reps das séries done', () => {
    const entry = makeRepsEntry('bench', 10, 60, '10', 3);
    expect(readSession(entry).totalReps).toBe(30);
  });

  it('lastSetReps retorna as reps da última série done', () => {
    const entry: WorkoutEntry = {
      exerciseId: 'bench',
      sets: [
        { reps: 5, done: true },
        { reps: 5, done: true },
        { reps: 9, done: true }, // AMRAP
      ],
      target: { sets: 3, reps: '5', weightKg: 60 },
    };
    expect(readSession(entry).lastSetReps).toBe(9);
  });
});

describe('readSession — modo time', () => {
  it('sec >= targetSec → hit=true', () => {
    const entry = makeTimeEntry('plank', 60, 60);
    expect(readSession(entry).hit).toBe(true);
  });

  it('sec < targetSec → hit=false', () => {
    const entry = makeTimeEntry('plank', 45, 60);
    expect(readSession(entry).hit).toBe(false);
  });

  it('sec maior que o alvo (superou) → hit=true', () => {
    const entry = makeTimeEntry('plank', 75, 60);
    expect(readSession(entry).hit).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// lastNEntriesFor
// ---------------------------------------------------------------------------

describe('lastNEntriesFor', () => {
  it('histórico vazio → array vazio', () => {
    expect(lastNEntriesFor([], 'squat', 3)).toEqual([]);
  });

  it('menos entradas que N → devolve todas em ordem cronológica', () => {
    const e1 = makeRepsEntry('squat', 10, 100);
    const e2 = makeRepsEntry('squat', 10, 102);
    const w1 = makeWorkout('2026-10-01', e1, 'w1');
    const w2 = makeWorkout('2026-10-05', e2, 'w2');
    const result = lastNEntriesFor([w2, w1], 'squat', 5);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(e1);
    expect(result[1]).toBe(e2);
  });

  it('N=2 de 4 entradas → retorna as 2 mais recentes em ordem cronológica', () => {
    const entries = ['10-01', '10-05', '10-10', '10-15'].map((d, i) =>
      makeWorkout(`2026-${d}`, makeRepsEntry('squat', 10, 100 + i * 2), `w${i}`),
    );
    const result = lastNEntriesFor(entries, 'squat', 2);
    expect(result).toHaveLength(2);
    // Deve conter as entradas de 10-10 e 10-15
    expect(result[0]?.target.weightKg).toBe(104);
    expect(result[1]?.target.weightKg).toBe(106);
  });
});

// ---------------------------------------------------------------------------
// consecutiveMisses
// ---------------------------------------------------------------------------

describe('consecutiveMisses', () => {
  it('histórico vazio → 0', () => {
    expect(consecutiveMisses([], 'squat')).toBe(0);
  });

  it('última sessão foi hit → 0', () => {
    const entry = makeRepsEntry('squat', 10, 100, '10', 3);
    const w = makeWorkout('2026-10-10', entry);
    expect(consecutiveMisses([w], 'squat')).toBe(0);
  });

  it('1 miss consecutivo', () => {
    const miss: WorkoutEntry = {
      exerciseId: 'bench',
      sets: [{ reps: 7, done: true }, { reps: 7, done: true }, { reps: 7, done: true }],
      target: { sets: 3, reps: '10', weightKg: 60 },
    };
    const w = makeWorkout('2026-10-10', miss);
    expect(consecutiveMisses([w], 'bench')).toBe(1);
  });

  it('2 misses consecutivos seguidos de 1 hit antigo → conta 2', () => {
    const hit: WorkoutEntry = {
      exerciseId: 'bench',
      sets: [{ reps: 10, done: true }, { reps: 10, done: true }, { reps: 10, done: true }],
      target: { sets: 3, reps: '10', weightKg: 60 },
    };
    const miss: WorkoutEntry = {
      exerciseId: 'bench',
      sets: [{ reps: 7, done: true }, { reps: 7, done: true }, { reps: 7, done: true }],
      target: { sets: 3, reps: '10', weightKg: 60 },
    };
    const w1 = makeWorkout('2026-10-01', hit, 'w1');
    const w2 = makeWorkout('2026-10-05', miss, 'w2');
    const w3 = makeWorkout('2026-10-10', miss, 'w3');
    expect(consecutiveMisses([w1, w2, w3], 'bench')).toBe(2);
  });

  it('ignora workouts sem o exercício em questão', () => {
    const missSquat: WorkoutEntry = {
      exerciseId: 'squat',
      sets: [{ reps: 5, done: true }],
      target: { sets: 3, reps: '10', weightKg: 100 },
    };
    const otherEx: WorkoutEntry = {
      exerciseId: 'bench',
      sets: [{ reps: 10, done: true }],
      target: { sets: 3, reps: '10', weightKg: 60 },
    };
    const w1 = makeWorkout('2026-10-01', missSquat, 'w1');
    // Workout com outro exercício não interrompe a contagem de misses do squat.
    const w2: WorkoutLog = {
      id: 'w2',
      dateISO: '2026-10-05',
      entries: [otherEx],
      createdAt: 0,
    };
    const w3 = makeWorkout('2026-10-10', missSquat, 'w3');
    // 2 misses do squat; workout w2 não tem squat → ignorado
    expect(consecutiveMisses([w1, w2, w3], 'squat')).toBe(2);
  });
});

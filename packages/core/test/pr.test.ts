import { describe, it, expect } from 'vitest';
import { detectPRs, detectAllPRs } from '../src/pr.js';
import type { WorkoutLog, WorkoutEntry } from '../src/types.js';

// ---------------------------------------------------------------------------
// Factories de fixture
// ---------------------------------------------------------------------------

function makeWorkout(
  dateISO: string,
  entries: WorkoutEntry[],
  id = dateISO,
): WorkoutLog {
  return { id, dateISO, entries, createdAt: 0 };
}

/** Entrada de reps simples, todas done. */
function makeRepsEntry(
  exerciseId: string,
  sets: { reps: number; weightKg: number; done?: boolean }[],
): WorkoutEntry {
  return {
    exerciseId,
    sets: sets.map(({ reps, weightKg, done = true }) => ({ reps, weightKg, done })),
    target: { sets: sets.length, reps: '10' },
  };
}

const EX = 'supino';

// ---------------------------------------------------------------------------
// detectPRs — sem histórico anterior
// ---------------------------------------------------------------------------

describe('detectPRs — sem histórico', () => {
  it('primeira vez com o exercício → nenhum PR', () => {
    const entry = makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }]);
    const prs = detectPRs(entry, []);
    expect(prs).toHaveLength(0);
  });

  it('histórico existe, mas para outro exercício → nenhum PR', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry('agachamento', [{ reps: 5, weightKg: 80 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }]);
    const prs = detectPRs(entry, history);
    expect(prs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectPRs — sem PRs (dentro dos limites históricos)
// ---------------------------------------------------------------------------

describe('detectPRs — sem PR batido', () => {
  it('carga igual ao histórico → não é PR de carga', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }]);
    const prs = detectPRs(entry, history);
    expect(prs.find((p) => p.kind === 'weight')).toBeUndefined();
  });

  it('carga abaixo do histórico → não é PR de carga', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 5, weightKg: 90 }]);
    const prs = detectPRs(entry, history);
    expect(prs.find((p) => p.kind === 'weight')).toBeUndefined();
  });

  it('série não feita (done=false) não conta para PR', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 5, weightKg: 120, done: false }]);
    const prs = detectPRs(entry, history);
    expect(prs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// detectPRs — PR de carga (kind: 'weight')
// ---------------------------------------------------------------------------

describe('detectPRs — PR de carga', () => {
  it('nova carga supera o máximo histórico → PR de carga', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 5, weightKg: 102.5 }]);
    const prs = detectPRs(entry, history);
    const pr = prs.find((p) => p.kind === 'weight');
    expect(pr).toBeDefined();
    expect(pr?.value).toBe(102.5);
    expect(pr?.exerciseId).toBe(EX);
  });

  it('múltiplas séries — usa o maior valor do set atual', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [
      { reps: 5, weightKg: 90 },
      { reps: 5, weightKg: 105 },
      { reps: 5, weightKg: 95 },
    ]);
    const prs = detectPRs(entry, history);
    const pr = prs.find((p) => p.kind === 'weight');
    expect(pr?.value).toBe(105);
  });

  it('série done=false com carga maior não contamina o PR de carga', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [
      { reps: 5, weightKg: 200, done: false }, // não feita — ignora
      { reps: 5, weightKg: 95, done: true },
    ]);
    const prs = detectPRs(entry, history);
    expect(prs.find((p) => p.kind === 'weight')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// detectPRs — PR de 1RM (kind: '1rm')
// ---------------------------------------------------------------------------

describe('detectPRs — PR de 1RM', () => {
  it('série elegível supera 1RM histórico → PR de 1RM', () => {
    // Histórico: 5×100 → 1RM ≈ 116.7 (Epley)
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    // Atual: 3×110 → 1RM ≈ 121 (Epley)
    const entry = makeRepsEntry(EX, [{ reps: 3, weightKg: 110 }]);
    const prs = detectPRs(entry, history);
    const pr = prs.find((p) => p.kind === '1rm');
    expect(pr).toBeDefined();
    expect(pr?.value).toBeGreaterThan(116.7);
  });

  it('série com reps=13 não é elegível para 1RM', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    // reps=13 está fora da janela (> 12)
    const entry = makeRepsEntry(EX, [{ reps: 13, weightKg: 110 }]);
    const prs = detectPRs(entry, history);
    expect(prs.find((p) => p.kind === '1rm')).toBeUndefined();
  });

  it('série com reps=1 é elegível (1RM = carga)', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 1, weightKg: 120 }]);
    const prs = detectPRs(entry, history);
    const pr = prs.find((p) => p.kind === '1rm');
    expect(pr?.value).toBe(120);
  });

  it('carga zero não é elegível para 1RM', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 5, weightKg: 0 }]);
    const prs = detectPRs(entry, history);
    expect(prs.find((p) => p.kind === '1rm')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// detectPRs — PR de reps (kind: 'reps')
// ---------------------------------------------------------------------------

describe('detectPRs — PR de reps', () => {
  it('mais reps com carga supera histórico → PR de reps', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 10, weightKg: 80 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 12, weightKg: 80 }]);
    const prs = detectPRs(entry, history);
    const pr = prs.find((p) => p.kind === 'reps');
    expect(pr?.value).toBe(12);
  });

  it('série sem carga (weightKg=0) não conta para PR de reps', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 10, weightKg: 80 }])])];
    // reps altíssimas mas sem carga — não é PR de reps
    const entry = makeRepsEntry(EX, [{ reps: 100, weightKg: 0 }]);
    const prs = detectPRs(entry, history);
    expect(prs.find((p) => p.kind === 'reps')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// detectPRs — múltiplos PRs simultâneos
// ---------------------------------------------------------------------------

describe('detectPRs — múltiplos PRs', () => {
  it('série que supera carga E 1RM retorna ambos os PRs', () => {
    const history = [makeWorkout('2026-01-01', [makeRepsEntry(EX, [{ reps: 5, weightKg: 100 }])])];
    const entry = makeRepsEntry(EX, [{ reps: 5, weightKg: 110 }]);
    const prs = detectPRs(entry, history);
    const kinds = prs.map((p) => p.kind);
    expect(kinds).toContain('weight');
    expect(kinds).toContain('1rm');
  });
});

// ---------------------------------------------------------------------------
// detectAllPRs
// ---------------------------------------------------------------------------

describe('detectAllPRs', () => {
  it('agrega PRs de múltiplos exercícios', () => {
    const history = [
      makeWorkout('2026-01-01', [
        makeRepsEntry('supino', [{ reps: 5, weightKg: 100 }]),
        makeRepsEntry('agachamento', [{ reps: 5, weightKg: 120 }]),
      ]),
    ];
    const entries = [
      makeRepsEntry('supino', [{ reps: 5, weightKg: 105 }]),
      makeRepsEntry('agachamento', [{ reps: 5, weightKg: 125 }]),
    ];
    const prs = detectAllPRs(entries, history);
    const exIds = prs.map((p) => p.exerciseId);
    expect(exIds).toContain('supino');
    expect(exIds).toContain('agachamento');
  });

  it('lista vazia de entries → nenhum PR', () => {
    const prs = detectAllPRs([], []);
    expect(prs).toHaveLength(0);
  });

  it('exercício sem histórico → nenhum PR (não inclui primeiras vezes)', () => {
    const entries = [makeRepsEntry('terra', [{ reps: 5, weightKg: 150 }])];
    const prs = detectAllPRs(entries, []);
    expect(prs).toHaveLength(0);
  });
});

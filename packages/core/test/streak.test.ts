import { describe, it, expect } from 'vitest';
import { computeStreak, weekActivity } from '../src/streak.js';
import { estimate1RM, round1 } from '../src/onerm.js';
import { startOfWeek, daysBetween, addDays } from '../src/date.js';

describe('computeStreak', () => {
  it('vazio → zero', () => {
    expect(computeStreak([], '2026-10-29')).toEqual({
      current: 0, longest: 0, lastTrainedISO: null, alive: false,
    });
  });

  it('treinou hoje → streak 1, viva', () => {
    const s = computeStreak(['2026-10-29'], '2026-10-29');
    expect(s.current).toBe(1);
    expect(s.alive).toBe(true);
  });

  it('dias consecutivos terminando hoje', () => {
    const s = computeStreak(['2026-10-27', '2026-10-28', '2026-10-29'], '2026-10-29');
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.alive).toBe(true);
  });

  it('treinou ontem mas não hoje → ainda viva, current conta até ontem', () => {
    const s = computeStreak(['2026-10-27', '2026-10-28'], '2026-10-29');
    expect(s.current).toBe(2);
    expect(s.alive).toBe(true);
  });

  it('gap de 2+ dias → streak quebrada (morta), current 0', () => {
    const s = computeStreak(['2026-10-25', '2026-10-26'], '2026-10-29');
    expect(s.current).toBe(0);
    expect(s.alive).toBe(false);
    expect(s.longest).toBe(2);
  });

  it('longest ignora a sequência atual menor', () => {
    const s = computeStreak(
      ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-28', '2026-10-29'],
      '2026-10-29',
    );
    expect(s.longest).toBe(4);
    expect(s.current).toBe(2);
  });

  it('datas duplicadas não inflam a streak', () => {
    const s = computeStreak(['2026-10-29', '2026-10-29', '2026-10-28'], '2026-10-29');
    expect(s.current).toBe(2);
  });
});

describe('weekActivity', () => {
  it('marca os dias treinados na semana', () => {
    const start = startOfWeek('2026-10-29', 1); // segunda
    const trained = [addDays(start, 0), addDays(start, 2)];
    const act = weekActivity(trained, start);
    expect(act[0]).toBe(true);
    expect(act[1]).toBe(false);
    expect(act[2]).toBe(true);
    expect(act).toHaveLength(7);
  });
});

describe('estimate1RM', () => {
  it('reps 1 → a própria carga', () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });
  it('Epley: 100kg × 5 ≈ 116.7', () => {
    expect(round1(estimate1RM(100, 5, 'epley'))).toBe(116.7);
  });
  it('Brzycki: 100kg × 5 ≈ 112.5', () => {
    expect(round1(estimate1RM(100, 5, 'brzycki'))).toBe(112.5);
  });
});

describe('date helpers', () => {
  it('daysBetween', () => {
    expect(daysBetween('2026-10-01', '2026-10-10')).toBe(9);
  });
  it('startOfWeek segunda', () => {
    // 2026-10-29 é quinta → segunda da semana = 2026-10-26
    expect(startOfWeek('2026-10-29', 1)).toBe('2026-10-26');
  });
});

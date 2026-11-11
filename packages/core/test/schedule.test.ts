import { describe, it, expect } from 'vitest';
import { effectiveRoutine } from '../src/schedule.js';
import type { WeekPlan, DayOverride } from '../src/types.js';

// Plano base: seg=A, ter=B, qua=null, qui=C, sex=D, sab=null, dom=null
// 2026-11-09 = segunda, 2026-11-10 = terça, 2026-11-11 = quarta
// 2026-11-12 = quinta,  2026-11-13 = sexta,  2026-11-14 = sábado, 2026-11-15 = domingo
const BASE_PLAN: WeekPlan = {
  0: null,       // domingo
  1: 'rotina-A', // segunda
  2: 'rotina-B', // terça
  3: null,       // quarta
  4: 'rotina-C', // quinta
  5: 'rotina-D', // sexta
  6: null,       // sábado
};

const NO_OVERRIDES: DayOverride[] = [];

describe('effectiveRoutine — sem overrides', () => {
  it('dia com rotina no plano retorna o routineId', () => {
    // 2026-11-09 é segunda → rotina-A
    expect(effectiveRoutine('2026-11-09', BASE_PLAN, NO_OVERRIDES)).toBe('rotina-A');
  });

  it('dia vazio no plano retorna null', () => {
    // 2026-11-11 é quarta → null
    expect(effectiveRoutine('2026-11-11', BASE_PLAN, NO_OVERRIDES)).toBeNull();
  });

  it('domingo sem rotina retorna null', () => {
    expect(effectiveRoutine('2026-11-15', BASE_PLAN, NO_OVERRIDES)).toBeNull();
  });
});

describe('effectiveRoutine — com overrides', () => {
  it('override com routineId retorna o routineId do override', () => {
    const overrides: DayOverride[] = [
      { dateISO: '2026-11-11', routine: 'rotina-X' }, // quarta → sobrepõe null do plano
    ];
    expect(effectiveRoutine('2026-11-11', BASE_PLAN, overrides)).toBe('rotina-X');
  });

  it("override 'rest' retorna 'rest' mesmo em dia com rotina", () => {
    const overrides: DayOverride[] = [
      { dateISO: '2026-11-09', routine: 'rest' }, // segunda tem rotina-A mas vai descansar
    ];
    expect(effectiveRoutine('2026-11-09', BASE_PLAN, overrides)).toBe('rest');
  });

  it('override null volta ao plano semanal', () => {
    const overrides: DayOverride[] = [
      { dateISO: '2026-11-09', routine: null }, // "desfaz" override → cai no plano
    ];
    // segunda → rotina-A do plano
    expect(effectiveRoutine('2026-11-09', BASE_PLAN, overrides)).toBe('rotina-A');
  });

  it('override null em dia vazio do plano retorna null', () => {
    const overrides: DayOverride[] = [
      { dateISO: '2026-11-11', routine: null }, // quarta tem null no plano
    ];
    expect(effectiveRoutine('2026-11-11', BASE_PLAN, overrides)).toBeNull();
  });

  it('override para outra data não afeta a data consultada', () => {
    const overrides: DayOverride[] = [
      { dateISO: '2026-11-10', routine: 'rotina-X' }, // terça tem override
    ];
    // segunda (11-09) não tem override → usa plano
    expect(effectiveRoutine('2026-11-09', BASE_PLAN, overrides)).toBe('rotina-A');
  });
});

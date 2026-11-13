import { describe, it, expect } from 'vitest';
import { computePlates, DEFAULT_BAR_KG, DEFAULT_PLATES_KG } from '../src/plates.js';

describe('computePlates', () => {
  it('alvo exato com anilhas padrão — 100 kg', () => {
    // 100 kg: barra 20 + 2 × (20 + 20) = 100 → não funciona,
    // greedy: 100 - 20 = 80 / 2 = 40 por lado → 25 + 15 = 40
    const r = computePlates(100, 20, DEFAULT_PLATES_KG);
    expect(r.perSide).toEqual([25, 15]);
    expect(r.achievableKg).toBe(100);
    expect(r.leftover).toBe(0);
  });

  it('alvo exato simples — 60 kg (barra + 20 por lado)', () => {
    const r = computePlates(60, 20, DEFAULT_PLATES_KG);
    expect(r.perSide).toEqual([20]);
    expect(r.achievableKg).toBe(60);
    expect(r.leftover).toBe(0);
  });

  it('alvo menor que a barra → só barra, sem anilhas', () => {
    const r = computePlates(15, 20, DEFAULT_PLATES_KG);
    expect(r.perSide).toEqual([]);
    expect(r.achievableKg).toBe(20);
    // leftover = barra - alvo = 5
    expect(r.leftover).toBe(5);
  });

  it('alvo igual à barra → sem anilhas', () => {
    const r = computePlates(20, 20, DEFAULT_PLATES_KG);
    expect(r.perSide).toEqual([]);
    expect(r.achievableKg).toBe(20);
    expect(r.leftover).toBe(0);
  });

  it('anilhas insuficientes para atingir o alvo — leftover positivo', () => {
    // Apenas [5], alvo 100 kg → por lado precisa de 40 kg, só tem múltiplos de 5
    const r = computePlates(100, 20, [5]);
    // 40 / 5 = 8 anilhas de 5 por lado → 20 + 80 = 100 kg exato
    expect(r.perSide).toEqual([5, 5, 5, 5, 5, 5, 5, 5]);
    expect(r.achievableKg).toBe(100);
    expect(r.leftover).toBe(0);
  });

  it('anilhas insuficientes — alvo não atingível exatamente', () => {
    // Só [10], alvo 85 kg → por lado precisa de 32.5 kg → 3×10 = 30 (leftover 5)
    const r = computePlates(85, 20, [10]);
    expect(r.perSide).toEqual([10, 10, 10]);
    expect(r.achievableKg).toBe(80);
    expect(r.leftover).toBe(5);
  });

  it('lista de anilhas fora de ordem é aceita', () => {
    // [1.25, 25, 10, 5] → ordenado internamente: [25, 10, 5, 1.25]
    // alvo 60 kg, barra 20 → 20 por lado
    // 25 > 20 → não cabe; 10 cabe → remaining 10; 10 cabe → remaining 0
    const r = computePlates(60, 20, [1.25, 25, 10, 5]);
    expect(r.perSide).toEqual([10, 10]);
    expect(r.achievableKg).toBe(60);
    expect(r.leftover).toBe(0);
  });

  it('múltiplas anilhas pequenas somam corretamente', () => {
    // alvo 25 kg, barra 20 → 5 / 2 = 2.5 por lado → 1 anilha de 2.5
    const r = computePlates(25, 20, DEFAULT_PLATES_KG);
    expect(r.perSide).toEqual([2.5]);
    expect(r.achievableKg).toBe(25);
    expect(r.leftover).toBe(0);
  });

  it('lista vazia → só a barra', () => {
    const r = computePlates(60, 20, []);
    expect(r.perSide).toEqual([]);
    expect(r.achievableKg).toBe(20);
    expect(r.leftover).toBe(40);
  });

  it('barra customizada — powerlifting 25 kg', () => {
    const r = computePlates(125, 25, [25, 20, 15, 10, 5, 2.5]);
    // 125 - 25 = 100 / 2 = 50 por lado → 25 + 25 = 50
    expect(r.perSide).toEqual([25, 25]);
    expect(r.achievableKg).toBe(125);
    expect(r.leftover).toBe(0);
  });

  it('DEFAULT_BAR_KG é 20', () => {
    expect(DEFAULT_BAR_KG).toBe(20);
  });

  it('DEFAULT_PLATES_KG inclui os pesos padrão', () => {
    expect(DEFAULT_PLATES_KG).toContain(25);
    expect(DEFAULT_PLATES_KG).toContain(1.25);
  });
});

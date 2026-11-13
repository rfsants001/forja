# P5-004 · Medidas, notas e anilhas

Atualizado em 13/11/2026.

## Estado

Medidas corporais persistem no Dexie v2, entram no backup v2 e têm gráfico. Notas de exercício são preservadas na atualização do catálogo. A calculadora usa anilhas padrão e converte a apresentação em lb no guiado.

## Aceite

Validar medições, formatos v1/v2, consistência de unidades nas demais telas e inventário de anilhas do usuário.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

> Fase 5 — conforto. Três sub-features coesas, todas local-first (Dexie), um commit.

## 1. Medidas corporais (G14)
Registrar medidas ao longo do tempo (além do peso, que já existe).

- **Core (`packages/core/src/types.ts`):** novo tipo
  ```ts
  export interface BodyMeasurement {
    dateISO: string;              // chave
    waistCm?: number; chestCm?: number; hipsCm?: number;
    leftArmCm?: number; rightArmCm?: number;
    leftThighCm?: number; rightThighCm?: number;
    neckCm?: number; calfCm?: number;
    note?: string;
  }
  ```
  Exportar no barrel (`index.ts` já faz `export * from './types.js'`).
- **Dexie migração (`apps/web/src/db/db.ts`):** bump pra `this.version(2).stores({ ... })`
  ADICIONANDO `measurements: 'dateISO'` e repetindo TODAS as stores existentes (Dexie exige o
  conjunto completo na nova versão; stores aditivas não perdem dados). Manter o `version(1)` acima
  intacto. Nova `Table<BodyMeasurement, string>` no schema da classe.
- **Repo:** `addMeasurement(m)`, `deleteMeasurement(dateISO)`, e leitura via `useLiveQuery`.
- **UI:** uma seção em `Progresso.tsx` (ao lado do peso corporal), com form de entrada e um
  gráfico SVG reaproveitando o padrão de chart que já existe no arquivo (não criar lib nova).

## 2. Notas por exercício (G15)
Nota persistente por exercício da biblioteca (diferente do `note` por rotina, que já existe).

- **Core:** adicionar `note?: string` ao `Exercise` (types.ts).
- **UI:** editar a nota na tela de detalhe do exercício em `Exercicios.tsx` (campo textarea que
  salva via `upsertExercise`). Mostrar a nota onde o exercício aparece se fizer sentido leve.

## 3. Calculadora de anilhas (G15)
Dado peso-alvo, barra e anilhas disponíveis, quais anilhas por lado.

- **Core util puro (`packages/core/src/plates.ts`, com testes em `packages/core/test/`):**
  ```ts
  export function computePlates(
    targetKg: number, barKg: number, available: number[]
  ): { perSide: number[]; achievableKg: number; leftover: number };
  ```
  Greedy das maiores anilhas; `achievableKg` = peso realmente montável; `leftover` = diferença.
  Casos: alvo < barra, anilhas insuficientes. Cobrir com testes.
- **UI:** um mini-widget acessível no treino guiado (`TreinoGuiado.tsx`) ao definir carga, OU um
  tool simples; barra padrão 20 kg, anilhas padrão `[25,20,15,10,5,2.5,1.25]`. Respeitar
  `settings.unit` (kg/lb) na apresentação.

## Done-when
- [ ] Medidas: registrar/editar/apagar por data + gráfico; migração Dexie v2 não perde dados.
- [ ] Nota por exercício persiste e aparece na tela de detalhe.
- [ ] `computePlates` com testes verdes; widget mostra anilhas por lado respeitando unidade.
- [ ] `pnpm -r typecheck` limpo · `build` ok · core tests verdes (incluindo os novos de plates).

## Fora de escopo
Fotos de progresso, medidas com lembrete, conversão automática de unidade nas medidas.

</details>

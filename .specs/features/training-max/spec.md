# P5-005 · Training max e 5/3/1

Atualizado em 13/11/2026.

## Estado

A rotina define TM base e aumento opcional, padrão 2,5 kg. O guiado preenche os três main sets individuais e guarda semana, carga, reps, TM e AMRAP. O ciclo deriva de quatro semanas qualificadas do mesmo exercício/rotina/TM base. Uma semana abaixo da meta é repetida. Logs sem metadados 5/3/1 permanecem disponíveis como histórico.

## Aceite

Conferir 65/75/85 kg para TM 100 na semana 1, a semana de deload, uma sessão abaixo da carga, isolamento de rotinas e novo TM após quatro sucessos.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

> Fase 5. Prescrição baseada em % de um training max (TM), com o esquema clássico 5/3/1 do
> Wendler. Roda sobre o motor de progressão existente (`packages/core/src/progression.ts`),
> que é funcional-puro (recalcula do histórico, nunca persiste). Local-first.

## Conceito
- **Training max (TM):** carga de trabalho, tipicamente ~90% do 1RM. O usuário define o TM por
  exercício (ou deriva de `estimate1RM` × 0.9, já existe `estimate1RM` em `onerm.ts`).
- **Esquema 5/3/1 (4 semanas, % do TM):**
  - Semana 1 (5s):  65%×5, 75%×5, 85%×5+
  - Semana 2 (3s):  70%×3, 80%×3, 90%×3+
  - Semana 3 (5/3/1): 75%×5, 85%×3, 95%×1+
  - Semana 4 (deload): 40%×5, 50%×5, 60%×5
  - "+" = AMRAP (as many reps as possible) no último set.
- **Progressão do TM:** após um ciclo (4 semanas), +2.5 kg (upper) / +5 kg (lower). Expor como
  helper; o incremento por exercício pode reusar `incrementKg`.

## Core (packages/core)
- **`RoutineExercise`:** adicionar campos opcionais `trainingMaxKg?: number` e, se precisar,
  reutilizar `progression: '531'` — adicionar `'531'` ao union `ProgressionPolicy` em `types.ts`
  (atualizar os lugares que fazem `switch`/`Record<ProgressionPolicy,...>` pra não quebrar o
  exhaustiveness — STALL_THRESHOLD etc).
- **Novo módulo `packages/core/src/fivethreeone.ts`:**
  ```ts
  export interface MainSet { percentOfTM: number; reps: number; amrap: boolean; }
  export function weekScheme(week: 1|2|3|4): MainSet[];
  export function prescribe531(tmKg: number, week: 1|2|3|4, roundKg?: number): { weightKg:number; reps:number; amrap:boolean }[];
  export function nextTrainingMax(tmKg: number, isUpper: boolean): number; // +2.5 / +5
  ```
  Arredondar carga pro múltiplo de `roundKg` (default 2.5). Exportar no barrel `index.ts`.
- **Integração com `nextPrescription`:** quando `policy==='531'`, derivar a semana do ciclo a
  partir do nº de sessões logadas desse exercício (sessão 0→sem1, 1→sem2, ...) e devolver uma
  `Prescription` que carregue os main sets (estender o tipo `Prescription`/`kind` se necessário,
  sem quebrar os kinds atuais: 'prefill'|'fresh'|ProgressionPolicy).
- **Testes (`packages/core/test/fivethreeone.test.ts`):** cobrir `weekScheme`, `prescribe531`
  (incl. arredondamento), `nextTrainingMax`, e a derivação de semana no `nextPrescription`.

## UI (apps/web)
- No editor de rotina (`RotinaEditor.tsx`): escolher progressão `5/3/1` e informar o TM (ou botão
  "derivar do 1RM" usando o melhor set do histórico).
- No treino guiado (`TreinoGuiado.tsx`): mostrar os 3 main sets com %, carga calculada e reps,
  marcando o set AMRAP. Respeitar `settings.unit`.

## Done-when
- [ ] `prescribe531` devolve as cargas corretas pras 4 semanas, arredondadas; testes verdes.
- [ ] Exercício marcado como 5/3/1 mostra os main sets certos no guiado conforme o ciclo avança.
- [ ] TM incrementa ao fechar o ciclo; nada persiste fora dos logs/rotina.
- [ ] `pnpm -r typecheck` limpo (exhaustiveness do ProgressionPolicy ok) · `build` ok · core tests verdes.

## Fora de escopo
Variações (BBB, FSL, Joker sets), autorregulação, templates 5/3/1 prontos (isso é starter-plans).

</details>

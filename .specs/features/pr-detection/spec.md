# P35-004 · Recordes pessoais

Atualizado em 13/11/2026.

## Estado

A marcação de séries compara carga e 1RM com sessões anteriores. O toast aparece por tipo de PR e a finalização grava os recordes. O histórico mostra o total registrado. A edição de séries remove marcadores persistidos para evitar recorde obsoleto.

## Aceite

Validar toast com e sem descanso, identificar a série do recorde no histórico e avaliar peso opcional pré-treino depois do piloto.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

**Roadmap:** P35-004 | **Gap:** G8 | **Fase:** 3.5 — Paridade visual/UX

## Summary

O Forja já calcula 1RM estimado (Epley) via `estimate1RM` em `@forja/core` e exibe PRs
históricos na tela de stats via `computePRs` em `apps/web/src/lib/stats.ts`. O que falta
é o feedback em tempo real: quando o usuário marca uma série no treino guiado que supera
seu melhor 1RM anterior para aquele exercício, nada acontece. Esta feature entrega:
(1) detecção inline de PR ao marcar a série como `done` no `TreinoGuiado.tsx`;
(2) um toast ou badge de celebração não-intrusivo; (3) identificação do set exato que
gerou o melhor 1RM (já parcialmente disponível em `computePRs`, que nomeia o set).
O G13 do gap (perguntar peso corporal antes do treino) é dobrado aqui como FN opcional
de baixo custo.

## Requirements

### Functional

#### Detecção em tempo real

- [FN-001] Ao marcar uma série como `done` em `TreinoGuiado.tsx`, se a série tiver
  `reps >= 1`, `weightKg > 0` e `reps <= 12` (critério de elegibilidade do `estimate1RM`
  já usado em `computePRs`), calcular `estimate1RM(weightKg, reps)` e comparar com o
  melhor 1RM histórico do mesmo `exerciseId` nos workouts já logados.
- [FN-002] Se o 1RM da série atual for maior que o histórico (ou se for a primeira série
  registrada para o exercício), exibir um toast de PR: "🏆 Novo 1RM! <valor> kg" ou
  equivalente, com duração de 2,5 s. O toast não bloqueia interação.
- [FN-003] Detectar também PR de **carga bruta** (maior `weightKg` já usado no exercício,
  independente de reps) — exibir como segundo toast se diferente do PR de 1RM.
- [FN-004] O histórico usado para comparação deve incluir apenas workouts **já finalizados**
  (`workouts` carregados do Dexie pelo `useLiveQuery` existente em `TreinoGuiado.tsx`),
  não a sessão em andamento. Isso evita detectar PR na série 2 comparando com a série 1
  da mesma sessão.
- [FN-005] Dentro da mesma sessão, detectar no máximo um PR por exercício (evitar multiple
  toasts se várias séries do mesmo exercício superarem o recorde na mesma sessão). O
  primeiro PR detectado é celebrado; os seguintes são silenciosos mas registrados no
  `WorkoutLog` via campo novo `prFlags` (ver FN-007).
- [FN-006] Na tela de histórico ou resumo pós-treino, as séries que geraram PR devem ser
  marcadas visualmente (ícone de troféu ou badge "PR").
- [FN-007] Adicionar campo opcional `prFlags?: { exerciseId: string; kind: '1rm' | 'weight' }[]`
  ao `WorkoutLog` em `packages/core/src/types.ts`. Preenchido ao finalizar o treino
  (`finish()` no store) com todos os PRs detectados na sessão.
- [FN-008] Na tela de 1RM (stats), ao exibir o "set do melhor 1RM", nomear qual workout
  (data) e qual série (número) gerou o recorde. `computePRs` em `stats.ts` já retorna
  `best1RM` e `repsAtBest`; adicionar `workoutDateISO: string` e `setIndex: number` ao
  tipo `ExercisePR`.

#### Peso corporal pré-treino (G13 — dobrado)

- [FN-009] Ao iniciar o treino guiado, se não houver registro de peso corporal para hoje
  (`bodyweight` table do Dexie), exibir um modal/sheet opcional: "Qual seu peso hoje?
  (pode pular)". O campo aceita o valor do último registro como placeholder. Se o usuário
  preencher, insere em `db.bodyweight`; se pular, não insere. Não bloqueia o início do
  treino.
- [FN-010] O modal de peso (FN-009) só é exibido se `Settings.trackBodyWeight` for `true`
  (novo campo booleano em `Settings`, padrão `false`). Adicionar toggle em Settings:
  "Pedir peso antes do treino".

### Non-Functional

- [NF-001] A detecção de PR (FN-001) deve ser O(n) no número de séries do histórico e
  rodar no mesmo thread sem bloqueio perceptível — a base de dados de um usuário ativo
  raramente ultrapassa 10.000 séries.
- [NF-002] O toast de PR não deve aparecer para exercícios sem histórico anterior se a
  série for a "primeira vez" do usuário com aquele exercício em carga baixa. Critério:
  só celebrar se houver pelo menos 1 workout anterior com o mesmo `exerciseId` finalizado.
- [NF-003] A extensão de `WorkoutLog` com `prFlags` e de `Settings` com `trackBodyWeight`
  deve ser retrocompatível (campos opcionais); incrementar a versão do Dexie apenas se
  necessário para indexação (não necessário aqui).

## Out of Scope

- PR de volume total por sessão (maior volume em um único treino) — phase futura
  (G4/effort-stats).
- Leaderboard ou compartilhamento de PR — sem backend.
- PR de exercícios no modo `time` ou `cardio` (tempo de prancha, distância) — pode ser
  adicionado posteriormente como extensão desta feature.
- Notificação push de PR quando o app está fechado (G11/push-reminders — fase 5).

## Open Questions

- [OQ-1] **Localização do toast na UI:** o rest timer ocupa overlay full-screen; se o PR
  for detectado no mesmo momento que o rest timer abre, como os dois convivem? Proposta:
  o toast fica acima do overlay de descanso (z-index maior), dura 2,5s e some sozinho.
- [OQ-2] **1RM ou carga bruta como métrica principal de PR?** Para usuários que treinam
  em faixas de reps altas (12–15), o 1RM estimado pode ser menos relevante. Mostrar
  ambos (FN-002 + FN-003) ou deixar o usuário escolher nas settings?
- [OQ-3] **Retroatividade:** ao importar workouts de outras plataformas (G5/importers,
  fase 4.5), os PRs históricos serão recalculados automaticamente via `computePRs`,
  sem necessidade de retroativamente preencher `prFlags`.

## Dependencies

- `packages/core/src/types.ts` — adicionar `prFlags?` a `WorkoutLog`;
  `trackBodyWeight?: boolean` a `Settings`; `workoutDateISO: string`, `setIndex: number`
  a `ExercisePR` (definido em `apps/web/src/lib/stats.ts`, não no core — verificar se
  deve ser movido para core).
- `apps/web/src/lib/stats.ts` — modificar `computePRs` para retornar `workoutDateISO`
  e `setIndex`; criar função auxiliar `bestPRMapByExercise(workouts)` que retorna
  `Map<exerciseId, { best1RM, bestWeightKg }>` para uso em tempo real no guiado.
- `apps/web/src/pages/TreinoGuiado.tsx` — chamar a função auxiliar na inicialização do
  treino (passando os workouts já carregados), comparar a cada `handleToggleDone`.
- `apps/web/src/store/session.ts` — `finish()` deve receber os PRs detectados e
  preencher `prFlags` no `WorkoutLog` antes de persistir.
- `apps/web/src/db/db.ts` — sem mudança de schema (campo `prFlags` serializado no JSON
  do `WorkoutLog`; `trackBodyWeight` serializado no `SettingsRow`).

</details>

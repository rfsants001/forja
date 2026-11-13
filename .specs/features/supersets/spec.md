# P35-002 · Supersets

Atualizado em 13/11/2026.

## Estado

O editor agrupa exercícios. O guiado alterna séries existentes no grupo e inicia descanso ao fechar a rodada. Rodadas desiguais pulam posições inexistentes. A configuração do grupo fica no rascunho.

## Aceite

Validar superset 3×3 e 3×4, retomada após reload e navegação manual após o descanso.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

**Roadmap:** P35-002 | **Gap:** G2 | **Fase:** 3.5 — Paridade visual/UX

## Summary

O tipo `RoutineExercise` em `packages/core/src/types.ts` já possui o campo
`supersetGroup?: number`, introduzido como ponto de extensão na Fase 1. No entanto,
nenhuma UI ou lógica de runtime o utiliza: o editor de rotina não permite agrupar
exercícios, e o treino guiado (`TreinoGuiado.tsx`) trata todos os exercícios de forma
sequencial, disparando o rest timer após cada série individualmente. Esta feature
entrega a experiência completa de superset: (1) editor de rotina com drag-and-drop ou
botão de agrupamento para definir `supersetGroup`; (2) lógica no treino guiado para
alternar entre os exercícios de um par/grupo antes de acionar o descanso; (3) indicação
visual clara durante o treino de que os exercícios fazem parte do mesmo superset.

## Requirements

### Functional

- [FN-001] No editor de rotina, o usuário pode selecionar dois ou mais exercícios
  consecutivos e marcá-los como superset. O campo `supersetGroup` recebe o mesmo número
  inteiro positivo para todos os exercícios do grupo (incrementado a cada novo superset
  na rotina). Exercícios sem superset têm `supersetGroup: undefined`.
- [FN-002] Um superset pode conter 2 ou 3 exercícios (tri-set). Mais de 3 é fora de escopo
  nesta fase.
- [FN-003] No editor de rotina, exercícios pertencentes ao mesmo `supersetGroup` recebem
  indicação visual (badge ou borda colorida), e o `restSec` configurado no grupo aplica-se
  após a conclusão de todos os exercícios do par/grupo (não após cada exercício individual).
- [FN-004] No treino guiado (`TreinoGuiado.tsx`), quando o exercício atual pertence a um
  superset, ao marcar a última série do exercício atual o guiado **não** abre o rest timer —
  em vez disso, navega automaticamente para o próximo exercício do mesmo grupo.
- [FN-005] O rest timer é acionado apenas após o usuário completar **todas as séries de
  todos os exercícios** do superset no mesmo round (ex.: série 1 do ex. A → série 1 do
  ex. B → rest; série 2 do ex. A → série 2 do ex. B → rest).
- [FN-006] Um indicador de progresso no card do treino guiado mostra "Superset A+B —
  Round 2 de 3" ou equivalente, tornando claro o estado dentro do grupo.
- [FN-007] Desfazer superset: no editor, o usuário pode remover um exercício do grupo ou
  desfazer o grupo inteiro, restaurando `supersetGroup: undefined` para todos os membros.
- [FN-008] A lógica de progressão (`nextPrescription` em `@forja/core`) é calculada
  individualmente por exercício, independente do superset. O agrupamento é puramente de UI
  e timing de descanso.
- [FN-009] A exportação/importação JSON (Fase 4) já serializa `RoutineExercise` completo;
  nenhuma mudança de schema é necessária, pois `supersetGroup` já é parte do tipo e da
  estrutura persistida na tabela `routines` do Dexie (campo `exercises: RoutineExercise[]`
  serializado como JSON no IndexedDB).

### Non-Functional

- [NF-001] A navegação automática entre exercícios do superset (FN-004) deve ser perceptível
  ao usuário (animação de transição), não abrupta.
- [NF-002] O estado de progresso do superset (qual round, qual exercício do grupo está ativo)
  deve ser parte do `useSessionStore` e sobreviver a navegações internas da SPA durante
  o treino.
- [NF-003] Se o usuário navegar manualmente para um exercício fora do superset no meio de um
  round, o estado do superset deve ser preservado (pode retomar depois), sem travar o fluxo.

## Out of Scope

- Supersets com exercícios não consecutivos na lista da rotina.
- Configuração de descanso diferente entre cada exercício dentro do superset (único `restSec`
  para o grupo inteiro).
- Relatórios/stats específicos de supersets (tela de histórico trata cada exercício
  individualmente).

## Open Questions

- [OQ-1] **UX de agrupamento no editor:** botão explícito "criar superset" após selecionar
  dois exercícios, ou drag-and-drop para sobrepor? O openGym usa uma UI de seleção com
  botão — recomendado para mobile-first.
- [OQ-2] **Ordem de execução dentro do round:** o round sempre alterna A→B→A→B? Ou o
  usuário pode definir a ordem de alternância (relevante para tri-sets A→B→C vs A→C→B)?
  _Proposta padrão: sempre na ordem em que os exercícios aparecem na lista da rotina._
- [OQ-3] **Prescrição de número de séries para supersets:** se ex. A tem 3 séries e ex. B
  tem 4, como funciona o último round? Continua o exercício com séries restantes sozinho?
  _Proposta padrão: recomendar que supersets tenham o mesmo número de séries; se diferente,
  o exercício com mais séries completa as séries extras sozinho sem rest automático._

## Dependencies

- `packages/core/src/types.ts` — `RoutineExercise.supersetGroup` já existe; nenhuma
  mudança de tipo necessária para o MVP.
- `apps/web/src/store/session.ts` — o store de sessão ativa precisa de lógica para
  detectar supersets e controlar a navegação automática entre exercícios do grupo
  (derivado do `Routine` carregado na inicialização do treino).
- `apps/web/src/pages/TreinoGuiado.tsx` — modificar `handleToggleDone` para verificar
  se o exercício atual pertence a um superset antes de chamar `startRest`.
- Editor de rotina (`apps/web/src/pages/RoutineEdit.tsx` ou equivalente) — adicionar
  UI de criação/remoção de supersets.
- `apps/web/src/db/db.ts` — sem mudança de schema (campo já serializado no array `exercises`
  do tipo `Routine`).

</details>

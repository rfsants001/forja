# P35-003 · Timers e cardio

Atualizado em 13/11/2026.

## Estado

A sessão guarda timestamps de execução e descanso. O usuário cronometra ou registra manualmente o tempo. Cardio registra tempo, distância e velocidade, e o histórico exibe as dimensões realizadas e alvos capturados.

## Aceite

Validar reload, bloqueio de tela, cancelamento, áudio e vibração reais.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

**Roadmap:** P35-003 | **Gap:** G3 | **Fase:** 3.5 — Paridade visual/UX

## Summary

O Forja já suporta exercícios no modo `time` (pranchas, hangs, wall-sits): o campo
`targetSec` em `RoutineExercise` e `SetLog.sec` armazenam o tempo-alvo e logado. O
`TreinoGuiado.tsx` exibe um campo numérico de entrada para `sec` e marca a série como
`done` quando o usuário clica no botão de check — mas **não há um cronômetro** que
meça o tempo real de execução da série. O usuário precisa contar o tempo externamente.
O modo `cardio` em `ExerciseMode` existe no tipo, mas não tem campos específicos
(`distanceM`, `speedKmh`) nem tratamento distinto do modo `reps` no guiado.
Esta feature entrega: (1) um **work timer** que, ao acionar, conta o tempo da série ao
vivo e preenche `SetLog.sec` automaticamente ao parar; (2) suporte completo ao modo
`cardio` com campos de tempo, distância e velocidade; e (3) coerência entre rest timer
(já existente) e work timer — eles nunca rodam em paralelo.

## Requirements

### Functional

#### Work timer (modo `time`)

- [FN-001] No card da série do treino guiado, exercícios com `mode: 'time'` exibem um
  botão "Iniciar série" (ícone play) no lugar do check imediato.
- [FN-002] Ao pressionar "Iniciar série", um cronômetro crescente é exibido em overlay
  (ou integrado ao card), contando de 0 até o `targetSec` configurado (ou até o usuário
  parar manualmente).
- [FN-003] O cronômetro toca um aviso sonoro (igual ao rest timer: WebAudio, 880 Hz,
  200 ms) e vibra quando o tempo-alvo é atingido, mas continua rodando até o usuário
  pressionar "Parar" (o usuário pode segurar além do alvo).
- [FN-004] Ao pressionar "Parar", o tempo decorrido (em segundos inteiros) é escrito em
  `SetLog.sec` e a série é marcada como `done: true`. O rest timer inicia em seguida
  (comportamento atual de `handleToggleDone`, via `startRest`).
- [FN-005] Se o usuário quiser ignorar o work timer (ex.: fazer a série de cabeça e só
  registrar o tempo), o campo numérico de `sec` continua editável diretamente; pressionar
  o check manual também funciona como antes.
- [FN-006] O work timer e o rest timer são mutuamente exclusivos no estado da sessão.
  Iniciar o work timer cancela qualquer rest timer ativo (raro, mas possível se o usuário
  pular o descanso antes de iniciar).
- [FN-007] O work timer sobrevive a recargas da aba durante o treino (persistência no
  `useSessionStore`, assim como o rest timer já faz com `endsAt`). O estado do work timer
  deve guardar `startedAt: number` (timestamp) no store.

#### Modo cardio

- [FN-008] Adicionar campos opcionais a `SetLog` em `packages/core/src/types.ts`:
  `distanceM?: number` (distância em metros) e `speedKmh?: number` (velocidade em km/h).
  Estes campos só são relevantes quando `Exercise.mode === 'cardio'`.
- [FN-009] Adicionar campos opcionais a `RoutineExercise`:
  `targetDistanceM?: number` e `targetSpeedKmh?: number`.
- [FN-010] No treino guiado, quando `mode === 'cardio'`, o card da série exibe os campos:
  - Tempo (sec) — com work timer disponível (FN-001 a FN-007)
  - Distância (m) — input numérico opcional
  - Velocidade (km/h) — input numérico opcional
  O campo de reps e carga não é exibido para modo cardio.
- [FN-011] O motor de progressão (`nextPrescription`) não aplica política de carga para
  `mode === 'cardio'` nesta fase (policy permanece `'off'` ou `'time'` para cardio).
  A prescrição preenche apenas `sec`, `distanceM` e `speedKmh` com os últimos valores
  logados (prefill sem progressão).
- [FN-012] O target snapshot (`TargetSnapshot` em `types.ts`) deve incluir campos opcionais
  `distanceM?: number` e `speedKmh?: number` para auditabilidade.

### Non-Functional

- [NF-001] O work timer deve usar `Date.now()` como referência (não `setInterval` acumulativo)
  para ser resistente a throttling do browser em segundo plano — mesma abordagem do rest
  timer em `TreinoGuiado.tsx`.
- [NF-002] O overlay/display do work timer deve ser visualmente distinto do rest timer
  (ex.: cor diferente — verde para work, laranja para rest), para o usuário saber de
  imediato qual está ativo.
- [NF-003] A extensão de tipo em `SetLog` e `RoutineExercise` deve ser retrocompatível:
  todos os campos novos são opcionais; workouts anteriores não são afetados.

## Out of Scope

- Progressão automática de distância/velocidade para cardio (fica em fase futura).
- Integração com sensores externos (GPS, frequencímetro) — requer API nativa/Capacitor.
- Histórico/gráfico de evolução de cardio (entregue pela tela de stats geral; não requer
  tela dedicada nesta fase).
- Work timer para modo `reps` (ex.: medir o tempo de um set de agachamento) — fora do
  escopo; apenas `time` e `cardio`.

## Open Questions

- [OQ-1] **Localização do overlay do work timer:** integrado ao card da série (empurra
  o layout para baixo) ou overlay flutuante como o rest timer? O rest timer usa overlay
  full-screen; o work timer provavelmente deve ser mais discreto para não esconder os
  campos das outras séries.
- [OQ-2] **Comportamento quando o app vai para segundo plano durante o work timer:**
  o cronômetro continua (via `startedAt` persistido), mas não há notificação de fim de
  série no background (diferente do rest timer, que pode usar push — G11, fase futura).
  Aceitar essa limitação nesta fase?
- [OQ-3] **Velocidade vs. pace:** para corredores, pace (min/km) é mais intuitivo do que
  km/h. Suportar apenas km/h nesta fase e adicionar pace depois (G16/programação)?

## Dependencies

- `packages/core/src/types.ts` — adicionar `distanceM?: number`, `speedKmh?: number` a
  `SetLog` e `RoutineExercise`; adicionar `distanceM?: number`, `speedKmh?: number` a
  `TargetSnapshot`.
- `apps/web/src/store/session.ts` — adicionar estado `workTimer: { startedAt: number | null }`
  e ações `startWork()` / `stopWork(): number` ao store de sessão.
- `apps/web/src/pages/TreinoGuiado.tsx` — modificar `SetRow` para exibir botão play/stop
  em modo time, tratar modo cardio, integrar `workTimer` do store.
- `apps/web/src/lib/stats.ts` — `computeVolumeByMuscle` ignora séries de cardio
  (sem `weightKg`); comportamento atual já correto (não precisa mudar).

</details>

# P35-005 · Mapa muscular

Atualizado em 13/11/2026.

## Estado

Atlas MuscleMap (MIT) com quatro vistas. Progresso alterna entre séries, volume e último treino; editor e detalhe mostram cobertura prevista. O detalhe usa legenda para o músculo principal e os auxiliares. As métricas ignoram aquecimento. A geometria e o mapeamento estão em `muscle-map.generated.json` e `muscle-map-paths.ts`. As seções de planejamento abaixo registram a proposta original.

## Aceite

Validar calor e contraste das regiões, foco e navegação da biblioteca em dispositivo.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

**Roadmap:** P35-005 | **Gap:** G7 | **Fase:** 3.5 — Paridade visual/UX

## Summary

O `MuscleMap` atual (`apps/web/src/components/MuscleMap.tsx`) exibe frente e costas
coloridas por volume relativo (Σ reps×kg), recebendo um `Map<MuscleGroup, number>` e
normalizando internamente. O componente é funcional mas incompleto como insight de
treinamento: ele não nomeia grupos sem volume (o usuário não sabe o que está negligenciando),
não tem janela temporal configurável, não tem figura feminina, e não exibe preview ao
montar uma rotina. Esta feature evolui o `MuscleMap` em quatro dimensões: (1) nomear
músculos não treinados no período como alerta visual; (2) preview em tempo real dos
músculos que a rotina em edição vai atingir; (3) toggle de figura masculina/feminina;
(4) seletor de janela temporal semana/mês/tudo na tela de stats.

## Requirements

### Functional

#### Músculos não treinados (modo stats)

- [FN-001] Na tela de stats, o `MuscleMap` deve exibir um painel de alerta listando os
  `MuscleGroup` que tiveram `volume === 0` no período selecionado, **excluindo** grupos
  não-aplicáveis ao treino de força padrão (`fullbody`, `cardio`, `other`).
- [FN-002] O painel de não-treinados exibe o nome legível de cada grupo (`MUSCLE_LABEL`
  já existente em `apps/web/src/lib/labels.ts`) com um ícone de aviso (ex.: ícone de
  alerta laranja). A lista é ordenada por "tempo sem treinar" (último workout que incluiu
  aquele músculo), do mais antigo ao mais recente — requer leitura do histórico completo.
- [FN-003] Ao clicar em um músculo não treinado no painel, a biblioteca de exercícios
  abre filtrada por aquele `primaryMuscle` (deep link para `/biblioteca?muscle=<group>`
  ou equivalente).

#### Janelas temporais

- [FN-004] A tela de stats que exibe o `MuscleMap` deve ter um seletor de janela com
  três opções: **Semana** (últimos 7 dias), **Mês** (últimos 30 dias), **Tudo** (histórico
  completo). O seletor persiste em `localStorage` ou no estado local da página entre
  navegações.
- [FN-005] A função `computeVolumeByMuscle` em `apps/web/src/lib/stats.ts` já aceita
  `days: number | null` para filtrar por período. A tela de stats deve passar `7`, `30`
  ou `null` conforme a janela selecionada.

#### Preview ao montar rotina

- [FN-006] No editor de rotina, após qualquer adição/remoção de exercício, exibir uma
  versão compacta do `MuscleMap` (somente frente ou toggle frente/costas) mostrando os
  músculos que a rotina em questão vai atingir.
- [FN-007] O preview usa uma versão simplificada do volume: cada exercício na rotina
  contribui com `1.0` (primário) ou `0.5` (secundário) para normalização. Não usa
  histórico — apenas a configuração atual da rotina.
- [FN-008] O preview é atualizado em tempo real conforme o usuário adiciona/remove
  exercícios, sem latência perceptível.
- [FN-009] Criar função pura em `@forja/core` (ou em `apps/web/src/lib/stats.ts`):
  `previewVolumeByMuscle(exercises: RoutineExercise[], exerciseMap: Map<string, Exercise>): Map<MuscleGroup, number>`
  que calcula o mapa de preview para o editor.

#### Figura masculina/feminina

- [FN-010] O `MuscleMap` recebe uma nova prop `sex?: 'male' | 'female'` (padrão `'male'`).
  Quando `'female'`, os paths de silhueta (`BODY_OUTLINE_FRONT`, `BODY_OUTLINE_BACK` em
  `apps/web/src/lib/muscle-map-paths.ts`) são substituídos por paths femininos.
- [FN-011] O toggle masculino/feminino é exposto em Settings ("Figura do mapa muscular:
  Masculina / Feminina") e persiste em `Settings` (novo campo `bodyMapSex?: 'male' | 'female'`,
  padrão `'male'`).
- [FN-012] Os paths SVG femininos precisam ser desenhados ou derivados dos atuais com
  ajustes proporcionais (ombros mais estreitos, quadril mais largo). Os paths de regiões
  musculares (`MUSCLE_REGIONS`) são os mesmos — só a silhueta muda.

### Non-Functional

- [NF-001] O painel de não-treinados (FN-001) não deve fazer queries extras ao banco;
  deve derivar a informação do mesmo `Map<MuscleGroup, number>` já calculado para o mapa.
- [NF-002] O preview da rotina (FN-006 a FN-009) é calculado em memória, sem persistência;
  não deve causar re-renders desnecessários no editor.
- [NF-003] A nova prop `sex` não quebra nenhum uso atual do `MuscleMap` (prop opcional
  com padrão).

## Out of Scope

- Mapa muscular por exercício individual (hover/click em um exercício mostra os músculos
  que ele trabalha) — pode ser adicionado ao `<ExerciseDemo>` em fase futura.
- Mapa de densidade vs. volume (contar sets em vez de Σ reps×kg) — fora desta fase.
- Silhuetas para faixas etárias ou outros parâmetros além de masculino/feminino.
- Destaque do último treino no mapa ("o que acabou de treinar") — pode ser adicionado
  como modo extra na tela pós-treino.

## Open Questions

- [OQ-1] **De-para `MuscleGroup` ↔ regiões do SVG:** o OQ-5 aberto no STATE.md do
  projeto. Os grupos `traps`, `lats`, `obliques`, `forearms` têm paths definidos em
  `muscle-map-paths.ts`? Verificar cobertura completa do enum antes de implementar
  FN-001 (grupos sem path não aparecem no mapa e não devem constar como "não treinados").
- [OQ-2] **Cálculo de "tempo sem treinar" (FN-002):** requer varrer todo o histórico para
  determinar a data mais recente de cada músculo. Para históricos grandes pode ser lento;
  considerar calcular via `computeVolumeByMuscle` com `days: null` e comparar com o
  período atual.
- [OQ-3] **Silhueta feminina:** desenhar do zero (alinhado com o estilo minimalista atual)
  ou usar paths derivados por transformação SVG? Requer decisão de design antes de
  implementar FN-010 a FN-012.
- [OQ-4] **Localização do preview da rotina no editor:** seção colapsável no fim do
  editor ou painel lateral (desktop)? No mobile a tela é estreita — recomendado colapsável.

## Dependencies

- `apps/web/src/components/MuscleMap.tsx` — adicionar prop `sex`, modo de não-treinados
  e suporte a highlights.
- `apps/web/src/lib/muscle-map-paths.ts` — adicionar paths de silhueta feminina;
  verificar cobertura de todos os `MuscleGroup` em `MUSCLE_REGIONS`.
- `apps/web/src/lib/stats.ts` — `computeVolumeByMuscle` sem mudanças para FN-005;
  adicionar `previewVolumeByMuscle` para FN-009.
- `packages/core/src/types.ts` — `Settings`: novo campo `bodyMapSex?: 'male' | 'female'`.
- Tela de stats (`apps/web/src/pages/Stats.tsx` ou equivalente) — adicionar seletor de
  janela temporal e painel de não-treinados.
- Editor de rotina — adicionar preview compacto do mapa muscular.

</details>

# P35-001 · Catálogo e demos

Atualizado em 13/11/2026.

## Estado

O app carrega 36 seeds e 1.324 registros de texto em JSON. A mídia local cobre 48 entradas por ID. O seletor de posições e os créditos aparecem no detalhe e na sessão. O catálogo tem filtro para exercícios com demonstração. SVG de exercícios personalizados é isolado em uma imagem. Atualização do catálogo mantém notas.

As seções do plano original abaixo descrevem a integração histórica via CDN. A implementação vigente está no [SDD](../../codebase/ARCHITECTURE.md) e nas [integrações](../../codebase/INTEGRATIONS.md).

## Aceite

Validar mídia offline e condições de licença do commit de origem. Cache de mídia e controle de desativação aguardam a decisão de distribuição.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

**Roadmap:** P35-001 | **Gap:** G1 | **Fase:** 3.5 — Paridade visual/UX

## Summary

O Forja hoje conta com 36 exercícios curados, todos com `demo: { kind: 'none' }` em
`packages/core/src/types.ts`. A interface visual de uma biblioteca grande com GIFs animados
é um dos pontos de diferença mais visíveis para o usuário em relação a apps concorrentes.
Esta feature incorpora o dataset público `hasaneyldrm/exercises-dataset` (1.324 exercícios,
imagens estáticas 180×180 + GIFs animados servidos via CDN jsDelivr) ao Forja, sem quebrar
o modelo local-first: a mídia é carregada sob demanda e cacheada pelo Service Worker,
enquanto os metadados dos exercícios (nome, grupo muscular, equipamento) ficam em JSON
bundlado na aplicação. O campo `DemoSource` em `Exercise` já prevê `kind: 'gif'` implícito
via extensão com novo `kind: 'cdn'`; o campo `attribution` já existe no tipo para
exibição obrigatória da licença Gym visual.

## Requirements

### Functional

- [FN-001] O dataset completo de metadados (`exercises-dataset/exercises.json`, ~1.324 itens)
  deve ser baixado em build-time e bundlado como `apps/web/src/data/exercises-dataset.json`,
  de-parado para o shape `Exercise` do `@forja/core` (mapeamento de campos descrito em
  Dependências).
- [FN-002] Adicionar `kind: 'cdn'` ao tipo `DemoSource` em `packages/core/src/types.ts`,
  com campo `cdnId: string` (o ID numérico/slug do dataset que forma a URL do jsDelivr).
- [FN-003] Um componente `<ExerciseDemo>` renderiza a mídia correta por `DemoSource.kind`:
  - `'none'` → ícone de placeholder (comportamento atual)
  - `'cdn'` → `<img>` com `src` apontando para `https://cdn.jsdelivr.net/npm/exercises-assets/exercises/<cdnId>/images/0.jpg`
    (thumb estático); ao expandir/tocar, troca para o GIF `exercises/<cdnId>/images/0.gif`.
  - `'asset'` / `'custom'` → comportamento atual (SVG flipbook ou SMIL).
- [FN-004] O GIF só é requisitado quando o usuário expande/toca a demo (lazy load); a versão
  estática (JPG) é usada como preview inicial para reduzir consumo de dados.
- [FN-005] O Service Worker (já existente na PWA) deve pré-cachear as imagens estáticas dos
  exercícios que o usuário visualizou; GIFs são cacheados no cache runtime (não no precache),
  com estratégia `StaleWhileRevalidate` e tamanho máximo configurável (padrão: 50 MB).
- [FN-006] A tela de detalhes de exercício na biblioteca exibe a atribuição:
  _"Mídia: Gym visual (CC BY-NC)"_ quando `Exercise.attribution` está preenchido. Este
  campo deve ser populado automaticamente para todos os exercícios do dataset durante o
  processo de importação (FN-001).
- [FN-007] Exercícios do dataset são marcados com `custom: false` e um campo `source: 'dataset'`
  (string literal, adicionado ao tipo `Exercise`) para diferenciá-los dos exercícios curados
  (`source: 'seed'`) e dos criados pelo usuário (`source: 'user'`).
- [FN-008] A busca na biblioteca continua funcionando sobre todo o conjunto (36 curados +
  dataset); o índice de busca no Dexie (`exercises: 'id, name, primaryMuscle, mode, custom'`)
  cobre `name` e `primaryMuscle`, portanto nenhuma migração de schema é necessária.
- [FN-009] O seed inicial (já existente) não é sobrescrito; na primeira abertura do app após
  a atualização, os exercícios do dataset são inseridos em batch via `db.exercises.bulkPut()`
  apenas se `source: 'dataset'` não existir para aquele `id`.
- [FN-010] O usuário pode desativar o carregamento de mídia CDN em Settings ("Carregar
  imagens de exercícios"), útil em conexões lentas; nesse caso `<ExerciseDemo>` sempre
  renderiza o placeholder.

### Non-Functional

- [NF-001] O JSON de metadados bundlado não deve ultrapassar 300 KB gzip; GIFs nunca são
  bundlados (sempre CDN).
- [NF-002] O cache runtime de GIFs respeita o limite configurado e não compromete o cache
  de assets da PWA.
- [NF-003] A inserção batch inicial (FN-009) não bloqueia a UI — deve rodar em segundo plano
  após o app estar visível (via `requestIdleCallback` ou deferred `useEffect`).
- [NF-004] A atribuição de licença (FN-006) deve ser legível sem necessidade de expansão do
  card de exercício.

## Out of Scope

- Download/bundling de GIFs localmente (apenas metadados + imagens estáticas offline).
- Suporte a múltiplas fontes de dataset em paralelo (apenas `hasaneyldrm/exercises-dataset`
  nesta fase).
- Edição dos dados do dataset pelo usuário (exercícios do dataset podem ser "personalizados"
  apenas sobrescrevendo com `source: 'user'` — tratado na feature de exercícios próprios,
  já existente).
- Instruções de exercício em múltiplos idiomas (G12/i18n — fase futura).

## Open Questions

- [OQ-1] **Dataset inteiro vs. subconjunto curado maior:** importar os 1.324 exercícios
  (mesmo que alguns tenham nomes em inglês não traduzidos) ou curar um subconjunto, e.g.,
  os 300 mais comuns? A decisão afeta tamanho do bundle e qualidade dos dados de `primaryMuscle`.
  _Proposta padrão: importar todos, marcar tradução PT-BR como work-in-progress via campo
  `nameEn?: string` (original) + `name` (PT traduzido ou igual ao original até i18n chegar)._
- [OQ-2] **De-para de `bodyPart`/`target` do dataset → `MuscleGroup` do core:** o dataset usa
  strings livres (e.g., `"upper legs"`, `"chest"`, `"lower arms"`). Precisa de uma tabela de
  mapeamento explícita. Quais `bodyPart` do dataset não têm correspondente direto no enum
  atual de `MuscleGroup`?
- [OQ-3] **CDN jsDelivr no ambiente offline:** quando o usuário está completamente offline e
  o cache do SW não tem o GIF, deve-se mostrar placeholder silenciosamente ou uma mensagem
  "imagem disponível online"?
- [OQ-4] **Atualização do dataset:** quando o `hasaneyldrm/exercises-dataset` for atualizado
  (npm bump), como propagar para os usuários existentes sem apagar customizações?

## Dependencies

- `packages/core/src/types.ts` — adicionar `kind: 'cdn'` ao union `DemoSource` e campo
  `source?: 'seed' | 'dataset' | 'user'` ao `Exercise`.
- `apps/web/src/db/db.ts` — a versão do Dexie precisa ser incrementada (v2) para indexar
  o novo campo `source` se decidirmos por query por fonte.
- `apps/web/src/lib/muscle-map-paths.ts` — a tabela de mapeamento `bodyPart → MuscleGroup`
  (OQ-2) pode viver aqui ou em `apps/web/src/data/dataset-muscle-map.ts`.
- Service Worker (`apps/web/vite.config.ts` ou `sw.ts`) — configurar cache runtime para GIFs CDN.
- Fase 5 (i18n) — tradução dos nomes de exercícios do dataset depende da infraestrutura de i18n.

</details>

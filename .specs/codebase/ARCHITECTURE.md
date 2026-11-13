# Forja · SDD / arquitetura

Atualizado em 13/11/2026. O [PRD](../project/PRD.md) define a jornada e os critérios de produto.

## Camadas

- `packages/core`: TypeScript puro, sem I/O. Agenda, histórico, 1RM, PRs, anilhas, progressão e esquema 5/3/1.
- `apps/web`: React, Vite, Router, Zustand, Dexie e service worker Workbox gerado no build. A PWA usa origem segura em distribuição.
- `db/repo.ts`: mutações do banco. Telas consultam Dexie com `useLiveQuery`. Dados do navegador ficam separados por perfil e origem.

## Persistência e invariantes

| Recurso | Contrato |
| --- | --- |
| IndexedDB `forja` v2 | Categorias, exercícios, rotinas, plano recorrente, exceções, treinos, peso, configurações e medidas. A migração v1→v2 é aditiva. |
| Sessão ativa | Zustand persist em `forja-session`. Mantém séries, alvo efetivo, exercício, timers e ID. Campos novos são opcionais para retomar rascunhos antigos. |
| Finalização | `saveFinishedWorkout` faz get/add em transação. Repetir o mesmo ID não duplica nem sobrescreve. O rascunho é limpo após sucesso. |
| Agenda | Exceção por data tem precedência sobre o plano recorrente. Apagar rotina remove seus agendamentos na mesma transação. Logs antigos permanecem. |
| Correção do histórico | Atualiza séries realizadas e invalida os marcadores de recorde salvos. O alvo permanece e as estatísticas são derivadas do histórico corrigido. |
| Backup | JSON v2 lê as nove tabelas em snapshot transacional. O v1 pode não ter medidas, que ficam intactas no destino. Valida versão e registros antes da escrita. |
| Plano | JSON v2 leva categorias, rotinas, semana e descrições mínimas dos exercícios referenciados. Sem mídia, notas pessoais da biblioteca, peso ou histórico. Aceita v1 quando o catálogo local resolve as referências. |
| Importações externas | FitNotes, Strong, Hevy e Apple Health (peso). Importação atômica, identificação de sessões por fonte e marcação de alvo desconhecido. A prévia não escreve dados. |

## Prescrição e sessão

1. Ao iniciar, aguardar catálogo, rotinas e histórico. Capturar a configuração e prescrição para toda a sessão.
2. O core usa data, horário e ID para ordenar. Quando a rotina é conhecida, políticas de carga usam o histórico dessa rotina. Logs importados podem sugerir referência sem contar como acerto de alvo.
3. Preencher e avaliar os valores do snapshot. Carga real abaixo da meta falha. Metas de tempo/cardio e séries 5/3/1 são registradas por suas dimensões.
4. 5/3/1 exige três séries válidas da semana esperada na mesma rotina, exercício e TM base. Quatro sessões válidas incrementam o TM. O incremento configurável tem padrão de 2,5 kg. Logs antigos sem metadados 5/3/1 permanecem no histórico e não avançam o ciclo.
5. Timers derivam o relógio de timestamps. Supersets pulam séries inexistentes em rodadas desiguais. Edição do realizado após o treino preserva a meta original.

## UX e distribuição

Acentos de tema claro e escuro têm valores próprios. Texto, estados e ícones têm significado independente da cor. Redução de movimento segue o sistema. WCAG 2.2 AA é referência de aceite. Os fluxos principais foram exercitados no Chromium em viewport móvel. Leitor de tela e validação em aparelhos físicos continuam pendentes.

Dados de treino ficam locais. O service worker pré-cacheia o app e o catálogo. A mídia CDN tem fallback e não possui cache dedicado. SVG de dados é renderizado como imagem, isolado do HTML. Não há serviço de push, sync nem runtime de Coach.

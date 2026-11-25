# Forja · Roadmap

Atualizado em 25/11/2026. O [PRD](PRD.md) define o aceite de produto e o [STATE](STATE.md) registra a retomada.

| Fase | Estado | Entrega |
| --- | --- | --- |
| F0 Fundação | Implementada | Monorepo TypeScript/pnpm, React/Vite, core Vitest, Dexie, seed e PWA estática. |
| F1 Treino | Implementada | Biblioteca, rotinas, plano semanal, exceção por data, treino avulso, registro guiado, peso e histórico editável. |
| F2 Progressão | Corrigida e testada no core | Snapshot efetivo, carga comparada ao alvo, referência inicial, isolamento de rotinas/políticas e ordem por data/horário. |
| F3 Insights | Implementada | Heatmap, streak, volume, cobertura muscular, 1RM e esforço. |
| F3.5 Execução | Implementada com pendências de aceite | Supersets, cardio, timers recuperáveis, PR, mapa e biblioteca. Ver specs de mídia, PR e timers. |
| F4 Backup | Implementada e testada com IndexedDB simulado | Backup v2 inclui medidas, compatibilidade v1, validação antes de restaurar e ações explícitas. |
| F4.5 Portabilidade | Implementada com pendências de fixture | CSVs, peso Apple Health, plano JSON v2, importação JSON fiel no Perfil/Assistente com agenda explícita, impressão e esforço agregado. Validar exports reais e PDF no browser. |
| F5 Conforto | Implementada | Quatro planos, temas, medidas, notas, anilhas, 5/3/1 e i18n PT/EN (P5-003 concluído em 17/11). P5-006/P5-007 aguardam evidência de demanda. |
| F6 Sync e Assistente | Piloto implementado | PWA com pareamento opcional, sync self-hosted, revisão semanal e montagem de treino com Ollama ou Codex CLI por login dedicado. [Pacote de implementação](../features/self-hosted-assistant/README.md). |

A revisão de Treino Guiado e Histórico pode ser implementada no app local. Ver [requisitos P11–P13](../features/self-hosted-assistant/PRD.md#requisitos-e-aceite) e [capturas de desktop e celular](../features/self-hosted-assistant/prototipo/README.md#capturas).

## Próximas entregas

1. Rodar o piloto com instalação, modo avião, atualização, dois treinos e restauração em perfil limpo. Validar teclado, leitor de tela, layout estreito e contraste contextual.
2. Expandir o conjunto de demonstrações com verificação por imagem e avaliar rotação de rotinas e inventários por academia após o piloto.

Licença definida em 17/11: **MIT** (`LICENSE` na raiz, `license` no `package.json`), compatível com o atlas MuscleMap (MIT). A cobertura de traduções de P5-003 nos fluxos secundários foi concluída (ver [spec i18n](../features/i18n/spec.md)).
4. Priorizar APK e notificações locais conforme o piloto. No piloto self-hosted, validar em dois aparelhos físicos sob HTTPS. A geração de revisão já foi confirmada no modelo local `qwen2.5:7b`. O [handoff](../features/self-hosted-assistant/IMPLEMENTACAO.md) detalha a sequência interna e as decisões pendentes.

P5-006 não assume agendamento confiável de notificações web com o app fechado. P5-007 pode avaliar notificações locais no Android. Passkeys e contas multiusuário ficam para avaliação posterior. A administração do piloto cobre o vínculo e a revogação de aparelhos pelo dono da instalação.

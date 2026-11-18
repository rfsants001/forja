# Forja · Sincronização entre aparelhos e Assistente de treino

Piloto implementado · 15/11/2026

O produto atual é uma PWA offline com IndexedDB/Dexie, backup JSON e progressão determinística. Este pacote descreve uma expansão opcional operada pelo usuário na própria máquina ou servidor. O piloto usa a mesma PWA no computador e no celular.

| Documento | Para que serve |
| --- | --- |
| [PRD](PRD.md) | Jornada, escopo, requisitos e critérios de aceite. |
| [TRD](TRD.md) | Requisitos técnicos, dados sincronizados, permissões, rede e provedores. |
| [SDD](SDD.md) | Desenho proposto para API, protocolo, estados, migração e recuperação. |
| [UX/UI](UX-UI.md) | Referências, direção de produto, telas, componentes, tokens, textos e acessibilidade. |
| [Implementação e testes](IMPLEMENTACAO.md) | Handoff para o Claude, decisões em aberto e plano de validação. |
| [Protótipo e capturas](prototipo/README.md) | Oito telas navegáveis, com demonstração, mapa muscular e Histórico por período. Capturas de Treino e Histórico em desktop e celular. |

## Ordem de leitura para implementar

1. Leia o PRD, o TRD, o SDD e o guia de UX/UI.
2. Compare o desenho com as mutações reais em `apps/web/src/db/repo.ts`, `store/session.ts`, `lib/backup.ts`, `lib/plan-share.ts` e `lib/starter-plans.ts`. Verifique o ponto de partida no Git, pois um checkout local pode estar atrás da versão publicada.
3. Registre seu parecer técnico e eventuais alternativas em um ADR curto, conforme o [handoff](IMPLEMENTACAO.md). Todo desenho concreto de stack, rota e tabela está aberto à revisão. Os critérios de aceite e o controle da instalação e dos dados pelo usuário orientam a decisão.

As etapas de instalação, pareamento, sync e revisão Ollama estão disponíveis na instalação local. O Codex CLI também é um provedor opt-in no Linux com o login ChatGPT do dono e um probe de terminal. O Assistente monta rotinas com ambos os provedores. [Setup do Codex](../../../README.md#montar-um-treino-com-codex-por-assinatura). Consulte o [README](../../../README.md#sincronizar-pc-e-celular) para subir a instalação e o [estado do projeto](../../project/STATE.md) para as verificações abertas.

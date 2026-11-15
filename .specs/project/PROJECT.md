# Forja

Forja é um diário de treino de força offline. A pessoa monta a rotina, registra o que fez e vê qual carga, número de repetições ou tempo tentar na próxima sessão, com a explicação da regra aplicada.

## Público e escopo

- Público inicial: Rafael e pessoas que treinam força ou calistenia em casa e montam a própria rotina.
- Plataforma atual: PWA mobile-first, sem conta. Treino e histórico ficam no IndexedDB da origem do app. A sessão ativa fica no armazenamento local. Arquivos JSON permitem backup e transferência manual.
- Idioma de lançamento: PT-BR. Inglês está em implementação no P5-003.
- O app pessoal de treino com plano fixo e currículo de boxe é um projeto irmão. O seed extraído dele permanece como referência. A Forja tem um plano opcional de força em casa, além dos modelos de academia.
- O app estático usa dados locais. A [expansão self-hosted](../features/self-hosted-assistant/README.md) detalha sincronização em servidor do usuário e Assistente de treino para o mesmo perfil em vários aparelhos. Android e notificações locais dependem do piloto. Passkeys e conta multiusuário ficam para avaliação posterior.

## Documentação

- [PRD](PRD.md) · [Roadmap](ROADMAP.md) · [Estado e retomada](STATE.md)
- [Arquitetura](../codebase/ARCHITECTURE.md) · [Stack](../codebase/STACK.md) · [Integrações](../codebase/INTEGRATIONS.md)
- A visão de produto na vault fica em `projetos/forja/`. O README apresenta o produto e os comandos públicos.

# Forja · Estado e retomada

Atualizado em 13/11/2026. Leia primeiro [PROJECT](PROJECT.md), [PRD](PRD.md) e [ROADMAP](ROADMAP.md).

## Entregue nesta revisão

Implementação em `e93c859`.

- Finalização salva no IndexedDB antes de limpar o rascunho. Retry pelo ID da sessão, feedback de erro e persistência de cronômetro de execução.
- Prescrição única por exercício na sessão. Carga inferior ao alvo falha, primeiro treino fornece referência, tempo e reps guardam o alvo efetivo. 5/3/1 aplica cada série e incrementa TM por ciclo.
- Backup v2 inclui medidas, lê v1, valida antes da transação e oferece cancelamento real. SVG de exercícios é carregado como imagem.
- Plano JSON v2 leva as definições mínimas dos exercícios. Importação preserva dias ocupados por padrão. CSV Strong separa sessões homônimas de horários distintos e há deduplicação por identidade de origem nas novas importações.
- Home com caminhos de primeiro treino, plano de força em casa, treino avulso, mudança de data e edição de séries no histórico.
- UX nos fluxos alterados com mensagens de estado e erro, foco visível, diálogos de plano com teclado, paletas contrastadas e redução de movimento.

## Próxima tarefa para o Claude

**P5-003 · i18n PT/EN, iniciado e incompleto.** O trabalho anterior à interrupção está no repositório. Existe `apps/web/src/lib/i18n.ts`, `Settings.lang` e adoção parcial em componentes. O import sem uso em `Media.tsx` foi resolvido ao traduzir o controle de demo. Confira as alterações de Home, Treinos, Perfil, Histórico e treino guiado antes de mapear as mensagens. Faltam o seletor no Perfil, uso reativo nas páginas, idioma do HTML, formatação, mensagens novas e justificativas de progressão. A spec de i18n lista o teste de aceitação.

## Verificação e limites

- `pnpm test` (136 testes), `pnpm typecheck` e `pnpm build` passaram.
- Testes adicionais com Dexie e IndexedDB simulado cobriram backup, portabilidade, planos iniciais, deduplicação e retry de sessão. Contraste dos oito acentos medido sobre as superfícies principais.
- Chromium, viewport móvel: primeiro acesso, modal por teclado, plano de casa, exceção por data, treino, cronômetro após reload, correção do histórico, exportação/cancelamento/mescla de backup e segundo treino offline após ativação do service worker, com a carga corrigida no histórico.
- Falta teste em aparelho físico, instalação e atualização da PWA, timers com tela bloqueada, leitor de tela e PDF.
- A mídia de terceiros continua dependente do CDN. Confirmar licença antes de distribuir com demos.
- Specs e notas já existentes da Forja integram a documentação versionada do projeto. A vault permanece como índice e visão de produto.

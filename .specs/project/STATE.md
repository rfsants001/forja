# Forja · Estado e retomada

Atualizado em 15/11/2026. Leia primeiro [PROJECT](PROJECT.md), [PRD](PRD.md) e [ROADMAP](ROADMAP.md).

## Publicado na main

- `e93c859` — correções de treino, dados e UX listadas abaixo.
- `7f99a38` — PRD, SDD, roadmap, specs e handoff em `CLAUDE.md`.
- `27310e1` — [README](../../README.md) com quatro capturas da interface usando dados fictícios, guia do primeiro treino, clone, instalação, PWA e restauração. O workspace usa `allowBuilds` para autorizar o postinstall do esbuild no pnpm 12.

## Correções entregues

- Finalização salva no IndexedDB antes de limpar o rascunho. Retry pelo ID da sessão, feedback de erro e persistência de cronômetro de execução.
- Prescrição única por exercício na sessão. Carga inferior ao alvo falha, primeiro treino fornece referência, tempo e reps guardam o alvo efetivo. 5/3/1 aplica cada série e incrementa TM por ciclo.
- Backup v2 inclui medidas, lê v1, valida antes da transação e oferece cancelamento real. SVG de exercícios é carregado como imagem.
- Plano JSON v2 leva as definições mínimas dos exercícios. Importação preserva dias ocupados por padrão. CSV Strong separa sessões homônimas de horários distintos e há deduplicação por identidade de origem nas novas importações.
- Home com caminhos de primeiro treino, plano de força em casa, treino avulso, mudança de data e edição de séries no histórico.
- UX nos fluxos alterados com mensagens de estado e erro, foco visível, diálogos de plano com teclado, paletas contrastadas e redução de movimento.

## Caderno de treino · revisão local

- A Home reúne treino do dia, agenda com link por data, registros recentes e métricas. O desktop usa navegação lateral e painéis em colunas. No celular, a navegação inferior inclui a biblioteca.
- A identidade usa um monograma F geométrico e a paleta Âmbar com grafite, laranja e off-white. Inter é a fonte dos títulos e formulários. Barlow Condensed aparece em métricas. A tela Hoje usa o gráfico de carga, a prévia da rotina e a agenda. As fontes, os ícones e as demonstrações dos exercícios fazem parte do build offline.
- Biblioteca com atlas MuscleMap (MIT) nas duas figuras e suas vistas de frente/costas, 48 entradas com demonstração local, controles de posição, créditos, filtros por músculos auxiliares e inventário próprio. Progresso oferece séries, volume de carga e último treino.
- Aquecimentos de repetições são opcionais e persistem em `warmupSets` no rascunho e no log. O histórico permite corrigir as séries. Hevy importa o tipo de série e o backup v2 conserva aquecimento e inventário. Progressão, volume e recordes consultam séries de trabalho.
- Histórico com barra de busca e rotina acima da lista, contagem e ação de limpar. Formulários têm rótulos associados, aparência compartilhada, ações compactas e feedback. O Perfil grava descanso e meta por envio explícito. O tema explícito se sobrepõe à preferência do SO, e o modo Sistema acompanha a preferência.
- As imagens abertas têm fundo, proporção, escala e tratamento monocromático consistentes. A licença da mídia Gym visual usada pelo openGym exige autorização própria para a Forja.
- A [integração](../codebase/INTEGRATIONS.md) registra o atlas, as licenças e os limites de reuso do openGym.

## Exclusão de planos e rotinas

- Em Treinos, a lixeira remove uma rotina. **Excluir plano** remove em conjunto as rotinas de uma categoria criada por um plano pronto. A confirmação mostra as rotinas afetadas.
- A transação limpa a semana e as exceções ligadas às rotinas removidas. O histórico mantém a sessão, o nome e a nota, inclusive para filtragem após a exclusão. A sessão ativa continua usando o snapshot em andamento.
- O README em PT-BR apresenta capturas de desktop e celular e instruções de instalação e backup. O perfil do GitHub aponta para as telas e o guia de execução.

## PT/EN concluído (17/11/2026)

**P5-003 · PT/EN.** O Perfil tem seletor persistente e o HTML acompanha o idioma. Navegação, controles principais e justificativas de progressão usam traduções. O teste no navegador passou por PT → EN → reload → PT.

A revisão de fluxos secundários foi fechada em duas passadas (a segunda após o review do Codex, que achou vazamentos residuais em EN): dias da semana (`wd.short`/`wd.full`), filtros de equipamento da Biblioteca (`equip.*` como exibição, `label` como identidade estável), métricas da edição de histórico (`metric.*`), contadores de exercícios, feedbacks de importação/exportação/exclusão/criação de rotinas, títulos da Home, `aria-label`s de Treinos/Treino Guiado/Progresso/Perfil, rótulos de medida, filtro de período, validações do editor e unidade do mapa muscular. O `db/repo.ts` passou a lançar `UiError` com chave (igual a `backup.ts`/`importers.ts`/`plan-share.ts`), removendo mensagens de erro em PT cru. **A camada de UI está completa** (resta em PT só rota e comentário). Dicionário com paridade PT/EN. `pnpm typecheck`, `pnpm test` (138 core + 2 server) e `pnpm build` passaram.

**Planos prontos em PT/EN.** Descrições, nomes e notas usam o idioma ativo ao aplicar. Reaplicar em outro idioma reaproveita rotinas já existentes e preserva notas salvas. Falhas do catálogo e validação de nome vazio exibem feedback traduzido. Ver [spec i18n](../features/i18n/spec.md).

## Licença

Definida em 17/11: **MIT**. `LICENSE` na raiz (Copyright 2026 Rafael Santos) e `license: "MIT"` no `package.json`. Compatível com o atlas MuscleMap (MIT).

## Para o Codex validar (checks de mundo real, não-código)

- Instalação e atualização da PWA em aparelho físico; timers com tela bloqueada.
- Leitor de tela nas telas principais e PDF do compartilhamento de plano.
- Sincronização self-hosted entre dois aparelhos físicos sob HTTPS.
- Smoke de troca de idioma PT ⇄ EN percorrendo Treinos (dias da semana), Biblioteca (filtros de equipamento), edição de histórico e mensagens de erro de rotina/plano.

## Expansão self-hosted · piloto local

Servidor com SQLite, pareamento, sincronização e revisão Ollama estão disponíveis no piloto self-hosted. O teste fez um treino offline em um navegador e recebeu uma única sessão no outro após reconectar. A aplicação e a reversão da troca passaram com Ollama simulado. A geração com dados fictícios retornou uma sugestão válida no Ollama local com `qwen2.5:7b`. Codex CLI está disponível como provedor opt-in em Linux. O Assistente monta uma rotina a partir de exercícios da biblioteca e só grava após a confirmação. O probe de terminal continua disponível para verificar o login dedicado. Ver [Coach AI Provider](../features/coach-ai-provider/design.md). O [handoff](../features/self-hosted-assistant/IMPLEMENTACAO.md#implementação-do-piloto) registra os limites de validação e o [README](../../README.md#sincronizar-pc-e-celular) descreve a instalação.

## Verificação e limites

- Em clone limpo, `pnpm install --frozen-lockfile`, `pnpm test` (136 testes), `pnpm typecheck` e `pnpm build` passaram com Node.js 24.16.0 e pnpm 12.16.1.
- Testes adicionais com Dexie e IndexedDB simulado cobriram backup, portabilidade, planos iniciais, deduplicação e retry de sessão. Contraste dos oito acentos medido sobre as superfícies principais.
- Chromium, viewport móvel: primeiro acesso, modal por teclado, plano de casa, exceção por data, treino, cronômetro após reload, correção do histórico, exportação/cancelamento/mescla de backup e segundo treino offline após ativação do service worker, com a carga corrigida no histórico.
- Falta teste em aparelho físico, instalação e atualização da PWA, timers com tela bloqueada, leitor de tela e PDF.
- Na revisão local, 138 testes do core, typecheck e build passaram. O Chromium validou o layout de 320 a 1440 px, envio por teclado, filtros do Histórico, preferências após recarga e tema explícito. O axe não apontou violações WCAG A/AA nas três telas verificadas: Histórico escuro, novo exercício escuro e Perfil claro. A PWA abriu em modo offline com foto, fonte, atlas e demonstrações e iniciou o plano de casa.
- Specs e notas já existentes da Forja integram a documentação versionada do projeto. A vault permanece como índice e visão de produto.

## Jornada do Assistente

`npm run dev` e `npm start` abrem app e API juntos. Em Perfil → Conexões de IA, a Forja detecta Ollama, inicia o login do Codex e persiste a seleção. Pareamento é o fluxo de sync. O inventário começa vazio e aceita nomes manuais. O Assistente separa Montar treino e Revisão semanal. O tempo informado é a duração total. O modelo propõe o descanso.

## Treino anterior no Assistente

O Coach usa referências do Histórico, CSV de Hevy/Strong/FitNotes, JSON da Forja e planos externos OpenGym ou portáteis em CSV/JSON. A prévia é local e a IA recebe o recorte autorizado, com séries, repetições, segundos ou carga disponíveis. Em Perfil → Meus equipamentos, a pessoa cadastra o inventário usado para montar treinos em casa. O filtro distingue tipos de barra e requisitos de apoio, como banco e rack. Na academia, a programação oferece substituições por família. Ver [SDD do Coach](../features/coach-ai-provider/design.md#contexto-e-programação-do-treino).

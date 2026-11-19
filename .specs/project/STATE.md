# Forja · Estado e retomada

Atualizado em 19/11/2026. Leia primeiro [PROJECT](PROJECT.md), [PRD](PRD.md) e [ROADMAP](ROADMAP.md).

## Retomada — 19/11/2026

- Abertura durante inicialização local e introdução em quatro slides, com Pular, Voltar, navegação por etapa e checkbox persistente **Não mostrar a introdução novamente**. PT/EN, tema e movimento reduzido; preserva URL, sessão ativa e pareamento. [Aceite/SDD](../features/boas-vindas/spec.md).
- Dias do Coach foram refeitos: controle comum de seleção com toque/teclado em Por split e Criar com IA; primeiro dias, depois cards apenas dos dias marcados. Upload mantém dias/tipos; Criar treino não herda automaticamente a primeira rotina do JSON.
- Novo nível global: Iniciante 4, Intermediário 6, Avançado 8 exercícios de musculação por sessão. Presets de produto aplicados no servidor para qualquer provedor, incluindo A/B; cardio dedicado separado. Tempo é por sessão em todas as chamadas diárias. Falta de candidatos e duração incompatível têm erros traduzidos. Importar sem alterações preserva o plano. [PRD/TRD/SDD](../features/coach-weekly-split/training-level.md).
- Gates: 147 testes core + 45 servidor, typecheck e build de produção. Verificação no navegador cobre a abertura, persistência, PT/EN, tema claro e movimento reduzido, upload e dias, geração por sessão e layout de 320 a 1366 px. Os quatro splits e seis dias personalizados Puxar/Empurrar/Pernas A/B foram gerados e salvos; no avançado, cada sessão teve oito exercícios e recebeu 75 minutos separadamente. Provedores simulados; os testes físicos abaixo continuam pendentes.

## Correção do catálogo de casa — 19/11/2026

A validação anterior dos seis dias avançados tinha usado academia e não cobria o catálogo doméstico. O erro de falta de opções podia vir da cobertura limitada de casa, do limite de candidatos por músculo e da identidade que fundia variantes de uma família. A identidade distingue pegada, posição/apoio, Arnold, tipos de afundo e outras variações reconhecidas; mudar carga ou pausa não cria exercício distinto. O repertório explícito de casa ganhou remadas, roscas, puxadas, tríceps e pernas com os equipamentos cadastrados, sem pressupor banco, rack ou sofá. Posterior de ombro pode entrar em Puxar; desenvolvimento continua excluído desse papel.

Verificado no navegador em Em casa, nível avançado, 75 minutos por sessão: seis dias Puxar/Empurrar/Pernas A/B, oito exercícios cada, com e sem JSON externo, salvamento e reabertura. Repetido com um único halter, respeitando a exclusão dos movimentos que pedem um par. Provedor simulado.

A seleção pura agora fica em `lib/coach-catalog.ts`. O teste permanente `apps/server/test/home-coach.test.mjs` executa os mesmos filtros e seleção usados pela UI, com seed e inventário doméstico, e chama o coach comum com provedores simulados. Cobre 8 exercícios por sessão em Puxar/Empurrar/Pernas A/B, variação, aliases, quantidade de halteres e ausência de estruturas. As extensões `.ts` explícitas nesses helpers permitem o teste nativo com Node 24, sem adicionar dependências.

## Inventário montável e exercícios de trabalho — 19/11/2026

O cadastro real usava `barra de haltere (haltere customizado com anilhas)` e `suporte para flexão`. Esses nomes não eram aliases reconhecidos, então as opções com halteres e apoios ficavam fora dos candidatos. A normalização aceita os nomes, retira apenas as notas entre parênteses para identificar o tipo e preserva o nome original. Barras de haltere dependem de anilhas cadastradas para habilitar movimentos com halteres. A lista de equipamentos informa o tipo reconhecido pelo Assistente.

O filtro de exercícios de trabalho é compartilhado entre UI e API em `packages/core/src/coach-exercises.ts`. Preparatórios como remada deitada sem carga, elbow lift e controle escapular não completam a quota; no avançado, regressões simples também não. Barra fixa e pull-up sem assistência são deduplicados mesmo quando o dataset usa peso corporal ou barra fixa como resistência. Puxar inclui remada e puxada vertical quando ambas existem, alternando a prioridade A/B. O resumo é composto a partir da sequência final para não contradizer ajustes do plano.

A regressão usa o cadastro exato: uma barra fixa, uma W, dois handles montáveis, quatro anilhas de cada peso (3, 4 e 5 kg) e duas de 10 kg, e dois apoios. No navegador, esse cadastro gerou e salvou seis sessões de oito exercícios de trabalho, com e sem JSON externo, usando provedor simulado. Não se deve voltar a validar apenas com o nome genérico Halteres. A cópia fiel de arquivos e os registros salvos não passam pelo filtro de geração.

## Composição e comparação da referência — 19/11/2026

As famílias e identidades agora são compartilhadas em `packages/core/src/coach-movements.ts`. Elevação lateral, panturrilha, punhos e core têm identificação canônica; aliases PT/EN deixam de preencher a meta como exercícios distintos. Rear delt é de Puxar/Upper/Full, não Empurrar. A API normaliza metadados e aplica a regra mesmo com candidatos de clientes antigos.

No fluxo com nível, a montagem usa o limite padrão de dois exercícios por família (até três quando a referência pede três), até duas panturrilhas, um de antebraço e dois de core, priorizando os padrões do papel. Puxar/Empurrar com seis ou oito movimentos reservam duas variações de rosca/tríceps quando há opções distintas. As regras são heurísticas de produto, não prescrições universais da literatura. O core de uma referência de pernas é preservado até duas posições quando compatível; sem referência, o B de pernas inclui um acessório de core. A quantidade escolhida continua obrigatória; composição inviável tem erro próprio, sem preenchimento por aliases. Prescrições válidas de movimentos da mesma família deixam de ser descartadas e resetadas a 2×6.

A proposta mostra exercícios/séries da referência e do resultado e informa exemplos sem cobertura na seleção elegível. Essa comparação vai para a nota da rotina salva. Importação fiel e histórico não são reprogramados. A estimativa inclui ambos os lados em nomes explicitamente unilaterais e descanso entre exercícios; continua aproximada e não presume tempos de montagem de anilhas.

No navegador com o inventário e JSON informados, seis rotinas de oito movimentos foram geradas, salvas e reabertas. A prévia mostrou as contagens e a nota conservou a comparação; sábado manteve dois movimentos de core e um de panturrilha. Sem arquivo, a geração também passou. Provedor simulado; gates: 147 core + 45 servidor, typecheck e build.

Regressão `apps/server/test/composition.test.mjs` usa o padrão problemático relatado (traduções duplicadas, quatro panturrilhas, dois punhos), o inventário montável real e três provedores simulados. Confere distribuição, core, preservação de séries, referência e tempo. Não basta contar IDs diferentes.

## Histórico publicado na main

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

O inventário registra quantidades por peso unitário e inclui aparelhos de cardio. Emagrecimento usa o último peso e a meta do Perfil e salva musculação e cardio moderado em uma rotina compatível com o treino guiado.

Em 18 de novembro de 2026, o importador passou a separar cópia local do programa e geração com referência, com atribuição explícita de rotina e tipo por dia na geração. A agenda é gravada em transação. A camada de IA tem execução nativa do Codex no Windows e macOS, Bubblewrap no Linux e uma opção de API compatível com OpenAI configurada pelo host. O [plano do app desktop](../features/desktop-pwa/spec.md) registra o servidor embutido e a instalação móvel via QR em HTTPS.

A montagem semanal passou a comparar as variantes A/B independentemente do provedor. O contexto inclui as sessões anteriores do mesmo papel. O app mostra a limitação quando a lista de equipamentos exige preservar a seleção e variar a prescrição. A agenda salva permanece estável para acompanhar os treinos. A progressão por ciclos entre semanas segue no planejamento.

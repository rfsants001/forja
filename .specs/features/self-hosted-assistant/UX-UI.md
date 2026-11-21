# UX/UI · Dispositivos e Assistente de treino

## Revisão implementada — 20/11/2026

A aplicação atual adota controles de 4 px, cartões de 6 px e diálogos de 8 px; títulos menores e listas com divisórias substituem parte dos cartões aninhados. Os protótipos antigos abaixo registram a direção anterior; para a entrega corrente, usar as [capturas do README](../../../README.md#telas) e o [contrato da importação JSON](../dados-portabilidade/importacao-json.md). Rádios têm superfície de botão com estado checked/foco/disabled nativo e linha de seleção. O Perfil oferece âncoras; importar programa JSON e trazer histórico concluído são ações distintas. No modo local, não mostrar a configuração da IA como requisito.

Referências consultadas nesta revisão: [Primer](https://primer.style/product/components/segmented-control/), [Linear](https://linear.app/changelog/2024-12-18-personalized-sidebar) e [Pajamas](https://design.gitlab.com/components/radio-button/). Aplicar princípios de hierarquia e seleção única, mantendo a identidade da Forja.

## Direção · Caderno de treino de força

A Forja combina a agenda semanal com a evolução de carga em um exercício. A linha mostra o que mudou entre sessões e o treino do dia permite agir sobre isso. Sete células mostram dias, treinos concluídos e a data selecionada. Em **Hoje**, a faixa abre o planejamento. Em **Revisão semanal**, sustenta a leitura do que foi feito. As séries e cargas têm ritmo de tabela de treino, com números alinhados e unidades sempre visíveis. Em **Dispositivos**, o ambiente é o mesmo e a composição vira uma tela de configuração com lista e painel de conexão.

| Referência | Aplicação na Forja |
| --- | --- |
| **Hevy** coloca valores anteriores, carga, reps e marcação de série próximos durante o treino. | No celular, manter **Anterior**, **kg**, **Reps** e a conclusão na mesma sequência de leitura, com o descanso acessível durante o registro. [Registro de treino no Hevy](https://www.hevyapp.com/features/track-workouts/) |
| **TrainerRoad** relaciona planejamento e trabalho concluído no calendário. | Usar a faixa de sete dias em Hoje e na revisão. Identificar o que foi agendado, concluído ou está em foco com texto, forma e estado acessível. [Calendário do TrainerRoad](https://www.trainerroad.com/blog/how-to-plan-train-and-analyze-with-calendar/) |
| **Linear** usa navegação discreta e controles mais compactos para destacar dados. | Manter um cabeçalho curto com os filtros junto do conteúdo e dividir os ajustes em seções. [Interface do Linear](https://linear.app/now/behind-the-latest-design-refresh) |
| **Carbon (IBM)** documenta densidade de campos e séries temporais. | Usar tamanhos por contexto, rótulos persistentes e uma linha com escala explícita e pontos reais. [Campos](https://www.carbondesignsystem.com/building-blocks/core/components/text-input/guidelines) · [Gráficos de linha](https://charts.carbondesignsystem.com/line) |
| **TrainingPeaks**, conceito independente no Behance, explora planejamento e acompanhamento no celular. | Usar como referência para a hierarquia móvel. Manter o controle de período próximo da métrica e empilhar blocos por utilidade. [Case no Behance](https://www.behance.net/gallery/99805437/TrainingPeaks-Mobile-Application-Redesign-Concept) |
| **Signal** reúne vínculo por QR e gestão de aparelhos em configurações. | Manter pareamento, status e revogação em Perfil, com digitação manual e aprovação próprias da Forja. [Dispositivos vinculados do Signal](https://support.signal.org/hc/en-us/articles/360007320551-Linked-Devices) |

- **Desktop.** Em [Hoje](prototipo/index.html#hoje), evolução de carga e treino do dia ficam lado a lado, com o último treino na coluna auxiliar e a semana abaixo. O CTA **Iniciar treino** fica no painel do treino do dia, junto da prévia de exercícios. Use bordas discretas e ações alinhadas ao campo ou à seção.
- **Celular.** Em [Hoje](prototipo/index.html#hoje), preservar **Iniciar treino** antes da primeira rolagem e empilhar gráfico, treino e semana. Em [Treino ativo](prototipo/index.html#treino), priorizar séries editáveis, carga anterior e descanso. O gráfico fica em Hoje e Progresso. A execução mantém espaço para os campos e o teclado.
- **Conteúdo visual.** Usar gráficos e informações de treino no lugar das imagens decorativas do dashboard. Usar as demonstrações já creditadas onde a mídia explica o movimento. O pareamento usa um QR gerado pela instalação e ícones funcionais.
- **Adoção.** O protótipo inclui Hoje, Progresso, Editor de rotina, Histórico, Treino ativo, Perfil, Dispositivos e Assistente. O Claude pode propor adotar os componentes compartilhados por etapa. Preservar sessão ativa, agenda, biblioteca, Histórico e regras de progressão.

## Navegação e layout

- **Perfil → Dispositivos** abre a gestão da instalação e apresenta **Parear aparelho**. Sugestão de rota `/perfil/dispositivos`. O fluxo de convite abre em painel ou diálogo no desktop e ocupa a largura útil no celular.
- **Conectar à Forja** atende ao primeiro acesso. Sugestão de rota `/conectar`. Ler o QR com a câmera do sistema abre a origem do servidor. O acesso sem câmera usa o endereço digitado no navegador e o código no formulário da instalação. A câmera dentro da PWA, se oferecida, é acionada por **Ler QR code**.
- **Perfil → Assistente de treino** abre configuração do provedor e revisão semanal. Sugestão de rota `/perfil/assistente`. No desktop, usar duas colunas quando houver espaço, com a revisão como conteúdo principal e o provedor em painel auxiliar. No celular, usar uma coluna na ordem período, provedor e destino, dados a usar, ação, resultado.
- Reutilizar o monograma F e a navegação de `apps/web/src/components/AppNavigation.tsx`, incluindo **Exercícios**. Preservar o contexto de Perfil nas rotas filhas. O rótulo do rodapé distingue dados locais de sync ativo quando o recurso estiver disponível. Empilhar as colunas em largura estreita e aplicar o breakpoint da navegação existente. Mostrar no máximo uma ação primária por etapa. Evitar barra de ação fixa onde possa cobrir campo, teclado ou navegação inferior.

## Continuidade no produto

- **Histórico.** Exibir período, rotina e busca acima da lista. Mostrar o intervalo selecionado, agrupar sessões por dia e oferecer uma ação clara para limpar filtros quando a lista estiver vazia.
- **Treinos e Exercícios.** Aplicar a mesma densidade de listas e os mesmos campos e ações. Preservar categoria, equipamento, agrupamento por músculos e acesso às demonstrações.
- **Perfil.** Reaproveitar os padrões de seção e formulário em configurações, com entradas distintas para Dispositivos e Assistente. A tela de conexão manual reutiliza o mesmo tratamento dos campos.

## Telas e textos

| Tela | Hierarquia e ação principal | Estados a prever |
| --- | --- | --- |
| [Dispositivos](prototipo/index.html#dispositivos) | **Dispositivos** → status e lista → **Parear aparelho** → QR, endereço, código, expiração e pedido recebido → **Aprovar aparelho**. Mostrar nome e origem da solicitação antes de aprovar. | Local, convite aberto, aguardando aprovação, expirado, conectado, conflito e revogado. **Copiar endereço**, **Copiar código**, **Gerar novo código** e **Cancelar convite** têm feedback próprio. |
| [Conectar à Forja](prototipo/index.html#dispositivos) | Mostrar a origem que receberá os dados. Campos **Código de pareamento** e **Nome do aparelho**. **Solicitar conexão** leva à espera da aprovação. A alternativa manual exibe o endereço para digitar, depois o código. | Câmera indisponível, código inválido ou expirado, sem conexão, aguardando aprovação e conexão aprovada. **Continuar só neste aparelho** nas jornadas sem sessão. |
| [Assistente de treino](prototipo/index.html#assistente) | **Assistente de treino** → intervalo de sete dias → **Dados usados na revisão** → **Gerar revisão**. Painel auxiliar com provedor, modelo e **Testar conexão**. | Sem histórico, sem provedor, teste em andamento, Ollama disponível, erro de modelo, servidor indisponível, revisão em andamento e geração concluída. Exibir Codex quando selecionado na instalação e orientar o login dedicado caso esteja ausente. A montagem do treino mostra objetivo, foco, tempo, lista de dados, destino e a prévia com ação separada para salvar. |
| [Revisão semanal](prototipo/index.html#assistente) | **Revisão semanal** → período e origem dos dados → resumo → proposta com exercício atual e sugerido → **Revisar alteração** → **Aplicar alteração**. Mostrar **Desfazer** enquanto a versão permitir. | Geração cancelada, proposta inválida ou desatualizada, aplicação confirmada, falha de persistência, desfazer disponível ou bloqueado por edição posterior. |

Para provedor externo, mostrar **Envio para {provedor}** com o destino e a lista exata dos dados que serão enviados. A ação passa a ser **Enviar e gerar revisão**. Permitir voltar à prévia antes de enviar. Mostrar aviso de revisão parcial quando houver pendências neste aparelho. A lista de treinos serve como contexto local. O payload externo usa os agregados descritos no SDD.

### Mensagens e ações de recuperação

| Situação | Mensagem | Ação |
| --- | --- | --- |
| Offline | Seus treinos continuam salvos neste aparelho. Sincronizaremos quando a Forja estiver acessível. | **Tentar sincronizar**, quando houver conexão. |
| Aguardando aprovação | Confirme a solicitação no computador para concluir a conexão. | **Cancelar solicitação**. |
| Convite vencido | Este código venceu. Gere outro no computador. | **Digitar novo código** no celular. |
| Acesso revogado | Este aparelho foi desconectado. Seus dados locais continuam disponíveis. | **Parear novamente** ou **Exportar backup**. |
| Importação inicial | Confira os dados deste aparelho e da instalação antes de sincronizar. | **Revisar dados** e **Confirmar importação**. Mostrar contagens, colisões e link para backup. |
| Conflito | Esta rotina foi alterada em dois aparelhos. Confira as versões e escolha qual manter. | Comparar campos e oferecer **Manter minha versão** ou **Usar versão sincronizada**. Se houve exclusão remota, oferecer **Salvar como nova rotina**. |
| Ollama indisponível | A Forja não conseguiu acessar o Ollama nesta instalação. | **Testar conexão** e manter os indicadores visíveis. |
| Proposta desatualizada | A rotina mudou depois que esta revisão foi gerada. | **Gerar nova revisão**. |

Exibir **Última sincronização** com data/hora no idioma da interface ou **Nenhuma sincronização concluída**. Pendências usam pluralização e uma descrição textual. O status apresenta o último sucesso confirmado pelo servidor e acompanha operações em fila. Ação **Desconectar aparelho** pede confirmação e identifica qual aparelho perderá acesso. UI e mensagens entram na camada PT/EN existente, incluindo labels e erros. A tabela acima é o roteiro PT-BR.

## Sistema visual

Mapear a paleta preta e laranja aprovada para os tokens de `apps/web/src/styles/theme.css`. Reaproveitar `forms.css`, os raios e as preferências de tema. Ajustar os tamanhos dos controles pelos contextos abaixo. O protótipo demonstra os temas claro e escuro. Acentos personalizados precisam passar pelos mesmos critérios de contraste. Checar foco, disabled, hover, preenchimento automático e os controles nativos nos dois temas.

| Função | Token | Escuro | Claro |
| --- | --- | --- | --- |
| Fundo grafite / papel | `--bg` | `#181816` | `#F3EFE7` |
| Painel | `--surface` | `#22211E` | `#FFFCF5` |
| Painel de apoio | `--surface-2` | `#2B2924` | `#EBE5DA` |
| Texto | `--text` | `#F5F0E6` | `#22201C` |
| Texto secundário | `--muted` | `#BBB3A6` | `#5F5648` |
| Ação primária âmbar | `--accent` / `--on-accent` | `#FFC777` / `#221507` | `#8A4A0A` / `#FFFFFF` |
| Sucesso | `--ok` | `#8ED6AB` | `#246B45` |
| Alerta | `--warn` | `#FFD28A` | `#7A4700` |
| Erro | `--danger` | `#FF9687` | `#A53027` |
| Ação destrutiva preenchida | `--danger-fill` | `#AD2E24` | `#AD2E24` |
| Foco em superfícies | `--focus` | `#FFC777` | `#8A4A0A` |
| Borda de campo | `--control-border` | `#82796B` | `#827568` |

Os pares propostos de texto secundário sobre painel de apoio têm 7,00:1 no escuro e 5,75:1 no claro. As bordas de campo sobre o mesmo painel têm 3,39:1 e 3,57:1. A ação preenchida usa 11,62:1 e 6,85:1. Ao focalizar um botão primário, use o contorno com separação visível da superfície e do preenchimento. Verifique os valores finais na UI renderizada.

- **Tipografia.** Inter para texto e controles. Barlow Condensed fica reservada às métricas onde já é usada. Código tem numerais tabulares e pode ser agrupado visualmente em `000 000`, preservando os zeros iniciais.
- **Superfícies.** Reusar os raios de 4, 6 e 8 px e o espaçamento do shell. Usar 4, 8, 12 e 16 px entre elementos relacionados, com separação maior entre grupos. Usar divisórias simples nas listas e reservar bordas completas para campos, comparação ou painéis que precisam agrupar controles. Código e QR são os pontos de atenção do pareamento. O QR usa preto sobre branco e margem de leitura.
- **Botões.** Usar 34 px como padrão no desktop, com 32 px para ações densas em tabelas se houver espaço de foco. No celular, oferecer alvo de 44 px para ações frequentes, com rótulo curto e largura pelo conteúdo. Uma ação primária por seção. Carregamento conserva largura e texto, por exemplo **Gerando revisão…**.
- **Formulários.** Usar campos de 34 px no desktop e área de toque de 44 px no celular. Reduzir margens e larguras antes de mexer no alvo de toque. Agrupar campos relacionados em linha no desktop, limitar a largura dos formulários e empilhar os campos longos no celular. Rótulos a 4 px do campo e 8–12 px entre campos relacionados. Em inputs de texto no celular, usar corpo de 16 px. Preservar seletor e teclado nativos com `color-scheme` do tema ativo. Para o código, usar entrada textual com `inputmode="numeric"`, aceitar colagem e preservar zeros. Erros têm texto, foco e vínculo por `aria-invalid` e `aria-describedby`.
- **Listas e status.** Exibir nome, data e ações de cada aparelho. Ícone e texto com cor semântica. Mostrar erros específicos junto ao elemento afetado e erro de conexão em status persistente. Ao concluir, avisar sem capturar foco.
- **Faixa semanal.** Usa texto curto para dia e data e traços discretos por atividade. Em Hoje, dias interativos seguem teclado e anunciam o dia, o estado e a data selecionada. Na revisão, representar a faixa como dados estáticos. Manter uma versão legível a 320 px e informar as contagens em texto.
- **Comparação de exercício.** Alinhar rótulos **Atual** e **Sugerido**, nome legível e justificativa. Desktop pode usar duas colunas. Celular usa linhas verticais com quebra de nomes longos. Indicar se a nova configuração exige definir carga inicial.

## Gráficos e informações

| Tela | Composição e leitura |
| --- | --- |
| Hoje e Progresso | Linha de maior carga por sessão, com exercício e período de 4 ou 8 semanas. Mostrar última carga e a diferença em kg entre os registros inicial e final do período. Em Progresso, exibir também registros recentes. |
| Hoje | Faixa semanal com marcações discretas e texto para agenda, treino concluído e dia selecionado. Último treino e séries de trabalho como resumo. |
| Assistente | Mostrar treinos concluídos, séries de trabalho e sessões que sustentam a revisão. A configuração do provedor fica em painel auxiliar ou seção abaixo da prévia. |
| Treino ativo | Carga anterior, meta, entrada de carga e reps, série concluída e descanso. A tabela compacta é a visualização do trabalho em curso. |

- Uma série por exercício e unidade. Use sessões concluídas e séries de trabalho válidas, descartando aquecimento. Agrupe as instâncias do mesmo exercício dentro da sessão pelo maior valor elegível. Use a data real no eixo x e kg no eixo y. Exiba apenas pontos registrados no período. Intervalos sem registro preservam o espaço temporal, sem pontos estimados. Para os exercícios sem carga aplicável, apresentar texto ou a métrica compatível no escopo que o Claude validar.
- Um ponto exibe a última carga com a data. Com nenhum ponto, sugerir registrar um treino elegível. Só mostrar diferença se houver dois ou mais registros. As linhas existentes de esforço ou medidas passam pelos mesmos critérios de unidade e alternativa textual. Em áreas que ainda usam barras, preferir tabela compacta para distribuições categóricas.
- O toque no ponto e os botões **Registro anterior** e **Próximo registro** mostram os mesmos valores. A tabela de dados fica disponível por teclado e leitor de tela. No celular, reduzir a quantidade de rótulos dos eixos, com a mesma escala, datas e valores.
- Usar `lucide-react` da Forja, que segue a família visual Feather. Ícone de 16–18 px e traço de 1,75–2 px, acompanhado de texto nas ações principais. Ícones decorativos são ocultos para o leitor de tela. Um botão somente com ícone precisa de nome acessível e alvo adequado. [Lucide e Feather](https://lucide.dev/guide/comparison)

## Como executar e Histórico por dia

**Treino Guiado.** Posicionar **Como executar** junto ao exercício atual no celular e no painel de apoio no desktop. A área expandida traz a demonstração com texto alternativo, crédito e troca de posição quando houver mais de uma imagem. Em seguida, mostrar **Buscar no YouTube** e o mapa com as vistas **Frente** e **Costas**. A legenda textual lista principais e auxiliares. Na falta de uma demonstração, manter a busca e os músculos disponíveis no catálogo.

**Histórico.** Usar **Esta semana**, **Semana passada** e **Escolher período** com início e fim. Mostrar uma faixa de data por dia com resultados e um accordion por sessão. O cabeçalho da sessão mostra rotina, duração disponível e contagem concluída. No conteúdo aberto, mostrar o volume de carga quando calculável, os exercícios com séries registradas, o aquecimento identificado e o **Mapa muscular da sessão**. Mostrar tempo, distância ou repetições conforme o registro. No desktop, mapa e séries cabem lado a lado. No celular, as séries aparecem primeiro. O atlas usa legenda com principal e auxiliar. O estado sem classificação informa a indisponibilidade de dados da sessão.

As [capturas do protótipo](prototipo/README.md#capturas) mostram as duas jornadas em desktop e celular.

## Acessibilidade e avaliação

- WCAG 2.2 AA. Texto normal com contraste mínimo 4,5:1 e componentes ou indicadores visuais essenciais com 3:1 quando aplicável. Alvos de ponteiro de pelo menos 24 × 24 CSS px ou com espaçamento equivalente segundo o critério. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) · [Tamanho mínimo dos alvos](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- Permitir percorrer e concluir os fluxos com teclado, incluindo trocar o período, percorrer pontos e abrir a tabela de valores. Foco visível de pelo menos 2 px como padrão do projeto, restauração de foco ao fechar diálogos, Escape para cancelar o diálogo e foco inicial coerente com a ação. Evitar obstrução do foco pela barra da PWA ou pelo teclado. Refluxo a 320 px e zoom de 200%.
- Anunciar conectividade, cópia, aprovação, fim de geração e erro com região de status ou alerta apropriada. Evitar anúncio a cada segundo do cronômetro. Tornar a alternativa manual do QR reconhecível pelo leitor de tela.
- Aplicar as heurísticas de Nielsen com estados de sistema visíveis, linguagem de treino e de dispositivos, cancelamento com retorno ao passo certo, confirmação de exclusão/revogação e recuperação junto ao erro. Testar cada jornada com câmera negada, reconexão, e teclado/navegação na PWA. [Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/)


## Formulário semanal — 19/11/2026

1. Campos comuns incluem nível geral com a quantidade visível (4/6/8) e duração por sessão com ajuda persistente. Evitar a palavra difícil como sinônimo de intensidade: a opção de experiência é Avançado.
2. Card Dias de treino: seleção Seg–Dom com alvos de toque de pelo menos 44 px, foco visível, `aria-pressed` e ícone de confirmação além da cor. Contador usa singular/plural.
3. Referência opcional fica recolhida entre a seleção e a configuração; anexar ou substituir arquivo não apaga os dias.
4. Card Configure cada dia: apenas dias marcados, em duas colunas no desktop e uma no celular. Tipo obrigatório; referência individual aparece quando há rotinas de um JSON.
5. Mudanças de dia, tipo, referência ou nível invalidam a prévia anterior. Não mover o foco ao selecionar um dia. Campos bloqueiam durante geração.
6. Por split reutiliza o seletor e mostra a semana resultante. Falta de exercícios ou duração insuficiente deve explicar qual configuração revisar; nunca exibir um plano reduzido como se atendesse ao nível.

A abertura e os slides usam a mesma marca, tokens e tipografia. Transições discretas, sem avanço automático; movimento reduzido elimina animações. [Especificação](../boas-vindas/spec.md).

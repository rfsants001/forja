# Implementação e testes · Handoff para o Claude

Documentos da expansão: [PRD](PRD.md), [TRD](TRD.md), [SDD](SDD.md) e [UX/UI](UX-UI.md).

## Implementação do piloto

- F6-01 a F6-03 usam Node.js 24 e SQLite, sessão de aparelho por cookie, QR ou código e fila transacional do Dexie. A PWA conserva o uso local sem vínculo.
- F6-04 lista modelos locais do Ollama, mostra a prévia da semana, valida as sugestões e aplica ou desfaz uma troca na versão esperada da rotina. Aplicar e desfazer foram testados com Ollama simulado. A geração com dados fictícios foi confirmada no Ollama local com `qwen2.5:7b`, que retornou uma sugestão válida.
- F6-05 fornece uma prova opt-in do Codex CLI em Linux isolada por Bubblewrap. Validar em ambiente com login dedicado antes de considerar uma integração para dados reais.
- P10 mostra a maior carga por exercício em Hoje e Progresso, com janela de 4 ou 8 semanas, pontos, navegação por teclado e tabela.
- O teste de navegador usa dois contextos independentes, simula desconexão, confirma a chegada de uma única sessão após reconectar e resolve a edição concorrente de uma rotina. Validar em PC e celular físicos com HTTPS em LAN ou VPN e medir os tempos de pareamento e reconexão.

## Questões registradas no planejamento original

1. Inspecione o checkout e confirme a versão-base com `git status` e `git log`. A linha publicada com o redesign e a exclusão de planos está em `901ac87`; preserve mudanças locais. Identifique o que já foi concluído no PT/EN.
2. Mapeie os caminhos reais de escrita, incluindo importação de plano/CSV, backup, exclusão em conjunto e gravação idempotente de sessão. Descreva quais precisarão passar por uma fronteira comum ou transação com fila.
3. Registre uma proposta de ADR em texto curto. Inclua contexto, opção principal, alternativa descartada ou adiada, consequências, migração, testes e hipóteses que precisam de prova. Questione Node/SQLite, a estratégia de QR, o método de sincronização e a CLI quando houver alternativa melhor. As tecnologias descritas no SDD são recomendação inicial. Para a prova Codex, confira também os termos aplicáveis, o isolamento do executor e se a distribuição pretende expor um login oficial.
4. Antecipe as incompatibilidades encontradas entre proposta e dados reais. Priorize testes de perda de conexão, alterações concorrentes, exclusão e recuperação de backup. Mudança de MVP, uso de serviço externo obrigatório ou mudança na ordem com P5-003 deve aparecer como decisão de produto explícita.
5. Abra o [protótipo responsivo](prototipo/README.md) e dê seu parecer sobre a adoção da paleta, dos campos compactos e do gráfico de carga. Compare a integração incremental com uma fatia visual dedicada ao núcleo do produto. Reutilize a biblioteca de ícones e avalie o reaproveitamento dos cálculos e componentes de Progresso. Registre no ADR a solução de renderização, a alternativa tabular e o custo de manutenção.

## Treino e Histórico aprovados

O usuário aprovou as quatro telas de Treino Guiado e Histórico em desktop e celular. Use as [capturas aprovadas](prototipo/README.md#capturas) como referência e os requisitos P11–P13 do [PRD](PRD.md#requisitos-e-aceite) como aceite da implementação local.

1. Em Treino Guiado, implemente **Como executar** para o exercício atual. Reutilize a demonstração licenciada e o atlas com Frente, Costas e legenda de músculos principais e auxiliares. **Buscar no YouTube** pesquisa o nome do exercício e fica disponível inclusive sem demonstração local. Abrir, fechar e voltar da busca preservam a série em edição e o descanso.
2. No Histórico, mantenha os filtros no topo e acrescente **Esta semana**, **Semana passada** e **Escolher período**. Agrupe pela data da sessão, com um accordion por treino. Exiba as séries reais, o aquecimento separado, as unidades registradas e o volume quando calculável. Derive o mapa das séries de trabalho concluídas.
3. Valide o app com teclado e toque, em desktop e celular. Cubra dois treinos no mesmo dia, intervalo customizado, entrada direta por sessão, cardio e histórico importado com classificação parcial. Use a camada PT/EN para novos rótulos e mensagens.

P11–P13 implementados no app local. A aplicação foi exercitada no Chromium a 320, 390 e 1.360 px com dados de demonstração. Foram verificados teclado e toque, mídia local, consulta durante o descanso, filtros de data, mais de uma sessão no mesmo dia, abertura direta de treino importado, volume sem aquecimento, cardio e o atlas no build offline. Foram conferidos os novos rótulos do Histórico em inglês e os valores em libras. O acento Âmbar usa grafite e laranja no tema escuro e papel e laranja no claro. As [capturas da aplicação](../../../README.md#telas) estão no README.

## Entregas em fatias

| Melhoria local | Entrega e aceite |
| --- | --- |
| Treino e consulta por data | P11–P12. Abrir e fechar **Como executar** preserva valores e descanso. Conferir demonstração disponível, ausência de mídia, busca por nome no YouTube, semana passada, intervalo customizado e dois treinos no mesmo dia. |
| Detalhe da sessão | P13. Navegar pelo accordion com teclado, conferir carga e reps, separar aquecimento e validar o mapa com séries concluídas, sessão de cardio e log antigo com classificação parcial. |

| Fatia | Entrega | Aceite |
| --- | --- | --- |
| F6-01 · Instalação | Servidor opcional, provisionamento administrativo, URL canônica, armazenamento persistente e instruções de HTTPS/LAN. | Instalação local existente continua útil; servidor responde no PC e celular; dados sobrevivem ao reinício. |
| F6-02 · Dispositivos | Convite, QR/código, aprovação, lista e revogação. | P02 e parte de P06. QR com leitor padrão e alternativa sem câmera. |
| F6-03 · Sync | Fila transacional, migração inicial, pull/push, escopo do piloto e conflitos. | P01, P03–P06. Duas PWAs, interrupção, retry e exclusão em modo avião. |
| F6-04 · Revisão local | Métricas determinísticas, prévia de entrada, Ollama, proposta individual, aplicar e desfazer. | P07–P09. Revisão também acessível no celular pareado. |
| F6-05 · Prova Codex | Adaptador isolado, opt-in, verificação do binário e execução sintética. | Validar CLI, autenticação, timeout, schema e saída; decidir se suporta release após a prova. |

## Matriz de teste

- **Core:** janela semanal com fuso e mudança de dia, aquecimento separado, agrupamento de métricas, compatibilidade de modalidade e equipamento, duplicatas de instância do exercício, referências inválidas, aplicação e inversa.
- **Repositório:** crash entre persistir e enfileirar, replay após perder resposta, requisições concorrentes com o mesmo id, operações fora de ordem, rollback de grupo e lote parcial. Um registro finalizado fica local até a confirmação chegar.
- **Pareamento:** usuário sem sessão administrativa não emite ou aprova; QR/código vencido, reutilizado ou substituído falha; duas tentativas concorrentes produzem no máximo um vínculo; limite de tentativas e troca da prova de uso único.
- **Rede e dados:** duas PWAs reais, uma sem rede. Alterar rotina/agenda no PC, registrar no celular, restabelecer e verificar exatamente uma sessão. Rotina excluída não ressuscita. Retomar e concluir sessão iniciada antes da exclusão. Testar edição concorrente, revogação, migração com bancos em ambas as origens e continuidade após restart do servidor.
- **Coach:** provider ausente, modelo indisponível, timeout, cancelamento, retorno parcial/inválido e versão de rotina desatualizada. Confirmar prévia, avisos de destino e que o provedor externo recebe apenas os campos selecionados. Verificar que segredo e payload não vão a logs/backup. Avaliar saída com fixture antes de usar dados de treino reais.
- **UX:** 320, 390, 768 e 1440 px, teclado, foco ao cancelar/aprovar, leitor de tela e já instalado após upgrade. Conferir densidade dos campos, alvos de toque e teclado nativo em ambos os temas. Testar gráfico numa janela vazia, com um treino e com vários treinos. Filtros, pontos e tabela devem mostrar os mesmos valores. Android Chrome e Safari/iOS/PWA em aparelhos reais. Rede LAN com HTTPS e fluxo manual sem câmera. Reutilizar comandos `pnpm test`, `pnpm typecheck` e `pnpm build`.
- **Operação:** backup/restore da instalação com SQLite e metadados de sync, revogação após restauração quando necessário, rotação de configuração, atualização de protocolo com cliente antigo e instruções testadas em instalação limpa.

## Handoff de cada fatia

Atualize o estado e os documentos afetados com os testes efetivamente executados, versões dos provedores testadas e lacunas. Registre um procedimento de instalação e recuperação adequado à arquitetura escolhida. Use dados sintéticos nas capturas e exemplos. Mantenha arquivos de espec em Markdown para leitura por agentes e humanos.

# PRD · Sincronização entre aparelhos e Assistente de treino

**Estado** · Piloto implementado. Fluxos testados com dois perfis de navegador. A revisão gerou uma sugestão válida no Ollama local com `qwen2.5:7b`. A aplicação e a reversão foram testadas com provedor simulado. A validação em rede doméstica e aparelhos físicos permanece aberta.

## Problema e público

Quem planeja a rotina no computador e registra séries no celular precisa transferir backups manualmente. A Forja já calcula a próxima meta de cada exercício, mas ainda falta uma revisão semanal que ajude a decidir quando ajustar a rotina. O público inicial é uma pessoa que usa a Forja em dois aparelhos e hospeda a aplicação sob seu controle.

## Resultado de produto

A pessoa abre a Forja no computador, pareia o celular em casa, treina em modo avião e encontra o treino registrado no PC após reconectar os aparelhos ao servidor. Depois, pede uma revisão da semana, confere os dados usados e decide se quer aplicar uma proposta à rotina.

## Princípios

- A instalação e o servidor de sincronização ficam sob controle do usuário. Usar a Forja só com o armazenamento local continua possível, inclusive sem login.
- Parear vincula um aparelho à instalação. Sincronizar é o processo automático que transfere alterações entre o aparelho e essa instalação.
- Ativar sync e enviar dados a um provedor de IA são ações distintas. Ollama local é o caminho de análise na instalação. Um provedor externo recebe apenas os dados que a pessoa revisou e confirmou.
- A pessoa continua dona do plano. A IA propõe mudanças. O motor atual da Forja continua calculando metas e progressão.

## Escopo do piloto

- PWA atual no desktop e celular. Pareamento por QR e entrada manual de endereço + código. O fluxo invertido, com código gerado pelo celular e digitado no PC, é extensão opcional quando ambos já acessam o mesmo servidor.
- Sincronização de rotinas, plano semanal, exceções, categorias necessárias, exercícios personalizados referenciados e treinos concluídos, incluindo correções, nomes históricos e notas do treino.
- Página de dispositivos com estado do sync, último sucesso, pendências, tentativa manual e revogação.
- Revisão semanal a partir de indicadores já calculados no app. Ollama local é o padrão. O Codex CLI com login dedicado é opt-in no Linux e mantém o aceite com assinatura real separado. Ambos montam rotinas com exercícios da biblioteca e confirmação antes de salvar.
- Aplicar individualmente uma substituição de exercício cadastrada, após confirmar a comparação antes/depois, e desfazer quando a rotina ainda estiver na versão resultante.
- Peso corporal, medidas, preferências, notas pessoais da biblioteca, modelos instalados e a sessão em andamento, incluindo timers, continuam locais no piloto. Comunicar isso no primeiro pareamento. A sessão passa a sincronizar quando concluída.
- Lojas de aplicativos, fallback automático de IA para provedor externo, WebRTC, Dexie Cloud gerenciado e sincronização entre instalações diferentes são extensões. Gemini CLI e assinatura Claude Code dependem de validação de provedor.

## Requisitos e aceite

| ID | Requisito | Aceite em dois aparelhos |
| --- | --- | --- |
| P01 | Uso local e ativação opcional | Instalação atual continua treinando offline sem parear. O primeiro pareamento mostra destino, dados que vão sincronizar e como manter cópia local. |
| P02 | Pareamento verificável | QR e código manual chegam à mesma solicitação. O computador autorizado aprova o aparelho. Cancelar, expirar e gerar novo código invalidam a tentativa anterior. |
| P03 | Treinar offline | Finalizar em modo avião grava sessão e pendência juntas. Reabrir preserva ambos. Reconectar e repetir o envio resulta em um único treino no PC. |
| P04 | Agenda e exclusão | Alterações de rotina e agenda aparecem no outro aparelho. Rotina removida permanece removida após reconexão. Logs e nomes históricos sobrevivem e os eventos ligados à rotina deixam de apontar para ela. |
| P05 | Conflito compreensível | Edições concorrentes da mesma rotina ou sessão concluída preservam a edição local até a pessoa decidir. Dias diferentes da agenda e treinos distintos convergem automaticamente. |
| P06 | Dispositivos e importação inicial | Mostra estado, pendências e último sync confirmado. Revogar impede novas sincronizações e pedidos de IA daquele aparelho. O primeiro vínculo de um banco existente oferece prévia e preserva dados em caso de interrupção. |
| P07 | Provedor opcional | Localizar, testar e selecionar modelo com mensagens úteis. Coach indisponível ou falha de rede deixa treino e fila de sync operacionais. |
| P08 | Revisão semanal controlada | A pessoa vê período e dados antes da geração. Em envio externo, vê o destino. A proposta referencia dados reais, exige confirmação, acusa versão desatualizada e permite desfazer quando a versão ainda coincide. |
| P09 | Acessibilidade e paridade | Fluxos principais completos com teclado e no celular. Há alternativa ao QR e estados com texto. Campos compactos mantêm alvo de toque e rótulo. Passa nas verificações do guia de UX/UI. |
| P10 | Evolução de carga no desktop e no celular | Filtrar 4 ou 8 semanas, trocar de exercício e consultar datas e valores em linha com pontos ou tabela. Dados vêm dos treinos locais. Estado vazio e sessão única têm mensagem adequada. A apresentação segue a fatia visual escolhida no handoff. |
| P11 | Consultar o exercício durante o treino | Abrir **Como executar** a partir do exercício atual. Exibir a demonstração com crédito quando disponível, o mapa de frente e costas com principal e auxiliares, e **Buscar no YouTube** pelo nome do exercício. Ao voltar, manter a série em edição e o cronômetro. |
| P12 | Encontrar um treino por semana ou data | No topo do Histórico, selecionar esta semana, semana passada ou um período. Consultar sessões agrupadas por dia, inclusive dois treinos no mesmo dia. Combinar período, busca e rotina. |
| P13 | Entender o que foi registrado na sessão | Expandir um treino para ler séries, carga, reps e aquecimento, com duração ou distância quando se aplicam. Exibir volume de carga apenas quando houver dados elegíveis. O mapa identifica os grupos envolvidos nas séries de trabalho concluídas. |

P11–P13 são melhorias do treino local e podem entrar antes do servidor, sincronização e provedor. Uma consulta pela semana passada e uma consulta ao exercício durante o treino são tarefas do piloto para validar a descoberta dos controles.

## Sinais do piloto

Registrar em teste interno o tempo entre abrir Parear e a primeira sincronização confirmada, a quantidade de treinos duplicados (esperado zero), exclusões ressuscitadas (zero), falhas recuperáveis e sugestões aplicadas ou rejeitadas. Meta inicial proposta de até dois minutos para parear uma instalação já acessível e até 15 segundos para o treino aparecer após reconexão com os apps em primeiro plano. Validar essas metas em uma rede doméstica e em dois aparelhos reais, sem exigir telemetria externa.

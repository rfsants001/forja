# TRD · Requisitos técnicos

## Restrições e pontos de partida

- Reutilizar React/Vite, Dexie, Zustand e `@forja/core`. Funcionar em PWA instalável e em navegador. A versão estática atual continua operando como instalação independente.
- O servidor e o executor de IA rodam na máquina do usuário. Um processo Node.js 24 serve a PWA e a API na mesma origem e grava SQLite em volume persistente. Ollama é opcional e usa o endpoint que o dono configurar.
- O navegador usa a origem pública/privada configurada da instalação. Loopback serve para desenvolvimento no próprio PC. Para o celular, usar um endereço de LAN ou VPN alcançável e HTTPS confiável, com atenção à instalação da PWA, cookies seguros e câmera. A entrada manual cobre câmera indisponível ou negada. [MDN · câmera e contextos seguros](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- Servidor atrás de proxy confiável ou VPN privada como cenário avançado. A configuração de URL canônica precisa ser explícita e QR deve usar essa URL. Validar origem e redirecionamento no fluxo de conexão. Mudar de origem implica novo armazenamento no navegador e exige migração documentada.

## Interface offline

- A linha de evolução de carga usa sessões locais concluídas e séries de trabalho válidas. Ela é independente do estado de pareamento e do provedor de IA. Reutilizar os cálculos existentes em `lib/stats.ts` quando compatíveis. A visualização, a navegação pelos pontos e a tabela usam a mesma série calculada.
- Reutilizar `lucide-react` nos fluxos novos. Empacotar gráficos, ícones e estilos no build para uso offline. Nenhuma CDN é necessária. O [protótipo](prototipo/README.md) usa Canvas. O runtime de produção pode reaproveitar a renderização existente em Progresso ou justificar outra opção.
- Em Treino Guiado, compartilhar a composição de demonstração e atlas da Biblioteca. Usar a mídia local já creditada e os músculos associados ao exercício. Construir uma URL de busca no YouTube com o nome do exercício e um termo de execução no idioma da interface. O link externo aparece mesmo sem mídia local e a navegação só acontece quando a pessoa aciona o link.
- No Histórico, filtrar pela data civil `WorkoutLog.dateISO` antes de agrupar. Os atalhos de semana cobrem segunda a domingo, com limites inclusivos. Manter ordenação e a abertura direta de uma sessão via `?treino=`.
- Contar séries de trabalho marcadas como concluídas. Somar `carga × repetições` apenas quando ambos os valores forem válidos. Derivar o mapa dos grupos de exercícios que têm séries de trabalho concluídas, com principal prevalecendo se o grupo também for auxiliar. Usar a classificação disponível e mostrar estado parcial quando dados de registros antigos estiverem ausentes. Aquecimento aparece separado.

## Dados

| Dado | Piloto | Identidade e observação |
| --- | --- | --- |
| Rotinas e categorias | Sync | IDs legados preservados. Deletes explícitos. Excluir plano limpa rotinas e respectivos vínculos preservando os logs. |
| Agenda semanal e exceções | Sync | Chave por perfil + dia da semana ou data ISO local. Slots independentes. |
| Treinos concluídos | Sync | ID gerado na abertura da sessão e reaproveitado na finalização. Preservar alvo, aquecimento, notas, unidades canônicas e nome histórico. |
| Exercícios personalizados | Sync | ID estável e dependências incluídas ao carregar rotinas e treinos. Distinguir exercícios do catálogo, que são distribuídos com a build. |
| Catálogo, mídias e notas de biblioteca | Local | Cache/seed continuam por versão. Notas pessoais em registros do catálogo ficam no aparelho. Não enviar binários de mídia na fila. |
| Peso, medidas, preferências | Local | Continuam exportáveis no backup. |
| Sessão em andamento, timers e credenciais | Local ou servidor | Sessão e timers ficam no aparelho. Segredos e credenciais do provedor ficam no servidor/processo oficial. Excluir de sync e do novo caminho de pareamento. |

O perfil do piloto representa uma instalação de um único usuário com múltiplos aparelhos. O armazenamento deve isolar pelo menos a instalação e os clientes devem detectar vínculo com perfil/instalação diferente antes de mesclar. Reservar escopo de perfil para evolução. Não criar conta SaaS.

## Integridade e operação

- Gravar alteração e fila de saída em uma transação local. Incluir criação, edições, exclusão, correção, aplicação de proposta e importações autorizadas. Ações de sync vindas do servidor não criam operações novas.
- Identificar operações de forma estável e aplicar no servidor uma única vez mesmo com retry, perda de resposta e abas concorrentes. Distinguir versão de entidade e cursor de leitura do fluxo de eventos. Usar o relógio do servidor para expiração, sem escolher o vencedor pelo horário do aparelho.
- Validar referências e dependências antes de confirmar mudanças de grupo. Manter marcadores de exclusão enquanto clientes antigos puderem voltar. Uma edição atrasada para entidade excluída retorna conflito recuperável.
- Versionar formato do sync. Cliente antigo fora da faixa recebe mensagem de atualização e mantém fila. Backup JSON continua independente; restauração destrutiva em um aparelho pareado exige fluxo explícito de migração/reconciliação.
- Estados mínimos: local, pareando, sincronizando, atualizado, aguardando, conflito e revogado. Tentativa ao abrir/retomar e ao recuperar conexão, com retry espaçado. A opção manual reaproveita o mesmo mecanismo.
- Emitir logs técnicos sem dados do treino, prompts, tokens ou segredos. Expor informações de diagnóstico para instalação, protocolo, última falha e status da conectividade. Testar backup/restore do volume e migrações com rollback ou restauração documentada.

## Pareamento e acesso

- Criar a primeira sessão administrativa apenas pelo console da instalação, loopback de bootstrap devidamente protegido ou procedimento equivalente. Em LAN, possuir o endereço não concede administração.
- Admin autorizado cria convite. QR leva token aleatório de alta entropia e código manual tem prazo curto, escopo por instalação, limite de tentativas e confirmação do admin. Valores sugeridos para o piloto: QR com 128 bits aleatórios, 6 dígitos, 5 minutos, até 5 erros por convite e limitação agregada.
- O servidor invalida convites atomicamente ao consumir, cancelar, expirar ou substituir, e permite aceitar apenas um solicitante. Armazenar derivação adequada do segredo, nunca exibi-lo em logs. O celular só ganha sessão após aprovação. Sessão revogável por aparelho, com cookies seguros ou alternativa justificada.
- A API exige identidade e autorização para todas as operações de sync/Coach. Ações administrativas de dispositivos exigem papel de dono. Mutações autenticadas por cookie precisam de proteção de origem/CSRF. As URLs do provedor são administrativas e não podem vir de parâmetros arbitrários de usuário.
- QR pode levar token no fragmento para evitar exposição no caminho HTTP. Limpar a URL após a captura, evitar links externos/referrer naquela tela e nunca colocar histórico, chave de provedor ou credencial permanente no QR.

## IA e provedores

| Provedor | Estado pretendido | Requisito |
| --- | --- | --- |
| Ollama local | Piloto | Descoberta por endpoint configurado, listar modelos locais, testar saída mínima e distinguir indisponível de modelo não instalado. Selecionar modelo cuja execução local foi verificada; comunicar destino real. [Modelos](https://docs.ollama.com/api/tags) |
| Codex CLI | Prova técnica opt-in | Detectar binário no host e confirmar por execução explícita com o login oficial do usuário. Executar argumentos fixos, sem shell genérico, em processo isolado sem acesso ao banco/repo e sem ferramentas desnecessárias. Validar saída estruturada e descartar logs com dados. [Codex exec](https://learn.chatgpt.com/docs/non-interactive-mode) |
| Gemini CLI | Avaliação posterior | Distinguir OAuth da CLI oficial, Gemini API e Vertex. Validar a distribuição/uso antes de habilitar o adaptador para outros usuários. [Termos](https://geminicli.com/docs/resources/tos-privacy/) |
| Claude API / Claude Code | Avaliação posterior | Priorizar chave ou provedor compatível controlado pelo dono. A CLI e a assinatura pessoal não são um caminho de produção assumido. [Regras da Anthropic](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) |

Cada adaptador informa destino, disponibilidade e capacidades separadamente. Restringir tempo, tamanho de entrada/saída, simultaneidade e privilégios. Configuração de CLI é administrativa e seleciona adaptadores conhecidos; dados de treino, notas, resposta do modelo e argumentos enviados por clientes são entradas não confiáveis. Provedor externo pede aprovação do destino e do payload resumido antes de cada geração no piloto. Proibição de fallback externo silencioso. O produto ainda deve funcionar com os indicadores determinísticos quando o provedor estiver ausente.

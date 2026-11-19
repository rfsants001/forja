# Nível geral e quantidade por sessão

## PRD / decisão de produto — 19/11/2026

Um dropdown **Nível geral de treino** aparece nos campos comuns de **Criar com IA** e **Por split**. Vale para todo o plano da geração atual; não existe nível por dia. Padrão: iniciante. Quantidades fixas de exercícios de musculação: iniciante 4, intermediário 6, avançado 8. As opções exibem a quantidade. A duração é **por sessão**, incluindo os descansos, e é enviada integralmente em cada chamada diária.

Essas quantidades são presets solicitados para o produto, não uma regra científica da ACSM. Não equivalem a intensidade ou garantem volume semanal apropriado. Objetivo, disponibilidade, séries, repetições, descanso e recuperação continuam relevantes. A [posição ACSM 2026](https://acsm.org/resistance-training-guidelines-update-2026/) recomenda individualizar a carga e o volume conforme os objetivos. A Forja não promete que oito exercícios sejam melhores que quatro.

Dias exclusivamente de cardio continuam com um bloco cronometrado. Emagrecimento com cardio na mesma sessão preserva a quantidade de musculação e reserva o tempo do cardio. **Importar sem alterações** conserva o arquivo, independentemente desses presets. Um plano de referência orienta a geração; não é uma ordem de copiar ou uma instrução para a IA.

## TRD / SDD

- O cliente mantém `trainingLevel: beginner | intermediate | advanced` no formulário e envia em todo `POST /coach/plans` de musculação, avulso ou semanal. Alterá-lo invalida a prévia, preservando os dias e tipos escolhidos.
- O servidor valida o enum, confirma candidatos distintos e aplica a regra comum a Ollama, Codex CLI e API compatível. A identidade de movimento evita usar aliases do catálogo para completar a quantidade.
- A seleção prioriza famílias complementares e usa variações distintas quando necessário. Preserva o papel diário e a filtragem por inventário. Não inventa equipamento ou IDs.
- A programação A/B mantém a quantidade escolhida; o contexto semanal aceita sessões anteriores com até oito exercícios.
- Respostas curtas de um modelo podem ser complementadas pela camada comum. As prescrições suplementares usam a base conservadora do coach, dentro das faixas do objetivo. Respostas com IDs inválidos, duplicados ou prescrições inválidas continuam rejeitadas.
- O ajuste de duração mantém ao menos duas séries por exercício neste fluxo. Se não couberem os exercícios e descansos, retorna `SESSION_DURATION_TOO_SHORT`; não entrega um plano menor como se tivesse atendido ao nível.
- Sem candidatos suficientes, retorna `PLAN_EXERCISE_COUNT_UNAVAILABLE`. A UI orienta revisar inventário/nível ou duração, com mensagens PT/EN. Nenhum plano parcial é salvo automaticamente.
- Requisições legadas sem nível mantêm a política anterior de 3–6 exercícios. Não migrar rotinas existentes nem alterar um treino importado.

## Validação

Testes de servidor cobrem os três níveis nos três provedores simulados, respostas curtas/excessivas, aliases, quantidade em A/B, enum inválido e duração inviável. Verificado no navegador: dropdown global único, geração sem/com JSON e seis dias Puxar/Empurrar/Pernas A/B com oito exercícios por dia, nível avançado e 75 minutos enviados separadamente em cada sessão; salvamento das seis rotinas e agenda. Os quatro splits também passaram pela geração e salvamento. Uma duração inviável exibiu o erro traduzido na UI e manteve o salvamento bloqueado. A autenticação real dos provedores não faz parte deste ajuste de quantidade.

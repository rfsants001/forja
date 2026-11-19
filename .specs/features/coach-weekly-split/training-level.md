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


## Regressão de casa — 19/11/2026

Não usar família como identidade única: rosca direta, martelo e inversa são variações reais, assim como pegadas distintas de puxada e posições de remada. Aliases PT/EN reconhecidos e alterações de carga, pausa ou tempo não contam como novo movimento. O repertório de casa tem variantes explícitas com requisitos conferidos; não derivar exercícios arbitrários de nomes em arquivos externos nem assumir mobiliário ou barra reta a partir de barra W.

`coach-catalog.ts` concentra elegibilidade, papéis diários e seleção. O modo casa prioriza esse repertório antes dos aliases do dataset e aceita até oito candidatos adicionais por músculo, dentro do teto de 60. Posterior de ombro usa a família `rear-delt-fly`, aceita em Puxar no cliente e na API; não liberar todo o grupo ombros nesse dia. Exercícios bilaterais com dois halteres respeitam a quantidade e o peso unitário registrados.

O teste de regressão usa os helpers reais do frontend e o coach comum com halteres, barra W, barra fixa e anilhas. Validado também pelo navegador com o JSON externo e sem arquivo, selecionando explicitamente Em casa: seis dias com oito exercícios, 75 minutos por sessão, salvamento e reabertura; repetido com um único halter. Provedor simulado. Quando a cobertura ainda for insuficiente, a mensagem deve atribuir a limitação ao catálogo, sem afirmar que os equipamentos não permitem outras variações.


## Reconhecimento do inventário e qualidade — 19/11/2026

- Aceitar `barra de haltere` com notas entre parênteses como halter montável; habilitar com anilhas cadastradas. `suporte para flexão` é alias de apoio de flexão. Preservar texto, quantidades e pesos no registro.
- Mostrar na lista de Meus equipamentos qual tipo o Assistente reconhece. Nomes personalizados continuam exigindo exercícios com requisitos compatíveis; não interpretar barra W como barra reta.
- Não usar preparatórios (controle escapular, remada deitada sem carga ou elbow lift) para completar as metas de exercícios de trabalho. No avançado, excluir regressões simples. Peso corporal não é motivo para excluir barra fixa ou flexões exigentes.
- Reutilizar o filtro puro na API para a regra não depender somente do prompt. Deduplicar aliases de barra fixa/pull-up independentemente da etiqueta de resistência usada pelo dataset.
- No Puxar, assegurar remada e puxada vertical quando o inventário permitir, alternando a primeira prioridade A/B. O resumo usa os exercícios finais, pois a ordenação e complementação da Forja podem mudar a resposta do modelo.
- Testar com a descrição real de handles e todos os pesos de anilhas, não apenas Halteres. A importação fiel e o histórico permanecem fora dessas regras de geração.


## Composição verificável e comparação — 19/11/2026

- Famílias e identidade em `packages/core/src/coach-movements.ts` são usadas pela UI e API. Inferir lateral, frontal, panturrilha, punhos, pullover e core; distinguir lateralidade e postura reais e deduplicar traduções equivalentes. O recorte de 60 candidatos conserva IDs de sessões anteriores e evita gastar espaço com aliases.
- Rear delt não entra em Empurrar. As novas propostas com nível usam o padrão de até dois exercícios da mesma família, com até três se a referência pedir três variações. Panturrilha tem teto de dois, reduzido a um quando a referência contém apenas um movimento; antebraço tem teto de um e core de dois. A seleção mantém as pegadas e variações da referência quando há correspondência compatível; o repertório inclui supino neutro no chão, tríceps unilateral acima da cabeça e afundo andando para essas adaptações. Estes são limites de montagem do produto, não limites clínicos.
- Priorizar padrões principais e, quando houver alternativas, duas roscas em Puxar e dois movimentos de tríceps em Empurrar nos níveis de seis/oito exercícios. Ordenar padrões principais antes dos acessórios. Não descartar uma prescrição válida só por repetir família.
- Em pernas, admitir core como acessório. A referência determina se o dia contém core, com até duas posições; sem arquivo, o B pode incluir uma posição. Não retirar o core do sábado para acrescentar aliases de panturrilha. Não inventar sliders, banco ou apoio para reproduzir um movimento não elegível.
- Se a quantidade escolhida não couber numa composição válida, retornar `PLAN_COMPOSITION_UNAVAILABLE`. Não gerar uma proposta reduzida com rótulo de sucesso.
- Retornar `referenceComparison` com contagens de exercícios/séries declaradas antes/depois e exemplos de famílias sem cobertura no catálogo elegível. Mostrar a comparação na prévia e preservá-la na nota. Não chamar essa contagem de equivalência de estímulo, tonelagem ou recuperação.
- Estimar os dois lados dos unilaterais explícitos e o descanso entre exercícios, além dos intervalos entre séries e aquecimento. Tempos de montagem/carga continuam desconhecidos; uma sessão antes estimada abaixo de 40 min pode precisar de mais tempo. Rejeitar duração inviável sem reduzir abaixo do mínimo de séries do fluxo.
- Preservar o modo Importar sem alterações e dados já gravados. A correção vale para novas propostas.

Testar os seis dias com o JSON externo, inventário literal e modelos simulados tanto com resposta curta quanto com a resposta problemática de oito itens. Assertar identidades, distribuição, séries preservadas, core e comparação — não apenas tamanho de array ou IDs distintos.

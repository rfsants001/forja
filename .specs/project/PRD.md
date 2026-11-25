# Forja · PRD

Atualizado em 25/11/2026.

## Problema e proposta

Quem treina em casa precisa adaptar uma rotina ao próprio equipamento, lembrar do que realizou e decidir se mantém, aumenta ou reduz a meta. A Forja reúne planejamento, execução guiada e progresso no mesmo fluxo. A pessoa escolhe a regra de progressão e pode corrigir o que registrou.

## Jornada principal

1. Na Home, começar com um plano, criar uma rotina ou importar histórico.
2. Escolher os dias recorrentes. Alterar uma data isolada ou iniciar uma rotina fora da agenda.
3. Ver metas e justificativa, registrar as séries, usar os timers e retomar a sessão após uma interrupção.
4. Finalizar e conferir o histórico. Corrigir séries quando necessário.
5. Abrir a próxima sessão e verificar a recomendação. Exportar e restaurar registros em um perfil limpo.

## Requisitos e aceite

| ID | Requisito | Aceite |
| --- | --- | --- |
| PRD-01 | Primeiro treino em PT-BR | Home vazia oferece três caminhos. O plano de casa usa halteres, barra fixa e peso corporal, sem depender de máquinas ou banco. Um plano incompleto não altera a agenda. |
| PRD-02 | Controle da agenda | Treinar agora, exceção por data e retorno ao plano recorrente. Excluir uma rotina ou plano pronto exige confirmação, limpa a agenda associada e preserva nomes e notas dos treinos registrados. |
| PRD-03 | Registro recuperável | Fechar/reabrir preserva a sessão e timestamps dos timers. Falha de escrita mantém o rascunho e uma mensagem orienta a repetir. O retry usa o mesmo ID. |
| PRD-04 | Progressão explicável | A série editável, o alvo gravado e o histórico descrevem a mesma meta. Abaixo da carga é miss. Primeiro registro serve de referência. 5/3/1 preenche três séries individuais e avança após acertos. |
| PRD-05 | Portabilidade | Backup v2 inclui medidas e lê v1. Preview, cancelar, mesclar e substituir são ações distintas. Plano inclui definições mínimas de exercícios. JSON personalizado no Perfil/Assistente oferece exemplo e prévia, preserva prescrições sem IA e exige escolha de dias. CSV informa linhas ignoradas e evita repetição por identidade de origem. |
| PRD-06 | UX acessível | Fluxos principais com status visível, teclado, foco claro, texto e ícone além da cor, áreas de toque adequadas e contraste aferido em ambos os temas. Usar WCAG 2.2 AA como referência de teste. |
| PRD-07 | Uso offline | Após a carga inicial em origem segura, conferir recursos em cache e plano local antes de indicar preparo. Testar abertura fria, retomada, histórico e backup com servidor desligado; atualização depende de confirmação e não interrompe a sessão. As demonstrações locais e o atlas carregam em modo avião. |
| PRD-08 | Biblioteca para casa e academia | Filtros por músculo principal ou auxiliar, equipamentos próprios e demonstrações. Detalhes exibem vistas frente/costas, legenda e crédito da mídia. |
| PRD-09 | Aquecimento | Registrar antes das séries de trabalho, retomar após reload e corrigir no histórico. Aquecimento fica fora da meta, volume, PR e da próxima prescrição. |
| PRD-10 | Formulários previsíveis | Rótulos permanecem visíveis, foco indica o campo ativo, Enter envia formulários de registro e erros preservam o que a pessoa digitou. Os botões são compactos no desktop e têm área maior em dispositivos de toque. |
| PRD-11 | Busca no histórico | Busca e filtro de rotina ficam acima da lista, com contagem de resultados e ação de limpar filtros. |

## Validação de produto

Piloto PT-BR de duas semanas com Rafael e um grupo pequeno. Observar conclusão do primeiro e do segundo treino, tempo até registrar a primeira série, correções de prescrição e restauração em outro perfil. Começar pelo Android e validar iPhone antes de prometer suporte equivalente. Manter créditos por imagem e decidir a licença do projeto antes da distribuição pública.

## Expansão

P5-003 é o próximo trabalho retomável. Fechar o seletor PT/EN, tradução das telas e persistência. Avaliar Capacitor se lembretes com o app fechado forem necessários. O [PRD da expansão self-hosted](../features/self-hosted-assistant/PRD.md) detalha o pareamento, a sincronização de um único perfil e a revisão semanal no Assistente de treino. Validar a revisão determinística antes de conectar Ollama. O [guia UX/UI](../features/self-hosted-assistant/UX-UI.md) registra a direção visual proposta para desktop e celular. A próxima revisão local detalha Como executar no treino, filtros de semana no Histórico e leitura da sessão com séries e mapa muscular.

## Entrada e montagem com IA — revisão de 19/11/2026

A abertura acompanha a inicialização real dos dados e conduz a quatro slides com navegação, Pular e preferência explícita de não repetir. Nenhum exemplo visual vira registro real. [Aceite e SDD](../features/boas-vindas/spec.md).

Na montagem semanal, selecionar dias antes de configurar os cards. Cada dia marcado exige tipo; referência de arquivo é opcional. Uploads preservam a seleção. Por split compartilha o mesmo controle de dias acessível. Um dropdown de nível geral define 4/6/8 exercícios por sessão de musculação para iniciante/intermediário/avançado. A duração informada vale integralmente para cada sessão. O servidor aplica essas quantidades independentemente do provedor, sem ignorar inventário, papel diário ou descansos. Limites inviáveis têm feedback explícito. A importação sem alterações preserva o conteúdo original. [Regras e validação](../features/coach-weekly-split/training-level.md).


A quantidade de itens não é aceite suficiente do Coach: propostas precisam de movimentos distintos e composição coerente com o dia. A/B preserva os padrões e prioridades da referência quando compatíveis, com transparência para mudanças de contagem ou cobertura. A prévia mostra exercícios e séries da referência versus proposta, e as notas salvas conservam a comparação. Não afirmar equivalência de carga ou adequação clínica a partir dessas contagens.

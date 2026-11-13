# Forja · PRD

Atualizado em 13/11/2026.

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
| PRD-02 | Controle da agenda | Treinar agora, exceção por data e retorno ao plano recorrente. Excluir uma rotina limpa referências futuras e conserva os logs. |
| PRD-03 | Registro recuperável | Fechar/reabrir preserva a sessão e timestamps dos timers. Falha de escrita mantém o rascunho e uma mensagem orienta a repetir. O retry usa o mesmo ID. |
| PRD-04 | Progressão explicável | A série editável, o alvo gravado e o histórico descrevem a mesma meta. Abaixo da carga é miss. Primeiro registro serve de referência. 5/3/1 preenche três séries individuais e avança após acertos. |
| PRD-05 | Portabilidade | Backup v2 inclui medidas e lê v1. Preview, cancelar, mesclar e substituir são ações distintas. Plano inclui definições mínimas de exercícios. CSV informa linhas ignoradas e evita repetição por identidade de origem. |
| PRD-06 | UX acessível | Fluxos principais com status visível, teclado, foco claro, texto e ícone além da cor, áreas de toque adequadas e contraste aferido em ambos os temas. Usar WCAG 2.2 AA como referência de teste. |
| PRD-07 | Uso offline | Após a carga inicial em origem segura, testar navegação, dois treinos, retomada, histórico e backup sem rede. A mídia de terceiros pode ficar indisponível. |

## Validação de produto

Piloto PT-BR de duas semanas com Rafael e um grupo pequeno. Observar conclusão do primeiro e do segundo treino, tempo até registrar a primeira série, correções de prescrição e restauração em outro perfil. Começar pelo Android e validar iPhone antes de prometer suporte equivalente. Revisar a licença das demos e do projeto antes da distribuição pública.

## Expansão

P5-003 é o próximo trabalho retomável. Fechar o seletor PT/EN, tradução das telas e persistência. Avaliar Capacitor se lembretes com o app fechado forem necessários. Antes de IA, testar uma revisão semanal baseada nas regras existentes.

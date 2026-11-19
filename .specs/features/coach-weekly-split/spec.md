# Coach — Plano semanal por split

## Objetivo
Gerar um plano de treino da semana coerente escolhendo um **split** e os **dias de treino**,
em vez de inferir o papel de cada dia (o modo atual força `foco=full` e produz o mesmo
full-body todo dia). Cada dia ganha um papel explícito (upper/lower/cardio/push/pull/legs),
e a IA monta só o que cabe naquele papel. Resolve a incoerência observada no plano da Larissa
(agachamento em dia "upper", treino de força em dia de "cardio", 4 exercícios iguais todo dia).

A montagem semanal inclui variantes A/B e comparação entre as sessões do mesmo papel. A progressão automática por ciclos de várias semanas permanece no planejamento.

## Uso (UX)
Nova aba/modo em "Montar treino": **Por split** (ao lado do fluxo atual de importar plano).
Campos:
- **Split**: `upper-lower` · `upper-lower-cardio` · `full-body` · `push-pull-legs`.
- **Dias da semana**: checkboxes Seg–Dom (`weekday` 1..6,0). O app distribui os papéis
  nos dias marcados, em ordem de dia.
- Reaproveita os campos existentes: `goal`, `venue`, `useInventory`/inventário, `minutes`.
- **Cardio** (só nos splits com cardio): duração em minutos + exercício de cardio disponível.
- Botão **Gerar plano semanal** → gera dia a dia (sequencial, respeita o mutex), preview de
  todos juntos, **Salvar e encaixar na agenda** → salva as rotinas e faz `setWeekday` nos
  dias escolhidos.

## Distribuição de papéis
Cicla o padrão do split sobre os dias marcados, em ordem de `weekday`:
- `upper-lower` → [upper, lower, upper, lower, …]
- `upper-lower-cardio` → [upper, lower, cardio, …]  (6 dias Seg–Sáb = U,L,C,U,L,C = plano Larissa)
- `full-body` → [full, full, …]
- `push-pull-legs` → [push, pull, legs, …]
Quando um papel de força repete, a primeira sessão recebe A e a próxima B. Com cinco dias, upper/lower/cardio gera Superior A, Inferior A, Cardio, Superior B, Inferior B. A prévia mostra essa distribuição antes da geração.

## Papel → geração
Mapa de papel para filtro de candidatos (cliente) + `focus` enviado ao backend
(`focuses` do servidor só aceita full|upper|lower; o pool restrito faz o resto):
| Papel | músculos (filtro no cliente) | focus p/ backend |
|---|---|---|
| upper | chest, back, lats, shoulders, biceps, triceps, forearms, traps | upper |
| lower | quads, hamstrings, glutes, calves | lower |
| full | todos | full |
| push | chest, shoulders, triceps | upper |
| pull | back, lats, biceps, traps, forearms | upper |
| legs | quads, hamstrings, glutes, calves | lower |
| cardio | — (sem IA) | — |

- **Dias de força** (todos menos cardio): `eligible = eligiblePlanExercises` filtrado pelos
  músculos do papel; `candidates = planCandidates(...)`; `POST /coach/plans` com o `focus`
  mapeado e contexto semanal validado pelo servidor.
- **Dias de cardio**: montados **no cliente, sem chamar a IA** — uma rotina com um exercício
  de cardio (`cardioExercises` filtrado pelo equipamento) com `targetSec` = duração escolhida.

## Agenda
Cada dia gerado é salvo (`saveCoachPlan`) e agendado no seu `weekday` via `setWeekday`.
Como o usuário escolheu os dias, o agendamento é parte do fluxo (não um checkbox opcional).

## Fora de escopo (Fase 2)
- **Progressão / periodização**: exposta como **duas opções** — (a) ativar ao criar o plano,
  (b) ativar num plano já ativo. Na Fase 1 as rotinas salvam com `progression: "off"`.
- **Progressão entre semanas** de carga e volume com ciclos e recuperação, preservando o histórico de cada variante.
- **Enriquecer o dataset de exercícios de casa** (teto de variedade) — trabalho de conteúdo.

## Aceite (Fase 1)
- [ ] Escolher split + dias gera uma rotina por dia marcado, com papel coerente
      (dia upper não traz agachamento; dia cardio é só esteira).
- [ ] Preview mostra todos os dias; salvar cria as rotinas e preenche a agenda semanal
      nos dias escolhidos (`setWeekday`).
- [ ] PPL funciona sem alterar o backend (candidatos filtrados no cliente).
- [ ] `upper-lower-cardio` com Seg–Sáb reproduz a estrutura U/L/C/U/L/C.
- [ ] Fluxo atual (importar plano / dia único) continua intacto.
- [ ] `pnpm typecheck` e `pnpm build` limpos; rótulos novos em PT e EN.


## Revisão após a implementação

Arquivos JSON usados como referência exibem uma linha por dia. A pessoa escolhe uma rotina do arquivo e o papel que a IA deve respeitar. O modo Importar sem alterações lê JSON portátil, OpenGym e export de plano Forja, salva todas as rotinas localmente e agenda apenas as atribuições explícitas. Dias ocupados exigem confirmação. A importação e a gravação do plano semanal usam uma transação de rotinas e agenda. Em dias dedicados ao cardio, o app salva o bloco cronometrado sem chamar a IA.

Em Criar com IA, o seletor de dias aparece também sem arquivo. Cada dia pode usar Criar treino ou uma rotina carregada. O tipo é obrigatório para os dias escolhidos. O JSON permanece opcional.


## Variação semanal validada

Toda geração de uma sessão semanal envia `week.role`, `week.variant` e as prescrições anteriores daquele papel. A API confere o papel, o índice e os IDs conhecidos. A montagem e a verificação de duplicatas ficam na camada comum do coach, aplicada a Ollama, Codex e API compatível.

A regra de programação da Forja alterna prioridade horizontal/vertical nos superiores e joelho/quadril nos inferiores quando há opções elegíveis. Ela preserva o objetivo, a duração e o inventário. Variantes com IDs diferentes mas a mesma família, resistência, inclinação e lateralidade são tratadas como equivalentes, para evitar que uma duplicata do catálogo pareça variedade. Exercícios sem família reconhecida usam o nome normalizado.

Cada composição é comparada com todas as sessões anteriores do mesmo papel. Quando a lista se repete, o servidor procura uma troca compatível, priorizando o mesmo músculo e família. Se o catálogo elegível não oferecer outra composição, muda a prescrição dentro das faixas do objetivo. A comparação final ocorre após ajustar a duração. A prévia informa essa limitação e a rotina salva guarda o aviso. Se a sessão não puder ser diferenciada, a API devolve erro e a semana permanece sem salvar.

O programa salvo mantém suas rotinas nas semanas seguintes. A/B descreve a distribuição dentro da semana. A evolução automática de ciclos e deloads exige a fase de progressão.

A escolha desse comportamento A/B é uma decisão de produto e programação. A revisão sobre variação de exercícios apoia uma abordagem sistemática e aponta limites para mudanças aleatórias e excessivas. A posição ACSM 2026 enfatiza regularidade e individualização e relata que periodização complexa não mostrou benefício consistente para todo adulto saudável. [Revisão de Kassiano et al. (2022)](https://pubmed.ncbi.nlm.nih.gov/35438660/) · [ACSM 2026](https://acsm.org/resistance-training-guidelines-update-2026/).

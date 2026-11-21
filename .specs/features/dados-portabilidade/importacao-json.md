# Importação de JSON personalizado · PRD, TRD e SDD

Implementado em 20/11/2026. Continuidade de um programa vindo de outro lugar, sem geração por IA.

## Produto e aceite

- **Perfil → Importar de outro app → Importar JSON personalizado** abre um modal com instruções, campos aceitos, exemplo legível e download do exemplo.
- **Assistente → Importar sem alterações** usa o mesmo componente, inclusive instruções, prévia, agenda, conflitos e gravação. A URL `/perfil/assistente?modo=port` abre esse modo; o painel de provedor não é mostrado nele. Não exige conta, engine, servidor ou envio para IA; o modo port nem consulta os provedores.
- O usuário escolhe os dias. Cada dia selecionado recebe a próxima rotina ainda não usada, na ordem do arquivo, com seletor para trocar. Com mais dias que rotinas, a primeira pode ser sugerida novamente. A pessoa revisa antes de salvar; nada é agendado só por abrir o arquivo.
- A importação conserva nomes, ordem, número de séries e prescrições nos campos suportados, sem aplicar filtros de inventário, nível, variedade ou geração. Todas as rotinas são salvas; as sem dia continuam disponíveis em Treinos.
- Há uma rotina por dia. Um dia ocupado só é substituído com autorização explícita. Não alterar dias não selecionados, Histórico, exceções por data ou a sessão ativa.
- Sessões já concluídas continuam entrando pelos importadores CSV de FitNotes, Strong e Hevy. Apple Health importa peso. JSON personalizado importa um programa, não um registro concluído nem o estado de execução de outro aplicativo.
- PT/EN, modal nativo com foco contido e Escape, erros recuperáveis, teclado e larguras móveis. O botão de concluir fica em rodapé aderente no formulário.

## Contrato do arquivo

Aceita plano Forja v1/v2, OpenGym e JSON personalizado. Limite: 12 MB. Em `routines`, cada rotina tem `name` e uma lista não vazia de `exercises`. Cada exercício exige `name` e `sets` inteiro de 1 a 100.

| Campo opcional | Representação |
| --- | --- |
| `reps` | Número inteiro positivo ou texto de faixa, preservado como texto. |
| `seconds`, `secondsMax` | Segundos positivos inteiros; máximo exige alvo inicial e não pode ser menor que ele. |
| `loadKg`, `restSec` | Carga em kg e descanso em segundos, não negativos; zero é preservado. |
| `mode` | `reps`, `time` ou `cardio`. Tempo informado também permite inferir o modo. |
| `targetDistanceM`, `targetSpeedKmh` | Distância em metros e velocidade em km/h, não negativas. |
| `note`, `prescription`, `instructions` | Notas e orientações; prescription e note são concatenados no comentário da prescrição. |
| `supersetGroup` | Número inteiro positivo do grupo de supersérie. |
| `prog`, `trainingMaxKg` | Políticas existentes (`off`, `linear`, `greyskull`, `double`, `time`, `531`); 5/3/1 requer training max válido. |

A rotina também pode ter `note`. Aliases anteriores (`weight`, `rest`, `sec`, `min`) continuam suportados. Campos não suportados não são importados; o modal informa essa limitação. Não prometer importação arbitrária de qualquer JSON nem equivalência de configurações específicas de outros aplicativos. Para instruções sem campo próprio, usar `note`. Números negativos/inválidos em campos reconhecidos do formato personalizado são rejeitados, evitando perda silenciosa de metas.

[Exemplo público](../../../assets/examples/plano-personalizado.json) · [Guia do usuário](../../../README.md#importar-e-distribuir-um-plano-na-semana)

## Arquitetura

- `components/PortablePlanImport.tsx`: formulário compartilhado e wrapper `PortablePlanImportDialog`. O wrapper carrega o catálogo local e usa `<dialog>.showModal()`; close/Escape devolvem o foco ao acionador. Fechar durante leitura/gravação fica bloqueado.
- `lib/portable-plan.ts`: leitura, validação completa e normalização antes de escrever. Depois da confirmação, `savePortablePlan` grava definições, rotinas e agenda em `syncWrite` transacional. Reconfere conflitos na transação; as mutações também entram na fila local de sync.
- `components/WeekdayPicker.tsx` e `lib/weekdays.ts`: dias comuns a criação, split e portabilidade. A constante saiu do componente de importação para evitar dependência circular. O controle respeita disabled durante a gravação.
- `Perfil.tsx`: ação para programa JSON separada dos importadores de sessões concluídas. Fontes de histórico usam rádios nativos com aparência de botão.
- `CoachPlan.tsx` e `Assistente.tsx`: seleção de modo responde imediatamente, atualiza a URL e mantém a importação independente da disponibilidade de IA. Não reutilizar chamadas de geração para portar plano.

## UI e navegação

Raio de 4 px em campos/botões, 6 px em cartões e 8 px em diálogos. Cabeçalhos mais compactos, navegação lateral discreta, listas com divisórias e seções do Coach sem cartões duplicados. Preservar Inter, Âmbar/grafite, acentos personalizados e modos claro/escuro.

Todos os rádios visuais usam a superfície do label como botão e o input real sobre toda a área com opacidade zero. Preservar name, checked, disabled, foco no label e setas do teclado; seleção tem borda/linha além da mudança de cor. Não trocar por divs clicáveis. O Perfil tem âncoras para acessar seções sem percorrer toda a página.

Referências de princípios, sem copiar mídia: [Primer: seleção segmentada](https://primer.style/product/components/segmented-control/), [Linear: navegação e configurações](https://linear.app/changelog/2024-12-18-personalized-sidebar), [GitLab Pajamas: grupos de rádio](https://design.gitlab.com/components/radio-button/).

## Evidência de verificação

- Navegador Chromium: entrada do Perfil, exemplo baixável/importável, foco/Escape, arquivo inválido sem gravação, seleção de dias, troca de categoria, conflitos e autorização de substituição.
- Fixture com reps em faixa, tempo mínimo/máximo, carga, descanso zero, notas, instruções, supersérie, distância e velocidade. Verificação dos valores no IndexedDB após salvar; Histórico e rascunho mantidos.
- Arquivo externo real com 19 rotinas importado inteiro; apenas dias explicitamente selecionados foram agendados. O arquivo pessoal não faz parte do repositório.
- PT/EN com recarga, tema claro, nove telas em 320/390/1440 px sem overflow e rádios por mouse/setas. Importação local sem consultar engines nem gerar com IA. Perfil importou o fixture com a rede desligada em viewport móvel com toque; ação de salvar visível. Capturas no README usam dados fictícios.
- Gates: 147 testes core + 45 servidor, typecheck e build. Não equivale a validação em celular físico, VoiceOver/TalkBack ou navegadores de todos os sistemas operacionais; essas verificações continuam pendentes no STATE.

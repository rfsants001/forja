# UX e acessibilidade

## Revisão de 20/11/2026

Rádios de todo o app têm aparência de botões, mantendo input/name/checked e setas; foco e estado selecionado são visíveis além da cor. Perfil ganha âncoras, atalhos agrupados e importação JSON em dialog nativo, sem IA. Fundamentos e evidências em [importação e UI](../dados-portabilidade/importacao-json.md). A revisão reduz cartões aninhados no Coach e padroniza raios de 4/6/8 px.

Escopo da revisão: início, treinos, sessão guiada, histórico, importação e restauração.

| Heurística | Aplicação |
| --- | --- |
| Estado visível | Feedback de salvamento, importação, agenda, fim de descanso e erro recuperável. |
| Controle do usuário | Cancelamento real, confirmação de substituição, dias ocupados preservados e correção do realizado. |
| Reconhecimento | Ações iniciais explícitas, nome da rotina, unidade e meta por série, controles de pausa e retomada. |
| Prevenção de erro | Validação antes de gravar, bloqueio de rotinas vazias, preservação do rascunho e aplicação transacional. |

WCAG 2.2 AA orienta contraste, foco, nomes acessíveis, tamanho de alvo e estados com texto. Oito acentos validados numericamente em fundos principais e textos de botão. O modal de plano respondeu a Escape no Chromium e os fluxos principais rodaram em viewport móvel. A conformidade completa depende da verificação de todos os componentes no navegador, com teclado, leitor de tela, zoom, redução de movimento e larguras móveis.

[Nielsen Norman Group](https://www.nngroup.com/articles/ten-usability-heuristics/) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

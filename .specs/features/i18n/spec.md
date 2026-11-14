# P5-003 · i18n PT/EN

**Estado em 13/11/2026: iniciado e incompleto.** A interrupção do trabalho anterior deixou dicionários, `useT()`, `Settings.lang` e componentes parcialmente traduzidos. A compilação voltou a funcionar. O componente Media ganhou controles de posições e créditos. A biblioteca ganhou o diálogo do atlas, o inventário e filtros, e a sessão ganhou aquecimento. Inclua essas mensagens e os nomes acessíveis na cobertura.

## Retomada

- Ler `apps/web/src/lib/i18n.ts`, `labels.ts`, Perfil e os componentes que já usam `useT`.
- Expor PT-BR e English no Perfil, salvar com `updateSettings` e atualizar `document.documentElement.lang`.
- Traduzir as oito telas, acessibilidade, estados vazios, diálogos, importações e mensagens introduzidas na revisão.
- Usar o locale ativo para datas e números apresentados. O core pode devolver códigos e parâmetros de prescrição junto da explicação para compatibilidade.
- Manter nomes cadastrados, notas do usuário e conteúdo do dataset como dados.

## Aceite

- PT → EN atualiza navegação, telas, nomes acessíveis, erros e explicações sem recarregar.
- Reabrir a PWA preserva EN e o HTML tem `lang="en"`. Trocar de volta restaura PT-BR.
- Chaves de interface cobertas nos dois dicionários. `pnpm test`, `pnpm typecheck` e `pnpm build` passam.

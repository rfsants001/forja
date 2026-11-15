# P5-003 · i18n PT/EN

**Estado em 15/11/2026.** Seletor do Perfil, persistência, idioma do HTML, navegação e controles principais em PT/EN já funcionam. O core gera chaves estáveis para as justificativas de progressão. Os testes passaram pela troca, recarga e volta ao português. Ainda resta revisar a cópia de fluxos secundários e seus formatos.

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

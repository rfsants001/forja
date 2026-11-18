# P5-003 · i18n PT/EN

**Concluído em 17/11/2026.** Seletor do Perfil, persistência, idioma do HTML, navegação e controles principais em PT/EN funcionam. O core gera chaves estáveis para as justificativas de progressão. Os testes passaram pela troca, recarga e volta ao português.

A revisão dos fluxos secundários foi fechada: dias da semana (Treinos) usam `wd.short`/`wd.full`; filtros de equipamento da Biblioteca têm chave de exibição `equip.*` mantendo o rótulo como identidade estável; métricas da edição de histórico (`metric.*`); contadores de exercícios (`ui.exercisesTotal` + `ex.showing`/`re.showing`); feedbacks de importação, exportação, exclusão e criação de rotinas; `aria-label` da home e fallback de nome de exercício no Progresso. O `db/repo.ts` passou a lançar `UiError` com chave (padrão já usado em `backup.ts`, `importers.ts`, `plan-share.ts`), eliminando mensagens de erro em PT cru que vazavam no modo EN; os sites de exibição comparam `error.key` e traduzem. Dicionário com paridade PT/EN (cada chave nova existe nos dois blocos). Placeholders de unidade (`seg`, `m`, `—`) permanecem neutros por decisão.

**Segunda passada (17/11, pós-review do Codex).** O Codex achou vazamentos residuais em EN; varredura completa da UI fechou todos: títulos da Home (`home.buildFirst`/`home.freeDay`/reuso de `home.ongoing`/`home.today`), `aria-label`s de ações em Treinos (`tr.editAria`/`trainNowAria`/`continueAria`/`deleteRoutineAria`/`deletePlanAria`), `aria-label`s do Treino Guiado (distância via `tg.distanceRow`, `tg.rirRow`, `tg.removeWarmup`), remoções em Progresso (`prog.deleteMeasure`) e Perfil (`prof.deleteWeight`), rótulos de medida (`measure.*`, já existentes), filtro de período (`period.all`), validações do editor (`re.noHistoryTM`/`re.groupSuperset`/`re.selectTwo`), import de plano (`perf.planImported`) e unidade do mapa muscular (`unit.sets`, número por locale). **A camada de UI está completa** — o que resta em PT são só rotas e comentários de código.

**Planos prontos.** A aplicação usa o idioma ativo para persistir o nome da categoria, o nome da rotina e as notas predefinidas. Ao reaplicar o mesmo plano em outro idioma, os nomes PT e EN servem para localizar as rotinas já criadas. Dados já salvos mantêm a redação original. O seletor traduz as descrições e erros, e o PDF usa os dados persistidos. O editor informa nome e categoria vazios no idioma do app.

Gates em 17/11: `pnpm typecheck` limpo, `pnpm test` 138 do core + 2 do server, `pnpm build` OK.

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

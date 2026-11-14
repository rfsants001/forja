# P5-002 · Tema e acentos

Atualizado em 13/11/2026.

## Estado

Tema claro, escuro e sistema persistem no Perfil. O tema explícito governa as superfícies e os controles nativos mesmo quando o SO usa outro tema. Modo Sistema acompanha a preferência do SO. Oito acentos usam cores diferentes nos temas claro e escuro. O acento padrão é índigo. Foco visível, feedback em texto e movimento reduzido acompanham os controles revisados.

## Aceite

Testar teclado, leitor de tela, superfícies reais e dispositivo em ambos os temas.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

> Fase 5. Deixar o usuário escolher tema (dark/light/system) e uma cor de acento global.
> Local-first: persistido em `Settings` (Dexie). Sem backend.

## Estado atual (já existe, parcial)
- `Settings.theme: 'dark'|'light'|'system'` já no core (`types.ts`), default `dark`.
- `applyTheme()` em `Perfil.tsx` seta `document.documentElement.dataset.theme`.
- `theme.css` tem `:root` (dark) + `:root[data-theme='light']` com tokens claros.
- `--accent` global existe (default `--flame`); Home sobrescreve por categoria via inline style.

## Bugs/gaps a resolver
1. **Light mode quebrado:** os tokens de `[data-theme='light']` estão DENTRO de
   `@media (prefers-color-scheme: light)` → escolher "light" explícito não aplica se o SO
   estiver em dark. **Corrigir:** separar — `[data-theme='light']` vale sempre; `system`
   (dataset vazio) é que respeita `@media (prefers-color-scheme: light)`.
2. **Sem acento selecionável:** só há acento por categoria. Adicionar acento global.
3. **Flash de tema errado no load:** aplicar tema+acento o quanto antes (idealmente em
   `main.tsx` lendo Settings, ou script inline) pra evitar flash.

## Escopo
- **Core:** adicionar `accent?: string` em `Settings` (nome do acento, ex. `'flame'`), manter
  `DEFAULT_SETTINGS.accent = 'flame'`. Não quebrar tipos existentes.
- **Paleta:** 8 acentos nomeados em CSS (`:root[data-accent='...']` sobrescreve `--accent` e
  `--on-accent`): flame(padrão), blue, violet, green, amber, rose, cyan, magenta. Cores que
  funcionem em dark E light (contraste ok).
- **Aplicar:** `applyAccent()` seta `document.documentElement.dataset.accent`. Tema + acento
  aplicados no boot a partir de `Settings` (sem flash).
- **UI em Perfil.tsx:** segmented control tema (dark/light/system, já existe parcialmente) +
  grade de 8 swatches de acento; selecionar persiste via `updateSettings` e aplica na hora.

## Done-when
- [ ] Escolher "light" aplica o tema claro mesmo com SO em dark; "system" segue o SO.
- [ ] 8 acentos selecionáveis; trocar aplica instantâneo e persiste após reload.
- [ ] Sem flash de tema/acento errado no carregamento.
- [ ] `--accent` por categoria (Home) continua funcionando por cima.
- [ ] `pnpm -r typecheck` limpo · `build` ok · core tests verdes.

## Fora de escopo
Temas custom pelo usuário, mais de 8 acentos, acento por rotina.

</details>

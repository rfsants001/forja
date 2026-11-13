# P5-001 · Planos prontos

Atualizado em 13/11/2026.

## Estado

Full-body, upper/lower, 5×5 com agenda fixa e Força em casa 3×. Força em casa usa o seed curado, os demais podem aguardar o catálogo bundled. Falta de exercício interrompe a aplicação antes de gravar. Dias existentes são mantidos por padrão.

## Aceite

Aplicar cada modelo em perfil limpo e com dias ocupados. Testar novamente o mesmo modelo sem duplicar rotinas.

[Roadmap](../../project/ROADMAP.md) · [SDD](../../codebase/ARCHITECTURE.md)

<details>
<summary>Planejamento original para referência</summary>

O estado e o aceite acima prevalecem nesta revisão.

> Fase 5. Planos de treino prontos que o usuário instancia com um toque, pra não começar
> do zero. Local-first — cria categorias/rotinas/plano reais no Dexie.

## Planos (mínimo 3)
1. **Full-body 3×/semana** (iniciante) — seg/qua/sex, 1 rotina full-body repetida.
2. **Upper/Lower 4×/semana** — upper A, lower A, upper B, lower B.
3. **5×5 (StrongLifts-style)** — Treino A (agachamento, supino, remada) e Treino B
   (agachamento, desenvolvimento, levantamento terra), 3×/semana alternando, 5×5.

Cada plano: nome, descrição curta, dias da semana sugeridos, e rotinas com exercícios
compostos (reps/sets/progressão/incremento coerentes — ex. 5×5 usa progressão linear).

## Resolução de exercícios (importante)
Exercícios no catálogo têm id `ds-XXXX` **frágil**. NÃO hardcodar ids. Em vez disso, cada
item do plano referencia o exercício por **nome canônico** (ex. "barbell squat",
"barbell bench press", "deadlift", "overhead press", "barbell row", "pull up") e, na hora de
instanciar, resolve por **nome normalizado** contra o catálogo (lowercase, sem acento/pontuação),
igual ao `importers.ts`. Se não achar match, usa o mais próximo por `includes` ou pula com aviso.
Reusar/extrair o helper de normalização em vez de duplicar.

## Instanciar
`applyStarterPlan(planId)`:
1. `upsertCategory` numa categoria do plano (ou reusar existente por slug).
2. `upsertRoutine` pra cada rotina (resolvendo exerciseIds via catálogo).
3. `setWeekday` pros dias sugeridos.
4. Idempotente-ish: avisar se já existe rotina com mesmo nome (não duplicar silenciosamente).

## UI
Entrada em **Treinos.tsx** (lista de rotinas) ou um botão "Começar com um plano pronto" quando
não há rotinas. Modal/sheet lista os planos (nome + descrição + dias) → confirma → instancia →
toast + navega pro plano. Dados dos planos num módulo próprio (`lib/starter-plans.ts`).

## Done-when
- [ ] ≥3 planos instanciáveis; cada um cria categorias+rotinas+plano semanal reais.
- [ ] Exercícios resolvidos por nome contra o catálogo (sem id hardcoded quebrando).
- [ ] 5×5 vem com progressão linear + incremento; não duplica se aplicado 2×.
- [ ] `pnpm -r typecheck` limpo · `build` ok.

## Fora de escopo
Editor de "meus templates", planos importados da comunidade (isso é G6/plan-share).

</details>

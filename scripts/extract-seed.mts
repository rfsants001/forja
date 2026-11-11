// Extrai o plano fixo do app antigo (~/dev/treino/app) para um JSON faithful em seeds/.
// Rodar: pnpm dlx tsx scripts/extract-seed.mts
// O app antigo fica INTACTO — isto só lê.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// @ts-expect-error — import cross-repo do app antigo (resolvido pelo tsx)
import { DAYS, BOXING_LEVELS } from '../../treino/app/src/data/workout.ts';
// @ts-expect-error — idem
import { resolveDemo } from '../../treino/app/src/data/demos.ts';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'seeds', 'treino-rafa.json');

// Coleta os SVGs custom (os 5 movimentos que nenhum dataset aberto cobre).
const CUSTOM_KEYS = ['frontlever', 'boxe', 'shadow', 'esteira', 'wrist'];
const customDemos: Record<string, string> = {};
for (const k of CUSTOM_KEYS) {
  const d = resolveDemo(k);
  if (d.kind === 'custom') customDemos[k] = d.svg;
}

const payload = {
  _meta: {
    source: 'treino/app · src/data/workout.ts + demos.ts',
    extractedAt: new Date().toISOString(),
    note: 'Dump fiel do plano fixo do Rafael. Vira o seed padrão do Forja (transformado no load da Fase 1).',
  },
  days: DAYS,
  boxingLevels: BOXING_LEVELS,
  customDemos,
};

writeFileSync(out, JSON.stringify(payload, null, 2) + '\n', 'utf8');
const days = (DAYS as unknown[]).length;
const lvls = (BOXING_LEVELS as unknown[]).length;
console.log(`✓ seed escrito em ${out}\n  ${days} dias · ${lvls} níveis de boxe · ${Object.keys(customDemos).length} demos custom`);

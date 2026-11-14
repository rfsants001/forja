# Forja · Stack

| Camada | Implementação |
| --- | --- |
| Domínio | TypeScript estrito, `@forja/core`, Vitest. |
| Web | React 19, React Router, Vite 6, Framer Motion, Lucide. |
| Estado | Zustand persist para sessão ativa e Dexie/IndexedDB para dados. |
| Validação | Validadores de runtime próprios para JSON de backup e plano. Parsers próprios para CSV e XML de peso. |
| Distribuição | PWA estática, manifest e service worker gerado por `vite-plugin-pwa`. Dev na porta 5577. |
| UI | Inter e Barlow Condensed locais. Caderno responsivo em CSS com temas claro, escuro e de sistema, e oito acentos. |
| i18n | Dicionários TypeScript e hook reativo Dexie, parcialmente adotados. |

Para reproduzir o setup do [README](../../README.md), use Node.js 24 e pnpm 12.16.1. O `pnpm-workspace.yaml` autoriza o postinstall do esbuild com `allowBuilds`. Em um clone limpo, rode `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm typecheck` e `pnpm build`. O repositório tem dois workspaces de aplicação/domínio. Hono, SQLite, Docker e Zod constavam da fase inicial ou da arquitetura prospectiva. O produto atual usa as camadas da tabela acima.

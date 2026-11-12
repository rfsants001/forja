<p align="center">
  <img src="apps/web/public/logo.svg" alt="Forja" width="440" />
</p>

<p align="center">
  <strong>A local-first, gamified workout tracker that actually owns your data.</strong><br/>
  Plan your week, run a guided session, and let an honest progression engine tell you what to lift next — all offline, all on your device.
</p>

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white" />
  <img alt="PWA" src="https://img.shields.io/badge/PWA-installable-5a0fc8?logo=pwa&logoColor=white" />
  <img alt="Local-first" src="https://img.shields.io/badge/data-local--first-ff7a1a" />
  <img alt="Tests" src="https://img.shields.io/badge/core%20tests-76%20passing-3fae6b" />
</p>

---

## What is Forja?

**Forja** ("forge" in Portuguese) is a workout tracker built around one principle borrowed from the project that inspired it:

> **The log is what happened. The next prescription is *derived* from your history every single time — never a counter saved somewhere.**

Every logged set carries a snapshot of the *target* that was in effect at the time, so your sessions can be judged honestly (hit / miss) even if you change the progression policy later. No lock-in, no cloud, no account: everything lives in your browser's IndexedDB, works offline, and can be exported to a single JSON file whenever you want.

It's a clean-room TypeScript reimplementation inspired by openGym — none of openGym's (AGPL) code is used.

## Features

| Area | What you get |
| --- | --- |
| **Plan** | Weekly plan (weekday → routine), per-date overrides to reschedule a day without touching the plan |
| **Routines** | Full CRUD, grouped by category, per-exercise config (sets, target reps/time, rest, progression policy, increment) |
| **Exercise library** | Searchable + filterable by muscle group and equipment, 36 seeded exercises, add your own custom ones |
| **Guided workout** | Knows today's routine, **pre-fills loads from the progression engine**, set-by-set logging, rest timer, screen wake-lock, optional RIR effort |
| **Progression engine** | `off` · `linear` · Greyskull LP · double progression · time — with automatic deload on stalls. Pure & unit-tested |
| **Honest history** | Every workout stored with its target snapshot → hit/miss reading per exercise |
| **Insights** | GitHub-style activity heatmap, muscle map shaded by training volume, estimated 1RM PRs, total volume |
| **Bodyweight** | Log your weight and track it on a chart with a goal line |
| **Own your data** | One-click JSON export; import with replace or merge |
| **PWA** | Installable, offline-first, dark athletic UI |

## Architecture

Forja is a **pnpm monorepo** with a strict separation between pure domain logic and the UI.

```
┌──────────────────────────────────────────────┐
│  apps/web  (React 19 + Vite PWA)             │
│   • reads  → Dexie via useLiveQuery          │
│   • writes → src/db/repo.ts                  │
│   • active session (ephemeral) → Zustand     │
│   • persistence → IndexedDB (Dexie)          │
└───────────────┬──────────────────────────────┘
                │ imports training rules from
                ▼
┌──────────────────────────────────────────────┐
│  packages/core  (@forja/core)                │
│   pure domain — no React, no Node, no I/O     │
│   types · date · streak · onerm · history ·   │
│   progression · schedule   (Vitest, 76 tests) │
└──────────────────────────────────────────────┘
```

- **`@forja/core`** is the single source of truth for every training rule. It's framework-free and fully tested, so the guided workout, insights, and (one day) any other client all compute the same way.
- **`apps/web`** is local-first: reads are reactive (`dexie-react-hooks`), writes go through a typed repository, and the *active* workout is ephemeral device-local state in Zustand (persisted to `localStorage` so a reload mid-set doesn't lose anything).
- **No backend.** Data never leaves the device. Multi-device is handled by JSON export/import rather than a server.

### Tech stack

TypeScript (strict) · React 19 · Vite 6 · Dexie 4 (IndexedDB) · Zustand 5 · Framer Motion · lucide-react · React Router 7 · vite-plugin-pwa · Vitest · pnpm workspaces.

## Getting started

### Prerequisites

- **Node.js ≥ 20** (tested on 24)
- **pnpm** (`npm i -g pnpm`)

### Install & run

```bash
# install all workspaces
pnpm install

# start the web app (http://localhost:5173)
pnpm dev
```

Open the URL, and on first launch the database is seeded with 3 categories, default settings, and 36 exercises. Install it as a PWA from your browser for the full offline experience.

### Build for production

```bash
pnpm build          # builds @forja/core then apps/web
pnpm --filter @forja/web preview   # serve the production build locally
```

The build emits a service worker (offline cache) and code-split route chunks.

## Testing

The domain logic is covered by Vitest. The UI is validated through strict type-checking.

```bash
pnpm test           # run @forja/core unit tests (76 tests)
pnpm typecheck      # type-check every workspace (strict mode)
```

What the tests cover:

| Suite | Tests | Focus |
| --- | --- | --- |
| `progression.test.ts` | 31 | every policy, deload on stalls, rep-range parsing, fresh/no-history |
| `history.test.ts` | 24 | honest hit/miss reading, last-entry lookup, consecutive misses |
| `streak.test.ts` | 13 | streak math derived from log dates |
| `schedule.test.ts` | 8 | effective routine for a date (plan + overrides) |

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Run the web app in dev mode (Vite) |
| `pnpm build` | Build all packages (`-r`) |
| `pnpm test` | Run `@forja/core` unit tests |
| `pnpm typecheck` | Type-check every workspace |
| `pnpm seed` | Regenerate the seed JSON from the legacy plan (dev-only) |

## Project structure

```
forja/
├── packages/core/            # @forja/core — pure domain + tests
│   ├── src/
│   │   ├── types.ts          # Exercise, Routine, WorkoutLog, Prescription…
│   │   ├── progression.ts    # nextPrescription + policies + deload
│   │   ├── history.ts        # readSession (hit/miss), lastEntryFor…
│   │   ├── schedule.ts        # effectiveRoutine(date, plan, overrides)
│   │   ├── onerm.ts · streak.ts · date.ts
│   │   └── index.ts          # public barrel
│   └── test/                 # Vitest suites
└── apps/web/                 # @forja/web — React + Vite PWA
    ├── src/
    │   ├── db/               # Dexie schema (db.ts), repo.ts, seeds
    │   ├── store/session.ts  # Zustand active-workout store
    │   ├── pages/            # Home, Treinos, RotinaEditor, Exercicios,
    │   │                     #   TreinoGuiado, Historico, Progresso, Perfil
    │   ├── components/       # BottomNav, Heatmap, MuscleMap…
    │   ├── lib/              # stats, backup, labels, useWakeLock…
    │   └── styles/           # design tokens (theme.css) + global + per-feature
    └── public/               # icons, logo, PWA manifest assets
```

## The progression engine

Pick a policy per exercise in the routine editor; the guided workout pre-fills each set and explains *why* in plain language.

- **`off`** — repeats the last target (manual mode).
- **`linear`** — hit every target set → add the increment; otherwise hold. Deloads ~10% after 3 consecutive stalls.
- **Greyskull LP** — last set is AMRAP; blow past the target → double increment, hit → increment, miss → immediate ~10% deload.
- **Double progression** — climb reps to the top of the range in all sets, then add load and drop back to the bottom.
- **`time`** — progresses a duration target (planks, cardio) instead of load.

Loads are never stored as a running counter — they're recalculated from your logged history on every visit.

## Privacy & your data

Forja is **local-first by design**. Your training data is stored only in your browser (IndexedDB) and never sent anywhere. Use **Profile → Your data** to export a full backup as JSON, or import one from another device (replace or merge).

## Roadmap

- [x] **Phase 1 — Core training:** library, routines, weekly plan, guided workout, history, bodyweight
- [x] **Phase 2 — Progression engine:** policies, deload, honest session reading, 1RM
- [x] **Phase 3 — Insights:** activity heatmap, muscle map, stats & PRs, effort (RIR)
- [x] **Phase 4 — Own your data:** JSON export/import
- [ ] *Multi-device sync + passkeys* — intentionally out of scope (would require a backend; stays local-first)
- [ ] **Phase 5 — Extras:** supersets, plan sharing, push reminders, Capacitor mobile app
- [ ] **Phase 6 — AI Coach (opt-in):** designs the plan and reviews it from what you log

## Credits & license

Inspired by **openGym** — reimplemented from scratch in TypeScript (no AGPL code reused). Planned MIT data assets: `hasaneyldrm/exercises-dataset` (exercise library) and `melihcolpan/MuscleMap` (muscle paths); the current muscle map is a custom stylized SVG.

License: TBD (personal project).

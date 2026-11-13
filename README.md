<p align="center">
  <img src="apps/web/public/logo.svg" alt="Forja" width="440" />
</p>

# Forja

A local-first strength training log. Build a routine, track your sets, and see what to try next and why. Training records live in your browser and can be exported as JSON.

## What you can do

- Start with a ready-made routine for home or gym, build your own, or import your history.
- Plan a recurring week, change an individual date, and start a routine on demand.
- Log weight, reps, timed sets, cardio and RIR in a guided session. Resume an interrupted workout or correct sets afterward.
- Choose linear, Greyskull, double, time-based or 5/3/1 progression. The history keeps the target used at the time of each session.
- Review workouts, activity, muscle coverage, estimated 1RM, effort, weight and body measurements.
- Share a plan or save it as a PDF through your browser. Import FitNotes, Strong and Hevy CSV files, or body weight from Apple Health XML.

The primary interface is in Brazilian Portuguese. English translation is in progress.

## Run locally

Requires Node.js 20+ and pnpm.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5577`. To build and preview the installable PWA:

```bash
pnpm build
pnpm --filter @forja/web preview
```

The production build generates a service worker. Use HTTPS when hosting the app on a device other than localhost. The catalog and training workflow are designed for offline use after the initial load. Exercise photos and GIFs are loaded from a CDN and may be unavailable offline.

## Backups and moving devices

In **Perfil → Seus dados**, export a JSON backup and keep a copy outside the browser. Your local records belong to the browser profile and the app's origin. A different host or browser starts with its own storage. Import the backup there to transfer your data.

Backup v2 includes body measurements. Restoring v1 preserves measurements already on the destination. Review the file and choose **Cancelar**, **Mesclar dados** or **Substituir dados**. A shared plan is a separate file containing routines, calendar and minimal exercise definitions.

## Development

- `packages/core` contains the pure training rules, history, schedule, PRs and plate calculations.
- `apps/web` contains the React PWA. Dexie stores local records in IndexedDB, and Zustand persists the active session.
- `pnpm test` runs the domain tests. `pnpm typecheck` checks the workspaces. `pnpm build` checks types and builds the PWA.
- See the [PRD](.specs/project/PRD.md), [SDD](.specs/codebase/ARCHITECTURE.md), [roadmap](.specs/project/ROADMAP.md) and [current state](.specs/project/STATE.md).

## Credits and licensing

Forja is a TypeScript reimplementation inspired by [openGym](https://github.com/alexpcosta/opengym). Exercise metadata and instructions come from [hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset). Photos and GIFs carry separate terms from Gym visual. The upstream permission does not transfer to other projects. The Forja source license is still to be decided. See [integrations](.specs/codebase/INTEGRATIONS.md) for the pinned dataset license.

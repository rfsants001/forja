# Forja

- Start with [current state](.specs/project/STATE.md), [roadmap](.specs/project/ROADMAP.md) and [PRD](.specs/project/PRD.md).
- The [SDD](.specs/codebase/ARCHITECTURE.md) describes the session, progression, IndexedDB and import invariants. Feature acceptance lives in `.specs/features/`.
- The reliability and UX changes are on `main` in `e93c859`. The [README](README.md) has real app screenshots with demo data, plus the setup and PWA instructions verified in `27310e1`.
- The local redesign uses a desktop sidebar, mobile bottom navigation, and sans-serif headings. The library includes a MuscleMap atlas, licensed offline demos, a personal equipment filter, and a keyboard-accessible exercise dialog. See [integrations and credits](.specs/codebase/INTEGRATIONS.md).
- The guided workout and Hevy imports preserve warm-ups in optional `warmupSets`. Keep progression, records and volume based on `sets`. The Progress page can show the last session separately.
- The latest UI uses a geometric F mark, an indigo palette, and shared native field styling in `apps/web/src/styles/forms.css`. Theme boot and live changes share `lib/appearance.ts`. The History filters sit above the list. Include new labels, validation messages and feedback from the forms in the next i18n pass.
- Treinos can delete one routine or all routines from a starter plan. Agenda cleanup and history name snapshots are atomic. Keep the confirmation and feedback messages in the PT/EN pass.
- Next resumable task: [P5-003 · PT/EN](.specs/features/i18n/spec.md). Dictionaries and some components already exist. Finish the Profile switch, translation coverage and language persistence using the existing implementation.
- Validate with `pnpm test`, `pnpm typecheck` and `pnpm build`. Record remaining real-device checks in STATE when updating implementation.
- Product planning in the vault is under `~/Documentos/planning-vault/projetos/forja/`.

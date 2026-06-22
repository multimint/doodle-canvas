# Doodle Canvas — working conventions

Frontend-only React + TypeScript + Firebase co-op drawing app. Vite + Vitest + Tailwind.
See `CONTEXT.md` for the domain glossary and `docs/adr/` for storage/architecture decisions.

## Data access (the most important rule)

- **Never import `firebase/firestore` or `firebase/database` from a component or a UI hook.**
  All Firestore/RTDB access lives in repository modules under `src/data/`
  (`canvases.ts`, `strokes.ts`, `collab.ts`, `access.ts`, `users.ts`) — plus the existing
  planner data modules `dashboard/planner/dayDoodle.ts` and `plannerLinks.ts`. `firebase/auth`
  may be used directly (it's not a data repository). `src/lib/firebase.ts` is the only SDK init.
- **Validate at the boundary; never `as`-cast a Firebase snapshot.** Parse raw snapshots through
  the zod schemas in `src/lib/schemas.ts` (`parseOrNull` / `parseStrokeList`) so malformed records
  are logged-and-dropped, not rendered. `src/lib/types.ts` stays the source of truth for the domain
  types; the schemas assert parity against it.
- Repositories return already-validated domain objects. React hooks are thin wrappers that hold
  state and own timing (throttle/debounce); they call repositories for I/O.

## Extend the seams, don't special-case

- New **tools** are entries in `features/canvas/tools/tools.ts` (the registry drives the toolbar,
  cursors, and FSM) — not new branches in `CanvasStage` or `strokeSerializer`.
- New **document kinds** are entries in `features/canvas/documents/registry.ts`; per-kind
  dimensions/background/camera flow from there (e.g. the camera takes its frame from the kind — see
  `useCamera`'s `frame`). Don't hardcode a new kind's size in camera/render code.
- New **stickers** are entries in the asset manifest (`assets/stickers/manifest.ts`).

## Structure & size

- Prefer small composable units. Treat **~400 lines** as a smell for a component, and **extract a
  hook before adding the Nth `useEffect`** to a component. `CanvasPage` delegates its data plane to
  `useCanvasSession`; the dashboard shares state via `DashboardContext` (no prop-drilling) — follow
  these patterns rather than threading large prop bags.
- Cross-cutting magic numbers live in `features/canvas/constants.ts` or the relevant registry, not
  inline. Shared interaction plumbing (e.g. pointer-capture drags) lives in `utils/` — see
  `utils/pointerDrag.ts`, `utils/strokeSize.ts` (`effectiveStrokeWidth`).
- `CanvasStage.tsx` is still oversized (~1300 lines). Its pointer FSM, render loop, and
  text-box editing lifecycle want extracting into hooks — but that change needs **browser
  verification** (the test suite doesn't cover its interactive behaviour), so do it interactively,
  not blind.

## Verification

- **Verification is `npm test` (Vitest) plus `npm run build` (tsc + Vite). No browser.**
  Pure logic (geometry, registries, schemas, calendar math) is unit-tested — add tests there when
  you touch it. `tsconfig` has `noUnusedLocals`/`noUnusedParameters`; keep imports clean.
- Note: `npm run lint` is currently broken (ESLint 9 needs an `eslint.config.js` that the repo
  doesn't have). The build's type-check is the gate until that config is added.

## Git

- Ask before `git push`. After committing, deploy.

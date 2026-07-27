# AGENTS.md

## Cursor Cloud specific instructions

MoonTV is a single-service **Next.js 14 (App Router) + TypeScript + Tailwind** web app for aggregated movie/TV search and playback. There is no separate backend; API routes live under `src/app/api`.

### Running (dev)

- Start dev server: `pnpm dev` (runs `gen:runtime` + `gen:manifest`, then `next dev -H 0.0.0.0` on port 3000).
- The app requires an admin password to log in. Set `PASSWORD` when starting, e.g. `PASSWORD=test1234 pnpm dev`. Without it, `/login` still loads but you cannot authenticate. `/` redirects (307) to `/login` until authenticated.
- Default storage is `localstorage` (no external DB needed). Redis/D1/Upstash are optional and only needed to test multi-account/sync/admin features (set `NEXT_PUBLIC_STORAGE_TYPE` + connection vars).

### Lint / test / build

- Lint: `pnpm lint` (uses `next lint`). Also `pnpm typecheck` for TS.
- Tests: `pnpm test` (jest). Note: there are currently **no test files**, so `jest` exits non-zero with "No tests found" — this is expected, not a failure.
- Build (production): `pnpm build`. Dev is preferred for local work.

### Gotchas

- Home page poster images come from Douban and require an optional image/douban proxy (`NEXT_PUBLIC_IMAGE_PROXY` / `NEXT_PUBLIC_DOUBAN_PROXY`); with defaults empty they may render as broken images. Search-result posters load directly from resource sites and work without a proxy. This is expected and not a setup bug.
- `pnpm install` ignores build scripts for `esbuild`, `sharp`, `unrs-resolver`, `workerd`. Dev, lint, and search work fine without approving them (`sharp` is unused because `images.unoptimized = true`).
- `config.json` (resource sites / categories) is read at startup via `scripts/convert-config.js` → `src/lib/runtime.ts`. Changing it requires a dev-server restart to regenerate.

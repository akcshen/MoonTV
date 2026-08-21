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

- Never run `pnpm build` while `pnpm dev` is running. Both write to `.next`, and the resulting cache corruption makes edge API routes fail at module load with `Cannot read properties of undefined (reading 'default')` — a 500 that looks like an application bug but is not. Stop the dev server, `rm -rf .next`, then build.
- Posters go through the built-in proxy at `/api/image-proxy` by default, so they render without any extra configuration. `NEXT_PUBLIC_IMAGE_PROXY` only overrides that prefix, and users can disable proxying entirely via the `enableImageProxy` localStorage flag. `NEXT_PUBLIC_DOUBAN_PROXY` is separate and only affects Douban list/category requests.
- `pnpm install` ignores build scripts for `esbuild`, `sharp`, `unrs-resolver`, `workerd`. Dev, lint, and search work fine without approving them.
- `config.json` (resource sites / categories) is read at startup via `scripts/convert-config.js` → `src/lib/runtime.ts`. Changing it requires a dev-server restart to regenerate.
- Some resource sites in `config.json` are dead or anti-scraped (e.g. `wwzy` now serves an HTML page instead of JSON, and the `dyttzy` HTML detail page returns a "Verify Yourself" challenge). Aggregation code must tolerate non-JSON responses and empty results per source rather than assuming every configured site works.
- The pre-commit hook regenerates `VERSION.txt` and `src/lib/version.ts`, so those two files conflict on almost every branch merge. Resolve by running `node scripts/generate-version.js` and then clearing the leftover conflict markers by hand — the script only rewrites the first `CURRENT_VERSION` occurrence.

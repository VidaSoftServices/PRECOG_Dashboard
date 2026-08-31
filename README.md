# PRECOG Dashboard

Human front end for PRECOG, a predictive-maintenance platform. See
`CLAUDE.md` for product/domain/architecture detail, `AGENTS.md` for
permanent repository rules, and `TASK_IMPLEMENTATION.md` for current status.

## Setup

```bash
npm install
cp .env.example .env.local   # set VITE_API_BASE_URL to your running VidaSoft.API instance
npm run dev                  # http://localhost:8432
```

Requires a running `VidaSoft.API` instance (see that repository's own
setup) at the URL configured in `.env.local`.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc --noEmit`) then production build |
| `npm run preview` | Preview a production build locally |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run lint` | ESLint (flat config, typescript-eslint) |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run gen:api` | Regenerate `src/api/schema.generated.ts` from the live OpenAPI contract at `VITE_API_BASE_URL` — never hand-edit that file |

## Notes

- The only environment variable this app reads is `VITE_API_BASE_URL`
  (`.env.local` is gitignored; `.env.example` documents the key with no
  real value).
- Sign-in uses the API's custom HMAC scheme; a session lives only in
  memory, so a page refresh always requires signing in again — this is a
  deliberate security property, not a bug.
- Accessibility/responsive verification and a Playwright-based
  mocked-browser pass are part of this project's own process, not a
  committed test suite — see `TASK_IMPLEMENTATION.md`'s test/verification
  matrix for current coverage.

# PRECOG Dashboard — Implementation Plan & Progress

Active tracker. `AGENTS.md` has the rules, `CLAUDE.md` has the reasoning —
this file has status. Update this file at every natural checkpoint; update
`CLAUDE.md` when implemented architecture or product behavior changes;
update `AGENTS.md` only when a permanent repository rule changes.

## Source documents read

| Source | Read completely | When | Controls | Conflicts found | Resolution |
|---|---|---|---|---|---|
| `http://localhost:5065/swagger/v1/swagger.json` (live) | Yes | This session, twice (once before the current decision approval, refreshed again after per explicit instruction — identical 9,670-line output both times, same 104 operations) | Exact routes, methods, params, request/response DTOs, operation IDs, security | — | `src/api/schema.generated.ts` regenerated from it both times via `npm run gen:api` |
| `C:\VS\API\VidaSoft.API\AGENTS.md` | Yes | This session | Backend agent rules, critical invariants, precedence order | — | Reflected in this repo's own `AGENTS.md` precedence section |
| `C:\VS\API\VidaSoft.API\CLAUDE.md` | Yes | This session | Backend product/domain reasoning, per-aggregation-level config, telemetry invariants, OpenAPI-as-product-contract standard | — | Reflected throughout this repo's `CLAUDE.md` |
| `C:\VS\API\VidaSoft.API\TASK_IMPLEMENTATION.md` | Yes (all 1,527 lines, all priorities/phases) | This session | Business reasoning and lifecycle behind every API operation — used for *why*, never as frontend code instructions per explicit rule | — | Cross-checked against live contract; used to write `CLAUDE.md`'s domain-concept sections |
| `C:\VS\API\DataAccess\Solution_Description\API_Integration_Guide.md` | Yes | This session (an earlier background research agent had also read it during the original assessment; read personally this session per the explicit "read completely yourself" instruction) | Narrative workflow companion to the OpenAPI doc | **Yes — two discrepancies** (below) | Live contract + verified source wins; discrepancies recorded, not silently resolved |
| `C:\VS\API\DataAccess\Solution_Description\Database_Redesign_Change_Description.txt` | Yes | This session | Approved database/domain design, "superseded statements" list | — | Confirms this frontend's Device/Sensor/AggregationPolicy model matches the approved design exactly |
| `C:\VS\API\DataAccess\Solution_Description\Deployment_Runbook.md` | Yes | This session | Operational reference (config keys, health-check behavior, DevicePrincipal lifecycle summary, correlation-ID guidance) | — | Confirmed `SystemStatusPage.tsx`'s "no further Admin detail exists" claim is accurate (health endpoints return a fixed string by design, verified in the runbook's own container smoke test) |

**Note on the paths given for this review**: the instruction named
`C:\VS\API\AGENTS.md` and `C:\VS\API\CLAUDE.md` at the repository root.
Neither exists there — both live one directory deeper, at
`C:\VS\API\VidaSoft.API\AGENTS.md` and `C:\VS\API\VidaSoft.API\CLAUDE.md`
(the same location identified during the original assessment phase). Read
at the correct path; recorded here per the "do not substitute a same-named
file without checking the exact path" instruction, applied honestly to this
minor discrepancy too.

### Discrepancies found

| # | Where | Claim | Reality | Resolution |
|---|---|---|---|---|
| D-Ollama | `API_Integration_Guide.md` §10 + live OpenAPI operation description | Ollama job terminal-success status is `"Completed"` | Actual wire value, confirmed against `Enums.OllamaJobStatus` and `OllamaController.cs` source: `"Succeeded"` | `src/api/domainTypes.ts`'s `OllamaJobStatus` type and every consuming hook use `"Succeeded"`. Documented in `CLAUDE.md`. |
| D-ProblemDetails | `API_Integration_Guide.md` §11 | "Standard error responses use `ProblemDetails`" | No `ProblemDetails`/`IExceptionHandler` middleware exists in the running `Program.cs`; real error bodies are plain strings or ad-hoc objects, confirmed by direct source inspection | `src/api/errors.ts` normalizes all three real shapes, never assumes the documented one. Documented in `CLAUDE.md`. |

## Dependency-ordered phases

Status legend: **Not started** / **In progress** / **Implemented** /
**Verified** / **Blocked** / **Superseded**. A scaffolded phase is not
complete; a phase is complete only when integrated, reachable, verified,
and no obsolete competing implementation remains active.

- [x] **Phase 1: Current partial scaffold review and recovery** — **Verified**
  Objective: restore a buildable app from the paused mid-scaffold state.
  Modules: `src/main.tsx`, `src/App.tsx`, `src/app/router.tsx`,
  `src/app/AppShell.tsx`. Acceptance: `npm run build` succeeds. Status: done
  — build succeeds, code-split (see verification matrix).

- [x] **Phase 2: Strict TypeScript foundation** — **Verified**
  `tsconfig.json` strict + `noUncheckedIndexedAccess` +
  `noImplicitOverride` + `noFallthroughCasesInSwitch` + `noUnusedLocals` +
  `noUnusedParameters`; `allowJs` removed once old `.jsx` files were
  deleted (Phase 27). TypeScript pinned to `5.9.3` — the registry's
  `latest` tag resolved to TS 7 (new native-compiler major), too
  bleeding-edge for the current tool ecosystem (`openapi-typescript`
  itself declares a `^5.x` peer). Acceptance: `npm run typecheck` clean.
  Verified.

- [x] **Phase 3: Live OpenAPI refresh and typed API client** — **Verified**
  OpenAPI operations: all ~40 this frontend consumes. Modules:
  `src/api/{client,errors,domainTypes,authHeaderPatch,queryClient,queryKeys}.ts`,
  `src/api/hooks/*` (13 files). Acceptance: `npm run gen:api` succeeds
  against the live contract; every hook typechecks with zero `any`.
  Verified both at initial build and after the mid-session live-contract
  refresh (identical output).

- [x] **Phase 4: Authentication and session management** — **Verified**
  `src/auth/{authStore,AuthContext,RequireAuth,RequireAdmin}.tsx`.
  Acceptance: login screen renders and validates client-side (verified in
  browser, §Runtime); 401-anywhere clears session (component-tested,
  §Test matrix).

- [x] **Phase 5: Fluent UI themes and responsive shell** — **Verified**
  `src/theme/*`, `src/app/AppShell.tsx`. Acceptance: light/dark/system
  theme switch, NavDrawer responsive at all three breakpoints. Theme
  switching mechanism code-verified; not clicked through in a live browser
  session (no authenticated screen was reachable — theme toggle lives in
  `AppShell`, not the public login page).

- [x] **Phase 6: Router and authorization guards** — **Verified**
  18 routes (see route/API coverage matrix), every one below `/login`
  lazy-loaded. `RequireAuth`/`RequireAdmin` component-tested.

- [x] **Phase 7: Shared request states, forms, dialogs, and errors** — **Implemented**
  `LoadingState`, `EmptyState`, `ErrorState`, `NotAuthorizedState`,
  `DateTimeField`, `PageHeader`, `StatusPill` family, plus `ConfirmDialog`
  and `MoveToCanonicalDialog` (added this checkpoint — see correction item
  2 below). Used consistently across all 19 pages; 17 of them
  mocked-browser-verified this checkpoint (see Phase 22/23 and the
  methodology section below).

- [x] **Phase 8: Company, Reader grants, and Device administration** — **Implemented**
  `DeviceListPage`, `DeviceDetailPage`, `ReadersPage`,
  `AdminSettingsPage` (Locations/DeviceGroups/DeviceClasses). All CRUD
  hooks in `src/api/hooks/{devices,company,referenceData}.ts`.

- [x] **Phase 9: DevicePrincipal administration** — **Implemented**
  `DevicePrincipalPage.tsx` — provision/rotate/revoke/enable, one-time
  Secret dialog. Security requirement (never persisted) code-reviewed
  against `AGENTS.md`'s rule.

- [x] **Phase 10: Sensors, aggregation policies, and setpoints** — **Implemented**
  Sensors + AggregationPolicies + Setpoints all live on
  `SensorPoliciesPage.tsx`. Setpoints section added this checkpoint:
  direction-aware form (symmetric `target`/`tolerance` for
  lowerisbetter/higherisbetter, `targetAbove/Below` +
  `toleranceAbove/Below` for bidirectional), append-only history table,
  and the effective-setpoint-at-now `MessageBar`. `npm run typecheck`/
  `lint`/`test`/`build` all re-verified green after this addition.

- [x] **Phase 11: Telemetry ingestion and bounded exploration** — **Implemented (reads only, by design)**
  All four families' trailing/period-range/date-range/last-period reads
  implemented and normalized. Ingestion is correctly out of scope — a
  DevicePrincipal (machine) concern, not a human dashboard feature, per
  `AGENTS.md`'s explicit rule.

- [x] **Phase 12: Live Monitoring** — **Implemented**
  `LiveMonitoringPage.tsx` — see `CLAUDE.md` for full behavior.

- [x] **Phase 13: Smart Analytics** — **Implemented**
  `SmartAnalyticsPage.tsx`, both modes.

- [x] **Phase 14: Same-Device Sensor comparison** — **Implemented**
  Part of Smart Analytics' single-Device mode, up to 4 Sensors.

- [x] **Phase 15: Two-Device comparison** — **Implemented**
  Part of Smart Analytics' compare mode, compatibility-gated.

- [x] **Phase 16: Canonical Issues and member history** — **Implemented**
  All five grouping operations now have UI: **Group** — Admin-only
  multi-select mode on `IssueListPage.tsx` (checkbox selection → a
  `ConfirmDialog`-based dialog to pick which selected Issue becomes
  canonical); **Ungroup** — button on `IssueDetailPage.tsx`; **Move-Group**
  and **Reassign-Canonical** — per-member actions ("Move to another group" /
  "Make canonical") on `IssueDetailPage.tsx`'s Group card via the
  `GroupMemberRow` component, Admin-only. "Move to another group" no longer
  uses `window.prompt` — re-checked the live OpenAPI contract and confirmed
  `Issue_GetIssues` with the current Device + `includeMembers=false`
  (default) returns exactly the canonical-only candidate set a valid
  Move-Group target must be drawn from, so `MoveToCanonicalDialog.tsx` now
  drives a bounded, searchable Fluent `Combobox` populated from that query,
  excluding the member's own id and its current canonical id, with the
  Move button disabled until a real selection is made. `npm run
  typecheck`/`lint`/`test`/`build` all re-verified green.

- [x] **Phase 17: Review-state and category workflows** — **Implemented**
  `IssueDetailPage.tsx` — review buttons, category assignment, category
  suggestion request/accept/reject.

- [x] **Phase 18: Knowledge sharing** — **Implemented**
  `KnowledgeSharingPage.tsx` — draft, compatibility, coverage-gated
  approve, issue selection, revoke.

- [~] **Phase 19: TrainingRequests and ModelVersion presentation** — **Implemented as far as the API allows**
  Training list + manual trigger + status polling implemented.
  ModelVersion history is a documented backend gap (no list/detail
  endpoint) — the page states this explicitly instead of fabricating rows.

- [x] **Phase 20: Model query and similar canonical Issues** — **Implemented**
  `ModelQueryPage.tsx` — deliberately not auto-polled (rate-limited,
  CPU-bound), ranked results labeled as similarity, never probability.

- [x] **Phase 21: Ollama jobs** — **Implemented as far as the API allows**
  Submit-from-Issue, by-id lookup/poll/cancel. No list endpoint exists —
  stated in-page rather than faked.

- [x] **Phase 22: Responsive and mobile completion** — **Verified**
  Actually opened in a real Chromium browser (Playwright, network-mocked
  backend — see "Mocked-browser verification methodology" below), not just
  reasoned through: every one of 17 authenticated routes plus `/login`,
  reached via real in-app navigation (NavDrawer clicks, row clicks — not
  `page.goto()`, which would hard-reload and immediately lose the
  intentionally memory-only session), checked at 4 representative widths
  (1920×1080, 1366×800, 834×1112, 390×844) for `document.documentElement`
  horizontal overflow. **Result: 0 overflow failures across all
  17-page × 4-viewport combinations checked** (Overview, Devices, Device
  detail, DevicePrincipal admin, Sensor policies, Live Monitoring, Smart
  Analytics, Issues, Categories, Knowledge Sharing, Training (+ deep-linked
  variant), Model query, Ollama Jobs, Readers, Company Settings, System
  Status, Login). No table/toolbar/dialog was found overflowing at any
  checked width. Two real bugs were found and fixed along the way (not from
  overflow, but from console warnings surfaced during this pass): an
  invalid `<li>`-inside-`<li>` breadcrumb-divider nesting in `AppShell.tsx`
  (Fluent's `BreadcrumbDivider` renders its own `<li>` and must be a
  sibling of `BreadcrumbItem`, never nested inside one — only visible once
  a 2+-segment route was actually opened) and a `setState`-during-render
  violation in `LiveMonitoringPage.tsx` (default-device selection moved
  into a `useEffect`).

- [x] **Phase 23: Accessibility review** — **Verified (scoped, not exhaustive — see caveats)**
  Automated audit via `@axe-core/playwright` (added as a devDependency,
  explicitly authorized), run against the same Chromium/mocked-backend
  session as Phase 22, on: Login (unauthenticated), Overview/shell,
  Devices, Device detail, DevicePrincipal admin (including the Secret
  reveal dialog opened), Sensor policies, Live Monitoring, Smart Analytics,
  Issues, Issue detail, Categories, Knowledge Sharing, Training (×2),
  Model query, Ollama Jobs, Readers, Company Settings, System Status — 18
  checks in total. **Concrete issues found and fixed:**
  - **Missing `<h1>` on every page** (`page-has-heading-one`, moderate) —
    Fluent's `Title2`/`Title1` control visual size only; semantic heading
    level needs the `as` prop. Fixed via `PageHeader.tsx` (`as="h1"` by
    default, new `level="h2"` prop for `DeviceDetailPage.tsx`'s second,
    sub-section `PageHeader` so that page doesn't end up with two `<h1>`s)
    and `LoginPage.tsx`.
  - **Unlabeled `<Select>` device/sensor pickers** (`select-name`,
    critical) — 11 toolbar-level filter `Select`s across Overview, Live
    Monitoring, Smart Analytics (×4), Issues (×2), Knowledge Sharing (×2),
    Training had a visible adjacent `Text` label that was never
    programmatically associated. Fixed with an explicit `aria-label` on
    each.
  - **Unlabeled category-enabled `Switch`** (`label`, critical) on
    `CategoriesPage.tsx` — fixed with `aria-label={`${categoryName}
    enabled`}`.
  - **Unlabeled `react-datepicker` inputs on Smart Analytics** (`label`,
    critical, 2 nodes) — `DateTimeField.tsx`'s Fluent `Field` can't
    auto-wire its label to a non-Fluent child; added an explicit
    `aria-label` on the underlying `DatePicker`, but this was **not
    confirmed fixed** — the axe check on this specific control needs
    re-verification in a follow-up pass (see caveats below).
  **Findings investigated and determined NOT to be real app defects:**
  - `landmark-one-main` (a `<main>` genuinely exists exactly once, confirmed
    by direct DOM query) and `page-has-heading-one` both intermittently
    false-positived when axe ran immediately after several rapid
    `setViewportSize` calls in the same Playwright session, even though a
    single-viewport, freshly-loaded check of the same page showed 0
    violations for both. Reordered the verification script (axe first,
    resize after) once this was understood; not an app bug.
  - `aria-hidden-focus` (serious) still fires on every authenticated page,
    targeting `<i data-tabster-dummy="..." aria-hidden="true"
    tabindex="0">` elements. These are Tabster's own internal focus-sentinel
    nodes (1px, `position:fixed`, `opacity:0.001`, `z-index:-1`) that Fluent
    UI v9 uses internally for `NavDrawer`'s and `Toolbar`'s keyboard-arrow
    "Mover"/"Groupper" behavior — a known axe-core/Tabster interaction, not
    something fixable in this app's own code without removing real keyboard
    navigation features to satisfy an automated linter.
  **Caveats, stated plainly**: this is a scoped automated pass on 18 states
  of the app, not exhaustive coverage of every dialog/interaction state,
  and **does not claim WCAG conformance** at any level. Not covered this
  pass: `axe-core`'s ruleset does not catch every WCAG failure mode (color
  contrast in custom-drawn chart elements, meaningful reading order,
  correct heading hierarchy beyond "has an h1", or anything requiring
  actual assistive-technology testing). The Smart Analytics date-input
  `aria-label` fix is unverified. Manual keyboard/screen-reader testing was
  not performed.

- [x] **Phase 24: Performance and bundle optimization** — **Verified**
  Bounded fetches, cancellation, centralized polling, code-splitting all
  implemented and verified in the build output. `vendor_fluent` chunk is
  ~665 kB (over the 500 kB warning threshold) — a known Fluent UI v9
  characteristic, not further split this pass.

- [x] **Phase 25: Tests** — **Verified**
  **84/84 tests passing across 13 files** (up from 31/5) — added this
  checkpoint: `api/hooks/ollama.test.ts` and `api/hooks/training.test.ts`
  (polling-interval predicates, extracted as named exports specifically so
  the "stop polling at the real terminal status" behavior is directly
  unit-testable — confirms polling continues through `Queued`/`Processing`
  and correctly stops at `Succeeded`/`Failed`/`Cancelled`, never mistaking
  the documented-but-wrong `"Completed"` for terminal), `api/queryClient.test.ts`
  (retry policy incl. 429 Retry-After honoring, and that the global toast
  handler fires only for network failures and 429s, never for
  400/401/403/404/409 — those stay inline to avoid duplicated feedback),
  `auth/RequireAdmin.test.tsx` (Admin sees Admin-only route content, Reader
  gets the in-page not-authorized state), `components/ConfirmDialog.test.tsx`
  (dialog role, confirm/cancel callbacks, Escape-to-cancel, busy disables
  both buttons, `confirmDisabled` disables only confirm, focus moves into
  the dialog on open), `components/MoveToCanonicalDialog.test.tsx`
  (`filterCandidates` pure-logic tests: excludes the member Issue and its
  current canonical, filters by number/label, case-insensitive, empty on no
  match — plus one render-level smoke test), `pages/training/TrainingPage.test.tsx`
  (the correction-item-1 assertion: Admin sees "Request retraining", Reader
  does not), and `api/contract.test.ts` (see below). A real bug was caught
  by the TypeScript compiler while wiring one of these tests:
  `TrainingPage.tsx` had assumed `Training_CreateTrainingRequest`'s response
  body carried `status`/`triggerReasons` fields to distinguish a
  "coalesced" toast message from a "new request" one — the schema actually
  declares this operation's 202 response as `content?: never` (no body at
  all); the toast was corrected to a single generic "Retraining requested"
  message rather than fabricating a distinction the API doesn't report.
  **Test-infrastructure fixes made to get here** (see `vite.config.ts` and
  `src/test/setup.ts`): (1) `openapi-fetch`'s `createClient` captures
  `globalThis.fetch` as a default parameter at first import of
  `src/api/client.ts` — a per-test `vi.stubGlobal('fetch', ...)` inside an
  `it()` body is too late to matter and was silently a no-op in the
  pre-existing `RequireAuth.test.tsx` (undetected because that test's
  assertions never depended on the mocked response resolving). Fixed by
  installing one stable, reconfigurable mock in `setup.ts`
  (`src/test/mockFetch.ts` provides `mockFetchJson`/`mockFetchJsonAlways`/
  `mockFetchRoutes` on top of it). (2) Rendering a real Fluent component
  deeper than a bare `<div>` (any `Dialog`, `DataGrid`, positioned surface)
  failed at import time with `Named export 'createTabster' not found` under
  Vitest's `threads` pool; fixed by switching to the `vmThreads` pool plus
  `test.deps.optimizer.client`/`test.server.deps.inline` — confirmed the
  whole suite still passes under it, so it does not reintroduce the
  jsdom/CJS issue that `threads` was originally chosen to avoid. (3) jsdom
  implements neither `ResizeObserver` nor `IntersectionObserver`, which
  Fluent's `MessageBar` reflow and positioned surfaces use unconditionally;
  fixed with no-op polyfills in `setup.ts`. (4) Even after those fixes,
  driving a Fluent `Combobox` open/select interaction (not just rendering
  it) still hangs indefinitely in jsdom — confirmed reproducible in
  isolation, most likely `@fluentui/react-positioning`'s `floating-ui`
  `autoUpdate` looping against jsdom's always-zero layout measurements.
  `MoveToCanonicalDialog.test.tsx` works around this by testing the
  extracted `filterCandidates` logic directly rather than driving the
  popup open in jsdom (the real popup interaction — reaching the same
  Combobox from `IssueDetailPage` — was instead exercised in a real browser
  during Phase 22/23's Playwright pass, which does not have this
  limitation). New **lightweight OpenAPI contract-quality test**
  (`api/contract.test.ts`, 12 checks) added per the explicit
  requirement — reads the already-generated `schema.generated.ts` as text
  (no live API call, so it runs as an ordinary unit test): every path this
  app's hooks actually call (extracted by scanning `src/api/hooks/*.ts` and
  `AuthContext.tsx`) still exists as a schema key; all four telemetry
  ingestion batch-item DTOs (`SignalInputData`, `BiSignalInputData`,
  `CurveInputData`, `BiCurveInputData`) still require `sensorId` per item,
  never as a query parameter; the Authentication/DevicePrincipal/Review/
  canonical-grouping/category/knowledge-sharing/Training/ModelQuery
  operation groups still exist; `OllamaJobDto.status` is still typed as an
  open string (not narrowed in a way that would silently paper over the
  documented Succeeded/Completed discrepancy).

- [x] **Phase 26: Lint, type-check, build, and runtime verification** — **Verified**
  See the verification matrix below — all green except the honest
  authenticated-app browser-verification gap.

- [x] **Phase 27: Remove superseded JavaScript and old architecture** — **Verified**
  42 files deleted, confirmed via `git status`. See dead-code log below.

- [x] **Phase 28: Final documentation and report** — **Verified**
  This file, `CLAUDE.md`, and `AGENTS.md` written initially, then corrected
  this checkpoint against the 11-item gap list (Reader read-only, native
  dialogs replaced, toast system, responsive/accessibility verification,
  expanded tests, contract test, runtime verification, doc consistency —
  see "Correction checkpoint" below). Still exactly three Markdown files.

## Correction checkpoint (post-review gap list)

After the initial rewrite was reviewed, 11 concrete gaps were raised and
addressed in this pass — recorded here rather than as a new file:

1. **Reader was not strictly read-only for manual training.** The backend's
   `Training_CreateTrainingRequest` only checks Device access, not
   `IsCompanyAdmin`, so a Reader's request would have actually succeeded
   against the real API even though the product rule is Reader-read-only.
   Fixed: the "Request retraining" button is now rendered only for
   `isAdmin` in `TrainingPage.tsx`, with an explicit code comment recording
   this as a deliberate frontend restriction stricter than the backend, not
   a bug to "fix" by loosening it. Backend gap retained in the log below,
   not silently dropped. Route/authorization matrices and this file
   corrected to match; `TrainingPage.test.tsx` added asserting both sides.
2. **Native `window.prompt`/`confirm`/`alert` removed everywhere.** Two
   call sites existed: Move-Group's target-id prompt (see Phase 16 above)
   and `SensorPoliciesPage.tsx`'s raw-policy retraining confirmation (now a
   destructive `ConfirmDialog`). A repo-wide grep after all changes
   confirms zero remaining `window.(prompt|confirm|alert)` calls outside
   comments referencing the old behavior.
3. **Centralized Fluent Toast system implemented.** `ToastProvider.tsx`
   (`AppToastProvider`/`useAppToast`) plus a module-level `toastBridge.ts`
   bridge (same pattern as `authStore.ts`) so the module-singleton
   `queryClient` can also surface toasts for cross-cutting failures without
   needing React context. Wired into every mutation across every page for
   success/failure feedback (device/sensor/policy/setpoint changes,
   DevicePrincipal lifecycle, category/knowledge-sharing/training/Ollama
   events) without duplicating the existing inline `ErrorState`/field-level
   validation — a toast never repeats what's already shown inline.
   Never contains a token, Secret, credential, raw response body, or
   unfiltered Ollama output. `queryClient.ts`'s global handler toasts only
   for network failures (status 0) and 429s (with the `Retry-After` wait
   time); 401/403/404/409 stay inline by design. Desktop browser
   notifications remain a future enhancement, not built this pass.
4. **Responsive verification completed for real** — see Phase 22 above.
5. **Accessibility verification completed for real** — see Phase 23 above.
6. **Automated tests expanded** — see Phase 25 above.
7. **OpenAPI contract-quality test added** — see Phase 25 above
   (`api/contract.test.ts`).
8. **Runtime verification, no credentials** — see the "Mocked-browser
   verification methodology" section below, and the authenticated
   click-through checklist at the end of this file.
9. **Documentation consistency** — this file's route/authorization
   matrices, decision log, dead-code log, and test/verification matrix
   updated to match items 1–8; `CLAUDE.md` and `AGENTS.md` updated for the
   same corrections (toast system, Reader restriction, dialog replacement).
10. **Backend gaps list retained unchanged** — see the table below; no
    frontend data was invented to paper over any of them.
11. **Final verification re-run** — typecheck/lint/tests/build all green
    after every change in this checkpoint (see the test/verification matrix
    below for exact numbers).

## Mocked-browser verification methodology

Item 8's constraint is exact: *"create no fake bypass and embed no test
credentials"* for authenticated routes, while still needing real
responsive/accessibility verification beyond what jsdom-based Vitest tests
can reliably do (confirmed during Phase 25 — Fluent's positioned surfaces
depend on real layout and `ResizeObserver`, which jsdom doesn't implement,
and even after polyfilling, driving a Combobox open hangs indefinitely in
jsdom). The approach taken: drive the **real, unmodified app** — the real
login form, the real `RequireAuth`/`RequireAdmin` guards, real React
Query + Fluent UI rendering — in a **real Chromium browser** (Playwright),
with only the network layer intercepted: every request to
`http://localhost:5065/api/**` (never `src/api/*.ts`'s dev-server module
URLs — an early version of the script's `**/api/**` glob accidentally
matched those too, breaking the whole app shell, before being scoped to
the real backend origin) is fulfilled with realistic fixture data shaped
per the OpenAPI contract, instead of hitting the live API. This is
**not** a code bypass (the app's actual auth code path executes exactly as
it would against the real API) and **not** real-or-fake credentials
against the live system (nothing ever reaches `localhost:5065`). The
literal strings `'admin'`/`'password'` typed into the login form are
opaque to a mocked `Request_HMAC_Key` endpoint that accepts anything and
returns a fixed mock token — no real credential exists anywhere in the
script or this repository.

One design point worth recording because it was initially gotten wrong and
produced entirely invalid first-pass results: `authStore.ts` deliberately
keeps the session token only in an in-memory JS variable, never
localStorage/cookies (a real, intentional security property — "a page
refresh always requires re-authentication"). `page.goto()` to a new URL is
a **hard reload** that wipes that in-memory state, so every route after
the first one was silently bouncing back to `/login` and re-testing the
login page under a different name. Fixed by navigating via real in-app
clicks (NavDrawer items, row clicks) exactly as a user would, exercising
React Router's actual client-side routing, and by only resizing the
viewport (never re-navigating) between the 4 viewport checks on an
already-loaded page.

This is labeled a third, distinct verification tier — **mocked-browser-verified**
— separate from both "code-reviewed" and a genuine "live-credential
browser-verified" pass, which this was not and does not claim to be. It
does not exercise real backend business logic, real error responses beyond
the ones fixtured, or any workflow gated behind data this session couldn't
predict in advance (e.g., a specific validation failure shape).

## Old dashboard replacement matrix

| Old | Original purpose | Idea retained | Obsolete assumption | New route/component | OpenAPI ops | Admin/Reader | Status | Verified | Old code removed |
|---|---|---|---|---|---|---|---|---|---|
| `components/Login.jsx` | Username/password sign-in | Yes | Held plaintext password resident for a silent refresh loop | `pages/LoginPage.tsx` | `Authentication_RequestHMAC` | Public | Implemented | Mocked-browser-verified | Yes |
| `components/DeviceList.jsx` | List + add/edit/delete Device | Yes (list, filter, edit) | Direction/Lookback/Scale/MinIssueScore at Device level; client-chosen numeric Device id; hard delete | `pages/devices/DeviceListPage.tsx` + `DeviceDetailPage.tsx` | `Devices_GetDevices/GetDevice/CreateDevice/UpdateDevice` | Admin write, Reader read | Implemented | Mocked-browser-verified (list, detail, responsive+a11y) | Yes |
| (Device form, embedded in DeviceList) | Add/edit Device fields | Mode selection | Same as above | `DeviceDetailPage.tsx` edit panel | `Devices_CreateDevice/UpdateDevice` | Admin | Implemented | Typecheck+build only (dialog not opened this pass) | Yes |
| `components/IssueList.jsx` | List + review Issues | Icon-filter pattern, review flow | Flat `Confirmed`/`IsAnomaly`; no canonical grouping; no SensorId | `pages/issues/IssueListPage.tsx` + `IssueDetailPage.tsx` | `Issue_GetIssues/GetIssue/Review/AssignCategory` +5 more | Admin write, Reader read | Implemented (grouping actions partial, see Phase 16) | Mocked-browser-verified (list + detail, responsive+a11y) | Yes |
| `components/RealTimeChart.jsx` | Live-polling chart | Live-monitoring instinct, enlarge-to-modal | 5s poll regardless of tab visibility; no SensorId; guessed bidirectional from Device | `pages/monitoring/LiveMonitoringPage.tsx` + `components/charts/TelemetryChart.tsx` | `Continuous/BiDirectionalContinuous_GetMeasuredTrailingPeriods` | Admin+Reader | Implemented | Mocked-browser-verified (page reached, responsive+a11y; a real `setState`-during-render bug was found and fixed here — see Phase 22) | Yes |
| `components/DataChart.jsx` | Issue-period chart | — | Same field/SensorId issues as above | `IssueDetailPage.tsx`'s telemetry card | `*_GetPeriodRange` (4 families) | Admin+Reader | Implemented | Mocked-browser-verified (page reached; chart itself renders against empty fixtured telemetry, not exercised with real data) | Yes |
| `components/CompareChart.jsx` | 2–8 Device overlay | Multi-series overlay UX | Compared by display name only, no compatibility proof | `pages/analytics/SmartAnalyticsPage.tsx` (compare mode) | `KnowledgeSharing/Compatibility` + `*_GetMeasuredDateRange` | Admin+Reader | Implemented | Mocked-browser-verified (page reached, responsive+a11y; a real missing-label bug on its Sensor/Device selects was found and fixed) | Yes |
| Date/time picker (inline in Header) | Start/end selection | Second-granularity picker | Manual UTC-offset arithmetic | `components/DateTimeField.tsx` | n/a | n/a | Implemented | Mocked-browser-verified for render; a missing-label bug was found (fixed, not independently re-confirmed — see Phase 23 caveats) | Yes |
| Header's device/issue notifications | Desktop + toast alert on new unconfirmed Issue | Alerting instinct | `react-desktop-notification`/`react-toastify`, tied to old flat model | `components/ToastProvider.tsx` (`AppToastProvider`/`useAppToast`) + `toastBridge.ts` | n/a | n/a | Implemented (in-app toast; desktop notification is a future enhancement, not built) | Mocked-browser-verified (toast infra renders; individual mutation toasts code-reviewed) | Packages removed, replaced with centralized Fluent Toast |
| `?deviceId&issueId` URL params | Deep-link from notification | Deep-linking | Hand-parsed, no route behind it | `useNumberSearchParam` used throughout | n/a | n/a | Implemented | Typecheck+build only | Yes |
| Smart Analytics *(no old equivalent)* | — | — | — | `SmartAnalyticsPage.tsx` | `ModelQuery_Query`, telemetry reads, `KnowledgeSharing/*` | Admin+Reader | Implemented | Typecheck+build only | n/a — new |
| Hidden "secret button" test harness (`Header.jsx`) | Password-gated demo-data injection, `NoteHeartBeat` | None — dead against the new contract regardless | Entire feature | **Deleted, not migrated** | n/a | n/a | Removed | Confirmed absent from build | Yes |
| `TestController`/`ResetTestData` calls | Demo seeding | None | Backend controller is excluded from compilation | **Deleted, not migrated** | n/a | n/a | Removed | Confirmed absent | Yes |
| `NoteHeartBeat` call | Manual heartbeat ping | None | No such endpoint on the new API | **Removed, not replaced or inferred** | n/a | n/a | Removed | Confirmed absent | Yes |
| Old AdHoc-prediction references | None found in old dashboard source | — | — | n/a — old dashboard never called it | n/a | n/a | n/a | n/a | n/a |

## Route and API coverage matrix

| Route | Page | Purpose | Backend `TASK_IMPLEMENTATION.md` ref | OpenAPI ops | Admin/Reader | Device-grant | States | 401/403/404/409/429 | Cache invalidation | Polling | Status | Runtime-verified |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/login` | LoginPage | Sign in | §"Preserve custom HMAC" | `Authentication_RequestHMAC` | Public | n/a | loading, validation, error | 401 shown inline | n/a | n/a | Implemented | **Yes** |
| `/` | OverviewPage | Selected-Device KPI summary | §"Reusable eligible-set" (informed scoping) | `Devices_GetDevices/GetDevice`, `Issue_GetIssues`, `Training_GetTrainingRequests` | Both | Filtered | loading, empty | 401/404 | on nav | 30s (documented, not yet wired per-tile) | Implemented | **Yes (mocked)** |
| `/devices` | DeviceListPage | Device list + create | Priority 0/6 | `Devices_GetDevices/CreateDevice` | Admin write | Filtered | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/devices/:id` | DeviceDetailPage | Device detail/edit/disable | Priority 0 | `Devices_GetDevice/UpdateDevice`, `Sensors_GetSensors`, `Devices_GetPrincipal`, `Training_GetTrainingRequests` | Admin write | Yes | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/devices/:id/principal` | DevicePrincipalPage | DevicePrincipal lifecycle | Priority 3 | `Devices_GetPrincipal/ProvisionPrincipal/RotatePrincipalCredential/RevokePrincipalCredential/SetPrincipalEnabled` | Admin only | Yes | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked, incl. Secret reveal dialog opened)** |
| `/devices/:id/sensors/:sid/policies` | SensorPoliciesPage | Aggregation policy + setpoint edit | §4 (per-aggregation-level ownership), §8 (setpoints) | `Sensors_GetSensor`, `AggregationPolicies_GetPolicies/UpdatePolicy`, `Setpoints_GetSetpoints/GetEffectiveSetpoint/CreateSetpoint` | Admin write | Yes | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/devices/:id/model-query` | ModelQueryPage | Run/inspect model query | §11 (multi-Sensor query) | `ModelQuery_Query` | Both | Yes | loading, empty, error, 409 (incompatible) | all incl. 409 | manual only | none (deliberate) | Implemented | **Yes (mocked)** |
| `/monitoring` | LiveMonitoringPage | Live per-Sensor readings | §"Live/near-real-time" via `CLAUDE.md` | `Sensors_GetSensors`, `*_GetMeasuredTrailingPeriods` | Both | Yes | loading, empty, error, stale | all | n/a (read-only) | 15s, pauses on hidden tab | Implemented | **Yes (mocked)** |
| `/analytics` | SmartAnalyticsPage | Historical/comparison analysis | §7 knowledge-sharing compatibility | `Devices_GetDevices`, `Sensors_GetSensors`, `AggregationPolicies_GetPolicies`, `*_GetMeasuredDateRange`, `KnowledgeSharing_GetCompatibility`, `Issue_GetIssues` | Both | Yes | loading, empty, error, validation | all | on nav | none | Implemented | **Yes (mocked)** |
| `/issues` | IssueListPage | Canonical Issue list + Group creation | Priority 5/7 | `Issue_GetIssues`, `Issue_GroupIssues` | Admin write (grouping), Reader read | Yes | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/issues/:id` | IssueDetailPage | Review/category/group/telemetry/Ollama | Priority 5/7/8 | `Issue_GetIssue/Review/AssignCategory/UnconfirmIssue/GetIssueGroup/UngroupIssue/MoveGroupMember/ReassignCanonical`, `IssueCategories_GetCategories`, `IssueCategorySuggestion_*`, `*_GetPeriodRange`, `Ollama_SubmitSummaryJob/GetJob` | Admin write, Reader read | Yes | loading, empty, error | all | on mutate | Ollama job: 5s until terminal | Implemented | **Yes (mocked)** |
| `/categories` | CategoriesPage | Category catalog | Priority 8 Decision 1 | `IssueCategories_*` (5 ops) | Admin only | n/a | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/knowledge-sharing` | KnowledgeSharingPage | Manual knowledge sharing | Priority 8 Decision 2 | `KnowledgeSharing_*` (7 ops) | Admin only | n/a | loading, empty, error, 409 | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/training` | TrainingPage | Training requests + manual trigger | Priority 8 Decision 3/4/5 | `Training_GetTrainingRequests/CreateTrainingRequest` | Admin-only create (frontend rule, stricter than the backend — see correction item 1); Reader read | Yes | loading, empty, error | all | on mutate | 5s while active, stops at terminal | Implemented (ModelVersion gap documented) | **Yes (mocked)** |
| `/ollama-jobs` | OllamaJobsPage | Ollama job by-id lookup | §15 durable jobs | `Ollama_GetJob/CancelJob` | Both | Yes (job-access rule) | loading, empty, error, 409 (cancel-too-late) | all | on mutate | 5s while active, stops at terminal | Implemented | **Yes (mocked)** |
| `/admin/readers` | ReadersPage | Reader Device-grant admin | Priority 6 | `Company_GetReaders/GetReaderDeviceGrants/GrantReaderDevices/RevokeReaderDeviceGrant/GetReaderEffectiveAccess` | Admin only | n/a | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/admin/settings` | AdminSettingsPage | Locations/DeviceGroups/DeviceClasses | §"API coverage" (reference data) | `Locations_*`, `DeviceGroups_*`, `DeviceClasses_GetDeviceClasses` | Admin write, DeviceClasses read-only (no write ops exist) | n/a | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/status` | SystemStatusPage | Health liveness/readiness | Deployment Runbook §"health" | `/health/live`, `/health` (not OpenAPI ops — plain fetch) | Both | n/a | loading, error | n/a (unauthenticated endpoints) | n/a | 30s | Implemented | **Yes (mocked)** |
| `*` | NotFoundPage | Fallback | — | none | Both | n/a | n/a | n/a | n/a | n/a | Implemented | No |

## Authorization matrix

| Actor | Devices | Issues | Categories | Knowledge sharing | Training | Ollama | Admin pages | Notes |
|---|---|---|---|---|---|---|---|---|
| Unauthenticated | — | — | — | — | — | — | — | Redirected to `/login` by `RequireAuth` on every route |
| Admin | Full CRUD (no delete — disable only) | Full (review/category/group/move/reassign/ungroup, all wired) | Full CRUD | Full workflow | Full + manual trigger | Full | Full | |
| Reader with Device access | Read granted Devices only | Read granted-Device Issues only, no mutation controls rendered | Read only | Read own-Device-touching shares only (`useKnowledgeShares` filters server-side per backend rule) | Read only — no manual-trigger control rendered | Submit/poll/cancel own-Device-touching jobs | Hidden from nav entirely | Mutation controls absent, not disabled. **Training is a deliberate frontend restriction stricter than the backend** — `Training_CreateTrainingRequest` only checks Device access server-side, not `IsCompanyAdmin`, so a Reader's request would technically succeed against the real API; the product rule that Reader stays strictly read-only wins regardless (see correction item 1, and the backend gap log below) |
| Reader without Device access | 404 on direct access (existence not disclosed, matching backend pattern) | Same | n/a | n/a | n/a | n/a | Hidden | `NotAuthorizedState` rendered for a 403 or 404 alike |
| DevicePrincipal | n/a — this is a human-only dashboard, no DevicePrincipal login UI exists | n/a | n/a | n/a | n/a | n/a | n/a | Explicitly out of scope per `AGENTS.md` |

## Polling and cache matrix

| Query key prefix | Enabled when | Interval | Hidden-tab behavior | Stale time | Invalidation source | Cancellation | Stops at |
|---|---|---|---|---|---|---|---|
| `devices` | always (authenticated) | none | n/a | 15s default (`queryClient.ts`) | device create/update mutations | `signal` forwarded | n/a |
| `devices.principal` | deviceId defined | none | n/a | 15s default | provision/rotate/revoke/setEnabled mutations | `signal` forwarded | n/a |
| `telemetry.trailing` (Live Monitoring) | deviceId+sensorId defined, non-curve family | 15s (`liveCompactChart`) when `live=true` | paused via `usePageVisible` gating the effective `live` flag | 15s default | n/a (time-window query) | `signal` forwarded | toggled off manually |
| `telemetry.periodRange` / `telemetry.dateRange` (Analytics/Issue detail) | ids + range defined | none (one-shot) | n/a | 15s default | n/a | `signal` forwarded | n/a |
| `issues` | deviceId defined | none | n/a | 15s default | review/category/group mutations | `signal` forwarded | n/a |
| `training` | deviceId or requestId defined | 5s (`activeJob`) | paused automatically — TanStack Query's `refetchIntervalInBackground` defaults to `false`, so interval fetches only execute while `focusManager.isFocused()` (confirmed in `@tanstack/query-core`'s `queryObserver`) | 15s default | create-training mutation | `signal` forwarded | status ∈ {Completed, Failed, Cancelled} |
| `ollama` | jobId defined | 5s (`activeJob`) | same automatic pause | 15s default | submit/cancel mutations | `signal` forwarded | status ∈ {Succeeded, Failed, Cancelled} — **not** "Completed" |
| `health` | always (authenticated) | 30s | same automatic pause | n/a (`retry:false`) | n/a | plain `fetch`, no `apiClient` (unauthenticated endpoints) | n/a |
| everything else (categories, knowledgeSharing, company, referenceData) | relevant ids defined | none | n/a | 15s default | respective mutations | `signal` forwarded | n/a |

**Correction from an earlier draft of this table**: Training and Ollama
polling were initially flagged here as not pausing in a hidden tab. That
was wrong — verified directly against `@tanstack/query-core`'s installed
source (`queryObserver.cjs`): `refetchIntervalInBackground` defaults to
`false`, and the interval fetch only actually executes when
`focusManager.isFocused()` is true, for every query in this app (no hook
overrides that option). `LiveMonitoringPage`'s explicit `usePageVisible()`
check is not compensating for a library gap — it exists for a second
reason the library doesn't cover: driving the visible "Paused - tab not
visible" UI text and interacting with the manual live/paused toggle, not
just gating the fetch itself.

## Reusable-component inventory

| Component | Purpose | Used by |
|---|---|---|
| `AppShell` | Shell: NavDrawer, Toolbar, Breadcrumb, theme menu | every authenticated route |
| `PageHeader` | Title + description + actions row | all 17 authenticated pages |
| `LoadingState` / `EmptyState` / `ErrorState` / `NotAuthorizedState` | Request-state primitives | all data-fetching pages |
| `StatusPill` family (`FreshnessPill`, `ReviewStatePill`, `JobStatusPill`, `EnabledPill`) | Non-color-only status | Devices, Issues, Training, Ollama, DevicePrincipal pages |
| `DateTimeField` | Fluent-wrapped `react-datepicker` | SmartAnalyticsPage, (Header's old equivalent removed) |
| `TelemetryChart` | Single shared chart for all telemetry visualization | LiveMonitoringPage, SmartAnalyticsPage, IssueDetailPage |
| `useNumberSearchParam` | Typed URL search-param state | Overview, Devices, Issues, Monitoring, Analytics, Training, Ollama |
| `usePageVisible` | Page Visibility API hook | LiveMonitoringPage (Training/Ollama gap noted above) |
| `useBreakpoint`/`useMediaQuery` | Responsive breakpoint detection | AppShell, DeviceListPage |
| DataGrid + mobile-card pattern | Dense list responsive fallback | DeviceListPage (reference implementation; not yet replicated elsewhere) |
| One-time Secret dialog pattern | Secure credential reveal | DevicePrincipalPage |
| `activateProps` (`src/lib/useActivateProps.ts`) | Makes a non-native element (Card/div used as a click target) keyboard-operable — role, tabIndex, Enter/Space activation | DeviceListPage's mobile cards, OverviewPage's 3 clickable tiles, IssueDetailPage's member rows, ModelQueryPage's ranked-Issue rows |
| `ConfirmDialog` | Single reusable confirm/consequential-action dialog (normal/destructive, busy, confirmDisabled) — the only such dialog in the project, replacing every previous raw `window.confirm`/bespoke `Dialog` | SensorPoliciesPage (raw-policy retraining), CategoriesPage (New/Merge category), IssueListPage (Group creation), DevicePrincipalPage (Revoke credential), KnowledgeSharingPage (Revoke share), DeviceDetailPage (Disable Device), `MoveToCanonicalDialog` (built on top of it) |
| `MoveToCanonicalDialog` | Bounded, searchable Combobox picker for a Move-Group target, backed by `Issue_GetIssues` (canonical-only candidates for the Device), excluding the member itself and its current canonical | IssueDetailPage's `GroupMemberRow` |
| `AppToastProvider`/`useAppToast` + `toastBridge` | Centralized Fluent Toast layer; module-level bridge lets the singleton `queryClient` surface toasts too | Every page with a mutation (see the toast-wiring note in the correction checkpoint above) |

**Not yet built**: browser desktop notifications (explicitly a future
enhancement, not required this pass — in-app toast covers the "important
event feedback" requirement now).

**Accessibility fix applied this checkpoint**: an IDE diagnostic caught a
`<div onClick={...}>` navigation row (`IssueListPage.tsx`) with no keyboard
support — a real gap given this project's own "accessibility is mandatory,
not a follow-up pass" rule. Traced the same pattern to `OverviewPage.tsx`
(3 tiles), `IssueDetailPage.tsx` (member row), `ModelQueryPage.tsx` (ranked
row), and `DeviceListPage.tsx` (DataGrid row + mobile card) and fixed all of
them via the new shared `activateProps` helper (DataGrid's row got a
keyboard handler rather than a conflicting `role`, since Fluent's DataGrid
already provides its own grid-level ARIA semantics).

## Decision log

| # | Decision | Chosen option | Reason | Affected files | Approval |
|---|---|---|---|---|---|
| 1 | Server-state library | TanStack Query, sole | Matches the approved decision's explicit polling/cancellation/dedup requirements | `src/api/queryClient.ts`, every hook | Approved |
| 2 | HTTP transport | `openapi-fetch`, axios removed | One centralized typed transport, not two competing ones | `src/api/client.ts`, `package.json` | Approved |
| 3 | TypeScript migration strategy | Incremental via `allowJs` during the build, disabled once old files were deleted | Kept the repo buildable mid-rewrite without permanently allowing JS | `tsconfig.json` | Approved, now complete |
| 4 | Issue date-range filtering | Local filter over the bounded loaded result, explicitly labeled | No server-side param exists; avoids unbounded client requests | `SmartAnalyticsPage.tsx` | Approved |
| 5 | `NoteHeartBeat` | Removed, not replaced or inferred | No equivalent exists; inferring one risks fabricating a business meaning | `DeviceDetailPage.tsx`, `Header.jsx` (deleted) | Approved |
| 6 | ModelVersion page scope | Show only what TrainingRequestDto/ModelQueryResponse return; state the gap | No list/detail endpoint exists | `TrainingPage.tsx` | Approved |
| 7 | Date/time picker | Kept `react-datepicker`, wrapped in `DateTimeField` | Only picker with second-granularity time selection | `components/DateTimeField.tsx` | Approved |
| 8 | Live Monitoring mechanism | `MeasuredTrailingPeriods` with a small window | Confirmed adequate — bounded, not a large-range download | `LiveMonitoringPage.tsx` | Approved |
| 9 | Polling intervals | 10s/15s/30s/5s per type, centralized | Approved defaults, respects documented rate limits | `src/lib/pollIntervals.ts` | Approved |
| 10 | Overview KPI scope | Selected-Device, not Company-wide | No efficient aggregate endpoint; avoids N+1 fan-out | `OverviewPage.tsx` | Approved |
| 11 | Nav structure | Live Monitoring and Smart Analytics as separate top-level items | Different workflows (operational vs. historical) | `navConfig.ts` | Approved |
| 12 | Analytics presets | Deferred | Explicitly lower priority than the core workspace | — | Approved, deferred |
| 13 | Charting library | Kept chart.js/react-chartjs-2 | No missing capability identified that would justify a new dependency | `components/charts/TelemetryChart.tsx` | Approved |
| 14 | jsdom version | Pinned to `25.0.0` | Newer versions' `html-encoding-sniffer`→`@exodus/bytes` chain has a real upstream ESM/CJS bug, confirmed by trying `latest` first (30.0.1) and reproducing the failure | `package.json` | Not a design decision — a build-environment fix |
| 15 | `HMAC_Key` required-header typing | Type-only patch (`authHeaderPatch.ts`), never edit the generated file | The generated schema types it as a required call-site param even though middleware injects it centrally | `src/api/authHeaderPatch.ts`, `client.ts` | Not previously discussed — a necessary technical resolution, flagged here for visibility |
| 16 | Move-Group target selection | Bounded, searchable `Combobox` (`MoveToCanonicalDialog`), backed by `Issue_GetIssues` | Re-checked the live contract: `Issue_GetIssues` with the current Device + `includeMembers=false` (default) already returns exactly the canonical-only candidate set a valid target must be drawn from — no new endpoint was actually needed, correcting the earlier assumption that one was missing | `components/MoveToCanonicalDialog.tsx`, `IssueDetailPage.tsx`'s `GroupMemberRow` | Corrected this checkpoint (was `window.prompt`) — see correction item 2 |
| 17 | Training/Ollama hidden-tab polling | No extra code added | Verified directly against `@tanstack/query-core` source that `refetchIntervalInBackground` defaults to `false` — every interval query already pauses on window blur for free; adding `usePageVisible()` here would have been redundant, not a fix | `TASK_IMPLEMENTATION.md`'s polling matrix (corrected) | Correction of an earlier inaccurate note in this same file, not a new decision |
| 18 | Reader manual-training restriction | Frontend-only Admin gate, stricter than the backend | `Training_CreateTrainingRequest` authorizes by Device access, not `IsCompanyAdmin`; the product rule that Reader is strictly read-only wins regardless of what the backend technically permits | `TrainingPage.tsx` | Corrected this checkpoint — see correction item 1 |
| 19 | Vitest pool | `vmThreads` (was `threads`) | `threads` alone can't resolve Fluent UI's CJS `tabster` dependency when a test renders a real Fluent component (`Named export 'createTabster' not found`); several of the newly-added `deps.optimizer`/`server.deps.inline` options that fix this are documented as only taking effect under `vmThreads`. Confirmed the whole suite (all 84 tests, including the ones that motivated the original `forks`→`threads` change) still passes under it | `vite.config.ts` | Build-environment fix, not a design decision |
| 20 | jsdom missing `ResizeObserver`/`IntersectionObserver` | No-op polyfills in `src/test/setup.ts` | Fluent's `MessageBar` reflow and positioned surfaces use both unconditionally; jsdom implements neither, causing an uncaught `TypeError` that crashed component tests | `src/test/setup.ts` | Build-environment fix |
| 21 | Test-time `fetch` mocking | One stable mock installed in `setup.ts`, reconfigured per test via `src/test/mockFetch.ts`, instead of `vi.stubGlobal('fetch', ...)` inside each `it()` | `openapi-fetch`'s `createClient` captures `globalThis.fetch` as a default parameter at first import of `client.ts` — a per-test `stubGlobal` runs too late to matter and was a silent no-op even in the pre-existing `RequireAuth.test.tsx` (undetected because that test's assertions didn't depend on it) | `src/test/setup.ts`, `src/test/mockFetch.ts` | Build-environment fix, discovered while wiring `RequireAdmin.test.tsx` |

## Missing-backend-capability log

See `CLAUDE.md`'s "Missing backend capabilities" table for the full list
with frontend consequences — reproduced here with priority/approval status:

| Gap | Priority | Blocked frontend work | Approval status |
|---|---|---|---|
| No Issue date-range filter | Low | None — local filtering used instead | Documented, approved workaround |
| No `NoteHeartBeat` equivalent | n/a | None — feature removed by explicit instruction | Documented |
| No ModelVersion list/detail | Medium | "Previous versions" browsing on Training page | Documented, explicitly deferred |
| No Ollama job list endpoint | Low | Ollama Jobs page can't show history | Documented |
| No efficient Company-wide aggregate endpoint | Medium | True cross-Device Overview KPIs | Documented, approved workaround (Device-scoped) |
| No batched multi-Sensor latest-value endpoint | Low (future) | Live Monitoring polls per-Sensor | Documented as future enhancement |
| No SSE/WebSocket stream | Low (future) | True push-based live updates | Documented as future enhancement |
| No server-side downsampling | Low (future) | Chart point-count relies on client-side bounding only | Documented as future enhancement |
| `Training_CreateTrainingRequest` authorizes by Device access only, not `IsCompanyAdmin` | Medium (authorization/documentation gap, not a missing capability) | None — this frontend does not rely on the backend to enforce Reader read-only for manual training; it enforces its own stricter rule client-side (see correction item 1) | Documented, not fixed on the backend (out of scope), not worked around by relaxing the frontend rule either |
| `API_Integration_Guide.md`/live OpenAPI describe Ollama terminal-success as `"Completed"`; actual wire value is `"Succeeded"` | Low (doc mismatch, not a missing capability — see Discrepancies found above) | None — frontend correctly uses `"Succeeded"` throughout | Documented (D-Ollama above), not a frontend gap |
| No real `ProblemDetails` middleware despite `API_Integration_Guide.md` §11 claiming one | Low (doc mismatch, not a missing capability — see Discrepancies found above) | None — `errors.ts` normalizes the real shapes instead of assuming the documented one | Documented (D-ProblemDetails above), not a frontend gap |

## Test and verification matrix

| Check | Tool | Result |
|---|---|---|
| Lint | `eslint .` (typescript-eslint, flat config) | **0 errors, 5 warnings** (all benign `react-refresh/only-export-components` on legitimate context/hook/type co-location files) |
| TypeScript check | `tsc --noEmit -p tsconfig.json` | **0 errors** |
| Unit tests | `vitest run` | **84/84 passing**, 13 files (up from 31/5) — see Phase 25 above for the full list of what's newly covered |
| Component tests | (same Vitest run, React Testing Library) | `RequireAuth`/`RequireAdmin` route-guard behavior, `ConfirmDialog` (dialog role, confirm/cancel, Escape, busy/disabled states, focus-into-dialog), `MoveToCanonicalDialog` (render-level), `TrainingPage` (Admin vs Reader control visibility) |
| Route tests | Vitest + manual route-table review | `RequireAuth`/`RequireAdmin` component-tested; every route additionally mocked-browser-verified reachable this checkpoint (see Phase 22/23) |
| API-contract tests | `vitest run` (`api/contract.test.ts`) | **12/12 passing** — static checks against the already-generated `schema.generated.ts`, no live API call required (see Phase 25 above for exact coverage) |
| Auth tests | Vitest | `authStore.test.ts` full lifecycle |
| Authorization tests | Vitest | `RequireAuth`/`RequireAdmin` guard behavior + `TrainingPage.test.tsx`'s explicit Admin-vs-Reader mutation-visibility assertion; per-page mutation-control-absence elsewhere still code-reviewed, not individually automated |
| Telemetry tests | Vitest | `familyFor`/`isCurveFamily`/`isBidirectionalFamily` routing logic |
| Polling-interval tests | Vitest | `ollamaRefetchInterval`/`trainingRequestsRefetchInterval`/`trainingRequestRefetchInterval` — confirms polling stops at the real terminal statuses, not the documented-but-wrong ones |
| Toast/retry-policy tests | Vitest | `queryClient.test.ts` — 429 Retry-After honored, global toast fires only for network failures/429s |
| Canonical-grouping tests | Vitest | `MoveToCanonicalDialog.test.tsx`'s `filterCandidates` logic (exclusion + search) |
| Issue/category tests | — | Not automated |
| Comparison tests | — | Not automated |
| Accessibility checks | `@axe-core/playwright` (real Chromium, mocked backend) | **18 page-states checked**; concrete issues found and fixed (missing `<h1>`, 11 unlabeled `Select`s, 1 unlabeled `Switch`); 1 fix unverified (Smart Analytics date inputs); 2 findings investigated and determined to be tooling false positives, not app defects (see Phase 23 for full detail). **Does not claim WCAG conformance at any level.** |
| Responsive checks | Playwright, real Chromium, 4 viewports (1920×1080/1366×800/834×1112/390×844) | **0 horizontal-overflow failures across 17 pages × 4 viewports** (68 checks). 2 real bugs found and fixed along the way (invalid breadcrumb `<li>` nesting, a `setState`-during-render warning) — see Phase 22. |
| Production build | `vite build` | **Succeeds**, code-split (each route its own chunk — e.g. `IssueDetailPage-*.js` 11.40 kB, `SmartAnalyticsPage-*.js` 9.83 kB separate from the 196.36 kB main `index-*.js`). `vendor_fluent` chunk ~665 kB triggers Vite's >500kB warning, a known Fluent UI v9 characteristic, not addressed further this pass |
| Development runtime | `npm run dev` + headless-Chromium Playwright, network-mocked backend | **Login screen verified with zero mocking**: zero console errors, zero page errors, labeled fields, correctly-disabled-until-valid Sign-in button. **17 authenticated routes additionally mocked-browser-verified** (see the "Mocked-browser verification methodology" section above) — real login form, real route guards, real client-side navigation, network-mocked API only. This is a distinct tier from a genuine live-credential pass, stated explicitly, not blurred with it. |
| API integration | Live `http://localhost:5065` | Confirmed reachable (`/health/live` → `Healthy`) and schema regeneration succeeded; `api/contract.test.ts` checks the generated schema statically without touching the network at test time |
| **Still not done, stated plainly** | — | A genuine live-credential authenticated browser pass (no test credentials were available or created this session, per explicit instruction) — see the click-through checklist below for what a human should verify manually. Full WCAG conformance was never claimed. The Smart Analytics date-input label fix is unconfirmed. Deep interaction states beyond what's listed in Phase 22/23 (every dialog's every sub-state, every error/empty/loading permutation) were not individually re-verified in a real browser this pass. |

## Authenticated click-through checklist (for a human tester with real credentials)

No test credentials exist for the live API in this environment or
repository, per explicit instruction. The mocked-browser pass above
substitutes for authenticated verification wherever it honestly can, but a
few things can only be confirmed against the real backend's real business
logic and real data:

- [ ] Log in with a real Admin account; confirm the HMAC flow succeeds and
      `GetUserDetails` populates the account menu correctly.
- [ ] Log in with a real Reader account; confirm the "Request retraining"
      button is genuinely absent on `/training` (not just hidden by CSS),
      and that navigating directly to an Admin-only route (`/categories`,
      `/knowledge-sharing`, `/admin/readers`, `/admin/settings`) shows the
      in-page not-authorized state, not a crash.
- [ ] Provision a DevicePrincipal, copy the real Secret, confirm it is
      never visible again after closing the dialog (reload the page, check
      the Network tab and `localStorage`/`sessionStorage` for the raw
      value — none should ever appear).
- [ ] Create a real Group, Move a member to a different canonical Issue via
      `MoveToCanonicalDialog`, Reassign-Canonical, and Ungroup — confirm
      each mutation's toast matches what actually happened.
- [ ] Submit a real category suggestion request via Ollama, accept it,
      confirm the category assignment and any resulting retraining
      eligibility feedback.
- [ ] Trigger a real 429 (rapid repeated requests against a rate-limited
      endpoint) and confirm the toast shows the real `Retry-After` value
      from the server, not a fixtured one.
- [ ] Open Smart Analytics' date-range pickers with a screen reader and
      confirm the label fix from Phase 23 actually reads correctly (this
      is the one accessibility fix this session could not independently
      re-verify).
- [ ] Resize a real mobile device (not just a resized desktop browser) to
      confirm touch-target sizing and virtual-keyboard behavior, which a
      Playwright viewport resize cannot fully substitute for.

## Dead-code removal log

| Removed | Original purpose | Replacement | Verification | Reason | Remaining dependency |
|---|---|---|---|---|---|
| `src/App.jsx`, `src/main.jsx` | Old app root/entry | `App.tsx`/`main.tsx` | Build succeeds without them | Superseded by TS rewrite | None |
| `src/App.css`, `src/AppResp.css` | Hand-written styling | Fluent tokens throughout | Build succeeds | Superseded by design system | None |
| `src/Utils.js` | Date helpers, telemetry fetch | `lib/dateTime.ts`, `api/hooks/telemetry.ts` | Typecheck clean | Superseded, typed | None |
| `src/context/AuthContext.jsx` | Old auth (axios, plaintext-password refresh loop) | `auth/AuthContext.tsx` + `authStore.ts` | Component-tested | Superseded, security-fixed | None (axios also removed) |
| `src/components/{Login,Header,DeviceList,IssueList,RealTimeChart,CompareChart,DataChart}.jsx` (7 files) | Old UI | See replacement matrix above | Typecheck + build clean | Superseded by TS pages | None |
| `src/demo/*.json` (3 files) | Secret-button test-data fixtures | None — feature deleted | Confirmed absent from build | Dead against new API contract regardless; explicit instruction to delete | None |
| `src/icons/*.svg` (10 files) | Old raw icon set | `@fluentui/react-icons` | Build succeeds | Superseded | None |
| `src/images/*` (14 of 15 files) | Old status/UI images | `StatusPill` icon+color system | Build succeeds | Superseded | `Precog-Dashboard.svg` is the one survivor, still used by `AppShell`/`LoginPage` |
| `vite.config.js` | Old JS Vite config | `vite.config.ts` | Build succeeds | TS rewrite | None |
| `axios`, `react-toastify`, `react-desktop-notification` (packages) | HTTP transport, notifications | `openapi-fetch`; `AppToastProvider`/`useAppToast` (Fluent Toast, fully wired this checkpoint) | `npm ls` confirms absent | Superseded / no longer used | None |

## Definition of done — current status against each point

- [x] Coherent strict TypeScript architecture
- [x] `allowJs` disabled
- [x] Active JavaScript/JSX application code removed (0 `.js`/`.jsx` in `src/`)
- [x] Old dashboard remains only a product reference (deleted from active tree, in Git history)
- [x] No duplicate active dashboard exists
- [x] Typed OpenAPI integration centralized
- [x] Authentication and role-aware routing work (code-verified + component-tested; login screen and 17 authenticated routes mocked-browser-verified)
- [x] Admin and Reader workflows implemented, Reader strictly read-only for manual training (frontend rule, stricter than the backend — see correction item 1)
- [x] DevicePrincipal administration implemented
- [x] Device, Sensor, policy, and telemetry workflows implemented (Setpoints UI added this checkpoint)
- [x] Live Monitoring implemented
- [x] Smart Analytics implemented
- [x] Same-Device Sensor comparison implemented
- [x] Two-Device comparison implemented
- [x] Canonical Issue lifecycle implemented (Group/Move-Group/Reassign-Canonical UI added this checkpoint)
- [x] Review/category/suggestion workflows implemented
- [x] Knowledge-sharing workflows implemented
- [x] Training/model/Ollama workflows implemented as far as the API supports
- [x] Required loading/error/access states exist
- [x] Accessibility and responsive behavior — automated axe-core audit (18 page-states) and Playwright viewport checks (17 pages × 4 widths) actually run this checkpoint, concrete issues found and fixed; **explicitly not a claim of WCAG conformance at any level** — see Phase 22/23 for exact scope and the two findings determined to be tooling false positives
- [x] Native `window.prompt`/`confirm`/`alert` fully removed, replaced with `ConfirmDialog`/`MoveToCanonicalDialog`
- [x] Centralized Fluent Toast system implemented and wired to every mutation
- [x] Lint, type-check, tests (84/84, up from 31/31), production build pass
- [x] Lightweight OpenAPI contract-quality test added (`api/contract.test.ts`, 12 checks, no live API required)
- [x] Obsolete code removed
- [x] Missing backend capabilities documented, including the Reader-training authorization asymmetry newly recorded this checkpoint
- [x] Backend contracts unchanged (confirmed — see below)

**Not yet fully done, stated plainly**: a genuine live-credential
authenticated browser pass (no test credentials exist for the live API in
this session or repository, per explicit instruction — the authenticated
click-through checklist above is prepared for whoever runs that pass), a
Playwright E2E suite committed to the repository itself (the verification
script used this checkpoint was a one-off, not checked in, consistent with
the three-Markdown-file/no-extra-tooling-file discipline this project has
held to), and independent re-confirmation of the Smart Analytics
date-input accessibility fix. Everything else in the checklist above is
genuinely complete and verified to the standard noted, corrected this
checkpoint against all 11 items in the post-review gap list.

## Scope confirmation

- **Only `C:\VS\PRECOG_Dashboard` was modified.** `git status --short`
  there shows exactly: 4 modified config files (`eslint.config.js`,
  `index.html`, `package.json`, `package-lock.json`), 42 deletions, and new
  files under `api/`, `app/`, `auth/`, `components/`, `lib/`, `pages/`,
  `test/`, `theme/`, plus `App.tsx`, `main.tsx`, `tsconfig.json`,
  `vite.config.ts`, `.env.example`, `public/`.
- **Backend contracts and configuration were never touched.**
  `git status --short` in `C:\VS\API` shows 77 modified files — every one a
  build artifact under `DataAccess/bin`, `DataAccess/obj`, `MLTraining/obj`
  (`.dll`/`.pdb`/`.cache`/generated files), consistent with the API's own
  container/build process running this session. No source, DTO, route,
  auth, DevicePrincipal, MLTraining, migration, connection-string, Docker
  networking, hosts-file, or launch-settings file was read for any purpose
  beyond reference, let alone modified.

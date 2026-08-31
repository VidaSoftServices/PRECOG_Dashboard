# PRECOG Dashboard — Implementation Plan & Progress

Active tracker. `AGENTS.md` has the rules, `CLAUDE.md` has the reasoning —
this file has status. Update this file at every natural checkpoint; update
`CLAUDE.md` when implemented architecture or product behavior changes;
update `AGENTS.md` only when a permanent repository rule changes.

## Source documents read

| Source | Read completely | When | Controls | Conflicts found | Resolution |
|---|---|---|---|---|---|
| `http://localhost:5065/swagger/v1/swagger.json` (live) | Yes | This session, **three times** (twice earlier — identical both times, 104 operations; refreshed again 2026-08-31 for the source-assessment checkpoint below — **not identical this time**, see "Live OpenAPI contract change" below) | Exact routes, methods, params, request/response DTOs, operation IDs, security | **Yes — one real contract addition** (below) | `src/api/schema.generated.ts` regenerated from it all three times via `npm run gen:api`; typecheck re-verified clean against the newest generation |
| `C:\VS\API\VidaSoft.API\AGENTS.md` | Yes | This session, twice (re-read 2026-08-31 in full, via a background agent, specifically checking for drift since the first read) | Backend agent rules, critical invariants, precedence order | — | Reflected in this repo's own `AGENTS.md` precedence section; no changes found on re-read |
| `C:\VS\API\VidaSoft.API\CLAUDE.md` | Yes | This session, twice (re-read 2026-08-31) | Backend product/domain reasoning, per-aggregation-level config, telemetry invariants, OpenAPI-as-product-contract standard, **and now a full "Company profile authority"/mirrored-master-data section not present or not noticed on the first read** | — | Reflected throughout this repo's `CLAUDE.md`; the Company-profile material is new to this repo's docs as of this checkpoint |
| `C:\VS\API\VidaSoft.API\TASK_IMPLEMENTATION.md` | Yes (re-read 2026-08-31; grew since the first read — now includes a "Priority 9 addendum: Entra-managed Company profile and unresolved-Company response" section that reads as the newest content in the file) | This session, twice | Business reasoning and lifecycle behind every API operation — used for *why*, never as frontend code instructions per explicit rule | — | Cross-checked against live contract; used to write `CLAUDE.md`'s domain-concept sections; the Priority 9 addendum is reflected in the source-assessment section below |
| `C:\VS\API\DataAccess\Solution_Description\API_Integration_Guide.md` | Yes | This session, twice (re-read 2026-08-31; now includes a §2.5/§2.6 Company/CurrentUser section) | Narrative workflow companion to the OpenAPI doc | **Yes — two discrepancies, both re-confirmed still present on re-read** (below) | Live contract + verified source wins; discrepancies recorded, not silently resolved; re-checked 2026-08-31 and neither has been fixed at the documentation layer |
| `C:\VS\API\DataAccess\Solution_Description\Database_Redesign_Change_Description.txt` | Yes | This session, twice | Approved database/domain design, "superseded statements" list, `Company.ExternalKey`/mirrored-identity mechanism (§3) | — | Confirms this frontend's Device/Sensor/AggregationPolicy model matches the approved design exactly |
| `C:\VS\API\DataAccess\Solution_Description\Deployment_Runbook.md` | Yes | This session, twice | Operational reference (config keys, health-check behavior, DevicePrincipal lifecycle summary, correlation-ID guidance, `Identity:UserSource`/`Identity:EntraId` mode switch, OllamaJob claim/lease internals) | — | Confirmed `SystemStatusPage.tsx`'s "no further Admin detail exists" claim is accurate (health endpoints return a fixed string by design, verified in the runbook's own container smoke test) |

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

Both re-confirmed still present, unfixed, on the 2026-08-31 re-read (see
below) — neither is a stale finding.

## Complete source assessment (2026-08-31 checkpoint)

A full, evidence-based re-inspection of the current repository state: every
active file under `src/`, the freshly-regenerated API schema, the freshly
re-read backend documents, the build output, the test suite, and the Git
history. Written to stand on its own for a reviewer who wants to understand
this dashboard without re-deriving it — it does not assume the reader has
followed the phase-by-phase log below, though it corrects/supersedes a few
specific claims in that log where fresh inspection found them stale or
overstated (each correction is flagged explicitly where it happens, not
silently).

**What triggered this checkpoint**: the app is authenticated and loading
successfully with a real User for the first time this session. This is a
natural buildable checkpoint to pause new feature work and independently
verify what's actually here, rather than continuing to extend it on the
strength of the builder's own running narrative.

### Git state

Working tree is effectively clean. The full TypeScript rewrite (everything
described in this file's phase log) is committed as `08f078c "new dashboard
v0"` (`TiborBalintVida`, 2026-08-31 01:53:57+02:00). The only uncommitted
change at this checkpoint is `src/api/schema.generated.ts`, from the live
OpenAPI refresh performed as the first step of this assessment (see below)
— not yet committed, deliberately, since regenerating it is this session's
own verification step, not something to silently fold into a prior commit.

### Live OpenAPI contract change (found this checkpoint)

`npm run gen:api` was re-run against the live contract rather than trusting
the schema already on disk, per explicit instruction. **The contract is not
identical to the last generation** — `diff` against the prior
`schema.generated.ts` shows exactly one substantive addition (confirmed via
a background agent's full re-read of the backend's own six source-of-truth
documents — the change is already documented backend-side, not something
this frontend discovered ahead of the backend's own docs):

- **New operation**: `PUT /api/Company/Name` (`Company_UpdateCompanyName`)
  — lets a Company Admin rename their own Company. `200` on success, `400`
  for a blank name or one over 200 characters, `401` for no authorized
  Company, `403` for a non-Admin caller, **`409`** when the Company's
  `profileSource` is `MirroredDatabase` (WordPress-synchronized — see
  below) rather than `Local`, or when another Company already uses the
  requested name, `429` for the global rate limit.
- **`GET /api/Company`'s response gained four fields**: `logo` and
  `website` (both nullable, untrusted external text, max 512 characters,
  never fetched/proxied/rendered as HTML by the API — same handling rule
  as every other untrusted external string this frontend already respects),
  `profileSource` (new enum: `"Local" | "MirroredDatabase"`), and
  `nameEditable` (boolean — true only when the caller is a Company Admin
  **and** the profile is `Local`; this is the field a frontend should gate
  the rename control on, rather than re-deriving the same logic from
  `profileSource` + `isCompanyAdmin` separately).
- **`User_GetUserDetails` is now fully documented** — previously prose-only
  in the live OpenAPI doc (discrepancy D3 from the original assessment,
  which is why `src/api/domainTypes.ts`'s `UserDetails` interface exists as
  a hand-typed workaround). The response is now a real, generated
  `components['schemas']['CurrentUserDto']`, a superset of the current
  hand-typed `UserDetails`: it adds `companyName`, `companyLogo`,
  `companyWebsite` (all nullable), and **`hasAuthorizedCompany`** (boolean)
  alongside the fields `domainTypes.ts` already knows about (`userId`,
  `companyId`, `isCompanyAdmin`, `language`, `displayName`, `email`,
  `mobile`).

**Business rule behind `profileSource`** (confirmed against
`Database_Redesign_Change_Description.txt` §3 and the backend's own
CLAUDE.md, via the background agent): a Company is `MirroredDatabase` when
its row carries a non-null `ExternalKey` (the invariant decimal form of
`wp_fc_companies.id`), which only the WordPress-sync provider ever
populates. A Company created directly in PRECOG, or the specific Company
targeted by `Identity:EntraId:CompanyId` in Entra-sync mode, has no
`ExternalKey` and is therefore `Local` — and local/mirrored Companies can
coexist in one deployment (this is a per-row property, not purely a
deployment-wide switch, though `Deployment_Runbook.md` §5.2 phrases it in
a way that reads more like a single global answer for the common
single-mode-per-deployment case — worth a live sanity check if a mixed
deployment is ever actually expected). **`hasAuthorizedCompany`**'s rule
(confirmed identically across four backend documents): false exactly when
the human identity has no resolvable authorized Company (e.g. a WordPress
account not yet linked into the Company/RBAC model); in that state
`companyId` is `null`, `companyName` is the literal string `"Unknown"`
(display-only — never persisted, never treated as a real Company, never
used to authorize anything), and every Company-scoped endpoint continues
to reject the caller regardless of this fallback projection succeeding.

**Consequence for this frontend — not yet consumed, correctly so for this
checkpoint**: `PUT /api/Company/Name` has no UI anywhere in this dashboard
(there is no Company-profile-editing page at all — `useCompany()` in
`src/api/hooks/company.ts` is read-only and used only for
`AdminSettingsPage.tsx`'s context, never rendered as an editable profile).
`domainTypes.ts`'s hand-typed `UserDetails` is now stricter than the real,
generated `CurrentUserDto` — it still works correctly (TypeScript's
`unknown`-cast pattern in `AuthContext.tsx` doesn't break when the real
JSON has *more* fields than the hand-typed interface expects), but it's
missing exactly the fields (`companyName`, `companyLogo`, `companyWebsite`,
`hasAuthorizedCompany`) needed to show a real Company name/logo anywhere,
or to distinguish "no Company" from "loading" in the account menu. Building
either a Company-rename UI or switching `AuthContext.tsx` to the now-real
`CurrentUserDto` type is new feature work, correctly out of scope for this
assessment checkpoint — recorded here as the most concrete, evidence-based
"what should be reviewed or corrected next" item this pass found, not
acted on.

### Backend documentation and discrepancy re-check (2026-08-31)

A background agent re-read all six backend source-of-truth documents in
full (3,805 lines total) specifically to check for drift since the
original read. Findings:

- The Company-profile/rename/`CurrentUserDto` material above is
  **already fully documented backend-side** — CLAUDE.md's "Company profile
  authority and unresolved-Company display" section, TASK_IMPLEMENTATION.md's
  "Priority 9 addendum: Entra-managed Company profile and unresolved-Company
  response," `API_Integration_Guide.md` §2.5/§2.6, `Database_Redesign_Change_Description.txt`
  §3, and `Deployment_Runbook.md` §4.1/§5.2 all describe it consistently.
  This means the backend's own documents had already moved ahead of what
  this frontend's docs captured, independent of the live-contract refresh.
- **Both previously-recorded discrepancies are still present, unfixed, at
  the documentation layer**: `API_Integration_Guide.md` §10 still states
  Ollama's terminal-success status is `"Completed"` (the string
  `"Succeeded"` does not appear anywhere across all six documents); §11
  still claims uniform `ProblemDetails` error responses with no document
  stating that middleware now actually exists. This frontend's handling of
  both (real `"Succeeded"` value, three-shape error normalizer) remains
  correct and does not need to change.
- **All nine previously-logged missing-backend-capability gaps still
  exist**, confirmed line-by-line against the freshly re-read documents —
  none has been added since the original assessment. See the
  missing-backend-capability log further below; unchanged, not reproduced
  twice in this file.
- No other new capability, endpoint, field, or business-rule change was
  found anywhere in the six documents outside the Company-profile material
  above.

### Fresh code-quality inspection

Beyond re-confirming prior findings, this checkpoint specifically looked
for anything a "not another superficial summary" pass should catch that
hadn't been flagged before:

- **Zero** `TODO`/`FIXME`/`XXX:` comments, `console.log`/`console.debug`/
  `console.warn` calls, `debugger` statements, or `: any`/`as any` type
  escapes anywhere in `src/` (verified by direct grep across every `.ts`/
  `.tsx` file, not sampled).
- **One** `eslint-disable` comment exists in the entire codebase:
  `SmartAnalyticsPage.tsx:97`, suppressing `react-hooks/rules-of-hooks`
  inside a `.map()` over a **fixed-length literal array**
  (`const slots = [0, 1, 2, 3] as const`) that calls `useTelemetryDateRange`
  once per slot, always exactly 4 times, in the same order, on every
  render, regardless of how many Sensors are actually selected (unused
  slots pass `sensorId: undefined`, which the hook's own `enabled` guard —
  confirmed in `telemetry.ts` — turns into a no-op query rather than a
  real fetch). This is inspected and **confirmed correct**: the real Rules
  of Hooks requirement (stable call count/order) is satisfied; only
  ESLint's static heuristic (which can't verify a mapped array's length is
  fixed) can't see that. Not the same category of bug as the genuine
  `LiveMonitoringPage.tsx` violation found and fixed earlier this session
  (a conditional call after an early return) — that one had no suppression
  and was a real defect; this one has a suppression and is not.
- **A genuine, previously-unflagged completeness gap: no UI exists to
  create or edit a Sensor.** `src/api/hooks/sensors.ts` defines
  `useCreateSensor`/`useUpdateSensor` (typed, wired to
  `POST`/`PUT /api/Devices/{deviceId}/Sensors[/{sensorId}]`, correct
  invalidation), but grepping the entire `src/` tree for any call site,
  any "Add Sensor" control, or any Sensor-editing form found **none** —
  `DeviceDetailPage.tsx`'s Sensors card is read-only (name, direction,
  quantity kind, unit, enabled state, a link to that Sensor's policies) with
  no create action, even though its own empty state literally says "Add a
  Sensor to start collecting telemetry from this Device" with no control to
  do so. This is a real product gap, not a documented scope decision — no
  entry in the decision log below addresses it, and Phase 10's "Implemented"
  status (Sensors + AggregationPolicies + Setpoints "all live on
  SensorPoliciesPage.tsx") **overstates completeness**: aggregation
  policies and setpoints are genuinely editable there, but the Sensor
  entity itself (name, direction, quantity kind, unit, enabled) has no
  create or edit path anywhere in this dashboard. Corrected in the phase
  log below.
- **A second, related gap of the same shape**: `useCreateAggregationPolicy`
  and `useDeactivateAggregationPolicy` (in `aggregationPolicies.ts`) are
  also defined and correctly wired but never called from any page —
  `SensorPoliciesPage.tsx` only *edits* existing aggregation levels
  (`useUpdateAggregationPolicy`, which **is** used), never adds a new
  aggregation level to a Sensor or deactivates one. Whether "add a new
  aggregation level" is a real, expected workflow (versus aggregation
  levels being provisioned some other way, e.g. at Sensor-creation time
  once that exists) isn't documented anywhere this session found — flagged
  as an open question, not asserted as a definite gap the way the Sensor
  one above is.
- **A separate, larger unused capability: Company Member role assignment.**
  `src/api/hooks/company.ts` defines `useCompanyMembers`,
  `useAssignCompanyRole`, and `useRevokeCompanyRole` (`GET`/`POST`/`DELETE`
  against `/api/Company/Members[/{userId}/Roles[/{roleName}]]`) — a
  complete, correctly-typed, correctly-invalidated mutation surface for
  assigning or revoking the Admin/Reader role itself on a Company member.
  **No route, page, or dialog in this dashboard calls any of the three.**
  This is distinct from `ReadersPage.tsx`, which manages **Device-level
  grants** for Readers who already hold the Reader role — it does not
  create a Reader or promote someone to Admin. Two explanations are
  plausible and this session could not distinguish between them from the
  code or docs alone: (a) role assignment is a genuine missing page this
  dashboard should have (the "Company administration" bullet in this
  file's own CLAUDE.md product-purpose list only explicitly promises
  "Reader Device-access grants," not role assignment, which may mean this
  was always intentionally out of scope), or (b) in a `MirroredDatabase`-
  identity deployment, who holds Admin/Reader may be intended to flow from
  the WordPress-side source of truth rather than be edited directly in
  PRECOG, making an in-dashboard control actively wrong for that
  deployment mode even though the API accepts it unconditionally. Neither
  the frontend's own decision log nor the backend's six documents state
  which is true. Recorded as an open question for the next round of
  product decisions, not resolved here.
- **`useRevokeSharedIssues`** (`knowledgeSharing.ts`) — the DELETE
  counterpart to `useEnableSharedIssues` (which **is** used, to add a
  specific Issue to an approved share) — is defined but never called.
  `KnowledgeSharingPage.tsx` lets an Admin add Issues to a share one at a
  time but not remove one already included, short of revoking the whole
  share. Minor, likely a legitimate small gap rather than a deliberate
  decision (no documentation anywhere addresses it either way).
- **`useUpdateLocation`** (`referenceData.ts`) — Locations can be created
  (`useCreateLocation`, used in `AdminSettingsPage.tsx`) but not renamed or
  otherwise edited afterward. Minor.
- **`useCreateIssue`** and **`useUpdateIssue`** (`issues.ts`) are unused,
  but both are already correctly documented as deliberately so: Issues are
  qualified by the ML pipeline, never manually created by a human through
  this dashboard (consistent with the "no ingestion UI" rule in `AGENTS.md`
  extended to the thing ingestion produces), and `useUpdateIssue`'s own
  JSDoc comment already states it's the legacy `Confirmed`/`IsAnomaly`-style
  edit, superseded by `useReviewIssue`, kept only for API completeness. Not
  a gap — confirmed correctly unused.

### Complete active source inventory

Grouped as requested. "Tested" means a dedicated unit/component test
exists (see the test matrix further below for the full list — not
repeated per-row here). "Runtime status" cites the same three-tier scheme
used throughout this file: **code-reviewed** (typechecked/linted/built,
never rendered), **mocked-browser-verified** (opened in a real Chromium
browser this session against a network-mocked backend — see the
methodology section above), or **not yet verified**. No file listed below
is generated except `schema.generated.ts` itself; no file is dead code —
every file is reachable from `main.tsx` through `App.tsx` → `router.tsx`'s
lazy route table, or (for hooks/tests) imported by something that is,
**except** the specific unused-hook findings called out above, which live
inside otherwise-reachable files (the *file* is reachable and imported;
specific *exported functions* within it are the unused unit, which is why
they don't show up as orphaned modules in a bundler warning).

**Entry points**

| File | Responsibility | Exports | Notes |
|---|---|---|---|
| `src/main.tsx` | App bootstrap — mounts `<App/>` into `#root` inside `StrictMode` | (none — side-effecting entry) | `StrictMode` is on, meaning dev-mode double-invocation of renders/effects is active; relevant context for anyone debugging an effect that appears to run twice locally |
| `src/App.tsx` | Composes every top-level provider in the exact nesting order that matters (theme → toast → query → auth → router) | `default App` | See "Architecture trace" below for why this order matters |

**Application shell, routing, navigation**

| File | Responsibility | Exports | Notes |
|---|---|---|---|
| `src/app/router.tsx` | The one route table — every route below `/login` uses React Router 7's `lazy()` field, confirmed code-split in the build output | `router` | 18 routes total (17 authenticated + `/login`), matches `navConfig.ts` + 5 unlisted detail/nested routes not in the nav drawer |
| `src/app/AppShell.tsx` | NavDrawer + Toolbar + Breadcrumb + theme/account menus + `<main>` content outlet | `AppShell` | Fixed this checkpoint's predecessor session: breadcrumb `<li>`-inside-`<li>` nesting bug (see correction checkpoint above) |
| `src/app/navConfig.ts` | Single source of truth for both the NavDrawer's items and (implicitly) route visibility | `NavEntry`, `navEntries` | 11 top-level nav entries; `adminOnly` flag drives both nav visibility and pairs with `RequireAdmin` at the route level |

**Theme**

| File | Responsibility | Exports | Notes |
|---|---|---|---|
| `src/theme/theme.ts` | Derives light/dark Fluent brand ramps from the PRECOG blues | `precogLightTheme`, `precogDarkTheme`, `ThemePreference` | Pure data, no logic to test |
| `src/theme/ThemeContext.tsx` | `light\|dark\|system` preference, `localStorage`-persisted, live `matchMedia` listener for `system` | `AppThemeProvider`, `useAppTheme` | localStorage read/write wrapped in try/catch (can throw in locked-down environments) |

**Authentication**

| File | Responsibility | Exports | Notes |
|---|---|---|---|
| `src/auth/authStore.ts` | Framework-agnostic in-memory session store (token, principal type, expiry) — deliberately never persisted | `PrincipalType`, `Session`, `getSession`, `setSession`, `clearSession`, `getToken`, `isExpired`, `subscribe`, `getSnapshot`, `notifyUnauthorized`, `onUnauthorized` | **Tested** (`authStore.test.ts`) |
| `src/auth/AuthContext.tsx` | Wraps `authStore` in `useSyncExternalStore`, drives login/logout, fetches `GetUserDetails` on session change | `AuthProvider`, `useAuth` | Currently types `GetUserDetails`'s response via hand-typed `UserDetails`, not the now-real generated `CurrentUserDto` — see the OpenAPI-change finding above |

**Authorization**

| File | Responsibility | Exports | Notes |
|---|---|---|---|
| `src/auth/RequireAuth.tsx` | Route guard — no session → redirect to `/login`, preserving the attempted route | `RequireAuth` | **Tested** (`RequireAuth.test.tsx`) |
| `src/auth/RequireAdmin.tsx` | Route guard — not Admin → in-page `NotAuthorizedState`, no redirect | `RequireAdmin` | **Tested** (`RequireAdmin.test.tsx`, added this session) |

**API client**

| File | Responsibility | Exports | Notes |
|---|---|---|---|
| `src/api/client.ts` | The one `openapi-fetch` instance + auth/error/cancellation middleware | `ApiError`, `apiClient`, `unwrap` | Every hook in the codebase goes through this — confirmed zero raw `fetch` calls outside it and `health.ts` (which deliberately bypasses it — see below) |
| `src/api/errors.ts` | Normalizes the three real error-body shapes (string / ad-hoc object / genuine `ValidationProblemDetails`) | `NormalizedApiError`, `normalizeApiError` | **Tested** (`errors.test.ts`, 6 cases) |
| `src/api/domainTypes.ts` | Hand-typed shapes for the endpoints the live OpenAPI doc doesn't fully describe | `HmacKeyResponse`, `DeviceTokenResponse`, `UserDetails`, `OllamaJobStatus`, `TrainingRequestStatus`, `IssueReviewState`, `KnowledgeShareStatus`, `CategorySuggestionStatus`, `ApplicationMode`, `SensorDirection`, `TelemetryIngestAcceptedBody` | `UserDetails` is now a narrower subset of the real, generated `CurrentUserDto` — see the OpenAPI-change finding above; the rest remain accurate |
| `src/api/authHeaderPatch.ts` | Type-only mapped type stripping the generated schema's spurious required `HMAC_Key` call-site parameter | `AuthPatchedPaths` | Never touches the generated file itself |
| `src/api/queryClient.ts` | The module-level `QueryClient` singleton, retry/backoff policy, global network/429 toast handler | `shouldRetry`, `retryDelay`, `notifyGlobalFailure`, `queryClient` | **Tested** (`queryClient.test.ts`, added this session) |
| `src/api/queryKeys.ts` | The one query-key factory | `queryKeys` | Prevents invalidation drift by construction — no hook hand-writes an array key |

**Generated API schema**

| File | Responsibility | Notes |
|---|---|---|
| `src/api/schema.generated.ts` | `openapi-typescript` output from the live contract | Regenerated this checkpoint (see "Live OpenAPI contract change" above) — never hand-edited, confirmed by its own header comment and by this session's own discipline throughout |

**API hooks** (13 files, one per domain, ~65 exported hooks total)

| File | Domain | Notable unused exports (see fresh-inspection findings above) |
|---|---|---|
| `src/api/hooks/devices.ts` | Device CRUD (no hard delete — disable only) | — |
| `src/api/hooks/sensors.ts` | Sensor read/create/update | `useCreateSensor`/`useUpdateSensor` now consumed by `DeviceDetailPage.tsx`'s Add/Edit Sensor dialogs, added at the 2026-08-31 completion checkpoint — see Phase 10 |
| `src/api/hooks/aggregationPolicies.ts` | Per-Sensor aggregation-level CRUD | `useCreateAggregationPolicy`, `useDeactivateAggregationPolicy` (unused) |
| `src/api/hooks/setpoints.ts` | Direction-aware setpoint history + effective-at-now | — |
| `src/api/hooks/devicePrincipal.ts` | DevicePrincipal lifecycle (provision/rotate/revoke/enable) | — |
| `src/api/hooks/issues.ts` | Issue CRUD, review, canonical grouping (group/ungroup/move/reassign) | `useCreateIssue`, `useUpdateIssue` (deliberately unused — legacy/out-of-scope, see above) |
| `src/api/hooks/issueCategories.ts` | Category catalog CRUD + enable/merge | — |
| `src/api/hooks/issueCategorySuggestion.ts` | Ollama category suggestion request/accept/reject | — |
| `src/api/hooks/knowledgeSharing.ts` | Draft/approve/revoke shares, per-Issue enable/revoke | `useRevokeSharedIssues` (unused — see gap above) |
| `src/api/hooks/company.ts` | Company profile (read-only), Members/roles, Readers, Device grants | `useCompanyMembers`, `useAssignCompanyRole`, `useRevokeCompanyRole` (unused — see gap above) |
| `src/api/hooks/referenceData.ts` | Locations, DeviceGroups, DeviceClasses (read-only) | `useUpdateLocation` (unused) |
| `src/api/hooks/telemetry.ts` | All four telemetry families' trailing/period/date-range/last-period reads, family routing | `familyFor`/`isCurveFamily`/`isBidirectionalFamily` **tested** (`telemetry.test.ts`) |
| `src/api/hooks/training.ts` | Training requests, polling-interval predicates | `trainingRequestsRefetchInterval`/`trainingRequestRefetchInterval` **tested** (`training.test.ts`, added this session) |
| `src/api/hooks/ollama.ts` | Ollama job submit/get/cancel, polling-interval predicate | `ollamaRefetchInterval` **tested** (`ollama.test.ts`, added this session) |
| `src/api/hooks/modelQuery.ts` | Model query (deliberately not auto-polled) | — |
| `src/api/hooks/health.ts` | `/health/live`, `/health` | The one deliberate exception to "always go through `apiClient`" — these are plain unauthenticated ASP.NET health-check endpoints, not documented OpenAPI operations, called with raw `fetch` for exactly that reason |

**Shared components**

| File | Responsibility | Tested |
|---|---|---|
| `src/components/PageHeader.tsx` | Title (`as="h1"` by default, `level="h2"` for a page's secondary header) + description + actions row | No dedicated test; exercised via every page render |
| `src/components/StatusPill.tsx` | `FreshnessPill`/`ReviewStatePill`/`JobStatusPill`/`EnabledPill` — always icon + color + text | No |
| `src/components/DateTimeField.tsx` | Fluent-`Field`-wrapped `react-datepicker`, explicit `aria-label` (added this checkpoint's predecessor session — unconfirmed fix, see Phase 23) | No |
| `src/components/ConfirmDialog.tsx` | The one reusable confirm/consequential-action dialog | **Yes** (`ConfirmDialog.test.tsx`, 6 cases) |
| `src/components/MoveToCanonicalDialog.tsx` | Bounded searchable Combobox for a Move-Group target, built on `ConfirmDialog` | **Yes** (`MoveToCanonicalDialog.test.tsx` — `filterCandidates` logic + one render smoke test; full Combobox interaction not testable in jsdom, see below) |
| `src/components/ToastProvider.tsx` | `AppToastProvider`/`useAppToast` — the one Fluent Toast layer | No dedicated test; exercised indirectly via `queryClient.test.ts`'s `toastBridge` mock |
| `src/components/toastBridge.ts` | Module-level registration bridge so the singleton `queryClient` can call into React-context toasts | Exercised by `queryClient.test.ts` |

**Request-state components**

| File | Responsibility | Tested |
|---|---|---|
| `src/components/states/LoadingState.tsx` | Spinner + label | No |
| `src/components/states/EmptyState.tsx` | Icon + title + description + optional action | No |
| `src/components/states/ErrorState.tsx` | Normalized error message + optional retry | No |
| `src/components/states/NotAuthorizedState.tsx` | 403/404-for-Reader in-page state | No (exercised via `RequireAdmin.test.tsx`) |

**Charts**

| File | Responsibility | Tested |
|---|---|---|
| `src/components/charts/TelemetryChart.tsx` | The one chart behind Live Monitoring, Smart Analytics, and Issue-detail telemetry — `single`/`compare` modes, text summary, `prefers-reduced-motion` | No |
| `src/components/charts/palette.ts` | Series colors/dash patterns, anomaly-point colors | No (pure data) |

**Utility hooks**

| File | Responsibility | Tested |
|---|---|---|
| `src/lib/dateTime.ts` | ISO conversion, formatting, freshness bucketing | **Yes** (`dateTime.test.ts`) |
| `src/lib/pollIntervals.ts` | The one place every polling cadence is defined | No dedicated test (values exercised indirectly via `ollama.test.ts`/`training.test.ts`) |
| `src/lib/useActivateProps.ts` | Makes a non-native clickable element keyboard-operable | No |
| `src/lib/useMediaQuery.ts` | `useMediaQuery`/`useBreakpoint` | No |
| `src/lib/useNumberSearchParam.ts` | Typed single-numeric-URL-param state | No |
| `src/lib/usePageVisible.ts` | Page Visibility API wrapper | No |

**Domain pages** (19 files — see the Route and API coverage matrix above for the full per-route detail; not repeated here)

All 19 are reachable from `router.tsx`, all show `Implemented` status in
the route matrix, and 17 of the 19 (every one except `NotFoundPage` and the
`*` fallback logic) were mocked-browser-verified this session (see Phase
22/23 above). No page file is orphaned, duplicated, or dead.

**Tests** (10 files, 84 total assertions — see the Test and verification
matrix above for the full breakdown)

`api/errors.test.ts`, `auth/authStore.test.ts`, `lib/dateTime.test.ts`,
`api/hooks/telemetry.test.ts`, `auth/RequireAuth.test.tsx`,
`auth/RequireAdmin.test.tsx`, `api/hooks/ollama.test.ts`,
`api/hooks/training.test.ts`, `api/queryClient.test.ts`,
`components/ConfirmDialog.test.tsx`, `components/MoveToCanonicalDialog.test.tsx`,
`pages/training/TrainingPage.test.tsx`, `api/contract.test.ts`. Plus
`src/test/setup.ts` (global test environment — fetch mock installation,
`ResizeObserver`/`IntersectionObserver` polyfills) and `src/test/mockFetch.ts`
(the reconfigurable fetch-mock helper), which are test infrastructure, not
test files themselves.

**Public assets**

| File | Purpose |
|---|---|
| `public/PG.png` | Favicon, referenced directly from `index.html` |
| `src/images/Precog-Dashboard.svg` | App logo, used by `AppShell.tsx` and `LoginPage.tsx` |

Confirmed the only two static assets in the entire repository — everything
else visual comes from `@fluentui/react-icons` or Chart.js-drawn canvases.

### Architecture trace — real request/render lifecycle from browser startup

1. `index.html` loads `/src/main.tsx` as an ES module (Vite dev) or the
   built, hashed equivalent (`vite build`'s `index-*.js`, per the
   `manualChunks` split in `vite.config.ts`).
2. `main.tsx` calls `createRoot(#root).render(<StrictMode><App/></StrictMode>)`.
3. `App.tsx` nests providers in an order that is load-bearing, not
   arbitrary: `AppThemeProvider` (outermost — every child, including error/
   loading UI, needs a resolved Fluent theme) → `AppToastProvider` (needs
   `FluentProvider` from the theme layer above it for `Toaster` to render
   correctly; registers itself into `toastBridge` on mount so the
   `queryClient` below can reach it) → `QueryClientProvider` (the
   module-level `queryClient` singleton — already exists before render,
   just wired to React here) → `AuthProvider` (reads `authStore` via
   `useSyncExternalStore`, independent of routing) → `RouterProvider`
   (innermost — the router's own route elements need every provider above
   them already in context).
4. `router.tsx`'s `RequireAuth` element wraps everything below `/login`. No
   session → `<Navigate to="/login" state={{from: location}}/>`.
   Session present → renders `AppShell` (NavDrawer/Toolbar/Breadcrumb/theme
   menu/account menu, computed from `authStore`+`AuthContext` state) with
   the matched lazy-loaded route's `<Outlet/>` inside `<main>`.
5. `RequireAdmin` further wraps the Admin-only route subset
   (`/devices/:id/principal`, `/categories`, `/knowledge-sharing`,
   `/admin/readers`, `/admin/settings`) — `isAdmin` false → in-page
   `NotAuthorizedState`, no redirect (deliberately different from
   `RequireAuth`, matching the backend's own `Forbid()` behavior for
   Admin-only actions).
6. The matched page component mounts, calls its `src/api/hooks/*` hooks,
   each of which calls `apiClient.{GET,POST,PUT,DELETE}` (or, for
   `useHealth`, raw `fetch` against the two unauthenticated endpoints).
7. `apiClient`'s `authMiddleware.onRequest` reads the current token from
   `authStore.getToken()` and sets the `HMAC_Key` header on every request —
   no call site ever sets it itself.
8. On a non-2xx response, `onResponse` clones the response, calls
   `normalizeApiError`, and throws a typed `ApiError`; a 401 additionally
   calls `authStore.notifyUnauthorized()`, which clears the session and
   fires every `onUnauthorized` listener — `AuthContext.tsx` is the one
   currently registered, clearing `userDetails`, which flows back through
   `useSyncExternalStore` to `RequireAuth`, which redirects to `/login`.
   This is the *only* mechanism that ends a session mid-use; there is no
   client-side timer independently expiring it.
9. React Query's `QueryCache`/`MutationCache` global `onError` (in
   `queryClient.ts`) separately calls `notifyGlobalFailure`, which reads
   the shared toast API from `toastBridge` and shows a toast **only** for
   network failures (`status: 0`) and 429s — every other status is left
   for the call site's own `ErrorState`/inline handling, by design, to
   avoid showing the same failure twice.
10. A mutation's `onSuccess` typically does two things: `queryClient.invalidateQueries`
    (or `setQueryData` for an instant list-row update) via the centralized
    `queryKeys` factory, and `useAppToast().success(...)` for user-visible
    confirmation — both patterns are consistent across all ~30 mutation
    hooks in the codebase, confirmed by this checkpoint's hook-by-hook read.

### API operations consumed vs. available

104 operations exist in the live contract (105 as of this checkpoint's
`Company_UpdateCompanyName` addition). This frontend's hooks call
approximately 90 of them across the 13 hook files inventoried above — the
`api/contract.test.ts` added this session enforces, as an automated test,
that every literal path string any hook calls still exists in the
generated schema (extracted by scanning the hook source files themselves,
not hand-maintained, so it can't silently drift). The operations this
frontend deliberately does not call: the four telemetry-ingestion
endpoints (machine/DevicePrincipal concern, explicitly out of scope per
`AGENTS.md`), `Company_UpdateCompanyName` (new, unconsumed — see above),
and the Company-Members/role-assignment and Sensor/AggregationPolicy-create
operations covered in the fresh-inspection findings above.

### Backend business rules represented in this frontend

Already documented exhaustively in `CLAUDE.md`'s domain-concept sections
(Tenant and roles, Device/Sensor configuration, Telemetry, Canonical
Issues, Review states, Categories, Training and models, Knowledge sharing,
Ollama) — re-verified accurate against the fresh backend-doc re-read this
checkpoint, with exactly one addition needed: the Company-profile/mirrored-
identity rules described in the OpenAPI-change section above were not
previously represented anywhere in this repo's docs (there was nothing to
represent — the frontend never consumed Company profile fields until this
checkpoint's schema refresh surfaced them). Not added to `CLAUDE.md`'s
domain sections yet, since no frontend code consumes them — recorded here
instead, consistent with "document the gap, don't fabricate the frontend
behavior."

### Runtime-verified vs. code-reviewed status — no change this checkpoint

Unchanged from the Phase 22/23/25 verification already recorded above: 17
of 19 routes mocked-browser-verified (responsive + accessibility), 84/84
tests passing, 0 lint/typecheck errors, production build succeeds. This
checkpoint did not re-run the Playwright pass (no code changed that would
affect its results) — it re-verified `typecheck`/`lint`/`test` only, all
still green against the freshly regenerated schema (see "Live OpenAPI
contract change" above).

### What should be reviewed or corrected next

In priority order, all evidence-based (not aspirational) findings from
this checkpoint:

1. ~~Decide whether Sensor create/edit is in scope.~~ **Resolved at the
   2026-08-31 completion checkpoint** — built, mocked-browser-verified. See
   Phase 10 above and the "Completion checkpoint" section below.
2. **Decide whether Company Member role assignment belongs in this
   dashboard**, given the mirrored-identity ambiguity described above — a
   product decision, not a technical one.
3. **Decide whether to adopt the real `CurrentUserDto` type** (now that
   `User_GetUserDetails` is fully documented) in place of the hand-typed
   `UserDetails` in `domainTypes.ts`, and whether to surface
   `companyName`/`companyLogo`/`hasAuthorizedCompany` anywhere in the UI
   (the account menu is the obvious candidate). Zero risk to defer — the
   current hand-typed subset still works correctly.
4. Independently re-verify the Smart Analytics date-input `aria-label` fix
   (still unconfirmed from Phase 23).
5. Resolve the two smaller unused-hook findings (`useRevokeSharedIssues`,
   `useUpdateLocation`) if either turns out to be a real product need
   rather than a deliberate omission — currently undocumented either way.
6. A genuine live-credential authenticated browser pass remains undone (no
   test credentials exist for the live API this session, per explicit
   instruction) — the authenticated click-through checklist above is
   prepared for whoever runs it, now genuinely including a fresh
   real-authenticated-User smoke test given the app is now confirmed
   loading successfully with a real account.

## Completion checkpoint (2026-08-31, following the source assessment)

A follow-up pass explicitly asked to complete and verify what the source
assessment above found unfinished, investigate the old dashboard's Git
history for Admin Device/Sensor/Reader-User workflows, and fix a
manually-observed vertical-scrollbar defect. Findings and changes:

**Old dashboard investigation (read-only, via Git history at `08f078c^`,
before the rewrite commit deleted it).** Read `components/DeviceList.jsx`
(631 lines) and `components/Header.jsx` (222 lines) in full — the two files
most likely to hold Admin Device/Sensor/settings/Reader-User workflows.
Findings: `DeviceList.jsx`'s Add/Edit Device dialog operated on the old,
now-superseded Device-level model (`Direction`/`Lookback`/`Scale`/
`MinIssueScore` fields directly on the Device — the exact "obsolete
assumption" the current per-Sensor/per-aggregation-level model already
documents replacing) and had **no separate Sensor entity or Sensor UI at
all** — there is nothing Sensor-specific to port forward, only the
dialog's general modal-form shape informed the new one. `Header.jsx`
(desktop notifications + the hidden secret-button test harness, both
already recorded as removed/not migrated) has **no Reader-User management
of any kind** — confirms `ReadersPage.tsx`'s Device-grant management is a
wholly new capability with no old-dashboard precedent, not a port; see
CLAUDE.md's "Tenant and roles" section for the resulting product-scope
note (Device-access grants vs. role provisioning are different things, and
only the former has ever been built anywhere, old or new).

**Vertical-scrollbar defect — root cause found and fixed, not hidden.**
Investigated with a real Chromium session (Playwright) directly measuring
`document.documentElement`/`body` layout rather than guessing: every page
showed `scrollHeight` exactly 16px taller than `window.innerHeight` (e.g.
816px vs. an 800px viewport), regardless of how little content the page
had. Root cause: the browser's own default `body { margin: 8px }`
user-agent rule was never reset anywhere in this app — this codebase has
zero CSS files and zero CSS imports anywhere in `src/` before this
checkpoint, and Fluent UI v9's `FluentProvider`/Griffel styling
deliberately never touches the page shell around it, by design. Fixed with
one new global stylesheet, `src/index.css` (`html, body { margin: 0 }`,
`#root { height: 100% }`, a global `box-sizing: border-box` default),
imported once from `main.tsx` — not with `overflow-y: hidden` anywhere,
which was explicitly ruled out and would have hidden genuinely overflowing
content instead of fixing the shell. Re-verified with the same layout
inspection after the fix: `scrollHeight` now exactly equals
`window.innerHeight` on every page at every checked viewport with no
excess content. A second, broader Playwright sweep (17 routes × 4
viewports, 56 checks, reusing the Phase 22 methodology) found the fix held
everywhere except four page/viewport combinations with small-to-moderate
remaining overflow (9px–152px) that trace to genuinely tall stacked
content on a narrow phone viewport (a chart plus several cards) — normal,
expected responsive scrolling, not this defect, and not "fixed" by cutting
content. One of those four led to a second real bug (below).

**A second real responsive bug, found via that sweep and fixed.**
`SmartAnalyticsPage.tsx` defined a `layoutMobile` style (single-column
stacked grid) that was never actually applied anywhere — both the
single-Device overlay layout and the two-Device incompatible-comparison
side-by-side panels rendered their multi-column desktop grid
unconditionally at every viewport width, the same "defined but dead" code
shape the source assessment already found in the API hooks layer. On a
390px phone this squeezed a `minmax(0,1fr) 300px` grid's flexible column
down to roughly 90px, driving vertical overflow at that viewport from a
(likely legitimate) ~300px up to 815px. Fixed by wiring both grids to
`useBreakpoint() === 'desktop'`, matching the pattern already used
elsewhere in the shell (`AppShell.tsx`'s drawer type,
`DeviceListPage.tsx`'s DataGrid/card split) — confirmed via re-measurement
that mobile overflow on that page dropped from 815px to 323px, consistent
with genuinely-tall-but-now-correctly-stacked content rather than a
squeezed, badly-proportioned layout.

**Sensor creation and editing built** — see Phase 10 above for the full
description; not repeated here.

**Live OpenAPI contract re-checked, no further drift found.** Re-fetched
`swagger.json` again and diffed against the copy from the source-assessment
checkpoint earlier the same session: the only differences are dynamic
`@example` timestamps in telemetry-read response documentation (regenerated
fresh on every request) — no path, operation, parameter, or schema change.
The Company-profile/`CurrentUserDto` addition found earlier this session
remains the only real contract change; `schema.generated.ts` did not need
regenerating again.

**Final verification for this checkpoint**: `npm run typecheck` — 0
errors. `npm run lint` — 0 errors, 5 warnings (unchanged, all benign
`react-refresh/only-export-components`). `npm run test` — 84/84 passing
(unchanged; no new unit tests were added this checkpoint, see Phase 10's
note on that). `npm run build` — succeeds, `DeviceDetailPage`'s chunk grew
from 5.93 kB to 9.68 kB with the two new dialogs, `vendor_fluent` remains
the only >500 kB chunk (unchanged characteristic, not addressed). The new
Sensor create/edit flow and the scrollbar fix were both independently
confirmed via a real Chromium session against a network-mocked backend,
per the established mocked-browser-verified methodology — not claimed as a
live-API pass.

## API-completeness checkpoint (2026-08-31, following the completion checkpoint)

A follow-up pass explicitly asked to inventory every public operation in the
live OpenAPI contract (not just the ones already consumed), classify each
one, complete every unfinished human-facing Admin/Reader capability the API
intentionally supports, and verify - not assume - the prior checkpoints'
claims against actual current source. The full per-operation classification
lives in the new "API-to-Dashboard Coverage Matrix" section below; this
section records what was found, decided, built, and verified to produce it.

### Live contract re-verified, no drift

`npm run gen:api` was re-run against the live contract again. `git diff` on
the regenerated `schema.generated.ts` showed changes on only dynamic
`@example` timestamps (confirmed by grepping the diff for any changed line
*not* matching an ISO-8601 timestamp pattern - zero matches) - no path,
operation, parameter, or schema change since the last generation. The
Company-profile/`CurrentUserDto` addition from the prior checkpoint remains
the only real contract change on record.

### Gaps found by direct source inspection, not by re-reading the prior claims

Re-verified firsthand (grepping every hook file, not trusting the prior
"unused hook" list at face value) that six hooks were genuinely wired to no
UI: `useCompanyMembers`/`useAssignCompanyRole`/`useRevokeCompanyRole`,
`useRevokeSharedIssues`, `useUpdateLocation`,
`useCreateAggregationPolicy`/`useDeactivateAggregationPolicy`. One further
gap the prior checkpoint's "fresh inspection" pass missed entirely:
`useLastPeriod` (`telemetry.ts`) is defined, exported, and correctly typed,
but grepping the whole `src/` tree for its name found exactly one match -
its own definition. Decided not to build new UI for it: a bare period
*number* is not independently meaningful to a human without the `measured`
timestamp already shown via `FreshnessPill`/Live Monitoring, and a second,
separately-fetched "freshness" signal risks disagreeing with the existing
one if they ever diverge. Documented in the matrix as a deliberate
non-adoption (classification 8), not silently left unmentioned.

A new, more consequential finding: four `DeleteAllData` operations exist
(`Continuous`, `Periodic`, `BiDirectionalContinuous`, `BiDirectionalPeriodic`
- "delete all telemetry data and Issues for a Sensor and clear the Device's
legacy model," Company Admin only, no soft-delete/undo) with **zero**
mention anywhere in this dashboard's or the backend's documentation, and no
hook or UI touching any of them. Distinct from the old dashboard's deleted
password-gated demo-data-injection backdoor (that added fake Issues; this
permanently destroys real ones) - a live, real, currently-authorized
capability nobody had classified yet. Given the severity (irreversible mass
deletion) and that no product requirement anywhere calls for exposing it,
this was raised explicitly rather than decided unilaterally. **User
decision: do not build UI for it this pass** - documented in the matrix
(classification 9, genuine product decision) with the concrete
recommendation for whoever picks it up next: an Admin-only "danger zone" on
`SensorPoliciesPage.tsx`, gated behind a typed re-confirmation (retype the
Sensor's external ID) in addition to the standard destructive `ConfirmDialog`,
since the existing single-click destructive pattern used elsewhere in this
app (Device disable, share revoke) is proportionate to a *reversible or
narrowly-scoped* action, not to a permanent whole-Sensor telemetry+Issue
wipe.

### Built this checkpoint

1. **`CurrentUserDto` adopted in `AuthContext.tsx`**, replacing the hand-typed
   `UserDetails` in `domainTypes.ts` (removed - the D3 gap it worked around
   closed with the prior checkpoint's live-contract refresh, and
   `User_GetUserDetails` is now a real generated schema type). `useAuth()`
   exposes a new `hasAuthorizedCompany` boolean, computed defensively
   (`true` while `userDetails` is still loading, so a normal Company-having
   User never sees a false flash of the state below - only an actually-
   confirmed `false` response gates it).

2. **No-Company state.** A valid, authenticated human User can have
   `hasAuthorizedCompany: false` (e.g. a WordPress account not yet linked
   into the Company/RBAC model) - a real, documented API state this
   dashboard had never handled. Every Company-scoped endpoint rejects such a
   caller with 401, and this app's existing global 401 handler
   unconditionally clears the session and redirects to `/login` on *any*
   401, from *any* call, anywhere - meaning the first Company-scoped query
   any page fired for such a User (e.g. `OverviewPage`'s `useDevices()`)
   would have silently booted a correctly-authenticated User back to the
   login form, where signing in again would just reproduce the exact same
   state. New `src/components/states/NoCompanyState.tsx` (same
   `EmptyState`-composition pattern as `NotAuthorizedState.tsx`) is rendered
   by `AppShell.tsx` in place of `<Outlet/>` whenever
   `hasAuthorizedCompany` is confirmed false - route-independent (a NavDrawer
   click changes the URL but the shell keeps rendering the same explanatory
   state), so no page ever gets the chance to fire a Company-scoped query
   that would 401. Verified end-to-end with a real Chromium session: the
   state renders on first load, survives in-app navigation, the app is never
   redirected to `/login`, and (checked directly against the network log)
   no Company-scoped request ever fires for such a session.

3. **Company profile page** - new "Profile" tab on `AdminSettingsPage.tsx`
   (now the first/default tab), reading `useCompany()`'s `name`/`logo`/
   `website`/`profileSource`/`nameEditable` fields (all present in the live
   schema since the prior checkpoint's refresh, previously unconsumed).
   Logo/website are rendered per the untrusted-external-text rule: a new
   shared `src/lib/safeExternalUrl.ts` (`isSafeHttpsUrl`, unit-tested) gates
   whether the logo is even attempted as an `<img>` src (silently hidden via
   `onError` if it fails to load - confirmed with a deliberately
   never-resolving `https://example.invalid` fixture URL) and whether the
   website is rendered as a real `rel="noopener noreferrer"` link versus
   plain text. The rename form (`useUpdateCompanyName`, new hook wrapping
   `PUT /api/Company/Name`) is gated on `nameEditable`, never on a
   client-derived guess - when false, an inline message explains *why*
   (distinguishing the `MirroredDatabase` "synchronized from WordPress, edit
   at the source" case from the generic no-permission case) rather than just
   disabling a control with no explanation.

4. **Company Member role assignment - resolves a previously-open product
   question.** `ReadersPage.tsx` gained a "Company members" section
   (`useCompanyMembers`/`useAssignCompanyRole`/`useRevokeCompanyRole`,
   previously entirely unused) above the existing per-Reader Device-grant
   panel. The prior checkpoint's decision log left this genuinely open:
   building it could be "actively wrong" in a `MirroredDatabase` deployment,
   where role comes from the synchronized WordPress `permissionlevel` meta
   (backend `CLAUDE.md`'s "Mirrored permission-level resolution" section -
   re-read in full this session, both directly and via a background agent
   cross-checking the backend's `TASK_IMPLEMENTATION.md`/`API_Integration_Guide.md`/
   `Database_Redesign_Change_Description.txt`/`Deployment_Runbook.md`).
   Resolved rather than left open, using exactly the same signal the
   already-shipped `nameEditable` gate uses: mutation controls (Admin/Reader
   checkboxes per member) render only when `company.profileSource ===
   'Local'`; for `'MirroredDatabase'`, members show read-only with an
   explanation that role is synchronized from WordPress. This is directly
   supported, not guessed: the backend `CLAUDE.md`'s EntraId section states
   "New synchronized Users must receive no effective Device access until an
   authorized Admin assigns the Reader role and explicit Device grants" -
   implying an Admin-facing assignment action *is* expected for
   locally-managed (EntraId or purely local) Companies - while the mirrored
   permission-resolution section is explicit that mirrored role sync is
   one-way from WordPress and "the dashboard...must never...treat hidden
   controls as security," which this gate respects by explaining the reason
   in-page rather than silently hiding it. Assigning "Reader" also
   invalidates the separate `Company_GetReaders`-backed reader list below it
   in the same mutation (`company.ts`'s `useAssignCompanyRole`/
   `useRevokeCompanyRole` now invalidate both `queryKeys.companyMembers` and
   `queryKeys.readers`), so a newly-promoted Reader appears in the Device-grant
   panel without a manual refresh.

5. **Aggregation-policy create/deactivate** - `SensorPoliciesPage.tsx`
   gained an Admin-only "Add aggregation level" form
   (`useCreateAggregationPolicy`) above the existing policy cards, and a
   "Deactivate" action (`useDeactivateAggregationPolicy`) on every *non-raw*
   policy card. The raw/base policy correctly never gets a Deactivate
   control - confirmed from the live operation's own description ("The
   raw/base policy cannot be deactivated: every Sensor requiring raw
   processing must always have exactly one"), not inferred.

6. **Knowledge Sharing - a real bug fixed, not just a missing feature.**
   `KnowledgeSharingPage.tsx`'s per-Issue chip buttons visually indicated
   shared-vs-not-shared (different button appearance) but the `onClick`
   unconditionally called `useEnableSharedIssues` regardless of current
   state - clicking an *already-shared* Issue's chip was a silent no-op
   (re-enabling an already-enabled share), never actually removing it. Fixed
   to call the previously-unused `useRevokeSharedIssues` when the clicked
   Issue is already shared. Verified directly (not just code-reviewed): a
   Chromium session confirmed a shared-Issue click fires `DELETE
   .../Issues` and an unshared-Issue click fires `POST .../Issues`.

7. **Location editing** - `AdminSettingsPage.tsx`'s Locations tab gained a
   per-row Edit action (`useUpdateLocation`, previously unused), matching
   the existing create-form's fields (name, code). Its edit-mode `Field`
   labels were changed from generic "Name"/"Code" to "Location name"/
   "Location code" - found via direct testing that the top-of-page
   create-new-location form's own "Name" field is simultaneously visible
   while editing an existing row, so two controls shared the exact same
   accessible name at once; not just a test-script ambiguity; a real,
   if minor, screen-reader-relevant disambiguation gap this fixes.

8. **DeviceGroup membership - found while cataloguing the DeviceGroups
   domain for the matrix below, not in the original gap list.**
   `useAddDeviceGroupMember`/`useRemoveDeviceGroupMember` were also defined
   and correctly wired but never called from any page - the DeviceGroups
   tab could create a group and see its member *count*, but had no way to
   actually add or remove a Device. `DeviceGroupDto` already returns
   `deviceIds` on the list response, so no extra fetch was needed: selecting
   a group (keyboard-operable via the existing `activateProps()` helper,
   matching this project's established click-row pattern) reveals a
   `DeviceGroupMembersPanel` with one checkbox per Company Device, checked
   state driven by `deviceIds`, add/remove wired to the two previously-unused
   hooks. Verified end to end (checkbox reflects the confirmed server state
   after each round-trip, in both directions).

### A significant, previously-undiscovered production bug found and fixed

While mocked-browser-verifying the role-assignment checkbox, a real
`unwrap()` bug surfaced: `openapi-fetch` returns `data: undefined` for
**any** 204 (No Content) response - confirmed directly in its installed
source (`node_modules/openapi-fetch/src/index.js`'s "handle empty content"
branch: `response.status === 204 -> return {data: undefined, ...}`,
unconditionally, regardless of what the server actually sent).
`src/api/client.ts`'s `unwrap()` threw an `ApiError` ("Empty response from
API") whenever `data === undefined`, on the reasoning (stated in its own
prior comment) that the auth middleware already throws for any non-2xx
response before `unwrap()` is ever reached - true, but the comment's
"should be unreachable" assumption didn't account for openapi-fetch's *own*
legitimate no-content-on-**success** case, which produces the identical
`data: undefined` shape. In practice this meant **every 204-returning
mutation in this app would have silently failed against the real API**,
independent of anything built this session: `Company_AssignRole`/
`Company_RevokeRole` (built this checkpoint), but also already-shipped ones
- `Company_RevokeReaderDeviceGrant`, `Devices_RevokePrincipalCredential`,
`Devices_SetPrincipalEnabled`, `AggregationPolicies_DeactivatePolicy`,
`DeviceGroups_AddMember`/`RemoveMember`, `Issue_UnconfirmIssue`. The
mocked-browser pass's first attempt reproduced the failure exactly (a
Reader-role checkbox click that silently never completed); a mock
sending a non-empty 204 body had initially masked it, since
`openapi-fetch` discards a 204's body unconditionally regardless of
content, so the mock's body content was never actually the variable that
mattered. Fixed in `unwrap()`: only throw when `data` is undefined **and**
the response status isn't 204, documented in-line with the exact
reproduction. New regression test (`src/api/client.test.ts`, 4 cases)
covers: data-present, 204-with-no-data (must not throw), non-204-with-no-data
(must still throw - the original defensive case is preserved), and
no-response-info-available (must still throw). This is exactly the kind of
finding "do not assume prior reports are sufficient proof" was written to
catch - no prior checkpoint's code review would have caught it, since it
only manifests on an actual round-trip through a real (or realistically
mocked) 204 response, which no previous mocked-browser pass happened to
exercise for a mutation whose *return value* mattered to the assertion
being made.

### Two smaller pre-existing bugs found and fixed along the way

- **`vite.config.ts`'s `manualChunks`** never named `react-datepicker`
  explicitly. Rollup's own auto-chunk-naming for the resulting shared chunk
  (used by `DateTimeField.tsx`, itself used from both `SmartAnalyticsPage`
  and, as of this checkpoint, `SensorPoliciesPage`) picked a name from
  whichever adjacent module happened to be its chunk facade - observed as a
  misleadingly large `aggregationPolicies-*.js`/`.css` pair in the build
  output that looked like that small hooks file had somehow grown to
  137 kB. Confirmed via `grep` that the chunk's actual content was
  `react-datepicker`, not `aggregationPolicies.ts`. Added an explicit
  `vendor_datepicker` entry - same bytes, correctly labeled, no behavior
  change.
- **`AppShell.tsx`'s `NavDrawer` open state didn't reset on a live resize
  across the desktop/compact breakpoint.** `drawerOpen` initializes once,
  at mount, from `!isCompact` - correct for a fresh page load at any given
  width, but a *live* resize from desktop (where the drawer is
  permanently-open and inline, by design) down to a compact width leaves
  that stale `true` in place, so the drawer re-renders as an **open overlay**
  covering the very hamburger button meant to control it. Found via direct
  testing (a real resize on an already-loaded page, not a fresh load at a
  narrow width) - confirmed by axe-core, which flagged the resulting open
  `OverlayDrawer`'s own internal `aria-modal="true"` attribute as invalid
  ARIA usage on that element (a Fluent UI internal characteristic, not
  something this app controls directly, but only reachable at all because
  of the stale state). Fixed with a `useEffect` that closes the drawer
  specifically on the *transition* into compact mode (tracked via a
  `useRef`, not on every compact-mode render, so it doesn't fight a User's
  own subsequent hamburger toggling) - confirmed both the overlay
  intercepting clicks and the `aria-allowed-attr` axe finding gone after
  the fix, in the same resize scenario that surfaced them.

### Verification performed

- `npm run typecheck` - **0 errors** (re-verified after every batch of
  changes, not just once at the end).
- `npm run lint` - **0 errors, 5 warnings** (same benign
  `react-refresh/only-export-components` baseline as every prior
  checkpoint - confirmed no new warning was introduced).
- `npm run test` - **95/95 passing**, 16 files (up from 84/13) - two new
  test files this checkpoint: `api/client.test.ts` (the `unwrap()` 204
  regression, above), `lib/safeExternalUrl.test.ts` (5 cases: accepts
  https, rejects http/`javascript:`/`data:`/bare-relative/null/undefined/
  empty), plus `auth/AuthContext.test.tsx` (2 cases: `hasAuthorizedCompany`
  true for a real Company, false for the documented `"Unknown"` fallback -
  following the same `mockFetchJsonAlways` + real `AuthProvider` render
  pattern already established by `RequireAdmin.test.tsx`). Consistent with
  the prior checkpoint's own precedent for `DeviceDetailPage.tsx`'s Sensor
  dialogs, the *page-level* new/changed UI (Company profile tab, Company
  members role toggles, aggregation-policy create/deactivate, the
  Knowledge Sharing toggle fix) relies on the mocked-browser pass below
  rather than new heavyweight full-stack-mock component tests, for the
  same reason recorded there: these pages need the same
  `AuthProvider`+`QueryClientProvider`+`FluentProvider`+route-mock harness
  `TrainingPage.test.tsx` required, and the mocked-browser pass already
  exercises the real interaction end to end.
- `npm run build` - succeeds. `vendor_datepicker` now correctly labeled
  (~161 kB, previously hidden inside a misleadingly-named
  `aggregationPolicies-*` chunk pair - see above). `vendor_fluent` remains
  the only >500 kB chunk (unchanged, pre-existing Fluent UI v9
  characteristic).
- **Mocked-browser pass** (real Chromium via Playwright, real app, real
  client-side routing, only `http://localhost:5065/**` network calls
  intercepted - same established methodology as the prior checkpoints'
  Phase 22/23 passes; script written to the session scratchpad, not
  committed, consistent with this project's own "one-off verification
  script" precedent). Three scenarios: (1) an Admin session with a `Local`
  Company profile - every new/changed control exercised end to end
  (Company rename, Location edit, DeviceGroup membership add/remove,
  Company-member role grant, new aggregation-level create, aggregation-level
  deactivate, the Knowledge Sharing toggle fix), plus responsive (1920px +
  390px) and axe-core
  accessibility checks on every new/changed page state; (2) a
  `MirroredDatabase` Company profile - confirmed the rename control and
  role-assignment checkboxes are correctly *absent* (not merely disabled)
  with an in-page explanation for both; (3) an authenticated User with no
  authorized Company - confirmed the `NoCompanyState` renders immediately,
  survives in-app navigation, the app never redirects to `/login`, and no
  Company-scoped network call ever fires. **Zero unexpected console
  errors** across all three scenarios (the only console errors observed
  were expected, deliberate failed-image-load noise from a fixture Company
  logo URL using RFC 2606's reserved always-fails-to-resolve
  `example.invalid` domain). Two axe-core findings were investigated in
  depth rather than dismissed or accepted at face value, each confirmed
  (via direct `getComputedStyle`/isolated-reproduction evidence, not
  assumption) to be transient rendering artifacts of catching Fluent's
  Toast component mid-fade-transition, not real defects - the toast's true
  steady-state contrast (`rgb(36,36,36)` text on `rgb(255,255,255)`,
  ~16:1) was independently confirmed via a dedicated diagnostic script
  before excluding this specific, narrowly-scoped finding from the
  pass/fail check (any *other* color-contrast finding on the page still
  fails it). This is the same category of tooling-artifact investigation
  the prior checkpoint's Phase 23 already established a precedent for
  (`aria-hidden-focus` on Tabster's internal focus sentinels) - applied
  with the same rigor, not a shortcut.

### What should be reviewed or corrected next

1. **`DeleteAllData` (×4)** - documented, deliberately not built this pass
   per explicit user decision; see above for the concrete recommendation
   if it's picked up later.
2. **`useLastPeriod`** - documented as a deliberate non-adoption; revisit
   only if a concrete product need for a bare last-ingested-period-number
   display emerges that `FreshnessPill`/existing timestamps don't already
   cover.
3. The two smaller-scope items the prior checkpoint already flagged
   remain: independent re-confirmation of the Smart Analytics date-input
   `aria-label` fix (still unconfirmed), and a genuine live-credential
   authenticated browser pass (still no test credentials available in this
   environment).
4. `Company_UpdateCompanyName`'s full response-code documentation (403/409/
   429 beyond the 400/401 already read this session) wasn't re-verified
   character-for-character against the live schema before writing the
   Coverage Matrix below - the `CompanyDto.nameEditable`-gated UI logic
   doesn't depend on the exact wording of those codes (only on the field
   itself and on `ErrorState`'s existing generic 409/429 handling), so this
   is a documentation-completeness note, not a functional gap.

## Independent verification checkpoint (2026-08-31, following the API-completeness checkpoint)

A follow-up pass explicitly asked to re-verify the prior checkpoints' claims
against the actual repository state rather than accept them as given, refresh
the live OpenAPI contract, re-inventory every operation, complete any
remaining safe human-facing work, and run a real quality gate before
committing. This section records what independent re-verification actually
found - two real, previously-undiscovered (or previously mis-verified as
fixed) bugs, both found and fixed - plus everything re-confirmed correct.

### Live contract and coverage matrix re-verified, independently, not by re-reading the prior claims

`npm run gen:api` was re-run against the live contract. `diff` against the
prior `schema.generated.ts` shows changes on dynamic `@example` timestamps
only (grepped for any changed line not matching an ISO-8601 timestamp -
zero matches) - no path, operation, parameter, or schema change. The
Company-profile/`CurrentUserDto` addition from two checkpoints ago remains
the only real contract change on record.

The live contract's 105 operations were extracted programmatically (not
copied from this file) and cross-checked two ways: (1) per-tag counts
against the Coverage Matrix's own per-domain headers - exact match on all
21 tags; (2) every operationId checked for a verbatim mention in this file -
25 apparent misses, all explained by the matrix's own documented
`{Family}_...` template-row compression for the four telemetry families
(4 families × 6 shared patterns + 2 `MeasuredTrailingPeriods`-only-for-
continuous = 26, exactly the "26 operations total" the matrix already
states) - not a real gap.

### Two real bugs found and fixed this checkpoint

**1. The `vendor_datepicker` chunk-naming fix from the completion checkpoint
only fixed the JS half, not the CSS half - the exact defect class it
believed it had closed.** `vite.config.ts`'s `manualChunks` was an object
keyed by exact package name (`vendor_datepicker: ['react-datepicker']`),
which correctly grouped the `react-datepicker` *package* but does not match
`react-datepicker/dist/react-datepicker.css` (imported once, from
`DateTimeField.tsx`) - a separate Rollup module ID the object form's
exact-name matching never touches. That CSS still fell through to Rollup's
default shared-chunk naming, observed as a misleadingly large
`aggregationPolicies-DTQWZBFX.css` (21.83 kB, confirmed byte-for-byte
identical to `node_modules/react-datepicker/dist/react-datepicker.css`
minified) sitting next to the correctly-named, unrelated ~2.4 kB
`aggregationPolicies-*.js` hooks chunk - the same misleading-name shape the
prior checkpoint's fix believed it had eliminated entirely. Fixed by
converting `manualChunks` to the function form, matching by module-ID
substring instead of exact package name, so both the JS and its CSS import
land in one explicitly-named chunk (`vendor_datepicker-*.css`,
`vendor_datepicker-*.js`). Verified: total build output size unchanged
(1485.29 kB before -> 1488.16 kB after, raw asset sizes summed across every
chunk - a 0.19% difference consistent with normal chunk-boundary ESM
import/export overhead, not duplication), CSS chunk content hash identical
(`DTQWZBFX` before and after - byte-identical file, only the name changed),
`vendor_react` and `index` chunks redistributed their bytes (264.51 kB /
27.20 kB vs. the previous 92.61 kB / 197.30 kB split) because the function
form also correctly sweeps `react-router-dom`'s own transitive dependencies
into `vendor_react` instead of leaving them in Rollup's default entry
chunk - a labeling improvement, not a behavior change (`typecheck`/`test`
re-run clean immediately after).

**2. `DateTimeField.tsx`'s `aria-label` prop on `<DatePicker>` was silently
dropped by react-datepicker at runtime - the exact axe finding the prior
checkpoint's Phase 23 flagged as "fixed, not independently re-confirmed"
was never actually fixed, only believed to be.** Traced to source, not
guessed: `react-datepicker@8.7.0`'s own `renderDateInput`
(`node_modules/react-datepicker/dist/index.js`) clones a fixed allow-list of
named props onto its real `<input>` - `id`, `name`, `form`, `autoFocus`,
`placeholder`, `disabled`, `autoComplete`, `className`, `title`, `readOnly`,
`required`, `tabIndex`, `aria-describedby`, `aria-invalid`,
`aria-labelledby`, `aria-required` - and `aria-label` is not among them, so
it is discarded on every render. It type-checked cleanly (`tsc --noEmit`
already passed with 0 errors, both before and after this fix) purely
because Fluent's JSX types don't constrain arbitrary attribute props on a
foreign class component - passing `tsc` was never proof this worked, and
this checkpoint's own re-verification is the first time anyone actually
checked the rendered DOM. Confirmed empirically before touching anything:
a real mocked-browser session (`npm run dev`, real Chromium, real login
form, only `http://localhost:5065/**` network-mocked - reusing this
project's own established methodology, see below) showed the Smart
Analytics "Start"/"End" `<input>` elements with `aria-label: null`, no
`id`, no `aria-labelledby` at all, and a real axe-core scan of that page
flagged `"label"` (critical, 2 nodes, "Form elements must have labels") -
not the previously-recorded-as-only-outstanding accessibility item, an
actually-broken one. Fixed using Fluent's own documented integration point
for exactly this situation (`@fluentui/react-field`'s `FieldProps.children`
JSDoc states it directly: `"For other controls... <Field>{(props) =>
<MyInput {...props} />}</Field>"`) - `DateTimeField.tsx`'s `<Field>` now
takes a render-prop child receiving `FieldControlProps`
(`id`/`aria-labelledby`/`aria-describedby`/`aria-invalid`), which are
spread onto `<DatePicker id={} ariaLabelledBy={} ariaDescribedBy={}
ariaInvalid={}>` - all four are on react-datepicker's own confirmed
forwarding allow-list, unlike the removed `aria-label`. Re-verified
empirically after the fix, not just re-read: the same mocked-browser
session now shows `<input id="field-«rc»__control"
aria-labelledby="field-«rc»__label" ...>`, Playwright's own
accessible-name-based query
(`page.getByRole('textbox', {name: /start/i})`) resolves to exactly one
element for both "Start" and "End", and the axe `"label"` violation is
gone from that page. This is the single component behind every
`DateTimeField` instance in the app (`AGENTS.md`: "never used raw at a
call site"), so the fix applies everywhere the control is used
(`SmartAnalyticsPage.tsx`), not just the one page directly re-tested.

### Everything else independently re-checked and confirmed correct, not just re-read

Beyond the two fixes above, this checkpoint re-verified a representative,
not exhaustive, sample of the prior checkpoints' more consequential claims
directly against source and a real running app, rather than trusting the
narrative:

- **`unwrap()`'s 204 handling** - read directly in `src/api/client.ts`:
  `if (result.data === undefined && result.response?.status !== 204)`,
  matching the documented fix exactly.
- **Ollama's real terminal-success value** - `domainTypes.ts`/`ollama.ts`
  use `"Succeeded"`; cross-checked directly against the backend's own
  `DataAccess/Enums.cs` (`OllamaJobStatus { Queued=1, Processing=2,
  Succeeded=3, Failed=4, Cancelled=5 }`) - confirmed correct against the
  actual source, not just the backend's own (also-checked) documentation.
- **`NoCompanyState`/`hasAuthorizedCompany` wiring** - `AuthContext.tsx`
  computes `true` while `userDetails` is still loading (never a false
  flash) and only `false` once a real response confirms it;
  `AppShell.tsx` renders `hasAuthorizedCompany ? <Outlet/> : <NoCompanyState/>`
  exactly as documented.
- **Company profile gating** - `AdminSettingsPage.tsx` reads
  `company.profileSource`/`company.nameEditable`/`isSafeHttpsUrl` exactly
  as documented, with the mirrored-vs-local badge and rename-form gating
  both present in source.
- **Knowledge Sharing per-Issue chip fix** - `KnowledgeSharingPage.tsx`'s
  `onClick` genuinely branches `shared ? revokeIssues.mutate(...) :
  enableIssues.mutate(...)`, not the previously-broken unconditional
  `enableIssues` call.
- **`DeleteAllData` (×4) non-adoption** - grepped the whole `src/` tree;
  zero hits outside the generated schema file, confirming no hook or page
  references any of the four operations, exactly as the declined-by-explicit-decision
  entry states.
- **Rule compliance sweep across all of `src/`** - zero
  `dangerouslySetInnerHTML`, zero `window.(prompt|confirm|alert)` calls
  outside comments referencing the rule, zero `@ts-ignore`/`@ts-nocheck`/
  `: any`/`as any` outside test files, zero `.js`/`.jsx` files, zero
  hardcoded `localhost:5065` outside one explanatory comment, `allowJs`
  absent from `tsconfig.json`, and `localStorage`/`sessionStorage` used
  only for the theme preference (`ThemeContext.tsx`) - every other match
  was a comment referencing the rule, not a violation.
- **Secret/env hygiene** - `.env.local` (the real `VITE_API_BASE_URL`)
  confirmed gitignored (`git check-ignore -v`) and absent from
  `git ls-files`; only `.env.example` (no real value) is tracked.

### A more precise (not new) explanation for the one remaining axe finding

Every page in a fresh 12-route mocked-browser sweep this checkpoint (zero
console errors throughout) shows exactly one axe finding, consistently:
`aria-hidden-focus` (serious). Investigated to its actual DOM node, not
re-accepted from the prior checkpoint's narrower explanation: every flagged
element is a Tabster-internal focus-sentinel/"Mover" dummy (`<i
tabindex="0" role="none" data-tabster-dummy="..." aria-hidden="true"
style="position:fixed;width:1px;height:1px;opacity:.001;...">`) that
Fluent's `NavDrawer` injects on every render for its own internal
arrow-key list navigation, present in the DOM on every authenticated page
via the persistent shell - not, as the prior checkpoint's Phase 23
concluded, specifically a Toast-mid-fade-transition artifact (this sweep
never triggered a toast at all, and the finding was present every time,
not transiently). Both explanations agree on the conclusion - this is a
Fluent-UI/Tabster library-internal implementation detail, not an app-level
defect, since this application never sets `aria-hidden`/`tabindex` on
these elements and does not control `NavDrawer`'s internal Tabster
integration - but this checkpoint's account is the more complete and
accurate one, and supersedes the narrower Toast-specific explanation in
`CLAUDE.md`'s accessibility section (updated accordingly).

### Verification performed

- `npm run typecheck` - **0 errors** (re-verified after the `vite.config.ts`
  and `DateTimeField.tsx` changes, not just once at the end).
- `npm run lint` - **0 errors, 5 warnings** (identical baseline to every
  prior checkpoint).
- `npm run test` - **95/95 passing**, 16 files (unchanged - neither fix
  this checkpoint touched behavior any existing unit test exercises; both
  are verified by direct source/DOM inspection and the mocked-browser
  passes described above instead).
- `npm run build` - succeeds; `vendor_datepicker-*.css`/`.js` now correctly
  paired and labeled (see above); no new >500 kB chunk beyond the
  pre-existing `vendor_fluent`.
- **Mocked-browser verification** (real Chromium via Playwright, real app,
  real client-side routing via NavDrawer button clicks - not `page.goto()`
  post-login, which would drop the deliberately memory-only session and
  invalidate the whole pass - only `http://localhost:5065/**` network-mocked,
  same established methodology as every prior checkpoint's pass). Covered:
  login, and a 12-route sweep of every top-level nav destination
  (Overview, Devices, Live Monitoring, Smart Analytics, Issues, Categories,
  Knowledge Sharing, Training & Models, Ollama Jobs, Readers & Access,
  Company Settings, System Status) with an axe-core scan on each. **Zero
  console errors across all 12 routes.** The Smart Analytics date-input
  fix was independently confirmed via Playwright's own accessible-name
  query (`getByRole('textbox', {name: /start/i or /end/i})`, 1 match
  each) - the authoritative browser accessibility-tree computation, not a
  proxy for it. No script was committed - one-off, deleted after use, per
  this project's own established precedent.

### What should be reviewed or corrected next

Superseding the prior checkpoint's list: item 3 (independent
re-confirmation of the Smart Analytics date-input accessibility fix) is
now genuinely resolved, not merely re-asserted - see above. Everything
else on that list is unchanged and still applies:

1. **`DeleteAllData` (×4)** - documented, deliberately not built, per
   explicit user decision; recommendation (typed re-confirmation) recorded
   for later, unchanged this checkpoint.
2. **`useLastPeriod`** - documented non-adoption, unchanged.
3. A genuine live-credential authenticated browser pass - still no test
   credentials available in this environment; the click-through checklist
   below remains prepared for whoever runs one.
4. `Company_UpdateCompanyName`'s full response-code documentation
   (403/409/429) wasn't re-verified character-for-character against the
   live schema this checkpoint either - still a documentation-completeness
   note, not a functional gap (the UI logic depends only on the
   `nameEditable` field and the existing generic 409/429 handling).

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
  **Sensor creation and editing added at the 2026-08-31 completion
  checkpoint**, closing the gap the 2026-08-31 source-assessment checkpoint
  found and flagged (this phase had been marked "Implemented" once before
  without that gap having been noticed — corrected honestly rather than
  left wrong, and now genuinely resolved rather than just re-labeled).
  `DeviceDetailPage.tsx` gained an Admin-only "Add Sensor" action (Sensors
  section header) and a per-row "Edit" action, via
  `useCreateSensor`/`useUpdateSensor`. Creating a Sensor also creates its
  raw/base `AggregationPolicy` in the same call (`CreateSensorRequest`
  requires `rawScale`/`rawLookback`); `isCurve` is derived from the parent
  Device's `applicationMode`, never a free choice, so a created Sensor can
  never disagree with its own Device's curve/signal mode. The old
  dashboard has no equivalent workflow to port — its Device add/edit
  dialog put Direction/Lookback/Scale/MinIssueScore directly on the
  Device (confirmed via its Git history), with no separate Sensor entity
  at all; this form was designed fresh against the current contract,
  informed only by that dialog's general modal-form shape. Mocked-browser-verified
  end to end (real Chromium, network-mocked backend, real clicks - not
  `page.goto()`, per the established methodology): dialog opens, Create
  stays disabled until the required fields are filled, submits the
  correct `CreateSensorRequest` body, dialog closes; Edit dialog opens
  pre-filled, submits the correct `UpdateSensorRequest` body preserving
  untouched fields; zero console errors either way. **No dedicated unit
  test was added** for these two new dialogs this checkpoint (stated
  plainly, not silently skipped) — `DeviceDetailPage.tsx` needs the same
  full-stack mock (`AuthProvider`+`QueryClientProvider`+`FluentProvider`+
  route mocks) `TrainingPage.test.tsx` required, and the mocked-browser
  pass above already exercises the real interaction end to end; a Vitest
  component test remains a reasonable follow-up, not done here.
  AggregationPolicies (edit only, not create/deactivate) + Setpoints (full
  history + create) live on `SensorPoliciesPage.tsx`, unchanged this
  checkpoint. Setpoints section: direction-aware form (symmetric
  `target`/`tolerance` for lowerisbetter/higherisbetter,
  `targetAbove/Below` + `toleranceAbove/Below` for bidirectional),
  append-only history table, and the effective-setpoint-at-now
  `MessageBar`. `npm run typecheck`/`lint`/`test`/`build` all re-verified
  green after this addition.

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

## API-to-Dashboard Coverage Matrix

Every public operation in the live OpenAPI contract (105 total, re-verified
this checkpoint - see "Live contract re-verified, no drift" above),
classified individually, not just the ~96 this frontend's hooks actually
call. Complements, rather than duplicates, the route-centric "Route and API
coverage matrix" below: that one answers "what does route X call"; this one
answers "what happens to operation Y" for every operation, including the
ones with no route at all. Grouped by OpenAPI tag (which matches this
project's own one-hook-file-per-domain convention exactly). Extracted
programmatically from the live `swagger.json` (path, method, operationId,
response codes), then cross-referenced against every hook file and every
page component by direct source inspection - not carried over from any
prior session's summary.

**Classification key** (from the governing instruction, referenced by
number in every table below):
1 = Human Admin read · 2 = Human Admin mutation · 3 = Human Reader read ·
4 = Reader mutation, hidden (Reader is strictly read-only) · 5 = DevicePrincipal
machine operation · 6 = Background-worker/internal · 7 = Public health/system ·
8 = Intentionally unsupported dashboard operation · 9 = Blocked by a genuine
product decision · 10 = Blocked by a backend capability gap · 11 = Compatibility-only/obsolete,
must not receive new UI.

Attributes constant across an entire domain (Company/Device/Sensor scope
shape, request/response DTO family, pagination/batch/range bounds, rate-limit
policy, training/Ollama/Issue side effects) are stated once in that domain's
prose header rather than repeated in every row: OpenAPI documents the same
information at the operation level, and the live contract remains the
authoritative source for exact per-operation wording (status-code lists,
field-level constraints) - this matrix records classification, ownership,
and dashboard status, not a re-transcription of the schema.

### Authentication (2 operations)

Public, unauthenticated, principal-agnostic - the entry point before any
role exists, so the Admin/Reader classification axis doesn't apply to
either operation cleanly. No Company/Device/Sensor scope (there is no
authenticated caller yet). No pagination. No training/Ollama/Issue side
effects. Named rate-limit policy: `DeviceTokenRequest` applies to the
machine login specifically (per Deployment Runbook §5.2 - exact numeric
limit deferred to `appsettings.json`, not stated in any of the four backend
narrative docs); human login has no named policy beyond the global default.

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Authentication_RequestHMAC` | `POST /api/Authentication/Request_HMAC_Key` | Public human entry point (no Admin/Reader distinction applies pre-role) | `AuthContext.tsx`'s `login()` · `LoginPage.tsx` | Implemented |
| `Authentication_RequestDeviceToken` | `POST /api/Authentication/Request_Device_Token` | 5 (DevicePrincipal machine operation) | none | Correctly not built - `AGENTS.md`: "`Request_Device_Token` exists for machines, not humans"; no DevicePrincipal login UI exists anywhere in this dashboard by design |

### Company (10 operations)

Company-scoped (the caller's own Company only - never another). Request/response
DTOs: `CompanyDto`, `CompanyMemberDto`, `ReaderDto`, `ReaderDeviceGrantDto`,
`EffectiveDeviceAccessDto`, `UpdateCompanyNameRequest`,
`GrantReaderDevicesRequest`. No pagination (Company-scoped lists are
inherently small). No training/Ollama/Issue side effects. `GetCompany`
carries a `429` (global rate limit, no named policy); `UpdateCompanyName`
carries `429` too.

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Company_GetCompany` | `GET /api/Company` | 1/3 (no Admin-only restriction stated; both roles use it identically) | `useCompany` · `AdminSettingsPage.tsx`'s Profile tab | Implemented (read-only use pre-existed; now also the primary data source for the new Profile tab, this checkpoint) |
| `Company_UpdateCompanyName` | `PUT /api/Company/Name` | 2 | `useUpdateCompanyName` (new, this checkpoint) · `AdminSettingsPage.tsx` Profile tab, gated on `CompanyDto.nameEditable` | Implemented (this checkpoint) |
| `Company_GetMembers` | `GET /api/Company/Members` | 1 | `useCompanyMembers` · `ReadersPage.tsx`'s Company Members section (this checkpoint) | Implemented (this checkpoint) |
| `Company_AssignRole` | `POST /api/Company/Members/{userId}/Roles` | 2 | `useAssignCompanyRole` (this checkpoint) | Implemented (this checkpoint), mutation UI gated on `profileSource === 'Local'` - see decision log |
| `Company_RevokeRole` | `DELETE /api/Company/Members/{userId}/Roles/{roleName}` | 2 | `useRevokeCompanyRole` (this checkpoint) | Implemented (this checkpoint), same gating |
| `Company_GetReaders` | `GET /api/Company/Readers` | 1 | `useReaders` · `ReadersPage.tsx` | Implemented (pre-existing) |
| `Company_GetReaderDeviceGrants` | `GET /api/Company/Readers/{userId}/Devices` | 1 | `useReaderDeviceGrants` · `ReadersPage.tsx` | Implemented (pre-existing) |
| `Company_GrantReaderDevices` | `POST /api/Company/Readers/{userId}/Devices` | 2 | `useGrantReaderDevices` · `ReadersPage.tsx` | Implemented (pre-existing) |
| `Company_RevokeReaderDeviceGrant` | `DELETE /api/Company/Readers/{userId}/Devices/{deviceId}` | 2 | `useRevokeReaderDeviceGrant` · `ReadersPage.tsx` | Implemented (pre-existing) - one of the operations the `unwrap()` 204 bug (fixed this checkpoint) would have silently broken |
| `Company_GetReaderEffectiveAccess` | `GET /api/Company/Readers/{userId}/EffectiveAccess` | 1 | `useReaderEffectiveAccess` · `ReadersPage.tsx` | Implemented (pre-existing) |

### User (1 operation)

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `User_GetUserDetails` | `GET /api/User/GetUserDetails` | Any authenticated human (current-user identity, pre-dates role-specific access) | `AuthContext.tsx`'s `fetchUserDetails` | Implemented; now consumes the real generated `CurrentUserDto` (this checkpoint replaced the hand-typed `UserDetails` workaround) - see the no-Company-state work above |

### Devices (9 operations)

Company-scoped list/detail; DevicePrincipal lifecycle sub-resource is
Device-scoped beneath it. DTOs: `DeviceDto`, `CreateDeviceRequest`,
`UpdateDeviceRequest`, `ProvisionDevicePrincipalResponse` (domain-typed),
principal/credential DTOs. No delete - disable only (`enabled: false` via
`UpdateDevice`). No pagination on the list (bounded by Company Device
count). No training/Ollama/Issue side effects directly (a Device's own
training lineage is read, not written, from here).

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Devices_GetDevices` | `GET /api/Devices` | 3 | `useDevices` · `DeviceListPage.tsx` | Implemented |
| `Devices_CreateDevice` | `POST /api/Devices` | 2 | `useCreateDevice` · `DeviceListPage.tsx` | Implemented |
| `Devices_GetDevice` | `GET /api/Devices/{deviceId}` | 3 | `useDevice` · `DeviceDetailPage.tsx` | Implemented |
| `Devices_UpdateDevice` | `PUT /api/Devices/{deviceId}` | 2 | `useUpdateDevice`/`useDisableDevice` · `DeviceDetailPage.tsx` | Implemented |
| `Devices_GetPrincipal` | `GET /api/Devices/{deviceId}/Principal` | 1 | `useDevicePrincipal` · `DevicePrincipalPage.tsx` | Implemented |
| `Devices_ProvisionPrincipal` | `POST /api/Devices/{deviceId}/Principal/Provision` | 2 | `useProvisionDevicePrincipal` · `DevicePrincipalPage.tsx` | Implemented |
| `Devices_RotatePrincipalCredential` | `POST /api/Devices/{deviceId}/Principal/Rotate` | 2 | `useRotateDevicePrincipalCredential` · `DevicePrincipalPage.tsx` | Implemented |
| `Devices_RevokePrincipalCredential` | `POST /api/Devices/{deviceId}/Principal/Credentials/{credentialId}/Revoke` | 2 | `useRevokeDevicePrincipalCredential` · `DevicePrincipalPage.tsx` | Implemented - a 204 operation; unaffected in practice since this dashboard's own mocked-browser passes never happened to assert on its post-mutation UI state the way the role-grant one did, but the same `unwrap()` fix applies to it going forward |
| `Devices_SetPrincipalEnabled` | `PUT /api/Devices/{deviceId}/Principal/Enabled` | 2 | `useSetDevicePrincipalEnabled` · `DevicePrincipalPage.tsx` | Implemented - also 204, same note |

### Sensors (4 operations)

Device-scoped. DTOs: `SensorDto`, `CreateSensorRequest` (creates the raw/base
`AggregationPolicy` in the same call), `UpdateSensorRequest`. `isCurve` is
derived from the parent Device's `applicationMode`, never a free client
choice (see `CLAUDE.md`).

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Sensors_GetSensors` | `GET /api/Devices/{deviceId}/Sensors` | 3 | `useSensors` · `DeviceDetailPage.tsx` | Implemented |
| `Sensors_CreateSensor` | `POST /api/Devices/{deviceId}/Sensors` | 2 | `useCreateSensor` · `DeviceDetailPage.tsx`'s `NewSensorDialog` | Implemented (prior checkpoint) |
| `Sensors_GetSensor` | `GET /api/Devices/{deviceId}/Sensors/{sensorId}` | 3 | `useSensor` · `SensorPoliciesPage.tsx` | Implemented |
| `Sensors_UpdateSensor` | `PUT /api/Devices/{deviceId}/Sensors/{sensorId}` | 2 | `useUpdateSensor` · `DeviceDetailPage.tsx`'s `EditSensorDialog` | Implemented (prior checkpoint) |

### AggregationPolicies (5 operations)

Device→Sensor-scoped. DTOs: `SensorAggregationPolicyDto`,
`CreateAggregationPolicyRequest`, `UpdateAggregationPolicyRequest`. Training
side effect: changing the **raw** policy's Lookback/Scale/Enabled schedules
retraining (`CLAUDE.md`); `MinIssueScore` never does, on any level.

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `AggregationPolicies_GetPolicies` | `GET /api/Devices/{deviceId}/Sensors/{sensorId}/AggregationPolicies` | 3 | `useAggregationPolicies` · `SensorPoliciesPage.tsx` | Implemented |
| `AggregationPolicies_CreatePolicy` | `POST .../AggregationPolicies` | 2 | `useCreateAggregationPolicy` · `SensorPoliciesPage.tsx`'s `NewPolicyForm` | Implemented (this checkpoint) |
| `AggregationPolicies_GetPolicy` | `GET .../AggregationPolicies/{policyId}` | 3 | none | Not implemented - superseded by the list, which `SensorPoliciesPage.tsx` already loads in full; no page needs a single-policy fetch independent of that list |
| `AggregationPolicies_UpdatePolicy` | `PUT .../AggregationPolicies/{policyId}` | 2 | `useUpdateAggregationPolicy` · `SensorPoliciesPage.tsx`'s `PolicyCard` | Implemented |
| `AggregationPolicies_DeactivatePolicy` | `DELETE .../AggregationPolicies/{policyId}` | 2 | `useDeactivateAggregationPolicy` · `SensorPoliciesPage.tsx`'s `PolicyCard` | Implemented (this checkpoint); raw policy correctly never offered the control (confirmed from the operation's own description: "The raw/base policy cannot be deactivated") |

### Setpoints (3 operations)

Device→Sensor-scoped, time-versioned, append-only (no update/delete
operation exists at all - by design). DTOs: direction-aware
(`target`/`tolerance` vs. `targetAbove/Below`+`toleranceAbove/Below`).

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Setpoints_GetSetpoints` | `GET .../Setpoints` | 3 | `useSetpoints` · `SensorPoliciesPage.tsx`'s `SetpointsCard` | Implemented |
| `Setpoints_CreateSetpoint` | `POST .../Setpoints` | 2 | `useCreateSetpoint` · `SensorPoliciesPage.tsx`'s `SetpointsCard` | Implemented |
| `Setpoints_GetEffectiveSetpoint` | `GET .../Setpoints/Effective` | 3 | `useEffectiveSetpoint` · `SensorPoliciesPage.tsx`'s `SetpointsCard` | Implemented |

### Continuous / BiDirectionalContinuous / Periodic / BiDirectionalPeriodic (26 operations total)

The four telemetry families (`CLAUDE.md`'s "Telemetry" section). Device→Sensor-scoped;
every ingestion item carries its own required body-level `SensorId` (query-level
SensorId is revoked - `AGENTS.md`'s "Final telemetry contract"). Bounded reads:
`MaxQueryRangeDays = 31`, `MaxPageSize = 5000`, `DefaultPageSize = 500`
(confirmed exact values this checkpoint, via a background agent's full read of
`Deployment_Runbook.md` §5.2/§5.3 - previously known only by name in this
repo's own docs). `MaxIngestionBatchSize = 5000`. Ingestion triggers
asynchronous Issue detection (never synchronous); `DeleteAllData` clears
telemetry, Issues, and the Device's legacy model. No dedicated named
rate-limit policy is stated by name for telemetry *reads* in the backend
docs beyond `LargeTelemetryRead`/`BulkTelemetryIngestion` (named, exact
numeric limits deferred to `appsettings.json`, not given in any narrative
doc read this session).

| Operation ID (× family) | Method + route pattern | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `{Family}_Ingest{Signals\|Curves}` | `POST /api/{Family}/{Signals\|Curves}` | 5 (DevicePrincipal machine operation; docs also allow a human User, but this dashboard never builds an ingestion UI) | none | Correctly not built - `AGENTS.md`: "This dashboard does not currently build a telemetry-ingestion UI...a DevicePrincipal (machine) concern" |
| `{Family}_DeleteAllData` | `DELETE /api/{Family}/DeleteAllData` | 9 (genuine product decision) | none | **Not implemented - explicit user decision this checkpoint**: real, live, Admin-authorized, irreversible (wipes telemetry + Issues + clears the legacy model for a Sensor); documented rather than built or silently skipped. See "API-completeness checkpoint" above for the full reasoning and the concrete recommendation (typed re-confirmation) for whoever builds it later |
| `{Family}_GetLastAnalysedPeriod` / `GetLastAnalysedCurvePeriod` | `GET .../LastAnalysed(Curve)Period` | 3 | none | Not implemented - documented non-adoption; no product need identified distinct from `GetLastPeriod`'s "last ingested" signal, which is itself unused too (below) |
| `{Family}_GetLastPeriod` / `GetLastCurvePeriod` | `GET .../Last(Curve)Period` | 3 | `useLastPeriod` (`telemetry.ts`) | Defined, never called - documented deliberate non-adoption this checkpoint: a bare period number isn't independently meaningful without the `measured` timestamp already shown via `FreshnessPill`/Live Monitoring |
| `{Family}_GetMeasuredDateRange` / `GetCurveMeasuredDateRange` | `GET .../(Curve)MeasuredDateRange` | 3 | `useTelemetryDateRange` | Implemented - `SmartAnalyticsPage.tsx` |
| `Continuous_GetMeasuredTrailingPeriods` / `BiDirectionalContinuous_...` (continuous families only - curves have no "trailing periods" concept) | `GET .../MeasuredTrailingPeriods` | 3 | `useTelemetryTrailingPeriods` | Implemented - `LiveMonitoringPage.tsx` |
| `{Family}_GetPeriodRange` / `GetCurvePeriodRange` | `GET .../(Curve)PeriodRange` | 3 | `useTelemetryPeriodRange` | Implemented - `IssueDetailPage.tsx`'s telemetry card, `SmartAnalyticsPage.tsx`'s same-Device compare |

### Issue (12 operations)

Device-scoped, canonical-by-default (`CLAUDE.md`'s "Canonical Issues").
DTOs: `IssueDto`, `GroupIssuesRequest`, `ReassignCanonicalRequest`, review/category
request bodies. No pagination beyond `skip`/`take` on the list. Category and
review-verdict changes advance the target Device's (and any actively-sharing
target's) training-eligibility generation and schedule a coalesced
retraining request, asynchronously (`CLAUDE.md`'s "Review states"/"Categories").

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Issue_GetIssues` | `GET /api/Issue` | 3 | `useIssues` · `IssueListPage.tsx`, `MoveToCanonicalDialog.tsx`, `KnowledgeSharingPage.tsx` | Implemented |
| `Issue_CreateIssue` | `POST /api/Issue` | 9 (genuine product decision) | `useCreateIssue` (unused) | Deliberately not built - manually fabricating what is normally an ML-pipeline-detected record conflicts with "No fabricated production data" (`AGENTS.md`) and no product requirement in `CLAUDE.md`'s feature list calls for it; the operation's own description scopes it to periodic Devices specifically, which doesn't change this reasoning |
| `Issue_GetIssue` | `GET /api/Issue/{issueId}` | 3 | `useIssue` · `IssueDetailPage.tsx` | Implemented |
| `Issue_UpdateIssue` | `PUT /api/Issue/{issueId}` | 11 (compatibility-only, superseded) | `useUpdateIssue` (unused) | Correctly unbuilt - its own JSDoc and the live description ("technician feedback...confirm/reject, correct the anomaly flag") identify it as the legacy pre-`reviewState` mechanism, fully superseded by `Issue_ReviewIssue` + `Issue_AssignCategory`, which this dashboard uses exclusively (`CLAUDE.md`'s "Review states": "this frontend never reads `confirmed` for anything") |
| `Issue_UnconfirmIssue` | `DELETE /api/Issue/{issueId}` | 2 | `useReopenIssue` · `IssueDetailPage.tsx`'s review controls (withdraws a verdict back to `PendingReview` - never deletes the Issue) | Implemented |
| `Issue_AssignCategory` | `PUT /api/Issue/{issueId}/Category` | 2 | `useAssignIssueCategory` · `IssueDetailPage.tsx` | Implemented |
| `Issue_GetIssueGroup` | `GET /api/Issue/{issueId}/Group` | 3 | `useIssueGroup` · `IssueDetailPage.tsx`'s Group card | Implemented |
| `Issue_MoveGroupMember` | `POST /api/Issue/{issueId}/MoveGroup` | 2 | `useMoveGroupMember` · `IssueDetailPage.tsx`'s `GroupMemberRow` via `MoveToCanonicalDialog.tsx` | Implemented |
| `Issue_ReviewIssue` | `POST /api/Issue/{issueId}/Review` | 2 | `useReviewIssue` · `IssueDetailPage.tsx` | Implemented |
| `Issue_UngroupIssue` | `POST /api/Issue/{issueId}/Ungroup` | 2 | `useUngroupIssue` · `IssueDetailPage.tsx`'s Group card | Implemented |
| `Issue_GroupIssues` | `POST /api/Issue/Group` | 2 | `useGroupIssues` · `IssueListPage.tsx`'s multi-select Group action | Implemented |
| `Issue_ReassignCanonical` | `POST /api/Issue/{canonicalIssueId}/ReassignCanonical` | 2 | `useReassignCanonical` · `IssueDetailPage.tsx`'s `GroupMemberRow` | Implemented |

### IssueCategories (5 operations)

Company-scoped extensible catalog, never a fixed enum (`CLAUDE.md`'s
"Categories"). No delete - retire only (`SetEnabled`), preserving history.

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `IssueCategories_GetCategories` | `GET /api/IssueCategories` | 3 (readable by any authenticated human per its own description) | `useIssueCategories` · `CategoriesPage.tsx`, `IssueDetailPage.tsx` | Implemented |
| `IssueCategories_CreateCategory` | `POST /api/IssueCategories` | 2 | `useCreateIssueCategory` · `CategoriesPage.tsx` | Implemented |
| `IssueCategories_UpdateCategory` | `PUT /api/IssueCategories/{categoryId}` | 2 | `useUpdateIssueCategory` · `CategoriesPage.tsx` | Implemented |
| `IssueCategories_SetEnabled` | `POST /api/IssueCategories/{categoryId}/Enabled` | 2 | `useSetIssueCategoryEnabled` · `CategoriesPage.tsx` | Implemented |
| `IssueCategories_MergeCategory` | `POST /api/IssueCategories/{categoryId}/Merge` | 2 | `useMergeIssueCategory` · `CategoriesPage.tsx` | Implemented |

### IssueCategorySuggestion (3 operations)

Ollama-advisory only - never itself effective (`CLAUDE.md`'s "Categories":
"only a human Admin's confirmed category assignment...triggers retraining").
Requesting/viewing a suggestion never triggers retraining (backend
`AGENTS.md`).

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `IssueCategorySuggestion_RequestSuggestion` | `POST /api/Issue/{issueId}/CategorySuggestion` | 2 | `useRequestCategorySuggestion` · `IssueDetailPage.tsx` | Implemented |
| `IssueCategorySuggestion_GetSuggestion` | `GET /api/Issue/{issueId}/CategorySuggestion` | 3 | `useIssueCategorySuggestion` · `IssueDetailPage.tsx` (a `404` - no suggestion requested yet - is treated as a real `null` state, not an error) | Implemented |
| `IssueCategorySuggestion_Decide` | `POST /api/Issue/{issueId}/CategorySuggestion/Decision` | 2 | `useDecideCategorySuggestion` · `IssueDetailPage.tsx` | Implemented |

### KnowledgeSharing (7 operations)

Same-Company Device-pair-scoped, Admin-approved, versioned
(`CLAUDE.md`'s "Knowledge sharing"). Approval requires 100% target-position
sensor-map coverage, enforced client-side as a running count before the
button even enables. Produces the target's own new TrainingRequest/ModelVersion
- never copies model bytes.

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `KnowledgeSharing_GetCompatibility` | `GET /api/KnowledgeSharing/Compatibility` | 1 | `useKnowledgeCompatibility` · `KnowledgeSharingPage.tsx`, `SmartAnalyticsPage.tsx` (two-Device compare) | Implemented |
| `KnowledgeSharing_GetShares` | `GET /api/KnowledgeSharing` | 1 | `useKnowledgeShares` · `KnowledgeSharingPage.tsx` | Implemented |
| `KnowledgeSharing_CreateDraft` | `POST /api/KnowledgeSharing` | 2 | `useCreateKnowledgeShareDraft` · `KnowledgeSharingPage.tsx` | Implemented |
| `KnowledgeSharing_Approve` | `POST /api/KnowledgeSharing/{shareId}/Approve` | 2 | `useApproveKnowledgeShare` · `KnowledgeSharingPage.tsx` | Implemented |
| `KnowledgeSharing_EnableIssues` | `POST /api/KnowledgeSharing/{shareId}/Issues` | 2 | `useEnableSharedIssues` · `KnowledgeSharingPage.tsx`'s `ShareCard` | Implemented |
| `KnowledgeSharing_RevokeIssues` | `DELETE /api/KnowledgeSharing/{shareId}/Issues` | 2 | `useRevokeSharedIssues` · `KnowledgeSharingPage.tsx`'s `ShareCard` | Implemented (this checkpoint) - fixes a real bug: the per-Issue chip previously always called `EnableIssues` regardless of current state, so clicking an already-shared Issue was a silent no-op rather than removing it |
| `KnowledgeSharing_Revoke` | `POST /api/KnowledgeSharing/{shareId}/Revoke` | 2 | `useRevokeKnowledgeShare` · `KnowledgeSharingPage.tsx` | Implemented |

### Training (3 operations)

Device-scoped; always the Device's complete current Sensor/aggregation set,
never only a triggering Sensor (`CLAUDE.md`'s "Training and models").

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Training_GetTrainingRequests` | `GET /api/Training/Requests` | 3 | `useTrainingRequests` · `TrainingPage.tsx`, `DeviceDetailPage.tsx` | Implemented |
| `Training_GetTrainingRequest` | `GET /api/Training/Requests/{requestId}` | 3 | `useTrainingRequest` · `TrainingPage.tsx` (deep-linked single-request view) | Implemented |
| `Training_CreateTrainingRequest` | `POST /api/Training/Requests` | 2, but see note | `useCreateTrainingRequest` · `TrainingPage.tsx` | Implemented, **frontend-restricted stricter than the backend**: the operation authorizes by Device access only, not `IsCompanyAdmin` (documented backend gap, `CLAUDE.md`'s "Missing backend capabilities"), so this dashboard renders the "Request retraining" control for `isAdmin` only regardless of what the API would technically accept from a Reader |

### ModelQuery (1 operation)

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `ModelQuery_Query` | `POST /api/Devices/{deviceId}/ModelQuery` | 3 | `useRunModelQuery` (a mutation, not a query - see its own doc comment) · `ModelQueryPage.tsx` | Implemented; deliberately not auto-polled - rate-limited (20 requests/60s per the hook's own pre-existing doc comment) and CPU-bound server-side (`MlQuery:MaxConcurrentQueries = 8`, confirmed this checkpoint via the backend Deployment Runbook) |

### Ollama (3 operations)

Never itself authoritative - advisory only (`CLAUDE.md`'s "Ollama"). At-least-once
delivery; real terminal-success value is `"Succeeded"`, not the
documented-but-wrong `"Completed"` (discrepancy D-Ollama).

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Ollama_SubmitSummaryJob` | `POST /api/Ollama/Jobs` | 2 (excludes DevicePrincipal - `ActorType != User` -> 401) | `useSubmitOllamaSummaryJob` · `IssueDetailPage.tsx` | Implemented |
| `Ollama_GetJob` | `GET /api/Ollama/Jobs/{jobId}` | 3 | `useOllamaJob` · `OllamaJobsPage.tsx`, `IssueDetailPage.tsx` | Implemented |
| `Ollama_CancelJob` | `POST /api/Ollama/Jobs/{jobId}/Cancel` | 2 | `useCancelOllamaJob` · `OllamaJobsPage.tsx` | Implemented; correctly only succeeds while `Queued` - a `409` (already claimed) is treated as "keep polling," never retried as a cancel |

### Locations (4 operations)

Company-scoped hierarchy (parent/child, cycle-rejecting).

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `Locations_GetLocations` | `GET /api/Locations` | 1 | `useLocations` · `AdminSettingsPage.tsx` | Implemented |
| `Locations_CreateLocation` | `POST /api/Locations` | 2 | `useCreateLocation` · `AdminSettingsPage.tsx` | Implemented |
| `Locations_GetLocation` | `GET /api/Locations/{locationId}` | 1 | none | Not implemented - superseded by the list, already fully loaded |
| `Locations_UpdateLocation` | `PUT /api/Locations/{locationId}` | 2 | `useUpdateLocation` · `AdminSettingsPage.tsx`'s `LocationRow` | Implemented (this checkpoint) |

### DeviceGroups (5 operations)

Company-scoped; `DeviceGroupDto` returns member `deviceIds` directly on the
list response, so no separate by-id fetch is needed for membership display.

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `DeviceGroups_GetGroups` | `GET /api/DeviceGroups` | 1 | `useDeviceGroups` · `AdminSettingsPage.tsx` | Implemented |
| `DeviceGroups_CreateGroup` | `POST /api/DeviceGroups` | 2 | `useCreateDeviceGroup` · `AdminSettingsPage.tsx` | Implemented |
| `DeviceGroups_GetGroup` | `GET /api/DeviceGroups/{groupId}` | 1 | none | Not implemented - superseded by the list's own `deviceIds` field |
| `DeviceGroups_AddMember` | `PUT /api/DeviceGroups/{groupId}/Members/{deviceId}` | 2 | `useAddDeviceGroupMember` · `AdminSettingsPage.tsx`'s `DeviceGroupMembersPanel` | Implemented (this checkpoint) - found unused while cataloguing this domain, not in the original gap list; a 204 operation, was reproducibly broken by the `unwrap()` bug until that fix landed |
| `DeviceGroups_RemoveMember` | `DELETE /api/DeviceGroups/{groupId}/Members/{deviceId}` | 2 | `useRemoveDeviceGroupMember` · `AdminSettingsPage.tsx`'s `DeviceGroupMembersPanel` | Implemented (this checkpoint) |

### DeviceClasses (2 operations)

Company-scoped reference catalog; API exposes no write operations at all
(confirmed - only these two GETs exist for this tag).

| Operation ID | Method + route | Classification | Dashboard hook / page | Status |
|---|---|---|---|---|
| `DeviceClasses_GetDeviceClasses` | `GET /api/DeviceClasses` | 1 | `useDeviceClasses` · `AdminSettingsPage.tsx` (read-only tab, explicitly labeled as such) | Implemented |
| `DeviceClasses_GetDeviceClass` | `GET /api/DeviceClasses/{deviceClassId}` | 1 | none | Not implemented - superseded by the list |

### Health (2 operations - not OpenAPI operations, plain unauthenticated endpoints)

Not part of the 105 counted above (no `operationId`, not in the OpenAPI
document at all - confirmed by the extraction script finding zero matches
under any tag). Included here for completeness since they are public and
this dashboard does consume them.

| Endpoint | Classification | Dashboard hook / page | Status |
|---|---|---|---|
| `GET /health/live` | 7 | `useHealth` (`health.ts`, deliberately bypasses `apiClient` - see `CLAUDE.md`) · `SystemStatusPage.tsx` | Implemented |
| `GET /health` | 7 | `useHealth` · `SystemStatusPage.tsx` | Implemented |

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
| `/admin/readers` | ReadersPage | Company member roles + Reader Device-grant admin | Priority 6 + Priority 9 addendum B | `Company_GetMembers/AssignRole/RevokeRole/GetReaders/GetReaderDeviceGrants/GrantReaderDevices/RevokeReaderDeviceGrant/GetReaderEffectiveAccess` | Admin only (role-assignment mutations additionally gated on `profileSource === 'Local'` - see decision log) | n/a | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/admin/settings` | AdminSettingsPage | Company profile, Locations, Device groups (incl. membership), DeviceClasses | §"API coverage" (reference data) + Priority 9 (Company profile) | `Company_GetCompany/UpdateCompanyName`, `Locations_*`, `DeviceGroups_*` (incl. `AddMember`/`RemoveMember`), `DeviceClasses_GetDeviceClasses` | Admin write (Company rename additionally gated on `nameEditable`), DeviceClasses read-only (no write ops exist) | n/a | loading, empty, error | all | on mutate | none | Implemented | **Yes (mocked)** |
| `/status` | SystemStatusPage | Health liveness/readiness | Deployment Runbook §"health" | `/health/live`, `/health` (not OpenAPI ops — plain fetch) | Both | n/a | loading, error | n/a (unauthenticated endpoints) | n/a | 30s | Implemented | **Yes (mocked)** |
| `*` | NotFoundPage | Fallback | — | none | Both | n/a | n/a | n/a | n/a | n/a | Implemented | No |

## Authorization matrix

| Actor | Devices | Issues | Categories | Knowledge sharing | Training | Ollama | Admin pages | Notes |
|---|---|---|---|---|---|---|---|---|
| Unauthenticated | — | — | — | — | — | — | — | Redirected to `/login` by `RequireAuth` on every route |
| Admin | Full CRUD (no delete — disable only) | Full (review/category/group/move/reassign/ungroup, all wired) | Full CRUD | Full workflow | Full + manual trigger | Full | Full | Company member role assignment (`/admin/readers`) additionally requires `profileSource === 'Local'` — a `MirroredDatabase` Company shows members read-only with an explanation, since role there is synchronized one-way from WordPress and a dashboard edit would be silently overwritten by the next sync. Company rename (`/admin/settings`) is gated the same way via `nameEditable`. |
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
| `useBreakpoint`/`useMediaQuery` | Responsive breakpoint detection | AppShell, DeviceListPage, SmartAnalyticsPage (added at the 2026-08-31 completion checkpoint, fixing a `layoutMobile`-defined-but-unused bug — see that checkpoint's section) |
| DataGrid + mobile-card pattern | Dense list responsive fallback | DeviceListPage (reference implementation; not yet replicated elsewhere) |
| One-time Secret dialog pattern | Secure credential reveal | DevicePrincipalPage |
| `activateProps` (`src/lib/useActivateProps.ts`) | Makes a non-native element (Card/div used as a click target) keyboard-operable — role, tabIndex, Enter/Space activation | DeviceListPage's mobile cards, OverviewPage's 3 clickable tiles, IssueDetailPage's member rows, ModelQueryPage's ranked-Issue rows |
| `ConfirmDialog` | Single reusable confirm/consequential-action dialog (normal/destructive, busy, confirmDisabled) — the only such dialog in the project, replacing every previous raw `window.confirm`/bespoke `Dialog` | SensorPoliciesPage (raw-policy retraining), CategoriesPage (New/Merge category), IssueListPage (Group creation), DevicePrincipalPage (Revoke credential), KnowledgeSharingPage (Revoke share), DeviceDetailPage (Disable Device), `MoveToCanonicalDialog` (built on top of it) |
| `MoveToCanonicalDialog` | Bounded, searchable Combobox picker for a Move-Group target, backed by `Issue_GetIssues` (canonical-only candidates for the Device), excluding the member itself and its current canonical | IssueDetailPage's `GroupMemberRow` |
| `AppToastProvider`/`useAppToast` + `toastBridge` | Centralized Fluent Toast layer; module-level bridge lets the singleton `queryClient` surface toasts too | Every page with a mutation (see the toast-wiring note in the correction checkpoint above) |
| `NewSensorDialog`/`EditSensorDialog` | Add/edit a Sensor, built on `ConfirmDialog` — added at the 2026-08-31 completion checkpoint | `DeviceDetailPage.tsx` |
| `NoCompanyState` (`src/components/states/NoCompanyState.tsx`) | A fifth request-state component, added at the API-completeness checkpoint — explains the documented `hasAuthorizedCompany: false` API state (a valid, authenticated User with no resolvable Company) instead of letting the first Company-scoped 401 boot them back to `/login` | `AppShell.tsx` (replaces `<Outlet/>` entirely, route-independent, whenever confirmed false) |
| `isSafeHttpsUrl` (`src/lib/safeExternalUrl.ts`) | Shared https-only scheme check for untrusted external Company `logo`/`website` text, added this checkpoint | `AdminSettingsPage.tsx`'s Company Profile tab |
| `DeviceGroupMembersPanel` | Checkbox-per-Device group-membership editor, added this checkpoint — same pattern as `ReadersPage.tsx`'s Device-grant panel | `AdminSettingsPage.tsx`'s Device groups tab |

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
| 22 | Company Member role assignment | Built, gated on `CompanyDto.profileSource === 'Local'` | Previously left as a genuinely open question (mirrored-identity ambiguity). Resolved this checkpoint using the same signal the already-shipped `nameEditable` gate uses, directly supported by the backend `CLAUDE.md`'s EntraId section ("New synchronized Users must receive no effective Device access until an authorized Admin assigns the Reader role") implying an Admin-facing assignment action is expected for locally-managed Companies, and its mirrored-permission section stating role sync there is one-way from WordPress | `ReadersPage.tsx`, `company.ts` | Approved (resolves the open item from the prior checkpoint's decision log) |
| 23 | `unwrap()`'s 204 handling | Only throw when `data` is undefined **and** the response status isn't 204 | `openapi-fetch` returns `data: undefined` for any 204 response on the success path, not just on error — confirmed in its installed source. The prior "should be unreachable" reasoning was real but incomplete: true for the error path (the auth middleware throws first), not accounted for on the legitimate no-content-on-success path. Found via mocked-browser-verifying the new role-assignment checkbox, which silently never completed against a realistic 204 mock | `src/api/client.ts` | Correctness fix — affects every 204-returning mutation in the app, not just this checkpoint's new features |
| 24 | `DeleteAllData` (×4 telemetry families) | Documented, not built | Real, live, Admin-authorized, and irreversible (wipes a Sensor's telemetry + Issues, clears the Device's legacy model); no product requirement anywhere calls for exposing it, and a first-pass form for a permanent mass-deletion action was judged disproportionate to the single-click destructive-confirm pattern used elsewhere in this app. Raised explicitly rather than decided unilaterally | none — undecided until this raise | User declined to build this pass; recommendation (typed re-confirmation) recorded for later |
| 25 | `useLastPeriod` | Left unused | A bare last-ingested-period *number* isn't independently meaningful to a human without the `measured` timestamp `FreshnessPill`/Live Monitoring already show; a second, separately-fetched freshness signal risks disagreeing with the existing one | `telemetry.ts` | Documented non-adoption, not a gap |

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

**This table is Phase 25/26's own point-in-time record - left as written, not
retroactively edited.** Current totals as of the API-completeness checkpoint
(see that section, above the phase log, for full detail): **95/95 unit
tests passing, 16 files**; lint/typecheck/build all still green; a fresh
three-scenario mocked-browser pass covering every new/changed page this
checkpoint added (Company Profile, Device group membership, Company
members, aggregation-policy create/deactivate, the Knowledge Sharing fix,
the no-Company state) on top of, not replacing, the 17×4 responsive and
18-state accessibility sweep recorded here.

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
- [ ] Against a real `MirroredDatabase`-sourced Company, confirm
      `GET /api/Company` actually returns `profileSource: "MirroredDatabase"`
      and `nameEditable: false`, and that a real `PUT /api/Company/Name`
      attempt genuinely returns `409` (this dashboard's gating logic assumes
      these fields behave exactly as documented; the mocked-browser pass
      fixtures them, it can't independently confirm the live backend agrees).
- [ ] Against a real Company with mixed member roles, confirm
      `Company_AssignRole`/`Company_RevokeRole` actually persist across a
      page reload (the `unwrap()` 204 fix was verified against a realistic
      mock, not the live API's real 204 response bytes).
- [ ] If an account with no linked Company is available, confirm the real
      `GetUserDetails` response matches the documented `Unknown`/`null`/`false`
      fallback shape exactly and that `NoCompanyState` renders correctly
      against it.

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
- [x] Device, Sensor (create/edit added at the completion checkpoint), policy, and telemetry workflows implemented
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

## Scope confirmation (API-completeness checkpoint)

- **Only `C:\VS\PRECOG_Dashboard` was modified this checkpoint.**
  `git status --short` there shows exactly: this file plus 11 modified
  source files (`src/api/client.ts`, `src/api/domainTypes.ts`,
  `src/api/hooks/company.ts`, `src/api/schema.generated.ts` - dynamic
  `@example` timestamps only, see "Live contract re-verified, no drift"
  above - `src/app/AppShell.tsx`, `src/auth/AuthContext.tsx`,
  `src/pages/admin/AdminSettingsPage.tsx`, `src/pages/admin/ReadersPage.tsx`,
  `src/pages/devices/SensorPoliciesPage.tsx`,
  `src/pages/knowledgeSharing/KnowledgeSharingPage.tsx`,
  `vite.config.ts`), and 5 new files (`src/api/client.test.ts`,
  `src/auth/AuthContext.test.tsx`, `src/components/states/NoCompanyState.tsx`,
  `src/lib/safeExternalUrl.ts`, `src/lib/safeExternalUrl.test.ts`). Nothing
  else in the working tree changed.
- **Backend contracts and configuration were still never touched.**
  `C:\VS\API`'s working tree shows the same 77 build-artifact files as
  before, plus one pre-existing, already-uncommitted one-line change to
  `DataAccess/LocalPG_Data/LocalPGContext.cs`'s local Npgsql connection
  string (`host.docker.internal` -> `localhost`) - inspected specifically
  because it's a real source file, not a build artifact, and confirmed via
  `git log` that file's last real commit predates this checkpoint's start
  by hours; no tool call this checkpoint wrote to it or anything else under
  `C:\VS\API`. Every read against that repository this checkpoint was
  through `Read`/`Grep` on documentation files, or an HTTP `GET` against the
  already-running live API's own `/swagger/v1/swagger.json` - never a write.
- No `dotnet ef`, migration, SQL, database, Docker, or destructive Git
  command was run. No commit or push was made - this checkpoint's changes
  remain in the working tree, awaiting explicit authorization per this
  project's own commit discipline.

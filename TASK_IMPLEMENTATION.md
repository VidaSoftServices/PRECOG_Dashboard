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
| `src/api/hooks/sensors.ts` | Sensor read/create/update | `useCreateSensor`, `useUpdateSensor` (unused — see gap above) |
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

1. **Decide whether Sensor create/edit is in scope.** If yes, it's a real,
   sized, well-understood gap — the hooks already exist and are correctly
   typed; only a page/dialog is missing. If no, correct `DeviceDetailPage.tsx`'s
   empty-state copy ("Add a Sensor to start collecting telemetry") which
   currently promises an action that doesn't exist anywhere in the app.
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

- [~] **Phase 10: Sensors, aggregation policies, and setpoints** — **Partially implemented (corrected at the 2026-08-31 source-assessment checkpoint — see that section above)**
  AggregationPolicies (edit only, not create/deactivate) + Setpoints (full
  history + create) live on `SensorPoliciesPage.tsx`. **Sensor creation and
  editing has no UI anywhere in this dashboard**, despite `useCreateSensor`/
  `useUpdateSensor` existing, correctly typed and wired, in
  `src/api/hooks/sensors.ts` — `DeviceDetailPage.tsx`'s Sensors card is
  read-only and its own empty-state copy promises an action ("Add a Sensor
  to start collecting telemetry") that doesn't exist. This was marked
  "Implemented" in an earlier pass without that gap having been noticed;
  corrected here rather than silently left wrong. See the source-assessment
  section's "What should be reviewed or corrected next" for the decision
  this needs. Setpoints section added in an earlier checkpoint this
  session: direction-aware form (symmetric `target`/`tolerance` for
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
- [~] Device, policy, and telemetry workflows implemented; **Sensor create/edit has no UI** — corrected finding, see the 2026-08-31 source-assessment section's Phase 10 note
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

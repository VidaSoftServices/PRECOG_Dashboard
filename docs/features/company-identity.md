# Company profile and human User synchronization

How the Dashboard reads the Company profile and identity state: `profileSource` / `nameEditable` gate the rename form, logo and website are untrusted text, a User with `hasAuthorizedCompany: false` sees `NoCompanyState` instead of being bounced to the login, and the role is taken only from `CurrentUserDto.isCompanyAdmin`. Tenant and role rules stay in CLAUDE.md ("Tenant and roles").

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/company-identity.md](../../../PRECOG_API/docs/features/company-identity.md).

> **S8 (2026-11-24): the WordPress mirror is gone.** The Company people pages (Company admin "People", the platform Companies and People pages) no longer offer "Link to WordPress" / "Unlink from WordPress" (the four `WordPressLink` endpoints were removed from the API) and the `synchronizedFromWordPress` field is gone; a person of the old list still carries the small **WordPress** badge (`origin === 'WordPress'`) whose tooltip now says the person is managed here like everyone else. The only action on a person is **Remove**. `CompanyDto.profileSource` is always `Local`, so the role controls always show. Tests: `MemberActions.test.tsx`, `ReadersPage.test.tsx`.

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

### Company profile and mirrored identity

`CompanyDto` (`GET /api/Company`) carries `name`/`logo`/`website` plus two
fields that gate this dashboard's own UI directly, never re-derived from a
guess: `profileSource` (`"Local" | "MirroredDatabase"`) and `nameEditable`
(true only when the caller is a Company Admin **and** the profile is
`Local`). A Company is `MirroredDatabase` when its row carries a non-null
`ExternalKey` (the invariant decimal form of the source WordPress
`wp_fc_companies.id`) — populated only by the WordPress-sync provider, per
row, not necessarily uniform across a whole deployment (a `MirroredDatabase`-mode
deployment can still contain a locally-created Company with no
`ExternalKey`, e.g. one never matched to a source row). Never inferred from
deployment configuration this frontend has no access to anyway — always
read directly from the response's own `profileSource`/`nameEditable`
fields.

`AdminSettingsPage.tsx`'s Profile tab (`CompanyProfileTab`) is this
dashboard's Company-profile surface: `logo`/`website` are rendered as
untrusted external text exactly like the backend's own documentation
requires (`isSafeHttpsUrl` gates whether the logo is even attempted as an
`<img>` src, `onError` hides it silently on failure, `website` becomes a
real `rel="noopener noreferrer"` link only when it's a safe https URL,
otherwise plain text) — the API never fetches, proxies, or validates
either value, so this frontend can't trust them beyond the same scheme
check. The rename form (`useUpdateCompanyName`, `PUT /api/Company/Name`)
is gated on `nameEditable`; when false, an inline message explains why,
distinguishing the `MirroredDatabase` "synchronized from WordPress, edit at
the source" case from a generic no-permission case, rather than just
disabling a control with no explanation.

`CurrentUserDto` (`GET /api/User/GetUserDetails`, `AuthContext.tsx`) mirrors
the same Company display fields (`companyName`/`companyLogo`/
`companyWebsite`) plus `hasAuthorizedCompany`. A valid, authenticated human
User can have `hasAuthorizedCompany: false` — e.g. a WordPress account not
yet linked into the Company/RBAC model — a real, documented API state, not
an edge case this frontend invented a response for. Every Company-scoped
endpoint rejects such a caller with `401`, and this app's single global 401
handler (`notifyUnauthorized`) unconditionally clears the session and
redirects to `/login` on *any* 401 — meaning without an explicit guard, the
first Company-scoped query any page fired for such a User would silently
boot a correctly-authenticated User back to the login form, where signing
in again just reproduces the same state. `AppShell.tsx` instead renders
`NoCompanyState` in place of `<Outlet/>` — route-independent, so an
in-app nav click changes the URL but the shell keeps showing the same
explanatory state — whenever `hasAuthorizedCompany` is confirmed `false`
(never while `userDetails` is still loading, so a normal Company-having
User never sees a false flash of it). No page ever gets the chance to fire
a Company-scoped query that would 401 in this state.

Human permission level (`Admin`/`Reader`) is resolved entirely server-side
— in `MirroredDatabase` mode, from the mirrored WordPress
`wp_fc_subscriber_meta.permissionlevel` value, joined through
`wp_users`/`wp_fc_subscribers`. This frontend never queries any of that
directly, never infers role from a username, and never treats a hidden
control as a security boundary (the backend's own documentation states this
requirement explicitly, addressed to dashboard consumers by name) — the
only trusted source is `CurrentUserDto.isCompanyAdmin`, exactly as for
every other authorization decision in this app.

## An Admin added to another Company in WordPress still sees the old one (2026-11-21)

The Dashboard shows what `GET /api/User/GetUserDetails` returns: the Company in `pg.users.CompanyId`, which the user synchronization never changes once the internal User exists ("a tenant move is never automatic"). Moving a User to another Company in WordPress / FluentCRM therefore changes nothing here: the page header, the Devices list and the Admin controls stay those of the old Company (`isCompanyAdmin = false`, an empty Device list). Use a separate WordPress account for the other Company, or ask for a manual move in the database; the full cause and the read-only diagnosis are in the API repository's `docs/features/company-identity.md` ("A User is never moved to another Company by the synchronization").



## Own user management: schema foundation (2026-11-23, slice S1 of the WordPress-independence work)

The internal `pg.users` is becoming the single source of truth for sign-in, the WordPress mirror an optional, locked source. Slice S1 only adds the **schema** (nothing reads or writes it yet, behaviour is unchanged):

- `pg.users` gets `loginname` (the name signed in with and the "username" part of the access token: the WordPress login for synchronized Users, the e-mail for invited ones), `passwordhash` (phpass `$P$` or `$wp$` bcrypt, never returned or logged), `passwordchangedat`, `language`, `mobile`, `emailnotification`, `source` (`UserOrigin`: 1 Local, 2 WordPress, 3 EntraId), `locked` (a synchronized User cannot be deleted or have its roles changed here) and `lastloginat`. `pg.wp_fc_companies` (the Company table) gets `locked`.
- New tables: `pg.usertokens` (single-use invitation / password-reset tokens, only the SHA-256 is stored), `pg.companylogos` (uploaded logo, png / jpeg / webp, at most 512 KB), `pg.servers` (the servers of a Company: name, address = IP or DNS name, port, TLS, enabled, the Device-id range the server may hand out) and `devices.serverid` (null = this server).
- `Enums.ActorType.PlatformAdmin` (the VSSSysAdmin, no Company) is reserved for slice S3.
- **Additive only**: the previous release keeps running against this schema. The in-place script is `DataAccess/DBScripts/DB_S1_Schema.sql` (idempotent, one transaction; `DB_S1_Schema_Rollback.sql` removes exactly what it added and deletes whatever those objects hold). The script is run BEFORE the release that needs the columns is deployed. Tests: `OwnUserManagementSchemaScriptTests` (the script produces exactly the schema the model creates, is idempotent, keeps existing rows, the rollback works) and `DeviceIngestionContinuityTests` (Device token login, the telemetry filter, a "restart" with the same token, disabled Device / Company / revoked credential still refused).
- No unique index on the e-mail or login name yet: existing rows may share them; the application enforces uniqueness and the constraint follows in the cleanup release after the data has been checked.
- Entra ID stays supported: Entra Users get `source = 3`, no local password, locked like WordPress ones; the Entra provider is untouched.


## Own user management: sign-in from the User store (2026-11-24, slice S2)

`POST /api/Authentication/Request_HMAC_Key` now checks the **internal User first** and the WordPress mirror second:

1. **The User store.** An enabled `pg.users` row with a `loginname` and a `passwordhash`, found by login name (preferred) or e-mail address, case-insensitively (an ambiguous name finds nobody). The password is verified against the stored hash (WordPress `$P$` phpass or `$wp$` bcrypt; a password set in PRECOG is hashed as `$wp$` = bcrypt of the SHA-384 pre-hash, `WordPressPasswordVerifier.Hash`). The access token is the same 76-character HMAC as ever, built from the login name and the stored hash. A migrated User keeps its WordPress login name and hash, so its token is byte-identical to the legacy one.
2. **The legacy path** (unchanged queries): the mirrored, approved WordPress account. Used for a name that is not a User here, and for a **WordPress-origin** User whose copied hash lags behind a WordPress password change (until the next synchronization). A User created in PRECOG (`source = 1`) never falls back, so a WordPress account of the same name cannot be used to get in.
3. The cache id of an internal User is **negative** (`UserCache.InternalCacheId`), a WordPress account keeps its positive `wp_users.id`; `GetUserDataForFunctions` resolves a negative id from `pg.users` (profile, Company role, Device access) and keeps the legacy WordPress id as `UserId` for a synchronized User. After a restart the filter recomputes the token from the stored hash (`UserCache.RefreshByPrefix`), exactly as before.
4. **Throttle.** Failed attempts are counted per client address and account: the internal User id, or - for a name that is not a User (also a platform account later) - `loginattempts.identitykey` = SHA-256 of the lower-cased name, never the name. From the 6th attempt the answer is delayed (2 s, doubling, at most 60 s). An unknown name costs one dummy password verification, so it takes as long as a wrong password.
5. **CPU bound.** bcrypt / phpass work runs through `PasswordWork` with a bounded degree of parallelism (half the cores, at least 2), off the request thread, so a burst of sign-ins cannot starve the Devices' token checks (test: `BootstrapAdminsAndLoginLoadTests`).

**Synchronization (MLTraining, `Identity__SyncWithWordPress` true = today's behaviour).** For every approved, Company-linked WordPress account the linking step now also copies `loginname` (wp `user_login`), `passwordhash` (wp `user_pass`), `language`, `mobile`, `emailnotification` (the profile value contains "Email Notification"), sets `source = 2` and `locked = true`; a changed WordPress password moves `passwordchangedat`; a second run changes nothing (`MirroredUserProfile.Apply`). A User that WordPress stops approving (or that loses its Company) has its copied hash **cleared**, so it cannot sign in any more.

**Settings (`.env`, see `.env.example`).** `Identity__UserSource` = `MirroredDatabase` (default), `Local` or `EntraId` (the Entra provider is untouched); `Identity__SyncWithWordPress` = true (default) / false: with false the MySQL source is never contacted, `ConnectionStrings__VSSDB` is not needed and no `wp_*` mirror is refreshed, every Company is editable here (`IsMirroredDatabaseMode` = not Entra and sync on); `Identity__BootstrapAdmins` = comma separated e-mail addresses that must hold the Admin role of their own Company (idempotent, additive, kept in the `.env` only; applied after each synchronization, or by the no-op provider when the sync is off).

**Issue e-mail subscription.** A User is subscribed when `pg.users.emailnotification` is set **or** the WordPress profile meta says so; nobody who is subscribed today drops out.

Tests: `OwnUserLoginTests` (sign in by login name / e-mail in any case, the token accepted as the Company Admin, also after a "restart"; wrong password counted per account; unknown name counted under a hash; disabled User and a `~` login name refused; a Local User never falls back; a lagging WordPress-origin User does; the WordPress id is kept), `MirroredUserSyncProfileTests` (the real linking step on PostgreSQL: copy, idempotence, changed password, hash cleared), `OwnUserManagementTests` (hash format, token login-name rule, attempt key, profile mapping, bootstrap setting, mode switch), `BootstrapAdminsAndLoginLoadTests` (bootstrap Admins; 24 simultaneous sign-ins do not starve the Device token check).


## WordPress provides only the validated User list; Companies and roles are PRECOG's (2026-11-24, slice S4a)

The user's rules, which supersede the "mirrored Company profile" and "mirrored permission-level" sections above (they describe the old behaviour):

- **WordPress never provides a Company.** `MirroredDatabaseUserSyncProvider` no longer reads, creates or updates Companies (`SyncCompaniesAsync` is gone); it only links Users to the Companies that already exist here, through `Company.ExternalKey`. A Company's name, website and logo are owned and edited in PRECOG: `CompanyProfile.IsSourceManaged` is always false, `GET /api/Company` always reports `ProfileSource = Local`, `NameEditable` is true for a Company Admin, and the Dashboard no longer shows "synchronized from WordPress". `MirroredCompanySync` and `Company.ExternalKey` remain only as the link between an old WordPress company id and the Company.
- **WordPress provides only the validated User list** (approved accounts that carry a Company reference), while `Identity__SyncWithWordPress` is true (the default; write it in the `.env` so it is visible). The synchronization copies the profile (login name, password hash, language, mobile, e-mail subscription), marks the User WordPress-origin (`source = 2`) and locked, and clears the hash of an account WordPress stops approving. **It never reads the WordPress permission level and never adds, changes or removes a role**: roles are managed in PRECOG - the platform administrator picks a Company's Admin from its people (or invites one by e-mail), and a Company Admin invites and manages their own Company's people. A new account therefore starts without a role.
- **What was created here is primary, WordPress secondary.** A WordPress account whose e-mail address already belongs to a User created here (invited, `source = 1`) is neither imported nor allowed to touch it: its password, name and language are never overwritten, however the connection was cut and restored. At sign-in the User store is checked first and a locally created User never falls back to the WordPress mirror; a password reset is only for locally created Users.
- **The platform account is its e-mail address only**: the old WordPress account called "VSSSysAdmin" and any User carrying the platform e-mail do not sign in as ordinary Company-less Users (`AuthenticationController`, `UserCache`).
- **Still to come (slice S4b):** a WordPress mark on every User list (platform and Company Admin), the Company-Admin invitation panel and the platform administrator's "set the Company's Admin" in the Company properties, deletion rules (a User synchronized from WordPress while the sync is on, or a Company's last Admin, cannot be deleted - with a clear message; everyone else can be removed), a link / unlink button for a person who exists both in WordPress and here (it decides where the person manages the password), the Company website and logo editing.
- Tests: `MirroredUserSyncProfileTests` (every validated account imported without a role, an existing manual role untouched, no Company created or changed, a locally created User never overwritten or duplicated), `CompanyProfileLocalTests`, `PlatformAndInvitationFlowTests` (the old WordPress account of the platform administrator cannot sign in).

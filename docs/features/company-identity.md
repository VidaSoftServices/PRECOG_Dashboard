# Company profile and human User synchronization

How the Dashboard reads the Company profile and identity state: `profileSource` / `nameEditable` gate the rename form, logo and website are untrusted text, a User with `hasAuthorizedCompany: false` sees `NoCompanyState` instead of being bounced to the login, and the role is taken only from `CurrentUserDto.isCompanyAdmin`. Tenant and role rules stay in CLAUDE.md ("Tenant and roles").

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/company-identity.md](../../../PRECOG_API/docs/features/company-identity.md).

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

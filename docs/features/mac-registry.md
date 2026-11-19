# Mobile-device MAC address registry

The "Mobile devices" tab of Users & Access: the Queue / Registered / Blacklist views, the Admin actions (assign, reassign, blacklist, re-queue, remove, add), and the rule that the Dashboard never builds the DevicePrincipal side and treats a MAC address as personal data, never a credential.

Related: the API side of this feature is in [../../../PRECOG_API/docs/features/mac-registry.md](../../../PRECOG_API/docs/features/mac-registry.md).

The text below was moved verbatim from `CLAUDE.md` (Dashboard) on 2026-11-19; dates and "superseded" notes are the original ones. Keep this file up to date with every change to the feature.

## Mobile devices (MAC address registry)

`ReadersPage.tsx` ("Users & Access", Admin-only) has two tabs: **Members &
access** (company roles and Reader Device grants, unchanged) and **Mobile
devices** (`MobileDevicesPanel.tsx`), the Company's registry of Users' phone
MAC addresses. A Device can serve a local Wi-Fi network and a web page; its
DevicePrincipal sends the MAC address of the phone that connected, and the
registry is how a Company Admin decides which phone belongs to which User.

- One registry row per (Company, MAC), moved between three views by a
  `status`: **Queue** ("Queued" - submitted by a Device, oldest first),
  **Registered** ("Assigned" - belongs to one enabled Admin/Reader User) and
  **Blacklist** ("Blacklisted" - hidden from the queue; a Device submitting it
  again is ignored). The unique row is what guarantees a MAC address is queued
  only once and never in two states at once.
- Admin actions: **Assign to user** / **Reassign** (a dialog listing only
  enabled Company members holding the Admin or Reader role), **Blacklist**
  (confirm dialog), **Move to queue** (takes a MAC address off the blacklist, or
  unassigns it), **Remove** (confirm; deletes the row, so a Device may submit it
  again) and **Add MAC address** (registers one directly for a User). One
  `PUT /api/MacAddresses/{id}` with `status`/`userId`/`label` covers every
  transition (`useUpdateMacAddress`); `useMacAddresses(status)` reads a view,
  every mutation invalidates all three.
- The server is the only validator. `looksLikeMacAddress` (`src/lib/macAddress.ts`)
  only flags an obviously mistyped address before a round trip; the API also
  rejects all-zero, broadcast and multicast addresses and normalizes notation.
- **The dashboard never builds the DevicePrincipal side.** `Subscribe`,
  `Resolve` and `LatestIssue` are machine-only operations (a human gets 403) and have no UI or
  hook here - consistent with the rule that DevicePrincipal is not an
  interactive dashboard role.
- A MAC address is a spoofable identifier, **never a credential**: it grants
  nothing in this dashboard or the API. It is personal data: shown only to
  Admins on this tab, never placed in a URL, browser storage or a log line.
- What a registered phone can do on a Device is decided on the Device side and
  is read-only: an Admin or Reader MAC address may read the Device's latest
  Issue text (`POST /api/MacAddresses/LatestIssue`, DevicePrincipal-only, so
  not called from this dashboard), and anyone may read the maintenance state.
  Nothing can be changed from a phone.

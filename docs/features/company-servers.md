# The Company's servers (slices S6, S7, S9, 2026-11-24)

The API side (registry, Device id ranges, allocation, `Server__Id`) is in `c:\VS\PRECOG_API\docs\features\company-servers.md`. A Company may run any number of PRECOG servers with their own databases; **only the platform administrator (VSSSysAdmin) registers, changes and removes a server** (slice S9) - from the platform page, never a Company Admin - and the Dashboard shows where a Device lives. Since slice S7 (2026-11-24) it also sends each Device's requests to the server the Device lives on (see "Routing between servers").

## Who manages the servers (slice S9)

- **VSSSysAdmin** (the platform account) registers a Company's servers on the **Companies** page of the platform pages: open a Company, section **Servers** (`PlatformServers` in `src/pages/admin/ServersTab.tsx`). Nobody else can: the API answers 403 to a Company Admin, a Reader and a DevicePrincipal.
- One card per server: name, the address a person would open (`https://host:port`, the scheme follows the TLS switch; `serverUrl`), the Device id range or "No reserved Device id range", the number of Devices and a **Disabled** badge. Notes are shown below.
- **Add a server / Edit server**: Name, Address (an **IP address** or a DNS name), Port, First / Last Device id, Connection (https or http), Status (enabled), Notes. The form checks the same rules as the API (`checkServerForm`, `isValidServerAddress` in `src/lib/serverForm.ts`) and shows the problems next to the field **before any request**: the address is a host name, DNS name, IPv4 or IPv6 address - no `https://`, port or path; the port 1-65535; the range needs both ends (1-32767, first not above last); the API checks everything again (409 for a taken name or an overlapping range, with the other server named). A TLS certificate is valid for a DNS name, not for a bare IP address, so a secure (https) server should be registered by its DNS name.
- **Delete server** is disabled while Devices are assigned (with the reason shown), asks for a confirmation otherwise; it only removes the registry entry.
- The API's refusals are English texts, some with a name or numbers inside; `translateServerError` puts them through `t()` with the values in the Hungarian order (`src/lib/translations.servers.ts`).
- A Company's own people (Admin and Reader) see the same list **read-only** on the **Servers** tab of Company Settings (`ServersTab`): no add, edit or delete button, and a line saying the platform administrator registers the servers.

## The Device page

The **Status** card shows "Server: <name>" when the Device has one. In the Device's edit panel (Admin) a **Server** select (No server + every registered server) applies at once (`PUT /api/Devices/{id}/Server`); a server with a range refuses a Device outside it (409, shown translated).

## Code

- Hooks `src/api/hooks/servers.ts`: `useServers` (the Company's own, read), `usePlatformServers`, `useCreatePlatformServer`, `useUpdatePlatformServer`, `useDeletePlatformServer` (the platform administrator's, `/api/Platform/Companies/{companyId}/Servers`), `useAssignDeviceServer` (a Company Admin sets a Device's server); query keys `queryKeys.servers`, `queryKeys.platformServers`. `DeviceDto.serverId` / `serverName` come from the regenerated schema.
- Tests: `serverForm.test.ts` (address / range / port rules, the URL, the Hungarian of the API's refusals), `ServersTab.test.tsx` (the platform list, a Company's people see it read-only, no delete with Devices, add sends the typed values authenticated, a bad address is refused before any request, the overlap refusal in Hungarian, delete after a confirmation).

## Routing between servers (slice S7, 2026-11-24)

**Decision (the user's): the same user with the same password hash exists on every server, and every server has the same `HMAC_SERVER_KEY`**, so the one token the person gets at sign-in (on the home server, `VITE_API_BASE_URL`) is accepted by all of them. The Dashboard only decides WHICH server a request goes to. With no other server registered nothing changes: no request is rewritten.

- `src/api/deviceRouting.ts` (React-free, like `authStore`): the routing table (Device id -> server base URL), the "selected Device" hint, the servers that could not be read, `routeBaseUrlFor(url)` and `reroute(request, baseUrl)` (re-addresses the request keeping method, headers, body and abort signal).
- `client.ts` registers a **routing middleware before the auth middleware**: a request whose path is `/api/Devices/{id}...` or that has a `deviceId` query parameter goes to that Device's server; the token header is set afterwards, so the same token travels. Everything else (Company, Users, `/api/Servers`, authentication, reference data) stays on the home server. An Issue-by-id request (`/api/Issue/{id}...`, no Device in the URL) goes to the server of the **selected Device**; `useIssue` verifies the loaded Issue really belongs to that server and otherwise refuses it ("This Issue belongs to a Device on another server...") - an Issue id is only unique within one server, so a wrong guess must never show another Issue.
- `loadCompanyDevices` (behind `useDevices`) reads the home Device list, the registry (`GET /api/Servers`, failure = home only) and the Device list of every **enabled, other, reachable** server (per-request `baseUrl`, in parallel), merges them (a Device found on a server replaces a pointer row of the home database; `serverId` / `serverName` come from the registry) and publishes where each Device lives. A server that cannot be read does not fail the list: the others show and `DeviceRoutingGate` (mounted in `AppShell` around the page outlet) shows a warning naming it - **blocked** (an `http://` server from an https page: mixed content, loopback excepted), **refused** (the server answered 401: the user or password differs there), **down**.
- `DeviceRoutingGate` also holds the page back until the Device list is known (it is the same query the pages' Device pickers use, so no extra request): a Device's request made earlier would go to the wrong server.
- A **401 from another server** is not an expired access: it becomes an explanatory `ApiError` ("The server of this Device did not accept your sign-in...") and does not open the sign-in dialog - unless the access really has expired (`isExpired()`), then the dialog opens as always. A 401 from the home server is unchanged.

### What the other server needs (operator checklist)

1. The same `HMAC_SERVER_KEY` (at least 16 characters) in its `.env` **and** in the home server's (setting it on the running home server invalidates every issued token - do it in a planned window, or give the second server the home server's key, which is the built-in one when nothing is set).
2. `Cors__AdditionalOrigins` containing the Dashboard's origin, and `Server__Id` with its registry id.
3. The Company's users on it: the rows of `pg.users` (with the SAME ids and password hashes) and the Company's `pg.companyroleassignments` / `pg.userdevicegrants` rows. **There is no automatic copy** - a password changed on one server must be copied again, otherwise that server answers 401 ("refused" in the notice).
4. An https address (the Dashboard itself is served over https).

### Known limits

Knowledge sharing between Devices of different servers, Ollama jobs and Issue categories are Company-level calls and stay on the home server; Issue pages work for the selected Device's server only (see above). Not verified against a real second server (none exists yet): the unit tests cover the routing, the merge, the failure notices and the 401 handling with a mocked network.

Tests: `src/api/deviceRouting.test.ts`, `src/api/hooks/devices.routing.test.ts`.

## Master and replica, choosing the server (slice S10, 2026-11-24)

The API now has one **master** (also a data server) and any number of **replicas** (`Server__Role`, see the API doc of the same name). What the Dashboard does with it:

- **Master-owned requests stay on the home server.** `routeBaseUrlFor` no longer re-addresses `/api/Devices/{id}/Server` and `/api/Devices/{id}/Principal...` (the server assignment and the DevicePrincipal operations) to the Device's server: a replica refuses them with 409, so they always go to the home server (the master), wherever the Device lives. Creating a Device (`POST /api/Devices`, no id) was already a home-server call. Sensors, telemetry, Issues and the rest of a Device's requests still go to the Device's own server.
- **Add Device** (Devices page) has an optional **Server the Device lives on** select (shown when the Company has registered servers; disabled servers are not offered). The choice is sent as `serverId`; the API takes the Device id from that server's reserved range and only that server accepts the Device's data. Without a choice the Device lives where it is created, as before.
- **Device page, Server select**: **disabled once the Device has Sensors** (the hint says why) - the data is on the server and this release moves none; the API answers 409 to a change anyway. Free to change while there are no Sensors.
- The API's new refusals (replica, Sensors exist, chosen server disabled / not the Company's, a full range, deleting a Device whose data is on another server) have Hungarian texts in `translations.servers.ts`; `translateServerError` handles the "range is full" text with its numbers.
- Tests: `deviceRouting.test.ts` (the server assignment and the DevicePrincipal paths stay home).

## Replication from the master to a replica (slice S11, 2026-11-24)

A replica (`Server__Role=Replica`) pulls the Company's users (with password hashes), roles, the Devices assigned to it, their Reader grants and DevicePrincipals from the master every 60 s and serves them itself (see the API doc of the same name for what is copied and who owns what). What the Dashboard shows, on every server card of the Servers tab (`ReplicationSection`, not shown on the master's own card):

- **The replication key** (the platform administrator only; the Servers section of the Company page): **Create replication key** / **Create a new key** (a new one invalidates the old) and **Revoke key** (after a confirmation). The key comes back ONCE in the answer of `POST .../Servers/{serverId}/ReplicationSecret` and is shown in a dialog as the four `.env` lines the replica needs (`Server__Role=Replica`, `Server__Id`, `Server__MasterUrl` = the home server, `Server__ReplicationSecret`), with a Copy button and a warning; it is held only in that mutation's state (`gcTime: 0`, `reset()` on close), never in the query cache, a store or the URL. The card shows `Key issued` / `No key`, when it was created, and - from the master's memory of the pulls - `Up to date` / `Behind`, the last pull ("N minutes ago") and the last error the replica reported.
- **Check replica** (platform administrator or Company Admin): asks the replica ITSELF (`GET /api/Replication/Status`, per-request `baseUrl` of the server, the same token) - only on the click, never in the background: role, whether it is configured, last successful pull, last error, Device deletions not yet told to the master. **Sync now** (shown once the server answers as a replica) calls `POST /api/Replication/SyncNow` on that server: it pulls at once and applies even an unchanged version; the answer is the new state. A server the browser cannot reach (http from an https page) says so instead.
- A replica refuses the master-only changes with 409 and the text "This server is a replica...": the Dashboard already sends those calls (`/api/Devices/{id}/Server`, `/Principal...`, creating a Device, Company and platform calls) to the home server (S10), so the refusal is only seen when someone points the Dashboard at a replica.
- The platform administrator exists only on servers that have the `PLATFORM_SYSADMIN_*` settings: **Check replica / Sync now as the platform administrator work only if the replica has the same two settings**; a Company Admin works on every replica (the users are copied).
- Hooks: `useCreateReplicationSecret`, `useRevokeReplicationSecret`, `useReplicaStatus(server, enabled)`, `useSyncReplicaNow(server)` in `src/api/hooks/servers.ts`; `ReplicationSection.tsx` holds the UI; Hungarian texts in `translations.servers.ts`.
- Tests: `ReplicationSection.test.tsx` (nothing on the master's card, key / behind / error shown, no key, the key shown once and gone after closing, revoke after a confirmation, the replica asked only on the click and on its own address, Sync now, a server that answers as a master, the `.env` lines).


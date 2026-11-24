# The Company's servers (slice S6, 2026-11-24)

The API side (registry, Device id ranges, allocation, `Server__Id`) is in `c:\VS\PRECOG_API\docs\features\company-servers.md`. A Company may run any number of PRECOG servers with their own databases; the Dashboard only edits the registry and shows where a Device lives. It routes nothing yet (the per-Device routing is a later slice, S7).

## The Servers tab (Company Settings, Admin only)

- A new tab **Servers** next to Profile / Locations / Device groups / Device classes (`src/pages/admin/ServersTab.tsx`).
- One card per server: name, the address a person would open (`https://host:port`, the scheme follows the TLS switch; `serverUrl`), the Device id range or "No reserved Device id range", the number of Devices, a **This server** badge (the registry entry the API process is, `Server__Id`) and a **Disabled** badge. Notes are shown below.
- **Add a server / Edit server**: Name, Address, Port, First / Last Device id, Connection (https or http), Status (enabled), Notes. The form checks the same rules as the API (`checkServerForm`, `isValidServerAddress` in `src/lib/serverForm.ts`) and shows the problems next to the field **before any request**: the address is a host name, DNS name, IPv4 or IPv6 address - no `https://`, port or path; the port 1-65535; the range needs both ends (1-32767, first not above last); the API checks everything again (409 for a taken name or an overlapping range, with the other server named).
- **Delete server** is disabled while Devices are assigned (with the reason shown), asks for a confirmation otherwise; it only removes the registry entry.
- The API's refusals are English texts, some with a name or numbers inside; `translateServerError` puts them through `t()` with the values in the Hungarian order (`src/lib/translations.servers.ts`).

## The Device page

The **Status** card shows "Server: <name>" when the Device has one. In the Device's edit panel (Admin) a **Server** select (No server + every registered server) applies at once (`PUT /api/Devices/{id}/Server`); a server with a range refuses a Device outside it (409, shown translated).

## Code

- Hooks `src/api/hooks/servers.ts`: `useServers`, `useCreateServer`, `useUpdateServer`, `useDeleteServer`, `useAssignDeviceServer`; query key `queryKeys.servers`. `DeviceDto.serverId` / `serverName` come from the regenerated schema.
- Tests: `serverForm.test.ts` (address / range / port rules, the URL, the Hungarian of the API's refusals), `ServersTab.test.tsx` (list, no delete with Devices, add sends the typed values authenticated, a bad address is refused before any request, the overlap refusal in Hungarian, delete after a confirmation).

## Routing between servers: not built yet (S7)

The Dashboard still talks to the one server it signed in to (`VITE_API_BASE_URL`). The API now has the settings a second server needs (`HMAC_SERVER_KEY`, `Cors__AdditionalOrigins`, see the API doc), but a Device on another server can only be opened when that server accepts the token - either both servers hold the same user with the same password hash (then the same token is valid on both), or the second server asks the first one who the token belongs to. That choice decides how the Dashboard picks the base URL per Device (`Device.serverId` -> the registered server's `serverUrl`, https only from an https page); it is not guessed here.

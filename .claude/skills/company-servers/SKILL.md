---
name: company-servers
description: The Company's server registry in the Dashboard: the Servers tab of Company Settings (add / edit / delete a server, address, port, TLS, reserved Device id range), the Server selector and name on the Device page, the form checks and the Hungarian texts of the API's refusals, and the routing of a Device's requests to its own server (deviceRouting.ts, the routing middleware, loadCompanyDevices, DeviceRoutingGate). Use when working on, asking about or changing servers, ServersTab, useServers, serverForm.ts, the Device's server or routing between servers.
---

# The Company's servers: registry and Device id ranges (Dashboard)

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\company-servers.md (this feature, Dashboard)
   - c:\VS\PRECOG_API\docs\features\company-servers.md (the API side: registry, ranges, Device id allocation)
   Also respect the general rules in `CLAUDE.md` and `AGENTS.md`.
2. Any change to the feature updates its doc file in BOTH repositories; every new user-visible text is written in English and Hungarian (`t()`, `src/lib/translations.servers.ts`).
3. `src/api/schema.generated.ts` is regenerated, never hand-edited. Tests use invented names and addresses and a mocked API.

---
name: mac-registry
description: The mobile-device MAC address registry: queued / assigned / blacklisted phone MAC addresses of a Company, the Admin Mobile devices tab, and the DevicePrincipal-only Subscribe / Resolve / LatestIssue operations. Use when working on, asking about or changing MAC addresses, the Mobile devices tab, MacAddressesController or MacAddressRoleResolver.
---

# Mobile-device MAC address registry

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\mac-registry.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\mac-registry.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/admin/MobileDevicesPanel.tsx`
   - `src/pages/admin/ReadersPage.tsx`
   - `src/lib/macAddress.ts`
   - `src/api/hooks/macAddresses.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/MacAddressesController.cs`
   - `VidaSoft.API/Services/MacAddressRoleResolver.cs`
   - `DataAccess/MacAddressFormat.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

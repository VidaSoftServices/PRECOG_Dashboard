---
name: device-principal
description: DevicePrincipal page details: the Principal ID and Device ID shown with copy buttons next to the one-time Secret, int64 id display. Use when working on, asking about or changing the DevicePrincipal page, provisioning / rotation dialog or the firmware credential values.
---

# DevicePrincipal ids next to the Secret

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\device-principal.md (this repository, Dashboard)
   This feature has a doc only in the Dashboard repository; the API has no doc and no skill for it.
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/devices/DevicePrincipalPage.tsx`
   - `src/lib/ids.ts` - formatInt64Id
   - `src/api/hooks/devicePrincipal.ts`
   API side: DevicePrincipal provisioning and authentication rules are general rules in c:\VS\PRECOG_API\VidaSoft.API\CLAUDE.md ("Device principal").

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

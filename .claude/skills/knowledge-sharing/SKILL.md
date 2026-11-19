---
name: knowledge-sharing
description: Knowledge sharing: manual, Admin-approved sharing of reviewed canonical Issues from a source Device to a target Device (compatibility check, versioned Sensor mapping, approval, Issue selection, retraining of the target). Use when working on, asking about or changing knowledge sharing, DeviceKnowledgeShare, compatibility mapping or the Knowledge Sharing page.
---

# Knowledge sharing between Devices

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\knowledge-sharing.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\knowledge-sharing.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/knowledgeSharing/KnowledgeSharingPage.tsx`
   - `src/api/hooks/knowledgeSharing.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/KnowledgeSharingController.cs`
   - `VidaSoft.API/Services/KnowledgeSharingService.cs`
   - `DataAccess/KnowledgeCompatibilityValidator.cs`
   - `DataAccess/UnitConversion.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

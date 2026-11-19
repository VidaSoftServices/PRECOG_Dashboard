---
name: ollama
description: Ollama jobs in the Dashboard: submitting, polling and cancelling Ollama summary jobs, the real terminal status Succeeded (not Completed), and advisory-only output. Use when working on, asking about or changing the Ollama Jobs page, Ollama job polling or the Issue summary card.
---

# Ollama jobs

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\ollama.md (this repository, Dashboard)
   This feature has a doc only in the Dashboard repository; the API has no doc and no skill for it.
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/ollama/OllamaJobsPage.tsx`
   - `src/api/hooks/ollama.ts`
   - `src/api/domainTypes.ts` - OllamaJobStatus
   - `src/pages/issues/IssueDetailPage.tsx` - summary card
   API code: `VidaSoft.API/Controllers/OllamaController.cs`, `VidaSoft.API/Services/OllamaQueueService.cs` (rules in c:\VS\PRECOG_API\VidaSoft.API\CLAUDE.md).

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

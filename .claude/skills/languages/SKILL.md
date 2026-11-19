---
name: languages
description: Two languages: the English/Hungarian user interface (t() / useT, translations*.ts, the EN/HU switch) and the Issue message in both languages (messageHu / messageEn translated automatically by Ollama). Use when working on, asking about or changing translations, Hungarian texts, the language switch, localizedIssueMessage or the Issue message translation.
---

# Two languages (English / Hungarian) and the Issue text translation

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\languages.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\languages.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/lib/language.ts` - useT, tr, translate
   - `src/lib/translations.ts (+ translations.*.ts)`
   - `src/lib/translations.test.ts`
   - `src/lib/issueMessage.ts` - localizedIssueMessage
   - `src/app/AppShell.tsx` - LanguageMenu
   - `src/components/ToastProvider.tsx`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Services/IssueMessageTranslationService.cs`
   - `DataAccess/LocalPG_Data/IssueMessageTranslationInterceptor.cs`
   - `VidaSoft.API/Services/OllamaQueueService.cs` - OllamaQueueWorker

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

---
name: issues
description: Issues: canonical Issue grouping and visibility, review states (PendingReview / ReviewedFault / ReviewedFalsePositive), Issue categories and category suggestions, the editable feedback text, Issue opening / continuation in the analysis, and permanent Issue deletion. Use when working on, asking about or changing Issues, the Issue list or detail page, grouping, review, categories or Issue deletion.
---

# Issues: canonical grouping, review state, categories, feedback text, deletion

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\issues.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\issues.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/issues/IssueListPage.tsx`
   - `src/pages/issues/IssueDetailPage.tsx` - IssueFeedbackEditor, GroupMemberRow
   - `src/components/MoveToCanonicalDialog.tsx`
   - `src/pages/issues/DeleteIssueDialog.tsx`
   - `src/pages/issues/DeleteIssuesDialog.tsx`
   - `src/pages/categories/CategoriesPage.tsx`
   - `src/api/hooks/issues.ts`
   - `src/api/hooks/issueCategories.ts`
   - `src/api/hooks/issueCategorySuggestion.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Controllers/IssueController.cs`
   - `VidaSoft.API/Controllers/IssueCategoriesController.cs`
   - `VidaSoft.API/Controllers/IssueCategorySuggestionController.cs`
   - `VidaSoft.API/Services/IssueGroupingService.cs`
   - `VidaSoft.API/Services/IssueReviewService.cs`
   - `VidaSoft.API/Services/IssueDeletionService.cs`
   - `VidaSoft.API/Calculations.cs` - opening / continuing an Issue

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

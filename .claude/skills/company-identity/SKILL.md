---
name: company-identity
description: Company profile and identity synchronization: CompanyDto profileSource / nameEditable, the Profile tab, NoCompanyState for hasAuthorizedCompany false, MirroredDatabase (WordPress) and EntraId User sync, the Company master-data sync, mirrored permission level and the trimmed WordPress mirror. Use when working on, asking about or changing the Company profile, WordPress / Entra sync, the mirror tables or users without a Company.
---

# Company profile and human User synchronization

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\company-identity.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\company-identity.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/admin/AdminSettingsPage.tsx` - CompanyProfileTab
   - `src/lib/safeExternalUrl.ts`
   - `src/components/states/NoCompanyState.tsx`
   - `src/auth/AuthContext.tsx`
   - `src/app/AppShell.tsx`
   - `src/api/hooks/company.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `MLTraining/Identity/MirroredDatabaseUserSyncProvider.cs`
   - `MLTraining/Identity/EntraIdUserSyncProvider.cs`
   - `DataAccess/MirroredCompanySync.cs`
   - `DataAccess/CompanyProfile.cs`
   - `DataAccess/MirroredPermissionLevel.cs`
   - `DataAccess/WordPressMirrorKeys.cs`
   - `DataAccess/VSS_Data/WordPressMirrorSource.cs`
   - `VidaSoft.API/Controllers/CompanyController.cs`
   - `VidaSoft.API/Controllers/UserController.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

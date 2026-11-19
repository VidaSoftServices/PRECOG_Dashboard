---
name: training
description: Training and models: TrainingRequest status and polling, retraining generation and coalescing, the eligible training set (TrainingEligibilityService), the ML pipeline version, ModelVersion / model query, and the end-to-end training test. Use when working on, asking about or changing training, retraining, TrainingRequest, ModelVersion, the model query or the Training page.
---

# Training, retraining and models

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\training.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\training.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/training/TrainingPage.tsx`
   - `src/pages/devices/ModelQueryPage.tsx`
   - `src/api/hooks/training.ts`
   - `src/api/hooks/modelQuery.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `DataAccess/TrainingEligibilityService.cs`
   - `DataAccess/RetrainingCoordinator.cs`
   - `DataAccess/MlPipelineVersion.cs`
   - `DataAccess/EligibleSampleFeatureBuilder.cs`
   - `DataAccess/ModelTrainer.cs`
   - `MLTraining/Worker.cs`
   - `VidaSoft.API/Controllers/TrainingController.cs`
   - `VidaSoft.API/Controllers/ModelQueryController.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

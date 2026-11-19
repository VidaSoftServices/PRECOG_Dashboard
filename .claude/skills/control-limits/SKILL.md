---
name: control-limits
description: Control limits: UCL3 / UCL2 / LCL2 / LCL3 calculated when read (ControlLimitCalculator / ControlLimitReader, includeControlLimits), their definition and window, and the superseded stored-limit lanes and analysis loop fixes. Use when working on, asking about or changing control limits, UCL / LCL lines, ControlLimitCalculator or the analysis loop.
---

# Control limits (UCL / LCL)

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\control-limits.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\control-limits.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/components/charts/TelemetryChart.tsx` - detailedLimits
   - `src/api/hooks/telemetry.ts` - useTelemetryTrailingWithLimits
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Services/ControlLimitCalculator.cs`
   - `VidaSoft.API/Services/ControlLimitReader.cs`
   - `VidaSoft.API/Calculations.cs` - AnalyseSignalDatabase
   - `VidaSoft.API/Services/AnalysisDiagnostics.cs`
   - `VidaSoft.API/Controllers/DiagnosticsController.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

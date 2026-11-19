---
name: aggregation
description: Aggregation levels (SensorAggregationPolicy): the aggregation engine and worker, buckets and functions, bulk aggregation and its CSV, time scales, the Device time zone, minimum evaluation, anomaly/Issue evaluation of levels, the per-level calculation switch, the permanent deletion of levels (single, bulk and from a deletion CSV, with their buckets and Issues), reference lines of aggregated buckets and the aggregation pickers in Live Monitoring / Smart Analytics. Use when working on, asking about or changing aggregation, aggregation levels or policies, buckets, Bulk aggregation, deleting aggregation levels, the Device time zone or aggregated charts.
---

# Aggregation levels, aggregation engine and Device time zone

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\aggregation.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\aggregation.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/pages/devices/SensorPoliciesPage.tsx` - NewPolicyForm, level cards
   - `src/pages/devices/BulkAggregationDialog.tsx`
   - `src/lib/aggregationOptions.ts`
   - `src/lib/aggregationSheet.ts`
   - `src/lib/aggregationLevels.ts` - levelsOfSensor, pickLevel, aggregatedRange
   - `src/components/AggregationSelect.tsx`
   - `src/api/hooks/aggregationPolicies.ts`
   - `src/api/hooks/aggregatedPoints.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `VidaSoft.API/Services/AggregationService.cs` - AggregationEngine, AggregationWorker
   - `VidaSoft.API/Services/AggregationBuckets.cs`
   - `VidaSoft.API/Services/AggregationFunctions.cs`
   - `VidaSoft.API/Services/AggregatedLevelAnalysis.cs`
   - `VidaSoft.API/Services/AggregatedReference.cs`
   - `VidaSoft.API/Controllers/BulkAggregationController.cs`
   - `VidaSoft.API/Controllers/AggregationPoliciesController.cs`
   - `DataAccess/AggregationPolicyResolver.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

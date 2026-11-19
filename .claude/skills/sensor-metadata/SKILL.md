---
name: sensor-metadata
description: Sensor metadata: the unit catalog and known Vibration_Duo metrics (GET /api/SensorMetadata, exact-unit validation), the removed aggregation type / explanation, the QuantityKind to SensorType rename, the Sensor type suggestions (GET /api/SensorTypes) and the Data sets workbook. Use when working on, asking about or changing units, unitCode, the metric catalog, SensorType, the Sensor type dropdown or the Data sets workbook.
---

# Sensor unit catalog, SensorType and Sensor type suggestions

1. Before answering or changing anything, read the complete description of this feature:
   - c:\VS\PRECOG_Dashboard\docs\features\sensor-metadata.md (this repository, Dashboard)
   - c:\VS\PRECOG_API\docs\features\sensor-metadata.md (the API side)
   Also respect the general rules in this repository's `CLAUDE.md` (and `AGENTS.md`).

2. Main code files (Dashboard, paths relative to c:\VS\PRECOG_Dashboard):
   - `src/api/hooks/sensorMetadata.ts`
   - `src/api/hooks/sensorTypes.ts`
   - `src/components/SensorTypeInput.tsx`
   - `src/lib/sensorTypes.ts` - filterSensorTypes
   - `src/pages/devices/MetricDefinitionCard.tsx`
   - `src/lib/sensorDataSets.ts`
   - `src/lib/xlsxWriter.ts`
   - `src/test/noHardcodedMetadata.test.ts`
   API counterpart (paths relative to c:\VS\PRECOG_API):
   - `DataAccess/SensorMetadata.cs` - SensorMetadataCatalog
   - `VidaSoft.API/Controllers/SensorMetadataController.cs`
   - `VidaSoft.API/Controllers/SensorTypesController.cs`
   - `VidaSoft.API/Services/SensorMetadataSwagger.cs`

3. Every change to this feature must update its doc file(s) above in the same change (and the Features index row in `CLAUDE.md` and `docs/features/README.md` when the one-line summary changes). The docs are English.

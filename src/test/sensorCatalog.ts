import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toImportCatalog, type ImportCatalog } from '@/lib/sensorImport';
import type { SensorMetadataCatalog } from '@/api/hooks/sensorMetadata';

/**
 * TEST DATA ONLY: a dump of what GET /api/SensorMetadata returned when it was written
 * (src/test/fixtures/sensorMetadataCatalog.json). The application never reads this file - at runtime the catalog always
 * comes from the API - it only gives the tests a realistic, complete catalog (7 units, the 163 Vibration_Duo
 * metrics, each with its unit). Regenerate it when the API's catalog changes.
 */
const here = dirname(fileURLToPath(import.meta.url));

export const CATALOG_DTO: SensorMetadataCatalog = JSON.parse(readFileSync(join(here, 'fixtures', 'sensorMetadataCatalog.json'), 'utf-8'));

export const CATALOG: ImportCatalog = toImportCatalog(CATALOG_DTO)!;

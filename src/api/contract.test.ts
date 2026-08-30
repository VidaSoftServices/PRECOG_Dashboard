import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Lightweight structural checks against the already-generated
 * schema.generated.ts (produced by `npm run gen:api` from the live API's
 * swagger.json). This does NOT hit the network - it only reads a file
 * already on disk, so it runs as an ordinary unit test. It cannot detect a
 * drift that happened on the live API since the schema was last
 * regenerated; that requires actually running `npm run gen:api` again and
 * then this test (or a real integration script hitting localhost:5065),
 * which is a separate, explicitly out-of-scope-here step for CI.
 */
const here = dirname(fileURLToPath(import.meta.url));
const schemaText = readFileSync(join(here, 'schema.generated.ts'), 'utf-8');

function extractCalledPaths(): Set<string> {
  const hooksDir = join(here, 'hooks');
  const hookFiles = readdirSync(hooksDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const sources = [
    ...hookFiles.map((f) => readFileSync(join(hooksDir, f), 'utf-8')),
    // The only two apiClient call sites outside src/api/hooks/*.ts.
    readFileSync(join(here, '..', 'auth', 'AuthContext.tsx'), 'utf-8'),
  ];
  const paths = new Set<string>();
  const callRegex = /apiClient\.(GET|POST|PUT|DELETE)\(\s*['"]([^'"]+)['"]/g;
  for (const source of sources) {
    for (const match of source.matchAll(callRegex)) {
      const path = match[2];
      if (path) paths.add(path);
    }
  }
  return paths;
}

describe('OpenAPI contract quality (static - reads schema.generated.ts, no live API required)', () => {
  it('every path this app actually calls still exists in the generated schema', () => {
    const calledPaths = extractCalledPaths();
    // Sanity check on the extraction itself, not the contract - if this
    // drops well below the app's real hook count, the regex/glob above
    // broke, not the API.
    expect(calledPaths.size).toBeGreaterThan(50);

    const missing = [...calledPaths].filter((path) => !schemaText.includes(`"${path}":`));
    expect(missing).toEqual([]);
  });

  it('every telemetry ingestion batch-item DTO still requires sensorId per item (never optional)', () => {
    for (const dto of ['SignalInputData', 'BiSignalInputData', 'CurveInputData', 'BiCurveInputData']) {
      const start = schemaText.indexOf(`${dto}: {`);
      expect(start, `${dto} not found in schema`).toBeGreaterThan(-1);
      const end = schemaText.indexOf('\n        };', start);
      const dtoBlock = schemaText.slice(start, end);
      expect(dtoBlock).toMatch(/sensorId: number;/);
    }
  });

  it('no telemetry ingestion operation carries sensorId as a query parameter (the old, superseded [FromQuery] contract)', () => {
    for (const op of [
      'Continuous_IngestSignals',
      'BiDirectionalContinuous_IngestBiSignals',
      'Periodic_IngestCurves',
      'BiDirectionalPeriodic_IngestCurves',
    ]) {
      const start = schemaText.indexOf(`${op}: {`);
      expect(start, `${op} not found in schema`).toBeGreaterThan(-1);
      const bodyStart = schemaText.indexOf('requestBody', start);
      const parametersBlock = schemaText.slice(start, bodyStart);
      expect(parametersBlock).not.toMatch(/sensorId/);
    }
  });

  it.each([
    ['Authentication', '/api/Authentication/Request_HMAC_Key'],
    ['DevicePrincipal', '/api/Devices/{deviceId}/Principal'],
    ['Issue review (reviewState workflow)', '/api/Issue/{issueId}/Review'],
    ['canonical grouping', '/api/Issue/{issueId}/MoveGroup'],
    ['Issue category catalog', '/api/IssueCategories'],
    ['knowledge sharing', '/api/KnowledgeSharing'],
    ['Training', '/api/Training/Requests'],
    ['ModelQuery', '/api/Devices/{deviceId}/ModelQuery'],
  ])('the %s operation group still exists in the schema (%s)', (_name, path) => {
    expect(schemaText).toContain(`"${path}":`);
  });

  it('OllamaJobDto.status is still typed as an open string, not narrowed to a literal union that would silently paper over the documented "Succeeded" vs "Completed" discrepancy (see domainTypes.ts D4 and ollama.test.ts)', () => {
    const start = schemaText.indexOf('OllamaJobDto: {');
    expect(start).toBeGreaterThan(-1);
    const end = schemaText.indexOf('\n        };', start);
    const dtoBlock = schemaText.slice(start, end);
    expect(dtoBlock).toMatch(/status\??:\s*string(\s*\|\s*null)?;/);
  });
});

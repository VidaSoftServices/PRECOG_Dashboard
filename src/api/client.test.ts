import { describe, it, expect } from 'vitest';
import { unwrap, ApiError } from './client';

describe('unwrap', () => {
  it('returns data when present', () => {
    expect(unwrap({ data: { id: 1 } })).toEqual({ id: 1 });
  });

  it('does not throw for a 204 No Content response, even though data is undefined', () => {
    // openapi-fetch itself returns `data: undefined` for ANY 204/HEAD/empty-
    // content-length response regardless of what the server actually sent -
    // this is the exact case that used to be misreported as "Empty response
    // from API" (see client.ts's unwrap doc comment for the full story).
    // Many real mutations in this app return 204: Company_AssignRole,
    // Company_RevokeReaderDeviceGrant, AggregationPolicies_DeactivatePolicy,
    // Devices_SetPrincipalEnabled, and more.
    const result = { data: undefined, response: new Response(null, { status: 204 }) };
    expect(() => unwrap(result)).not.toThrow();
    expect(unwrap(result)).toBeUndefined();
  });

  it('still throws for a non-204 response with no data - a genuinely unexpected empty body', () => {
    const result = { data: undefined, response: new Response(null, { status: 200 }) };
    expect(() => unwrap(result)).toThrow(ApiError);
  });

  it('still throws when no response info is available at all', () => {
    expect(() => unwrap({ data: undefined })).toThrow(ApiError);
  });
});

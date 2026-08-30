import { describe, it, expect } from 'vitest';
import { normalizeApiError } from './errors';

function makeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const isString = typeof body === 'string';
  return new Response(isString ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': isString ? 'text/plain' : 'application/json', ...headers },
  });
}

describe('normalizeApiError', () => {
  it('handles a plain-string body (BadRequest("..."))', async () => {
    const response = makeResponse(400, 'Device 1 is not for test.');
    const result = await normalizeApiError(response);
    expect(result.status).toBe(400);
    expect(result.message).toBe('Device 1 is not for test.');
    expect(result.fieldErrors).toBeUndefined();
  });

  it('handles an ad-hoc {Message} object with PascalCase casing', async () => {
    const response = makeResponse(401, { Message: 'Login unsuccessful' });
    const result = await normalizeApiError(response);
    expect(result.status).toBe(401);
    expect(result.message).toBe('Login unsuccessful');
  });

  it('handles an ad-hoc {message} object with camelCase casing', async () => {
    const response = makeResponse(401, { message: 'Caller could not be resolved to an authorized Company.' });
    const result = await normalizeApiError(response);
    expect(result.message).toBe('Caller could not be resolved to an authorized Company.');
  });

  it('handles a genuine ValidationProblemDetails body from automatic model-binding failure', async () => {
    const response = makeResponse(400, {
      title: 'One or more validation errors occurred.',
      status: 400,
      errors: { externalDeviceId: ['The externalDeviceId field is required.'] },
    });
    const result = await normalizeApiError(response);
    expect(result.fieldErrors).toEqual({ externalDeviceId: ['The externalDeviceId field is required.'] });
    expect(result.message).toBe('One or more validation errors occurred.');
  });

  it('extracts Retry-After for 429 responses', async () => {
    const response = makeResponse(429, 'Too many requests', { 'Retry-After': '30' });
    const result = await normalizeApiError(response);
    expect(result.status).toBe(429);
    expect(result.retryAfterSeconds).toBe(30);
  });

  it('falls back to a default message when the body is empty', async () => {
    const response = makeResponse(404, '');
    const result = await normalizeApiError(response);
    expect(result.message).toBe('Not found.');
  });

  it('captures a correlation id header when present', async () => {
    const response = makeResponse(500, 'Internal error', { 'X-Correlation-Id': 'abc-123' });
    const result = await normalizeApiError(response);
    expect(result.correlationId).toBe('abc-123');
  });
});

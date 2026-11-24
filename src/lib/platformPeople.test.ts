import { describe, it, expect } from 'vitest';
import { ApiError } from '@/api/client';
import { isLastAdminWithDevices, LAST_ADMIN_WITH_DEVICES } from './platformPeople';

const error = (status: number, message: string) => new ApiError({ status, message, raw: null });

describe('isLastAdminWithDevices', () => {
  it('is true only for the 409 that is a question, not for any other refusal', () => {
    expect(isLastAdminWithDevices(error(409, LAST_ADMIN_WITH_DEVICES))).toBe(true);
    expect(isLastAdminWithDevices(error(409, 'A server with this name already exists.'))).toBe(false);
    expect(isLastAdminWithDevices(error(403, LAST_ADMIN_WITH_DEVICES))).toBe(false);
    expect(isLastAdminWithDevices(new Error(LAST_ADMIN_WITH_DEVICES))).toBe(false);
    expect(isLastAdminWithDevices(undefined)).toBe(false);
  });
});

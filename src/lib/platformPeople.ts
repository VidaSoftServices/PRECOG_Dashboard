import { ApiError } from '@/api/client';

/** The exact text the API refuses with (409) when the platform administrator takes the last Admin out of a Company that has Devices without confirming. */
export const LAST_ADMIN_WITH_DEVICES =
  'This is the last Admin of a Company that has Devices: after this the Company keeps its Devices with nobody to administer them. Confirm to continue.';

/** True for the one 409 that is not a refusal but a question: "this is the last Admin of a Company with Devices - confirm?". */
export function isLastAdminWithDevices(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && error.message === LAST_ADMIN_WITH_DEVICES;
}

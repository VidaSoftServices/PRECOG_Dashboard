import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type MacAddressEntryDto = components['schemas']['MacAddressEntryDto'];
export type CreateMacAddressEntryRequest = components['schemas']['CreateMacAddressEntryRequest'];
export type UpdateMacAddressEntryRequest = components['schemas']['UpdateMacAddressEntryRequest'];

/** The three states of one registry entry - one row per (Company, MAC), the status moves it between the three. */
export type MacAddressStatus = 'Queued' | 'Assigned' | 'Blacklisted';

/**
 * Upper bound of one list read. The API clamps `take` to 500; the registry
 * pages ask for fewer so a Company with a very long queue still renders
 * quickly - the queue itself is capped server-side (MobileAccess:MaxQueuedPerCompany).
 */
const PAGE_SIZE = 200;

/**
 * One registry view: the registration queue ("Queued", oldest request first),
 * the MAC addresses already belonging to a User ("Assigned"), or the
 * blacklist ("Blacklisted"). Admin-only on the server - a Reader receives
 * 403, which is why the page that calls this sits behind `RequireAdmin`.
 */
export function useMacAddresses(status: MacAddressStatus) {
  return useQuery({
    queryKey: queryKeys.macAddressList(status),
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/MacAddresses', { params: { query: { status, take: PAGE_SIZE } }, signal })),
  });
}

/** Every mutation can move an entry between the three views, so all of them invalidate the whole registry. */
function useInvalidateRegistry() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: queryKeys.macAddresses });
}

/** Registers a MAC address directly for a User (Assigned) without it having to wait in the queue. 409 when it is already in the registry in any state. */
export function useCreateMacAddress() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: async (body: CreateMacAddressEntryRequest) => unwrap(await apiClient.POST('/api/MacAddresses', { body })),
    onSuccess: invalidate,
  });
}

/**
 * Assign, reassign, blacklist or re-queue an entry, or edit its note, with
 * one call: `status: 'Assigned'` + `userId`, `status: 'Blacklisted'`, or
 * `status: 'Queued'` (which is also how a MAC address leaves the blacklist).
 */
export function useUpdateMacAddress() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateMacAddressEntryRequest }) =>
      unwrap(await apiClient.PUT('/api/MacAddresses/{id}', { params: { path: { id } }, body })),
    onSuccess: invalidate,
  });
}

/** Removes the entry entirely, whatever state it is in. For a blacklisted MAC address this is "take it off the blacklist": a Device may submit it to the queue again. */
export function useDeleteMacAddress() {
  const invalidate = useInvalidateRegistry();
  return useMutation({
    mutationFn: async (id: number) => unwrap(await apiClient.DELETE('/api/MacAddresses/{id}', { params: { path: { id } } })),
    onSuccess: invalidate,
  });
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type DeviceDebugLineDto = components['schemas']['DeviceDebugLineDto'];

/** The lines kept on screen (the API keeps at most 1000 as well). */
export const MAX_DEBUG_LINES = 1000;

const POLL_ACTIVE_MS = 5_000;
const POLL_IDLE_MS = 15_000;

/**
 * The remote debug log of a Device (docs/features/firmware-update.md, "Remote debug log"): polls GET .../Debug with the sequence number of the last line it
 * has, and collects the new lines. The text lives in the API's memory only (nothing is stored in a database); the lines already received stay in the
 * browser until the debug mode is switched on again or the view is cleared.
 */
export function useDeviceDebug(deviceId: number) {
  const [lines, setLines] = useState<DeviceDebugLineDto[]>([]);
  const [dropped, setDropped] = useState(0);
  const cursor = useRef(0);
  const [active, setActive] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.deviceDebug(deviceId),
    queryFn: async ({ signal }) =>
      unwrap(await apiClient.GET('/api/Devices/{deviceId}/Debug', { params: { path: { deviceId }, query: { after: cursor.current } }, signal })),
    refetchInterval: (q) => (q.state.data?.active ? POLL_ACTIVE_MS : POLL_IDLE_MS),
  });

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    setActive(Boolean(data.active));
    setDropped(data.dropped ?? 0);
    const last = data.lastSeq ?? 0;
    if (data.active && last < cursor.current) {
      // Another session began (the numbers start again): what is on screen belongs to the old one.
      cursor.current = 0;
      setLines([]);
      void query.refetch();
      return;
    }
    const incoming = data.lines ?? [];
    if (incoming.length > 0) {
      cursor.current = last;
      setLines((previous) => [...previous, ...incoming].slice(-MAX_DEBUG_LINES));
    }
    // `query` is deliberately not a dependency: only new data matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data]);

  const clear = useCallback(() => {
    setLines([]);
  }, []);

  const reset = useCallback(() => {
    cursor.current = 0;
    setLines([]);
  }, []);

  return { query, lines, active, secondsLeft: query.data?.secondsLeft ?? 0, dropped, clear, reset };
}

/** Switches the Device's debug mode on for `minutes` (1 to 360) or off with 0 (Company Admin only on the server). */
export function useSetDeviceDebug(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (minutes: number) => unwrap(await apiClient.PUT('/api/Devices/{deviceId}/Debug', { params: { path: { deviceId } }, body: { minutes } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.deviceDebug(deviceId) }),
  });
}

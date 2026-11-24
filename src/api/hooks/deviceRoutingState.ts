import { useSyncExternalStore } from 'react';
import { getUnreachableServers, subscribeRouting, type UnreachableServer } from '@/api/deviceRouting';

/** The servers of the Company whose Devices could not be read the last time the Device list was loaded (empty when all is well). */
export function useUnreachableServers(): readonly UnreachableServer[] {
  return useSyncExternalStore(subscribeRouting, getUnreachableServers, getUnreachableServers);
}

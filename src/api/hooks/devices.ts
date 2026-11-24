import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';
import { ApiError } from '@/api/client';
import {
  getHomeBaseUrl,
  isBlockedByMixedContent,
  serverBaseUrl,
  setDeviceRoutes,
  setUnreachableServers,
  type DeviceRoute,
  type UnreachableServer,
} from '@/api/deviceRouting';

export type DeviceDto = components['schemas']['DeviceDto'];
export type CreateDeviceRequest = components['schemas']['CreateDeviceRequest'];
export type UpdateDeviceRequest = components['schemas']['UpdateDeviceRequest'];
export type DeviceDeletionResult = components['schemas']['DeviceDeletionResultDto'];
export type DeviceDataDeletionResult = components['schemas']['DeviceDataDeletionResultDto'];

/**
 * The Devices of the whole Company: the home server's list, plus - when the Company registered other servers - the list of each
 * enabled, reachable one (same token: the same user exists there, see deviceRouting.ts). It also publishes where each Device
 * lives, so later requests for it go to the right server. A server that cannot be read does not fail the list: it is reported
 * through `setUnreachableServers` and the other servers' Devices still show. With no other server registered this is exactly
 * the one request it always was (plus the small server list).
 */
export async function loadCompanyDevices(signal?: AbortSignal): Promise<DeviceDto[]> {
  const home = unwrap(await apiClient.GET('/api/Devices', { signal }));

  let servers: components['schemas']['ServerDto'][] = [];
  try {
    servers = unwrap(await apiClient.GET('/api/Servers', { signal }));
  } catch (error) {
    // An aborted request is not "no servers"; anything else (an older API without the registry) just means the home server only.
    if (signal?.aborted) throw error;
  }

  const homeOrigin = (() => {
    try {
      return new URL(getHomeBaseUrl()).origin;
    } catch {
      return '';
    }
  })();
  const others = servers.filter((s) => s.enabled && !s.isThisServer && s.id !== undefined && !!s.address);

  const routes = new Map<number, DeviceRoute>();
  const unreachable: UnreachableServer[] = [];
  const merged: DeviceDto[] = [...home];
  const indexById = new Map<number, number>();
  merged.forEach((d, i) => d.id !== undefined && indexById.set(d.id, i));

  const routeOf = (s: components['schemas']['ServerDto']): DeviceRoute => ({
    baseUrl: serverBaseUrl({ address: s.address ?? '', port: s.port, useTls: s.useTls ?? true }),
    serverId: s.id!,
    serverName: s.name ?? '',
  });

  // A home row that says "lives on server X" routes there even before X's own list is read.
  for (const device of home) {
    const server = others.find((s) => s.id === device.serverId);
    if (server && device.id !== undefined && new URL(routeOf(server).baseUrl).origin !== homeOrigin) routes.set(device.id, routeOf(server));
  }

  const reachable = others.filter((s) => {
    const route = routeOf(s);
    if (new URL(route.baseUrl).origin === homeOrigin) return false;
    if (isBlockedByMixedContent(route.baseUrl)) {
      unreachable.push({ serverId: route.serverId, serverName: route.serverName, reason: 'blocked' });
      for (const [id, r] of [...routes]) if (r.serverId === route.serverId) routes.delete(id);
      return false;
    }
    return true;
  });

  const results = await Promise.allSettled(
    reachable.map(async (s) => unwrap(await apiClient.GET('/api/Devices', { baseUrl: routeOf(s).baseUrl, signal }))),
  );
  if (signal?.aborted) throw new DOMException('The request was aborted.', 'AbortError');

  results.forEach((result, i) => {
    const server = reachable[i];
    if (!server) return;
    const route = routeOf(server);
    if (result.status === 'rejected') {
      const refused = result.reason instanceof ApiError && result.reason.status === 401;
      unreachable.push({ serverId: route.serverId, serverName: route.serverName, reason: refused ? 'refused' : 'down' });
      return;
    }
    for (const device of result.value) {
      if (device.id === undefined) continue;
      const row: DeviceDto = { ...device, serverId: route.serverId, serverName: route.serverName };
      const at = indexById.get(device.id);
      if (at === undefined) {
        indexById.set(device.id, merged.length);
        merged.push(row);
      } else {
        merged[at] = row;
      }
      routes.set(device.id, route);
    }
  });

  setDeviceRoutes(routes);
  setUnreachableServers(unreachable);
  return merged;
}

export function useDevices() {
  return useQuery({
    queryKey: queryKeys.devices,
    queryFn: async ({ signal }) => loadCompanyDevices(signal),
  });
}

/**
 * One Device's master data, including `heartBeat` - the server's "last observed
 * activity" instant that the detail page renders as "Last heartbeat".
 *
 * `refetchIntervalMs` is opt-in and defaults to no polling, so every existing
 * caller keeps its current behaviour. Pass a value (from
 * `POLL_INTERVALS_MS`, never a literal) only on a screen that displays a value
 * which changes on its own while the page sits open.
 */
export function useDevice(deviceId: number | undefined, refetchIntervalMs?: number) {
  return useQuery({
    queryKey: queryKeys.device(deviceId ?? -1),
    queryFn: async ({ signal }) =>
      unwrap(
        await apiClient.GET('/api/Devices/{deviceId}', {
          params: { path: { deviceId: deviceId! } },
          signal,
        }),
      ),
    enabled: deviceId !== undefined,
    refetchInterval: refetchIntervalMs ?? false,
  });
}

export function useCreateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateDeviceRequest) => unwrap(await apiClient.POST('/api/Devices', { body })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

export function useUpdateDevice(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateDeviceRequest) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}', {
          params: { path: { deviceId } },
          body,
        }),
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.device(deviceId), updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

/**
 * PERMANENTLY deletes the Device and everything of it (Admin only). The API requires the Device's name as confirmation
 * (`confirmDeviceName`) and checks it itself; it audits and logs the deletion. Only the device list is invalidated here -
 * the caller navigates away from the (now gone) Device's pages.
 */
export function useDeleteDevice(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (confirmDeviceName: string) =>
      unwrap(
        await apiClient.DELETE('/api/Devices/{deviceId}', {
          params: { path: { deviceId } },
          body: { confirmDeviceName },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices });
    },
  });
}

/**
 * PERMANENTLY deletes all data of the Device (Admin only): the telemetry of every Sensor and the aggregation derived from it,
 * plus the analysis built on it - Issues, models, training requests. The Device, its Sensors and settings, credentials and
 * share configuration stay. Same typed-name confirmation as `useDeleteDevice`, checked by the API. Everything that may
 * display that data is refetched afterwards.
 */
export function useDeleteDeviceData(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (confirmDeviceName: string) =>
      unwrap(
        await apiClient.DELETE('/api/Devices/{deviceId}/Data', {
          params: { path: { deviceId } },
          body: { confirmDeviceName },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['telemetry'] });
      queryClient.invalidateQueries({ queryKey: ['issues'] });
      queryClient.invalidateQueries({ queryKey: ['training'] });
      queryClient.invalidateQueries({ queryKey: queryKeys.device(deviceId) });
    },
  });
}

/** Convenience wrapper for the common "just disable it" action - the non-destructive alternative to `useDeleteDevice`. */
export function useDisableDevice(deviceId: number) {
  const update = useUpdateDevice(deviceId);
  return {
    ...update,
    disable: () => update.mutateAsync({ enabled: false }),
  };
}

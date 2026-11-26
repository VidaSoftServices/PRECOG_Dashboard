import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type DeviceFirmwareDto = components['schemas']['DeviceFirmwareDto'];
export type FirmwareReleaseDto = components['schemas']['FirmwareReleaseDto'];
export type FirmwareEventDto = components['schemas']['FirmwareEventDto'];

/** The states a Device reports about its firmware (see docs/features/firmware-update.md). */
export const FIRMWARE_STATES = ['running', 'checking', 'downloading', 'staged', 'confirmed', 'rolledback', 'rejected', 'failed'] as const;

/** How often the card re-reads the Device's reports: the Device itself reports at most every few seconds while it updates. */
const FIRMWARE_POLL_MS = 15_000;

/**
 * The Device's firmware: the assigned release, what the Device runs and reported last (version, the SHA-256 of its own flash image, the state and its
 * log), the uploaded releases and the report timeline. Any level with access to the Device may read it. Polled while the card is open: an update is
 * a matter of minutes and the Admin watches it.
 */
export function useDeviceFirmware(deviceId: number) {
  return useQuery({
    queryKey: queryKeys.firmware(deviceId),
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/Devices/{deviceId}/Firmware', { params: { path: { deviceId } }, signal })),
    refetchInterval: FIRMWARE_POLL_MS,
  });
}

export interface FirmwareUploadForm {
  file: File;
  note?: string;
}

/** Uploads a firmware.bin as a release of the Device (Company Admin only on the server). Nothing is installed by it: assign it afterwards. */
export function useUploadFirmware(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: FirmwareUploadForm) =>
      unwrap(
        await apiClient.POST('/api/Devices/{deviceId}/Firmware/Releases', {
          params: { path: { deviceId } },
          // The generated body type is the form's schema; a real File is what the browser sends as the multipart part.
          body: form as never,
          bodySerializer: (body: unknown) => {
            const data = body as FirmwareUploadForm;
            const fd = new FormData();
            fd.append('file', data.file, data.file.name);
            if (data.note) fd.append('note', data.note);
            return fd;
          },
        }),
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.firmware(deviceId) }),
  });
}

/** Tells the Device which release to run (`null` removes the assignment). The Device learns of it from its next heartbeat (about 30 seconds). */
export function useAssignFirmware(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (releaseId: number | null) =>
      unwrap(await apiClient.PUT('/api/Devices/{deviceId}/Firmware/Assign', { params: { path: { deviceId } }, body: { releaseId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.firmware(deviceId) }),
  });
}

/** Deletes an uploaded release (the server refuses the assigned one with 409). */
export function useDeleteFirmwareRelease(deviceId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (releaseId: number) =>
      unwrap(await apiClient.DELETE('/api/Devices/{deviceId}/Firmware/Releases/{releaseId}', { params: { path: { deviceId, releaseId } } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.firmware(deviceId) }),
  });
}

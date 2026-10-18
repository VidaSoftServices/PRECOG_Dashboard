import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';

/**
 * Switches one Sensor's maintenance mode on or off. Company Admin only on
 * the server (a non-Admin gets 403 "You need admin privileges to set
 * maintenance mode.") - the control that calls this is shown to an Admin only,
 * but that is a UX convenience, never the security boundary.
 *
 * The request is just `{ enabled }`. A Device can never change maintenance
 * mode (it can only read it), so the API carries no MAC address here; a human
 * caller is authorized by their own session.
 *
 * Reading the state needs no hook of its own: `SensorDto` (from `useSensors`)
 * already carries `maintenanceMode`/`maintenanceSince`, so a successful
 * change only has to refresh the Sensor list.
 */
export function useSetSensorMaintenance(deviceId: number, sensorId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (enabled: boolean) =>
      unwrap(
        await apiClient.PUT('/api/Devices/{deviceId}/Sensors/{sensorId}/Maintenance', {
          params: { path: { deviceId, sensorId } },
          body: { enabled },
        }),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sensors(deviceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.sensor(deviceId, sensorId) });
    },
  });
}

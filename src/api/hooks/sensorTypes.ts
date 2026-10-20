import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';

/**
 * The Sensor types (free text) already in use in the Company, as the user may see them - suggestions for the Sensor type
 * field, so the same word is not typed again and again. The API returns each value once, sorted, at most 500; it never
 * restricts what may be entered. Invalidated whenever a Sensor is created, updated or imported.
 */
export function useSensorTypes() {
  return useQuery({
    queryKey: queryKeys.sensorTypes,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/SensorTypes', { signal })),
    staleTime: 5 * 60 * 1000,
  });
}

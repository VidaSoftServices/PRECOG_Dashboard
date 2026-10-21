import { useQuery } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import type { components } from '@/api/schema.generated';

export type SensorMetadataCatalog = components['schemas']['SensorMetadataCatalogDto'];
export type MetricUnit = components['schemas']['MetricUnitDto'];
export type MetricDefinition = components['schemas']['MetricDefinitionDto'];

/**
 * The canonical unit / future-aggregation catalog: the allowed unit codes with their labels, the aggregation types with
 * the units each is valid for, and every known metric (the Vibration_Duo KPIs) with its exact unit and aggregation.
 *
 * It is the ONLY source of this knowledge in the dashboard - the Sensor import validates against it, and the Sensor
 * details resolve labels from it - so nothing here is a hard-coded mapping from a metric name to a unit. It is the same
 * for every Company and changes only with an API release, hence the long stale time.
 */
export function useSensorMetadata() {
  return useQuery({
    queryKey: queryKeys.sensorMetadata,
    queryFn: async ({ signal }) => unwrap(await apiClient.GET('/api/SensorMetadata', { signal })),
    staleTime: 60 * 60 * 1000,
  });
}

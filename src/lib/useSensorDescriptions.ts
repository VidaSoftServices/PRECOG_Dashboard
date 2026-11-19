import { useQueries } from '@tanstack/react-query';
import { apiClient, unwrap } from '@/api/client';
import { queryKeys } from '@/api/queryKeys';
import { useLanguage } from './language';

/** One Sensor whose description a chart or card may show. `label` (for example the Device's name) is shown above the text when given. */
export interface DescribedSensor {
  deviceId: number | undefined;
  sensorId: number | undefined;
  /** The Sensor's externalSensorId, only used as the entry's accessible name. */
  sensorName: string | null | undefined;
  label?: string | null;
}

export interface FoundDescription {
  row: { sensorName: string; description: string };
  label?: string | null;
}

/**
 * The stored descriptions of the given Sensors (read from the API, one small request per Sensor, cached for five minutes), in the chosen
 * language and in English where the Sensor has no text in that one. A Sensor without any description - or whose read failed - is simply absent,
 * so nothing is shown for it. `enabled` = false reads nothing (a card whose enlarged chart is closed).
 */
export function useSensorDescriptions(items: readonly DescribedSensor[] | undefined, enabled = true): FoundDescription[] {
  const { language } = useLanguage();
  const list = items ?? [];
  const results = useQueries({
    queries: list.map((item) => ({
      queryKey: queryKeys.sensorDescriptions(item.deviceId ?? -1, item.sensorId ?? -1),
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        unwrap(
          await apiClient.GET('/api/Devices/{deviceId}/Sensors/{sensorId}/Descriptions', {
            params: { path: { deviceId: item.deviceId!, sensorId: item.sensorId! } },
            signal,
          }),
        ),
      enabled: enabled && item.deviceId !== undefined && item.sensorId !== undefined,
      staleTime: 5 * 60 * 1000,
      retry: false,
    })),
  });

  const found: FoundDescription[] = [];
  list.forEach((item, i) => {
    const rows = results[i]?.data ?? [];
    const row = rows.find((r) => r.language === language) ?? rows.find((r) => r.language === 'en') ?? rows[0];
    if (row?.description) found.push({ row: { sensorName: item.sensorName ?? String(item.sensorId), description: row.description }, label: item.label });
  });
  return found;
}

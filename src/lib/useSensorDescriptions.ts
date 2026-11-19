import { useLanguage } from './language';
import { getDeviceDescriptions, useDescriptionVersion } from './descriptionStore';
import type { DescriptionRow } from './descriptionSheet';

/** One Sensor whose description a chart or card may show. `label` (for example the Device's name) is shown above the text when given. */
export interface DescribedSensor {
  deviceId: number | undefined;
  /** The Sensor's externalSensorId - the sheet's sensorName. */
  sensorName: string | null | undefined;
  label?: string | null;
}

export interface FoundDescription {
  row: DescriptionRow;
  label?: string | null;
}

/** The imported descriptions of the given Sensors; a Sensor without one (or a Device with none imported) is simply absent. */
export function useSensorDescriptions(items: readonly DescribedSensor[] | undefined): FoundDescription[] {
  useDescriptionVersion();
  const { language } = useLanguage();
  const found: FoundDescription[] = [];
  for (const item of items ?? []) {
    if (!item.sensorName) continue;
    const rows = getDeviceDescriptions(item.deviceId)?.rows.filter((r) => r.sensorName === item.sensorName);
    // The chosen language, else English (a sheet may not have every Sensor in both languages).
    const row = rows?.find((r) => r.language === language) ?? rows?.find((r) => r.language === 'en') ?? rows?.[0];
    if (row) found.push({ row, label: item.label });
  }
  return found;
}

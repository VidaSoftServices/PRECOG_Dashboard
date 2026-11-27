import { useMemo } from 'react';
import { Button, Tooltip } from '@fluentui/react-components';
import { DocumentArrowDown24Regular } from '@fluentui/react-icons';
import { downloadTextFile } from '@/lib/downloadFile';
import { buildSensorMap, sensorMapFileName, type SensorMapSensor } from '@/lib/sensorMap';
import { useT } from '@/lib/language';

/**
 * "Export sensor for hardware" (the sensor_map.h of the firmware): downloads, as a .txt, the numeric SensorId of EVERY Sensor
 * that exists on this Device right now (see `buildSensorMap`) - no filtering and no comparison with the metric catalog.
 * Built in the browser from the Sensors already loaded on the page; nothing is sent anywhere. The numeric ids are not secret.
 */
export function ExportSensorMapButton({
  device,
  sensors,
}: {
  device: { id?: number | null; deviceName?: string | null; externalDeviceId?: string | null };
  sensors: { id?: number | null; externalSensorId?: string | null }[];
}) {
  const t = useT();
  const usable: SensorMapSensor[] = useMemo(
    () => sensors.flatMap((s) => (s.id != null && s.externalSensorId ? [{ id: s.id, externalSensorId: s.externalSensorId }] : [])),
    [sensors],
  );
  const disabled = usable.length === 0 || device.id == null;

  const exportMap = () => {
    if (device.id == null) return;
    const { text } = buildSensorMap(usable, {
      deviceId: device.id,
      deviceName: device.deviceName ?? '',
      externalDeviceId: device.externalDeviceId ?? '',
      generatedAt: new Date(),
    });
    downloadTextFile(sensorMapFileName(device.id, device.deviceName || device.externalDeviceId), text, 'text/plain;charset=utf-8');
  };

  return (
    <Tooltip content="Download the numeric SensorIds of this Device's existing Sensors as the text of the firmware's sensor_map.h" relationship="description">
      <Button icon={<DocumentArrowDown24Regular />} onClick={exportMap} disabled={disabled}>
        {t('Export sensor for hardware')}</Button>
    </Tooltip>
  );
}

import { useMemo } from 'react';
import { Button, Tooltip } from '@fluentui/react-components';
import { DocumentArrowDown24Regular } from '@fluentui/react-icons';
import { useSensorMetadata } from '@/api/hooks/sensorMetadata';
import { downloadTextFile } from '@/lib/downloadFile';
import { buildSensorMap, sensorMapFileName, type SensorMapSensor } from '@/lib/sensorMap';
import { toImportCatalog } from '@/lib/sensorImport';

/**
 * "Export sensor for hardware" (the sensor_map.h of the firmware): downloads, as a .txt, exactly what the Vibration_Duo firmware's `include/sensor_map.h` needs - the
 * numeric SensorId of every firmware channel that exists as a Sensor on this Device right now (see `buildSensorMap`).
 * Built in the browser from the Sensors already loaded on the page; nothing is sent anywhere. The numeric ids are not
 * secret. Which names are firmware channels comes from the API's catalog, so the button waits for it.
 */
export function ExportSensorMapButton({
  device,
  sensors,
}: {
  device: { id?: number | null; deviceName?: string | null; externalDeviceId?: string | null };
  sensors: { id?: number | null; externalSensorId?: string | null }[];
}) {
  const catalogQuery = useSensorMetadata();
  const catalog = useMemo(() => toImportCatalog(catalogQuery.data), [catalogQuery.data]);
  const usable: SensorMapSensor[] = useMemo(
    () => sensors.flatMap((s) => (s.id != null && s.externalSensorId ? [{ id: s.id, externalSensorId: s.externalSensorId }] : [])),
    [sensors],
  );
  const disabled = !catalog || usable.length === 0 || device.id == null;

  const exportMap = () => {
    if (!catalog || device.id == null) return;
    const { text } = buildSensorMap(usable, catalog, {
      deviceId: device.id,
      deviceName: device.deviceName ?? '',
      externalDeviceId: device.externalDeviceId ?? '',
      generatedAt: new Date(),
    });
    downloadTextFile(sensorMapFileName(device.id), text, 'text/plain;charset=utf-8');
  };

  return (
    <Tooltip content="Download the numeric SensorIds of this Device's existing Sensors as the text of the firmware's sensor_map.h" relationship="description">
      <Button icon={<DocumentArrowDown24Regular />} onClick={exportMap} disabled={disabled}>
        Export sensor for hardware
      </Button>
    </Tooltip>
  );
}

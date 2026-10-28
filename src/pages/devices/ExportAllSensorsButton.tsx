import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Spinner, Tooltip } from '@fluentui/react-components';
import { ArrowDownload24Regular } from '@fluentui/react-icons';
import { useAppToast } from '@/components/ToastProvider';
import { fetchDeviceAggregationPolicies, fetchDeviceSetpoints } from '@/api/hooks/deviceConfiguration';
import { downloadTextFile } from '@/lib/downloadFile';
import { buildSensorsExportCsv, sensorsExportFileName, type ExportSensor } from '@/lib/sensorExport';

/**
 * "Export all current sensors": downloads every Sensor of the Device as a sheet the "Import Sensors" dialog takes back as it is
 * (name, direction, type, unit, the raw policy's scale / lookback / min issue score, the Calculate switch and the Sensor's CURRENT
 * setpoint: target / tolerance, or the above/below columns) - edit it in Excel and import it to change many Sensors at once. The raw
 * policy values and the setpoints come from two Device-wide requests, read fresh when the button is pressed; nothing is sent anywhere.
 * The full setpoint history (every interval) is the "Manage Setpoints" export.
 */
export function ExportAllSensorsButton({ deviceId, sensors }: { deviceId: number; sensors: readonly ExportSensor[] }) {
  const queryClient = useQueryClient();
  const toast = useAppToast();
  const [busy, setBusy] = useState(false);

  const exportAll = async () => {
    setBusy(true);
    try {
      // Two Device-wide reads (the raw policies and every setpoint interval), not one request per Sensor.
      const [policies, setpoints] = await Promise.all([fetchDeviceAggregationPolicies(queryClient, deviceId), fetchDeviceSetpoints(queryClient, deviceId)]);
      downloadTextFile(sensorsExportFileName(deviceId), buildSensorsExportCsv(sensors, policies ?? [], setpoints ?? []));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The export failed.', 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tooltip content="Download every Sensor of this Device as a sheet that Import Sensors can take back (to change many Sensors at once)" relationship="description">
      <Button icon={busy ? <Spinner size="tiny" /> : <ArrowDownload24Regular />} onClick={() => void exportAll()} disabled={busy || sensors.length === 0}>
        Export all sensors
      </Button>
    </Tooltip>
  );
}

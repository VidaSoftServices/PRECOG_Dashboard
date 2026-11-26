import { useParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { useAuth } from '@/auth/AuthContext';
import { useDevice } from '@/api/hooks/devices';
import { useT } from '@/lib/language';
import { DebugLogCard } from './DebugLogCard';
import { FirmwareCard } from './FirmwareCard';

/**
 * The Device's firmware page (/devices/:deviceId/firmware, opened with the "Firmware" button of the Device page): the whole Firmware card -
 * what the Device runs, the uploaded releases, upload / install / delete for an Admin, and the Device's reports. See docs/features/firmware-update.md.
 */
export function FirmwarePage() {
  const t = useT();
  const { isAdmin } = useAuth();
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const deviceQuery = useDevice(id);

  if (deviceQuery.isLoading) return <LoadingState label={t('Loading device…')} />;
  if (deviceQuery.isError || !deviceQuery.data) return <ErrorState error={deviceQuery.error} onRetry={() => deviceQuery.refetch()} />;
  const device = deviceQuery.data;

  return (
    <>
      <PageHeader
        title={device.deviceName || device.externalDeviceId || t('Device {0}', device.id)}
        titleDisplay="compact"
        description={`${t('Firmware')} · ${device.externalDeviceId}`}
      />
      <FirmwareCard deviceId={id} device={device} isAdmin={isAdmin} />
      {isAdmin && <DebugLogCard deviceId={id} deviceLabel={device.deviceName || device.externalDeviceId || String(id)} />}
    </>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Body1Strong, Button, Card, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Wrench24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { MaintenancePill } from '@/components/StatusPill';
import { useAuth } from '@/auth/AuthContext';
import { useDevice } from '@/api/hooks/devices';
import { useSensors } from '@/api/hooks/sensors';
import { useT } from '@/lib/language';
import { MaintenanceAllDialog } from './MaintenanceAllDialog';
import { MaintenanceHistoryCard } from './MaintenanceHistoryCard';
import { RecalculationProgress } from './RecalculationProgress';

const useStyles = makeStyles({
  card: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: tokens.spacingVerticalM },
  status: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM, flexWrap: 'wrap' },
  muted: { color: tokens.colorNeutralForeground3 },
});

/**
 * The Device's maintenance page (/devices/:deviceId/maintenance, opened with the "Maintenance" button of the Device page): everything about maintenance
 * of the whole machine - how many Sensors are in maintenance now, switching all of them at once (Admin), and the maintenance history with "Change kind"
 * and "Start a new baseline". The per-Sensor maintenance buttons stay on the Device page. See docs/features/maintenance.md.
 */
export function MaintenancePage() {
  const t = useT();
  const styles = useStyles();
  const { isAdmin } = useAuth();
  const { deviceId } = useParams<{ deviceId: string }>();
  const id = Number(deviceId);
  const deviceQuery = useDevice(id);
  const sensorsQuery = useSensors(id);
  const [allOpen, setAllOpen] = useState(false);

  if (deviceQuery.isLoading) return <LoadingState label={t('Loading device…')} />;
  if (deviceQuery.isError || !deviceQuery.data) return <ErrorState error={deviceQuery.error} onRetry={() => deviceQuery.refetch()} />;
  const device = deviceQuery.data;

  const sensors = sensorsQuery.data ?? [];
  const total = sensors.length;
  const inMaintenance = sensors.filter((s) => s.maintenanceMode).length;

  return (
    <>
      <PageHeader
        title={device.deviceName || device.externalDeviceId || t('Device {0}', device.id)}
        titleDisplay="compact"
        description={`${t('Maintenance')} · ${device.externalDeviceId}`}
      />

      <RecalculationProgress deviceId={id} isAdmin={isAdmin} />

      {sensorsQuery.isLoading && <LoadingState label={t('Loading sensors…')} />}
      {sensorsQuery.isError && <ErrorState error={sensorsQuery.error} onRetry={() => sensorsQuery.refetch()} />}
      {sensorsQuery.data && total === 0 && <EmptyState title={t('No sensors configured')} description={t('This Device has no Sensors yet.')} />}

      {total > 0 && (
        <>
          <Card className={styles.card} aria-label={t('All Sensors')}>
            <Body1Strong as="h2">{t('All Sensors')}</Body1Strong>
            <div className={styles.status}>
              <Text>{t('{0} of {1} Sensor(s) of this Device are in maintenance mode now.', inMaintenance, total)}</Text>
              <MaintenancePill maintenanceMode={inMaintenance > 0} />
            </div>
            <Text size={200} className={styles.muted}>
              {t('While a Sensor is in maintenance, the values the Device sends for it are accepted but ignored: they are not stored and not analysed.')}
            </Text>
            {isAdmin && (
              <Button appearance="primary" icon={<Wrench24Regular />} onClick={() => setAllOpen(true)}>
                {inMaintenance === 0 ? t('Start maintenance on all Sensors') : inMaintenance === total ? t('End maintenance on all Sensors') : t('Start or end on all Sensors…')}
              </Button>
            )}
          </Card>

          <MaintenanceHistoryCard deviceId={id} sensors={sensors} isAdmin={isAdmin} />
        </>
      )}

      {isAdmin && (
        <MaintenanceAllDialog key={`all-${inMaintenance}-${total}`} deviceId={id} sensors={sensors} open={allOpen} onClose={() => setAllOpen(false)} />
      )}
    </>
  );
}

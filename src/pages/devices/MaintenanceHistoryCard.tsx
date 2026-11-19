import { useState } from 'react';
import {
  Badge,
  Body1Strong,
  Button,
  Card,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ArrowRepeatAll16Regular,
  CheckmarkCircle16Regular,
  Circle16Regular,
  Clock16Regular,
  History16Regular,
  Wrench16Regular,
} from '@fluentui/react-icons';
import { useMaintenanceHistory, type SensorMaintenanceRecordDto } from '@/api/hooks/maintenance';
import type { SensorDto } from '@/api/hooks/sensors';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { formatDateTime } from '@/lib/dateTime';
import { useT } from '@/lib/language';
import { ChangeMaintenanceKindDialog } from './ChangeMaintenanceKindDialog';
import { StartBaselineDialog } from './StartBaselineDialog';

const useStyles = makeStyles({
  card: { marginTop: tokens.spacingVerticalL, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', flexWrap: 'wrap' },
  scroll: { overflowX: 'auto' },
  muted: { color: tokens.colorNeutralForeground3 },
  note: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
});

/** The kind of a maintenance as a badge (icon + text, never colour alone). */
export function MaintenanceKindBadge({ record }: { record: Pick<SensorMaintenanceRecordDto, 'kind' | 'endedAt' | 'manualBaseline'> }) {
  const t = useT();
  if (!record.endedAt)
    return (
      <Badge appearance="filled" color="warning" icon={<Wrench16Regular />}>
        {t('In maintenance')}
      </Badge>
    );
  if (record.kind === 'Replacement')
    return (
      <Badge appearance="tint" color="brand" icon={<ArrowRepeatAll16Regular />}>
        {record.manualBaseline ? t('New baseline (by hand)') : t('Replacement / repair')}
      </Badge>
    );
  return (
    <Badge appearance="tint" color="subtle" icon={<Circle16Regular />}>
      {t('Minor maintenance')}
    </Badge>
  );
}

function BaselineState({ record }: { record: SensorMaintenanceRecordDto }) {
  const t = useT();
  const styles = useStyles();
  if (record.baselineState === 'WarmUp') {
    const raw = (record.warmUps ?? []).find((w) => w.timeScale === 'Native');
    return (
      <>
        <Badge appearance="tint" color="warning" icon={<Clock16Regular />}>
          {t('Warm-up')}
        </Badge>
        {raw?.warmUpEndsAt && (
          <Text size={200} className={styles.muted} block>
            {t('raw readings until {0}, measured against the previous baseline', formatDateTime(raw.warmUpEndsAt))}
          </Text>
        )}
      </>
    );
  }
  if (record.baselineState === 'Active')
    return (
      <Badge appearance="tint" color="success" icon={<CheckmarkCircle16Regular />}>
        {t('Current baseline')}
      </Badge>
    );
  if (record.baselineState === 'Superseded')
    return (
      <Badge appearance="tint" color="informative" icon={<History16Regular />}>
        {t('Earlier baseline')}
      </Badge>
    );
  return <Text size={200} className={styles.muted}>{record.endedAt ? t('unchanged') : '—'}</Text>;
}

/**
 * The maintenance history of the Device (`GET /api/Devices/{deviceId}/Maintenances`, the newest 500): every maintenance of every Sensor with its start,
 * end, kind, note and - for a replacement - its baseline state. Every level reads it; an Admin can change the kind of any finished maintenance,
 * however far back (the Sensor is then recalculated from that maintenance's end until now; Issues are kept and reviewed by hand) and start a new
 * baseline by hand. The rows can be narrowed to one Sensor.
 */
export function MaintenanceHistoryCard({ deviceId, sensors, isAdmin }: { deviceId: number; sensors: readonly SensorDto[]; isAdmin: boolean }) {
  const t = useT();
  const styles = useStyles();
  const history = useMaintenanceHistory(deviceId);
  const [sensorFilter, setSensorFilter] = useState<number | 'all'>('all');
  const [changing, setChanging] = useState<SensorMaintenanceRecordDto | null>(null);
  const [baselineOpen, setBaselineOpen] = useState(false);
  const [shown, setShown] = useState(20);

  const items = (history.data?.items ?? []).filter((m) => sensorFilter === 'all' || m.sensorId === sensorFilter);
  const visible = items.slice(0, shown);

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <Body1Strong as="h2">{t('Maintenance history')}</Body1Strong>
        <div className={styles.actions}>
          <Select
            aria-label={t('Sensor of the maintenance history')}
            value={String(sensorFilter)}
            onChange={(_, d) => {
              setSensorFilter(d.value === 'all' ? 'all' : Number(d.value));
              setShown(20);
            }}
          >
            <option value="all">{t('All Sensors')}</option>
            {sensors.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name || s.externalSensorId}
              </option>
            ))}
          </Select>
          {isAdmin && (
            <Button size="small" icon={<ArrowRepeatAll16Regular />} onClick={() => setBaselineOpen(true)}>
              {t('Start a new baseline…')}
            </Button>
          )}
        </div>
      </div>

      {history.isLoading && <LoadingState label={t('Loading the maintenance history…')} />}
      {history.isError && <ErrorState error={history.error} onRetry={() => history.refetch()} />}
      {history.data && items.length === 0 && (
        <Text className={styles.muted}>
          {sensorFilter === 'all' ? t('No maintenance has been recorded on this Device yet.') : t('No maintenance has been recorded on this Sensor yet.')}
        </Text>
      )}
      {visible.length > 0 && (
        <div className={styles.scroll}>
          <Table size="small" aria-label={t('Maintenance history')}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>{t('Sensor')}</TableHeaderCell>
                <TableHeaderCell>{t('Start → end')}</TableHeaderCell>
                <TableHeaderCell>{t('Kind')}</TableHeaderCell>
                <TableHeaderCell>{t('Baseline')}</TableHeaderCell>
                <TableHeaderCell>{t('Note')}</TableHeaderCell>
                {isAdmin && <TableHeaderCell>{t('Actions')}</TableHeaderCell>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{m.sensorName}</TableCell>
                  <TableCell>
                    {formatDateTime(m.startedAt)}
                    {m.manualBaseline ? null : (
                      <>
                        <br />→ {m.endedAt ? formatDateTime(m.endedAt) : t('still in maintenance')}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <MaintenanceKindBadge record={m} />
                    {m.kindChangedAt && (
                      <Text size={200} className={styles.muted} block>
                        {t('changed {0}', formatDateTime(m.kindChangedAt))}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <BaselineState record={m} />
                  </TableCell>
                  <TableCell>
                    <Text size={200} className={styles.note}>
                      {m.note ?? ''}
                    </Text>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {m.endedAt && (
                        <Button size="small" onClick={() => setChanging(m)}>
                          {t('Change kind')}
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {items.length > shown && (
        <Button appearance="subtle" onClick={() => setShown((n) => n + 20)}>
          {t('Show 20 more ({0} more)', items.length - shown)}
        </Button>
      )}
      <Text size={200} className={styles.muted}>
        {t('Any finished maintenance can be changed, however far back. Changing its kind recalculates the Sensor from the end of that maintenance until now (later baselines too; their kind stays). Issues raised meanwhile are not deleted - review them by hand.')}
      </Text>

      {isAdmin && changing && (
        <ChangeMaintenanceKindDialog key={changing.id} deviceId={deviceId} record={changing} open onClose={() => setChanging(null)} />
      )}
      {isAdmin && baselineOpen && <StartBaselineDialog deviceId={deviceId} sensors={sensors} open onClose={() => setBaselineOpen(false)} />}
    </Card>
  );
}

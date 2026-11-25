import { Body1Strong, Card, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import type { SensorDto } from '@/api/hooks/sensors';
import { useSensorMetadata } from '@/api/hooks/sensorMetadata';
import { findKnownMetric, toImportCatalog } from '@/lib/sensorImport';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  card: { padding: tokens.spacingVerticalM, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS, marginBottom: tokens.spacingVerticalL },
  grid: { display: 'grid', gridTemplateColumns: 'minmax(150px, 220px) minmax(0, 1fr)', gap: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalL}` },
  label: { color: tokens.colorNeutralForeground3 },
  technical: { color: tokens.colorNeutralForeground3, fontFamily: tokens.fontFamilyMonospace },
});

/**
 * The identity and unit of one Sensor, exactly as the API returns it: display name, sensor name (its ExternalSensorId) and
 * the unit label (with the stable unit code as a technical detail).
 *
 * Nothing here is derived from the metric name. When the unit is missing the card says so visibly: for a Sensor that IS a
 * known metric (per the API catalog) that is an administrative error, for any other Sensor a plain notice - it never
 * invents a unit.
 */
export function MetricDefinitionCard({ sensor }: { sensor: SensorDto }) {
  const t = useT();
  const styles = useStyles();
  const catalogQuery = useSensorMetadata();
  const catalog = toImportCatalog(catalogQuery.data);

  const known = catalog && sensor.externalSensorId ? findKnownMetric(catalog, sensor.externalSensorId) : undefined;
  const complete = !!sensor.unitCode;

  return (
    <Card className={styles.card} aria-label={t('Metric definition')}>
      <Body1Strong>{t('Metric definition')}</Body1Strong>

      {!complete && known && (
        <MessageBar intent="error">
          <MessageBarBody>
            {t('This Sensor is the known metric "')}{known.machineName}{t('" but its unit is missing. An administrator must complete it (expected unit code')}{' '}{known.unitCode}{t('); nothing is guessed here.')}</MessageBarBody>
        </MessageBar>
      )}
      {!complete && !known && (
        <MessageBar intent="info">
          <MessageBarBody>{t('This Sensor has no unit.')}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.grid}>
        <Text className={styles.label}>{t('Display name')}</Text>
        <Text>{sensor.name || '—'}</Text>

        <Text className={styles.label}>{t('Sensor ID')}</Text>
        <Text className={styles.technical}>{sensor.externalSensorId}</Text>

        <Text className={styles.label}>{t('Unit')}</Text>
        <Text>
          {sensor.unitLabel ?? sensor.unitCode ?? '—'}
          {sensor.unitCode && (
            <>
              {' '}
              <span className={styles.technical}>{t('(unit code:')}{' '}{sensor.unitCode})</span>
            </>
          )}
        </Text>
      </div>
    </Card>
  );
}

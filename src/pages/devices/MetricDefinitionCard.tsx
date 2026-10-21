import { Body1Strong, Card, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import type { SensorDto } from '@/api/hooks/sensors';
import { useSensorMetadata } from '@/api/hooks/sensorMetadata';
import { findKnownMetric, toImportCatalog } from '@/lib/sensorImport';

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
  const styles = useStyles();
  const catalogQuery = useSensorMetadata();
  const catalog = toImportCatalog(catalogQuery.data);

  const known = catalog && sensor.externalSensorId ? findKnownMetric(catalog, sensor.externalSensorId) : undefined;
  const complete = !!sensor.unitCode;

  return (
    <Card className={styles.card} aria-label="Metric definition">
      <Body1Strong>Metric definition</Body1Strong>

      {!complete && known && (
        <MessageBar intent="error">
          <MessageBarBody>
            This Sensor is the known metric &quot;{known.machineName}&quot; but its unit is missing. An administrator must complete it
            (expected unit code {known.unitCode}); nothing is guessed here.
          </MessageBarBody>
        </MessageBar>
      )}
      {!complete && !known && (
        <MessageBar intent="info">
          <MessageBarBody>This Sensor has no unit.</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.grid}>
        <Text className={styles.label}>Display name</Text>
        <Text>{sensor.name || '—'}</Text>

        <Text className={styles.label}>Sensor name</Text>
        <Text className={styles.technical}>{sensor.externalSensorId}</Text>

        <Text className={styles.label}>Unit</Text>
        <Text>
          {sensor.unitLabel ?? sensor.unitCode ?? '—'}
          {sensor.unitCode && (
            <>
              {' '}
              <span className={styles.technical}>(unit code: {sensor.unitCode})</span>
            </>
          )}
        </Text>
      </div>
    </Card>
  );
}

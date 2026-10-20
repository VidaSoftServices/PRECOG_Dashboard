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
 * The unit and future-aggregation metadata of one Sensor, exactly as the API returns it: display name, machine name,
 * unit label (with the stable unit code as a technical detail), aggregation type and the explanation.
 *
 * Nothing here is derived from the metric name. When the metadata is missing the card says so visibly: for a Sensor that
 * IS a known metric (per the API catalog) that is an administrative error, for any other Sensor a plain notice - it never
 * invents a unit or an aggregation.
 *
 * The aggregation type is metadata only: it describes how a longer-period value would have to be formed; the dashboard
 * (and the platform) does not aggregate anything from it.
 */
export function MetricDefinitionCard({ sensor }: { sensor: SensorDto }) {
  const styles = useStyles();
  const catalogQuery = useSensorMetadata();
  const catalog = toImportCatalog(catalogQuery.data);

  const type = catalog?.aggregationTypes.find((a) => a.code === sensor.aggregationType);
  const known = catalog && sensor.externalSensorId ? findKnownMetric(catalog, sensor.externalSensorId) : undefined;
  const complete = !!sensor.unitCode && !!sensor.aggregationType && !!sensor.aggregationExplanation;

  return (
    <Card className={styles.card} aria-label="Metric definition">
      <Body1Strong>Metric definition</Body1Strong>

      {!complete && known && (
        <MessageBar intent="error">
          <MessageBarBody>
            This Sensor is the known metric &quot;{known.machineName}&quot; but its unit or aggregation metadata is missing. An administrator must complete it
            (expected unit code {known.unitCode}, aggregation type {known.aggregationType}); nothing is guessed here.
          </MessageBarBody>
        </MessageBar>
      )}
      {!complete && !known && (
        <MessageBar intent="info">
          <MessageBarBody>This Sensor has no unit / aggregation metadata.</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.grid}>
        <Text className={styles.label}>Display name</Text>
        <Text>{sensor.name || '—'}</Text>

        <Text className={styles.label}>Machine name</Text>
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

        <Text className={styles.label}>Future longer-period aggregation</Text>
        <Text>
          {sensor.aggregationType ? (
            <>
              {type?.label ?? sensor.aggregationType} <span className={styles.technical}>({sensor.aggregationType})</span>
            </>
          ) : (
            '—'
          )}
        </Text>

        <Text className={styles.label}>Explanation</Text>
        <Text>{sensor.aggregationExplanation || '—'}</Text>
      </div>
      <Text size={200} className={styles.label}>
        The aggregation type is metadata only: nothing is aggregated from it.
      </Text>
    </Card>
  );
}

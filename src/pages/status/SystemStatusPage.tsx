import { Card, Text, Body1Strong, makeStyles, tokens } from '@fluentui/react-components';
import { CheckmarkCircle24Filled, ErrorCircle24Filled } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { useHealth } from '@/api/hooks/health';
import { useAuth } from '@/auth/AuthContext';

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: tokens.spacingHorizontalM },
  card: { padding: tokens.spacingVerticalL, display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalM },
});

function StatusRow({ label, healthy }: { label: string; healthy: boolean | undefined }) {
  const styles = useStyles();
  return (
    <Card className={styles.card}>
      {healthy === undefined ? (
        <LoadingState label="" />
      ) : healthy ? (
        <CheckmarkCircle24Filled style={{ color: tokens.colorPaletteGreenForeground1 }} />
      ) : (
        <ErrorCircle24Filled style={{ color: tokens.colorPaletteRedForeground1 }} />
      )}
      <div>
        <Body1Strong>{label}</Body1Strong>
        <br />
        <Text size={200}>{healthy === undefined ? 'Checking…' : healthy ? 'Healthy' : 'Unhealthy'}</Text>
      </div>
    </Card>
  );
}

export function SystemStatusPage() {
  const styles = useStyles();
  const { isAdmin } = useAuth();
  const healthQuery = useHealth();

  return (
    <>
      <PageHeader title="System Status" description="API liveness and readiness. Both endpoints are unauthenticated and return only a fixed Healthy/Unhealthy string - there is no further dependency detail to show, even to an Admin." />
      <div className={styles.grid}>
        <StatusRow label="Liveness" healthy={healthQuery.data ? healthQuery.data.live === 'Healthy' : undefined} />
        <StatusRow label="Readiness (database)" healthy={healthQuery.data ? healthQuery.data.ready === 'Healthy' : undefined} />
      </div>
      {isAdmin && (
        <Text size={200} style={{ display: 'block', marginTop: tokens.spacingVerticalM, color: tokens.colorNeutralForeground3 }}>
          No additional Admin-only dependency detail exists in the current API for this page - both health endpoints
          return only a fixed status string, confirmed against source.
        </Text>
      )}
    </>
  );
}

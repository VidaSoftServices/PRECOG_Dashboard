import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Text, Select, makeStyles, tokens } from '@fluentui/react-components';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { FreshnessPill } from '@/components/StatusPill';
import { useDevices, useDevice } from '@/api/hooks/devices';
import { useIssues } from '@/api/hooks/issues';
import { useTrainingRequests } from '@/api/hooks/training';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';
import { freshnessOf, formatRelative } from '@/lib/dateTime';
import { activateProps } from '@/lib/useActivateProps';

const useStyles = makeStyles({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  card: {
    padding: tokens.spacingVerticalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  tileValue: {
    fontSize: tokens.fontSizeHero800,
    fontWeight: tokens.fontWeightSemibold,
  },
  toolbar: {
    marginBottom: tokens.spacingVerticalM,
  },
});

/**
 * Issue-related KPIs are scoped to one selected Device, not Company-wide
 * (decision #10) - Issue_GetIssues has no efficient Company-wide aggregate,
 * and downloading every accessible Device's paginated Issue list just to
 * count them would violate the "no unbounded client-side requests" rule.
 * See the final report's missing-backend-capability section.
 */
export function OverviewPage() {
  const styles = useStyles();
  const navigate = useNavigate();
  const devicesQuery = useDevices();
  const [deviceId, setDeviceId] = useNumberSearchParam('deviceId');

  const devices = devicesQuery.data ?? [];
  const effectiveDeviceId = deviceId ?? devices[0]?.id;

  const deviceQuery = useDevice(effectiveDeviceId);
  const issuesQuery = useIssues(effectiveDeviceId, { includeMembers: false, take: 500 });
  const trainingQuery = useTrainingRequests(effectiveDeviceId);

  const reviewBreakdown = useMemo(() => {
    const issues = issuesQuery.data ?? [];
    return {
      pending: issues.filter((i) => i.reviewState === 'PendingReview').length,
      fault: issues.filter((i) => i.reviewState === 'ReviewedFault').length,
      falsePositive: issues.filter((i) => i.reviewState === 'ReviewedFalsePositive').length,
    };
  }, [issuesQuery.data]);

  const activeTraining = (trainingQuery.data ?? []).filter((t) => ['Pending', 'Claimed', 'Processing'].includes(t.status ?? ''));

  const staleDevices = devices.filter((d) => freshnessOf(d.heartBeat) === 'stale' || freshnessOf(d.heartBeat) === 'unknown');

  if (devicesQuery.isLoading) return <LoadingState label="Loading overview…" />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  return (
    <>
      <PageHeader title="Overview" description="Operational summary for your accessible Devices." />

      <div className={styles.grid}>
        <Card className={styles.card} {...activateProps(() => navigate('/devices'))} style={{ cursor: 'pointer' }}>
          <Text size={200}>Accessible Devices</Text>
          <span className={styles.tileValue}>{devices.length}</span>
        </Card>
        <Card className={styles.card}>
          <Text size={200}>Devices needing attention</Text>
          <span className={styles.tileValue}>{staleDevices.length}</span>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Stale or no heartbeat
          </Text>
        </Card>
      </div>

      <div className={styles.toolbar}>
        <Select aria-label="Device" value={effectiveDeviceId !== undefined ? String(effectiveDeviceId) : ''} onChange={(_, d) => setDeviceId(Number(d.value))}>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deviceName || d.externalDeviceId}
            </option>
          ))}
        </Select>
      </div>

      {effectiveDeviceId !== undefined && (
        <div className={styles.grid}>
          <Card className={styles.card}>
            <Text size={200}>{deviceQuery.data?.deviceName ?? 'Device'} freshness</Text>
            {deviceQuery.data && (
              <>
                <FreshnessPill freshness={freshnessOf(deviceQuery.data.heartBeat)} />
                <Text size={200}>{formatRelative(deviceQuery.data.heartBeat)}</Text>
              </>
            )}
          </Card>

          <Card className={styles.card} {...activateProps(() => navigate(`/issues?deviceId=${effectiveDeviceId}`))} style={{ cursor: 'pointer' }}>
            <Text size={200}>Pending review</Text>
            <span className={styles.tileValue}>{issuesQuery.isLoading ? '…' : reviewBreakdown.pending}</span>
          </Card>
          <Card className={styles.card}>
            <Text size={200}>Reviewed fault</Text>
            <span className={styles.tileValue}>{issuesQuery.isLoading ? '…' : reviewBreakdown.fault}</span>
          </Card>
          <Card className={styles.card}>
            <Text size={200}>Reviewed false positive</Text>
            <span className={styles.tileValue}>{issuesQuery.isLoading ? '…' : reviewBreakdown.falsePositive}</span>
          </Card>
          <Card className={styles.card} {...activateProps(() => navigate(`/training?deviceId=${effectiveDeviceId}`))} style={{ cursor: 'pointer' }}>
            <Text size={200}>Active training requests</Text>
            <span className={styles.tileValue}>{trainingQuery.isLoading ? '…' : activeTraining.length}</span>
          </Card>
        </div>
      )}

      {issuesQuery.isError && <ErrorState error={issuesQuery.error} onRetry={() => issuesQuery.refetch()} />}
    </>
  );
}

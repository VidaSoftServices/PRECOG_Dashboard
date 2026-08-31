import { useState } from 'react';
import {
  Card,
  Text,
  Body1Strong,
  Button,
  Select,
  Badge,
  MessageBar,
  MessageBarBody,
  Divider,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddCircle24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useDevices } from '@/api/hooks/devices';
import { useIssues } from '@/api/hooks/issues';
import {
  useKnowledgeShares,
  useCreateKnowledgeShareDraft,
  useApproveKnowledgeShare,
  useRevokeKnowledgeShare,
  useEnableSharedIssues,
  useRevokeSharedIssues,
  type KnowledgeShareDto,
} from '@/api/hooks/knowledgeSharing';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';

const useStyles = makeStyles({
  toolbar: { display: 'flex', gap: tokens.spacingHorizontalM, marginBottom: tokens.spacingVerticalL, flexWrap: 'wrap', alignItems: 'flex-end' },
  card: { padding: tokens.spacingVerticalM, marginBottom: tokens.spacingVerticalM, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  mapRow: { display: 'flex', justifyContent: 'space-between', padding: `${tokens.spacingVerticalXXS} 0` },
});

function ShareCard({ share }: { share: KnowledgeShareDto }) {
  const styles = useStyles();
  const toast = useAppToast();
  const approve = useApproveKnowledgeShare();
  const revoke = useRevokeKnowledgeShare();
  const issuesQuery = useIssues(share.sourceDeviceId, { includeMembers: false, take: 200 });
  const enableIssues = useEnableSharedIssues(share.id!);
  const revokeIssues = useRevokeSharedIssues(share.id!);
  const [revokeConfirmOpen, setRevokeConfirmOpen] = useState(false);

  const eligibleIssues = (issuesQuery.data ?? []).filter(
    (i) => i.isCanonical && (i.reviewState === 'ReviewedFault' || i.reviewState === 'ReviewedFalsePositive'),
  );
  const sharedIds = new Set((share.sharedIssues ?? []).filter((s) => s.enabled).map((s) => s.issueId));

  const totalPositions = share.sensorMaps?.length ?? 0;
  const mappedPositions = share.sensorMaps?.filter((m) => m.currentlyCompatible).length ?? 0;
  const fullCoverage = totalPositions > 0 && mappedPositions === totalPositions;

  return (
    <Card className={styles.card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Body1Strong>
          Device {share.sourceDeviceId} → Device {share.targetDeviceId} (v{share.version})
        </Body1Strong>
        <Badge appearance="tint" color={share.status === 'Approved' ? 'success' : share.status === 'Revoked' ? 'subtle' : 'warning'}>
          {share.status}
        </Badge>
      </div>

      {share.hasIncompatibleMapping && (
        <MessageBar intent="warning">
          <MessageBarBody>One or more mappings are no longer compatible - the next retraining will exclude them.</MessageBarBody>
        </MessageBar>
      )}

      <Text size={200}>
        Sensor mapping coverage: {mappedPositions} / {totalPositions}
      </Text>
      {share.sensorMaps?.map((map) => (
        <div key={map.id} className={styles.mapRow}>
          <Text size={200}>
            Sensor {map.sourceSensorId} → {map.targetSensorId} ({map.normalizedQuantityKind})
          </Text>
          <Badge appearance="tint" color={map.currentlyCompatible ? 'success' : 'danger'}>
            {map.currentlyCompatible ? 'compatible' : (map.compatibilityIssues ?? []).join(', ') || 'incompatible'}
          </Badge>
        </div>
      ))}

      {share.status === 'Draft' && (
        <div>
          <Button
            appearance="primary"
            disabled={!fullCoverage || approve.isPending}
            onClick={() => approve.mutate(share.id!, { onSuccess: () => toast.success('Knowledge share approved') })}
          >
            {approve.isPending ? 'Approving…' : fullCoverage ? 'Approve' : `Needs full coverage (${mappedPositions}/${totalPositions})`}
          </Button>
          {approve.isError && <ErrorState error={approve.error} />}
        </div>
      )}

      {share.status === 'Approved' && (
        <>
          <Divider />
          <Text size={200}>Shared Issues: {sharedIds.size}</Text>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Click a reviewed Issue to include it in this share; click an already-included one to remove it.
          </Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.spacingHorizontalXS }}>
            {eligibleIssues.map((issue) => {
              const shared = sharedIds.has(issue.id!);
              return (
                <Button
                  key={issue.id}
                  size="small"
                  appearance={shared ? 'primary' : 'secondary'}
                  disabled={enableIssues.isPending || revokeIssues.isPending}
                  onClick={() =>
                    shared
                      ? revokeIssues.mutate([issue.id!], {
                          onSuccess: () => toast.success(`Issue #${issue.issueKey} removed from share`),
                        })
                      : enableIssues.mutate([issue.id!], {
                          onSuccess: () => toast.success(`Issue #${issue.issueKey} included in share`),
                        })
                  }
                >
                  #{issue.issueKey}
                </Button>
              );
            })}
          </div>
          {(enableIssues.isError || revokeIssues.isError) && <ErrorState error={enableIssues.error ?? revokeIssues.error} />}
          <Button appearance="secondary" onClick={() => setRevokeConfirmOpen(true)} disabled={revoke.isPending}>
            {revoke.isPending ? 'Revoking…' : 'Revoke share'}
          </Button>
        </>
      )}

      <ConfirmDialog
        open={revokeConfirmOpen}
        title="Revoke this knowledge share?"
        intent="destructive"
        confirmLabel="Revoke"
        busy={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(share.id!, {
            onSuccess: () => {
              toast.success('Knowledge share revoked');
              setRevokeConfirmOpen(false);
            },
          })
        }
        onCancel={() => setRevokeConfirmOpen(false)}
      >
        <Text>
          This stops all future training eligibility from this share. Past ModelVersion provenance already built from
          it is untouched - revoking never rewrites training history.
        </Text>
      </ConfirmDialog>
    </Card>
  );
}

export function KnowledgeSharingPage() {
  const styles = useStyles();
  const toast = useAppToast();
  const devicesQuery = useDevices();
  const [sourceDeviceId] = useNumberSearchParam('sourceDeviceId');
  const [targetDeviceId] = useNumberSearchParam('targetDeviceId');
  const sharesQuery = useKnowledgeShares(sourceDeviceId, targetDeviceId);
  const createDraft = useCreateKnowledgeShareDraft();

  const [newSource, setNewSource] = useState<number | undefined>(sourceDeviceId);
  const [newTarget, setNewTarget] = useState<number | undefined>(targetDeviceId);

  const devices = devicesQuery.data ?? [];

  return (
    <>
      <PageHeader title="Knowledge Sharing" description="Manual, Admin-approved training-example sharing between Devices." />

      <Card className={styles.card} style={{ maxWidth: '520px' }}>
        <Body1Strong>New draft</Body1Strong>
        <div className={styles.toolbar}>
          <Select aria-label="Source Device" value={newSource !== undefined ? String(newSource) : ''} onChange={(_, d) => setNewSource(Number(d.value))}>
            <option value="">Source Device…</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.deviceName || d.externalDeviceId}
              </option>
            ))}
          </Select>
          <Select aria-label="Target Device" value={newTarget !== undefined ? String(newTarget) : ''} onChange={(_, d) => setNewTarget(Number(d.value))}>
            <option value="">Target Device…</option>
            {devices.filter((d) => d.id !== newSource).map((d) => (
              <option key={d.id} value={d.id}>
                {d.deviceName || d.externalDeviceId}
              </option>
            ))}
          </Select>
          <Button
            icon={<AddCircle24Regular />}
            appearance="primary"
            disabled={!newSource || !newTarget || createDraft.isPending}
            onClick={() =>
              createDraft.mutate(
                { sourceDeviceId: newSource!, targetDeviceId: newTarget! },
                { onSuccess: () => toast.success('Draft share created') },
              )
            }
          >
            Create draft
          </Button>
        </div>
        {createDraft.isError && <ErrorState error={createDraft.error} />}
      </Card>

      {sharesQuery.isLoading && <LoadingState label="Loading shares…" />}
      {sharesQuery.isError && <ErrorState error={sharesQuery.error} onRetry={() => sharesQuery.refetch()} />}
      {sharesQuery.data && sharesQuery.data.length === 0 && <EmptyState title="No knowledge shares yet" />}
      {sharesQuery.data?.map((share) => (
        <ShareCard key={share.id} share={share} />
      ))}
    </>
  );
}

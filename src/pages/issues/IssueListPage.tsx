import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Text, Select, Switch, Badge, Button, Checkbox, RadioGroup, Radio, makeStyles, tokens } from '@fluentui/react-components';
import { GroupList24Regular, Delete24Regular } from '@fluentui/react-icons';
import { DeleteIssuesDialog } from './DeleteIssuesDialog';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { EmailSentPill, ReviewStatePill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useDevices } from '@/api/hooks/devices';
import { useIssues, useGroupIssues } from '@/api/hooks/issues';
import { useSensors } from '@/api/hooks/sensors';
import { useDeviceSelection } from '@/lib/selectedDevice';
import { formatDateTime } from '@/lib/dateTime';
import { useAuth } from '@/auth/AuthContext';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  toolbar: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  formGrid: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

const reviewFilters = [
  { value: 'all', label: 'All' },
  { value: 'PendingReview', label: 'Pending review' },
  { value: 'ReviewedFault', label: 'Fault' },
  { value: 'ReviewedFalsePositive', label: 'False positive' },
];

export function IssueListPage() {
  const t = useT();
  const styles = useStyles();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const [includeMembers, setIncludeMembers] = useState(false);
  const [reviewFilter, setReviewFilter] = useState('all');
  const [groupMode, setGroupMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [canonicalChoice, setCanonicalChoice] = useState<number | undefined>();

  const devicesQuery = useDevices();
  const devices = devicesQuery.data ?? [];
  const [effectiveDeviceId, setDeviceId] = useDeviceSelection(devicesQuery.data);

  const issuesQuery = useIssues(effectiveDeviceId, { includeMembers, take: 200 });
  const groupIssues = useGroupIssues(effectiveDeviceId ?? -1);
  // The Sensor (indicator) an Issue was raised for is written in its row, next to the time span.
  const sensorsQuery = useSensors(effectiveDeviceId);
  const sensorNameOf = (sensorId: number | null | undefined): string | undefined => {
    if (sensorId == null) return undefined;
    const sensor = sensorsQuery.data?.find((x) => x.id === sensorId);
    return sensor ? sensor.name || sensor.externalSensorId || undefined : undefined;
  };

  const filtered = useMemo(() => {
    const issues = issuesQuery.data ?? [];
    if (reviewFilter === 'all') return issues;
    return issues.filter((i) => i.reviewState === reviewFilter);
  }, [issuesQuery.data, reviewFilter]);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const openGroupDialog = () => {
    setCanonicalChoice(selectedIds[0]);
    setGroupDialogOpen(true);
  };

  const submitGroup = async () => {
    if (!canonicalChoice || selectedIds.length < 2) return;
    await groupIssues.mutateAsync({ issueIds: selectedIds, canonicalIssueId: canonicalChoice });
    toast.success(t('{0} Issues grouped', selectedIds.length));
    setGroupDialogOpen(false);
    setGroupMode(false);
    setSelectedIds([]);
  };

  if (devicesQuery.isLoading) return <LoadingState label={t('Loading devices…')} />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  return (
    <>
      <PageHeader
        title={t('Issues')}
        description={t('Canonical Issues for the selected Device, most recent first.')}
        actions={
          isAdmin && (
            <>
              {groupMode ? (
                <>
                  <Button
                    appearance="primary"
                    disabled={selectedIds.length < 2}
                    onClick={openGroupDialog}
                  >
                    {t('Group')}{' '}{selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                  </Button>
                  <Button icon={<Delete24Regular />} disabled={selectedIds.length < 1} onClick={() => setDeleteDialogOpen(true)}>
                    {t('Delete')}{' '}{selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                  </Button>
                  <Button
                    onClick={() => {
                      setGroupMode(false);
                      setSelectedIds([]);
                    }}
                  >
                    {t('Cancel')}</Button>
                </>
              ) : (
                <Button icon={<GroupList24Regular />} onClick={() => setGroupMode(true)}>
                  {t('Select to group')}</Button>
              )}
            </>
          )
        }
      />

      <div className={styles.toolbar}>
        <Select aria-label={t('Device')} value={effectiveDeviceId !== undefined ? String(effectiveDeviceId) : ''} onChange={(_, d) => setDeviceId(Number(d.value))}>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deviceName || d.externalDeviceId}
            </option>
          ))}
        </Select>
        <Select aria-label={t('Review state filter')} value={reviewFilter} onChange={(_, d) => setReviewFilter(d.value)}>
          {reviewFilters.map((f) => (
            <option key={f.value} value={f.value}>
              {t(f.label)}
            </option>
          ))}
        </Select>
        <Switch checked={includeMembers} onChange={(_, d) => setIncludeMembers(d.checked)} label={t('Include grouped members (audit view)')} />
      </div>

      {issuesQuery.isLoading && <LoadingState label={t('Loading issues…')} />}
      {issuesQuery.isError && <ErrorState error={issuesQuery.error} onRetry={() => issuesQuery.refetch()} />}
      {issuesQuery.isSuccess && filtered.length === 0 && <EmptyState title={t('No issues match')} />}

      {filtered.length > 0 && (
        <Card>
          {filtered.map((issue) => (
            <div
              key={issue.id}
              className={styles.row}
              style={{ cursor: groupMode ? 'default' : 'pointer' }}
              role={groupMode ? undefined : 'button'}
              tabIndex={groupMode ? undefined : 0}
              onClick={() => !groupMode && navigate(`/issues/${issue.id}`)}
              onKeyDown={(e) => {
                if (!groupMode && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault();
                  navigate(`/issues/${issue.id}`);
                }
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS }}>
                {groupMode && (
                  <Checkbox
                    checked={selectedIds.includes(issue.id!)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelected(issue.id!)}
                  />
                )}
                <div>
                  <Text weight="semibold">
                    {sensorNameOf(issue.primarySensorId) ? `${sensorNameOf(issue.primarySensorId)} · ` : ''}
                    {formatDateTime(issue.measuredAtFrom)} → {formatDateTime(issue.measuredAtTo)}
                  </Text>
                  {!issue.isCanonical && (
                    <Badge appearance="outline" style={{ marginLeft: tokens.spacingHorizontalS }}>
                      {t('member of #')}{issue.canonicalIssueId}
                    </Badge>
                  )}
                  {issue.issueCategoryName && (
                    <Text size={200} style={{ display: 'block', color: tokens.colorNeutralForeground3 }}>
                      {issue.issueCategoryName}
                    </Text>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' }}>
                {issue.isCanonical && issue.memberCount ? <Badge appearance="tint">{issue.memberCount} {t('members')}</Badge> : null}
                <EmailSentPill issue={issue} />
                <ReviewStatePill reviewState={issue.reviewState} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {isAdmin && deleteDialogOpen && effectiveDeviceId !== undefined && (
        <DeleteIssuesDialog
          deviceId={effectiveDeviceId}
          issueIds={selectedIds}
          reviewedCount={(issuesQuery.data ?? []).filter((i) => selectedIds.includes(i.id!) && i.reviewState !== 'PendingReview').length}
          open
          onClose={() => setDeleteDialogOpen(false)}
          onDone={(deleted) => setSelectedIds((prev) => prev.filter((id) => !deleted.includes(id)))}
        />
      )}

      <ConfirmDialog
        open={groupDialogOpen}
        title={t('Group {0} Issues', selectedIds.length)}
        confirmLabel={groupIssues.isPending ? t('Grouping…') : t('Group')}
        busy={groupIssues.isPending}
        confirmDisabled={!canonicalChoice}
        onConfirm={submitGroup}
        onCancel={() => setGroupDialogOpen(false)}
      >
        <div className={styles.formGrid}>
          <Text size={200}>
            {t('Choose which selected Issue becomes the canonical representative. The rest become preserved members - nothing is deleted.')}</Text>
          <RadioGroup value={canonicalChoice !== undefined ? String(canonicalChoice) : ''} onChange={(_, d) => setCanonicalChoice(Number(d.value))}>
            {selectedIds.map((id) => {
              const issue = filtered.find((i) => i.id === id);
              return (
                <Radio key={id} value={String(id)} label={issue ? `#${issue.issueKey} · ${sensorNameOf(issue.primarySensorId) ? `${sensorNameOf(issue.primarySensorId)} · ` : ''}${formatDateTime(issue.measuredAtFrom)}` : `#${id}`} />
              );
            })}
          </RadioGroup>
          {groupIssues.isError && <ErrorState error={groupIssues.error} />}
        </div>
      </ConfirmDialog>
    </>
  );
}

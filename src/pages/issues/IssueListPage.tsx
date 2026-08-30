import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Text, Select, Switch, Badge, Button, Checkbox, RadioGroup, Radio, makeStyles, tokens } from '@fluentui/react-components';
import { GroupList24Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { ReviewStatePill } from '@/components/StatusPill';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useAppToast } from '@/components/ToastProvider';
import { useDevices } from '@/api/hooks/devices';
import { useIssues, useGroupIssues } from '@/api/hooks/issues';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';
import { formatDateTime } from '@/lib/dateTime';
import { useAuth } from '@/auth/AuthContext';

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
  const styles = useStyles();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const toast = useAppToast();
  const [deviceId, setDeviceId] = useNumberSearchParam('deviceId');
  const [includeMembers, setIncludeMembers] = useState(false);
  const [reviewFilter, setReviewFilter] = useState('all');
  const [groupMode, setGroupMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [canonicalChoice, setCanonicalChoice] = useState<number | undefined>();

  const devicesQuery = useDevices();
  const devices = devicesQuery.data ?? [];
  const effectiveDeviceId = deviceId ?? devices[0]?.id;

  const issuesQuery = useIssues(effectiveDeviceId, { includeMembers, take: 200 });
  const groupIssues = useGroupIssues(effectiveDeviceId ?? -1);

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
    toast.success(`${selectedIds.length} Issues grouped`);
    setGroupDialogOpen(false);
    setGroupMode(false);
    setSelectedIds([]);
  };

  if (devicesQuery.isLoading) return <LoadingState label="Loading devices…" />;
  if (devicesQuery.isError) return <ErrorState error={devicesQuery.error} onRetry={() => devicesQuery.refetch()} />;

  return (
    <>
      <PageHeader
        title="Issues"
        description="Canonical Issues for the selected Device, most recent first."
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
                    Group {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}
                  </Button>
                  <Button
                    onClick={() => {
                      setGroupMode(false);
                      setSelectedIds([]);
                    }}
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button icon={<GroupList24Regular />} onClick={() => setGroupMode(true)}>
                  Select to group
                </Button>
              )}
            </>
          )
        }
      />

      <div className={styles.toolbar}>
        <Select aria-label="Device" value={effectiveDeviceId !== undefined ? String(effectiveDeviceId) : ''} onChange={(_, d) => setDeviceId(Number(d.value))}>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>
              {d.deviceName || d.externalDeviceId}
            </option>
          ))}
        </Select>
        <Select aria-label="Review state filter" value={reviewFilter} onChange={(_, d) => setReviewFilter(d.value)}>
          {reviewFilters.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </Select>
        <Switch checked={includeMembers} onChange={(_, d) => setIncludeMembers(d.checked)} label="Include grouped members (audit view)" />
      </div>

      {issuesQuery.isLoading && <LoadingState label="Loading issues…" />}
      {issuesQuery.isError && <ErrorState error={issuesQuery.error} onRetry={() => issuesQuery.refetch()} />}
      {issuesQuery.isSuccess && filtered.length === 0 && <EmptyState title="No issues match" />}

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
                    {formatDateTime(issue.measuredAtFrom)} → {formatDateTime(issue.measuredAtTo)}
                  </Text>
                  {!issue.isCanonical && (
                    <Badge appearance="outline" style={{ marginLeft: tokens.spacingHorizontalS }}>
                      member of #{issue.canonicalIssueId}
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
                {issue.isCanonical && issue.memberCount ? <Badge appearance="tint">{issue.memberCount} members</Badge> : null}
                <ReviewStatePill reviewState={issue.reviewState} />
              </div>
            </div>
          ))}
        </Card>
      )}

      <ConfirmDialog
        open={groupDialogOpen}
        title={`Group ${selectedIds.length} Issues`}
        confirmLabel={groupIssues.isPending ? 'Grouping…' : 'Group'}
        busy={groupIssues.isPending}
        confirmDisabled={!canonicalChoice}
        onConfirm={submitGroup}
        onCancel={() => setGroupDialogOpen(false)}
      >
        <div className={styles.formGrid}>
          <Text size={200}>
            Choose which selected Issue becomes the canonical representative. The rest become preserved members -
            nothing is deleted.
          </Text>
          <RadioGroup value={canonicalChoice !== undefined ? String(canonicalChoice) : ''} onChange={(_, d) => setCanonicalChoice(Number(d.value))}>
            {selectedIds.map((id) => {
              const issue = filtered.find((i) => i.id === id);
              return (
                <Radio key={id} value={String(id)} label={issue ? `#${issue.issueKey} · ${formatDateTime(issue.measuredAtFrom)}` : `#${id}`} />
              );
            })}
          </RadioGroup>
          {groupIssues.isError && <ErrorState error={groupIssues.error} />}
        </div>
      </ConfirmDialog>
    </>
  );
}

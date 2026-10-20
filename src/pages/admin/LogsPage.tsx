import { useState, type ReactNode } from 'react';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  Select,
  Tab,
  TabList,
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
import { Bug16Regular, ErrorCircle16Regular, Info16Regular, Warning16Regular } from '@fluentui/react-icons';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { useAuditEvents, useSystemLog, type AuditEventDto, type LogEntryDto } from '@/api/hooks/logs';
import { formatDateTimeWithZone, localZone } from '@/lib/dateTime';
import {
  EMPTY_AUDIT_FILTERS,
  EMPTY_SYSTEM_FILTERS,
  LOG_APPLICATIONS,
  LOG_LEVELS,
  LOG_MAX_SKIP,
  LOG_PAGE_SIZE,
  hasFilters,
  type AuditFilters,
  type SystemFilters,
} from '@/lib/logFilters';

const useStyles = makeStyles({
  filters: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
    gap: tokens.spacingHorizontalM,
    alignItems: 'start',
    padding: tokens.spacingVerticalM,
    marginBottom: tokens.spacingVerticalM,
  },
  // Lines up with the inputs (below the field labels), whatever hints the other fields carry.
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center', marginTop: tokens.spacingVerticalXL },
  tableWrap: { overflowX: 'auto' },
  mono: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase200 },
  message: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  footer: { display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'center', marginTop: tokens.spacingVerticalM, flexWrap: 'wrap' },
  muted: { color: tokens.colorNeutralForeground3 },
});

/** Severity as an icon + text badge (never colour alone). */
function LevelBadge({ level }: { level: string }) {
  const appearance = level === 'ERROR' || level === 'CRITICAL' ? 'filled' : 'tint';
  const color = level === 'ERROR' || level === 'CRITICAL' ? 'danger' : level === 'WARNING' ? 'warning' : level === 'INFO' ? 'informative' : 'subtle';
  const icon =
    level === 'ERROR' || level === 'CRITICAL' ? <ErrorCircle16Regular /> : level === 'WARNING' ? <Warning16Regular /> : level === 'INFO' ? <Info16Regular /> : <Bug16Regular />;
  return (
    <Badge appearance={appearance} color={color} icon={icon}>
      {level}
    </Badge>
  );
}

/** A "Load more" footer shared by both tabs, with the honest limits spelled out. */
function ListFooter({
  shown,
  hasNext,
  fetching,
  onMore,
  reachedLimit,
}: {
  shown: number;
  hasNext: boolean;
  fetching: boolean;
  onMore: () => void;
  reachedLimit: boolean;
}) {
  const styles = useStyles();
  return (
    <div className={styles.footer}>
      <Text role="status" size={200} className={styles.muted}>
        Showing {shown} {shown === 1 ? 'entry' : 'entries'}, newest first ({localZone()}).
      </Text>
      {hasNext && (
        <Button onClick={onMore} disabled={fetching}>
          {fetching ? 'Loading…' : `Load ${LOG_PAGE_SIZE} more`}
        </Button>
      )}
      {reachedLimit && (
        <Text size={200} className={styles.muted}>
          Older entries exist, but at most {LOG_MAX_SKIP + LOG_PAGE_SIZE} can be paged through - narrow the time range or the filters.
        </Text>
      )}
    </div>
  );
}

function DetailsLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <b>{label}:</b> {children}
    </div>
  );
}

/** Actor of an activity entry: the person's name, or the machine identity, or the bare user id. */
function actorText(e: AuditEventDto): string {
  if (e.actorUserId != null) return e.actorName ? `${e.actorName} (user ${e.actorUserId})` : `user ${e.actorUserId}`;
  if (e.actorPrincipalId != null) return `machine identity ${e.actorPrincipalId}`;
  return '-';
}

function FilterActions({ onApply, onReset, canReset }: { onApply: () => void; onReset: () => void; canReset: boolean }) {
  const styles = useStyles();
  return (
    <div className={styles.actions}>
      <Button appearance="primary" onClick={onApply}>
        Apply filters
      </Button>
      <Button onClick={onReset} disabled={!canReset}>
        Reset
      </Button>
    </div>
  );
}

function ActivityLogTab() {
  const styles = useStyles();
  const [draft, setDraft] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const [applied, setApplied] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);
  const query = useAuditEvents(applied);
  const set = (key: keyof AuditFilters) => (_: unknown, d: { value: string }) => setDraft((f) => ({ ...f, [key]: d.value }));

  const entries: AuditEventDto[] = query.data?.pages.flatMap((p) => p.items ?? []) ?? [];
  const lastPage = query.data?.pages.at(-1);

  return (
    <>
      <Card className={styles.filters} role="search" aria-label="Activity log filters">
        <Field label="From">
          <Input type="datetime-local" value={draft.from} onChange={set('from')} />
        </Field>
        <Field label="To">
          <Input type="datetime-local" value={draft.to} onChange={set('to')} />
        </Field>
        <Field label="Action" hint='contains, e.g. "device."'>
          <Input value={draft.action} onChange={set('action')} />
        </Field>
        <Field label="Entity type" hint="e.g. Device, Sensor">
          <Input value={draft.entityType} onChange={set('entityType')} />
        </Field>
        <Field label="Entity id" hint="contains">
          <Input value={draft.entityId} onChange={set('entityId')} />
        </Field>
        <Field label="User id">
          <Input inputMode="numeric" value={draft.actorUserId} onChange={set('actorUserId')} />
        </Field>
        <FilterActions
          onApply={() => setApplied(draft)}
          onReset={() => {
            setDraft(EMPTY_AUDIT_FILTERS);
            setApplied(EMPTY_AUDIT_FILTERS);
          }}
          canReset={hasFilters({ ...draft }) || hasFilters({ ...applied })}
        />
      </Card>

      {query.isLoading && <LoadingState label="Loading activity log…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && entries.length === 0 && (
        <EmptyState title={hasFilters({ ...applied }) ? 'No entries match these filters' : 'No activity recorded yet'} />
      )}
      {entries.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <Table aria-label="Activity log" size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Time</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                  <TableHeaderCell>Entity</TableHeaderCell>
                  <TableHeaderCell>Who</TableHeaderCell>
                  <TableHeaderCell>Details</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={`${e.id}-${e.occurredAt}`}>
                    <TableCell>{formatDateTimeWithZone(e.occurredAt)}</TableCell>
                    <TableCell>
                      <span className={styles.mono}>{e.action}</span>
                    </TableCell>
                    <TableCell>
                      {e.entityType}
                      {e.entityId ? ` ${e.entityId}` : ''}
                    </TableCell>
                    <TableCell>{actorText(e)}</TableCell>
                    <TableCell>
                      <div className={styles.message}>
                        {e.beforeState && <DetailsLine label="Before">{e.beforeState}</DetailsLine>}
                        {e.afterState && <DetailsLine label="After">{e.afterState}</DetailsLine>}
                        {e.ip && <DetailsLine label="IP">{e.ip}</DetailsLine>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ListFooter
            shown={entries.length}
            hasNext={query.hasNextPage}
            fetching={query.isFetchingNextPage}
            onMore={() => query.fetchNextPage()}
            reachedLimit={!!lastPage?.hasMore && !query.hasNextPage}
          />
        </>
      )}
    </>
  );
}

function SystemLogTab() {
  const styles = useStyles();
  const [draft, setDraft] = useState<SystemFilters>(EMPTY_SYSTEM_FILTERS);
  const [applied, setApplied] = useState<SystemFilters>(EMPTY_SYSTEM_FILTERS);
  const query = useSystemLog(applied);
  const set = (key: keyof SystemFilters) => (_: unknown, d: { value: string }) => setDraft((f) => ({ ...f, [key]: d.value }));

  const entries: LogEntryDto[] = query.data?.pages.flatMap((p) => p.items ?? []) ?? [];
  const lastPage = query.data?.pages.at(-1);

  return (
    <>
      <Card className={styles.filters} role="search" aria-label="System log filters">
        <Field label="From" hint="default: the last 7 days">
          <Input type="datetime-local" value={draft.from} onChange={set('from')} />
        </Field>
        <Field label="To" hint="at most 31 days after From">
          <Input type="datetime-local" value={draft.to} onChange={set('to')} />
        </Field>
        <Field label="Level" hint="this level and above">
          <Select value={draft.minLevel} onChange={(_, d) => setDraft((f) => ({ ...f, minLevel: d.value }))}>
            <option value="">All levels</option>
            {LOG_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Application">
          <Select value={draft.application} onChange={(_, d) => setDraft((f) => ({ ...f, application: d.value }))}>
            <option value="">All</option>
            {LOG_APPLICATIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Device id">
          <Input inputMode="numeric" value={draft.deviceId} onChange={set('deviceId')} />
        </Field>
        <Field label="Sensor id">
          <Input inputMode="numeric" value={draft.sensorId} onChange={set('sensorId')} />
        </Field>
        <Field label="User id">
          <Input inputMode="numeric" value={draft.userId} onChange={set('userId')} />
        </Field>
        <Field label="Message contains">
          <Input value={draft.text} onChange={set('text')} />
        </Field>
        <FilterActions
          onApply={() => setApplied(draft)}
          onReset={() => {
            setDraft(EMPTY_SYSTEM_FILTERS);
            setApplied(EMPTY_SYSTEM_FILTERS);
          }}
          canReset={hasFilters({ ...draft }) || hasFilters({ ...applied })}
        />
      </Card>

      {query.isLoading && <LoadingState label="Loading system log…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && entries.length === 0 && (
        <EmptyState title={hasFilters({ ...applied }) ? 'No entries match these filters' : 'No system log entries in the last 7 days'} />
      )}
      {entries.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <Table aria-label="System log" size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Time</TableHeaderCell>
                  <TableHeaderCell>Level</TableHeaderCell>
                  <TableHeaderCell>Application</TableHeaderCell>
                  <TableHeaderCell>Device / Sensor</TableHeaderCell>
                  <TableHeaderCell>Message</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={`${e.id}-${e.occurredAt}`}>
                    <TableCell>{formatDateTimeWithZone(e.occurredAt)}</TableCell>
                    <TableCell>
                      <LevelBadge level={e.level ?? ''} />
                    </TableCell>
                    <TableCell>
                      {e.application}
                      {e.eventCode && e.eventCode !== e.application ? ` · ${e.eventCode}` : ''}
                    </TableCell>
                    <TableCell>
                      {e.deviceId != null ? `device ${e.deviceId}` : '-'}
                      {e.sensorId != null ? ` / sensor ${e.sensorId}` : ''}
                    </TableCell>
                    <TableCell>
                      <div className={styles.message}>{e.message}</div>
                      {(e.requestId || e.traceId || e.ip || (e.properties && e.properties !== '{}')) && (
                        <details>
                          <summary>Details</summary>
                          <div className={styles.mono}>
                            {e.requestId && <DetailsLine label="Request">{e.requestId}</DetailsLine>}
                            {e.traceId && <DetailsLine label="Trace">{e.traceId}</DetailsLine>}
                            {e.ip && <DetailsLine label="IP">{e.ip}</DetailsLine>}
                            {e.userId != null && <DetailsLine label="User">{e.userId}</DetailsLine>}
                            {e.properties && e.properties !== '{}' && <DetailsLine label="Properties">{e.properties}</DetailsLine>}
                          </div>
                        </details>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ListFooter
            shown={entries.length}
            hasNext={query.hasNextPage}
            fetching={query.isFetchingNextPage}
            onMore={() => query.fetchNextPage()}
            reachedLimit={!!lastPage?.hasMore && !query.hasNextPage}
          />
        </>
      )}
    </>
  );
}

/**
 * Logs (Company Admin only): the activity log - who changed what, including device deletions - and the system log. Both
 * show the newest 30 entries by default, can be filtered, and load 30 more on request. The page sits behind `RequireAdmin`
 * and the API itself answers 403 to a non-Admin; entries of other Companies are never returned.
 */
export function LogsPage() {
  const [tab, setTab] = useState<'activity' | 'system'>('activity');
  return (
    <>
      <PageHeader title="Logs" description="Activity log (who changed what) and system log of your Company. Admin only." />
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as 'activity' | 'system')} style={{ marginBottom: tokens.spacingVerticalL }}>
        <Tab value="activity">Activity log</Tab>
        <Tab value="system">System log</Tab>
      </TabList>
      {tab === 'activity' ? <ActivityLogTab /> : <SystemLogTab />}
    </>
  );
}

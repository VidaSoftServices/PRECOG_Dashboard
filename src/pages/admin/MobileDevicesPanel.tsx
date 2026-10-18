import { useMemo, useState } from 'react';
import {
  Badge,
  Body1Strong,
  Button,
  Card,
  Divider,
  Field,
  Input,
  Select,
  Tab,
  TabList,
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { AddCircle24Regular } from '@fluentui/react-icons';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { useAppToast } from '@/components/ToastProvider';
import { useCompanyMembers } from '@/api/hooks/company';
import {
  useCreateMacAddress,
  useDeleteMacAddress,
  useMacAddresses,
  useUpdateMacAddress,
  type MacAddressEntryDto,
  type MacAddressStatus,
} from '@/api/hooks/macAddresses';
import { formatDateTimeWithZone, formatRelative } from '@/lib/dateTime';
import { looksLikeMacAddress } from '@/lib/macAddress';

const useStyles = makeStyles({
  card: { padding: tokens.spacingVerticalM },
  intro: { color: tokens.colorNeutralForeground3, display: 'block', marginBottom: tokens.spacingVerticalM },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalM,
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} 0`,
  },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap' },
  mac: { fontFamily: tokens.fontFamilyMonospace, fontSize: tokens.fontSizeBase300 },
  muted: { color: tokens.colorNeutralForeground3 },
  form: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

const ROLE_NAMES = ['Admin', 'Reader'] as const;

interface AssignableUser {
  userId: number;
  label: string;
}

/**
 * Users who can own a MAC address: enabled Company members who hold the Admin
 * or Reader role (the server rejects anyone else with 400). A MirroredDatabase
 * Company's roles come from WordPress, but they are read from the same
 * `companyRoles` field either way.
 */
function useAssignableUsers(): { users: AssignableUser[]; isLoading: boolean; error: unknown; refetch: () => void } {
  const members = useCompanyMembers();
  const users = useMemo(
    () =>
      (members.data ?? [])
        .filter((m) => m.enabled !== false && (m.companyRoles ?? []).some((r) => (ROLE_NAMES as readonly string[]).includes(r)))
        .map((m) => {
          const roles = (m.companyRoles ?? []).filter((r) => (ROLE_NAMES as readonly string[]).includes(r)).join(', ');
          const name = m.displayName || m.email || `User ${m.userId}`;
          return { userId: m.userId!, label: `${name} (${roles})` };
        }),
    [members.data],
  );
  return { users, isLoading: members.isLoading, error: members.error, refetch: () => void members.refetch() };
}

/** "Assign to a User" (queue / blacklist / reassign) and "Add MAC address" (no entry yet) share one dialog. */
function MacAddressDialog({
  open,
  entry,
  onClose,
}: {
  open: boolean;
  /** Present: assign/reassign this entry. Absent: register a new MAC address directly. */
  entry?: MacAddressEntryDto;
  onClose: () => void;
}) {
  const styles = useStyles();
  const toast = useAppToast();
  const assignable = useAssignableUsers();
  const create = useCreateMacAddress();
  const update = useUpdateMacAddress();
  const [mac, setMac] = useState('');
  const [userId, setUserId] = useState<string>(entry?.userId != null ? String(entry.userId) : '');
  const [label, setLabel] = useState(entry?.label ?? '');

  const adding = entry === undefined;
  const busy = create.isPending || update.isPending;
  const macInvalid = adding && mac.trim() !== '' && !looksLikeMacAddress(mac);
  const canSubmit = userId !== '' && (!adding || looksLikeMacAddress(mac));
  const error = create.error ?? update.error;

  const submit = async () => {
    const chosen = Number(userId);
    if (adding) {
      await create.mutateAsync({ macAddress: mac.trim(), userId: chosen, label: label.trim() || undefined });
      toast.success('MAC address registered');
    } else {
      await update.mutateAsync({
        id: entry.id!,
        body: { status: 'Assigned', userId: chosen, label: label.trim() },
      });
      toast.success(`MAC address assigned: ${entry.macAddress}`);
    }
    onClose();
  };

  return (
    <ConfirmDialog
      open={open}
      title={adding ? 'Add MAC address' : `Assign ${entry.macAddress}`}
      confirmLabel={adding ? 'Add' : 'Assign'}
      busy={busy}
      confirmDisabled={!canSubmit}
      onConfirm={() => void submit().catch(() => undefined)}
      onCancel={onClose}
    >
      <div className={styles.form}>
        {adding && (
          <Field
            label="MAC address"
            required
            hint="For example AA:BB:CC:DD:EE:FF. Any common notation works."
            validationState={macInvalid ? 'error' : 'none'}
            validationMessage={macInvalid ? 'Enter 12 hexadecimal digits, e.g. AA:BB:CC:DD:EE:FF.' : undefined}
          >
            <Input value={mac} onChange={(_, d) => setMac(d.value)} />
          </Field>
        )}
        <Field label="User" required hint="Only enabled Company members with the Admin or Reader role can own a MAC address.">
          <Select aria-label="User" value={userId} onChange={(_, d) => setUserId(d.value)}>
            <option value="">Select a user…</option>
            {assignable.users.map((u) => (
              <option key={u.userId} value={String(u.userId)}>
                {u.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Note" hint="Optional, e.g. whose phone this is.">
          <Input value={label} maxLength={200} onChange={(_, d) => setLabel(d.value)} />
        </Field>
        {assignable.isLoading && <LoadingState label="" />}
        {!assignable.isLoading && assignable.users.length === 0 && (
          <Text size={200} className={styles.muted}>
            No enabled Admin or Reader members found in this Company.
          </Text>
        )}
        {error && <ErrorState error={error} />}
      </div>
    </ConfirmDialog>
  );
}

function EntryRow({
  entry,
  onAssign,
  onBlacklist,
  onRequeue,
  onRemove,
}: {
  entry: MacAddressEntryDto;
  onAssign: () => void;
  onBlacklist: () => void;
  onRequeue: () => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const status = entry.status as MacAddressStatus | undefined;

  return (
    <div className={styles.row}>
      <div>
        <Text className={styles.mac} weight="semibold">
          {entry.macAddress}
        </Text>
        {entry.label && (
          <Text size={200} className={styles.muted}>
            {' '}
            · {entry.label}
          </Text>
        )}
        <br />
        {status === 'Assigned' ? (
          <Text size={200} className={styles.muted}>
            {entry.userDisplayName || entry.userEmail || `User ${entry.userId}`}
            {entry.userRole && (
              <>
                {' '}
                <Badge appearance="tint" size="small">
                  {entry.userRole}
                </Badge>
              </>
            )}
          </Text>
        ) : (
          <Text size={200} className={styles.muted}>
            {status === 'Queued' ? 'Requested' : 'Blacklisted'} {formatRelative(status === 'Queued' ? entry.requestedAt : entry.statusChangedAt)}
            {' · '}
            {formatDateTimeWithZone(status === 'Queued' ? entry.requestedAt : entry.statusChangedAt)}
            {status === 'Queued' && (
              <>
                {' · via '}
                {entry.requestedDeviceName || (entry.requestedDeviceId != null ? `Device ${entry.requestedDeviceId}` : 'an Admin')}
              </>
            )}
          </Text>
        )}
      </div>
      <div className={styles.actions}>
        <Button size="small" appearance="primary" onClick={onAssign}>
          {status === 'Assigned' ? 'Reassign' : 'Assign to user'}
        </Button>
        {status !== 'Blacklisted' && (
          <Button size="small" onClick={onBlacklist}>
            Blacklist
          </Button>
        )}
        {status === 'Blacklisted' && (
          <Button size="small" onClick={onRequeue}>
            Move to queue
          </Button>
        )}
        <Button size="small" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </div>
  );
}

const VIEWS: { value: MacAddressStatus; label: string; empty: string; hint: string }[] = [
  {
    value: 'Queued',
    label: 'Queue',
    empty: 'No MAC addresses are waiting',
    hint: 'MAC addresses a Device has asked you to register, oldest request first. Assign each to a User, or blacklist the ones you do not want to see again.',
  },
  {
    value: 'Assigned',
    label: 'Registered',
    empty: 'No MAC addresses are assigned yet',
    hint: 'Mobile devices that belong to a User. What a person can do from their phone on a Device follows their own role: an Admin can use maintenance mode, a Reader can only read.',
  },
  {
    value: 'Blacklisted',
    label: 'Blacklist',
    empty: 'The blacklist is empty',
    hint: 'MAC addresses you rejected. They no longer appear in the queue and are ignored when a Device submits them again. You can still assign one to a User or move it back to the queue.',
  },
];

/**
 * Admin-only management of the Company's mobile-device MAC address registry:
 * the registration queue, the assignments to Admin/Reader Users, and the
 * blacklist. One registry row moves between the three views, so a MAC address
 * can never be queued and assigned (or blacklisted) at the same time.
 *
 * A MAC address identifies a phone on a local network - it is not a
 * credential and grants no access to this dashboard or the API. It is only how
 * a Device decides what to offer the person who connected to it.
 */
export function MobileDevicesPanel() {
  const styles = useStyles();
  const toast = useAppToast();
  const [view, setView] = useState<MacAddressStatus>('Queued');
  const query = useMacAddresses(view);
  const update = useUpdateMacAddress();
  const remove = useDeleteMacAddress();

  const [addOpen, setAddOpen] = useState(false);
  const [assigning, setAssigning] = useState<MacAddressEntryDto | null>(null);
  const [blacklisting, setBlacklisting] = useState<MacAddressEntryDto | null>(null);
  const [removing, setRemoving] = useState<MacAddressEntryDto | null>(null);

  const current = VIEWS.find((v) => v.value === view)!;
  const entries = query.data ?? [];

  return (
    <Card className={styles.card}>
      <div className={styles.toolbar}>
        <Body1Strong>Mobile devices</Body1Strong>
        <Button icon={<AddCircle24Regular />} onClick={() => setAddOpen(true)}>
          Add MAC address
        </Button>
      </div>
      <TabList selectedValue={view} onTabSelect={(_, d) => setView(d.value as MacAddressStatus)} style={{ marginBottom: tokens.spacingVerticalM }}>
        {VIEWS.map((v) => (
          <Tab key={v.value} value={v.value}>
            {v.label}
          </Tab>
        ))}
      </TabList>
      <Text size={200} className={styles.intro}>
        {current.hint}
      </Text>

      {query.isLoading && <LoadingState label="Loading MAC addresses…" />}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && entries.length === 0 && <EmptyState title={current.empty} />}
      {entries.map((entry, index) => (
        <div key={entry.id}>
          {index > 0 && <Divider />}
          <EntryRow
            entry={entry}
            onAssign={() => setAssigning(entry)}
            onBlacklist={() => setBlacklisting(entry)}
            onRequeue={() =>
              update.mutate(
                { id: entry.id!, body: { status: 'Queued' } },
                { onSuccess: () => toast.success(`Moved to the queue: ${entry.macAddress}`) },
              )
            }
            onRemove={() => setRemoving(entry)}
          />
        </div>
      ))}
      {update.isError && <ErrorState error={update.error} />}

      {addOpen && <MacAddressDialog open onClose={() => setAddOpen(false)} />}
      {assigning && <MacAddressDialog key={assigning.id} open entry={assigning} onClose={() => setAssigning(null)} />}

      <ConfirmDialog
        open={blacklisting !== null}
        title="Blacklist this MAC address?"
        confirmLabel="Blacklist"
        intent="destructive"
        busy={update.isPending}
        onConfirm={() => {
          const target = blacklisting;
          if (!target) return;
          update.mutate(
            { id: target.id!, body: { status: 'Blacklisted' } },
            {
              onSuccess: () => {
                toast.success(`Blacklisted: ${target.macAddress}`);
                setBlacklisting(null);
              },
            },
          );
        }}
        onCancel={() => setBlacklisting(null)}
      >
        <Text>
          {blacklisting?.macAddress} will no longer appear in the queue, and a Device that submits it again is ignored. {blacklisting?.status === 'Assigned' && 'It will also stop belonging to its current user. '}
          You can restore it from the Blacklist tab.
        </Text>
      </ConfirmDialog>

      <ConfirmDialog
        open={removing !== null}
        title="Remove this MAC address?"
        confirmLabel="Remove"
        intent="destructive"
        busy={remove.isPending}
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          remove.mutate(target.id!, {
            onSuccess: () => {
              toast.success(`Removed: ${target.macAddress}`);
              setRemoving(null);
            },
          });
        }}
        onCancel={() => setRemoving(null)}
      >
        <Text>
          {removing?.macAddress} is deleted from the registry entirely
          {removing?.status === 'Blacklisted' ? ', which takes it off the blacklist' : ''}. A Device can submit it to the queue again.
        </Text>
        {remove.isError && <ErrorState error={remove.error} />}
      </ConfirmDialog>
    </Card>
  );
}

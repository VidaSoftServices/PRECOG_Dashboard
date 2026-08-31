import { useState } from 'react';
import { Card, Text, Body1Strong, Badge, Checkbox, Divider, makeStyles, tokens } from '@fluentui/react-components';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { useAppToast } from '@/components/ToastProvider';
import {
  useCompany,
  useCompanyMembers,
  useAssignCompanyRole,
  useRevokeCompanyRole,
  useReaders,
  useReaderDeviceGrants,
  useReaderEffectiveAccess,
  useGrantReaderDevices,
  useRevokeReaderDeviceGrant,
  type CompanyMemberDto,
} from '@/api/hooks/company';
import { useDevices } from '@/api/hooks/devices';

const useStyles = makeStyles({
  layout: { display: 'grid', gridTemplateColumns: '260px minmax(0,1fr)', gap: tokens.spacingHorizontalL },
  readerRow: { padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`, cursor: 'pointer', borderRadius: tokens.borderRadiusMedium },
  readerRowSelected: { background: tokens.colorBrandBackground2 },
  card: { padding: tokens.spacingVerticalM },
  memberRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} 0`,
  },
});

const COMPANY_ROLES = ['Admin', 'Reader'] as const;

/**
 * Assign/revoke company-wide role is only offered when the Company's own
 * profile is Local. A MirroredDatabase Company's Admin/Reader assignment is
 * synchronized one-way from the WordPress `permissionlevel` meta (see
 * CLAUDE.md's "Mirrored permission-level resolution" section) - editing it
 * here would be silently overwritten by the next sync run and would
 * misrepresent where the real answer lives, exactly the reasoning the
 * existing CompanyDto.nameEditable gate already uses for the Company name.
 */
function MemberRow({ member, editable }: { member: CompanyMemberDto; editable: boolean }) {
  const styles = useStyles();
  const toast = useAppToast();
  const assign = useAssignCompanyRole();
  const revoke = useRevokeCompanyRole();
  const roles = new Set(member.companyRoles ?? []);
  const busy = assign.isPending || revoke.isPending;

  const toggleRole = (roleName: (typeof COMPANY_ROLES)[number], checked: boolean) => {
    const label = member.displayName || member.email || `User ${member.userId}`;
    if (checked) {
      assign.mutate(
        { userId: member.userId!, roleName },
        { onSuccess: () => toast.success(`${roleName} role granted to ${label}`) },
      );
    } else {
      revoke.mutate(
        { userId: member.userId!, roleName },
        { onSuccess: () => toast.success(`${roleName} role revoked from ${label}`) },
      );
    }
  };

  return (
    <div className={styles.memberRow}>
      <div>
        <Text weight="semibold">{member.displayName || `User ${member.userId}`}</Text>
        <br />
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {member.email}
        </Text>
      </div>
      {editable ? (
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalM, alignItems: 'center' }}>
          {COMPANY_ROLES.map((roleName) => (
            <Checkbox
              key={roleName}
              label={roleName}
              checked={roles.has(roleName)}
              disabled={busy}
              onChange={(_, d) => toggleRole(roleName, d.checked === true)}
            />
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: tokens.spacingHorizontalXS }}>
          {roles.size === 0 ? (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              No role
            </Text>
          ) : (
            [...roles].map((role) => (
              <Badge key={role} appearance="tint">
                {role}
              </Badge>
            ))
          )}
        </div>
      )}
      {(assign.isError || revoke.isError) && <ErrorState error={assign.error ?? revoke.error} />}
    </div>
  );
}

function CompanyMembersCard() {
  const styles = useStyles();
  const companyQuery = useCompany();
  const membersQuery = useCompanyMembers();
  const editable = companyQuery.data?.profileSource === 'Local';

  if (membersQuery.isLoading) return <LoadingState label="Loading Company members…" />;
  if (membersQuery.isError) return <ErrorState error={membersQuery.error} onRetry={() => membersQuery.refetch()} />;

  const members = membersQuery.data ?? [];

  return (
    <Card className={styles.card} style={{ marginBottom: tokens.spacingVerticalL }}>
      <Body1Strong>Company members</Body1Strong>
      {!editable && companyQuery.data && (
        <Text size={200} style={{ color: tokens.colorNeutralForeground3, display: 'block', marginTop: tokens.spacingVerticalXS }}>
          Role is synchronized from WordPress for this Company and can&apos;t be changed here.
        </Text>
      )}
      {members.length === 0 && <EmptyState title="No Company members found" />}
      {members.map((member, index) => (
        <div key={member.userId}>
          {index > 0 && <Divider />}
          <MemberRow member={member} editable={editable} />
        </div>
      ))}
    </Card>
  );
}

export function ReadersPage() {
  const styles = useStyles();
  const toast = useAppToast();
  const readersQuery = useReaders();
  const devicesQuery = useDevices();
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>();

  const grantsQuery = useReaderDeviceGrants(selectedUserId);
  const effectiveQuery = useReaderEffectiveAccess(selectedUserId);
  const grant = useGrantReaderDevices(selectedUserId ?? -1);
  const revoke = useRevokeReaderDeviceGrant(selectedUserId ?? -1);

  if (readersQuery.isLoading) return <LoadingState label="Loading readers…" />;
  if (readersQuery.isError) return <ErrorState error={readersQuery.error} onRetry={() => readersQuery.refetch()} />;

  const readers = readersQuery.data ?? [];
  const devices = devicesQuery.data ?? [];
  const grantedIds = new Set((grantsQuery.data ?? []).map((g) => g.deviceId));

  return (
    <>
      <PageHeader title="Readers & Access" description="Company member roles, Readers, and their explicit per-Device grants." />
      <CompanyMembersCard />
      <div className={styles.layout}>
        <Card className={styles.card}>
          {readers.length === 0 && <EmptyState title="No Readers yet" />}
          {readers.map((reader) => (
            <div
              key={reader.userId}
              className={`${styles.readerRow} ${selectedUserId === reader.userId ? styles.readerRowSelected : ''}`}
              onClick={() => setSelectedUserId(reader.userId)}
            >
              <Text weight="semibold">{reader.displayName}</Text>
              <br />
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                {reader.email}
              </Text>
            </div>
          ))}
        </Card>

        <div>
          {selectedUserId === undefined && <EmptyState title="Select a Reader to manage their Device access" />}
          {selectedUserId !== undefined && (
            <Card className={styles.card}>
              <Body1Strong>Direct Device grants</Body1Strong>
              {grantsQuery.isLoading && <LoadingState label="" />}
              {devices.map((device) => (
                <Checkbox
                  key={device.id}
                  label={device.deviceName || device.externalDeviceId}
                  checked={grantedIds.has(device.id!)}
                  onChange={(_, d) => {
                    const deviceLabel = device.deviceName || device.externalDeviceId;
                    if (d.checked) {
                      grant.mutate([device.id!], { onSuccess: () => toast.success(`Access granted: ${deviceLabel}`) });
                    } else {
                      revoke.mutate(device.id!, { onSuccess: () => toast.success(`Access revoked: ${deviceLabel}`) });
                    }
                  }}
                />
              ))}
              {grant.isError && <ErrorState error={grant.error} />}
              {revoke.isError && <ErrorState error={revoke.error} />}

              <Body1Strong style={{ marginTop: tokens.spacingVerticalM, display: 'block' }}>
                Effective access (includes group/location-derived)
              </Body1Strong>
              {effectiveQuery.data && (
                <Text size={200}>
                  {effectiveQuery.data.isCompanyAdmin ? 'Company Admin (all Devices)' : `${(effectiveQuery.data.accessibleDeviceIds ?? []).length} Device(s)`}
                </Text>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

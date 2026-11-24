import { useState } from 'react';
import { Card, Text, Body1Strong, Badge, Checkbox, Divider, Tab, TabList, makeStyles, tokens } from '@fluentui/react-components';
import { PageHeader } from '@/components/PageHeader';
import { LoadingState } from '@/components/states/LoadingState';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { useAppToast } from '@/components/ToastProvider';
import {
  useCompanyMembers,
  useCompanyInvitations,
  useInviteMember,
  useRevokeCompanyInvitation,
  useRemoveCompanyMember,
  useLinkMemberToWordPress,
  useUnlinkMemberFromWordPress,
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
import { InvitePanel } from '@/components/people/InvitePanel';
import { MemberActions } from '@/components/people/MemberActions';
import { WordPressBadge } from '@/components/people/WordPressBadge';
import { MobileDevicesPanel } from './MobileDevicesPanel';
import { useT } from '@/lib/language';

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
 * One person of the Company: the roles (managed here for everyone, also for a person synchronized from WordPress - WordPress provides no role), where the
 * person comes from, and the actions (remove, link to / unlink from WordPress).
 */
function MemberRow({ member, editable }: { member: CompanyMemberDto; editable: boolean }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const assign = useAssignCompanyRole();
  const revoke = useRevokeCompanyRole();
  const removeMember = useRemoveCompanyMember();
  const linkMember = useLinkMemberToWordPress();
  const unlinkMember = useUnlinkMemberFromWordPress();
  const roles = new Set(member.companyRoles ?? []);
  const busy = assign.isPending || revoke.isPending;

  const toggleRole = (roleName: (typeof COMPANY_ROLES)[number], checked: boolean) => {
    const label = member.displayName || member.email || t('User {0}', member.userId);
    if (checked) {
      assign.mutate(
        { userId: member.userId!, roleName },
        { onSuccess: () => toast.success(t('{0} role granted to {1}', roleName, label)) },
      );
    } else {
      revoke.mutate(
        { userId: member.userId!, roleName },
        { onSuccess: () => toast.success(t('{0} role revoked from {1}', roleName, label)) },
      );
    }
  };

  return (
    <div className={styles.memberRow}>
      <div>
        <Text weight="semibold">{member.displayName || t('User {0}', member.userId)}</Text> {member.synchronizedFromWordPress && <WordPressBadge />}
        <br />
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {member.email}
        </Text>
        <MemberActions
          name={member.displayName || member.email || t('User {0}', member.userId)}
          fromWordPress={member.synchronizedFromWordPress === true}
          origin={member.origin}
          handlers={{
            remove: () => removeMember.mutateAsync(member.userId!),
            link: () => linkMember.mutateAsync(member.userId!),
            unlink: () => unlinkMember.mutateAsync(member.userId!),
          }}
        />
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
              {t('No role')}</Text>
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
  const t = useT();
  const styles = useStyles();
  const membersQuery = useCompanyMembers();
  const invitations = useCompanyInvitations();
  const invite = useInviteMember();
  const revokeInvitation = useRevokeCompanyInvitation();

  if (membersQuery.isLoading) return <LoadingState label={t('Loading Company members…')} />;
  if (membersQuery.isError) return <ErrorState error={membersQuery.error} onRetry={() => membersQuery.refetch()} />;

  const members = membersQuery.data ?? [];

  return (
    <Card className={styles.card} style={{ marginBottom: tokens.spacingVerticalL }}>
      <Body1Strong>{t('Company members')}</Body1Strong>
      {members.length === 0 && <EmptyState title={t('No Company members found')} />}
      {members.map((member, index) => (
        <div key={member.userId}>
          {index > 0 && <Divider />}
          <MemberRow member={member} editable />
        </div>
      ))}
      <Divider />
      <InvitePanel
        pending={invitations.data}
        onInvite={(v) => invite.mutateAsync(v)}
        onWithdraw={(id) => revokeInvitation.mutateAsync(id)}
      />
      {invitations.isError && <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />}
    </Card>
  );
}

function ReadersTab() {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const readersQuery = useReaders();
  const devicesQuery = useDevices();
  const [selectedUserId, setSelectedUserId] = useState<number | undefined>();

  const grantsQuery = useReaderDeviceGrants(selectedUserId);
  const effectiveQuery = useReaderEffectiveAccess(selectedUserId);
  const grant = useGrantReaderDevices(selectedUserId ?? -1);
  const revoke = useRevokeReaderDeviceGrant(selectedUserId ?? -1);

  if (readersQuery.isLoading) return <LoadingState label={t('Loading readers…')} />;
  if (readersQuery.isError) return <ErrorState error={readersQuery.error} onRetry={() => readersQuery.refetch()} />;

  const readers = readersQuery.data ?? [];
  const devices = devicesQuery.data ?? [];
  const grantedIds = new Set((grantsQuery.data ?? []).map((g) => g.deviceId));

  return (
    <>
      <CompanyMembersCard />
      <div className={styles.layout}>
        <Card className={styles.card}>
          {readers.length === 0 && <EmptyState title={t('No Readers yet')} />}
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
          {selectedUserId === undefined && <EmptyState title={t('Select a Reader to manage their Device access')} />}
          {selectedUserId !== undefined && (
            <Card className={styles.card}>
              <Body1Strong>{t('Direct Device grants')}</Body1Strong>
              {grantsQuery.isLoading && <LoadingState label="" />}
              {devices.map((device) => (
                <Checkbox
                  key={device.id}
                  label={device.deviceName || device.externalDeviceId}
                  checked={grantedIds.has(device.id!)}
                  onChange={(_, d) => {
                    const deviceLabel = device.deviceName || device.externalDeviceId;
                    if (d.checked) {
                      grant.mutate([device.id!], { onSuccess: () => toast.success(t('Access granted: {0}', deviceLabel)) });
                    } else {
                      revoke.mutate(device.id!, { onSuccess: () => toast.success(t('Access revoked: {0}', deviceLabel)) });
                    }
                  }}
                />
              ))}
              {grant.isError && <ErrorState error={grant.error} />}
              {revoke.isError && <ErrorState error={revoke.error} />}

              <Body1Strong style={{ marginTop: tokens.spacingVerticalM, display: 'block' }}>
                {t('Effective access (includes group/location-derived)')}</Body1Strong>
              {effectiveQuery.data && (
                <Text size={200}>
                  {effectiveQuery.data.isCompanyAdmin ? t('Company Admin (all Devices)') : t('{0} Device(s)', (effectiveQuery.data.accessibleDeviceIds ?? []).length)}
                </Text>
              )}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Admin-only "user management" surface. Two separate capabilities live here:
 * who holds which role and which Devices a Reader can see ("Members &
 * access"), and the registry of the Users' mobile devices by MAC address
 * ("Mobile devices" - the registration queue, assignments and blacklist).
 */
export function ReadersPage() {
  const t = useT();
  const [tab, setTab] = useState<'members' | 'mobile'>('members');
  return (
    <>
      <PageHeader
        title={t('Users & Access')}
        description={t('Company member roles, Reader Device grants, and the mobile devices (MAC addresses) registered to Users.')}
      />
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as 'members' | 'mobile')} style={{ marginBottom: tokens.spacingVerticalL }}>
        <Tab value="members">{t('Members & access')}</Tab>
        <Tab value="mobile">{t('Mobile devices')}</Tab>
      </TabList>
      {tab === 'members' && <ReadersTab />}
      {tab === 'mobile' && <MobileDevicesPanel />}
    </>
  );
}

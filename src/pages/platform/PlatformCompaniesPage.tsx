import { useState, type FormEvent } from 'react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Subtitle1,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  Text,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { Add16Regular } from '@fluentui/react-icons';
import {
  useCreatePlatformCompany,
  useGrantPlatformRole,
  useInviteToCompany,
  useLinkPlatformMember,
  usePlatformCompanies,
  usePlatformInvitations,
  usePlatformMembers,
  useRemovePlatformMember,
  useRevokeInvitation,
  useRevokePlatformRole,
  useSetPlatformCompanyEnabled,
  useUnlinkPlatformMember,
  type PlatformCompany,
} from '@/api/hooks/platform';
import { InvitePanel } from '@/components/people/InvitePanel';
import { MemberActions } from '@/components/people/MemberActions';
import { useLastAdminConfirm } from '@/components/people/useLastAdminConfirm';
import { PlatformCompanyProfile } from './PlatformCompanyProfile';
import { DeleteCompanyDialog } from './DeleteCompanyDialog';
import { WordPressBadge } from '@/components/people/WordPressBadge';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PlatformServers } from '@/pages/admin/ServersTab';
import { PageHeader } from '@/components/PageHeader';
import { useAppToast } from '@/components/ToastProvider';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { useT } from '@/lib/language';

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  card: { padding: tokens.spacingVerticalM, display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
  row: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'flex-end' },
  grow: { flex: '1 1 220px', minWidth: '180px' },
  selectedRow: { background: tokens.colorNeutralBackground1Selected },
  clickable: { cursor: 'pointer' },
  nameCell: { display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalXS },
  actions: { display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
});

function CreateCompanyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const create = useCreatePlatformCompany();
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');

  const close = () => {
    setName('');
    setWebsite('');
    create.reset();
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate(
      { name: name.trim(), website: website.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('The company was created. Invite its first Admin next.');
          close();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface>
        <form onSubmit={submit}>
          <DialogBody>
            <DialogTitle>{t('Create company')}</DialogTitle>
            <DialogContent className={styles.card}>
              <Field label={t('Company name')} required>
                <Input value={name} onChange={(_, d) => setName(d.value)} maxLength={200} disabled={create.isPending} />
              </Field>
              <Field label={t('Website (optional)')}>
                <Input value={website} onChange={(_, d) => setWebsite(d.value)} maxLength={512} placeholder="https://" disabled={create.isPending} />
              </Field>
              {create.isError && (
                <MessageBar intent="error">
                  <MessageBarBody>{t(create.error.message)}</MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={close} disabled={create.isPending}>
                {t('Cancel')}
              </Button>
              <Button type="submit" appearance="primary" disabled={create.isPending || !name.trim()}>
                {t('Create')}
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}

function CompanyDetail({ company, onDeleted }: { company: PlatformCompany; onDeleted: () => void }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  // The generated DTO marks every property optional; the API always sends the id.
  const companyId = company.id ?? 0;

  const members = usePlatformMembers(companyId);
  const invitations = usePlatformInvitations(companyId);
  const invite = useInviteToCompany();
  const revokeInvitation = useRevokeInvitation();
  const grant = useGrantPlatformRole();
  const revoke = useRevokePlatformRole();
  const setEnabled = useSetPlatformCompanyEnabled();
  const removeMember = useRemovePlatformMember();
  const linkMember = useLinkPlatformMember();
  const unlinkMember = useUnlinkPlatformMember();

  const [pendingRevoke, setPendingRevoke] = useState<{ userId: number; name: string; roleName: 'Admin' | 'Reader' } | null>(null);
  const [confirmEnabled, setConfirmEnabled] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const lastAdmin = useLastAdminConfirm();

  return (
    <Card className={styles.card}>
      <div className={styles.row} style={{ justifyContent: 'space-between' }}>
        <Subtitle1 as="h2">{company.name}</Subtitle1>
        <Button
          appearance="secondary"
          disabled={setEnabled.isPending}
          onClick={() => setConfirmEnabled(true)}
        >
          {company.enabled ? t('Disable company') : t('Enable company')}
        </Button>
      </div>

      {!company.enabled && (
        <MessageBar intent="warning">
          <MessageBarBody>{t('This company is disabled: its Devices are not accepted and its people cannot sign in or work.')}</MessageBarBody>
        </MessageBar>
      )}

      <PlatformCompanyProfile company={company} />

      <Subtitle1 as="h3">{t('People')}</Subtitle1>
      {members.isLoading && <LoadingState label={t('Loading…')} />}
      {members.isError && <ErrorState error={members.error} onRetry={() => members.refetch()} />}
      {members.data && members.data.length === 0 && <EmptyState title={t('No people yet')} description={t('Invite the first Admin below.')} />}
      {members.data && members.data.length > 0 && (
        <Table aria-label={t('People')} size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t('Name')}</TableHeaderCell>
              <TableHeaderCell>{t('E-mail address')}</TableHeaderCell>
              <TableHeaderCell>{t('Roles')}</TableHeaderCell>
              <TableHeaderCell>{t('Actions')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.data.map((m) => {
              const roles = m.companyRoles ?? [];
              const userId = m.userId ?? 0;
              const name = m.displayName ?? m.email ?? String(userId);
              return (
                <TableRow key={userId}>
                  <TableCell>
                    {name} {m.synchronizedFromWordPress && <WordPressBadge />}
                  </TableCell>
                  <TableCell>{m.email}</TableCell>
                  <TableCell>
                    {roles.length === 0 ? <Text>{t('No role')}</Text> : roles.map((r) => <Badge key={r} appearance="tint" style={{ marginRight: 4 }}>{r === 'Admin' ? t('Administrator') : t('Reader')}</Badge>)}
                    {!m.enabled && <Badge color="danger" appearance="outline">{t('Disabled')}</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className={styles.actions}>
                      {roles.includes('Admin') ? (
                        <Button size="small" onClick={() => setPendingRevoke({ userId, name, roleName: 'Admin' })}>{t('Revoke Admin')}</Button>
                      ) : (
                        <Button size="small" onClick={() => grant.mutate({ companyId, userId, roleName: 'Admin' }, { onSuccess: () => toast.success('The Admin role was granted.') })}>{t('Make Admin')}</Button>
                      )}
                      {roles.includes('Reader') ? (
                        <Button size="small" onClick={() => setPendingRevoke({ userId, name, roleName: 'Reader' })}>{t('Revoke Reader')}</Button>
                      ) : (
                        <Button size="small" onClick={() => grant.mutate({ companyId, userId, roleName: 'Reader' }, { onSuccess: () => toast.success('The Reader role was granted.') })}>{t('Make Reader')}</Button>
                      )}
                    </div>
                    <MemberActions
                      name={name}
                      fromWordPress={m.synchronizedFromWordPress === true}
                      origin={m.origin}
                      handlers={{
                        remove: () => removeMember.mutateAsync({ companyId, userId }),
                        link: () => linkMember.mutateAsync({ companyId, userId }),
                        unlink: () => unlinkMember.mutateAsync({ companyId, userId }),
                      }}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      {(grant.isError || revoke.isError) && (
        <MessageBar intent="error">
          <MessageBarBody>{t((grant.error ?? revoke.error)!.message)}</MessageBarBody>
        </MessageBar>
      )}

      <InvitePanel
        pending={invitations.data}
        onInvite={(v) => invite.mutateAsync({ companyId, ...v })}
        onWithdraw={(invitationId) => revokeInvitation.mutateAsync({ companyId, invitationId })}
        disabled={!company.enabled}
        defaultRole="Admin"
      />
      {invitations.isError && <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />}

      <Subtitle1 as="h3">{t('Servers')}</Subtitle1>
      <PlatformServers companyId={companyId} />

      <ConfirmDialog
        open={pendingRevoke !== null}
        title={pendingRevoke?.roleName === 'Admin' ? t('Revoke the Admin role?') : t('Revoke the Reader role?')}
        intent="destructive"
        confirmLabel={t('Revoke')}
        cancelLabel={t('Cancel')}
        busy={revoke.isPending}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          const pending = pendingRevoke;
          setPendingRevoke(null);
          if (!pending) return;
          // The last Admin of a Company that has Devices is a question first (useLastAdminConfirm), not a refusal.
          void lastAdmin
            .attempt((confirmLastAdmin) =>
              revoke.mutateAsync(
                { companyId, userId: pending.userId, roleName: pending.roleName, confirmLastAdmin },
                { onSuccess: () => toast.success('The role was revoked.') },
              ),
            )
            .catch(() => undefined);
        }}
      >
        {t('{0} loses this role. A company must keep at least one Admin.', pendingRevoke?.name ?? '')}
      </ConfirmDialog>

      <Subtitle1 as="h3">{t('Delete company')}</Subtitle1>
      <div className={styles.row}>
        <Button appearance="secondary" disabled={(company.adminCount ?? 0) > 0} onClick={() => setDeleting(true)}>
          {t('Delete company')}
        </Button>
        <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
          {(company.adminCount ?? 0) > 0
            ? t('A company with an Admin cannot be deleted - disable it instead, or take its Admin away first.')
            : t('The company has no Admin: it can be deleted permanently.')}
        </Text>
      </div>
      <DeleteCompanyDialog company={company} open={deleting} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onDeleted(); }} />

      {lastAdmin.dialog}

      <ConfirmDialog
        open={confirmEnabled}
        title={company.enabled ? t('Disable this company?') : t('Enable this company?')}
        intent={company.enabled ? 'destructive' : 'normal'}
        confirmLabel={company.enabled ? t('Disable') : t('Enable')}
        cancelLabel={t('Cancel')}
        busy={setEnabled.isPending}
        onCancel={() => setConfirmEnabled(false)}
        onConfirm={() =>
          setEnabled.mutate(
            { companyId, enabled: !company.enabled },
            { onSuccess: () => toast.success(company.enabled ? 'The company was disabled.' : 'The company was enabled.'), onSettled: () => setConfirmEnabled(false) },
          )
        }
      >
        {company.enabled
          ? t('Its Devices stop being accepted and its people cannot work until it is enabled again.')
          : t('Its Devices are accepted again and its people can work.')}
      </ConfirmDialog>
    </Card>
  );
}

/**
 * The platform administrator's (VSSSysAdmin) page: the Companies, create one, invite its first Admin (or anyone) by e-mail, withdraw invitations, grant and
 * revoke roles. It shows names, states and counts and the people who administer a Company - never a Company's telemetry, Issues, Devices or models.
 */
export function PlatformCompaniesPage() {
  const t = useT();
  const styles = useStyles();
  const companies = usePlatformCompanies();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = companies.data?.find((c) => c.id === selectedId) ?? null;

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('Companies')}
        description={t('Create companies and invite their first Admin. Everything else about a company is managed by its own Admins.')}
        actions={
          <Button appearance="primary" icon={<Add16Regular />} onClick={() => setCreating(true)}>
            {t('Create company')}
          </Button>
        }
      />

      {companies.isLoading && <LoadingState label={t('Loading…')} />}
      {companies.isError && <ErrorState error={companies.error} onRetry={() => companies.refetch()} />}
      {companies.data && (
        <Table aria-label={t('Companies')} size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t('Company')}</TableHeaderCell>
              <TableHeaderCell>{t('People')}</TableHeaderCell>
              <TableHeaderCell>{t('Admins')}</TableHeaderCell>
              <TableHeaderCell>{t('State')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {companies.data.map((c) => (
              <TableRow
                key={c.id}
                className={mergeClasses(styles.clickable, c.id === selectedId && styles.selectedRow)}
                onClick={() => setSelectedId(c.id ?? null)}
                aria-selected={c.id === selectedId}
                tabIndex={0}
                role="row"
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedId(c.id ?? null)}
              >
                <TableCell>
                  <span className={styles.nameCell}>
                    {c.name}
                  </span>
                </TableCell>
                <TableCell>{c.userCount}</TableCell>
                <TableCell>
                  {c.adminCount === 0 ? <Badge color="warning" appearance="outline">{t('No Admin yet')}</Badge> : c.adminCount}
                </TableCell>
                <TableCell>
                  <Badge color={c.enabled ? 'success' : 'danger'} appearance="tint">
                    {c.enabled ? t('Enabled') : t('Disabled')}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {selected ? <CompanyDetail key={selected.id} company={selected} onDeleted={() => setSelectedId(null)} /> : companies.data && <Text>{t('Select a company to see its people and invitations.')}</Text>}

      <CreateCompanyDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

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
  Select,
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
import { Add16Regular, LockClosed16Regular } from '@fluentui/react-icons';
import {
  useCreatePlatformCompany,
  useGrantPlatformRole,
  useInviteToCompany,
  usePlatformCompanies,
  usePlatformInvitations,
  usePlatformMembers,
  useRevokeInvitation,
  useRevokePlatformRole,
  useSetPlatformCompanyEnabled,
  type PlatformCompany,
} from '@/api/hooks/platform';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { useAppToast } from '@/components/ToastProvider';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { useLanguage, useT } from '@/lib/language';

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

function CompanyDetail({ company }: { company: PlatformCompany }) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const { language } = useLanguage();
  // The generated DTO marks every property optional; the API always sends the id.
  const companyId = company.id ?? 0;

  const members = usePlatformMembers(companyId);
  const invitations = usePlatformInvitations(companyId);
  const invite = useInviteToCompany();
  const revokeInvitation = useRevokeInvitation();
  const grant = useGrantPlatformRole();
  const revoke = useRevokePlatformRole();
  const setEnabled = useSetPlatformCompanyEnabled();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Admin' | 'Reader'>('Admin');
  const [mailLanguage, setMailLanguage] = useState<'en' | 'hu'>(language);
  const [pendingRevoke, setPendingRevoke] = useState<{ userId: number; name: string; roleName: 'Admin' | 'Reader' } | null>(null);
  const [confirmEnabled, setConfirmEnabled] = useState(false);

  const submitInvitation = (event: FormEvent) => {
    event.preventDefault();
    invite.mutate(
      { companyId, email: email.trim(), roleName: role, language: mailLanguage },
      {
        onSuccess: (result) => {
          if (result.emailSent) toast.success('The invitation was created and the e-mail was sent.');
          else toast.info('The invitation was created, but the e-mail could not be sent. Check the e-mail settings and send the invitation again.');
          setEmail('');
        },
      },
    );
  };

  return (
    <Card className={styles.card}>
      <div className={styles.row} style={{ justifyContent: 'space-between' }}>
        <Subtitle1 as="h2">{company.name}</Subtitle1>
        <Button
          appearance="secondary"
          disabled={company.locked || setEnabled.isPending}
          onClick={() => setConfirmEnabled(true)}
          title={company.locked ? t('Synchronized from WordPress: it cannot be disabled here.') : undefined}
        >
          {company.enabled ? t('Disable company') : t('Enable company')}
        </Button>
      </div>

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
                  <TableCell>{name}</TableCell>
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

      <Subtitle1 as="h3">{t('Pending invitations')}</Subtitle1>
      {invitations.isError && <ErrorState error={invitations.error} onRetry={() => invitations.refetch()} />}
      {invitations.data && invitations.data.length === 0 && <Text>{t('No pending invitations.')}</Text>}
      {invitations.data && invitations.data.length > 0 && (
        <Table aria-label={t('Pending invitations')} size="small">
          <TableBody>
            {invitations.data.map((i) => (
              <TableRow key={i.id ?? 0}>
                <TableCell>{i.email}</TableCell>
                <TableCell>{i.roleName === 'Admin' ? t('Administrator') : t('Reader')}</TableCell>
                <TableCell>{t('Valid until {0}', new Date(i.expiresAt ?? 0).toLocaleDateString(language === 'hu' ? 'hu-HU' : 'en-GB'))}</TableCell>
                <TableCell>
                  <Button size="small" onClick={() => revokeInvitation.mutate({ companyId, invitationId: i.id ?? 0 }, { onSuccess: () => toast.success('The invitation was withdrawn.') })}>
                    {t('Withdraw')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Subtitle1 as="h3">{t('Invite someone')}</Subtitle1>
      <form onSubmit={submitInvitation} className={styles.row}>
        <Field label={t('E-mail address')} className={styles.grow} required>
          <Input type="email" value={email} onChange={(_, d) => setEmail(d.value)} maxLength={256} disabled={invite.isPending || !company.enabled} />
        </Field>
        <Field label={t('Role')}>
          <Select value={role} onChange={(_, d) => setRole(d.value as 'Admin' | 'Reader')} disabled={invite.isPending || !company.enabled}>
            <option value="Admin">{t('Administrator')}</option>
            <option value="Reader">{t('Reader')}</option>
          </Select>
        </Field>
        <Field label={t('E-mail language')}>
          <Select value={mailLanguage} onChange={(_, d) => setMailLanguage(d.value as 'en' | 'hu')} disabled={invite.isPending || !company.enabled}>
            <option value="en">English</option>
            <option value="hu">Magyar</option>
          </Select>
        </Field>
        <Button type="submit" appearance="primary" icon={<Add16Regular />} disabled={invite.isPending || !email.trim() || !company.enabled}>
          {t('Send invitation')}
        </Button>
      </form>
      {invite.isError && (
        <MessageBar intent="error">
          <MessageBarBody>{t(invite.error.message)}</MessageBarBody>
        </MessageBar>
      )}

      <ConfirmDialog
        open={pendingRevoke !== null}
        title={pendingRevoke?.roleName === 'Admin' ? t('Revoke the Admin role?') : t('Revoke the Reader role?')}
        intent="destructive"
        confirmLabel={t('Revoke')}
        cancelLabel={t('Cancel')}
        busy={revoke.isPending}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => {
          if (!pendingRevoke) return;
          revoke.mutate(
            { companyId, userId: pendingRevoke.userId, roleName: pendingRevoke.roleName },
            { onSuccess: () => toast.success('The role was revoked.'), onSettled: () => setPendingRevoke(null) },
          );
        }}
      >
        {t('{0} loses this role. A company must keep at least one Admin.', pendingRevoke?.name ?? '')}
      </ConfirmDialog>

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
                    {c.locked && <LockClosed16Regular aria-label={t('Synchronized from WordPress')} />}
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

      {selected ? <CompanyDetail key={selected.id} company={selected} /> : companies.data && <Text>{t('Select a company to see its people and invitations.')}</Text>}

      <CreateCompanyDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

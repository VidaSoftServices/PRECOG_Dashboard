import { useState } from 'react';
import {
  Badge,
  Button,
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
import {
  useChangePlatformUserCompany,
  usePlatformCompanies,
  usePlatformUsers,
  useRemovePlatformMember,
  useRemovePlatformUserWithoutCompany,
  useSetPlatformUserEnabled,
  type PlatformUser,
  type PlatformUserFilters,
} from '@/api/hooks/platform';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/PageHeader';
import { useAppToast } from '@/components/ToastProvider';
import { WordPressBadge } from '@/components/people/WordPressBadge';
import { useLastAdminConfirm } from '@/components/people/useLastAdminConfirm';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { useT } from '@/lib/language';

const PAGE_SIZE = 50;

const useStyles = makeStyles({
  page: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  filters: { display: 'flex', gap: tokens.spacingHorizontalM, flexWrap: 'wrap', alignItems: 'flex-end' },
  grow: { flex: '1 1 240px', minWidth: '200px' },
  actions: { display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
  pager: { display: 'flex', gap: tokens.spacingHorizontalS, alignItems: 'center' },
  roles: { display: 'flex', gap: tokens.spacingHorizontalXS, flexWrap: 'wrap' },
});

const INITIAL: PlatformUserFilters = { search: '', companyId: null, role: '', enabled: '', skip: 0, take: PAGE_SIZE };

/** The API's refusals are English texts; the ones this page can meet are translated here. */
function RefusalBar({ error }: { error: unknown }) {
  const t = useT();
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  return (
    <MessageBar intent="error">
      <MessageBarBody>{t(message)}</MessageBarBody>
    </MessageBar>
  );
}

function ChangeCompanyDialog({ user, onClose }: { user: PlatformUser | null; onClose: () => void }) {
  const t = useT();
  const toast = useAppToast();
  const companies = usePlatformCompanies();
  const change = useChangePlatformUserCompany();
  const { attempt, dialog } = useLastAdminConfirm();
  const [target, setTarget] = useState('');

  const close = () => {
    setTarget('');
    change.reset();
    onClose();
  };

  // The success callback is passed to every call, so it also runs when the person confirms the "last Admin" question.
  const move = () =>
    attempt((confirmLastAdmin) =>
      change.mutateAsync(
        { userId: user!.userId!, companyId: Number(target), confirmLastAdmin },
        {
          onSuccess: () => {
            toast.success(t('The person was moved'));
            close();
          },
        },
      ),
    );

  return (
    <>
      <Dialog open={user !== null} onOpenChange={(_, d) => !d.open && close()}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('Change company')}</DialogTitle>
            <DialogContent>
              <Text block style={{ marginBottom: tokens.spacingVerticalS }}>
                {t('{0} moves to the company you choose. The person loses every role and Device access in the old company and arrives without a role - it sees nothing until someone gives it one.', user?.displayName ?? user?.email ?? '')}
              </Text>
              <Field label={t('New company')}>
                <Select value={target} onChange={(_, d) => setTarget(d.value)}>
                  <option value="">{t('Choose a company')}</option>
                  {companies.data
                    ?.filter((c) => c.id !== user?.companyId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </Select>
              </Field>
              {change.isError && !change.isPending && <RefusalBar error={change.error} />}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={close} disabled={change.isPending}>
                {t('Cancel')}
              </Button>
              <Button
                appearance="primary"
                disabled={target === '' || change.isPending}
                onClick={() => void move().catch(() => undefined)}
              >
                {t('Move')}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
      {dialog}
    </>
  );
}

/**
 * The platform administrator's (VSSSysAdmin) People list: every User of every Company in one place, filtered by company, role and state, with the three things only
 * it may do - change a User's company, disable / enable it, remove it. It shows names, e-mail addresses, roles and states - never a Company's data.
 */
export function PlatformUsersPage() {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const companies = usePlatformCompanies();
  const [filters, setFilters] = useState<PlatformUserFilters>(INITIAL);
  const users = usePlatformUsers(filters);
  const setEnabled = useSetPlatformUserEnabled();
  const remove = useRemovePlatformMember();
  const removeWithoutCompany = useRemovePlatformUserWithoutCompany();
  const { attempt, dialog } = useLastAdminConfirm();
  const [moving, setMoving] = useState<PlatformUser | null>(null);
  const [disabling, setDisabling] = useState<PlatformUser | null>(null);
  const [removing, setRemoving] = useState<PlatformUser | null>(null);

  const set = (patch: Partial<PlatformUserFilters>) => setFilters((f) => ({ ...f, skip: 0, ...patch }));
  const total = users.data?.total ?? 0;
  const items = users.data?.items ?? [];
  const nameOf = (u: PlatformUser) => u.displayName ?? u.email ?? String(u.userId);

  return (
    <div className={styles.page}>
      <PageHeader title={t('People')} description={t('Every person of every company. Only the platform administrator can change a person\'s company.')} />

      <div className={styles.filters}>
        <Field label={t('Search')} className={styles.grow}>
          <Input value={filters.search} onChange={(_, d) => set({ search: d.value })} placeholder={t('Name or e-mail address')} />
        </Field>
        <Field label={t('Company')}>
          <Select value={filters.companyId === null ? '' : String(filters.companyId)} onChange={(_, d) => set({ companyId: d.value === '' ? null : Number(d.value) })}>
            <option value="">{t('All companies')}</option>
            {companies.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('Role')}>
          <Select value={filters.role} onChange={(_, d) => set({ role: d.value as PlatformUserFilters['role'] })}>
            <option value="">{t('Any role')}</option>
            <option value="Admin">{t('Administrator')}</option>
            <option value="Reader">{t('Reader')}</option>
            <option value="None">{t('No role')}</option>
          </Select>
        </Field>
        <Field label={t('State')}>
          <Select value={filters.enabled} onChange={(_, d) => set({ enabled: d.value as PlatformUserFilters['enabled'] })}>
            <option value="">{t('Any state')}</option>
            <option value="true">{t('Enabled')}</option>
            <option value="false">{t('Disabled')}</option>
          </Select>
        </Field>
      </div>

      {users.isLoading && <LoadingState label={t('Loading…')} />}
      {users.isError && <ErrorState error={users.error} onRetry={() => users.refetch()} />}
      {users.data && items.length === 0 && <EmptyState title={t('No people match')} />}
      {items.length > 0 && (
        <Table aria-label={t('People')} size="small">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>{t('Name')}</TableHeaderCell>
              <TableHeaderCell>{t('E-mail address')}</TableHeaderCell>
              <TableHeaderCell>{t('Company')}</TableHeaderCell>
              <TableHeaderCell>{t('Roles')}</TableHeaderCell>
              <TableHeaderCell>{t('State')}</TableHeaderCell>
              <TableHeaderCell>{t('Actions')}</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => {
              const roles = u.companyRoles ?? [];
              return (
                <TableRow key={u.userId}>
                  <TableCell>
                    {nameOf(u)} {u.origin === 'WordPress' && <WordPressBadge />}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    {u.companyId == null ? (
                      <Badge color="warning" appearance="outline">{t('No company')}</Badge>
                    ) : (
                      <>
                        {u.companyName} {u.companyEnabled === false && <Badge color="danger" appearance="outline">{t('Disabled')}</Badge>}
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={styles.roles}>
                      {roles.length === 0 ? (
                        <Badge color="warning" appearance="outline">{t('No role')}</Badge>
                      ) : (
                        roles.map((r) => <Badge key={r} appearance="tint">{r === 'Admin' ? t('Administrator') : t('Reader')}</Badge>)
                      )}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge color={u.enabled ? 'success' : 'danger'} appearance="tint">
                      {u.enabled ? t('Enabled') : t('Disabled')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className={styles.actions}>
                      <Button size="small" onClick={() => setMoving(u)}>{t('Change company')}</Button>
                      {u.enabled ? (
                        <Button size="small" onClick={() => setDisabling(u)}>{t('Disable')}</Button>
                      ) : (
                        <Button
                          size="small"
                          onClick={() => setEnabled.mutate({ userId: u.userId!, enabled: true }, { onSuccess: () => toast.success(t('The person was enabled')) })}
                        >
                          {t('Enable')}
                        </Button>
                      )}
                      <Button size="small" onClick={() => setRemoving(u)}>{t('Remove')}</Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {users.data && total > PAGE_SIZE && (
        <div className={styles.pager}>
          <Button disabled={filters.skip === 0} onClick={() => setFilters((f) => ({ ...f, skip: Math.max(0, f.skip - PAGE_SIZE) }))}>
            {t('Previous')}
          </Button>
          <Text>{t('{0}-{1} of {2}', filters.skip + 1, Math.min(filters.skip + PAGE_SIZE, total), total)}</Text>
          <Button disabled={filters.skip + PAGE_SIZE >= total} onClick={() => setFilters((f) => ({ ...f, skip: f.skip + PAGE_SIZE }))}>
            {t('Next')}
          </Button>
        </div>
      )}
      {(setEnabled.isError || remove.isError || removeWithoutCompany.isError) && <RefusalBar error={setEnabled.error ?? remove.error ?? removeWithoutCompany.error} />}

      <ChangeCompanyDialog user={moving} onClose={() => setMoving(null)} />

      <ConfirmDialog
        open={disabling !== null}
        title={t('Disable this person?')}
        intent="destructive"
        confirmLabel={t('Disable')}
        cancelLabel={t('Cancel')}
        busy={setEnabled.isPending}
        onCancel={() => setDisabling(null)}
        onConfirm={() => {
          const user = disabling;
          setDisabling(null);
          if (!user) return;
          void attempt((confirmLastAdmin) =>
            setEnabled.mutateAsync({ userId: user.userId!, enabled: false, confirmLastAdmin }, { onSuccess: () => toast.success(t('The person was disabled')) }),
          ).catch(() => undefined);
        }}
      >
        {t('{0} can no longer sign in. The person and their history stay; you can enable them again.', disabling ? nameOf(disabling) : '')}
      </ConfirmDialog>

      <ConfirmDialog
        open={removing !== null}
        title={t('Remove this person?')}
        intent="destructive"
        confirmLabel={t('Remove')}
        cancelLabel={t('Cancel')}
        busy={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          const user = removing;
          setRemoving(null);
          if (!user) return;
          const done = { onSuccess: () => toast.success(t('The person was removed')) };
          // A person with no company has no company page to be removed from: its own call.
          if (user.companyId == null) removeWithoutCompany.mutate(user.userId!, done);
          else remove.mutate({ companyId: user.companyId, userId: user.userId! }, done);
        }}
      >
        {removing?.companyId == null
          ? t('{0} is removed. A person with a history is deactivated instead of deleted.', removing ? nameOf(removing) : '')
          : t('{0} is removed from {1}. A person with a history is deactivated instead of deleted.', nameOf(removing), removing.companyName ?? '')}
      </ConfirmDialog>

      {dialog}
    </div>
  );
}

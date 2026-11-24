import { useState, type FormEvent } from 'react';
import { Button, Field, Input, MessageBar, MessageBarBody, Select, Subtitle1, Table, TableBody, TableCell, TableRow, Text, makeStyles, tokens } from '@fluentui/react-components';
import { Add16Regular } from '@fluentui/react-icons';
import { useAppToast } from '@/components/ToastProvider';
import { useLanguage, useT } from '@/lib/language';

const useStyles = makeStyles({
  row: { display: 'flex', gap: tokens.spacingHorizontalS, flexWrap: 'wrap', alignItems: 'flex-end' },
  grow: { flex: '1 1 220px', minWidth: '180px' },
  section: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalS },
});

export interface PendingInvitationRow {
  id?: number;
  email?: string | null;
  roleName?: string | null;
  expiresAt?: string;
}

interface InvitePanelProps {
  pending: PendingInvitationRow[] | undefined;
  /** Sends one invitation; resolves with whether the e-mail could be sent. */
  onInvite: (invitation: { email: string; roleName: 'Admin' | 'Reader'; language: 'en' | 'hu' }) => Promise<{ emailSent?: boolean }>;
  onWithdraw: (invitationId: number) => Promise<unknown>;
  disabled?: boolean;
  /** The role the form starts with: the platform administrator mostly invites a Company's first Admin, a Company Admin mostly a Reader. */
  defaultRole?: 'Admin' | 'Reader';
}

/**
 * Invite a person by e-mail, one at a time, as Admin or Reader, and see / withdraw the pending invitations. Shared by the Company Admin's "Users & Access" page and
 * the platform administrator's Company page: the API rules are the same, only the path differs. The link exists only in the e-mail, never here.
 */
export function InvitePanel({ pending, onInvite, onWithdraw, disabled, defaultRole = 'Reader' }: InvitePanelProps) {
  const t = useT();
  const styles = useStyles();
  const toast = useAppToast();
  const { language } = useLanguage();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Admin' | 'Reader'>(defaultRole);
  const [mailLanguage, setMailLanguage] = useState<'en' | 'hu'>(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await onInvite({ email: email.trim(), roleName: role, language: mailLanguage });
      if (result.emailSent) toast.success('The invitation was created and the e-mail was sent.');
      else toast.info('The invitation was created, but the e-mail could not be sent. Check the e-mail settings and send the invitation again.');
      setEmail('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async (id: number) => {
    setError(null);
    try {
      await onWithdraw(id);
      toast.success('The invitation was withdrawn.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    }
  };

  return (
    <div className={styles.section}>
      <Subtitle1 as="h3">{t('Pending invitations')}</Subtitle1>
      {pending && pending.length === 0 && <Text>{t('No pending invitations.')}</Text>}
      {pending && pending.length > 0 && (
        <Table aria-label={t('Pending invitations')} size="small">
          <TableBody>
            {pending.map((i) => (
              <TableRow key={i.id ?? i.email}>
                <TableCell>{i.email}</TableCell>
                <TableCell>{i.roleName === 'Admin' ? t('Administrator') : t('Reader')}</TableCell>
                <TableCell>{t('Valid until {0}', new Date(i.expiresAt ?? 0).toLocaleDateString(language === 'hu' ? 'hu-HU' : 'en-GB'))}</TableCell>
                <TableCell>
                  <Button size="small" onClick={() => withdraw(i.id ?? 0)}>
                    {t('Withdraw')}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Subtitle1 as="h3">{t('Invite someone')}</Subtitle1>
      <form onSubmit={submit} className={styles.row}>
        <Field label={t('E-mail address')} className={styles.grow} required>
          <Input type="email" value={email} onChange={(_, d) => setEmail(d.value)} maxLength={256} disabled={busy || disabled} />
        </Field>
        <Field label={t('Role')}>
          <Select value={role} onChange={(_, d) => setRole(d.value as 'Admin' | 'Reader')} disabled={busy || disabled}>
            <option value="Reader">{t('Reader')}</option>
            <option value="Admin">{t('Administrator')}</option>
          </Select>
        </Field>
        <Field label={t('E-mail language')}>
          <Select value={mailLanguage} onChange={(_, d) => setMailLanguage(d.value as 'en' | 'hu')} disabled={busy || disabled}>
            <option value="en">English</option>
            <option value="hu">Magyar</option>
          </Select>
        </Field>
        <Button type="submit" appearance="primary" icon={<Add16Regular />} disabled={busy || disabled || !email.trim()}>
          {t('Send invitation')}
        </Button>
      </form>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{t(error)}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}

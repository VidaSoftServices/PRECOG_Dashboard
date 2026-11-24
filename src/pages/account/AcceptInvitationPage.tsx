import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, Input, MessageBar, MessageBarBody, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useAcceptInvitation, useInvitationInfo } from '@/api/hooks/accounts';
import { setLanguage, useT } from '@/lib/language';
import { parseLinkFragment, withoutFragment } from '@/lib/linkToken';
import { checkNewPassword } from '@/lib/passwordRules';
import { AccountPageShell } from './AccountPageShell';

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
  facts: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalXS, padding: tokens.spacingVerticalS, background: tokens.colorNeutralBackground3, borderRadius: tokens.borderRadiusMedium },
});

/**
 * The page behind the link of an invitation e-mail (`/accept-invite#token=...&lang=hu`). The single-use token is read from the fragment once, kept in
 * this page's state only and taken out of the address bar. The person sees which Company and role the invitation is for, chooses a password and the
 * account is created; then they sign in with the e-mail address and that password.
 */
export function AcceptInvitationPage() {
  const t = useT();
  const navigate = useNavigate();
  const styles = useStyles();
  const location = useLocation();
  const [link] = useState(() => parseLinkFragment(location.hash));
  const info = useInvitationInfo();
  const accept = useAcceptInvitation();
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [localProblem, setLocalProblem] = useState<string | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (link.language) setLanguage(link.language);
    // The token must not stay in the address bar, the history or a copied address.
    window.history.replaceState(null, '', withoutFragment(location));
    if (!asked.current && link.token) {
      asked.current = true;
      info.mutate(link.token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = checkNewPassword(password, repeated, info.data?.email);
    setLocalProblem(problem);
    if (problem || !link.token) return;
    accept.mutate({ token: link.token, password, displayName: displayName.trim() || undefined });
  };

  if (accept.isSuccess) {
    return (
      <AccountPageShell title={t('Your account is ready')}>
        <MessageBar intent="success">
          <MessageBarBody>{t('You can now sign in with your e-mail address and the password you chose.')}</MessageBarBody>
        </MessageBar>
        <Button onClick={() => navigate('/login')} appearance="primary">
          {t('Go to sign in')}
        </Button>
      </AccountPageShell>
    );
  }

  if (!link.token || info.isError) {
    return (
      <AccountPageShell title={t('Accept your invitation')}>
        <MessageBar intent="error">
          <MessageBarBody>
            {t('The link is invalid or has expired.')} {t('Ask the person who invited you to send a new invitation.')}
          </MessageBarBody>
        </MessageBar>
        <Button onClick={() => navigate('/login')} appearance="secondary">
          {t('Back to sign in')}
        </Button>
      </AccountPageShell>
    );
  }

  if (!info.data) {
    return (
      <AccountPageShell title={t('Accept your invitation')}>
        <Spinner label={t('Checking the invitation…')} />
      </AccountPageShell>
    );
  }

  const invitation = info.data;
  const shownProblem = localProblem ?? (accept.error ? accept.error.message : null);

  return (
    <AccountPageShell title={t('Accept your invitation')}>
      <div className={styles.facts}>
        <Text>{t('You are invited to join {0}.', invitation.companyName)}</Text>
        <Text>
          {t('E-mail address')}: <strong>{invitation.email}</strong>
        </Text>
        <Text>
          {t('Role')}: <strong>{invitation.roleName === 'Admin' ? t('Administrator') : t('Reader')}</strong>
        </Text>
      </div>
      <form className={styles.form} onSubmit={submit}>
        <Field label={t('Your name (optional)')}>
          <Input value={displayName} onChange={(_, d) => setDisplayName(d.value)} autoComplete="name" maxLength={250} disabled={accept.isPending} />
        </Field>
        <Field label={t('Choose a password')} hint={t('At least 10 characters, with at least four different ones.')} required>
          <Input type="password" value={password} onChange={(_, d) => setPassword(d.value)} autoComplete="new-password" disabled={accept.isPending} />
        </Field>
        <Field label={t('Repeat the password')} required>
          <Input type="password" value={repeated} onChange={(_, d) => setRepeated(d.value)} autoComplete="new-password" disabled={accept.isPending} />
        </Field>
        {shownProblem && (
          <MessageBar intent="error">
            <MessageBarBody>{t(shownProblem)}</MessageBarBody>
          </MessageBar>
        )}
        <Button type="submit" appearance="primary" disabled={accept.isPending || !password || !repeated}>
          {accept.isPending ? t('Creating…') : t('Create my account')}
        </Button>
      </form>
    </AccountPageShell>
  );
}

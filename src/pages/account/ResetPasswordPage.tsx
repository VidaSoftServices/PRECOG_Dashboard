import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button, Field, Input, MessageBar, MessageBarBody, makeStyles, tokens } from '@fluentui/react-components';
import { useConfirmPasswordReset } from '@/api/hooks/accounts';
import { setLanguage, useT } from '@/lib/language';
import { parseLinkFragment, withoutFragment } from '@/lib/linkToken';
import { checkNewPassword } from '@/lib/passwordRules';
import { AccountPageShell } from './AccountPageShell';

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

/** The page behind the link of a password-reset e-mail (`/reset-password#token=...&lang=hu`): the single-use token comes from the fragment, the person chooses the new password. */
export function ResetPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const styles = useStyles();
  const location = useLocation();
  const [link] = useState(() => parseLinkFragment(location.hash));
  const confirm = useConfirmPasswordReset();
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [localProblem, setLocalProblem] = useState<string | null>(null);

  useEffect(() => {
    if (link.language) setLanguage(link.language);
    // The token must not stay in the address bar, the history or a copied address.
    window.history.replaceState(null, '', withoutFragment(location));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = checkNewPassword(password, repeated);
    setLocalProblem(problem);
    if (problem || !link.token) return;
    confirm.mutate({ token: link.token, password });
  };

  if (confirm.isSuccess) {
    return (
      <AccountPageShell title={t('Your password has been changed')}>
        <MessageBar intent="success">
          <MessageBarBody>{t('You can now sign in with the new password.')}</MessageBarBody>
        </MessageBar>
        <Button onClick={() => navigate('/login')} appearance="primary">
          {t('Go to sign in')}
        </Button>
      </AccountPageShell>
    );
  }

  if (!link.token) {
    return (
      <AccountPageShell title={t('Set a new password')}>
        <MessageBar intent="error">
          <MessageBarBody>{t('The link is invalid or has expired.')}</MessageBarBody>
        </MessageBar>
        <Button onClick={() => navigate('/forgot-password')} appearance="primary">
          {t('Ask for a new link')}
        </Button>
      </AccountPageShell>
    );
  }

  const shownProblem = localProblem ?? (confirm.error ? confirm.error.message : null);

  return (
    <AccountPageShell title={t('Set a new password')}>
      <form className={styles.form} onSubmit={submit}>
        <Field label={t('New password')} hint={t('At least 10 characters, with at least four different ones.')} required>
          <Input type="password" value={password} onChange={(_, d) => setPassword(d.value)} autoComplete="new-password" disabled={confirm.isPending} />
        </Field>
        <Field label={t('Repeat the password')} required>
          <Input type="password" value={repeated} onChange={(_, d) => setRepeated(d.value)} autoComplete="new-password" disabled={confirm.isPending} />
        </Field>
        {shownProblem && (
          <MessageBar intent="error">
            <MessageBarBody>
              {t(shownProblem)}
              {confirm.error && confirm.error.message === 'The link is invalid or has expired.' && (
                <>
                  {' '}
                  <Link to="/forgot-password">{t('Ask for a new link')}</Link>
                </>
              )}
            </MessageBarBody>
          </MessageBar>
        )}
        <Button type="submit" appearance="primary" disabled={confirm.isPending || !password || !repeated}>
          {confirm.isPending ? t('Saving…') : t('Save the new password')}
        </Button>
      </form>
    </AccountPageShell>
  );
}

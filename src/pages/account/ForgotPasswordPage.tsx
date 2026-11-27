import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Input, MessageBar, MessageBarBody, Text, makeStyles, tokens } from '@fluentui/react-components';
import { useRequestPasswordReset } from '@/api/hooks/accounts';
import { useT } from '@/lib/language';
import { AccountPageShell } from './AccountPageShell';

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

/**
 * "Forgot your password?": asks for the e-mail address and always answers the same - whether the address belongs to an account is never told, here or in
 * the API. Every enabled User with a password gets a link (a Microsoft Entra ID User keeps the password at its source).
 */
export function ForgotPasswordPage() {
  const t = useT();
  const navigate = useNavigate();
  const styles = useStyles();
  const request = useRequestPasswordReset();
  const [email, setEmail] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    request.mutate(email.trim());
  };

  if (request.isSuccess) {
    return (
      <AccountPageShell title={t('Check your e-mail')}>
        <MessageBar intent="success">
          <MessageBarBody>{t('If the address belongs to an account, a link to set a new password is on its way. It is valid for one hour.')}</MessageBarBody>
        </MessageBar>
        <Button onClick={() => navigate('/login')} appearance="primary">
          {t('Back to sign in')}
        </Button>
      </AccountPageShell>
    );
  }

  return (
    <AccountPageShell title={t('Reset your password')}>
      <Text>{t('Enter your e-mail address. If it belongs to an account, we send a link to set a new password.')}</Text>
      <form className={styles.form} onSubmit={submit}>
        <Field label={t('E-mail address')} required>
          <Input type="email" value={email} onChange={(_, d) => setEmail(d.value)} autoComplete="email" disabled={request.isPending} maxLength={256} />
        </Field>
        {request.isError && (
          <MessageBar intent="error">
            <MessageBarBody>{t(request.error.message)}</MessageBarBody>
          </MessageBar>
        )}
        <Button type="submit" appearance="primary" disabled={request.isPending || !email.trim()}>
          {request.isPending ? t('Sending…') : t('Send the link')}
        </Button>
        <Button onClick={() => navigate('/login')} appearance="subtle">
          {t('Back to sign in')}
        </Button>
      </form>
    </AccountPageShell>
  );
}

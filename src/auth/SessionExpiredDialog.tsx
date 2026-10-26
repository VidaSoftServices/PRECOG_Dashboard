import { useEffect, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
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
  Text,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useAppToast } from '@/components/ToastProvider';
import { useAuth } from './AuthContext';

const useStyles = makeStyles({
  form: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM },
});

/**
 * Shown over the current page when the access has expired (a request came back 401): the person signs in again IN PLACE, so
 * the page, its filters, a chart that is open and everything typed stay exactly as they were - nothing redirects to /login.
 *
 * Security: the password is only ever held by this field while it is being typed and is cleared as soon as the attempt
 * ends; it is never stored, and no automatic re-sign-in happens (see AuthContext). The user name is fixed to the account
 * that was signed in, so this dialog cannot be used to continue as somebody else with the first person's data on screen;
 * "Sign out" is the way to change account. The dialog cannot be dismissed any other way (a 401 means nothing works until
 * a new sign-in).
 */
export function SessionExpiredDialog() {
  const styles = useStyles();
  const toast = useAppToast();
  const queryClient = useQueryClient();
  const { sessionExpired, userName, login, loginPending, loginError, logout } = useAuth();
  const [password, setPassword] = useState('');

  // Never keep a typed password around once the dialog has closed.
  useEffect(() => {
    if (!sessionExpired) setPassword('');
  }, [sessionExpired]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!userName || password === '') return;
    try {
      await login(userName, password);
      // The queries that failed while the access was out are asked again; the page itself never went anywhere.
      void queryClient.invalidateQueries({ predicate: (query) => query.state.status === 'error' });
      toast.success('Signed in again - an action that did not go through has to be repeated.');
    } catch {
      // loginError is shown below.
    } finally {
      setPassword('');
    }
  };

  return (
    <Dialog open={sessionExpired} modalType="alert">
      <DialogSurface>
        <form onSubmit={submit}>
          <DialogBody>
            <DialogTitle>Your session has expired</DialogTitle>
            <DialogContent className={styles.form}>
              <Text>
                For your security the access expires after a while. Sign in again to continue exactly where you are - nothing on this
                page is lost. If an action did not go through, repeat it after signing in.
              </Text>
              <Field label="Username">
                <Input value={userName ?? ''} readOnly autoComplete="username" />
              </Field>
              <Field label="Password" required>
                <Input
                  type="password"
                  value={password}
                  onChange={(_, d) => setPassword(d.value)}
                  disabled={loginPending}
                  autoComplete="current-password"
                  autoFocus
                />
              </Field>
              {loginError && (
                <MessageBar intent="error">
                  <MessageBarBody>{loginError}</MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={logout} disabled={loginPending}>
                Sign out
              </Button>
              <Button appearance="primary" type="submit" disabled={loginPending || password === ''}>
                {loginPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}

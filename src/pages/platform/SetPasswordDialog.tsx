import { useState } from 'react';
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
  tokens,
} from '@fluentui/react-components';
import { useSetPlatformUserPassword, type PlatformUser } from '@/api/hooks/platform';
import { useAppToast } from '@/components/ToastProvider';
import { checkNewPassword } from '@/lib/passwordRules';
import { useT } from '@/lib/language';

/**
 * The platform administrator sets a new password for a person who cannot sign in. Typed twice, checked with the same rules as everywhere (the API checks them again),
 * held only here and dropped when the dialog closes; the administrator tells it to the person.
 */
export function SetPasswordDialog({ user, onClose }: { user: PlatformUser | null; onClose: () => void }) {
  const t = useT();
  const toast = useAppToast();
  const save = useSetPlatformUserPassword();
  const [password, setPassword] = useState('');
  const [repeated, setRepeated] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const problem =
    checkNewPassword(password, repeated, user?.email) ??
    (user?.loginName && password.trim().toLowerCase() === user.loginName.trim().toLowerCase() ? 'The password must not be your e-mail address or login name.' : null);

  const close = () => {
    setPassword('');
    setRepeated('');
    setSubmitted(false);
    save.reset();
    onClose();
  };

  const submit = () => {
    setSubmitted(true);
    if (problem || !user) return;
    save.mutate(
      { userId: user.userId!, password },
      {
        onSuccess: () => {
          toast.success(t('The new password was set'));
          close();
        },
      },
    );
  };

  return (
    <Dialog open={user !== null} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <DialogBody>
            <DialogTitle>{t('Set a new password')}</DialogTitle>
            <DialogContent>
              <Text block style={{ marginBottom: tokens.spacingVerticalS }}>
                {t('{0} signs in with the user name {1} (or the e-mail address) and the password you type here. The old password stops working at once. Tell the new password to the person in a safe way.', user?.displayName ?? user?.email ?? '', user?.loginName ?? '')}
              </Text>
              <Field label={t('New password')} hint={t('At least 10 characters, with at least four different ones.')} required>
                <Input type="password" autoComplete="new-password" value={password} onChange={(_, d) => setPassword(d.value)} />
              </Field>
              <Field
                label={t('Repeat the new password')}
                required
                validationState={submitted && problem ? 'error' : 'none'}
                validationMessage={submitted && problem ? t(problem) : undefined}
              >
                <Input type="password" autoComplete="new-password" value={repeated} onChange={(_, d) => setRepeated(d.value)} />
              </Field>
              {save.isError && !save.isPending && (
                <MessageBar intent="error" style={{ marginTop: tokens.spacingVerticalS }}>
                  <MessageBarBody>{t(save.error.message)}</MessageBarBody>
                </MessageBar>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={close} disabled={save.isPending}>
                {t('Cancel')}
              </Button>
              <Button appearance="primary" type="submit" disabled={password === '' || repeated === '' || save.isPending}>
                {t('Set password')}
              </Button>
            </DialogActions>
          </DialogBody>
        </form>
      </DialogSurface>
    </Dialog>
  );
}

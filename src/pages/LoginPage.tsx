import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import {
  Button,
  Field,
  Input,
  Text,
  Title1,
  Card,
  MessageBar,
  MessageBarBody,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { useAuth } from '@/auth/AuthContext';
import precogLogo from '@/images/Precog-Dashboard.svg';

const useStyles = makeStyles({
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: tokens.colorNeutralBackground2,
    padding: tokens.spacingVerticalXXL,
  },
  card: {
    width: '360px',
    maxWidth: '100%',
    padding: tokens.spacingVerticalXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  logo: {
    height: '48px',
    alignSelf: 'center',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
});

export function LoginPage() {
  const styles = useStyles();
  const { isAuthenticated, login, loginPending, loginError } = useAuth();
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const location = useLocation();

  if (isAuthenticated) {
    const from = (location.state as { from?: Location })?.from;
    return <Navigate to={from?.pathname ?? '/'} replace />;
  }

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    login(userName, password).catch(() => {
      // loginError is already surfaced from context state.
    });
  };

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <img src={precogLogo} alt="PRECOG" className={styles.logo} />
        <Title1 as="h1" align="center">
          Sign in
        </Title1>
        <Text align="center" style={{ color: tokens.colorNeutralForeground3 }}>
          Predictive Industrial Sentinel AI
        </Text>
        <form className={styles.form} onSubmit={handleSubmit}>
          <Field label="Username" required>
            <Input
              value={userName}
              onChange={(_, data) => setUserName(data.value)}
              disabled={loginPending}
              autoComplete="username"
            />
          </Field>
          <Field label="Password" required>
            <Input
              type="password"
              value={password}
              onChange={(_, data) => setPassword(data.value)}
              disabled={loginPending}
              autoComplete="current-password"
            />
          </Field>
          {loginError && (
            <MessageBar intent="error">
              <MessageBarBody>{loginError}</MessageBarBody>
            </MessageBar>
          )}
          <Button type="submit" appearance="primary" disabled={loginPending || !userName || !password}>
            {loginPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

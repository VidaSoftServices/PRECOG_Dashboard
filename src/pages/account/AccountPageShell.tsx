import type { ReactNode } from 'react';
import { Button, Card, Text, Title1, makeStyles, tokens } from '@fluentui/react-components';
import precogLogo from '@/images/Precog-Dashboard.svg';
import { LANGUAGES, useLanguage, useT } from '@/lib/language';

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
    width: '420px',
    maxWidth: '100%',
    padding: tokens.spacingVerticalXL,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  logo: { height: '48px', alignSelf: 'center' },
  languages: { display: 'flex', justifyContent: 'flex-end', gap: tokens.spacingHorizontalXS },
});

/**
 * The frame of the pages a person opens from an e-mail (accept an invitation, forgot / set a password): the same card as the sign-in page, and a language
 * switch, because the person has no session yet - and so no menu - and the link's own language may not be the one they read.
 */
export function AccountPageShell({ title, children }: { title: string; children: ReactNode }) {
  const styles = useStyles();
  const t = useT();
  const { language, setLanguage } = useLanguage();

  return (
    <div className={styles.page}>
      <Card className={styles.card}>
        <div className={styles.languages} role="group" aria-label={t('Language')}>
          {LANGUAGES.map((l) => (
            <Button key={l} size="small" appearance={l === language ? 'primary' : 'subtle'} onClick={() => setLanguage(l)}>
              {l === 'en' ? 'English' : 'Magyar'}
            </Button>
          ))}
        </div>
        <img src={precogLogo} alt={t('PRECOG')} className={styles.logo} />
        <Title1 as="h1" align="center">
          {title}
        </Title1>
        <Text align="center" style={{ color: tokens.colorNeutralForeground3 }}>
          {t('Predictive Industrial Sentinel AI')}
        </Text>
        {children}
      </Card>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Title2, Text, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  titles: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    flexWrap: 'wrap',
  },
});

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** 'h2' for a page's secondary PageHeader (e.g. a sub-section) so a page with more than one doesn't end up with two <h1>s. */
  level?: 'h1' | 'h2';
}

export function PageHeader({ title, description, actions, level = 'h1' }: PageHeaderProps) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      <div className={styles.titles}>
        {/* Fluent's Title2 controls visual size only - `as` is required to
            get an actual semantic heading level out of it. */}
        <Title2 as={level}>{title}</Title2>
        {description && <Text style={{ color: tokens.colorNeutralForeground3 }}>{description}</Text>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}

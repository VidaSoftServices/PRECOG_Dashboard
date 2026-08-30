import type { ReactNode } from 'react';
import { Text, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  icon: {
    fontSize: '32px',
    marginBottom: tokens.spacingVerticalXS,
  },
});

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const styles = useStyles();
  return (
    <div className={styles.root}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <Text weight="semibold" size={400}>
        {title}
      </Text>
      {description && <Text size={300}>{description}</Text>}
      {action}
    </div>
  );
}

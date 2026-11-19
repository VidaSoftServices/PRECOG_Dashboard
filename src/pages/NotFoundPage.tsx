import { Link } from 'react-router-dom';
import { Button } from '@fluentui/react-components';
import { EmptyState } from '@/components/states/EmptyState';
import { useT } from '@/lib/language';

export function NotFoundPage() {
  const t = useT();
  return (
    <EmptyState
      title={t('Page not found')}
      description={t('The page you\'re looking for doesn\'t exist.')}
      action={
        <Button as="a" appearance="primary">
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            {t('Back to Overview')}</Link>
        </Button>
      }
    />
  );
}

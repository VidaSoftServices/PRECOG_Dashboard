import { Link } from 'react-router-dom';
import { Button } from '@fluentui/react-components';
import { EmptyState } from '@/components/states/EmptyState';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you're looking for doesn't exist."
      action={
        <Button as="a" appearance="primary">
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}>
            Back to Overview
          </Link>
        </Button>
      }
    />
  );
}

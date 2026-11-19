import { Button, MessageBar, MessageBarBody, MessageBarTitle, MessageBarActions } from '@fluentui/react-components';
import { ApiError } from '@/api/client';
import { useT } from '@/lib/language';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
}

/** Renders an ApiError (or any thrown error) using the normalized message from src/api/errors.ts - never a raw stack trace or a guessed ProblemDetails field. */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const t = useT();
  const message = error instanceof Error ? error.message : t('Something went wrong.');
  const isRetryable = !(error instanceof ApiError) || ![401, 403, 404].includes(error.status);

  return (
    <MessageBar intent="error">
      <MessageBarBody>
        <MessageBarTitle>{t('Couldn\'t load this')}</MessageBarTitle>
        {message}
      </MessageBarBody>
      {onRetry && isRetryable && (
        <MessageBarActions>
          <Button appearance="secondary" size="small" onClick={onRetry}>
            {t('Retry')}</Button>
        </MessageBarActions>
      )}
    </MessageBar>
  );
}

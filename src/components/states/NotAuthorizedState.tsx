import { LockClosed24Regular } from '@fluentui/react-icons';
import { EmptyState } from './EmptyState';

interface NotAuthorizedStateProps {
  /** e.g. "This Device" - kept vague enough that a Reader can't infer existence of something they weren't granted (matches the API's own 404-not-403 pattern for Reader Device access). */
  subject?: string;
}

export function NotAuthorizedState({ subject = 'This' }: NotAuthorizedStateProps) {
  return (
    <EmptyState
      icon={<LockClosed24Regular />}
      title={`${subject} isn't available to you`}
      description="You may not have been granted access, or it may not exist. Contact an Admin if you believe this is a mistake."
    />
  );
}

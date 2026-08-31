import { Building24Regular } from '@fluentui/react-icons';
import { EmptyState } from './EmptyState';

/**
 * A valid, authenticated human User can still have no resolvable authorized
 * Company (CurrentUserDto.hasAuthorizedCompany: false - e.g. a WordPress
 * account not yet linked into the Company/RBAC model). Every Company-scoped
 * endpoint rejects this caller with 401 regardless, and this app's global
 * 401 handler tears the session down and redirects to /login - which would
 * otherwise silently boot a correctly-authenticated User back to the login
 * form with no explanation, and they'd just land right back here after
 * signing in again. AppShell renders this instead of any route's content
 * for exactly this state, so no page ever gets the chance to fire a
 * Company-scoped query that would trigger that loop.
 */
export function NoCompanyState() {
  return (
    <EmptyState
      icon={<Building24Regular />}
      title="No Company assigned to your account yet"
      description="Your sign-in is valid, but your account isn't linked to a Company in PRECOG yet. Contact your administrator to get access - there's nothing to configure here in the meantime."
    />
  );
}

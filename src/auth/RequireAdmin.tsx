import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { NotAuthorizedState } from '@/components/states/NotAuthorizedState';

/**
 * Authorization guard for Admin-only routes. Renders an in-page 403 state
 * rather than redirecting - matches the backend's own explicit Forbid()
 * behavior for Admin-only actions (as opposed to the 404-disguised-as-403
 * pattern it uses for Reader Device access, which route-level guards can't
 * replicate without knowing the specific Device first - see per-page guards).
 */
export function RequireAdmin() {
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return <NotAuthorizedState subject="This section" />;
  }

  return <Outlet />;
}

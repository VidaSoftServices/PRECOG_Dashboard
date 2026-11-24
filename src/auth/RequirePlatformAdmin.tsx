import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { NotAuthorizedState } from '@/components/states/NotAuthorizedState';

/** Guard for the platform administrator's (VSSSysAdmin) pages: any other account gets the in-page 403, as for the Admin-only pages. */
export function RequirePlatformAdmin() {
  const { isPlatformAdmin } = useAuth();

  if (!isPlatformAdmin) {
    return <NotAuthorizedState subject="This section" />;
  }

  return <Outlet />;
}

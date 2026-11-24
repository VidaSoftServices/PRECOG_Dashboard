import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingState } from '@/components/states/LoadingState';
import { useT } from '@/lib/language';

/** Auth guard: no session -> /login, preserving the attempted route so login can return the user to it. */
export function RequireAuth() {
  const { isAuthenticated, restoring } = useAuth();
  const location = useLocation();
  const t = useT();

  // A page load checks the browser session first: no flash of the sign-in form for a person who stays signed in.
  if (!isAuthenticated && restoring) return <LoadingState label={t('Signing in…')} />;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

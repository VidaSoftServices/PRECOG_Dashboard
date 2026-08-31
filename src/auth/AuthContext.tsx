import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { apiClient, unwrap } from '@/api/client';
import type { HmacKeyResponse } from '@/api/domainTypes';
import type { components } from '@/api/schema.generated';
import * as authStore from './authStore';

export type CurrentUser = components['schemas']['CurrentUserDto'];

/**
 * Human tokens are ~900s in the API's Release configuration (see the
 * modernization audit's cross-cutting section). The login response itself
 * doesn't report an expiry (D1) - there is no refresh-token endpoint, and
 * deliberately no silent-re-auth loop here (the old dashboard kept the
 * plaintext password resident in memory for exactly that purpose; this
 * rewrite does not). A 401 from ANY call, anywhere, tears the session down
 * and the router sends the user back to /login - see RequireAuth.tsx.
 */
const ASSUMED_TOKEN_LIFETIME_SECONDS = 900;

interface AuthContextValue {
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** False only once userDetails has actually loaded and confirmed no authorized Company - never true-by-default during the initial fetch, so a Company-having User never sees a false flash of the no-Company state. */
  hasAuthorizedCompany: boolean;
  userDetails: CurrentUser | null;
  loginPending: boolean;
  loginError: string | null;
  login: (userName: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const [userDetails, setUserDetails] = useState<CurrentUser | null>(null);
  const [loginPending, setLoginPending] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const fetchUserDetails = useCallback(async () => {
    const result = await apiClient.GET('/api/User/GetUserDetails');
    setUserDetails(unwrap(result));
  }, []);

  useEffect(() => {
    if (session) {
      fetchUserDetails().catch(() => {
        // A 401 here already triggers authStore.notifyUnauthorized() via the
        // client middleware, which clears the session and re-renders below.
      });
    } else {
      setUserDetails(null);
    }
  }, [session, fetchUserDetails]);

  const login = useCallback(async (userName: string, password: string) => {
    setLoginPending(true);
    setLoginError(null);
    try {
      const result = await apiClient.POST('/api/Authentication/Request_HMAC_Key', {
        body: { userName, password },
      });
      // D1: response has no schema in swagger.json - confirmed shape from source.
      const { _HMAC_Key } = unwrap(result) as unknown as HmacKeyResponse;
      authStore.setSession({
        token: _HMAC_Key,
        principalType: 'User',
        expiresAt: new Date(Date.now() + ASSUMED_TOKEN_LIFETIME_SECONDS * 1000).toISOString(),
      });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed.');
      throw err;
    } finally {
      setLoginPending(false);
    }
  }, []);

  const logout = useCallback(() => {
    authStore.clearSession();
  }, []);

  useEffect(() => authStore.onUnauthorized(() => setUserDetails(null)), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: session !== null,
      isAdmin: userDetails?.isCompanyAdmin ?? false,
      // true (not false) while userDetails is still loading, so a normal
      // Company-having User never sees a flash of the no-Company state -
      // only an actually-confirmed false response ever gates it off.
      hasAuthorizedCompany: userDetails === null ? true : (userDetails.hasAuthorizedCompany ?? true),
      userDetails,
      loginPending,
      loginError,
      login,
      logout,
    }),
    [session, userDetails, loginPending, loginError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

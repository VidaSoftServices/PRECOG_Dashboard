import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { apiClient, unwrap } from '@/api/client';
import type { HmacKeyResponse } from '@/api/domainTypes';
import { queryClient } from '@/api/queryClient';
import type { components } from '@/api/schema.generated';
import * as authStore from './authStore';
import { loadLoginPage } from './loadLoginPage';
import { endSession, refreshSession, REFRESH_AHEAD_MS, type RefreshedKey } from './browserSession';

export type CurrentUser = components['schemas']['CurrentUserDto'];

/**
 * Human tokens are ~900s in the API's Release configuration. The login response itself doesn't report an expiry (D1).
 *
 * Stay signed in until sign-out (docs/features/session-expiry.md): the sign-in also starts a browser session on the API (a rotated refresh token in an
 * HttpOnly cookie that this code never sees, see browserSession.ts). The 15-minute key in memory is renewed from it a minute before it ends, after a
 * page load (so a reload does not ask for the password), and when a request comes back 401. Only when the session itself has ended (sign-out elsewhere,
 * 7 days, 8 hours without use, disabled account, new password) does SessionExpiredDialog ask for the password over the current page. The password is
 * never kept anywhere (the old dashboard kept it in memory for a silent re-sign-in; this one does not).
 */
const ASSUMED_TOKEN_LIFETIME_SECONDS = 900;

interface AuthContextValue {
  isAuthenticated: boolean;
  isAdmin: boolean;
  /** The platform administrator (VSSSysAdmin): no Company, it only creates Companies, invites their first Admin and grants or revokes roles. */
  isPlatformAdmin: boolean;
  /** False only once userDetails has actually loaded and confirmed no authorized Company - never true-by-default during the initial fetch, so a Company-having User never sees a false flash of the no-Company state. */
  hasAuthorizedCompany: boolean;
  /** False when the User belongs to a Company but holds neither the Admin nor the Reader role: it sees nothing but its own profile. True while the details load. */
  hasRole: boolean;
  /** True when the User's Company was disabled by the platform administrator. */
  companyDisabled: boolean;
  userDetails: CurrentUser | null;
  /** The access expired and the browser session could not renew it: sign in again in place; the page and its state stay. */
  sessionExpired: boolean;
  /** True while a page load checks for a browser session (the routes wait instead of showing the sign-in form). */
  restoring: boolean;
  /** The user name of the current sign-in (not a secret), so the re-sign-in dialog can only continue as the same account. */
  userName: string | null;
  loginPending: boolean;
  loginError: string | null;
  login: (userName: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const reauthRequired = useSyncExternalStore(authStore.subscribe, authStore.isReauthRequired);
  const [userName, setUserName] = useState<string | null>(null);
  // A page load with no key in memory first asks the session cookie for one; a session that was set before (tests, a sign-in in flight) is kept.
  const [restoring, setRestoring] = useState(() => authStore.getSession() === null);
  const [recovering, setRecovering] = useState(false);
  const signedOut = useRef(false);

  const applyKey = useCallback((refreshed: RefreshedKey) => {
    authStore.setSession({
      token: refreshed.key,
      principalType: 'User',
      expiresAt: new Date(Date.now() + ASSUMED_TOKEN_LIFETIME_SECONDS * 1000).toISOString(),
    });
    if (refreshed.userName) setUserName(refreshed.userName);
  }, []);

  // A page load: a valid session cookie signs the person in again without the password.
  useEffect(() => {
    if (!restoring) return;
    let alive = true;
    void refreshSession().then((refreshed) => {
      if (!alive) return;
      if (refreshed && authStore.getSession() === null && !signedOut.current) applyKey(refreshed);
      setRestoring(false);
    });
    return () => {
      alive = false;
    };
  }, [restoring, applyKey]);

  // The key is renewed a minute before it ends (a background tab may run the timer late: then the 401 below renews it).
  useEffect(() => {
    if (!session || session.principalType !== 'User') return;
    const due = new Date(session.expiresAt).getTime() - Date.now() - REFRESH_AHEAD_MS;
    const timer = setTimeout(() => {
      void refreshSession().then((refreshed) => {
        if (refreshed && authStore.getSession() === session && !signedOut.current) applyKey(refreshed);
      });
    }, Math.max(due, 1_000));
    return () => clearTimeout(timer);
  }, [session, applyKey]);

  // A 401: renew from the session first; the sign-in dialog appears only when that is not possible any more.
  useEffect(
    () =>
      authStore.onUnauthorized(() => {
        setRecovering(true);
        void refreshSession()
          .then((refreshed) => {
            if (!refreshed || signedOut.current) return;
            applyKey(refreshed);
            void queryClient.invalidateQueries({ predicate: (query) => query.state.status === 'error' });
          })
          .finally(() => setRecovering(false));
      }),
    [applyKey],
  );
  const sessionExpired = reauthRequired && !recovering;
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
        // startSession: the API also sets the HttpOnly session cookie (stay signed in until sign-out); credentials: the browser keeps it.
        body: { userName, password, startSession: true },
        credentials: 'include',
      });
      // D1: response has no schema in swagger.json - confirmed shape from source.
      const { _HMAC_Key } = unwrap(result) as unknown as HmacKeyResponse;
      authStore.setSession({
        token: _HMAC_Key,
        principalType: 'User',
        expiresAt: new Date(Date.now() + ASSUMED_TOKEN_LIFETIME_SECONDS * 1000).toISOString(),
      });
      setUserName(userName);
      signedOut.current = false;
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed.');
      throw err;
    } finally {
      setLoginPending(false);
    }
  }, []);

  const logout = useCallback(() => {
    signedOut.current = true;
    authStore.clearSession();
    setUserName(null);
    setUserDetails(null);
    // Nothing of this person may survive into the next sign-in: the query cache (Devices, Sensors, Issues, ...), the per-server routing and the
    // selected Device are module- or tree-level memory, and the login page returns to the page that was open. The browser session is ended on
    // the API first (the cookie would otherwise sign the next page load in again), then a full page load of /login starts from a clean slate.
    queryClient.clear();
    void endSession().finally(loadLoginPage);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: session !== null,
      isAdmin: userDetails?.isCompanyAdmin ?? false,
      isPlatformAdmin: userDetails?.isPlatformAdmin ?? false,
      // true (not false) while userDetails is still loading, so a normal
      // Company-having User never sees a flash of the no-Company state -
      // only an actually-confirmed false response ever gates it off.
      hasAuthorizedCompany: userDetails === null ? true : (userDetails.hasAuthorizedCompany ?? true),
      hasRole: userDetails === null ? true : (userDetails.hasRole ?? true),
      companyDisabled: userDetails?.companyDisabled ?? false,
      userDetails,
      sessionExpired,
      restoring,
      userName,
      loginPending,
      loginError,
      login,
      logout,
    }),
    [session, userDetails, sessionExpired, restoring, userName, loginPending, loginError, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}

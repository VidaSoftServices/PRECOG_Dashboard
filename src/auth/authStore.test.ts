import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as authStore from './authStore';

describe('authStore', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('starts with no session', () => {
    expect(authStore.getSession()).toBeNull();
    expect(authStore.getToken()).toBeNull();
    expect(authStore.isExpired()).toBe(true);
  });

  it('setSession makes the token and session available', () => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(authStore.getToken()).toBe('abc');
    expect(authStore.isExpired()).toBe(false);
  });

  it('isExpired is true once the expiry timestamp has passed', () => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(authStore.isExpired()).toBe(true);
  });

  it('clearSession removes the token', () => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    authStore.clearSession();
    expect(authStore.getToken()).toBeNull();
  });

  it('notifies subscribers on session change', () => {
    const listener = vi.fn();
    const unsubscribe = authStore.subscribe(listener);
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('notifyUnauthorized while signed in keeps the session but marks the access as expired, once, and stops sending the refused token', () => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const listener = vi.fn();
    const unsubscribe = authStore.onUnauthorized(listener);
    authStore.notifyUnauthorized();
    authStore.notifyUnauthorized(); // already waiting for the new sign-in
    expect(authStore.isReauthRequired()).toBe(true);
    expect(authStore.getSession()).not.toBeNull(); // nobody is signed out or redirected
    expect(authStore.getToken()).toBeNull(); // the refused token is not sent again
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('a new sign-in ends the expired state; sign-out clears it together with the session', () => {
    authStore.setSession({ token: 'old', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    authStore.notifyUnauthorized();
    authStore.setSession({ token: 'new', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(authStore.isReauthRequired()).toBe(false);
    expect(authStore.getToken()).toBe('new');

    authStore.notifyUnauthorized();
    authStore.clearSession();
    expect(authStore.isReauthRequired()).toBe(false);
    expect(authStore.getSession()).toBeNull();
  });

  it('a 401 with no session (a wrong password on the login form) does nothing', () => {
    const listener = vi.fn();
    const unsubscribe = authStore.onUnauthorized(listener);
    authStore.notifyUnauthorized();
    expect(authStore.isReauthRequired()).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
});

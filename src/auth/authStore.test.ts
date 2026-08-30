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

  it('notifyUnauthorized clears the session and fires onUnauthorized listeners exactly once', () => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    const listener = vi.fn();
    const unsubscribe = authStore.onUnauthorized(listener);
    authStore.notifyUnauthorized();
    expect(authStore.getToken()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

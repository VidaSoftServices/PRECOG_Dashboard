/** Loads /login as a fresh page (not a client-side navigation), so no in-memory state of the previous sign-in survives. A seam of its own so tests can observe it. */
export function loadLoginPage(): void {
  window.location.replace('/login');
}

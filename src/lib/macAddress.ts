/**
 * Cheap client-side shape check only (12 hex digits once the usual separators
 * are stripped) so an obviously mistyped MAC address is flagged before a round
 * trip. The server remains the only authority - it additionally rejects the
 * all-zero, broadcast and multicast addresses and normalizes the notation.
 */
export function looksLikeMacAddress(value: string): boolean {
  return /^[0-9a-f]{12}$/i.test(value.trim().replace(/[:.-]/g, ''));
}

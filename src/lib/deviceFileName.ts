/**
 * The Device part of a downloaded file's name: the number and the Device's NAME, which is what the person knows the Device by - e.g. "device-1-Test_Device",
 * "device-2-KS4". Letters (also accented ones), digits, ".", "_" and "-" stay; anything else becomes "_" (at most 60 characters kept). Without a name only
 * the number is used (the callers give the Device ID as the fall-back of an unnamed Device).
 */
export function deviceFilePart(deviceId: number, deviceName?: string | null): string {
  const tag = (deviceName ?? '')
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 60);
  return tag ? `device-${deviceId}-${tag}` : `device-${deviceId}`;
}

/**
 * The Device part of a downloaded file's name: the number and the Device ID (externalDeviceId) the person knows the Device by, e.g. "device-2-KS4".
 * Characters a file name cannot safely hold become "_" (at most 60 kept); without a Device ID only the number is used.
 */
export function deviceFilePart(deviceId: number, externalDeviceId?: string | null): string {
  const tag = (externalDeviceId ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[_.]+|[_.]+$/g, '')
    .slice(0, 60);
  return tag ? `device-${deviceId}-${tag}` : `device-${deviceId}`;
}

/** The form of a registered server (every field is text, as typed) and its checks - the same rules the API applies again (a client check only saves a round trip). */
export interface ServerFormValues {
  name: string;
  address: string;
  port: string;
  useTls: boolean;
  enabled: boolean;
  deviceIdFrom: string;
  deviceIdTo: string;
  notes: string;
}

const DNS_NAME = /^(?=.{1,253}$)[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9a-fA-F:.]+$/;

/** A host name, DNS name, IPv4 or IPv6 address - no scheme, port, path, user info, brackets or white space. */
export function isValidServerAddress(input: string): boolean {
  const value = input.trim();
  if (value.length === 0 || value.length > 255) return false;
  if (/[\s/\\?#@[\]%]/.test(value)) return false;
  if (value.includes(':')) return IPV6.test(value) && value.split(':').length >= 3;
  if (/^[\d.]+$/.test(value)) return IPV4.test(value);
  return DNS_NAME.test(value);
}

const isWhole = (text: string, min: number, max: number) => /^\d+$/.test(text) && Number(text) >= min && Number(text) <= max;

/** The problems of a form, keyed by field; each value is an English text to pass through t(). Empty when the form is fine. */
export function checkServerForm(form: ServerFormValues): Partial<Record<keyof ServerFormValues, string>> {
  const problems: Partial<Record<keyof ServerFormValues, string>> = {};
  const name = form.name.trim();
  if (name.length === 0 || name.length > 200) problems.name = 'The name is required and at most 200 characters.';
  if (!isValidServerAddress(form.address)) problems.address = 'The address must be a host name, DNS name, IPv4 or IPv6 address, without scheme, port or path.';
  const port = form.port.trim();
  if (port !== '' && !isWhole(port, 1, 65535)) problems.port = 'The port must be between 1 and 65535.';
  const from = form.deviceIdFrom.trim();
  const to = form.deviceIdTo.trim();
  if (from !== '' || to !== '') {
    if (from === '' || !isWhole(from, 1, 32767)) problems.deviceIdFrom = 'The Device id range needs both ends, between 1 and 32767, the first not above the last.';
    else if (to === '' || !isWhole(to, 1, 32767) || Number(from) > Number(to)) problems.deviceIdTo = 'The Device id range needs both ends, between 1 and 32767, the first not above the last.';
  }
  if (form.notes.length > 1000) problems.notes = 'The notes are at most 1000 characters.';
  return problems;
}

/** The address a person would open, for display: scheme from the TLS flag, the port only when given. */
export function serverUrl(server: { address: string; port?: number | null; useTls: boolean }): string {
  return `${server.useTls ? 'https' : 'http'}://${server.address.includes(':') ? `[${server.address}]` : server.address}${server.port ? `:${server.port}` : ''}`;
}

/** The API's own refusals are English texts, some with a name or numbers in the middle; this puts them through t() with their values in the Hungarian order. */
export function translateServerError(message: string, t: (text: string, ...args: unknown[]) => string): string {
  const overlap = /^The Device id range overlaps the range of the server (.+) \((\d+)-(\d+)\)\.$/.exec(message);
  if (overlap) return t('The Device id range overlaps the range of the server {0} ({1}-{2}).', overlap[1], overlap[2], overlap[3]);
  const outside = /^Device (\d+) is outside the Device id range of this server \((\d+)-(\d+)\)\.$/.exec(message);
  if (outside) return t('Device {0} is outside the Device id range of this server ({1}-{2}).', outside[1], outside[2], outside[3]);
  const atMost = /^A Company can have at most (\d+) servers\.$/.exec(message);
  if (atMost) return t('A Company can have at most {0} servers.', atMost[1]);
  return t(message);
}

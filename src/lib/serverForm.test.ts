import { describe, it, expect } from 'vitest';
import { checkServerForm, isValidServerAddress, serverUrl, translateServerError, type ServerFormValues } from './serverForm';
import { translate } from './language';

const OK: ServerFormValues = { name: 'Plant A', address: 'plant-a.example.test', port: '', useTls: true, enabled: true, deviceIdFrom: '', deviceIdTo: '', notes: '' };

describe('isValidServerAddress', () => {
  it.each(['plant-a.example.test', ' Plant-A.Example.TEST ', 'precog-server', '192.168.1.20', 'fd00::1', '2001:db8::2'])('accepts %s', (a) => {
    expect(isValidServerAddress(a)).toBe(true);
  });

  it.each(['', '   ', 'https://plant-a.example.test', 'plant-a.example.test:8443', 'plant-a.example.test/path', 'user@plant-a.example.test', 'plant a.example.test', '[fd00::1]', '999.1.1.1', '1.2.3', '-bad.example.test', 'bad_name.example.test', 'a..b', 'fd00:zz::1'])(
    'refuses "%s"',
    (a) => {
      expect(isValidServerAddress(a)).toBe(false);
    },
  );
});

describe('checkServerForm', () => {
  it('accepts a minimal form and one with port, range and notes', () => {
    expect(checkServerForm(OK)).toEqual({});
    expect(checkServerForm({ ...OK, port: '8443', deviceIdFrom: '1000', deviceIdTo: '1999', notes: 'LAN of plant A' })).toEqual({});
  });

  it('names the field that is wrong', () => {
    expect(Object.keys(checkServerForm({ ...OK, name: '  ' }))).toEqual(['name']);
    expect(Object.keys(checkServerForm({ ...OK, address: 'https://x.example.test' }))).toEqual(['address']);
    expect(Object.keys(checkServerForm({ ...OK, port: '70000' }))).toEqual(['port']);
    expect(Object.keys(checkServerForm({ ...OK, port: 'abc' }))).toEqual(['port']);
    expect(Object.keys(checkServerForm({ ...OK, notes: 'n'.repeat(1001) }))).toEqual(['notes']);
  });

  it('wants both ends of the range, inside 1..32767, the first not above the last', () => {
    expect(checkServerForm({ ...OK, deviceIdFrom: '5' }).deviceIdTo).toBeDefined();
    expect(checkServerForm({ ...OK, deviceIdTo: '5' }).deviceIdFrom).toBeDefined();
    expect(checkServerForm({ ...OK, deviceIdFrom: '0', deviceIdTo: '5' }).deviceIdFrom).toBeDefined();
    expect(checkServerForm({ ...OK, deviceIdFrom: '10', deviceIdTo: '9' }).deviceIdTo).toBeDefined();
    expect(checkServerForm({ ...OK, deviceIdFrom: '1', deviceIdTo: '32768' }).deviceIdTo).toBeDefined();
    expect(checkServerForm({ ...OK, deviceIdFrom: '1', deviceIdTo: '32767' })).toEqual({});
  });
});

describe('serverUrl', () => {
  it('shows the scheme from the TLS flag, brackets an IPv6 address and the port only when given', () => {
    expect(serverUrl({ address: 'a.example.test', useTls: true })).toBe('https://a.example.test');
    expect(serverUrl({ address: '192.168.1.20', port: 8080, useTls: false })).toBe('http://192.168.1.20:8080');
    expect(serverUrl({ address: 'fd00::1', port: 443, useTls: true })).toBe('https://[fd00::1]:443');
  });
});

describe('translateServerError', () => {
  const hu = (text: string, ...args: unknown[]) => translate(text, 'hu', args);

  it('translates the refusals that carry a name or numbers, in Hungarian order', () => {
    expect(translateServerError('The Device id range overlaps the range of the server Plant A (1000-1999).', hu)).toBe(
      'Az eszközazonosító-tartomány átfed a(z) Plant A szerver tartományával (1000–1999).',
    );
    expect(translateServerError('Device 7 is outside the Device id range of this server (1000-1999).', hu)).toBe(
      'A(z) 7. eszköz a szerver eszközazonosító-tartományán (1000–1999) kívül esik.',
    );
    expect(translateServerError('A Company can have at most 10000 servers.', hu)).toBe('Egy cégnek legfeljebb 10000 szervere lehet.');
  });

  it('translates a fixed refusal and passes an unknown text through unchanged', () => {
    expect(translateServerError('A server with this name already exists.', hu)).toBe('Már van ilyen nevű szerver.');
    expect(translateServerError('Something unexpected', hu)).toBe('Something unexpected');
  });
});

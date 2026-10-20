import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { DevicePrincipalPage } from './DevicePrincipalPage';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

/**
 * Largest id the dashboard can hold exactly: the generated type is `number` and the HTTP client uses JSON.parse, so an
 * int64 id is exact only up to Number.MAX_SAFE_INTEGER = 2^53 - 1 (9007199254740991). Real DevicePrincipal ids are small
 * identity values; this test pins the boundary.
 */
const LARGEST_EXACT_ID = '9007199254740991';

const SECRET = 'S3cret-value-shown-once';

/** Raw JSON text, so an id can be written exactly as the API would put it on the wire. */
const json = (text: string, status = 200) => new Response(text, { status, headers: { 'content-type': 'application/json' } });

interface Api {
  /** Raw JSON of GET .../Principal, or null for "not provisioned yet" (404). */
  principal: string | null;
  /** Raw JSON of POST .../Provision and .../Rotate. */
  issued?: string;
}

function mockApi(api: Api) {
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path.endsWith('/Principal')) {
      return api.principal === null ? new Response('Not found', { status: 404 }) : json(api.principal);
    }
    if (request.method === 'POST' && (path.endsWith('/Principal/Provision') || path.endsWith('/Principal/Rotate'))) return json(api.issued ?? '{}', 200);
    return new Response('unexpected', { status: 500 });
  });
}

const principalJson = (principalId: string, deviceId = 4) =>
  `{"principalId":${principalId},"deviceId":${deviceId},"enabled":true,"lastSeenAt":null,"credentials":[{"credentialId":9,"createdAt":"2026-01-01T00:00:00Z","lastUsedAt":null,"revokedAt":null}]}`;

const issuedJson = (principalId: string) => `{"principalId":${principalId},"credentialId":9,"secret":"${SECRET}","createdAt":"2026-01-01T00:00:00Z"}`;

function renderPage(deviceId = 4) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <MemoryRouter initialEntries={[`/devices/${deviceId}/principal`]}>
            <Routes>
              <Route path="/devices/:deviceId/principal" element={<DevicePrincipalPage />} />
            </Routes>
          </MemoryRouter>
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const valueOf = (el: HTMLElement) => (el as HTMLInputElement).value;

// Fluent dialogs are slow to mount under a loaded full-suite run; the default 5 s is too tight.
describe('DevicePrincipalPage ids', { timeout: 20_000 }, () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('shows the Principal ID and the Device ID permanently when a principal exists, as plain digits', async () => {
    mockApi({ principal: principalJson('1234567', 4) });
    renderPage(4);

    const principalId = await screen.findByRole('textbox', { name: 'Principal ID' });
    expect(valueOf(principalId)).toBe('1234567'); // no thousands separators, no locale formatting
    expect(valueOf(screen.getByRole('textbox', { name: 'Device ID' }))).toBe('4');
    expect(screen.getByRole('button', { name: 'Copy Principal ID' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Device ID' })).toBeInTheDocument();
    // The Secret does not exist on this page - only after Provision / Rotate.
    expect(screen.queryByText(SECRET)).not.toBeInTheDocument();
  });

  it('copies the Principal ID unchanged', async () => {
    mockApi({ principal: principalJson('1234567') });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Copy Principal ID' }));

    expect(await navigator.clipboard.readText()).toBe('1234567');
    expect(screen.getByRole('button', { name: 'Copy Principal ID' })).toHaveTextContent('Copied');
  });

  it('shows and copies the largest exactly representable id unchanged', async () => {
    mockApi({ principal: principalJson(LARGEST_EXACT_ID) });
    const user = userEvent.setup();
    renderPage();

    expect(valueOf(await screen.findByRole('textbox', { name: 'Principal ID' }))).toBe(LARGEST_EXACT_ID);
    await user.click(screen.getByRole('button', { name: 'Copy Principal ID' }));
    expect(await navigator.clipboard.readText()).toBe(LARGEST_EXACT_ID);
  });

  it('never shows an id beyond 2^53 - 1: JSON parsing has already rounded it, so it says so instead of showing a wrong id', async () => {
    mockApi({ principal: principalJson('9007199254740993') }); // parsed by the client as 9007199254740992
    renderPage();

    expect(await screen.findByText(/larger than 9007199254740991/)).toBeInTheDocument();
    expect(valueOf(screen.getByRole('textbox', { name: 'Principal ID' }))).toBe('');
    expect(screen.queryByText('9007199254740992')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy Principal ID' })).not.toBeInTheDocument();
  });

  it('does not break when no principal is provisioned yet: no ids, the provision action is offered', async () => {
    mockApi({ principal: null });
    renderPage();

    expect(await screen.findByText('Not provisioned')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Provision access' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Principal ID' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Device ID' })).not.toBeInTheDocument();
  });

  it('after Provision, the one-time dialog shows the Secret together with the Principal ID and the Device ID, each with its own Copy', async () => {
    mockApi({ principal: null, issued: issuedJson('42') });
    const user = userEvent.setup();
    renderPage(4);

    await user.click(await screen.findByRole('button', { name: 'Provision access' }));

    // The dialog is looked up without its accessible name: under load Tabster marks it aria-hidden and the name
    // (aria-labelledby the title) is then not computed - the title is asserted as text instead.
    const dialog = await screen.findByRole('dialog', { hidden: true }, { timeout: 10_000 });
    expect(within(dialog).getByText('Device credential issued')).toBeInTheDocument();
    expect(within(dialog).getByText('This is shown exactly once')).toBeInTheDocument();
    expect(valueOf(within(dialog).getByRole('textbox', { name: 'Secret', hidden: true }))).toBe(SECRET);
    expect(valueOf(within(dialog).getByRole('textbox', { name: 'Principal ID', hidden: true }))).toBe('42');
    expect(valueOf(within(dialog).getByRole('textbox', { name: 'Device ID', hidden: true }))).toBe('4');

    // The ids are not secret, and the dialog says the Principal ID survives rotation - it never calls it a secret.
    expect(within(dialog).getByText(/Not a secret/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Copy Principal ID', hidden: true }));
    expect(await navigator.clipboard.readText()).toBe('42');
    await user.click(within(dialog).getByRole('button', { name: 'Copy Device ID', hidden: true }));
    expect(await navigator.clipboard.readText()).toBe('4');
    await user.click(within(dialog).getByRole('button', { name: 'Copy Secret', hidden: true }));
    expect(await navigator.clipboard.readText()).toBe(SECRET);
  });

  it('after Rotate, the dialog shows the same fields', async () => {
    mockApi({ principal: principalJson('42'), issued: issuedJson('42') });
    const user = userEvent.setup();
    renderPage(4);

    await user.click(await screen.findByRole('button', { name: 'Rotate credential' }));

    const dialog = await screen.findByRole('dialog', { hidden: true }, { timeout: 10_000 });
    expect(valueOf(within(dialog).getByRole('textbox', { name: 'Secret', hidden: true }))).toBe(SECRET);
    expect(valueOf(within(dialog).getByRole('textbox', { name: 'Principal ID', hidden: true }))).toBe('42');
    expect(valueOf(within(dialog).getByRole('textbox', { name: 'Device ID', hidden: true }))).toBe('4');
  });

  it('the Secret is gone from the page once the dialog is closed, and is never written to browser storage', async () => {
    mockApi({ principal: null, issued: issuedJson('42') });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Provision access' }));
    const dialog = await screen.findByRole('dialog', { hidden: true }, { timeout: 10_000 });
    expect(valueOf(within(dialog).getByRole('textbox', { name: 'Secret', hidden: true }))).toBe(SECRET);

    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i)!;
        expect(storage.getItem(key) ?? '').not.toContain(SECRET);
      }
    }

    await user.click(within(dialog).getByRole('button', { name: 'Done', hidden: true }));
    await waitFor(() => expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument());
    expect(screen.queryByDisplayValue(SECRET)).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toContain(SECRET);
  });
});

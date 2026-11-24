import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AcceptInvitationPage } from './AcceptInvitationPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import { ResetPasswordPage } from './ResetPasswordPage';
import { getLanguage, setLanguage } from '@/lib/language';
import { fetchMock } from '@/test/mockFetch';

interface Recorded {
  method: string;
  url: string;
  body: unknown;
  hasKey: boolean;
}

const TOKEN = 'invented-token-0123456789-abcdef_GHIJ';
const INVITATION = { email: 'new.person@example.test', companyName: 'Acme Ltd', roleName: 'Admin', language: 'hu' };

/** Answers the account endpoints; `answers` overrides a path's status and body, and every call is recorded (with whether it carried an HMAC key). */
function mockAccounts(answers: Record<string, { status: number; body?: unknown }> = {}): Recorded[] {
  const calls: Recorded[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const text = await request.clone().text();
    calls.push({ method: request.method, url: request.url, body: text ? JSON.parse(text) : undefined, hasKey: request.headers.has('HMAC_Key') });

    const path = new URL(request.url).pathname;
    const answer = answers[path] ?? (path.endsWith('/Invitations/Info') ? { status: 200, body: INVITATION } : { status: 204 });
    const isText = typeof answer.body === 'string';
    return new Response(answer.status === 204 ? null : isText ? (answer.body as string) : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': isText ? 'text/plain' : 'application/json' },
    });
  });
  return calls;
}

function renderAt(entry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[entry]}>
          <Routes>
            <Route path="/accept-invite" element={<AcceptInvitationPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

beforeEach(() => {
  setLanguage('en');
  window.history.replaceState(null, '', '/');
});

describe('AcceptInvitationPage', () => {
  it('shows the invitation, takes the token out of the address bar, uses the link language and creates the account', async () => {
    const calls = mockAccounts();
    const user = userEvent.setup();
    window.history.replaceState(null, '', `/accept-invite#token=${TOKEN}&lang=hu`);
    renderAt(`/accept-invite#token=${TOKEN}&lang=hu`);

    expect(await screen.findByText(/Meghívták a\(z\) Acme Ltd céghez/)).toBeInTheDocument();
    expect(getLanguage()).toBe('hu');
    expect(window.location.hash).toBe(''); // the token is no longer in the address
    expect(screen.getByText('new.person@example.test')).toBeInTheDocument();
    expect(screen.getByText('Adminisztrátor')).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', body: { token: TOKEN }, hasKey: false });

    await user.type(screen.getByLabelText(/Válasszon jelszót/), 'a-fine-password-1');
    await user.type(screen.getByLabelText(/Jelszó újra/), 'a-fine-password-1');
    await user.type(screen.getByLabelText(/Az Ön neve/), 'Nóra Nagy');
    await user.click(screen.getByRole('button', { name: 'Fiók létrehozása' }));

    expect(await screen.findByText('A fiókja elkészült')).toBeInTheDocument();
    const accept = calls.find((c) => c.url.endsWith('/Invitations/Accept'))!;
    expect(accept.body).toEqual({ token: TOKEN, password: 'a-fine-password-1', displayName: 'Nóra Nagy' });
    expect(accept.hasKey).toBe(false);
  });

  it('refuses a weak or mismatched password without calling the API', async () => {
    const calls = mockAccounts();
    const user = userEvent.setup();
    renderAt(`/accept-invite#token=${TOKEN}&lang=en`);
    await screen.findByText(/You are invited to join Acme Ltd/);

    await user.type(screen.getByLabelText(/Choose a password/), 'short');
    await user.type(screen.getByLabelText(/Repeat the password/), 'short');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('The password must be at least 10 characters long.')).toBeInTheDocument();

    await user.clear(screen.getByLabelText(/Choose a password/));
    await user.clear(screen.getByLabelText(/Repeat the password/));
    await user.type(screen.getByLabelText(/Choose a password/), 'a-fine-password-1');
    await user.type(screen.getByLabelText(/Repeat the password/), 'a-fine-password-2');
    await user.click(screen.getByRole('button', { name: 'Create my account' }));
    expect(await screen.findByText('The passwords do not match.')).toBeInTheDocument();

    expect(calls.filter((c) => c.url.endsWith('/Invitations/Accept'))).toHaveLength(0);
  });

  it('answers an expired or unknown link with one message', async () => {
    mockAccounts({ '/api/Accounts/Invitations/Info': { status: 404, body: 'The link is invalid or has expired.' } });
    renderAt(`/accept-invite#token=${TOKEN}`);
    expect(await screen.findByText(/The link is invalid or has expired\./)).toBeInTheDocument();
  });

  it('shows no form and makes no request when the link has no token', async () => {
    const calls = mockAccounts();
    renderAt('/accept-invite');
    expect(await screen.findByText(/The link is invalid or has expired\./)).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it('shows the refusal of the API in the language of the person (an address that already belongs to a User)', async () => {
    mockAccounts({ '/api/Accounts/Invitations/Accept': { status: 409, body: 'This e-mail address already belongs to a User.' } });
    const user = userEvent.setup();
    renderAt(`/accept-invite#token=${TOKEN}&lang=hu`);
    await screen.findByText(/Meghívták/);
    await user.type(screen.getByLabelText(/Válasszon jelszót/), 'a-fine-password-1');
    await user.type(screen.getByLabelText(/Jelszó újra/), 'a-fine-password-1');
    await user.click(screen.getByRole('button', { name: 'Fiók létrehozása' }));

    expect(await screen.findByText('Ez az e-mail cím már egy felhasználóhoz tartozik.')).toBeInTheDocument();
  });
});

describe('ForgotPasswordPage', () => {
  it('sends the address and always shows the same answer, without saying whether the account exists', async () => {
    const calls = mockAccounts();
    const user = userEvent.setup();
    renderAt('/forgot-password');

    await user.type(screen.getByLabelText(/E-mail address/), '  someone@example.test ');
    await user.click(screen.getByRole('button', { name: 'Send the link' }));

    expect(await screen.findByText(/a link to set a new password is on its way/)).toBeInTheDocument();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'POST', body: { email: 'someone@example.test' }, hasKey: false });
    expect(calls[0]!.url).toMatch(/\/api\/Accounts\/PasswordReset\/Request$/);
  });
});

describe('ResetPasswordPage', () => {
  it('sets the new password with the token of the link and shows the way back to sign in', async () => {
    const calls = mockAccounts();
    const user = userEvent.setup();
    window.history.replaceState(null, '', `/reset-password#token=${TOKEN}&lang=en`);
    renderAt(`/reset-password#token=${TOKEN}&lang=en`);

    await user.type(screen.getByLabelText(/^New password/), 'the-new-password-2');
    await user.type(screen.getByLabelText(/Repeat the password/), 'the-new-password-2');
    await user.click(screen.getByRole('button', { name: 'Save the new password' }));

    expect(await screen.findByText('Your password has been changed')).toBeInTheDocument();
    expect(window.location.hash).toBe('');
    expect(calls[0]).toMatchObject({ method: 'POST', body: { token: TOKEN, password: 'the-new-password-2' }, hasKey: false });

    await user.click(screen.getByRole('button', { name: 'Go to sign in' }));
    expect(await screen.findByText('login page')).toBeInTheDocument();
  });

  it('offers a new link when the token is used up or expired', async () => {
    mockAccounts({ '/api/Accounts/PasswordReset/Confirm': { status: 404, body: 'The link is invalid or has expired.' } });
    const user = userEvent.setup();
    renderAt(`/reset-password#token=${TOKEN}`);
    await user.type(screen.getByLabelText(/^New password/), 'the-new-password-2');
    await user.type(screen.getByLabelText(/Repeat the password/), 'the-new-password-2');
    await user.click(screen.getByRole('button', { name: 'Save the new password' }));

    await waitFor(() => expect(screen.getByText(/The link is invalid or has expired\./)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Ask for a new link' })).toBeInTheDocument();
  });

  it('has no form without a token', async () => {
    renderAt('/reset-password');
    expect(await screen.findByText(/The link is invalid or has expired\./)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^New password/)).toBeNull();
  });
});

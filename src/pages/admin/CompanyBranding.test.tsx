import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { CompanyBranding } from './CompanyBranding';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { setLanguage } from '@/lib/language';
import { fetchMock } from '@/test/mockFetch';
import type { CompanyDto } from '@/api/hooks/company';

const COMPANY: CompanyDto = { id: 1, name: 'Acme', website: 'https://acme.example.test', enabled: true, createdAt: '2026-01-01T00:00:00Z', profileSource: 'Local', nameEditable: true, hasUploadedLogo: false };

interface Recorded {
  method: string;
  path: string;
  body: FormData | string | undefined;
  hasKey: boolean;
}

function mockApi(overrides: Record<string, { status: number; body?: unknown }> = {}): Recorded[] {
  const calls: Recorded[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const path = new URL(request.url).pathname;
    const type = request.headers.get('content-type') ?? '';
    let body: FormData | string | undefined;
    if (type.startsWith('multipart/form-data')) body = await request.clone().formData();
    else {
      const text = await request.clone().text();
      body = text || undefined;
    }
    calls.push({ method: request.method, path, body, hasKey: request.headers.has('HMAC_Key') });

    const answer = overrides[`${request.method} ${path}`] ?? { status: request.method === 'DELETE' ? 204 : 200, body: { ...COMPANY, hasUploadedLogo: true, logoUpdatedAt: '2026-11-24T10:00:00Z' } };
    const isText = typeof answer.body === 'string';
    return new Response(answer.status === 204 ? null : isText ? (answer.body as string) : JSON.stringify(answer.body), {
      status: answer.status,
      headers: { 'content-type': isText ? 'text/plain' : 'application/json' },
    });
  });
  return calls;
}

function renderBranding(company: CompanyDto = COMPANY) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <CompanyBranding company={company} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

const png = (name = 'logo.png', size = 100, type = 'image/png') => new File([new Uint8Array(size)], name, { type });

beforeEach(() => setLanguage('en'));

describe('CompanyBranding', () => {
  it('uploads the logo as a multipart form with the file, authenticated', async () => {
    const calls = mockApi();
    renderBranding();

    fireEvent.change(screen.getByLabelText('Logo file'), { target: { files: [png()] } });

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/api/Company/Logo')).toBe(true));
    const upload = calls.find((c) => c.path === '/api/Company/Logo')!;
    // A multipart form (not JSON text) with one `file` part carrying the bytes and the type.
    expect(typeof upload.body).not.toBe('string');
    const part = (upload.body as FormData).get('file') as File;
    expect(part.size).toBe(100);
    expect(part.type).toBe('image/png');
    expect(upload.hasKey).toBe(true);
  });

  it.each([
    ['an SVG', png('logo.svg', 100, 'image/svg+xml')],
    ['a GIF', png('logo.gif', 100, 'image/gif')],
    ['a file over 512 KB', png('big.png', 512 * 1024 + 1)],
    ['an empty file', png('empty.png', 0)],
  ])('refuses %s before any request is made', async (_, file) => {
    const calls = mockApi();
    renderBranding();

    fireEvent.change(screen.getByLabelText('Logo file'), { target: { files: [file] } });

    expect(await screen.findByText('Choose a PNG, JPEG or WebP image of at most 512 KB.')).toBeInTheDocument();
    expect(calls.filter((c) => c.path === '/api/Company/Logo')).toHaveLength(0);
  });

  it("shows the API's refusal of an image it does not accept, in Hungarian", async () => {
    mockApi({ 'PUT /api/Company/Logo': { status: 400, body: 'The logo must be a PNG, JPEG or WebP image.' } });
    setLanguage('hu');
    renderBranding();

    fireEvent.change(screen.getByLabelText('Logó fájl'), { target: { files: [png()] } });

    expect(await screen.findByText('A logónak PNG, JPEG vagy WebP képnek kell lennie.')).toBeInTheDocument();
  });

  it('offers to replace and remove an uploaded logo, and removes it', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderBranding({ ...COMPANY, hasUploadedLogo: true, logoUpdatedAt: '2026-11-24T10:00:00Z' });

    expect(screen.getByRole('button', { name: 'Replace logo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove logo' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/Company/Logo')).toBe(true));
  });

  it('edits the website and sends the trimmed address; blank removes it', async () => {
    const calls = mockApi();
    const user = userEvent.setup();
    renderBranding();

    await user.click(screen.getByRole('button', { name: 'Edit website' }));
    const input = screen.getByLabelText('Website');
    await user.clear(input);
    await user.type(input, '  https://new.example.test  ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(calls.some((c) => c.method === 'PUT' && c.path === '/api/Company/Website')).toBe(true));
    expect(JSON.parse(calls.find((c) => c.path === '/api/Company/Website')!.body as string)).toEqual({ website: 'https://new.example.test' });
  });

  it("shows the API's refusal of a bad website address in Hungarian", async () => {
    mockApi({ 'PUT /api/Company/Website': { status: 400, body: 'The website must be an http(s) address of at most 512 characters.' } });
    setLanguage('hu');
    const user = userEvent.setup();
    renderBranding();

    await user.click(screen.getByRole('button', { name: 'Weboldal szerkesztése' }));
    await user.click(screen.getByRole('button', { name: 'Mentés' }));

    expect(await screen.findByText('A weboldal legfeljebb 512 karakteres http(s) cím lehet.')).toBeInTheDocument();
  });
});

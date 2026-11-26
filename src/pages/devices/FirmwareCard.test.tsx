import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AppToastProvider } from '@/components/ToastProvider';
import { FirmwareCard } from './FirmwareCard';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

interface Sent {
  method: string;
  url: string;
  body: string;
  contentType: string;
}

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function firmware(over: Record<string, unknown> = {}) {
  return {
    deviceId: 4,
    assignedReleaseId: 2,
    assignedAt: '2026-11-25T10:00:00Z',
    device: { runningVersion: '1.0.0', runningSha256: SHA_A, state: 'confirmed', detail: 'boot\nall good', reportedAt: '2026-11-25T10:05:00Z', runningReleaseId: 1 },
    releases: [
      { id: 2, version: '1.1.0', note: 'new filter', sha256: SHA_B, sizeBytes: 615544, uploadedBy: 7, uploadedByName: 'Anna', uploadedAt: '2026-11-25T09:00:00Z' },
      { id: 1, version: '1.0.0', note: null, sha256: SHA_A, sizeBytes: 600000, uploadedBy: 7, uploadedByName: 'Anna', uploadedAt: '2026-11-20T09:00:00Z' },
    ],
    events: [
      { id: 3, at: '2026-11-25T10:05:00Z', state: 'confirmed', version: '1.0.0', sha256: SHA_A, releaseId: null, detail: null },
      { id: 2, at: '2026-11-25T10:00:00Z', state: 'downloading', version: '1.0.0', sha256: SHA_A, releaseId: 2, detail: null },
    ],
    ...over,
  };
}

function mockApi(data: unknown = firmware()): Sent[] {
  const sent: Sent[] = [];
  fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
    const request = input as Request;
    const clone = request.clone();
    sent.push({ method: request.method, url: request.url, body: request.method === 'GET' ? '' : await clone.text().catch(() => ''), contentType: request.headers.get('content-type') ?? '' });
    if (request.method === 'GET') return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
    if (request.method === 'POST') return new Response(JSON.stringify({ id: 9, version: 'x', sha256: SHA_A, sizeBytes: 5 }), { status: 201, headers: { 'content-type': 'application/json' } });
    return new Response(null, { status: 204 });
  });
  return sent;
}

function renderCard(isAdmin: boolean) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchInterval: false }, mutations: { retry: false } } });
  render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <FirmwareCard deviceId={4} device={{ deviceName: 'Press 7', externalDeviceId: 'ext-4' }} isAdmin={isAdmin} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

describe('FirmwareCard', { timeout: 40_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('shows what the Device runs, its last report with the log, the assignment and the releases', async () => {
    mockApi();
    renderCard(false);
    expect(await screen.findByText('Firmware')).toBeInTheDocument();
    expect(screen.getAllByText('Confirmed').length).toBeGreaterThan(0);
    // Running and Assigned side by side: a row with the versions, a row with the SHA-256
    const versions = within(screen.getByRole('table', { name: 'Running and assigned firmware' })).getAllByRole('row');
    expect(versions.map((row) => row.textContent)).toEqual(['RunningAssigned', 'Version1.0.01.1.0waiting for the Device', 'SHA-256aaaaaaaaaaaabbbbbbbbbbbb']);
    expect(screen.queryByText(/uploaded release/)).toBeNull();                       // it would only repeat the running version
    expect(screen.getByText(/all good/)).toBeInTheDocument();                       // the log of the last problem
    expect(screen.getByText('new filter')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Reports of the Device' })).toBeInTheDocument();
  });

  it('shows a Reader no upload, install or delete control at all', async () => {
    mockApi();
    renderCard(false);
    await screen.findByRole('table', { name: 'Uploaded firmware' });
    expect(screen.queryByText('Upload')).toBeNull();
    expect(screen.queryByText('Install on this Device')).toBeNull();
    expect(screen.queryByText('Delete')).toBeNull();
    expect(screen.queryByLabelText('Firmware file (firmware.bin)')).toBeNull();
  });

  it('installs a release only after the Device name is typed, then assigns it', async () => {
    const sent = mockApi();
    const user = userEvent.setup();
    renderCard(true);
    await screen.findByRole('table', { name: 'Uploaded firmware' });
    const rows = within(screen.getByRole('table', { name: 'Uploaded firmware' })).getAllByRole('row');
    const row10 = rows.find((r) => within(r).queryByText('1.0.0') && within(r).queryByText('Install on this Device'))!;
    await user.click(within(row10).getByText('Install on this Device'));

    // (by text: a role lookup walks the accessibility tree of the whole page, which is slow in jsdom when the machine is busy)
    const dialog = (await screen.findByText('Install this firmware on the Device?', {}, { timeout: 10_000 })).closest<HTMLElement>('[role="dialog"]')!;
    const confirm = within(dialog).getByText('Install').closest('button')!;
    expect(confirm).toBeDisabled();
    expect(within(dialog).getByText(/within 10 minutes/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Device name'), 'Press 7');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    await waitFor(() => expect(sent.some((s) => s.method === 'PUT' && s.url.endsWith('/api/Devices/4/Firmware/Assign'))).toBe(true));
    expect(JSON.parse(sent.find((s) => s.method === 'PUT')!.body)).toEqual({ releaseId: 1 });
  });

  it('uploads the chosen file as a multipart form; there is no field to type a version label (the firmware carries it)', async () => {
    const sent = mockApi();
    const user = userEvent.setup();
    renderCard(true);
    await screen.findByRole('table', { name: 'Uploaded firmware' });
    expect(screen.queryByLabelText(/Version label/)).toBeNull();
    const upload = screen.getByRole('button', { name: 'Upload' });
    expect(upload).toBeDisabled();                                                  // no file
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'firmware.bin', { type: 'application/octet-stream' });
    await user.upload(screen.getByLabelText('Firmware file (firmware.bin)'), file);
    expect(upload).toBeEnabled();                                                   // a file is enough
    await user.type(screen.getByLabelText('Note (optional)'), 'filter fix');
    await user.click(upload);

    await waitFor(() => expect(sent.some((s) => s.method === 'POST')).toBe(true));
    const post = sent.find((s) => s.method === 'POST')!;
    expect(post.url).toMatch(/\/api\/Devices\/4\/Firmware\/Releases$/);
    expect(post.contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(post.body).toContain('name="file"'); // (jsdom's File is not undici's, so the part's content is not checked here; a browser sends the bytes)
    expect(post.body).not.toContain('name="version"');
    expect(post.body).toContain('filter fix');
  });

  it('explains on the "Remove the assignment" button what it does', async () => {
    mockApi();
    renderCard(true);
    const button = await screen.findByRole('button', { name: 'Remove the assignment' });
    expect(button).toHaveAccessibleDescription(/keeps running what it runs now/);
  });

  it('does not offer to delete the assigned release, and deletes another one after a confirmation', async () => {
    const sent = mockApi();
    const user = userEvent.setup();
    renderCard(true);
    await screen.findByRole('table', { name: 'Uploaded firmware' });
    const rows = within(screen.getByRole('table', { name: 'Uploaded firmware' })).getAllByRole('row');
    const assignedRow = rows.find((r) => within(r).queryByText('1.1.0'))!;
    expect(within(assignedRow).getByRole('button', { name: 'Delete' })).toBeDisabled();
    const otherRow = rows.find((r) => within(r).queryByText('1.0.0') && within(r).queryByText('Delete'))!;
    await user.click(within(otherRow).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(sent.some((s) => s.method === 'DELETE' && s.url.endsWith('/api/Devices/4/Firmware/Releases/1'))).toBe(true));
  });

  it('says so when nothing was uploaded and the Device has not reported', async () => {
    mockApi(firmware({ assignedReleaseId: null, releases: [], events: [], device: { runningVersion: null, runningSha256: null, state: null, detail: null, reportedAt: null, runningReleaseId: null } }));
    renderCard(true);
    expect(await screen.findByText('No firmware was uploaded for this Device yet.')).toBeInTheDocument();
    expect(screen.getByText('No report yet')).toBeInTheDocument();
    const versions = within(screen.getByRole('table', { name: 'Running and assigned firmware' })).getAllByRole('row');
    expect(versions.map((row) => row.textContent)).toEqual(['RunningAssigned', 'Version(no version label)none', 'SHA-256--']);
  });

});

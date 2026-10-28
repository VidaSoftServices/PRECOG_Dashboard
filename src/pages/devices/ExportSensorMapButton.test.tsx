import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ExportSensorMapButton } from './ExportSensorMapButton';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';
import { CATALOG_DTO } from '@/test/sensorCatalog';

const DEVICE = { id: 4, deviceName: 'Press 7', externalDeviceId: 'ext-4' };

function renderButton(sensors: { id?: number | null; externalSensorId?: string | null }[], catalogOk = true) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  fetchMock().mockImplementation(async () =>
    catalogOk ? new Response(JSON.stringify(CATALOG_DTO), { status: 200, headers: { 'content-type': 'application/json' } }) : new Response('boom', { status: 500 }),
  );
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <ExportSensorMapButton device={DEVICE} sensors={sensors} />
      </QueryClientProvider>
    </FluentProvider>,
  );
}

/** Captures what the browser would download instead of really downloading it. */
function captureDownload() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return 'blob:sensor-map';
  };
  URL.revokeObjectURL = () => undefined;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    names.push(this.download);
  };
  return { blobs, names, restore: () => (HTMLAnchorElement.prototype.click = click) };
}

describe('ExportSensorMapButton', () => {
  beforeEach(() => {
    authStore.clearSession();
  });

  it('downloads a .txt with the existing Sensors as sensor_map.h defines, ids as the API reported them', async () => {
    const download = captureDownload();
    try {
      const user = userEvent.setup();
      renderButton([
        { id: 12, externalSensorId: 'velocity_rms_x_eq_1' },
        { id: 13, externalSensorId: 'velocity_rms_x_max_1' },
        { id: 14, externalSensorId: 'my_custom_tag' },
      ]);
      const button = screen.getByRole('button', { name: 'Export sensor for hardware' });
      await waitFor(() => expect(button).toBeEnabled()); // waits for the catalog

      await user.click(button);

      expect(download.names).toEqual(['sensor_map-device-4.txt']);
      expect(download.blobs[0]!.type).toBe('text/plain;charset=utf-8');
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(download.blobs[0]!);
      });
      expect(text).toContain('#define PRECOG_SENSOR_ID_VELOCITY_RMS_X_EQ_1');
      expect(text).toMatch(/PRECOG_SENSOR_ID_VELOCITY_RMS_X_EQ_1\s+12\s+\/\* velocity_rms_x_eq_1 \*\//);
      expect(text).toMatch(/PRECOG_SENSOR_ID_VELOCITY_RMS_X_MAX_1\s+13\s+\/\* velocity_rms_x_max_1 \*\//);
      expect(text).not.toContain('MY_CUSTOM_TAG'); // not a firmware channel
      expect(text).toContain('// Skipped, not a firmware channel (1): my_custom_tag');
      expect(text).toContain('#pragma once');
    } finally {
      download.restore();
    }
  });

  it('is disabled when the Device has no Sensors', async () => {
    renderButton([]);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByRole('button', { name: 'Export sensor for hardware' })).toBeDisabled();
  });

  it('stays disabled while the catalog is unavailable - which names are firmware channels is not guessed', async () => {
    renderButton([{ id: 1, externalSensorId: 'velocity_rms_x_eq_1' }], false);
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.getByRole('button', { name: 'Export sensor for hardware' })).toBeDisabled();
  });
});

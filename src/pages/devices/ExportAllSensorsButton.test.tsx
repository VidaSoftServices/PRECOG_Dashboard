import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { ExportAllSensorsButton } from './ExportAllSensorsButton';
import { AppToastProvider } from '@/components/ToastProvider';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

const SENSORS = [
  { id: 2, externalSensorId: 'rpm_b', name: 'RPM', direction: 'bidirectional', sensorType: 'rotation', unitCode: 'rpm', processingEnabled: false },
  { id: 1, externalSensorId: 'temp_a', name: 'Temperature', direction: 'lowerisbetter', sensorType: 'temperature', unitCode: 'Cel', processingEnabled: true },
];

function renderButton(sensors = SENSORS) {
  authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <FluentProvider theme={webLightTheme}>
      <QueryClientProvider client={queryClient}>
        <AppToastProvider>
          <ExportAllSensorsButton deviceId={4} sensors={sensors} />
        </AppToastProvider>
      </QueryClientProvider>
    </FluentProvider>,
  );
}

function captureDownload() {
  const blobs: Blob[] = [];
  const names: string[] = [];
  URL.createObjectURL = (blob: Blob | MediaSource) => {
    blobs.push(blob as Blob);
    return 'blob:sensors';
  };
  URL.revokeObjectURL = () => undefined;
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    names.push(this.download);
  };
  return { blobs, names, restore: () => (HTMLAnchorElement.prototype.click = click) };
}

const readBlob = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe('ExportAllSensorsButton', { timeout: 20_000 }, () => {
  beforeEach(() => authStore.clearSession());

  it('reads the Device\'s policies and setpoints in TWO Device-wide requests and downloads the Sensor sheet the import accepts', async () => {
    const gets: string[] = [];
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const request = input as Request;
      const path = new URL(request.url).pathname;
      gets.push(path);
      const body = path.endsWith('/Setpoints')
        ? [
            { id: 31, sensorId: 1, validFrom: '2026-01-01T00:00:00Z', validTo: '2026-02-01T00:00:00Z', target: 3, tolerance: 1 },
            { id: 32, sensorId: 1, validFrom: '2026-02-01T00:00:00Z', validTo: null, target: 21.5, tolerance: 0.5 },
            { id: 33, sensorId: 2, validFrom: '2026-01-01T00:00:00Z', validTo: null, targetAbove: 1500, toleranceAbove: 20, targetBelow: 1400, toleranceBelow: 10 },
          ]
        : [
            { id: 1, sensorId: 1, timeScale: 'Native', aggregationFunction: 'Raw', scale: 'days', lookback: 30, minIssueScore: 5 },
            { id: 2, sensorId: 2, timeScale: 'Native', aggregationFunction: 'Raw', scale: 'years', lookback: 100, minIssueScore: 1 },
          ];
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const download = captureDownload();
    try {
      const user = userEvent.setup();
      renderButton();
      await user.click(screen.getByRole('button', { name: 'Export all sensors' }));
      await waitFor(() => expect(download.names).toEqual(['sensors-device-4.csv']));
      expect(gets.sort()).toEqual(['/api/Devices/4/AggregationPolicies', '/api/Devices/4/Setpoints']);
      const lines = (await readBlob(download.blobs[0]!)).replace(/^\uFEFF/, '').trim().split('\r\n');
      expect(lines[0]).toBe(
        'sensorName,displayName,direction,sensorType,unitCode,rawScale,rawLookback,rawMinIssueScore,Calculate,target (optional),tolerance (optional),targetAbove (optional),targetBelow (optional),toleranceAbove (optional),toleranceBelow (optional)',
      );
      // The current setpoint only (the interval in effect now), in the columns of the Sensor's direction.
      expect(lines[1]).toBe('temp_a,Temperature,lowerisbetter,temperature,Cel,Days,30,5,TRUE,21.5,0.5,,,,');
      expect(lines[2]).toBe('rpm_b,RPM,bidirectional,rotation,rpm,Years,100,1,FALSE,,,1500,1400,20,10');
    } finally {
      download.restore();
    }
  });

  it('is disabled while the Device has no Sensors, and reports a failed read instead of downloading', async () => {
    renderButton([]);
    expect(screen.getByRole('button', { name: 'Export all sensors' })).toBeDisabled();
  });

  it('shows an error and downloads nothing when the policies cannot be read', async () => {
    fetchMock().mockImplementation(async () => new Response(JSON.stringify('boom'), { status: 500, headers: { 'content-type': 'application/json' } }));
    const download = captureDownload();
    try {
      const user = userEvent.setup();
      renderButton();
      await user.click(screen.getByRole('button', { name: 'Export all sensors' }));
      expect(await screen.findByText('Export failed')).toBeInTheDocument();
      expect(download.names).toEqual([]);
    } finally {
      download.restore();
    }
  });
});

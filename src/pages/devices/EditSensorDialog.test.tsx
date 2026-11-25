import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { EditSensorDialog } from './DeviceDetailPage';
import { AppToastProvider } from '@/components/ToastProvider';
import type { SensorDto } from '@/api/hooks/sensors';
import * as authStore from '@/auth/authStore';
import { fetchMock } from '@/test/mockFetch';

describe('EditSensorDialog', () => {
  it('shows the Sensor ID read-only above the editable fields', async () => {
    authStore.setSession({ token: 'abc', principalType: 'User', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    fetchMock().mockImplementation(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }));
    const sensor = { id: 7, name: 'Velocity RMS X', externalSensorId: 'velocity_rms_x_1', direction: 'lowerisbetter' } as SensorDto;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <FluentProvider theme={webLightTheme}>
        <QueryClientProvider client={queryClient}>
          <AppToastProvider>
            <EditSensorDialog deviceId={4} sensor={sensor} open onClose={() => undefined} />
          </AppToastProvider>
        </QueryClientProvider>
      </FluentProvider>,
    );

    const id = (await screen.findByLabelText('Sensor ID', {}, { timeout: 5000 })) as HTMLInputElement;
    expect(id.value).toBe('velocity_rms_x_1');
    expect(id.readOnly).toBe(true);
    expect((screen.getByLabelText('Name') as HTMLInputElement).readOnly).toBe(false);
  });
});

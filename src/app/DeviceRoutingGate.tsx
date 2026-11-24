import type { ReactNode } from 'react';
import { MessageBar, MessageBarBody, MessageBarTitle } from '@fluentui/react-components';
import { useDevices } from '@/api/hooks/devices';
import { useUnreachableServers } from '@/api/hooks/deviceRoutingState';
import { setRoutingHintDevice } from '@/api/deviceRouting';
import { useSelectedDevice } from '@/lib/selectedDevice';
import { LoadingState } from '@/components/states/LoadingState';
import { useT } from '@/lib/language';

/**
 * Holds the page back until the Company's Device list is known, because that list is also where the Dashboard learns which
 * server each Device lives on (a request for a Device made before that would go to the wrong server). The same query serves the
 * pages' own Device pickers, so it costs no extra request. A failed list does not block anything: the page shows its own error.
 *
 * It also tells the API client which Device the person is working with (for Issue-by-id requests, which carry no Device id), and
 * shows a notice when a registered server could not be read - so a missing server is never silently an empty list.
 */
export function DeviceRoutingGate({ children }: { children: ReactNode }) {
  const t = useT();
  const devices = useDevices();
  const unreachable = useUnreachableServers();
  const { selectedDeviceId } = useSelectedDevice();
  // Set while rendering, not in an effect: the page's own queries start in their effects, which run before this component's.
  setRoutingHintDevice(selectedDeviceId);

  if (devices.isPending) return <LoadingState label={t('Loading…')} />;
  return (
    <>
      {unreachable.length > 0 && (
        <MessageBar intent="warning" role="status" style={{ marginBottom: 12 }}>
          <MessageBarBody>
            <MessageBarTitle>{t('Some servers of your Company could not be read')}</MessageBarTitle>
            {unreachable.map((server) => (
              <div key={server.serverId}>
                {server.reason === 'blocked'
                  ? t('{0}: this address starts with http://, which the browser blocks from a page opened over https. Give the server an https address.', server.serverName)
                  : server.reason === 'refused'
                    ? t('{0}: the server did not accept your sign-in. The same user, with the same password, must exist on it.', server.serverName)
                    : t('{0}: the server could not be reached. Its Devices are not shown.', server.serverName)}
              </div>
            ))}
          </MessageBarBody>
        </MessageBar>
      )}
      {children}
    </>
  );
}

import { createContext, useCallback, useContext, useEffect } from 'react';
import { useNumberSearchParam } from '@/lib/useNumberSearchParam';

/**
 * The Device the person is working with, shared by every page that has a Device picker, so choosing it once is enough while
 * moving between menu items. It lives in memory only (it is a UI convenience, never stored): the URL's `deviceId` is the shareable
 * truth of one page, this context carries the choice from one page to the next.
 */
export interface SelectedDeviceState {
  selectedDeviceId: number | undefined;
  setSelectedDeviceId: (id: number | undefined) => void;
}

export const SelectedDeviceContext = createContext<SelectedDeviceState>({
  selectedDeviceId: undefined,
  // Without a provider (a page rendered on its own, a test) there is nothing to share: the URL alone still works.
  setSelectedDeviceId: () => undefined,
});

export function useSelectedDevice(): SelectedDeviceState {
  return useContext(SelectedDeviceContext);
}

/**
 * The Device a page works with, and how it changes. Order of precedence:
 *   1. the `deviceId` in the page's URL (a link someone sent, a bookmark, or the page's own earlier choice);
 *   2. the Device chosen earlier on any other page (kept while navigating between menu items) - only while it is still one
 *      of the Devices the person can see (`devices`), so a deleted or no longer accessible Device is never carried along;
 *   3. the first Device of the list.
 * The result is written back to the URL (so it always shows) and remembered for the next page. `setDeviceId` is what the
 * page's Device picker calls. `devices` is the page's loaded Device list (undefined/empty while it loads).
 */
export function useDeviceSelection(devices: readonly { id?: number }[] | undefined): [number | undefined, (id: number) => void] {
  const [urlId, setUrlId] = useNumberSearchParam('deviceId');
  const { selectedDeviceId, setSelectedDeviceId } = useSelectedDevice();

  const known = devices !== undefined && devices.length > 0;
  const rememberedIsUsable = selectedDeviceId !== undefined && (!known || devices.some((d) => d.id === selectedDeviceId));
  const effective = urlId ?? (rememberedIsUsable ? selectedDeviceId : undefined) ?? (known ? devices[0]?.id : undefined);

  useEffect(() => {
    if (effective === undefined) return;
    if (urlId !== effective) setUrlId(effective);
    if (selectedDeviceId !== effective) setSelectedDeviceId(effective);
  }, [effective, urlId, selectedDeviceId, setUrlId, setSelectedDeviceId]);

  const setDeviceId = useCallback(
    (id: number) => {
      setUrlId(id);
      setSelectedDeviceId(id);
    },
    [setUrlId, setSelectedDeviceId],
  );

  return [effective, setDeviceId];
}

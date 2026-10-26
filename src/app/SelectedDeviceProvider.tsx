import { useMemo, useState, type ReactNode } from 'react';
import { SelectedDeviceContext } from '@/lib/selectedDevice';

/** Holds the Device chosen on any page for as long as the signed-in app shell is mounted (memory only, never stored). */
export function SelectedDeviceProvider({ children }: { children: ReactNode }) {
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | undefined>();
  const value = useMemo(() => ({ selectedDeviceId, setSelectedDeviceId }), [selectedDeviceId]);
  return <SelectedDeviceContext.Provider value={value}>{children}</SelectedDeviceContext.Provider>;
}

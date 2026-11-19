import { useSyncExternalStore } from 'react';
import type { DescriptionRow } from './descriptionSheet';

/**
 * The imported indicator descriptions of each Device, kept in memory only (a module-level store, same pattern as `authStore`).
 *
 * PROTOTYPE: there is no API storage for these texts yet, so they live in this browser tab and are gone on a reload - nothing is
 * written to browser storage (AGENTS.md persistence rules). A real version keeps them per Device on the server (Company-scoped)
 * and this store becomes the cache of that read; the two hooks below are the only surface the pages use.
 */
export interface DeviceDescriptions {
  rows: DescriptionRow[];
  fileName: string;
  importedAt: number;
}

const byDevice = new Map<number, DeviceDescriptions>();
const listeners = new Set<() => void>();
let version = 0;

const emit = () => {
  version += 1;
  listeners.forEach((l) => l());
};

export function setDeviceDescriptions(deviceId: number, value: DeviceDescriptions): void {
  byDevice.set(deviceId, value);
  emit();
}

export function clearDeviceDescriptions(deviceId: number): void {
  if (byDevice.delete(deviceId)) emit();
}

export function getDeviceDescriptions(deviceId: number | undefined): DeviceDescriptions | undefined {
  return deviceId === undefined ? undefined : byDevice.get(deviceId);
}

/** Test helper. */
export function resetDescriptionStore(): void {
  byDevice.clear();
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-renders the caller when any Device's descriptions change (for components that look up several Devices in one render). */
export function useDescriptionVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** The descriptions of one Device, or undefined when none were imported. Re-renders when they change. */
export function useDeviceDescriptions(deviceId: number | undefined): DeviceDescriptions | undefined {
  useSyncExternalStore(subscribe, () => version);
  return getDeviceDescriptions(deviceId);
}

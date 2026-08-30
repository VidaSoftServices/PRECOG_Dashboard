import { createLightTheme, createDarkTheme, type BrandVariants, type Theme } from '@fluentui/react-components';

/**
 * Derived from the existing PRECOG brand blues (#014F91 primary / #0077CB
 * secondary, used throughout the old dashboard's CSS) so the rebrand reads as
 * a continuation, not a reset. Generated as a 16-step Fluent brand ramp
 * anchored on that hue rather than Fluent's default blue.
 */
const precogBrand: BrandVariants = {
  10: '#020306',
  20: '#0F1B2B',
  30: '#0E2A48',
  40: '#0A3660',
  50: '#054272',
  60: '#014F91',
  70: '#02589F',
  80: '#0063AE',
  90: '#0070BE',
  100: '#0077CB',
  110: '#1D88D6',
  120: '#3C98DE',
  130: '#5CA9E5',
  140: '#7EBAEC',
  150: '#A2CCF2',
  160: '#C8E0F8',
};

export const precogLightTheme: Theme = createLightTheme(precogBrand);
export const precogDarkTheme: Theme = createDarkTheme(precogBrand);

// createDarkTheme sets colorBrandForeground* a touch too dim against the
// app's dark surfaces for body text - nudge the two most-used tokens back up.
precogDarkTheme.colorBrandForeground1 = precogBrand[130];
precogDarkTheme.colorBrandForeground2 = precogBrand[120];

export type ThemePreference = 'light' | 'dark' | 'system';

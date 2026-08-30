import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { FluentProvider, type Theme } from '@fluentui/react-components';
import { precogDarkTheme, precogLightTheme, type ThemePreference } from './theme';

const STORAGE_KEY = 'precog.themePreference';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage can throw in locked-down environments - fall through to default.
  }
  return 'system';
}

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setPreference: (preference: ThemePreference) => void;
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [systemIsDark, setSystemIsDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemIsDark(event.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
  }, []);

  const setPreference = (next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal - the preference just won't survive a reload.
    }
  };

  const resolvedTheme: 'light' | 'dark' = preference === 'system' ? (systemIsDark ? 'dark' : 'light') : preference;
  const fluentTheme: Theme = resolvedTheme === 'dark' ? precogDarkTheme : precogLightTheme;

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme],
  );

  return (
    <ThemeCtx.Provider value={value}>
      <FluentProvider theme={fluentTheme} style={{ minHeight: '100vh', background: 'var(--colorNeutralBackground1)' }}>
        {children}
      </FluentProvider>
    </ThemeCtx.Provider>
  );
}

export function useAppTheme(): ThemeContextValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useAppTheme must be used within an AppThemeProvider');
  return ctx;
}

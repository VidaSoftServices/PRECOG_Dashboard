import { useSyncExternalStore } from 'react';
import { HU } from './translations';

/**
 * UI language (English / Hungarian). A harmless local UI default like the theme, so it is kept in localStorage (never anything auth related).
 * Translation rule: the English text IS the key. `t('Overview')` returns the Hungarian text from `translations.ts` when the language is
 * Hungarian and a translation exists, otherwise the English text itself - so a string that was not translated yet is simply English.
 * ALL new UI text must be written in both languages (add the Hungarian to `translations.ts`).
 */
export type Language = 'en' | 'hu';
export const LANGUAGES: readonly Language[] = ['en', 'hu'];
const STORAGE_KEY = 'precog.language';

function read(): Language {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'en' || v === 'hu') return v;
  } catch {
    // locked-down storage: default below
  }
  return 'en';
}

let current: Language = read();
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(next: Language): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // not fatal: the choice just does not survive a reload
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Translate outside React (uses the current language; components should use `useT` so they re-render on a change). */
export function translate(text: string, language: Language = current, args: readonly unknown[] = []): string {
  const base = language === 'hu' ? (HU[text] ?? text) : text;
  // Positional placeholders: t('Delete {0} setpoint(s)', n) - the Hungarian text can put them in a different order.
  return args.length === 0 ? base : base.replaceAll(/\{(\d+)\}/g, (m, i: string) => (Number(i) < args.length ? String(args[Number(i)]) : m));
}

export function useLanguage(): { language: Language; setLanguage: (l: Language) => void } {
  const language = useSyncExternalStore(subscribe, getLanguage);
  return { language, setLanguage };
}

export function useT(): (text: string, ...args: unknown[]) => string {
  const language = useSyncExternalStore(subscribe, getLanguage);
  return (text, ...args) => translate(text, language, args);
}

/** `translate` with positional arguments, for code outside React: `tr('{0} of {1}', a, b)`. */
export function tr(text: string, ...args: unknown[]): string {
  return translate(text, current, args);
}
